/**
 * Zentrale UI-Zuordnung für FUSA-Schäden (Liste, KPI, Filter, Badges).
 * Mappt API-Felder aus `GET /schaeden` inkl. extra_json-Felder.
 *
 * @module fusa-schaden-ui-status
 */

/** API-Meldungsstatus (Backend `SCHAEDEN_STATUS`). */
const MELDUNG_SET = new Set(['offen', 'in_bearbeitung', 'erledigt']);

/** API-Werkstattstatus. */
const WS_SET = new Set(['offen', 'in_arbeit', 'fertig']);

/** Schadentyp (extra_json.typ). */
const TYP_SET = new Set(['Eigenschaden', 'Fremdschaden', 'Unklar']);

/** Priorität (extra_json.prioritaet). */
const PRIO_SET = new Set(['normal', 'dringend']);

/** Abrechnungsstatus (extra_json.abrechnung_status). */
const ABRECHNUNG_SET = new Set(['ausstehend', 'zur_abrechnung', 'abgerechnet']);

/** Alt-FUSA Abrechnung (`abrechnung_legacy`). */
const ABRECHNUNG_LEGACY_SET = new Set([
  'nicht',
  'potenziell',
  'klaerung',
  'vormerken',
  'erstellt',
  'versendet',
  'bezahlt',
]);

const KLAERUNG_SET = new Set(['offen', 'in_klaerung', 'geklaert']);

const REPARATUR_PHASE_SET = new Set(['geplant', 'termin_gesendet', 'termin_vorschlag', 'termin_bestaetigt', 'in_reparatur', 'reparatur_abgeschlossen']);

/**
 * @param {unknown} st
 */
export function normalizeSchadenMeldungStatus(st) {
  const s = String(st ?? '')
    .trim()
    .toLowerCase();
  return MELDUNG_SET.has(s) ? s : 'offen';
}

/**
 * @param {unknown} st
 */
export function normalizeSchadenWerkstattStatus(st) {
  const s = String(st ?? '')
    .trim()
    .toLowerCase();
  return WS_SET.has(s) ? s : 'offen';
}

/**
 * @param {unknown} st
 */
export function schadenMeldungLabel(st) {
  const k = normalizeSchadenMeldungStatus(st);
  if (k === 'offen') return 'Offen';
  if (k === 'in_bearbeitung') return 'In Bearbeitung';
  if (k === 'erledigt') return 'Erledigt';
  return String(st ?? '').trim() || '—';
}

/**
 * @param {unknown} st
 */
export function schadenWerkstattLabel(st) {
  const k = normalizeSchadenWerkstattStatus(st);
  if (k === 'offen') return 'Offen';
  if (k === 'in_arbeit') return 'In Arbeit';
  if (k === 'fertig') return 'Fertig';
  return String(st ?? '').trim() || '—';
}

/**
 * Badge-Klasse `bdg b*` (FUSA_UMZUG / fusa.css — gleiche Semantik wie Aufträge/Fahrzeuge).
 * @param {unknown} st
 */
export function schadenMeldungBadgeClass(st) {
  const k = normalizeSchadenMeldungStatus(st);
  if (k === 'erledigt') return 'bg';
  if (k === 'in_bearbeitung') return 'ba';
  if (k === 'offen') return 'bb';
  return 'bgr';
}

/**
 * @param {unknown} st
 */
export function schadenWerkstattBadgeClass(st) {
  const k = normalizeSchadenWerkstattStatus(st);
  if (k === 'fertig') return 'bg';
  if (k === 'in_arbeit') return 'ba';
  if (k === 'offen') return 'bgr';
  return 'bgr';
}

// ── Typ ────────────────────────────────────────────────────────────

/** @param {unknown} t */
export function normalizeSchadenTyp(t) {
  const s = String(t ?? '').trim();
  return TYP_SET.has(s) ? s : '';
}

/** @param {unknown} t */
export function schadenTypLabel(t) {
  const k = String(t ?? '').trim();
  if (k === 'Eigenschaden') return 'Eigenschaden';
  if (k === 'Fremdschaden') return 'Fremdschaden';
  if (k === 'Unklar') return 'Unklar / Prüfung';
  return '—';
}

/** @param {unknown} t */
export function schadenTypBadgeClass(t) {
  const k = String(t ?? '').trim();
  if (k === 'Eigenschaden') return 'ba';   // amber
  if (k === 'Fremdschaden') return 'bt';   // teal
  if (k === 'Unklar') return 'bp';         // purple
  return 'bgr';                             // grau
}

// ── Priorität ─────────────────────────────────────────────────────

/** @param {unknown} p */
export function normalizeSchadenPriorisierung(p) {
  const s = String(p ?? '').trim().toLowerCase();
  return PRIO_SET.has(s) ? s : 'normal';
}

/** @param {unknown} p */
export function schadenDringendLabel(p) {
  return normalizeSchadenPriorisierung(p) === 'dringend' ? '🔴 Dringend' : '';
}

// ── Abrechnungsstatus ─────────────────────────────────────────────

