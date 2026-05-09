/**
 * Zentrale Kunden-/Firmen-Detail-Aufbereitung (eine Quelle: firmen + optionale Extras).
 * Keine zweite Kunden-Tabelle — nur Mapping für API-Antworten.
 */

/** @type {readonly string[]} */
const ZUSATZ_KEYS_FROM_ERWEITERUNG = Object.freeze([
  'ansprechpartner_funktion',
  'branche',
  'letzter_kontakt',
  'naechste_aktion',
  'umsatz',
  'auftragsvolumen',
  'fahrzeuge',
]);

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function parseErweiterungJsonLoose(raw) {
  if (raw == null || String(raw).trim() === '') return {};
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * Optionale Zusatzfelder aus erweiterung_json (nur wenn vorhanden, keine Defaults).
 * @param {Record<string, unknown>} ex
 * @returns {Record<string, unknown>}
 */
export function pickErweiterungZusatzFelder(ex) {
  if (!ex || typeof ex !== 'object') return {};
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const k of ZUSATZ_KEYS_FROM_ERWEITERUNG) {
    if (!Object.prototype.hasOwnProperty.call(ex, k)) continue;
    const v = ex[k];
    if (v == null) continue;
    if (typeof v === 'string' && v.trim() === '') continue;
    out[k] = v;
  }
  return out;
}

/**
 * @param {object|null|undefined} row — Zeile aus getFirmaKundeStammById (firmen + joins)
 * @returns {{
 *   stamm: Record<string, unknown>,
 *   erweiterung_zusatz: Record<string, unknown>,
 *   fusa_extra: { segment: string|null, hinweis: string|null },
 *   ccintern_extra: { crm_status: string|null, betreuer: string|null, updated_at: string|null },
 *   aktivitaeten: unknown[],
 * }}
 */
export function buildKundenStammDetailEnvelope(row) {
  if (!row || typeof row !== 'object') {
    return {
      stamm: {},
      erweiterung_zusatz: {},
      fusa_extra: { segment: null, hinweis: null },
      ccintern_extra: { crm_status: null, betreuer: null, updated_at: null },
      aktivitaeten: [],
    };
  }
  const ex = parseErweiterungJsonLoose(row.erweiterung_json);
  const zusatz = pickErweiterungZusatzFelder(ex);
  return {
    stamm: {
      id: row.id ?? null,
      name: row.name ?? null,
      kundennummer: row.kundennummer ?? null,
      altnummer: row.altnummer ?? null,
      typ: row.typ ?? null,
      intern_extern: row.intern_extern ?? null,
      status: row.status ?? null,
      strasse: row.strasse ?? null,
      plz: row.plz ?? null,
      stadt: row.stadt ?? null,
      telefon: row.telefon ?? null,
      email: row.email ?? null,
      ansprechpartner_anrede: row.ansprechpartner_anrede ?? null,
      ansprechpartner_nachname: row.ansprechpartner_nachname ?? null,
    },
    erweiterung_zusatz: zusatz,
    fusa_extra: {
      segment: row.fusa_segment != null ? String(row.fusa_segment) : null,
      hinweis: row.fusa_hinweis != null ? String(row.fusa_hinweis) : null,
    },
    ccintern_extra: {
      crm_status: row.ccintern_crm_status != null ? String(row.ccintern_crm_status) : null,
      betreuer: row.ccintern_betreuer != null ? String(row.ccintern_betreuer) : null,
      updated_at: row.ccintern_extra_updated_at != null ? String(row.ccintern_extra_updated_at) : null,
    },
    aktivitaeten: [],
  };
}
