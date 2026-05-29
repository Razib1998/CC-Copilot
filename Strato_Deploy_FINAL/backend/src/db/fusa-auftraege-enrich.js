/**
 * Hilfen für GET /api/v1/fusa/auftraege: Fahrzeug-IDs aus JSON auflösen (nur echte fahrzeuge-Zeilen).
 */

/**
 * @param {unknown} raw Spalte fusa_fahrzeug_ids (JSON-Array von IDs)
 * @returns {string[]}
 */
export function parseFahrzeugIdsFromJsonColumn(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s || s === '[]') return [];
  try {
    const j = JSON.parse(s);
    if (!Array.isArray(j)) return [];
    return j.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {object[]} rows
 * @returns {string[]}
 */
export function collectAllFahrzeugIdsFromAuftragRows(rows) {
  const set = new Set();
  for (const r of rows || []) {
    for (const id of parseFahrzeugIdsFromJsonColumn(r?.fusa_fahrzeug_ids)) {
      set.add(id);
    }
  }
  return [...set];
}

/**
 * Setzt fahrzeug_anzahl (nur in DB existierende IDs) und fahrzeug_kurztext (erste Kennung + „(+N)“).
 * @param {object[]} rows
 * @param {Map<string, string>} kennungById
 */
export function attachFahrzeugFelderToFusaRows(rows, kennungById) {
  for (const r of rows || []) {
    const ordered = parseFahrzeugIdsFromJsonColumn(r?.fusa_fahrzeug_ids);
    const resolved = ordered.filter((id) => kennungById.has(id));
    const kennungen = resolved
      .map((id) => kennungById.get(id))
      .filter((k) => k != null && String(k).trim() !== '');
    const n = resolved.length;
    r.fahrzeug_anzahl = n;
    if (n === 0) {
      r.fahrzeug_kurztext = null;
    } else {
      const first = kennungen[0] != null ? String(kennungen[0]).trim() : resolved[0];
      r.fahrzeug_kurztext = n > 1 ? `${first} (+${n - 1})` : String(first);
    }
  }
}

/**
 * @param {object} row
 * @param {string[]} keys
 */
export function nullifyEmptyStringFields(row, keys) {
  if (!row || typeof row !== 'object') return;
  for (const k of keys) {
    if (row[k] != null && typeof row[k] === 'string' && row[k].trim() === '') {
      row[k] = null;
    }
  }
}
