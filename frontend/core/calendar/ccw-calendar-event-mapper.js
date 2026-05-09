/**
 * Snapshot / Kernel-Rohdaten → CalendarEvent (reine Mapping-Schicht, keine Seiteneffekte).
 */

import {
  FALLBACK_QUELLE_SYSTEM_PHASE1,
  CALENDAR_EVENT_TYP_SET,
  CALENDAR_EVENT_STATUS_SET,
} from './ccw-calendar-event-foundation.js';
import { normalizeBeklebungsterminStatus } from './fusa-beklebung-kalender.js';

/** Fester Listen-/Raster-Titel für FUSA-Beklebung im Cockpit-Kalender (Detail nutzt weiter `titel` / cockpitAuftragName). */
export const COCKPIT_FUSA_BEKLEBUNG_KALENDER_RASTER_TITEL = 'Möglicher Beklebungstermin Ruhrbahn';

/**
 * Titel für Kalender-Raster/Chips: bei FUSA-Beklebung fest laut {@link COCKPIT_FUSA_BEKLEBUNG_KALENDER_RASTER_TITEL}, sonst `titel`.
 *
 * @param {import('./ccw-calendar-event-foundation.js').CalendarEvent | null | undefined} ev
 * @returns {string}
 */
export function cockpitKalenderRasterListenTitel(ev) {
  if (!ev || typeof ev !== 'object') return '';
  const ex = /** @type {Record<string, unknown>} */ (ev);
  const o = ex.cockpitKalenderRasterTitel;
  if (typeof o === 'string' && o.trim() !== '') return o.trim();
  return ev.titel != null ? String(ev.titel).trim() : '';
}

/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */
/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEventTyp} CalendarEventTyp */
/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEventStatus} CalendarEventStatus */

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * @param {unknown} s
 * @returns {string|null}
 */
function toTrimmedString(s) {
  if (s == null) return null;
  const t = String(s).trim();
  return t === '' ? null : t;
}

/**
 * @param {...unknown} values
 * @returns {string|null}
 */
function firstNonEmptyString(...values) {
  for (const v of values) {
    const s = toTrimmedString(v);
    if (s) return s;
  }
  return null;
}

/**
 * Zeitfenster nur für das Mapping (keine Schema-Validierung).
 *
 * Regel: `start` muss nach Trimmen gesetzt und als Datum parsebar sein — sonst `null`
 * (Mapping fehlgeschlagen).
 *
 * Regel: Ist `ende` leer (fehlt oder nur Whitespace) und `start` valide → `ende` =
 * `start` + 1 Stunde.
 *
 * Ist `ende` nicht leer, aber kein parsebares Datum → `null` (Mapping fehlgeschlagen).
 * Abgleich `ende` >= `start` erfolgt nicht hier, sondern zentral in
 * `filterValidCalendarEvents` / `validateCalendarEventPhase1`.
 *
 * @param {unknown} startIso
 * @param {unknown} endIso
 * @returns {{ start: string, ende: string } | null}
 */
function normalizeStartEndIso(startIso, endIso) {
  const sRaw = toTrimmedString(startIso);
  if (!sRaw) return null;
  const ds = new Date(sRaw);
  if (Number.isNaN(ds.getTime())) return null;

  const eRaw = toTrimmedString(endIso);
  if (eRaw == null) {
    const de = new Date(ds.getTime() + ONE_HOUR_MS);
    return { start: ds.toISOString(), ende: de.toISOString() };
  }

  const de = new Date(eRaw);
  if (Number.isNaN(de.getTime())) return null;

  return { start: ds.toISOString(), ende: de.toISOString() };
}

/**
 * Mappt Quell-Typ-Strings auf CalendarEventTyp.
 * Unbekannt → 'sonstiges'.
 *
 * ── cc_intern (Büro / Auftragskontext, Rohstrings aus Snapshot & Adapter) ──
 *   montage | montagetermin | wand-montage     → montage
 *   demontage | abbau                          → demontage
 *   produktion | fabrik                        → produktion
 *   druck | digitaldruck                       → druck
 *   plot | plott                               → plot
 *   laminat                                    → laminat
 *   abnahme | abnahmetermin                    → abnahme
 *   werkstatt                                  → werkstatt
 *   schaden | prüfung                          → schaden
 *   kundentermin | kunde | before-sales        → kundentermin
 *   lieferung | liefertermin | deadline        → lieferung
 *   besichtigung                               → besichtigung
 *   planung | projekt-deadline                 → planung
 *   intern | interne                           → intern
 *
 * ── fusa (Fahrzeug-/Dispositionstypische Begriffe) ──
 *   fahrt | tour | disposition                 → lieferung
 *   reparatur | werkstatt-fusa                 → werkstatt
 *   (weitere Synonyme über includes wie oben)  → passende Zieltypen oder sonstiges
 *
 * ── Legacy-Kernel-Normalform (CcwCalendarEventTypeNorm) ──
 *   auftrag → sonstiges
 *   montage → montage
 *   schaden → schaden
 *   lieferung → lieferung
 *   projekt → planung
 *   sonstiges → sonstiges
 *
 * @param {unknown} sourceTyp
 * @returns {CalendarEventTyp}
 */
