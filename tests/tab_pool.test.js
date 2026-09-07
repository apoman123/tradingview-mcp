import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {TabPool} from '../src/core/tab-pool.js';

describe('TabPool', () => {
  it('discovers, acquires, releases, and reuses tabs', async () => {
    const pool = new TabPool({
      capacity: 2,
      discoverTabs: async () => [{targetId: 'A'}, {targetId: 'B'}],
    });
    await pool.initialize();
    const a = await pool.acquire('one');
    const b = await pool.acquire('two');
    assert.notEqual(a.targetId, b.targetId);
    await pool.release(a.targetId, 'one');
    assert.equal((await pool.acquire('three')).targetId, a.targetId);
  });

  it('deduplicates simultaneous claims and respects capacity', async () => {
    let next = 0;
    const pool = new TabPool({
      capacity: 2,
      discoverTabs: async () => [],
      createTab: async () => ({targetId: `managed-${++next}`}),
    });
    const slots = await Promise.all([pool.acquire('one'), pool.acquire('two')]);
    assert.equal(new Set(slots.map((slot) => slot.targetId)).size, 2);
    await assert.rejects(pool.acquire('three'), /capacity/i);
  });

  it('does not close unmanaged tabs while trimming managed tabs', async () => {
    const closed = [];
    const pool = new TabPool({
      capacity: 3,
      discoverTabs: async () => [{targetId: 'user'}],
      createTab: async () => ({targetId: 'managed'}),
      closeTab: async (targetId) => closed.push(targetId),
    });
    await pool.initialize();
    const user = await pool.acquire('one');
    const managed = await pool.acquire('two');
    await pool.release(user.targetId, 'one');
    await pool.release(managed.targetId, 'two');
    await pool.closeExcessManaged(0);
    assert.deepEqual(closed, ['managed']);
  });
});

