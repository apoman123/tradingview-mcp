#!/usr/bin/env node
import {sessionRuntime} from '../src/core/session-runtime.js';
import * as chart from '../src/core/chart.js';
import * as data from '../src/core/data.js';
import * as capture from '../src/core/capture.js';
import * as pine from '../src/core/pine.js';
import * as tab from '../src/core/tab.js';

const configurations = [
  {symbol: 'BINANCE:BTCUSDT', timeframe: '15'},
  {symbol: 'BINANCE:ETHUSDT', timeframe: '60'},
  {symbol: 'BINANCE:SOLUSDT', timeframe: '5'},
];
const sessions = [];

async function validateCapability(name, operation) {
  const startedAt = Date.now();
  try {
    const result = await operation();
    return {name, success: true, latency_ms: Date.now() - startedAt, result};
  } catch (error) {
    return {name, success: false, latency_ms: Date.now() - startedAt,
      error: error.message};
  }
}

try {
  const created = await Promise.all(configurations.map((configuration, index) =>
    sessionRuntime.create({
      workerLabel: `background_validation_${index + 1}`,
      ...configuration,
    })));
  sessions.push(...created);
  const details = await sessionRuntime.list({detailed: true});
  const tabs = await tab.list();
  const foregroundIndex = tabs.tabs.findIndex((item) =>
    item.id === details[0].target_id);
  if (foregroundIndex >= 0) await tab.switchTab({index: foregroundIndex});

  const backgroundReports = await Promise.all(created.slice(1).map(
    (session, reportIndex) => sessionRuntime.run(session.session_id,
      async () => {
        const addedStudies = [];
        const checks = [];
        checks.push(await validateCapability('chart_state', () =>
          chart.getState()));
        checks.push(await validateCapability('set_symbol', () =>
          chart.setSymbol({symbol: configurations[reportIndex + 1].symbol})));
        checks.push(await validateCapability('set_timeframe', () =>
          chart.setTimeframe({
            timeframe: configurations[reportIndex + 1].timeframe,
          })));
        checks.push(await validateCapability('ohlcv', () =>
          data.getOhlcv({count: 20, summary: true})));
        checks.push(await validateCapability('study_values', () =>
          data.getStudyValues()));
        checks.push(await validateCapability('indicator_add_remove',
          async () => {
            const added = await chart.manageIndicator({
              action: 'add',
              indicator: 'Relative Strength Index',
            });
            if (added.entity_id) addedStudies.push(added.entity_id);
            if (!added.entity_id) return added;
            return chart.manageIndicator({
              action: 'remove',
              entity_id: added.entity_id,
            });
          }));
        checks.push(await validateCapability('pine_errors', () =>
          pine.getErrors()));
        checks.push(await validateCapability('screenshot', () =>
          capture.captureScreenshot({
            region: 'chart',
            filename: `background_capability_${reportIndex + 1}`,
            waitForRender: true,
          })));
        for (const entityId of addedStudies) {
          try {
            await chart.manageIndicator({action: 'remove', entity_id: entityId});
          } catch {}
        }
        return {session_id: session.session_id, checks};
      }),
  ));
  const failed = backgroundReports.flatMap((report) => report.checks)
    .filter((check) => !check.success);
  process.stdout.write(`${JSON.stringify({
    success: failed.length === 0,
    foreground_session_id: created[0].session_id,
    background_reports: backgroundReports,
  }, null, 2)}\n`);
  if (failed.length) process.exitCode = 1;
} catch (error) {
  process.stderr.write(`${JSON.stringify({success: false,
    error: error.message}, null, 2)}\n`);
  process.exitCode = 1;
} finally {
  await Promise.allSettled(sessions.map((session) =>
    sessionRuntime.release(session.session_id)));
}
