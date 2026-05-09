/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COCKPIT-KALENDER — DATEN-FUNDAMENT (final, Phase 1, nur Struktur)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Verbindliche CC-Plattform-Regeln (Kalender = nur Sicht, keine eigene Wahrheit,
 * keine Sonder-Datenstruktur, Rechte serverseitig, Mobil ≠ Desktop-Planung):
 * @see ./ccw-calendar-plattform-regeln.js — `KALENDER_PLATTFORM_REGELN`,
 *      `KALENDER_ERLAUBTE_KERN_QUELLEN`, `KALENDER_MERKSATZ`.
 *
 * ── 1. DATENQUELLE ───────────────────────────────────────────────────────────
 * Kalender-Events kommen über die vorgeschaltete Read-Model-Schicht (API →
 * vereinheitlichtes Feed-Format → `buildValidatedCalendarEventsFromStateSnapshot`).
 * Kein anderer Code darf Events direkt in den Kalender einschleusen.
 *
 * ── ARCHITEKTURREGEL (verbindlich) ───────────────────────────────────────────
 * Der Cockpit-Kalender rendert ausschließlich bereits vereinheitlichte
 * CalendarEvent-Objekte. Quelllogik, Statuslogik, Terminarten-Mapping und alle
 * fachlichen Entscheidungen gehören nicht in die View und nicht in den
 * Render-Code. Sie gehören ausschließlich in die vorgeschalteten
 * Mapping-/Read-Model-Schicht. Der Kalender entscheidet nichts — er zeigt nur.
 *
 * ── CLIENT-NEUTRALITÄT ───────────────────────────────────────────────────────
 * Das CalendarEvent-Schema ist client-unabhängig. Desktop, Tablet und Mobile
 * verwenden exakt dieselbe Struktur. Unterschiede dürfen ausschließlich in der
 * Darstellung (UI) entstehen, nicht im Datenmodell oder in der Logik.
 *
 * ── ERWEITERUNGEN ───────────────────────────────────────────────────────────
 * Erweiterungen des CalendarEvent-Schemas sind nur zulässig, wenn sie
 * rückwärtskompatibel sind und bestehende Felder nicht verändern. Bestehende
 * Feldnamen und ihre Bedeutung dürfen nicht geändert werden.
 *
 * ── ZEITREGEL (alle Events) ──────────────────────────────────────────────────
 * - `start` und `ende` immer ISO 8601 mit Zeitzone — kein reines Datum ohne
 *   Zeitinformation, außer die Semantik wird über `ganztag: true` abgedeckt
 *   (Mapper müssen dennoch gültige ISO-Zeitstempel liefern, z. B. Tagesanfang/-ende).
 * - `ende` muss größer oder gleich `start` sein — Events mit ungültigem
 *   Zeitfenster werden nicht übernommen.
 * - Bei `ganztag: true` darf `ende` auf denselben Kalendertag wie `start`
 *   fallen (Mapper: konsistente UTC- oder lokale Tagesgrenzen wählen).
 * - Keine gemischten Datums-/Zeitformate aus verschiedenen Quellen im Rohformat;
 *   vor Aufnahme ins Schema normalisieren.
 *
 * ── FELDREGELN (Kurz) ───────────────────────────────────────────────────────
 * - `transportQuelle`: technischer Eingang (`snapshot` | später `api`), nicht
 *   der fachliche Ursprung.
 * - `quelleSystem`: fachlicher Ursprung (`cc_intern` | `fusa`). Ist er im
 *   Phase-1-Snapshot noch nicht eindeutig ableitbar, darf ein dokumentierter
 *   Fallback verwendet werden (`FALLBACK_QUELLE_SYSTEM_PHASE1` = `cc_intern`); die
 *   Feldstruktur bleibt verbindlich.
 * - `readOnly`: Phase 1 immer `true`; darf jetzt nicht `false` sein.
 * - `auftragId`: `null` nur wenn der Termin fachlich keinen Auftragsbezug hat —
 *   nicht wenn er unbekannt ist (Unbekannt → Mapping klären, nicht `null` aus
 *   Bequemlichkeit).
 * - `projektId`: `null` nur wenn fachlich wirklich kein Projekt existiert.
 *
 * ── STATUS-MAPPING (Platzhalter, noch nicht angebunden) ───────────────────────
 * Quellsysteme liefern eigene Status-Bezeichnungen — niemals roh im Kalender
 * verwenden. Mapping-Schichten übersetzen auf CalendarEventStatus.
 *
 * TODO(cc_intern): Mapping-Tabelle Rohstatus (CC Intern) → CalendarEventStatus
 *   hier oder in dedizierter Mapper-Datei dokumentieren und implementieren,
 *   sobald die Quelle freigegeben ist.
 *
 * TODO(fusa): Mapping-Tabelle Rohstatus (FUSA) → CalendarEventStatus hier oder
 *   in dedizierter Mapper-Datei dokumentieren und implementieren, sobald die
 *   Quelle freigegeben ist.
 *
 * Unbekannte oder nicht zuordenbare Quellstatus fallen auf `problem`.
 */

