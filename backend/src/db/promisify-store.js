/**
 * Macht ein synchrones Store-Objekt Promise-kompatibel (gleiche API wie async MySQL-Store).
 * @param {Record<string, unknown>} syncStore
 */
export function promisifyStore(syncStore) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(syncStore)) {
    const v = syncStore[key];
    if (typeof v === 'function') {
      out[key] = (...args) => Promise.resolve(/** @type {Function} */ (v).apply(syncStore, args));
    } else {
      out[key] = v;
    }
  }
  return out;
}
