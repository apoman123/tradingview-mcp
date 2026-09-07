import {Mutex} from './locks.js';

/** Reusable ownership pool for chart page targets. */
export class TabPool {
  constructor({
    capacity = Number(process.env.TV_TAB_POOL_SIZE) || 4,
    discoverTabs,
    createTab,
    closeTab,
  } = {}) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 64) {
      throw new Error('Tab pool capacity must be an integer from 1 to 64.');
    }
    this.capacity = capacity;
    this.discoverTabs = discoverTabs || (async () => []);
    this.createTab = createTab;
    this.closeTab = closeTab;
    this.slots = new Map();
    this.mutex = new Mutex();
    this.initialized = false;
  }

  async initialize() {
    return this.mutex.runExclusive(async () => {
      if (this.initialized) return this.inspect();
      const tabs = await this.discoverTabs();
      for (const tab of tabs.slice(0, this.capacity)) {
        this.slots.set(tab.targetId, {
          targetId: tab.targetId,
          managed: false,
          owner: null,
          healthy: true,
        });
      }
      this.initialized = true;
      return this.inspect();
    });
  }

  async acquire(owner) {
    return this.mutex.runExclusive(async () => {
      if (!this.initialized) {
        const tabs = await this.discoverTabs();
        for (const tab of tabs.slice(0, this.capacity)) {
          this.slots.set(tab.targetId, {
            targetId: tab.targetId,
            managed: false,
            owner: null,
            healthy: true,
          });
        }
        this.initialized = true;
      }
      for (const slot of [...this.slots.values()]) {
        if (!slot.healthy && !slot.owner) {
          this.slots.delete(slot.targetId);
        }
      }
      const available = [...this.slots.values()].find((slot) =>
        slot.healthy && !slot.owner);
      if (available) {
        available.owner = owner;
        return {...available};
      }
      if (this.slots.size >= this.capacity) {
        throw new Error(`TradingView tab pool capacity ${this.capacity} ` +
          'has been reached. Release a session or increase TV_TAB_POOL_SIZE.');
      }
      if (!this.createTab) {
        throw new Error('No reusable TradingView tab is available and tab ' +
          'creation is not configured.');
      }
      const created = await this.createTab();
      if (!created?.targetId || this.slots.has(created.targetId)) {
        throw new Error('Tab creation did not return a new chart target.');
      }
      const slot = {
        targetId: created.targetId,
        managed: true,
        owner,
        healthy: true,
      };
      this.slots.set(slot.targetId, slot);
      return {...slot};
    });
  }

  async release(targetId, owner) {
    return this.mutex.runExclusive(async () => {
      const slot = this.slots.get(targetId);
      if (!slot) throw new Error(`Target ${targetId} is not in the tab pool.`);
      if (slot.owner !== owner) {
        throw new Error(`Target ${targetId} is owned by ${slot.owner || 'nobody'}, ` +
          `not ${owner}.`);
      }
      slot.owner = null;
      return {...slot};
    });
  }

  async transfer(targetId, currentOwner, newOwner) {
    return this.mutex.runExclusive(async () => {
      const slot = this.slots.get(targetId);
      if (!slot || slot.owner !== currentOwner) {
        throw new Error(`Target ${targetId} is not owned by ${currentOwner}.`);
      }
      slot.owner = newOwner;
      return {...slot};
    });
  }

  async claim(targetId, owner, {managed = false} = {}) {
    return this.mutex.runExclusive(async () => {
      let slot = this.slots.get(targetId);
      if (!slot) {
        if (this.slots.size >= this.capacity) {
          throw new Error(`TradingView tab pool capacity ${this.capacity} ` +
            'has been reached.');
        }
        slot = {targetId, managed, owner: null, healthy: true};
        this.slots.set(targetId, slot);
      }
      if (slot.owner && slot.owner !== owner) {
        throw new Error(`Target ${targetId} is already owned by ${slot.owner}.`);
      }
      if (!slot.healthy) {
        throw new Error(`Target ${targetId} is marked unhealthy.`);
      }
      slot.owner = owner;
      return {...slot};
    });
  }

  async replaceClaim(oldTargetId, newTargetId, owner) {
    return this.mutex.runExclusive(async () => {
      const oldSlot = this.slots.get(oldTargetId);
      if (!oldSlot || oldSlot.owner !== owner) {
        throw new Error(`Target ${oldTargetId} is not owned by ${owner}.`);
      }
      const existing = this.slots.get(newTargetId);
      if (existing?.owner && existing.owner !== owner) {
        throw new Error(`Target ${newTargetId} is already owned by ` +
          `${existing.owner}.`);
      }
      this.slots.delete(oldTargetId);
      const replacement = existing || {
        targetId: newTargetId,
        managed: false,
        owner: null,
        healthy: true,
      };
      replacement.owner = owner;
      replacement.healthy = true;
      this.slots.set(newTargetId, replacement);
      return {...replacement};
    });
  }

  async markUnhealthy(targetId) {
    return this.mutex.runExclusive(async () => {
      const slot = this.slots.get(targetId);
      if (slot) slot.healthy = false;
      return slot ? {...slot} : null;
    });
  }

  async closeExcessManaged(keepAvailable = 1) {
    return this.mutex.runExclusive(async () => {
      if (!this.closeTab) return [];
      const available = [...this.slots.values()].filter((slot) =>
        slot.managed && slot.healthy && !slot.owner);
      const toClose = available.slice(Math.max(0, keepAvailable));
      const closed = [];
      for (const slot of toClose) {
        await this.closeTab(slot.targetId);
        this.slots.delete(slot.targetId);
        closed.push(slot.targetId);
      }
      return closed;
    });
  }

  inspect() {
    return [...this.slots.values()].map((slot) => ({...slot}));
  }
}
