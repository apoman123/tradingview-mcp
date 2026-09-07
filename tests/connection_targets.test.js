import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TargetConnectionManager} from '../src/connection.js';

function fakeClient(targetId, calls) {
  return {
    Runtime: {
      enable: async () => {},
      evaluate: async ({expression}) => {
        calls.push({targetId, expression});
        return {result: {value: `${targetId}:${expression}`}};
      },
    },
    Page: {enable: async () => {}},
    DOM: {enable: async () => {}},
    close: async () => calls.push({targetId, close: true}),
    once: () => {},
  };
}

function managerFixture(targetIds = ['A', 'B']) {
  const calls = [];
  let connectionCount = 0;
  const targets = new Set(targetIds);
  const manager = new TargetConnectionManager({
    connectClient: async (targetId) => {
      connectionCount++;
      await Promise.resolve();
      return fakeClient(targetId, calls);
    },
    listTargets: async () => [...targets].map((id) => ({
      id,
      type: 'page',
      title: id,
      url: `https://www.tradingview.com/chart/${id}/`,
    })),
    maxRetries: 1,
  });
  return {manager, calls, targets, connectionCount: () => connectionCount};
}

describe('TargetConnectionManager', () => {
  it('isolates evaluations by target', async () => {
    const {manager, calls} = managerFixture();
    assert.equal(await manager.evaluateOnTarget('A', 'alpha'), 'A:alpha');
    assert.equal(await manager.evaluateOnTarget('B', 'beta'), 'B:beta');
    assert.deepEqual(calls.filter((call) => call.expression), [
      {targetId: 'A', expression: 'alpha'},
      {targetId: 'B', expression: 'beta'},
    ]);
  });

  it('deduplicates concurrent first connections for one target', async () => {
    const fixture = managerFixture(['A']);
    const clients = await Promise.all([
      fixture.manager.getClientForTarget('A'),
      fixture.manager.getClientForTarget('A'),
      fixture.manager.getClientForTarget('A'),
    ]);
    assert.equal(new Set(clients).size, 1);
    assert.equal(fixture.connectionCount(), 1);
  });

  it('closing one target does not close another', async () => {
    const {manager, calls} = managerFixture();
    await Promise.all([
      manager.getClientForTarget('A'),
      manager.getClientForTarget('B'),
    ]);
    await manager.closeTargetClient('A');
    assert.equal(calls.filter((call) => call.close).length, 1);
    assert.equal(calls.find((call) => call.close).targetId, 'A');
    await manager.evaluateOnTarget('B', 'still-alive');
    assert.ok(calls.some((call) =>
      call.targetId === 'B' && call.expression === 'still-alive'));
  });

  it('invalidates only a stale target', async () => {
    const fixture = managerFixture();
    await Promise.all([
      fixture.manager.getClientForTarget('A'),
      fixture.manager.getClientForTarget('B'),
    ]);
    fixture.targets.delete('A');
    await assert.rejects(
      fixture.manager.getClientForTarget('A', {verifyTarget: true}),
      /no longer exists/i,
    );
    assert.equal(
      await fixture.manager.evaluateOnTarget('B', 'healthy'),
      'B:healthy',
    );
  });

  it('a failed target operation leaves other target clients intact', async () => {
    const fixture = managerFixture();
    const clientA = await fixture.manager.getClientForTarget('A');
    const originalEvaluate = clientA.Runtime.evaluate;
    clientA.Runtime.evaluate = async ({expression}) => {
      if (expression === 'explode') {
        throw new Error('Target closed');
      }
      return originalEvaluate({expression});
    };
    await fixture.manager.getClientForTarget('B');
    await assert.rejects(
      fixture.manager.evaluateOnTarget('A', 'explode'),
      /target closed/i,
    );
    assert.equal(
      await fixture.manager.evaluateOnTarget('B', 'unaffected'),
      'B:unaffected',
    );
  });

  it('rejects unsafe target IDs before discovery or connection', async () => {
    const {manager} = managerFixture();
    await assert.rejects(
      manager.getClientForTarget('A/../../json'),
      /invalid CDP target ID/i,
    );
  });

  it('does not resurrect a client closed during connection creation', async () => {
    let finishConnection;
    const gate = new Promise((resolve) => {
      finishConnection = resolve;
    });
    const calls = [];
    const manager = new TargetConnectionManager({
      listTargets: async () => [{id: 'A', type: 'page'}],
      connectClient: async () => {
        await gate;
        return fakeClient('A', calls);
      },
      maxRetries: 1,
    });
    const pending = manager.getClientForTarget('A');
    await Promise.resolve();
    await Promise.resolve();
    await manager.closeTargetClient('A');
    finishConnection();
    await assert.rejects(pending, /closed while it was being created/i);
    assert.equal(manager.clients.has('A'), false);
  });
});
