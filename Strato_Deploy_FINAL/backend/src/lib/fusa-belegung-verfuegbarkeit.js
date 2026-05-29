/**
 * Verfügbarkeit: Zeiträume, Überlappung mit bestehenden FUSA-Fahrzeugzuordnungen (fusa_fahrzeug_ids).
 * Keine eigene Belegungstabelle — Phase-2-Annahme bis persistente Belegung existiert.
 */

/**
 * @param {string|null|undefined} raw
 * @returns {number | null} YYYYMMDD als Zahl für inklusiven Vergleich
 */
export function parseZuYyyymmdd(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    const d = Number(iso[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return y * 10000 + m * 100 + d;
  }
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (de) {
    const d = Number(de[1]);
    const m = Number(de[2]);
    const y = Number(de[3]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return y * 10000 + m * 100 + d;
  }
  return null;
}

/**
 * Inklusive Überlappung auf YYYYMMDD-Zahlen.
 */
export function zeitraeumeUeberlappenInklusiv(aStart, aEnd, bStart, bEnd) {
  if (aStart == null || aEnd == null || bStart == null || bEnd == null) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

/**
 * @param {string|null|undefined} jsonStr
 * @returns {string[]}
 */
export function parseFusaFahrzeugIds(jsonStr) {
  if (jsonStr == null || String(jsonStr).trim() === '') return [];
  try {
    const a = JSON.parse(String(jsonStr));
    if (!Array.isArray(a)) return [];
    return a.map((x) => String(x).trim()).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * @param {Record<string, unknown>} row
 */
/**
 * @param {string|null|undefined} s
 * @returns {string}
 */
function normalizeText(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function detailsObj(row) {
  try {
    const raw = row?.details_json;
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return /** @type {Record<string, unknown>} */ (raw);
    }
    if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
      const o = JSON.parse(raw.toString('utf8'));
      return o && typeof o === 'object' ? o : {};
    }
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' ? o : {};
  } catch {
    return {};
  }
}

/**
 * Gleiche Informationsbasis wie die operative FUSA-Fahrzeugliste (`typeSearch` in
 * `fusa-fahrzeuge-view.js`): Spalte `typ` plus relevante `details_json`-Felder.
 *
 * @param {Record<string, unknown>} row
 * @returns {string} Kleinschreibung, zusammenhängender Suchstring
 */
export function buildFahrzeugTypHaystack(row) {
  const d = detailsObj(row);
  const typ = String(row.typ ?? '').trim();
  /** Wie `mapFahrzeugPublic`/`mapFahrzeugToViewModel`: Modell auch außerhalb von details_json möglich. */
  const modell = String(d.modell ?? row.modell ?? '').trim();
  const subExplizit = String(d.subtyp ?? row.subtyp ?? '').trim();
  /** Wie `mapFahrzeugToViewModel` (Fahrzeugliste): Subtyp fällt auf Modell zurück. */
  const subtyp = subExplizit || (modell || String(d.fahrzeugtyp ?? '').trim());
  const typKategorie = String(d.typ_kategorie ?? row.typ_kategorie ?? '').trim();
  const antrieb = String(d.antrieb ?? row.antrieb ?? '').trim();
  const hersteller = String(d.hersteller ?? row.hersteller ?? '').trim();
  const fahrzeugtyp = String(d.fahrzeugtyp ?? '').trim();
  const fahrzeugklasse = String(d.fahrzeugklasse ?? '').trim();
  const parts = [typ, subtyp, typKategorie, antrieb, hersteller, modell, fahrzeugtyp, fahrzeugklasse].filter(Boolean);
  return normalizeText(parts.join(' '));
}

/**
 * Wizard / form-meta nutzt dieselben Anzeige-Labels wie die Fahrzeugliste (z. B. „Solobus“,
 * „U-Bahn 8 Achsen“). Abgleich gegen {@link buildFahrzeugTypHaystack}, nicht nur gegen `row.typ`.
 *
 * @param {Record<string, unknown>} row
 * @param {string} fahrzeugtypLabel z. B. "Solobus", "U-Bahn 8 Achsen"
 */
export function fahrzeugPasstZuTypLabel(row, fahrzeugtypLabel) {
  const qRaw = String(fahrzeugtypLabel || '').trim();
  if (!qRaw) return true;
  const hay = buildFahrzeugTypHaystack(row);
  const ql = normalizeText(qRaw);
  if (!hay) return false;
  if (hay.includes(ql)) return true;
  const hayCompact = hay.replace(/\s/g, '');
  const qlCompact = ql.replace(/\s/g, '');
  if (qlCompact.length >= 3 && hayCompact.includes(qlCompact)) return true;

  /**
   * Fahrzeugliste (`fusa-fahrzeuge-view.js`, FZ_TYP_FILTERS): pro Typ genügt ein Alias-Token
   * in `data-type-text` — gleiche Idee für Wizard-Label (form-meta = Anzeigelabel).
   */
  if (ql.includes('stadtbahn')) {
    return hay.includes('stadtbahn');
  }
  if (ql.includes('u-bahn') || ql.includes('ubahn') || ql.includes('u bahn')) {
    return hay.includes('u-bahn') || hay.includes('ubahn');
  }
  if (ql.includes('gelenk')) {
    return hay.includes('gelenk');
  }
  if (ql.includes('solobus') || (ql.includes('solo') && !ql.includes('gelenk'))) {
    return hay.includes('solobus') || hay.includes('solo');
  }

  const tokens = ql.split(/[\s/|,_-]+/).filter((t) => t.length >= 2);
  return tokens.some((t) => hay.includes(t));
}

/**
 * @param {Record<string, unknown>} row
 * @param {string} depotName
 */
/**
 * Standort-/Depot-Felder wie in Stammdaten üblich; Abgleich mit Fahrzeugliste (Depot-Anzeige aus
 * depot, sonst standort). Kein Match, wenn alle Kandidaten leer sind und ein Depotfilter gesetzt ist.
 *
 * @param {Record<string, unknown>} d details_json
 * @returns {string[]}
 */
function depotStandortKandidaten(d) {
  const keys = [
    'depot',
    'standort',
    'depot_name',
    'standort_name',
    'werkstatt',
    'werkstatt_label',
    'depot_label',
    'standort_label',
  ];
  /** @type {string[]} */
  const out = [];
  for (const k of keys) {
    const v = d[k];
    if (v == null) continue;
    const t = String(v).trim();
    if (t) out.push(t);
  }
  return out;
}

/**
 * Depot-/Standort-Anzeige wie FUSA-Fahrzeugliste: `details_json.depot`, sonst `standort`,
 * plus optionale Top-Level-Felder (falls Zeilen angereichert wurden).
 *
 * @param {Record<string, unknown>} row
 * @returns {string|null}
 */
export function fahrzeugDepotAnzeige(row) {
  const d = detailsObj(row);
  const dep = d.depot != null && String(d.depot).trim() !== '' ? String(d.depot).trim() : '';
  if (dep) return dep;
  const st = d.standort != null && String(d.standort).trim() !== '' ? String(d.standort).trim() : '';
  if (st) return st;
  if (row.depot != null && String(row.depot).trim() !== '') return String(row.depot).trim();
  if (row.standort != null && String(row.standort).trim() !== '') return String(row.standort).trim();
  return null;
}

export function fahrzeugPasstZuDepot(row, depotName) {
  const q = String(depotName || '').trim();
  /** Ohne Depot-Filter keine Zuordnung (Verfügbarkeits-API verlangt explizites Depot). */
  if (!q) return false;
  const d = detailsObj(row);
  /** @type {string[]} */
  const kandidaten = [...depotStandortKandidaten(d)];
  for (const raw of [row.depot, row.standort]) {
    if (raw == null) continue;
    const t = String(raw).trim();
    if (t) kandidaten.push(t);
  }
  const seen = new Set();
  const uniq = kandidaten.filter((t) => {
    const k = t.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  /** Mit gesetztem Depotfilter: ohne belastbaren Standort keine Zuordnung (kein „leer passt immer“). */
  if (uniq.length === 0) return false;
  const ql = q.toLowerCase();
  for (const dep of uniq) {
    const dl = dep.toLowerCase();
    if (dl === ql || dl.includes(ql) || ql.includes(dl)) return true;
  }
  return false;
}

/**
 * Eigenwerbung-Fahrzeuge nicht für Fremdwerbe-Aufträge vorschlagen.
 * @param {Record<string, unknown>} row
 */
export function istEigenwerbungFahrzeug(row) {
  const d = detailsObj(row);
  return d.eigenwerbung === true || d.eigenwerbung === 'true' || d.eigenwerbung === 1;
}

/**
 * @param {Record<string, unknown>} row
 */
export function istAusgemustert(row) {
  const st = String(row.status ?? '').trim().toLowerCase();
  return st === 'ausgemustert' || st === 'ausgeschieden';
}

/**
 * @param {Array<{ id?: string, fusa_fahrzeug_ids?: string, termin?: string, termin_ende?: string }>} auftragRows
 * @param {string} vehicleId
 * @param {number} queryStartYmd
 * @param {number} queryEndYmd
 * @returns {{ belegt: boolean, auftrag_id?: string }}
 */
/**
 * Blockierende Zeilen aus fusa_belegungen (status aktiv/reserviert), Datumsspalten ISO YYYY-MM-DD.
 * @param {Array<{ fahrzeug_id?: string, auftrag_id?: string, startdatum?: string, enddatum?: string, status?: string }>} rows
 * @param {string} vehicleId
 * @param {string} startIso YYYY-MM-DD
 * @param {string} endIso YYYY-MM-DD
 * @returns {{ belegt: boolean, auftrag_id?: string }}
 */
export function fahrzeugBelegtNachFusaBelegungRows(rows, vehicleId, startIso, endIso) {
  const vid = String(vehicleId || '').trim();
  if (!vid) return { belegt: false };
  const qs = String(startIso || '').trim();
  const qe = String(endIso || '').trim();
  if (!qs || !qe) return { belegt: false };
  for (const r of rows) {
    if (String(r.fahrzeug_id || '').trim() !== vid) continue;
    const st = String(r.status || '').toLowerCase();
    if (st !== 'aktiv' && st !== 'reserviert') continue;
    const rs = String(r.startdatum || '').trim();
    const re = String(r.enddatum || '').trim();
    if (!rs || !re) continue;
    if (rs <= qe && re >= qs) {
      return { belegt: true, auftrag_id: r.auftrag_id != null ? String(r.auftrag_id) : undefined };
    }
  }
  return { belegt: false };
}

export function fahrzeugBelegtInZeitraum(auftragRows, vehicleId, queryStartYmd, queryEndYmd) {
  const vid = String(vehicleId || '').trim();
  if (!vid) return { belegt: false };
  for (const row of auftragRows) {
    const ids = parseFusaFahrzeugIds(row.fusa_fahrzeug_ids);
    if (!ids.includes(vid)) continue;
    const t0 = parseZuYyyymmdd(row.termin);
    const t1 = parseZuYyyymmdd(row.termin_ende) ?? t0;
    if (t0 == null) continue;
    const aStart = t0;
    const aEnd = t1 ?? t0;
    if (zeitraeumeUeberlappenInklusiv(aStart, aEnd, queryStartYmd, queryEndYmd)) {
      return { belegt: true, auftrag_id: row.id != null ? String(row.id) : undefined };
    }
  }
  return { belegt: false };
}
