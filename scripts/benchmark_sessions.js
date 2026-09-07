#!/usr/bin/env node
import {performance} from 'node:perf_hooks';
import {sessionRuntime} from '../src/core/session-runtime.js';
import * as chart from '../src/core/chart.js';
import * as data from '../src/core/data.js';
import * as capture from '../src/core/capture.js';

const symbols = [
  'BINANCE:BTCUSDT', 'BINANCE:ETHUSDT', 'BINANCE:SOLUSDT',
  'NASDAQ:AAPL', 'NASDAQ:MSFT', 'NASDAQ:NVDA', 'NYSE:TSLA',
  'COINBASE:BTCUSD',
];
const levels = [1, 2, 4, 8];
const includeScreenshot = process.env.TV_BENCHMARK_SCREENSHOT === '1';
const report = [];

for (const count of levels) {
  const sessions = [];
  const startCpu = process.cpuUsage();
  const startMemory = process.memoryUsage().rss;
  const start = performance.now();
  const failures = [];
  try {
    const created = await Promise.all(symbols.slice(0, count).map(
      (symbol, index) => sessionRuntime.create({
        workerLabel: `benchmark_${count}_${index}`,
        symbol,
        timeframe: index % 2 ? '60' : '15',
      }),
    ));
    sessions.push(...created);
    await Promise.all(created.map((session, index) =>
      sessionRuntime.run(session.session_id, async () => {
        try {
          await chart.getState();
          await data.getOhlcv({count: 50, summary: true});
          await data.getStudyValues();
          if (includeScreenshot) {
            await capture.captureScreenshot({
              region: 'chart',
              filename: `benchmark_${count}_${index}`,
              waitForRender: true,
            });
          }
        } catch (error) {
          failures.push({session_id: session.session_id,
            error: error.message});
        }
      })));
  } catch (error) {
    failures.push({error: error.message});
  } finally {
    await Promise.allSettled(sessions.map((session) =>
      sessionRuntime.release(session.session_id)));
  }
  const cpu = process.cpuUsage(startCpu);
  report.push({
    sessions: count,
    latency_ms: Math.round(performance.now() - start),
    failures,
    cpu_user_ms: Math.round(cpu.user / 1000),
    cpu_system_ms: Math.round(cpu.system / 1000),
    rss_delta_mb: Math.round(
      (process.memoryUsage().rss - startMemory) / 1024 / 1024,
    ),
    screenshot_included: includeScreenshot,
  });
}

const success = report.every((entry) => entry.failures.length === 0);
process.stdout.write(`${JSON.stringify({
  success,
  note: 'Results expose local capacity; they do not imply linear scaling.',
  report,
}, null, 2)}\n`);
if (!success) process.exitCode = 1;
