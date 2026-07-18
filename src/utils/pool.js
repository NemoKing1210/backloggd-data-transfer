/**
 * Run async work over indices `0..total-1` with a fixed concurrency limit.
 * Results keep input order; cancelled runs may leave trailing slots undefined.
 *
 * @template T
 * @param {number} total
 * @param {number} concurrency
 * @param {(index: number) => Promise<T>} fn
 * @param {{ shouldCancel?: () => boolean }} [options]
 * @returns {Promise<(T | undefined)[]>}
 */
export async function mapPool(total, concurrency, fn, options = {}) {
  const size = Math.max(0, Math.floor(Number(total) || 0));
  /** @type {(T | undefined)[]} */
  const results = new Array(size);
  if (size === 0) return results;

  let next = 0;
  const limit = Math.max(1, Math.min(Math.floor(Number(concurrency) || 1), size));

  async function worker() {
    while (true) {
      if (options.shouldCancel?.()) return;
      const index = next;
      next += 1;
      if (index >= size) return;
      results[index] = await fn(index);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}

/**
 * Shared concurrency gate for nested parallel work (e.g. shelves × pages).
 *
 * @param {number} concurrency
 * @returns {<T>(fn: () => Promise<T>) => Promise<T>}
 */
export function createLimiter(concurrency) {
  const limit = Math.max(1, Math.floor(Number(concurrency) || 1));
  let active = 0;
  /** @type {(() => void)[]} */
  const waiters = [];

  /**
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  return async function runLimited(fn) {
    if (active >= limit) {
      await new Promise((resolve) => {
        waiters.push(resolve);
      });
    }
    active += 1;
    try {
      return await fn();
    } finally {
      active -= 1;
      const next = waiters.shift();
      if (next) next();
    }
  };
}