export function mapSourceTypToCalendarTyp(sourceTyp) {
  const t = String(sourceTyp ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t) return 'sonstiges';

  if (t === 'auftrag') return 'sonstiges';
  if (t === 'montage') return 'montage';
  if (t === 'schaden') return 'schaden';
  if (t === 'lieferung') return 'lieferung';
  if (t === 'projekt') return 'planung';
  if (t === 'sonstiges') return 'sonstiges';

  if (t.includes('demontage') || t.includes('abbau')) return 'demontage';
  if (t.includes('montage')) return 'montage';
  if (t.includes('produktion') || t.includes('fabrik')) return 'produktion';
  if (t.includes('plot') && !t.includes('laminat')) return 'plot';
  if (t.includes('laminat')) return 'laminat';
  if (t.includes('druck')) return 'druck';
  if (t.includes('abnahme')) return 'abnahme';
  if (t.includes('werkstatt') || t.includes('reparatur')) return 'werkstatt';
  if (t.includes('schaden') || t.includes('prüfung')) return 'schaden';
  if (t.includes('kundentermin') || t === 'kunde' || t.includes('kunden')) return 'kundentermin';
  if (t.includes('liefer') || t.includes('deadline') || t.includes('fahrt') || t.includes('tour')) {
    return 'lieferung';
  }
  if (t.includes('besichtigung')) return 'besichtigung';
  if (t.includes('planung')) return 'planung';
  if (t.includes('intern')) return 'intern';

  if (CALENDAR_EVENT_TYP_SET.has(t)) return /** @type {CalendarEventTyp} */ (t);
  return 'sonstiges';
}

/**
 * Mappt Roh-Status aus Quellsystemen auf CalendarEventStatus.
 * Unbekannt → 'problem'.
 *
 * ── cc_intern (typische Workflow-Strings) ──
 *   neu | offen | open                    → offen
 *   geplant | planned                     → geplant
 *   zugewiesen | assigned                 → zugewiesen
 *   in arbeit | in_bearbeitung | active   → in_arbeit
 *   erledigt | done | abgeschlossen       → erledigt
 *   verschoben | rescheduled              → verschoben
 *   abgesagt | storniert | cancelled      → abgesagt
 *
 * ── fusa (Disposition / Produktion) ──
 *   dispatched | unterwegs                → in_arbeit
 *   completed | ausgeliefert                → erledigt
 *   delayed                                 → verschoben
 *   (kein Treffer)                          → problem
 *
 * Phase-1-Legacy: fehlender Status (Kernel-Events) → geplant (explizite Ausnahme).
 *
 * @param {unknown} sourceStatus
 * @returns {CalendarEventStatus}
 */
export function mapSourceStatusToCalendarStatus(sourceStatus) {
  if (sourceStatus == null || sourceStatus === '') return 'geplant';
  const t = String(sourceStatus).toLowerCase().trim();
  if (!t) return 'geplant';

  if (['neu', 'offen', 'open', 'pending'].includes(t)) return 'offen';
  if (['geplant', 'planned', 'scheduled'].includes(t)) return 'geplant';
  if (['zugewiesen', 'assigned'].includes(t)) return 'zugewiesen';
  if (['in arbeit', 'in_arbeit', 'in bearbeitung', 'in_bearbeitung', 'active', 'dispatched', 'unterwegs'].includes(t)) {
    return 'in_arbeit';
  }
  if (['erledigt', 'done', 'abgeschlossen', 'completed', 'ausgeliefert', 'fertig'].includes(t)) {
    return 'erledigt';
  }
  if (['bestaetigt', 'bestätigt', 'confirmed'].includes(t)) return 'geplant';
  if (['verschoben', 'rescheduled', 'delayed', 'verlegt'].includes(t)) return 'verschoben';
  if (['abgesagt', 'storniert', 'cancelled', 'abgebrochen'].includes(t)) return 'abgesagt';

  if (CALENDAR_EVENT_STATUS_SET.has(t)) return /** @type {CalendarEventStatus} */ (t);
  return 'problem';
}

