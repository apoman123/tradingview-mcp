import {validateTargetId} from '../connection.js';

function publicSession(session, detailed = false) {
  return {
    session_id: session.sessionId,
    worker_label: session.workerLabel,
    created_at: new Date(session.createdAt).toISOString(),
    last_used_at: new Date(session.lastUsedAt).toISOString(),
    status: session.status,
    symbol: session.symbol,
    timeframe: session.timeframe,
    ...(detailed ? {target_id: session.targetId} : {}),
  };
}

/** Transport-independent ownership registry for logical TradingView sessions. */
export class SessionManager {
  constructor({now = () => Date.now()} = {}) {
    this.now = now;
    this.nextSessionNumber = 1;
    this.sessions = new Map();
    this.targetOwners = new Map();
  }

  create({targetId, workerLabel, symbol, timeframe} = {}) {
    validateTargetId(targetId);
    this.assertTargetAvailable(targetId);
    const timestamp = this.now();
    const session = {
      sessionId: `tv_session_${this.nextSessionNumber++}`,
      targetId,
      workerLabel: workerLabel || null,
      symbol: symbol || null,
      timeframe: timeframe || null,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      status: 'ready',
    };
    this.sessions.set(session.sessionId, session);
    this.targetOwners.set(targetId, session.sessionId);
    return {...session};
  }

  get(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`TradingView session ${sessionId} does not exist.`);
    }
    return {...session};
  }

  list({detailed = false} = {}) {
    return [...this.sessions.values()].map((session) =>
      publicSession(session, detailed));
  }

  bind(sessionId, targetId) {
    validateTargetId(targetId);
    const session = this.requireMutable(sessionId);
    const owner = this.targetOwners.get(targetId);
    if (owner && owner !== sessionId) {
      throw new Error(`CDP target ${targetId} is already assigned to ${owner}.`);
    }
    this.targetOwners.delete(session.targetId);
    session.targetId = targetId;
    session.lastUsedAt = this.now();
    session.status = 'ready';
    this.targetOwners.set(targetId, sessionId);
    return {...session};
  }

  touch(sessionId, updates = {}) {
    const session = this.requireMutable(sessionId);
    session.lastUsedAt = this.now();
    if (updates.symbol !== undefined) session.symbol = updates.symbol;
    if (updates.timeframe !== undefined) session.timeframe = updates.timeframe;
    if (updates.status !== undefined) session.status = updates.status;
    return {...session};
  }

  release(sessionId) {
    const session = this.requireMutable(sessionId);
    this.sessions.delete(sessionId);
    if (this.targetOwners.get(session.targetId) === sessionId) {
      this.targetOwners.delete(session.targetId);
    }
    return {...session, status: 'released'};
  }

  async validate(sessionId, targetExists) {
    const session = this.requireMutable(sessionId);
    if (!(await targetExists(session.targetId))) {
      session.status = 'stale';
      session.lastUsedAt = this.now();
      throw new Error('The TradingView tab assigned to this session no ' +
        'longer exists or is no longer a chart. Call tv_session_list and ' +
        'create or rebind the session.');
    }
    session.status = 'ready';
    session.lastUsedAt = this.now();
    return {...session};
  }

  async cleanStale(targetExists, {release = false} = {}) {
    const stale = [];
    for (const session of [...this.sessions.values()]) {
      if (!(await targetExists(session.targetId))) {
        session.status = 'stale';
        stale.push({...session});
        if (release) {
          this.sessions.delete(session.sessionId);
          if (this.targetOwners.get(session.targetId) === session.sessionId) {
            this.targetOwners.delete(session.targetId);
          }
        }
      }
    }
    return stale;
  }

  format(sessionId, detailed = false) {
    return publicSession(this.requireMutable(sessionId), detailed);
  }

  assertTargetAvailable(targetId) {
    const owner = this.targetOwners.get(targetId);
    if (owner) {
      throw new Error(`CDP target ${targetId} is already assigned to ${owner}.`);
    }
  }

  requireMutable(sessionId) {
    if (typeof sessionId !== 'string' ||
        !/^tv_session_[1-9][0-9]*$/.test(sessionId)) {
      throw new Error('Invalid session_id. Expected tv_session_<number>.');
    }
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`TradingView session ${sessionId} does not exist.`);
    }
    return session;
  }
}
