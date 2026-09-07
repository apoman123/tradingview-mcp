import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {sessionAwareServer} from '../src/tools/session-aware-server.js';
import {registerSessionTools} from '../src/tools/session.js';
import {registerHealthTools} from '../src/tools/health.js';
import {registerChartTools} from '../src/tools/chart.js';
import {registerPineTools} from '../src/tools/pine.js';
import {registerDataTools} from '../src/tools/data.js';
import {registerCaptureTools} from '../src/tools/capture.js';
import {registerDrawingTools} from '../src/tools/drawing.js';
import {registerAlertTools} from '../src/tools/alerts.js';
import {registerBatchTools} from '../src/tools/batch.js';
import {registerReplayTools} from '../src/tools/replay.js';
import {registerIndicatorTools} from '../src/tools/indicators.js';
import {registerWatchlistTools} from '../src/tools/watchlist.js';
import {registerUiTools} from '../src/tools/ui.js';
import {registerPaneTools} from '../src/tools/pane.js';
import {registerTabTools} from '../src/tools/tab.js';

function registrations() {
  const tools = new Map();
  const server = {
    tool(name, description, schema, handler) {
      tools.set(name, {description, schema, handler});
    },
  };
  const runtime = {run: async (sessionId, operation) => operation()};
  registerSessionTools(server, runtime);
  const routed = sessionAwareServer(server, runtime);
  [
    registerHealthTools, registerChartTools, registerPineTools,
    registerDataTools, registerCaptureTools, registerDrawingTools,
    registerAlertTools, registerBatchTools, registerReplayTools,
    registerIndicatorTools, registerWatchlistTools, registerUiTools,
    registerPaneTools, registerTabTools,
  ].forEach((register) => register(routed));
  return tools;
}

describe('MCP tool surface', () => {
  it('adds five non-overlapping session lifecycle tools', () => {
    const tools = registrations();
    assert.equal(tools.size, 89);
    assert.deepEqual(
      [...tools.keys()].filter((name) => name.startsWith('tv_session_')),
      [
        'tv_session_create',
        'tv_session_list',
        'tv_session_status',
        'tv_session_bind',
        'tv_session_release',
      ],
    );
  });

  it('adds session_id to target-sensitive tools but not visible tab tools', () => {
    const tools = registrations();
    for (const name of [
      'chart_get_state', 'data_get_ohlcv', 'capture_screenshot',
      'pine_get_errors', 'indicator_add', 'replay_status', 'ui_click',
    ]) {
      assert.ok(tools.get(name).schema.session_id, `${name} is session-aware`);
      assert.match(tools.get(name).description, /without changing the visible tab/i);
    }
    for (const name of ['tab_list', 'tab_new', 'tab_close', 'tab_switch']) {
      assert.equal(tools.get(name).schema.session_id, undefined);
    }
  });
});