/** @param {unknown} a */
export function normalizeAbrechnungStatus(a) {
  const s = String(a ?? '').trim();
  return ABRECHNUNG_SET.has(s) ? s : 'ausstehend';
}

/** @param {unknown} a */
export function abrechnungLabel(a) {
  const k = normalizeAbrechnungStatus(a);
  if (k === 'zur_abrechnung') return 'Zur Abrechnung';
  if (k === 'abgerechnet') return 'Abgerechnet';
  return 'Ausstehend';
}

/** @param {unknown} a */
export function abrechnungBadgeClass(a) {
  const k = normalizeAbrechnungStatus(a);
  if (k === 'abgerechnet') return 'bg';       // grün
  if (k === 'zur_abrechnung') return 'ba';    // amber
  return 'bgr';                               // grau
}

// ── Alt-Abrechnung (7 Stufen) ───────────────────────────────────

/** @param {unknown} a */
export function normalizeAbrechnungLegacy(a) {
  const s = String(a ?? '').trim();
  return ABRECHNUNG_LEGACY_SET.has(s) ? s : '';
}

/** @param {unknown} a */
export function abrechnungLegacyLabel(a) {
  const k = normalizeAbrechnungLegacy(a);
  if (k === 'nicht') return 'Nicht abrechenbar';
  if (k === 'potenziell') return 'Potenziell abrechenbar';
  if (k === 'klaerung') return 'In Klärung';
  if (k === 'vormerken') return 'Zur Rechnung ✱';
  if (k === 'erstellt') return 'Rechnung erstellt';
  if (k === 'versendet') return 'Rechnung versendet';
  if (k === 'bezahlt') return 'Bezahlt ✓';
  return '—';
}

/** @param {unknown} a */
export function abrechnungLegacyBadgeClass(a) {
  const k = normalizeAbrechnungLegacy(a);
  if (k === 'bezahlt') return 'bg';
  if (k === 'vormerken') return 'bp';
  if (k === 'erstellt' || k === 'versendet') return 'ba';
  if (k === 'klaerung' || k === 'potenziell') return 'ba';
  if (k === 'nicht') return 'bgr';
  return 'bgr';
}

/**
 * Anzeige-Abrechnung: bevorzugt Alt-`abrechnung_legacy`, sonst API-Tristatus.
 * @param {Record<string, unknown>} o
 */
export function schadenAbrechnungDisplayFromRow(o) {
  const leg = normalizeAbrechnungLegacy(o.abrechnung_legacy);
  if (leg) {
    return {
      key: leg,
      label: abrechnungLegacyLabel(leg),
      badgeClass: abrechnungLegacyBadgeClass(leg),
    };
  }
  const tri = normalizeAbrechnungStatus(o.abrechnung_status);
  return {
    key: tri,
    label: abrechnungLabel(tri),
    badgeClass: abrechnungBadgeClass(tri),
  };
}

/**
 * Filter-Schlüssel wie Alt `sdAbrFilter` (abr), inkl. Fallback aus Tristatus.
 * @param {Record<string, unknown>} o
 */
export function schadenAbrechnungFilterKey(o) {
  if (!o || typeof o !== 'object') return '';
  const leg = normalizeAbrechnungLegacy(o.abrechnung_legacy);
  if (leg) return leg;
  const tri = normalizeAbrechnungStatus(o.abrechnung_status);
  if (tri === 'abgerechnet') return 'bezahlt';
  if (tri === 'zur_abrechnung') return 'vormerken';
  return '';
}

// ── Klärung ─────────────────────────────────────────────────────

/** @param {unknown} k */
export function normalizeKlaerung(k) {
  const s = String(k ?? '').trim();
  return KLAERUNG_SET.has(s) ? s : 'offen';
}

/** @param {unknown} k */
export function klaerungLabel(k) {
  const x = normalizeKlaerung(k);
  if (x === 'in_klaerung') return 'In Klärung';
  if (x === 'geklaert') return 'Geklärt';
  return 'Offen';
}

// ── Reparatur (Alt-Reparaturstatus-Spalte) ─────────────────────

/** @param {unknown} p */
export function normalizeReparaturPhase(p) {
  const s = String(p ?? '').trim();
  return REPARATUR_PHASE_SET.has(s) ? s : 'geplant';
}

/**
 * Filter-Schlüssel wie Alt `sdFilter`: dringend | geplant | anfrage | inarbeit | behoben
 * @param {Record<string, unknown>} o
 */
export function schadenReparaturFilterKey(o) {
  if (!o || typeof o !== 'object') return '';
  const st = normalizeSchadenMeldungStatus(o.status);
  const ws = normalizeSchadenWerkstattStatus(o.werkstatt_status);
  if (st === 'erledigt' || ws === 'fertig') return 'behoben';
  const prio = normalizeSchadenPriorisierung(o.prioritaet);
  if (prio === 'dringend') return 'dringend';
  const phase = normalizeReparaturPhase(o.reparatur_phase);
  if (phase === 'reparatur_abgeschlossen') return 'behoben';
  if (phase === 'termin_gesendet' || phase === 'termin_vorschlag') return 'anfrage';
  if (ws === 'in_arbeit' || phase === 'in_reparatur') return 'inarbeit';
  return 'geplant';
}

