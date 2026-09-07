import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {sessionAwareServer} from '../src/tools/session-aware-server.js';

describe('session-aware MCP routing', () => {
  it('adds optional session_id and preserves legacy no-session execution', async () => {
    let registration;
    const server = {tool: (...args) => registration = args};
    const runtime = {run: async () => assert.fail('session router used')};
    sessionAwareServer(server, runtime).tool(
      'chart_get_state',
      'state',
      {},
      async () => ({legacy: true}),
    );
    assert.ok(registration[2].session_id);
    assert.deepEqual(await registration[3]({}), {legacy: true});
  });

  it('routes a supplied session exactly once', async () => {
    let registration;
    const calls = [];
    const server = {tool: (...args) => registration = args};
    const runtime = {
      run: async (sessionId, operation) => {
        calls.push(sessionId);
        return operation();
      },
    };
    sessionAwareServer(server, runtime).tool(
      'data_get_ohlcv',
      'ohlcv',
      {},
      async () => ({success: true}),
    );
    const result = await registration[3]({session_id: 'tv_session_1'});
    assert.deepEqual(calls, ['tv_session_1']);
    assert.deepEqual(result, {success: true});
  });

  it('does not add session routing to visible tab_switch', () => {
    let registration;
    const server = {tool: (...args) => registration = args};
    sessionAwareServer(server, {}).tool(
      'tab_switch',
      'switch',
      {},
      async () => {},
    );
    assert.equal(registration[2].session_id, undefined);
  });
});
