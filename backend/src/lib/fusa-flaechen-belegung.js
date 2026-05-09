/**
 * Flächenbezogene Auswertung bestehender fusa_belegungen (+ Auftrag fusa_extra_json).
 */

import {
  beruehrteFlaechenFuerPaket,
  FUSA_WERBEFLAECHE_IDS,
  flaechenLabelsDeutsch,
  sortFlaechenIds,
} from './fusa-paket-flaechen.js';

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
export function parseFusaExtraObjFromStr(raw) {
  if (raw == null || raw === '') return {};
  try {
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
 * Paket für eine Fahrzeugzeile: Preisposition schlägt globales `extra.paket` vor.
 *
 * @param {Record<string, unknown>} extraObj
 * @param {string} fahrzeugId
 * @param {string} [fallbackPaketGlobal]
 */
export function effektivesPaketProFahrzeug(extraObj, fahrzeugId, fallbackPaketGlobal = '') {
  const fid = String(fahrzeugId || '').trim();
  const pos = extraObj && Array.isArray(extraObj.preispositionen) ? extraObj.preispositionen : null;
  if (pos && fid) {
    const row = pos.find((p) => p && typeof p === 'object' && String(/** @type {any} */ (p).fahrzeug_id || '').trim() === fid);
    const p = row && String(/** @type {any} */ (row).paket || '').trim();
    if (p) return p;
  }
  const g = String(extraObj?.paket || fallbackPaketGlobal || '').trim();
  return g;
}

/**
 * @param {unknown} cell
 */
function parseExtraCell(cell) {
  return parseFusaExtraObjFromStr(cell);
}

/**
 * @param {Array<{
 *   fahrzeug_id?: unknown,
 *   auftrag_id?: unknown,
 *   auftrag_fusa_extra_json?: unknown,
 * }>} overlapRows Alle Zeilen, die mit dem Abfragezeitraum überlappen (SQL vorfiltert).
 * @param {string} fahrzeugId
 * @param {string|null} excludeAuftragId
 */
export function aggregiereBelegteFlaechenFuerFahrzeug(overlapRows, fahrzeugId, excludeAuftragId) {
  const vid = String(fahrzeugId || '').trim();
  /** @type {Set<string>} */
  const belegt = new Set();
  let pruefung_unsicher = false;

  for (const r of overlapRows) {
    if (String(r.fahrzeug_id || '').trim() !== vid) continue;
    const aid = r.auftrag_id != null ? String(r.auftrag_id).trim() : '';
    if (excludeAuftragId && aid === String(excludeAuftragId).trim()) continue;

    const extra = parseExtraCell(r.auftrag_fusa_extra_json);
    const pak = String(extra.paket || '').trim();
    if (!pak) {
      pruefung_unsicher = true;
      for (const f of FUSA_WERBEFLAECHE_IDS) belegt.add(f);
      continue;
    }
    const m = beruehrteFlaechenFuerPaket(pak);
    if (m.quelle === 'unbekannt') pruefung_unsicher = true;
    for (const f of m.flaechen) belegt.add(f);
  }

  const belegte_flaechen = sortFlaechenIds([...belegt]);
  const freie_flaechen = FUSA_WERBEFLAECHE_IDS.filter((f) => !belegt.has(f));
  return { belegte_flaechen, freie_flaechen, pruefung_unsicher };
}

/**
 * @param {string} requestedPaket
 * @param {{ belegte_flaechen: string[], freie_flaechen: string[], pruefung_unsicher: boolean }} bestand
 */
export function bewertePaketGegenFlaechenbestand(requestedPaket, bestand) {
  const req = beruehrteFlaechenFuerPaket(requestedPaket);
  const belegtSet = new Set(bestand.belegte_flaechen);
  /** @type {string[]} */
  const konfliktflaechen = [];
  for (const f of req.flaechen) {
    if (belegtSet.has(f)) konfliktflaechen.push(f);
  }
  const erlaubt = konfliktflaechen.length === 0;
  /** @type {string[]} */
  const hinweise = [];
  if (bestand.pruefung_unsicher) {
    hinweise.push('Teile der bestehenden Belegung sind ohne eindeutiges Paket nicht sicher prüfbar (konservativ als Vollblock behandelt).');
  }
  if (req.quelle === 'unbekannt' && requestedPaket && String(requestedPaket).trim()) {
    hinweise.push('Gewähltes Paket ist nicht im Flächen-Mapping — es wird konservativ wie eine Vollflächenbuchung behandelt.');
  }
  let konflikt_hinweis = '';
  if (!erlaubt) {
    const labs = flaechenLabelsDeutsch(sortFlaechenIds(konfliktflaechen));
    konflikt_hinweis = `${labs.join(', ')} im gewählten Zeitraum bereits belegt.`;
  } else if (bestand.pruefung_unsicher && bestand.belegte_flaechen.length > 0) {
    konflikt_hinweis =
      'Bestehende Belegung konnte nicht vollständig den Werbeflächen zugeordnet werden — bitte Daten prüfen.';
  }

  return {
    erlaubt,
    konfliktflaechen: sortFlaechenIds(konfliktflaechen),
    belegte_flaechen: bestand.belegte_flaechen,
    freie_flaechen: bestand.freie_flaechen,
    konflikt_hinweis,
    pruefung_unsicher: bestand.pruefung_unsicher,
    gewaehltes_paket_flachenmodus: req.quelle,
    hinweise_zusatz: hinweise,
  };
}

/**
 * Serverseitige Konfliktprüfung vor INSERT/UPDATE der Belegungen.
 *
 * @param {{
 *   overlapRows: Array<{ fahrzeug_id?: unknown, auftrag_id?: unknown, auftrag_fusa_extra_json?: unknown }>,
 *   fahrzeugIds: string[],
 *   fusaExtraJsonStr: string|null|undefined,
 *   excludeAuftragId?: string|null,
 *   kennungenById?: Record<string, string>,
 * }} p
 * @returns {{ ok: true } | { ok: false, code: 'BELEGUNG_KONFLIKT', message: string, konflikt: Record<string, unknown> }}
 */
export function pruefeFlaechenkonfliktNeuanlage(p) {
  const extraObj = parseFusaExtraObjFromStr(p.fusaExtraJsonStr);
  const ex = p.excludeAuftragId != null ? String(p.excludeAuftragId).trim() : '';
  const kenn = p.kennungenById && typeof p.kennungenById === 'object' ? p.kennungenById : {};

  for (const vid of p.fahrzeugIds) {
    const rowsFz = p.overlapRows.filter(
      (r) =>
        String(r.fahrzeug_id || '').trim() === vid &&
        (!ex || String(r.auftrag_id || '').trim() !== ex),
    );
    const bestand = aggregiereBelegteFlaechenFuerFahrzeug(p.overlapRows, vid, ex || null);
    const paketEff = effektivesPaketProFahrzeug(extraObj, vid, String(extraObj.paket || ''));
    const ev = bewertePaketGegenFlaechenbestand(paketEff, bestand);
    if (!ev.erlaubt) {
      const kennung = kenn[vid] && String(kenn[vid]).trim() ? String(kenn[vid]).trim() : vid;
      const labs = flaechenLabelsDeutsch(ev.konfliktflaechen);
      const msg = `Fahrzeug ${kennung}: ${labs.join(', ')} im Zeitraum bereits belegt.`;
      return {
        ok: false,
        code: 'BELEGUNG_KONFLIKT',
        message: msg,
        konflikt: {
          fahrzeug_id: vid,
          kennung,
          konfliktflaechen: ev.konfliktflaechen,
          fremd_auftrag_ids: [...new Set(rowsFz.map((r) => String(r.auftrag_id || '').trim()).filter(Boolean))],
        },
      };
    }
  }
  return { ok: true };
}
