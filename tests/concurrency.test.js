import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {KeyedMutex, Mutex} from '../src/core/locks.js';
import {SessionManager} from '../src/core/session.js';
import {SessionRuntime} from '../src/core/session-runtime.js';
import {getCurrentTargetId} from '../src/connection.js';

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('resource-scoped locking', () => {
  it('serializes the same target while different targets overlap', async () => {
    const locks = new KeyedMutex();
    let activeA = 0;
    let maxA = 0;
    let totalActive = 0;
    let maxTotal = 0;
    const run = (targetId) => locks.runExclusive(targetId, async () => {
      totalActive++;
      maxTotal = Math.max(maxTotal, totalActive);
      if (targetId === 'A') {
        activeA++;
        maxA = Math.max(maxA, activeA);
      }
      await delay(20);
      if (targetId === 'A') activeA--;
      totalActive--;
    });
    await Promise.all([run('A'), run('A'), run('B')]);
    assert.equal(maxA, 1);
    assert.equal(maxTotal, 2);
  });

  it('serializes shell operations', async () => {
    const shellMutex = new Mutex();
    let active = 0;
    let maximum = 0;
    await Promise.all([1, 2, 3].map(() => shellMutex.runExclusive(async () => {
      active++;
      maximum = Math.max(maximum, active);
      await delay(10);
      active--;
    })));
    assert.equal(maximum, 1);
  });
});

describe('session target routing', () => {
  it('keeps concurrent async operations bound to their own targets', async () => {
    const sessionManager = new SessionManager();
    const sessionA = sessionManager.create({targetId: 'A'});
    const sessionB = sessionManager.create({targetId: 'B'});
    const runtime = new SessionRuntime({
      sessionManager,
      tabPool: {},
      connectionManager: {
        targetExists: async () => true,
      },
      targetLocks: new KeyedMutex(),
    });
    const seen = await Promise.all([
      runtime.run(sessionA.sessionId, async () => {
        await delay(15);
        return getCurrentTargetId();
      }),
      runtime.run(sessionB.sessionId, async () => {
        await delay(5);
        return getCurrentTargetId();
      }),
    ]);
    assert.deepEqual(seen, ['A', 'B']);
  });
});
