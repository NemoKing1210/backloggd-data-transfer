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
