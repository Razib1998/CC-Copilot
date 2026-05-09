/**
 * Offizieller Kundennummernkreis: KD-{Jahr}-{laufende 4-stellige Nummer}, z. B. KD-2026-0001.
 * Alt-Nummern (`altnummer`) sind separat und ersetzen diese Nummer nie.
 */

/**
 * @param {number} year
 * @param {Iterable<string|null|undefined>} existingValues
 * @returns {string}
 */
export function computeNextSystemKundennummer(year, existingValues) {
  const prefix = `KD-${year}-`;
  let max = 0;
  for (const v of existingValues) {
    const s = v != null ? String(v).trim() : '';
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    const n = parseInt(tail, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

/**
 * @param {unknown} e
 * @returns {boolean}
 */
export function isUniqueConstraintError(e) {
  if (!e || typeof e !== 'object') return false;
  const code = /** @type {{ code?: string }} */ (e).code;
  if (code === 'ER_DUP_ENTRY' || code === 'SQLITE_CONSTRAINT_UNIQUE') return true;
  const msg = e instanceof Error ? e.message : String(e);
  return /UNIQUE constraint failed/i.test(msg) || /Duplicate entry/i.test(msg);
}