/** @typedef {'cc_intern' | 'fusa'} CalendarQuelleSystem */

/** @typedef {'snapshot' | 'api'} CalendarTransportQuelle */

/**
 * Abgeschlossene Terminarten — keine freien Strings. Jede Quelle mappt auf
 * genau einen dieser Werte; `sonstiges` ist der Auffangwert.
 * @typedef {'montage'|'demontage'|'produktion'|'druck'|'plot'|'laminat'|'abnahme'|'werkstatt'|'schaden'|'kundentermin'|'lieferung'|'besichtigung'|'planung'|'intern'|'sonstiges'} CalendarEventTyp
 */

/**
 * Abgeschlossene Kalender-Status — niemals Roh-Status aus Quellsystemen.
 * @typedef {'offen'|'geplant'|'zugewiesen'|'in_arbeit'|'erledigt'|'verschoben'|'abgesagt'|'problem'} CalendarEventStatus
 */

/**
 * @typedef {'fahrzeug'|'maschine'|'auftrag'|'projekt'|'schaden'|null} CalendarObjektTyp
 */

/**
 * Einheitliches Kalender-Event (verbindlich). Alle Felder sind zu setzen;
 * `| null` bzw. `[]` nur wo explizit erlaubt.
 *
 * @typedef {object} CalendarEvent
 * @property {string} eventId — eindeutige ID
 * @property {CalendarQuelleSystem} quelleSystem — fachlicher Ursprung
 * @property {CalendarTransportQuelle} transportQuelle — technischer Eingang
 * @property {string|null} projektId — null nur wenn fachlich kein Projekt
 * @property {string|null} auftragId — null nur wenn fachlich kein Auftragsbezug
 * @property {string|null} kundeId
 * @property {string} titel
 * @property {CalendarEventTyp} typ
 * @property {CalendarEventStatus} status
 * @property {string} start — ISO 8601 mit Zeitzone
 * @property {string} ende — ISO 8601 mit Zeitzone, >= start
 * @property {boolean} ganztag
 * @property {string[]} mitarbeiterIds — leer wenn keine Zuweisung
 * @property {string|null} verantwortlichId
 * @property {CalendarObjektTyp} objektTyp
 * @property {string|null} objektId
 * @property {string|null} fahrzeugId — direkte FUSA-Referenz zusätzlich zu objektId
 * @property {string|null} standort
 * @property {boolean} readOnly — Phase 1 immer true
 */

/** 15 Terminarten inkl. sonstiges — abgeschlossen. */
export const CALENDAR_EVENT_TYPEN = Object.freeze(
  /** @type {const} */ ([
    'montage',
    'demontage',
    'produktion',
    'druck',
    'plot',
    'laminat',
    'abnahme',
    'werkstatt',
    'schaden',
    'kundentermin',
    'lieferung',
    'besichtigung',
    'planung',
    'intern',
    'sonstiges',
  ]),
);

/** @type {ReadonlySet<string>} */
export const CALENDAR_EVENT_TYP_SET = new Set(CALENDAR_EVENT_TYPEN);

/** 8 Statuswerte — abgeschlossen. Unbekannte Quellstatus → `problem`. */
export const CALENDAR_EVENT_STATUS = Object.freeze(
  /** @type {const} */ ([
    'offen',
    'geplant',
    'zugewiesen',
    'in_arbeit',
    'erledigt',
    'verschoben',
    'abgesagt',
    'problem',
  ]),
);

