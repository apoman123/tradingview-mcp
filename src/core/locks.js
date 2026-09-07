/** A small FIFO async mutex. */
export class Mutex {
  constructor() {
    this.tail = Promise.resolve();
    this.pending = 0;
  }

  /** Runs one operation after all previously queued operations complete. */
  async runExclusive(operation) {
    this.pending++;
    const previous = this.tail;
    let release;
    this.tail = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      this.pending--;
      release();
    }
  }

  get isIdle() {
    return this.pending === 0;
  }
}

/** Maintains independent mutexes for independent resource keys. */
export class KeyedMutex {
  constructor() {
    this.mutexes = new Map();
  }

  /** Serializes work for one key without blocking work for another key. */
  async runExclusive(key, operation) {
    let mutex = this.mutexes.get(key);
    if (!mutex) {
      mutex = new Mutex();
      this.mutexes.set(key, mutex);
    }
    try {
      return await mutex.runExclusive(operation);
    } finally {
      if (mutex.isIdle && this.mutexes.get(key) === mutex) {
        this.mutexes.delete(key);
      }
    }
  }
}

export const shellMutex = new Mutex();
export const targetMutexes = new KeyedMutex();
export const accountMutex = new Mutex();
