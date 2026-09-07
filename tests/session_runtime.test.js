import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SessionRuntime} from '../src/core/session-runtime.js';
import {SessionManager} from '../src/core/session.js';
import {TabPool} from '../src/core/tab-pool.js';
import {KeyedMutex} from '../src/core/locks.js';

function fixture(targets = ['A', 'B']) {
  const existing = new Set(targets);
  const closed = [];
  const pool = new TabPool({
    capacity: Math.max(1, targets.length),
    discoverTabs: async () => targets.map((targetId) => ({targetId})),
  });
  const connectionManager = {
    targetExists: async (targetId) => existing.has(targetId),
    closeTargetClient: async (targetId) => closed.push(targetId),
  };
  const runtime = new SessionRuntime({
    sessionManager: new SessionManager(),
    tabPool: pool,
    connectionManager,
    targetLocks: new KeyedMutex(),
    getChartState: async () => ({
      success: true,
      symbol: 'BINANCE:BTCUSDT',
      resolution: '15',
    }),
    listTabs: async () => ({
      tab_count: targets.length,
      tabs: targets.map((targetId) => ({id: targetId, is_chart: true})),
    }),
  });
  return {runtime, pool, existing, closed};
}

describe('SessionRuntime', () => {
  it('gives simultaneous session requests distinct pool targets', async () => {
    const {runtime} = fixture();
    const sessions = await Promise.all([
      runtime.create({workerLabel: 'one'}),
      runtime.create({workerLabel: 'two'}),
    ]);
    const detailed = await runtime.list({detailed: true});
    assert.equal(new Set(detailed.map((item) => item.target_id)).size, 2);
    assert.equal(new Set(sessions.map((item) => item.session_id)).size, 2);
  });

  it('releases a target for reuse and closes only its cached client', async () => {
    const {runtime, closed} = fixture(['A']);
    const first = await runtime.create();
    await runtime.release(first.session_id);
    const second = await runtime.create();
    assert.notEqual(first.session_id, second.session_id);
    assert.deepEqual(closed, ['A']);
  });

  it('fails only the session whose target disappeared', async () => {
    const {runtime, existing} = fixture();
    const [first, second] = await Promise.all([
      runtime.create(),
      runtime.create(),
    ]);
    const details = await runtime.list({detailed: true});
    const firstTarget = details.find((item) =>
      item.session_id === first.session_id).target_id;
    existing.delete(firstTarget);
    await assert.rejects(runtime.status(first.session_id), /no longer exists/i);
    assert.equal((await runtime.status(second.session_id)).status, 'ready');
  });

  it('reports manual symbol drift instead of silently continuing', async () => {
    const {runtime} = fixture(['A']);
    runtime.getChartState = async () => ({
      success: true,
      symbol: 'BINANCE:ETHUSDT',
      resolution: '15',
    });
    const session = await runtime.create();
    runtime.sessionManager.touch(session.session_id, {
      symbol: 'BINANCE:BTCUSDT',
      timeframe: '15',
    });
    await assert.rejects(
      runtime.run(session.session_id, async () => 'data', {
        toolName: 'data_get_ohlcv',
      }),
      /changed outside this session/i,
    );
    assert.equal(
      (await runtime.status(session.session_id)).status,
      'drifted',
    );
  });

  it('explicitly rebinds to an unclaimed target without visual switching', async () => {
    const {runtime} = fixture(['A', 'B']);
    const session = await runtime.create();
    const before = await runtime.list({detailed: true});
    const oldTarget = before[0].target_id;
    const newIndex = oldTarget === 'A' ? 1 : 0;
    const rebound = await runtime.bind(session.session_id, newIndex);
    assert.equal(rebound.session_id, session.session_id);
    assert.notEqual(
      (await runtime.list({detailed: true}))[0].target_id,
      oldTarget,
    );
  });

  it('releases its pool claim when initial chart readiness times out', async () => {
    const {runtime, pool} = fixture(['A']);
    runtime.setChartSymbol = async () => ({chart_ready: false});
    await assert.rejects(
      runtime.create({symbol: 'BINANCE:BTCUSDT'}),
      /readiness timed out/i,
    );
    assert.equal((await runtime.list()).length, 0);
    assert.equal(pool.inspect()[0].owner, null);
  });

  it('does not repeatedly allocate a released tab that was manually closed', async () => {
    const {runtime, pool, existing} = fixture(['A']);
    const session = await runtime.create();
    await runtime.release(session.session_id);
    existing.delete('A');
    await assert.rejects(runtime.create(), /disappeared/i);
    assert.equal(pool.inspect()[0].healthy, false);
    assert.equal(pool.inspect()[0].owner, null);
  });
});