/** @type {ReadonlySet<string>} */
export const CALENDAR_EVENT_STATUS_SET = new Set(CALENDAR_EVENT_STATUS);

/**
 * Phase 1: wenn `quelleSystem` aus dem Snapshot nicht eindeutig ableitbar ist,
 * verwendet die Mapping-Schicht vorübergehend diesen dokumentierten Fallback
 * (anpassen, sobald Regeln festliegen).
 * @type {CalendarQuelleSystem}
 */
export const FALLBACK_QUELLE_SYSTEM_PHASE1 = 'cc_intern';

const OBJEKT_TYPEN = new Set(['fahrzeug', 'maschine', 'auftrag', 'projekt', 'schaden']);

/**
 * @param {unknown} v
 * @returns {v is string}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * @param {unknown} v
 * @returns {v is string|null}
 */
function isStringOrNull(v) {
  if (v === null) return true;
  return typeof v === 'string';
}

/**
 * @param {string} iso
 * @returns {Date|null}
 */
function parseIso(iso) {
  if (!isNonEmptyString(iso)) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {unknown} e
 * @returns {e is CalendarEvent}
 */
export function isCalendarEventShape(e) {
  return e != null && typeof e === 'object';
}

/**
 * Validiert ein CalendarEvent für Phase 1 (readOnly, Enums, Zeiten, Pflichtregeln).
 * Ungültige Events werden von Aufrufern nicht in den Kalender übernommen;
 * `filterValidCalendarEvents` protokolliert verworfene Einträge optional.
 *
 * @param {unknown} raw
 * @returns {{ ok: true, event: CalendarEvent } | { ok: false, errors: string[] }}
 */
export function validateCalendarEventPhase1(raw) {
  /** @type {string[]} */
  const errors = [];

  if (raw == null || typeof raw !== 'object') {
    return { ok: false, errors: ['Event ist kein Objekt.'] };
  }
  const e = /** @type {Record<string, unknown>} */ (raw);

  if (!isNonEmptyString(e.eventId)) errors.push('eventId fehlt oder leer.');
  if (e.quelleSystem !== 'cc_intern' && e.quelleSystem !== 'fusa') {
    errors.push('quelleSystem muss cc_intern oder fusa sein.');
  }
  if (e.transportQuelle !== 'snapshot' && e.transportQuelle !== 'api') {
    errors.push('transportQuelle muss snapshot oder api sein.');
  }
  if (e.transportQuelle === 'api') {
    errors.push('Phase 1: transportQuelle "api" ist noch nicht erlaubt.');
  }
  if (!isStringOrNull(e.projektId) || (e.projektId !== null && !isNonEmptyString(e.projektId))) {
    errors.push('projektId: null oder nicht-leerer String erwartet.');
  }
  if (!isStringOrNull(e.auftragId) || (e.auftragId !== null && !isNonEmptyString(e.auftragId))) {
    errors.push('auftragId: null oder nicht-leerer String erwartet.');
  }
  if (!isStringOrNull(e.kundeId) || (e.kundeId !== null && !isNonEmptyString(e.kundeId))) {
    errors.push('kundeId: null oder nicht-leerer String erwartet.');
  }
  if (!isNonEmptyString(e.titel)) errors.push('titel fehlt oder leer.');
  if (typeof e.typ !== 'string' || !CALENDAR_EVENT_TYP_SET.has(e.typ)) {
    errors.push('typ ist kein gültiger CalendarEventTyp.');
  }
  if (typeof e.status !== 'string' || !CALENDAR_EVENT_STATUS_SET.has(e.status)) {
    errors.push('status ist kein gültiger CalendarEventStatus.');
  }

  const ds = parseIso(/** @type {string} */ (e.start));
  const de = parseIso(/** @type {string} */ (e.ende));
  if (!ds) errors.push('start: ungültiges oder fehlendes ISO-8601 mit Zeitzone.');
  if (!de) errors.push('ende: ungültiges oder fehlendes ISO-8601 mit Zeitzone.');
  if (ds && de && de.getTime() < ds.getTime()) {
    errors.push('ende muss >= start sein.');
  }

  if (e.ganztag !== true && e.ganztag !== false) {
    errors.push('ganztag muss boolean sein.');
  }

  if (!Array.isArray(e.mitarbeiterIds) || !e.mitarbeiterIds.every(x => typeof x === 'string')) {
    errors.push('mitarbeiterIds muss ein String-Array sein.');
  }
  if (!isStringOrNull(e.verantwortlichId) || (e.verantwortlichId !== null && !isNonEmptyString(e.verantwortlichId))) {
    errors.push('verantwortlichId: null oder nicht-leerer String erwartet.');
  }

  const ot = e.objektTyp;
  if (ot !== null && (typeof ot !== 'string' || !OBJEKT_TYPEN.has(ot))) {
    errors.push('objektTyp ungültig (fahrzeug|maschine|auftrag|projekt|schaden|null).');
  }
  if (!isStringOrNull(e.objektId) || (e.objektId !== null && !isNonEmptyString(e.objektId))) {
    errors.push('objektId: null oder nicht-leerer String erwartet.');
  }
  if (!isStringOrNull(e.fahrzeugId) || (e.fahrzeugId !== null && !isNonEmptyString(e.fahrzeugId))) {
    errors.push('fahrzeugId: null oder nicht-leerer String erwartet.');
  }
  if (!isStringOrNull(e.standort) || (e.standort !== null && !isNonEmptyString(e.standort))) {
    errors.push('standort: null oder nicht-leerer String erwartet.');
  }

  if (e.readOnly !== true) {
    errors.push('Phase 1: readOnly muss true sein.');
  }

  if (ot === 'auftrag' && e.auftragId === null) {
    errors.push('Bei objektTyp "auftrag" ist auftragId fachlich Pflicht (nicht null).');
  }
  if (ot === 'projekt' && e.projektId === null) {
    errors.push('Bei objektTyp "projekt" ist projektId fachlich Pflicht (nicht null).');
  }

  if (errors.length) return { ok: false, errors };

  /** @type {CalendarEvent} */
  const event = /** @type {CalendarEvent} */ ({
    eventId: String(e.eventId).trim(),
    quelleSystem: e.quelleSystem,
    transportQuelle: e.transportQuelle,
    projektId: e.projektId === null ? null : String(e.projektId).trim(),
    auftragId: e.auftragId === null ? null : String(e.auftragId).trim(),
    kundeId: e.kundeId === null ? null : String(e.kundeId).trim(),
    titel: String(e.titel).trim(),
    typ: /** @type {CalendarEventTyp} */ (e.typ),
    status: /** @type {CalendarEventStatus} */ (e.status),
    start: String(e.start).trim(),
    ende: String(e.ende).trim(),
    ganztag: e.ganztag,
    mitarbeiterIds: e.mitarbeiterIds.map(String),
    verantwortlichId: e.verantwortlichId === null ? null : String(e.verantwortlichId).trim(),
    objektTyp: ot === null ? null : /** @type {CalendarObjektTyp} */ (ot),
    objektId: e.objektId === null ? null : String(e.objektId).trim(),
    fahrzeugId: e.fahrzeugId === null ? null : String(e.fahrzeugId).trim(),
    standort: e.standort === null ? null : String(e.standort).trim(),
    readOnly: true,
  });

  return { ok: true, event };
}

/**
 * Filtert eine Liste auf gültige CalendarEvents; verwirft ungültige und ruft optional onReject auf.
 *
 * @param {unknown[]} list
 * @param {(info: { raw: unknown, errors: string[] }) => void} [onReject]
 * @returns {CalendarEvent[]}
 */
export function filterValidCalendarEvents(list, onReject) {
  if (!Array.isArray(list)) return [];
  /** @type {CalendarEvent[]} */
  const out = [];
  for (const raw of list) {
    const r = validateCalendarEventPhase1(raw);
    if (r.ok) {
      const base = /** @type {Record<string, unknown>} */ ({ ...r.event });
      const rw = raw && typeof raw === 'object' ? /** @type {Record<string, unknown>} */ (raw) : {};
      for (const k of Object.keys(rw)) {
        if (k.startsWith('cockpit') && !Object.prototype.hasOwnProperty.call(base, k)) {
          base[k] = rw[k];
        }
      }
      out.push(/** @type {CalendarEvent} */ (base));
    } else if (typeof onReject === 'function') {
      onReject({ raw, errors: r.errors });
    } else if (typeof console !== 'undefined' && console.warn) {
      console.warn('[CalendarEvent] verworfen:', r.errors, raw);
    }
  }
  return out;
}
