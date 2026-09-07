#!/usr/bin/env node
import {sessionRuntime} from '../src/core/session-runtime.js';
import * as chart from '../src/core/chart.js';
import * as data from '../src/core/data.js';
import * as capture from '../src/core/capture.js';
import * as tab from '../src/core/tab.js';
import {evaluateOnTarget} from '../src/connection.js';

const configurations = [
  {symbol: 'BINANCE:BTCUSDT', timeframe: '15'},
  {symbol: 'BINANCE:ETHUSDT', timeframe: '60'},
  {symbol: 'BINANCE:SOLUSDT', timeframe: '5'},
];

function symbolMatches(actual, expected) {
  return String(actual).toUpperCase().split(':').pop() ===
    expected.toUpperCase().split(':').pop();
}

const sessions = [];
let closeDiagnosticForegroundTab = false;
try {
  const created = await Promise.all(configurations.map((configuration, index) =>
    sessionRuntime.create({
      workerLabel: `live_worker_${index + 1}`,
      ...configuration,
    })));
  sessions.push(...created);

  // Foreground a tab that belongs to no worker. If none exists, create a
  // temporary landing tab and close it after verification.
  const detailed = await sessionRuntime.list({detailed: true});
  const workerTargetIds = new Set(detailed.map((item) => item.target_id));
  let tabs = await tab.list();
  let foregroundIndex = tabs.tabs.findIndex((item) =>
    !workerTargetIds.has(item.id));
  if (foregroundIndex < 0) {
    await tab.newTab();
    closeDiagnosticForegroundTab = true;
    tabs = await tab.list();
    foregroundIndex = tabs.tabs.findIndex((item) =>
      !workerTargetIds.has(item.id));
  }
  if (foregroundIndex < 0) {
    throw new Error('Could not create or find an unassigned foreground tab.');
  }
  const foregroundIsWorkerTarget = workerTargetIds.has(
    tabs.tabs[foregroundIndex].id,
  );
  await tab.switchTab({index: foregroundIndex});

  const results = await Promise.all(created.map((session, index) =>
    sessionRuntime.run(session.session_id, async () => {
      const wanted = configurations[index];
      await chart.setSymbol({symbol: wanted.symbol});
      await chart.setTimeframe({timeframe: wanted.timeframe});
      const [state, ohlcv, studies, screenshot] = await Promise.all([
        chart.getState(),
        data.getOhlcv({count: 20, summary: true}),
        data.getStudyValues(),
        capture.captureScreenshot({
          region: 'chart',
          filename: `session_live_${index + 1}`,
          waitForRender: true,
        }),
      ]);
      return {session_id: session.session_id, wanted, state, ohlcv, studies,
        screenshot};
    })));

  const visibility = await Promise.all(detailed.map(async (session) => ({
    session_id: session.session_id,
    visibility: await evaluateOnTarget(
      session.target_id,
      'document.visibilityState',
    ),
  })));
  const failures = results.filter((result) =>
    !symbolMatches(result.state.symbol, result.wanted.symbol) ||
    String(result.state.resolution) !== result.wanted.timeframe ||
    result.ohlcv.bar_count < 1 || result.screenshot.size_bytes < 1);
  const visibleWorkers = visibility.filter((item) =>
    item.visibility === 'visible');
  const report = {
    success: failures.length === 0 && visibleWorkers.length === 0,
    foreground_is_worker_target: foregroundIsWorkerTarget,
    visibility,
    results,
    isolation_failures: failures.map((failure) => failure.session_id),
    unexpectedly_visible_workers: visibleWorkers.map((item) =>
      item.session_id),
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.success) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({success: false,
    error: error.message}, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  if (closeDiagnosticForegroundTab) {
    try {
      await tab.closeTab();
    } catch {}
  }
  await Promise.allSettled(sessions.map((session) =>
    sessionRuntime.release(session.session_id)));
}
