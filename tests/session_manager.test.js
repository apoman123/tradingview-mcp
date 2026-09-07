import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {SessionManager} from '../src/core/session.js';

describe('SessionManager', () => {
  it('supports create, bind, rebind, list, and release', () => {
    const manager = new SessionManager({now: () => 100});
    const first = manager.create({targetId: 'A', workerLabel: 'btc'});
    assert.equal(first.sessionId, 'tv_session_1');
    assert.equal(manager.get(first.sessionId).targetId, 'A');
    manager.bind(first.sessionId, 'B');
    assert.equal(manager.get(first.sessionId).targetId, 'B');
    assert.equal(manager.list().length, 1);
    assert.equal(manager.release(first.sessionId).targetId, 'B');
    assert.throws(() => manager.get(first.sessionId), /does not exist/i);
  });

  it('never permits two sessions to own one target', () => {
    const manager = new SessionManager();
    manager.create({targetId: 'A'});
    assert.throws(() => manager.create({targetId: 'A'}), /already assigned/i);
  });

  it('marks a stale binding and never redirects it', async () => {
    const manager = new SessionManager();
    const session = manager.create({targetId: 'A'});
    await assert.rejects(
      manager.validate(session.sessionId, async () => false),
      /no longer exists/i,
    );
    assert.equal(manager.get(session.sessionId).targetId, 'A');
    assert.equal(manager.get(session.sessionId).status, 'stale');
  });

  it('finds stale sessions without releasing or rebinding them', async () => {
    const manager = new SessionManager();
    const first = manager.create({targetId: 'A'});
    const second = manager.create({targetId: 'B'});
    const stale = await manager.cleanStale(async (targetId) => targetId === 'B');
    assert.deepEqual(stale.map((item) => item.sessionId), [first.sessionId]);
    assert.equal(manager.get(first.sessionId).targetId, 'A');
    assert.equal(manager.get(second.sessionId).status, 'ready');
  });

  it('can clean stale sessions when explicitly requested', async () => {
    const manager = new SessionManager();
    const session = manager.create({targetId: 'A'});
    await manager.cleanStale(async () => false, {release: true});
    assert.throws(() => manager.get(session.sessionId), /does not exist/i);
  });
});