/**
 * @param {unknown} raw
 * @returns {'cc_intern'|'fusa'}
 */
function deriveQuelleSystem(raw) {
  if (raw == null || typeof raw !== 'object') return FALLBACK_QUELLE_SYSTEM_PHASE1;
  const r = /** @type {Record<string, unknown>} */ (raw);
  const q = r.quelleSystem;
  if (q === 'cc_intern' || q === 'fusa') return q;
  return FALLBACK_QUELLE_SYSTEM_PHASE1;
}

/**
 * @param {unknown} raw
 * @returns {string|null}
 */
function extractAuftragIdFromKernelId(raw) {
  const id = toTrimmedString(
    raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw).id : null,
  );
  if (!id) return null;
  /** Auch `::auftrag::uuid` (leeres/fehlendes projectId im Kern) — sonst kein auftragId → kein Drag. */
  const m = id.match(/::auftrag::(.+)$/);
  return m ? m[1].trim() || null : null;
}

/**
 * @param {unknown} raw
 * @returns {string[]}
 */
function coerceMitarbeiterIds(raw) {
  if (raw == null || typeof raw !== 'object') return [];
  const r = /** @type {Record<string, unknown>} */ (raw);
  const v = r.mitarbeiterIds;
  if (Array.isArray(v)) return v.map(x => String(x)).filter(s => s.trim() !== '');
  const names = [
    firstNonEmptyString(r.mitarbeiter),
    firstNonEmptyString(r.mitarbeiterName),
    firstNonEmptyString(r.mitarbeiter_namen),
  ].filter(Boolean);
  const arrRaw = r.mitarbeiter_namen;
  if (Array.isArray(arrRaw)) {
    for (const x of arrRaw) {
      const s = firstNonEmptyString(x);
      if (s) names.push(s);
    }
  }
  return [...new Set(names.map((s) => String(s).trim()).filter(Boolean))];
}

/**
 * Mappt ein Roh-Event (Snapshot-Zeile oder Legacy-Kernel-Event) auf die Felder des
 * `CalendarEvent`-Schemas. Gibt dieses gemappte Objekt zurück oder `null`, wenn das
 * Mapping bereits scheitert (z. B. kein valider `start`, kein `titel`).
 *
 * Die Funktion führt keine Schema-Validierung aus: `validateCalendarEventPhase1` wird
 * hier nicht aufgerufen. Die finale Prüfung aller Pflichtregeln (Enums, Zeitrelation
 * `ende` >= `start`, Phase-1-`readOnly`, …) erfolgt ausschließlich zentral über
 * `filterValidCalendarEvents` nach der Mapping-Kette.
 *
 * @param {unknown} raw
 * @returns {CalendarEvent|null}
 */