/**
 * @param {Record<string, unknown>} o
 */
export function schadenReparaturDisplayFromRow(o) {
  if (!o || typeof o !== 'object') return { label: '—', badgeClass: 'bgr' };
  const st = normalizeSchadenMeldungStatus(o.status);
  const ws = normalizeSchadenWerkstattStatus(o.werkstatt_status);
  if (st === 'erledigt' || ws === 'fertig') return { label: 'Behoben', badgeClass: 'bg' };
  const prio = normalizeSchadenPriorisierung(o.prioritaet);
  if (prio === 'dringend') return { label: 'Dringend', badgeClass: 'br' };
  const phase = normalizeReparaturPhase(o.reparatur_phase);
  if (phase === 'reparatur_abgeschlossen') return { label: 'Behoben', badgeClass: 'bg' };
  if (phase === 'termin_gesendet') return { label: 'Terminanfrage gesendet', badgeClass: 'bb' };
  if (phase === 'termin_vorschlag') return { label: 'Neuer Termin vorgeschlagen', badgeClass: 'ba' };
  if (phase === 'termin_bestaetigt') return { label: 'Termin bestätigt ✓', badgeClass: 'bg' };
  if (ws === 'in_arbeit' || phase === 'in_reparatur') return { label: 'In Bearbeitung', badgeClass: 'bb' };
  return { label: 'Reparatur geplant', badgeClass: 'ba' };
}

/**
 * Alt-Typ-Filter `eigen|fremd|unklar` aus API-Typ.
 * @param {unknown} typ
 */
export function schadenTypFilterKey(typ) {
  const t = String(typ ?? '').trim();
  if (t === 'Eigenschaden') return 'eigen';
  if (t === 'Fremdschaden') return 'fremd';
  if (t === 'Unklar') return 'unklar';
  return '';
}

/**
 * KPI-Zähler für die Listenansicht — inkl. neue Referenz-KPIs.
 * @param {object[]} rows
 */
export function schadenKpisFromRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  let offen = 0;
  let inBearbeitung = 0;
  let erledigt = 0;
  let wsOffen = 0;
  let dringend = 0;
  let unklar = 0;
  let fremdschaden = 0;
  let eigenschaden = 0;
  let zurAbrechnung = 0;
  for (const r of list) {
    if (!r || typeof r !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (r);
    const m = normalizeSchadenMeldungStatus(o.status);
    if (m === 'offen') offen += 1;
    else if (m === 'in_bearbeitung') inBearbeitung += 1;
    else if (m === 'erledigt') erledigt += 1;
    const w = normalizeSchadenWerkstattStatus(o.werkstatt_status);
    if (w === 'offen') wsOffen += 1;
    // Neue Felder
    const prio = normalizeSchadenPriorisierung(o.prioritaet);
    if (prio === 'dringend') dringend += 1;
    const typ = String(o.typ ?? '').trim();
    if (typ === 'Unklar') unklar += 1;
    if (typ === 'Fremdschaden') fremdschaden += 1;
    if (typ === 'Eigenschaden') eigenschaden += 1;
    const leg = normalizeAbrechnungLegacy(o.abrechnung_legacy);
    if (leg && ['vormerken', 'klaerung', 'potenziell'].includes(leg)) zurAbrechnung += 1;
    else if (!leg) {
      const abrRaw = o.abrechnung_status ?? o.abrechnungStatus;
      const abr = normalizeAbrechnungStatus(abrRaw);
      if (abr === 'zur_abrechnung') zurAbrechnung += 1;
    }
  }
  return { offen, inBearbeitung, erledigt, wsOffen, dringend, unklar, fremdschaden, eigenschaden, zurAbrechnung, total: list.length };
}

/**
 * Haystack für Freitextfilter (Kleinbuchstaben).
 * @param {object} s
 */
export function schadenRowSearchHaystack(s) {
  if (!s || typeof s !== 'object') return '';
  const o = /** @type {Record<string, unknown>} */ (s);
  const parts = [
    o.id,
    o.titel,
    o.beschreibung,
    o.fahrzeug_kennung,
    o.fahrzeug_id,
    o.status,
    o.werkstatt_status,
    o.typ,
    o.prioritaet,
    o.abrechnung_status,
    o.abrechnung_legacy,
    o.wiedervorlage,
    o.melder_name,
    o.klaerung,
    o.verursacher,
    o.fremd_art,
    o.haftung_notiz,
    o.interne_notiz,
    o.reparatur_phase,
    o.linked_auftrag_id,
    o.meldedatum,
    o.created_at,
    o.bearbeitet_von,
    o.bearbeitet_am,
  ]
    .map(x => (x == null ? '' : String(x)))
    .join(' ');
  return parts.toLowerCase();
}
