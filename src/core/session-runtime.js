import {
  runWithTarget,
  targetConnectionManager,
} from '../connection.js';
import * as chart from './chart.js';
import * as tab from './tab.js';
import {SessionManager} from './session.js';
import {TabPool} from './tab-pool.js';
import {targetMutexes} from './locks.js';

let nextClaimNumber = 1;

function defaultPool() {
  return new TabPool({
    discoverTabs: async () => {
      const result = await tab.list();
      return result.tabs.filter((item) => item.is_chart).map((item) => ({
        targetId: item.id,
      }));
    },
    createTab: async () => {
      const result = await tab.newTab({
        layout: 'new',
        name: `MCP worker ${Date.now()}-${nextClaimNumber}`,
        followLegacy: false,
        includeTargetId: true,
      });
      return {targetId: result.target_id};
    },
  });
}

/** Coordinates session ownership, target validation, and target-level locks. */
export class SessionRuntime {
  constructor({
    sessionManager = new SessionManager(),
    tabPool = defaultPool(),
    connectionManager = targetConnectionManager,
    targetLocks = targetMutexes,
    getChartState = chart.getState,
    setChartSymbol = chart.setSymbol,
    setChartTimeframe = chart.setTimeframe,
    listTabs = tab.list,
  } = {}) {
    this.sessionManager = sessionManager;
    this.tabPool = tabPool;
    this.connectionManager = connectionManager;
    this.targetLocks = targetLocks;
    this.getChartState = getChartState;
    this.setChartSymbol = setChartSymbol;
    this.setChartTimeframe = setChartTimeframe;
    this.listTabs = listTabs;
  }

  async create({workerLabel, symbol, timeframe} = {}) {
    const claimId = `pending_session_${nextClaimNumber++}`;
    const slot = await this.tabPool.acquire(claimId);
    let session;
    try {
      if (!(await this.targetIsUsable(slot.targetId))) {
        await this.tabPool.markUnhealthy(slot.targetId);
        throw new Error('The acquired TradingView tab disappeared or is no ' +
          'longer a chart. Retry to acquire another pool slot.');
      }
      session = this.sessionManager.create({
        targetId: slot.targetId,
        workerLabel,
        symbol,
        timeframe,
      });
      await this.tabPool.transfer(
        slot.targetId,
        claimId,
        session.sessionId,
      );
      await this.run(session.sessionId, async () => {
        if (symbol) {
          const result = await this.setChartSymbol({symbol});
          if (result.chart_ready === false) {
            throw new Error(`Chart readiness timed out for symbol ${symbol}.`);
          }
        }
        if (timeframe) {
          const result = await this.setChartTimeframe({timeframe});
          if (result.chart_ready === false) {
            throw new Error(`Chart readiness timed out for timeframe ` +
              `${timeframe}.`);
          }
        }
      });
      this.sessionManager.touch(session.sessionId, {symbol, timeframe});
      return this.sessionManager.format(session.sessionId);
    } catch (error) {
      try {
        if (!(await this.targetIsUsable(slot.targetId))) {
          await this.tabPool.markUnhealthy(slot.targetId);
        }
      } catch {}
      if (session) {
        this.sessionManager.release(session.sessionId);
        await this.tabPool.release(slot.targetId, session.sessionId);
      } else {
        await this.tabPool.release(slot.targetId, claimId);
      }
      throw error;
    }
  }

  async list({detailed = false} = {}) {
    const stale = await this.sessionManager.cleanStale((targetId) =>
      this.targetIsUsable(targetId));
    await Promise.all(stale.flatMap((session) => [
      this.tabPool.markUnhealthy(session.targetId),
      this.connectionManager.closeTargetClient(session.targetId),
    ]));
    const sessions = this.sessionManager.list({detailed});
    if (!detailed) return sessions;
    const slots = new Map(this.tabPool.inspect().map((slot) =>
      [slot.targetId, slot]));
    return sessions.map((session) => ({
      ...session,
      managed_tab: slots.get(session.target_id)?.managed ?? null,
    }));
  }

  async status(sessionId, {detailed = false} = {}) {
    const current = await this.sessionManager.validate(sessionId, (targetId) =>
      this.targetIsUsable(targetId));
    const actual = await this.targetLocks.runExclusive(current.targetId, () =>
      runWithTarget(current.targetId, () => this.getChartState()));
    const drifted = this.isDrifted(current, actual);
    this.sessionManager.touch(sessionId, {
      status: drifted ? 'drifted' : 'ready',
    });
    const session = this.sessionManager.format(sessionId, detailed);
    session.actual_symbol = actual.symbol;
    session.actual_timeframe = actual.resolution;
    session.binding_matches_snapshot = !drifted;
    if (!detailed) return session;
    const slot = this.tabPool.inspect().find((item) =>
      item.targetId === session.target_id);
    return {...session, managed_tab: slot?.managed ?? null};
  }

