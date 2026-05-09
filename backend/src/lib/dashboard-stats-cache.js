/**
 * In-Memory-Cache für Dashboard-Aggregate (Phase B2, TTL z. B. 30 s).
 */

/** @type {Map<string, { exp: number, val: unknown }>} */
const cache = new Map();

/**
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} factory
 * @returns {Promise<T>}
 */
export async function cachedDashboardStats(key, ttlMs, factory) {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.exp > now) {
    return /** @type {T} */ (hit.val);
  }
  const val = await factory();
  cache.set(key, { exp: now + ttlMs, val });
  return val;
}