export function mapSnapshotEventToCalendarEvent(raw) {
  if (raw == null || typeof raw !== 'object') return null;
  const r = /** @type {Record<string, unknown>} */ (raw);

  const times = normalizeStartEndIso(r.start, r.ende ?? r.end);
  if (!times) return null;

  const projektIdRaw = r.projektId ?? r.projectId;
  const projektId = projektIdRaw == null || String(projektIdRaw).trim() === '' ? null : String(projektIdRaw).trim();

  const auftragIdExplicit = toTrimmedString(r.auftragId);
  const auftragId = auftragIdExplicit ?? extractAuftragIdFromKernelId(r);

  const titel =
    toTrimmedString(r.calendarPlainTitle) ??
    toTrimmedString(r.titel) ??
    toTrimmedString(r.name) ??
    toTrimmedString(r.bezeichnung) ??
    toTrimmedString(r.title);
  if (!titel) return null;

  const typ = mapSourceTypToCalendarTyp(r.typ ?? r.type);
  const quelleSystem = deriveQuelleSystem(r);
  const bekRoh = toTrimmedString(r.beklebungstermin_status);
  let status = mapSourceStatusToCalendarStatus(r.status);
  if (quelleSystem === 'fusa' && bekRoh) {
    const n = normalizeBeklebungsterminStatus(bekRoh);
    if (n === 'verschoben') status = 'verschoben';
    else if (n === 'bestaetigt' || n === 'geplant') status = 'geplant';
    else status = mapSourceStatusToCalendarStatus(r.status);
  }

  const ganztag = r.ganztag === true;
  const mitarbeiterIds = coerceMitarbeiterIds(r);
  const verantwortlichId =
    firstNonEmptyString(
      r.verantwortlichId,
      r.zustaendigId,
      r.verantwortlich,
      r.verantwortlicher,
      r.verantwortlicherName,
    ) ?? null;

  const objektTypRaw = r.objektTyp;
  let objektTyp = null;
  if (objektTypRaw === 'fahrzeug' || objektTypRaw === 'maschine' || objektTypRaw === 'auftrag') {
    objektTyp = objektTypRaw;
  } else if (objektTypRaw === 'projekt' || objektTypRaw === 'schaden') {
    objektTyp = objektTypRaw;
  }

  let objektId = toTrimmedString(r.objektId);
  const res = r.resource && typeof r.resource === 'object' ? /** @type {Record<string, unknown>} */ (r.resource) : null;
  let fahrzeugId =
    toTrimmedString(r.fahrzeugId) ??
    (objektTyp === 'fahrzeug' && objektId ? objektId : null) ??
    (res ? toTrimmedString(res.fahrzeugId) : null);

  const fzDisplay = toTrimmedString(r.calendarFahrzeugKennungen);
  if (fzDisplay) {
    fahrzeugId = null;
  }

  if (auftragId && !objektTyp) {
    objektTyp = 'auftrag';
    objektId = objektId ?? auftragId;
  }

  const kundeId = toTrimmedString(r.kundeId);
  const standort = firstNonEmptyString(r.standort, r.depot, r.ort);
  const eventId =
    toTrimmedString(r.eventId) ?? toTrimmedString(r.id) ?? `${projektId || 'p'}::${titel}::${times.start}`;

  if (projektId && eventId.endsWith('::deadline')) {
    objektTyp = 'projekt';
    objektId = objektId ?? projektId;
  }

  /** @type {Record<string, unknown>} */
  const cockpitExt = {};
  const pn = toTrimmedString(r.projektName);
  if (pn) cockpitExt.cockpitProjektName = pn;
  const auftragsNr = toTrimmedString(r.auftragsnummer);
  const ca = toTrimmedString(r.calendarPlainTitle);
  const ccSpForName = toTrimmedString(r.calendarCcInternTerminSparte);
  if (auftragsNr && (ccSpForName === 'montage' || ccSpForName === 'lieferung')) {
    cockpitExt.cockpitAuftragName = auftragsNr;
  } else if (ca) {
    cockpitExt.cockpitAuftragName = ca;
  }
  const kn = firstNonEmptyString(r.kunde_name, r.kunde, r.kundenname, r.firma, r.firmaName);
  if (kn) cockpitExt.cockpitKundeName = kn;
  const fzRaw = firstNonEmptyString(r.fahrzeug, r.fahrzeugName, r.kennzeichen);
  if (fzDisplay) cockpitExt.cockpitFahrzeugDisplay = fzDisplay;
  else if (fzRaw) cockpitExt.cockpitFahrzeugDisplay = fzRaw;
  if (quelleSystem === 'fusa' && bekRoh) cockpitExt.cockpitFusaBeklebungsterminRoh = bekRoh;

  const ccInternSparte = toTrimmedString(r.calendarCcInternTerminSparte);
  if (ccInternSparte === 'montage' || ccInternSparte === 'lieferung') {
    cockpitExt.cockpitCcInternTerminSparte = ccInternSparte;
  }

  if (quelleSystem === 'fusa' && bekRoh) {
    const nb = normalizeBeklebungsterminStatus(bekRoh);
    if (nb === 'geplant' || nb === 'bestaetigt' || nb === 'verschoben') {
      cockpitExt.cockpitKalenderRasterTitel = COCKPIT_FUSA_BEKLEBUNG_KALENDER_RASTER_TITEL;
    }
  }

  return /** @type {CalendarEvent} */ (
    /** @type {unknown} */ ({
      eventId,
      quelleSystem,
      transportQuelle: 'snapshot',
      projektId,
      auftragId: auftragId ?? null,
      kundeId: kundeId ?? null,
      titel,
      typ,
      status,
      start: times.start,
      ende: times.ende,
      ganztag,
      mitarbeiterIds,
      verantwortlichId: verantwortlichId ?? null,
      objektTyp,
      objektId: objektId ?? null,
      fahrzeugId: fahrzeugId ?? null,
      standort: standort ?? null,
      readOnly: true,
      ...cockpitExt,
    })
  );
}