  async bind(sessionId, tabIndex) {
    const tabs = await this.listTabs();
    const index = Number(tabIndex);
    if (!Number.isInteger(index) || index < 0 || index >= tabs.tab_count) {
      throw new Error(`tab_index ${tabIndex} is out of range.`);
    }
    const selected = tabs.tabs[index];
    if (!selected.is_chart) {
      throw new Error(`tab_index ${index} is not a loaded chart tab.`);
    }
    const previous = this.sessionManager.get(sessionId);
    if (previous.targetId === selected.id) {
      return this.sessionManager.format(sessionId);
    }
    return this.targetLocks.runExclusive(previous.targetId, async () => {
      await this.tabPool.replaceClaim(
        previous.targetId,
        selected.id,
        sessionId,
      );
      try {
        this.sessionManager.bind(sessionId, selected.id);
        await this.connectionManager.closeTargetClient(previous.targetId);
      } catch (error) {
        await this.tabPool.replaceClaim(
          selected.id,
          previous.targetId,
          sessionId,
        );
        throw error;
      }
      return this.sessionManager.format(sessionId);
    });
  }

  async release(sessionId) {
    const current = this.sessionManager.get(sessionId);
    return this.targetLocks.runExclusive(current.targetId, async () => {
      await this.connectionManager.closeTargetClient(current.targetId);
      await this.tabPool.release(current.targetId, sessionId);
      this.sessionManager.release(sessionId);
      return {
        session_id: sessionId,
        status: 'released',
        tab_reusable: true,
      };
    });
  }

  async run(sessionId, operation, {toolName, args = {}} = {}) {
    const initial = await this.sessionManager.validate(
      sessionId,
      (targetId) => this.targetIsUsable(targetId),
    );
    return this.targetLocks.runExclusive(initial.targetId, async () => {
      const session = await this.sessionManager.validate(
        sessionId,
        (targetId) => this.targetIsUsable(targetId),
      );
      if (session.targetId !== initial.targetId) {
        throw new Error('The session target changed while this operation was ' +
          'waiting. Retry the operation with the current session binding.');
      }
      return runWithTarget(session.targetId, async () => {
        if (toolName) {
          const actual = await this.getChartState();
          const drifted = this.isDrifted(session, actual);
          if (drifted) {
            this.sessionManager.touch(sessionId, {status: 'drifted'});
            const corrective = toolName === 'chart_set_symbol' ||
              toolName === 'chart_set_timeframe' ||
              toolName === 'chart_get_state';
            if (!corrective) {
              throw new Error('The chart state was changed outside this ' +
                'session and no longer matches its symbol/timeframe snapshot. ' +
                'Call chart_get_state, then explicitly restore the symbol or ' +
                'timeframe before continuing.');
            }
          }
        }
        const result = await operation();
        if (!result?.isError) {
          if (toolName === 'chart_set_symbol') {
            this.sessionManager.touch(sessionId, {symbol: args.symbol});
          } else if (toolName === 'chart_set_timeframe') {
            this.sessionManager.touch(sessionId, {
              timeframe: args.timeframe,
            });
          }
          if (toolName === 'chart_set_symbol' ||
              toolName === 'chart_set_timeframe') {
            const updated = this.sessionManager.get(sessionId);
            const actual = await this.getChartState();
            const drifted = this.isDrifted(updated, actual);
            this.sessionManager.touch(sessionId, {
              status: drifted ? 'drifted' : 'ready',
            });
            if (drifted) {
              throw new Error('TradingView did not reach the requested ' +
                'symbol/timeframe before readiness verification completed.');
            }
          }
        }
        return result;
      });
    });
  }

  isDrifted(session, actual) {
    const normalizeSymbol = (value) => String(value || '')
      .toUpperCase().split(':').pop();
    const symbolDrift = session.symbol && actual?.symbol &&
      normalizeSymbol(session.symbol) !== normalizeSymbol(actual.symbol);
    const timeframeDrift = session.timeframe && actual?.resolution &&
      String(session.timeframe) !== String(actual.resolution);
    return Boolean(symbolDrift || timeframeDrift);
  }

  async targetIsUsable(targetId) {
    if (typeof this.connectionManager.isChartTarget === 'function') {
      return this.connectionManager.isChartTarget(targetId);
    }
    return this.connectionManager.targetExists(targetId);
  }
}

export const sessionRuntime = new SessionRuntime();
