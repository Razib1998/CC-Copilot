/**
 * Zentrale FUSA-Verfügbarkeit je Fahrzeug (Restlaufzeit, Eigenwerbung, Ausfall/Reparatur, Flächen).
 * Flächen-Mapping bleibt in fusa-paket-flaechen / fusa-flaechen-belegung.
 */

import {
  istAusgemustert,
  istEigenwerbungFahrzeug,
  parseZuYyyymmdd,
  zeitraeumeUeberlappenInklusiv,
} from './fusa-belegung-verfuegbarkeit.js';
import {
  aggregiereBelegteFlaechenFuerFahrzeug,
  bewertePaketGegenFlaechenbestand,
  effektivesPaketProFahrzeug,
  parseFusaExtraObjFromStr,
} from './fusa-flaechen-belegung.js';
import { flaechenLabelsDeutsch, sortFlaechenIds } from './fusa-paket-flaechen.js';

/** @typedef {'RESTLAUFZEIT'|'EIGENWERBUNG'|'AUSFALL'|'FLAECHE'|'AUSGEMUSTERT'|null} FusaSperrgrundCode */

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function detailsObjFromRow(row) {
  if (!row || typeof row !== 'object') return {};
  try {
    const raw = row.details_json;
    if (raw == null || raw === '') return {};
    if (typeof raw === 'object' && !Array.isArray(raw)) {
      return /** @type {Record<string, unknown>} */ (raw);
    }
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {unknown} raw
 * @returns {string|null} YYYY-MM-DD oder null
 */
function parseDatumLoose(raw) {
  if (raw == null) return null;
  if (typeof raw === 'number' && Number.isFinite(raw)) {
    const y = Math.floor(raw);
    if (y >= 1990 && y <= 2100) return `${y}-12-31`;
  }
  const s = String(raw).trim();
  if (!s) return null;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const de = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(s);
  if (de) {
    const d = de[1].padStart(2, '0');
    const m = de[2].padStart(2, '0');
    const y = de[3];
    return `${y}-${m}-${d}`;
  }
  const y4 = /^\d{4}$/.exec(s);
  if (y4) return `${y4[0]}-12-31`;
  const n = parseZuYyyymmdd(s);
  if (n == null) return null;
  const y = Math.floor(n / 10000);
  const mo = Math.floor((n % 10000) / 100);
  const da = n % 100;
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}

/**
 * Frühestes bekanntes Einsatz-/Verfügbarkeitsende (harter Cut für Fremdwerbung).
 * @param {Record<string, unknown>} row DB-Zeile fahrzeuge
 * @returns {string|null} ISO YYYY-MM-DD
 */
export function getFahrzeugEnddatumIso(row) {
  const d = detailsObjFromRow(row);
  /** @type {string[]} */
  const cand = [];
  for (const k of ['laufzeit_bis', 'einsatz_bis', 'aktiv_bis', 'ausmusterung_am']) {
    const x = parseDatumLoose(d[k]);
    if (x) cand.push(x);
  }
  const ag = d.ausmusterung_geplant;
  const agIso = parseDatumLoose(ag);
  if (agIso) cand.push(agIso);
  if (!cand.length) return null;
  return cand.reduce((a, b) => (a < b ? a : b));
}

/**
 * @param {string} iso
 */
export function formatDatumDe(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return String(iso || '').trim();
  return `${m[3]}.${m[2]}.${m[1]}`;
}

/**
 * Fahrzeugstatus / Details: nicht für Fremdwerbe buchbar.
 */
export function fahrzeugStatusIstEigenwerbung(row) {
  const st = String(row?.status ?? '')
    .trim()
    .toLowerCase();
  return st === 'eigenwerbung' || st.includes('eigenwerbung');
}

/**
 * @param {Record<string, unknown>} extra
 */
export function fusaAuftragExtraIstEigenwerbung(extra) {
  if (!extra || typeof extra !== 'object') return false;
  if (extra.eigenwerbung === true || extra.eigenwerbung === 'true' || extra.eigenwerbung === 1) return true;
  const wt = String(extra.werbungstyp || extra.kampagne_typ || extra.kampagnen_typ || '').toLowerCase();
  if (wt.includes('eigen')) return true;
  return false;
}

/**
 * Reparatur / Schaden am Fahrzeug selbst.
 */
export function fahrzeugStatusIstAusfallOderReparatur(row) {
  const s = String(row?.status ?? '')
    .trim()
    .toLowerCase();
  return s === 'schaden' || s === 'defekt' || s === 'in_reparatur' || s.includes('reparatur');
}

/**
 * @param {Record<string, unknown>} schRow Zeile schaeden
 * @param {string} startIso
 * @param {string} endIso
 */
export function schadenBlockiertZeitraum(schRow, startIso, endIso) {
  const q0 = parseZuYyyymmdd(startIso);
  const q1 = parseZuYyyymmdd(endIso);
  if (q0 == null || q1 == null) return false;
  const st = String(schRow.status || '')
    .trim()
    .toLowerCase();
  if (st === 'geschlossen' || st === 'storniert' || st === 'abgebrochen') return false;

  const ws = String(schRow.werkstatt_status || '')
    .trim()
    .toLowerCase();
  const createdRaw = schRow.created_at;
  const created = createdRaw != null ? String(createdRaw) : '';
  const head = created.length >= 10 ? created.slice(0, 10) : created;
  const repairStartIso = parseDatumLoose(head) || parseDatumLoose(created);
  if (!repairStartIso) return false;
  const rs = parseZuYyyymmdd(repairStartIso);
  if (rs == null) return false;

  let reYmd = 99991231;
  if (ws === 'fertig' && schRow.bearbeitet_am != null) {
    const be = String(schRow.bearbeitet_am);
    const beHead = be.length >= 10 ? be.slice(0, 10) : be;
    const endRep = parseDatumLoose(beHead) || parseDatumLoose(be);
    const re = parseZuYyyymmdd(endRep || '');
    if (re != null) reYmd = re;
  }
  return zeitraeumeUeberlappenInklusiv(rs, reYmd, q0, q1);
}

/**
 * @param {Array<Record<string, unknown>>} overlapRows
 * @param {string} fahrzeugId
 * @param {string|null} excludeAuftragId
 */
export function hatUeberlappendeEigenwerbungBelegung(overlapRows, fahrzeugId, excludeAuftragId) {
  const vid = String(fahrzeugId || '').trim();
  const ex = excludeAuftragId != null ? String(excludeAuftragId).trim() : '';
  for (const r of overlapRows) {
    if (String(r.fahrzeug_id || '').trim() !== vid) continue;
    const aid = r.auftrag_id != null ? String(r.auftrag_id).trim() : '';
    if (ex && aid === ex) continue;
    const extra = parseFusaExtraObjFromStr(r.auftrag_fusa_extra_json);
    if (fusaAuftragExtraIstEigenwerbung(extra)) return true;
  }
  return false;
}

/**
 * Zentrale Prüffunktion (Reihenfolge: Restlaufzeit → Eigenwerbung → Ausfall → Flächen).
 * Typ/Depot filtert der Aufrufer vor.
 *
 * @param {Record<string, unknown>} fahrzeugRow
 * @param {string} paketEffektiv
 * @param {{ startdatum: string, enddatum: string }} zeitraum ISO
 * @param {{
 *   overlapRows: Array<Record<string, unknown>>,
 *   schaedenRows?: Array<Record<string, unknown>>,
 *   excludeAuftragId?: string|null,
 * }} ctx
 */
export function pruefeFahrzeugVerfuegbarkeit(fahrzeugRow, paketEffektiv, zeitraum, ctx) {
  const startIso = String(zeitraum.startdatum || '').trim();
  const endIso = String(zeitraum.enddatum || '').trim();
  const overlapRows = Array.isArray(ctx.overlapRows) ? ctx.overlapRows : [];
  const schaedenRows = Array.isArray(ctx.schaedenRows) ? ctx.schaedenRows : [];
  const excludeAuftragId = ctx.excludeAuftragId ?? null;
  const vid = fahrzeugRow?.id != null ? String(fahrzeugRow.id) : '';

  /** @type {string[]} */
  let konfliktflaechen = [];
  /** @type {string[]} */
  let belegte_flaechen = [];
  /** @type {string[]} */
  let freie_flaechen = [];

  const aktivBis = getFahrzeugEnddatumIso(fahrzeugRow);
  let eigenwerbung_aktiv = false;
  let ausfall_aktiv = false;

  if (istAusgemustert(fahrzeugRow)) {
    return {
      buchbar: false,
      sperrgrund_code: 'AUSGEMUSTERT',
      sperrgrund_text: 'Fahrzeug ist ausgemustert oder ausgeschieden.',
      konfliktflaechen: [],
      belegte_flaechen: [],
      freie_flaechen: [],
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv: false,
      ausfall_aktiv: false,
      flaechen_pruefung_unsicher: false,
    };
  }

  if (aktivBis && endIso && endIso > aktivBis) {
    return {
      buchbar: false,
      sperrgrund_code: 'RESTLAUFZEIT',
      sperrgrund_text: `Fahrzeug nur bis ${formatDatumDe(aktivBis)} verfügbar.`,
      konfliktflaechen: [],
      belegte_flaechen: [],
      freie_flaechen: [],
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv: false,
      ausfall_aktiv: false,
      flaechen_pruefung_unsicher: false,
    };
  }

  if (fahrzeugStatusIstEigenwerbung(fahrzeugRow) || istEigenwerbungFahrzeug(fahrzeugRow)) {
    eigenwerbung_aktiv = true;
    return {
      buchbar: false,
      sperrgrund_code: 'EIGENWERBUNG',
      sperrgrund_text: 'Fahrzeug für Eigenwerbung reserviert.',
      konfliktflaechen: [],
      belegte_flaechen: [],
      freie_flaechen: [],
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv,
      ausfall_aktiv: false,
      flaechen_pruefung_unsicher: false,
    };
  }

  if (hatUeberlappendeEigenwerbungBelegung(overlapRows, vid, excludeAuftragId)) {
    eigenwerbung_aktiv = true;
    return {
      buchbar: false,
      sperrgrund_code: 'EIGENWERBUNG',
      sperrgrund_text: 'Im Zeitraum liegt eine Eigenwerbung-Belegung auf diesem Fahrzeug.',
      konfliktflaechen: [],
      belegte_flaechen: [],
      freie_flaechen: [],
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv,
      ausfall_aktiv: false,
      flaechen_pruefung_unsicher: false,
    };
  }

  if (fahrzeugStatusIstAusfallOderReparatur(fahrzeugRow)) {
    ausfall_aktiv = true;
    return {
      buchbar: false,
      sperrgrund_code: 'AUSFALL',
      sperrgrund_text: 'Fahrzeug wegen Schaden / Reparatur nicht verfügbar.',
      konfliktflaechen: [],
      belegte_flaechen: [],
      freie_flaechen: [],
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv: false,
      ausfall_aktiv,
      flaechen_pruefung_unsicher: false,
    };
  }

  for (const s of schaedenRows) {
    if (String(s.fahrzeug_id || '').trim() !== vid) continue;
    if (schadenBlockiertZeitraum(s, startIso, endIso)) {
      ausfall_aktiv = true;
      return {
        buchbar: false,
        sperrgrund_code: 'AUSFALL',
        sperrgrund_text: 'Fahrzeug wegen Schaden / Werkstatt im Zeitraum nicht verfügbar.',
        konfliktflaechen: [],
        belegte_flaechen: [],
        freie_flaechen: [],
        fahrzeug_aktiv_bis: aktivBis,
        eigenwerbung_aktiv: false,
        ausfall_aktiv,
        flaechen_pruefung_unsicher: false,
      };
    }
  }

  const ex = excludeAuftragId != null ? String(excludeAuftragId).trim() : '';
  const bestand = aggregiereBelegteFlaechenFuerFahrzeug(overlapRows, vid, ex || null);
  belegte_flaechen = bestand.belegte_flaechen;
  freie_flaechen = bestand.freie_flaechen;
  const ev = bewertePaketGegenFlaechenbestand(paketEffektiv, bestand);
  konfliktflaechen = ev.konfliktflaechen;

  if (!ev.erlaubt) {
    const labs = flaechenLabelsDeutsch(sortFlaechenIds(konfliktflaechen));
    const sperrgrund_text = labs.length
      ? `${labs.join(', ')} im gewählten Zeitraum bereits belegt.`
      : ev.konflikt_hinweis || 'Flächenkonflikt.';
    return {
      buchbar: false,
      sperrgrund_code: 'FLAECHE',
      sperrgrund_text,
      konfliktflaechen,
      belegte_flaechen,
      freie_flaechen,
      fahrzeug_aktiv_bis: aktivBis,
      eigenwerbung_aktiv: false,
      ausfall_aktiv: false,
      flaechen_pruefung_unsicher: bestand.pruefung_unsicher,
    };
  }

  /** @type {Record<string, unknown>} */
  const okOut = {
    buchbar: true,
    sperrgrund_code: null,
    sperrgrund_text: '',
    konfliktflaechen: [],
    belegte_flaechen,
    freie_flaechen,
    fahrzeug_aktiv_bis: aktivBis,
    eigenwerbung_aktiv: false,
    ausfall_aktiv: false,
    flaechen_pruefung_unsicher: bestand.pruefung_unsicher,
  };
  if (Array.isArray(ev.hinweise_zusatz) && ev.hinweise_zusatz.length) {
    okOut.flaechen_hinweise = ev.hinweise_zusatz;
  }
  return okOut;
}

/**
 * Vor INSERT/UPDATE: alle Fahrzeuge inkl. Flächen.
 *
 * @param {{
 *   overlapRows: Array<Record<string, unknown>>,
 *   fahrzeugIds: string[],
 *   fusaExtraJsonStr: string|null|undefined,
 *   excludeAuftragId?: string|null,
 *   kennungenById?: Record<string, string>,
 *   fahrzeugRowsById: Record<string, Record<string, unknown>>,
 *   schaedenRowsAll: Array<Record<string, unknown>>,
 *   startdatum: string,
 *   enddatum: string,
 * }} p
 * @returns {{ ok: true } | { ok: false, code: string, message: string, konflikt?: Record<string, unknown> }}
 */
export function pruefeFusaBuchungVorBelegung(p) {
  const extraObj = parseFusaExtraObjFromStr(p.fusaExtraJsonStr);
  const ex = p.excludeAuftragId != null ? String(p.excludeAuftragId).trim() : '';
  const kenn = p.kennungenById && typeof p.kennungenById === 'object' ? p.kennungenById : {};
  const pid = String(p.projectId || '').trim();
  const schProject = (p.schaedenRowsAll || []).filter(
    (r) => !pid || String(r.project_id || '').trim() === pid,
  );
  const schByFz = new Map();
  for (const s of schProject) {
    const fid = String(s.fahrzeug_id || '').trim();
    if (!fid) continue;
    if (!schByFz.has(fid)) schByFz.set(fid, []);
    schByFz.get(fid).push(s);
  }

  for (const vid of p.fahrzeugIds) {
    const row = p.fahrzeugRowsById[vid];
    if (!row) {
      return {
        ok: false,
        code: 'FUSA_VERFUEGBARKEIT',
        message: `Fahrzeug "${vid}" wurde nicht gefunden.`,
        konflikt: { fahrzeug_id: vid },
      };
    }
    const paketEff = effektivesPaketProFahrzeug(extraObj, vid, String(extraObj.paket || ''));
    const v = pruefeFahrzeugVerfuegbarkeit(row, paketEff, { startdatum: p.startdatum, enddatum: p.enddatum }, {
      overlapRows: p.overlapRows,
      schaedenRows: schByFz.get(vid) || [],
      excludeAuftragId: ex || null,
    });
    if (!v.buchbar) {
      const kennung = kenn[vid] && String(kenn[vid]).trim() ? String(kenn[vid]).trim() : vid;
      const code =
        v.sperrgrund_code === 'FLAECHE' ? 'BELEGUNG_KONFLIKT' : 'FUSA_VERFUEGBARKEIT';
      const msg =
        v.sperrgrund_code === 'FLAECHE'
          ? `Fahrzeug ${kennung}: ${v.sperrgrund_text}`
          : `Fahrzeug ${kennung}: ${v.sperrgrund_text}`;
      return {
        ok: false,
        code,
        message: msg,
        konflikt: {
          fahrzeug_id: vid,
          kennung,
          sperrgrund_code: v.sperrgrund_code,
          konfliktflaechen: v.konfliktflaechen,
        },
      };
    }
  }
  return { ok: true };
}
