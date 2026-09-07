import {AsyncLocalStorage} from 'node:async_hooks';
import CDP from 'chrome-remote-interface';

export const CDP_HOST = process.env.TV_CDP_HOST || process.env.CDP_HOST ||
  '127.0.0.1';
export const CDP_PORT = Number(
  process.env.TV_CDP_PORT || process.env.CDP_PORT,
) || 9222;

const MAX_RETRIES = 5;
const BASE_DELAY = 500;
const FETCH_TIMEOUT_MS = 5000;
const CDP_COMMAND_TIMEOUT_MS = 15000;
const HEALTH_CHECK_INTERVAL_MS = 1000;
const TARGET_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;
const targetContext = new AsyncLocalStorage();

async function withTimeout(promise, timeoutMs, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

export const KNOWN_PATHS = {
  chartApi: 'window.TradingViewApi._activeChartWidgetWV.value()',
  chartWidgetCollection: 'window.TradingViewApi._chartWidgetCollection',
  bottomWidgetBar: 'window.TradingView.bottomWidgetBar',
  replayApi: 'window.TradingViewApi._replayApi',
  alertService: 'window.TradingViewApi._alertService',
  chartApiInstance: 'window.ChartApiInstance',
  mainSeriesBars: 'window.TradingViewApi._activeChartWidgetWV.value()' +
    '._chartWidget.model().mainSeries().bars()',
  strategyStudy: 'chart._chartWidget.model().model().dataSources()',
  layoutManager: 'window.TradingViewApi.getSavedCharts',
  symbolSearchApi: 'window.TradingViewApi.searchSymbols',
  pineFacadeApi: 'https://pine-facade.tradingview.com/pine-facade',
};

/** Produces a safely escaped JavaScript string literal. */
export function safeString(value) {
  return JSON.stringify(String(value));
}

/** Validates and returns a finite number. */
export function requireFinite(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${name} must be a finite number, got: ${value}`);
  }
  return number;
}

/** Validates an opaque CDP target identifier before it reaches CDP or a URL. */
export function validateTargetId(targetId) {
  if (typeof targetId !== 'string' || !TARGET_ID_PATTERN.test(targetId)) {
    throw new Error('Invalid CDP target ID. Expected 1-256 letters, numbers, ' +
      'underscores, or hyphens.');
  }
  return targetId;
}

async function fetchJson(path, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `http://${CDP_HOST}:${CDP_PORT}${path}`,
      {signal: controller.signal},
    );
    if (!response.ok) {
      throw new Error(`CDP endpoint returned HTTP ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`CDP endpoint timed out after ${timeoutMs} ms`);
    }
    throw new Error(`TradingView CDP endpoint ${CDP_HOST}:${CDP_PORT} is ` +
      `unavailable: ${error.message}. Start TradingView Desktop with remote ` +
      'debugging enabled or call tv_launch.');
  } finally {
    clearTimeout(timeout);
  }
}

/** Returns the current CDP target inventory. */
export async function listCdpTargets() {
  return fetchJson('/json/list');
}

/** Returns chart page targets without treating the Electron shell as a chart. */
export async function listChartTargets() {
  const targets = await listCdpTargets();
  return targets.filter((target) => target.type === 'page' &&
    /tradingview\.com\/chart/i.test(target.url || ''));
}

function findDefaultChartTarget(targets) {
  return targets.find((target) => target.type === 'page' &&
    /tradingview\.com\/chart/i.test(target.url || '')) ||
    targets.find((target) => target.type === 'page' &&
      /tradingview/i.test(target.url || '')) || null;
}

/** Owns independent CDP clients keyed by page target ID. */
export class TargetConnectionManager {
  constructor({
    connectClient,
    listTargets = listCdpTargets,
    maxRetries = MAX_RETRIES,
    baseDelayMs = BASE_DELAY,
    healthCheckIntervalMs = HEALTH_CHECK_INTERVAL_MS,
    commandTimeoutMs = CDP_COMMAND_TIMEOUT_MS,
  } = {}) {
    this.connectClient = connectClient || (async (targetId) => CDP({
      host: CDP_HOST,
      port: CDP_PORT,
      target: targetId,
    }));
    this.listTargets = listTargets;
    this.maxRetries = maxRetries;
    this.baseDelayMs = baseDelayMs;
    this.healthCheckIntervalMs = healthCheckIntervalMs;
    this.commandTimeoutMs = commandTimeoutMs;
    this.clients = new Map();
    this.pendingConnections = new Map();
    this.connectionEpochs = new Map();
  }

  async targetExists(targetId) {
    validateTargetId(targetId);
    const targets = await this.listTargets();
    return targets.some((target) => target.id === targetId &&
      target.type === 'page');
  }

  async isChartTarget(targetId) {
    const target = await this.getTarget(targetId);
    return Boolean(target && /tradingview\.com\/chart/i.test(target.url || ''));
  }

  async getTarget(targetId) {
    validateTargetId(targetId);
    const targets = await this.listTargets();
    return targets.find((target) => target.id === targetId &&
      target.type === 'page') || null;
  }

  async getClientForTarget(targetId, {verifyTarget = false} = {}) {
    validateTargetId(targetId);
    const cached = this.clients.get(targetId);
    if (cached) {
      if (verifyTarget && !(await this.targetExists(targetId))) {
        await this.closeTargetClient(targetId);
        throw new Error(`The CDP target ${targetId} no longer exists.`);
      }
      if (Date.now() - cached.lastHealthCheck <
          this.healthCheckIntervalMs) {
        return cached.client;
      }
      try {
        await withTimeout(cached.client.Runtime.evaluate({
          expression: '1',
          returnByValue: true,
        }), this.commandTimeoutMs,
        `CDP health check timed out for target ${targetId}.`);
        cached.lastHealthCheck = Date.now();
        return cached.client;
      } catch {
        await this.closeTargetClient(targetId);
      }
    }

    const pending = this.pendingConnections.get(targetId);
    if (pending) {
      return pending;
    }
    const epoch = this.connectionEpochs.get(targetId) || 0;
    const connection = this.createConnection(targetId, epoch);
    this.pendingConnections.set(targetId, connection);
    try {
      return await connection;
    } finally {
      if (this.pendingConnections.get(targetId) === connection) {
        this.pendingConnections.delete(targetId);
      }
    }
  }

  async createConnection(targetId, epoch) {
    let lastError;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const target = await this.getTarget(targetId);
        if (!target) {
          throw new Error(`The CDP target ${targetId} no longer exists.`);
        }
        const client = await withTimeout(
          this.connectClient(targetId),
          this.commandTimeoutMs,
          `CDP connection timed out for target ${targetId}.`,
        );
        try {
          await withTimeout(Promise.all([
            client.Runtime.enable(),
            client.Page.enable(),
            client.DOM.enable(),
          ]), this.commandTimeoutMs,
          `CDP domain setup timed out for target ${targetId}.`);
        } catch (error) {
          try {
            await client.close();
          } catch {}
          throw error;
        }
        if ((this.connectionEpochs.get(targetId) || 0) !== epoch) {
          try {
            await client.close();
          } catch {}
          throw new Error(`Connection to target ${targetId} was closed while ` +
            'it was being created.');
        }
        const entry = {client, target, lastHealthCheck: Date.now()};
        this.clients.set(targetId, entry);
        if (typeof client.once === 'function') {
          client.once('disconnect', () => {
            if (this.clients.get(targetId)?.client === client) {
              this.clients.delete(targetId);
            }
          });
        }
        return client;
      } catch (error) {
        lastError = error;
        if ((this.connectionEpochs.get(targetId) || 0) !== epoch) {
          break;
        }
        if (attempt + 1 < this.maxRetries) {
          const delayMs = Math.min(
            this.baseDelayMs * Math.pow(2, attempt),
            30000,
          );
          await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
      }
    }
    throw new Error(`CDP connection to target ${targetId} failed after ` +
      `${this.maxRetries} attempt(s): ${lastError?.message}`);
  }

  async evaluateOnTarget(targetId, expression, options = {}) {
    const client = await this.getClientForTarget(targetId);
    try {
      const {timeoutMs = this.commandTimeoutMs, ...cdpOptions} = options;
      const result = await withTimeout(client.Runtime.evaluate({
        expression,
        returnByValue: true,
        awaitPromise: cdpOptions.awaitPromise ?? false,
        ...cdpOptions,
      }), timeoutMs, `CDP evaluation timed out for target ${targetId}.`);
      if (result.exceptionDetails) {
        const message = result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text || 'Unknown evaluation error';
        throw new Error(`JS evaluation error: ${message}`);
      }
      return result.result?.value;
    } catch (error) {
      if (/closed|disconnect|destroyed|target/i.test(error.message)) {
        await this.closeTargetClient(targetId);
      }
      throw error;
    }
  }

  async evaluateAsyncOnTarget(targetId, expression, options = {}) {
    return this.evaluateOnTarget(targetId, expression, {
      ...options,
      awaitPromise: true,
    });
  }

  async closeTargetClient(targetId) {
    validateTargetId(targetId);
    this.connectionEpochs.set(
      targetId,
      (this.connectionEpochs.get(targetId) || 0) + 1,
    );
    const entry = this.clients.get(targetId);
    this.clients.delete(targetId);
    if (entry) {
      try {
        await entry.client.close();
      } catch {}
    }
  }

  async closeAllTargetClients() {
    const targetIds = new Set([
      ...this.clients.keys(),
      ...this.pendingConnections.keys(),
    ]);
    await Promise.all([...targetIds].map((targetId) =>
      this.closeTargetClient(targetId)));
  }
}

export const targetConnectionManager = new TargetConnectionManager();
let legacyTargetId = null;

/** Runs an operation in an explicit target-scoped async execution context. */
export function runWithTarget(targetId, operation) {
  validateTargetId(targetId);
  return targetContext.run({targetId}, operation);
}

/** Returns the target bound to the current async operation, if any. */
export function getCurrentTargetId() {
  return targetContext.getStore()?.targetId || null;
}

async function resolveLegacyTarget() {
  const fixedTargetId = process.env.TV_TARGET_ID;
  if (fixedTargetId) {
    validateTargetId(fixedTargetId);
    legacyTargetId = fixedTargetId;
    return fixedTargetId;
  }
  if (legacyTargetId &&
      await targetConnectionManager.targetExists(legacyTargetId)) {
    return legacyTargetId;
  }
  const target = findDefaultChartTarget(await listCdpTargets());
  if (!target) {
    throw new Error('No TradingView chart target found. Is TradingView open ' +
      'with a chart?');
  }
  legacyTargetId = target.id;
  return legacyTargetId;
}

/** Backward-compatible lookup, target-scoped when a context is active. */
export async function getClient() {
  const targetId = getCurrentTargetId() || await resolveLegacyTarget();
  return targetConnectionManager.getClientForTarget(targetId);
}

/** Backward-compatible connection entry point. */
export async function connect(targetId = null) {
  const resolvedTargetId = targetId || await resolveLegacyTarget();
  validateTargetId(resolvedTargetId);
  if (targetId) {
    legacyTargetId = targetId;
  }
  return targetConnectionManager.getClientForTarget(resolvedTargetId);
}

/** Changes only the legacy target; session bindings are unaffected. */
export async function reconnectTo(targetId) {
  validateTargetId(targetId);
  legacyTargetId = targetId;
  return targetConnectionManager.getClientForTarget(targetId, {
    verifyTarget: true,
  });
}

/** Returns the cached or newly connected client for exactly one target. */
export async function getClientForTarget(targetId, options) {
  return targetConnectionManager.getClientForTarget(targetId, options);
}

/** Evaluates JavaScript on exactly one target without active-tab fallback. */
export async function evaluateOnTarget(targetId, expression, options = {}) {
  return targetConnectionManager.evaluateOnTarget(
    targetId,
    expression,
    options,
  );
}

/** Awaits a promise-valued expression on exactly one target. */
export async function evaluateAsyncOnTarget(
  targetId,
  expression,
  options = {},
) {
  return targetConnectionManager.evaluateAsyncOnTarget(
    targetId,
    expression,
    options,
  );
}

/** Closes only one target's cached CDP client. */
export async function closeTargetClient(targetId) {
  return targetConnectionManager.closeTargetClient(targetId);
}

/** Closes every cached and currently connecting target client. */
export async function closeAllTargetClients() {
  return targetConnectionManager.closeAllTargetClients();
}

export async function getTargetInfo() {
  const targetId = getCurrentTargetId() || await resolveLegacyTarget();
  const target = await targetConnectionManager.getTarget(targetId);
  if (!target) {
    throw new Error(`The CDP target ${targetId} no longer exists.`);
  }
  return target;
}

export async function evaluate(expression, options = {}) {
  const targetId = getCurrentTargetId() || await resolveLegacyTarget();
  return evaluateOnTarget(targetId, expression, options);
}

export async function evaluateAsync(expression, options = {}) {
  return evaluate(expression, {...options, awaitPromise: true});
}

export async function disconnect() {
  legacyTargetId = null;
  await closeAllTargetClients();
}

async function verifyAndReturn(path, name) {
  const exists = await evaluate(
    `typeof (${path}) !== 'undefined' && (${path}) !== null`,
  );
  if (!exists) {
    throw new Error(`${name} not available at ${path}`);
  }
  return path;
}

export async function getChartApi() {
  return verifyAndReturn(KNOWN_PATHS.chartApi, 'Chart API');
}

export async function getChartCollection() {
  return verifyAndReturn(
    KNOWN_PATHS.chartWidgetCollection,
    'Chart Widget Collection',
  );
}

export async function getBottomBar() {
  return verifyAndReturn(KNOWN_PATHS.bottomWidgetBar, 'Bottom Widget Bar');
}

export async function getReplayApi() {
  return verifyAndReturn(KNOWN_PATHS.replayApi, 'Replay API');
}

export async function getMainSeriesBars() {
  return verifyAndReturn(KNOWN_PATHS.mainSeriesBars, 'Main Series Bars');
}
