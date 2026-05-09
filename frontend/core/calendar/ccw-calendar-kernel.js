/**

 * Plattform-Kalenderkern (Phase 5C) — gemeinsame Event-Struktur und Normalisierung.

 * Kein eigener State, keine Sync-Logik: reine Bausteine für Ports (FUSA, CC Intern, Cockpit).

 *

 * Später: dieselben Typen für API + optionale Anbindung Outlook/Graph (`externalSync` nur Metadaten).

 */



import {
  kalenderBerlinDateOnlyNeutralSlotUtcMs,
} from './ccw-calendar-event-filter.js';

/** @typedef {'auftrag'|'montage'|'schaden'|'lieferung'|'projekt'|'sonstiges'} CcwCalendarEventTypeNorm */



/**

 * @typedef {object} CcwCalendarEventResource

 * @property {string} [fahrzeugId]

 * @property {string} [mitarbeiterId]

 */



/**

 * Einheitliches Kalender-Event (Anzeige + späterer API-/Sync-Export).

 *

 * @typedef {object} CcwCalendarEvent

 * @deprecated Wird abgelöst durch `CalendarEvent` aus `ccw-calendar-event-foundation.js` nach vollständiger Mapping-Umstellung. Die Pipeline mappt validierte `CalendarEvent`-Daten vor der View auf dieses kompatible DTO.

 * @property {string} id — stabil pro Quelle (Demo + API müssen konsistent bleiben)

 * @property {string} title

 * @property {string} start — ISO 8601 (UTC empfohlen ab API)

 * @property {string} end — ISO 8601

 * @property {CcwCalendarEventTypeNorm} type

 * @property {string} projectId

 * @property {CcwCalendarEventResource} [resource]

 * @property {{ provider: 'outlook'|'microsoft365'|'google', externalId?: string, lastSyncedAt?: string }} [externalSync]

 *   Reserviert für spätere ICS/Graph-Synchronisation — nie in Demo befüllen.

 */



/** Demo-/UI-Konstanten (keine Rechte) */

export const CCW_CALENDAR_EVENT_TYPES = Object.freeze({

  AUFTRAG: /** @type {const} */ ('auftrag'),

  MONTAGE: /** @type {const} */ ('montage'),

  SCHADEN: /** @type {const} */ ('schaden'),

  LIEFERUNG: /** @type {const} */ ('lieferung'),

  PROJEKT: /** @type {const} */ ('projekt'),

  SONSTIGES: /** @type {const} */ ('sonstiges'),

});



const DEFAULT_DURATION_MS = 60 * 60 * 1000;



/**

 * Einheitliches Einlesen von Kalenderdaten (read-only Mapping):

 * - TT.MM.JJJJ (nur Datum) → neutraler Anzeige-Slot 09:00 Europe/Berlin (kein UTC-Tageswechsel)

 * - YYYY-MM-DD (nur Datum) → derselbe Berlin-Slot

 * - Sonst ISO-kompatibel via Date (inkl. Zeitzonen / Uhrzeit)

 *

 * @param {string | number | Date | null | undefined} s

 * @returns {Date | null}

 */

export function parseCalendarDateToDate(s) {

  if (s == null || s === '') return null;

  if (s instanceof Date) {

    return Number.isNaN(s.getTime()) ? null : s;

  }

  if (typeof s === 'number' && Number.isFinite(s)) {

    if (s === 0) return null;

    const d = new Date(s);

    return Number.isNaN(d.getTime()) ? null : d;

  }

  const raw = String(s).trim();

  if (raw === '') return null;



  const mDe = raw.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (mDe) {

    const d = +mDe[1];

    const mo = +mDe[2];

    const y = +mDe[3];

    const pad = /** @param {number} n */ n => String(n).padStart(2, '0');

    const ymd = `${y}-${pad(mo)}-${pad(d)}`;

    const ms = kalenderBerlinDateOnlyNeutralSlotUtcMs(ymd);

    return ms == null ? null : new Date(ms);

  }



  const mIsoDay = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (mIsoDay) {

    const y = +mIsoDay[1];

    const mo = +mIsoDay[2];

    const d = +mIsoDay[3];

    const pad = /** @param {number} n */ n => String(n).padStart(2, '0');

    const ymd = `${y}-${pad(mo)}-${pad(d)}`;

    const ms = kalenderBerlinDateOnlyNeutralSlotUtcMs(ymd);

    return ms == null ? null : new Date(ms);

  }



  const fallback = new Date(raw);

  return Number.isNaN(fallback.getTime()) ? null : fallback;

}



/**

 * @param {Date} start

 * @param {Date | null} [end]

 */

function endOrDefault(start, end) {

  if (end && !Number.isNaN(end.getTime()) && end.getTime() > start.getTime()) return end;

  return new Date(start.getTime() + DEFAULT_DURATION_MS);

}



/**

 * @param {string} typRaw

 * @returns {CcwCalendarEventTypeNorm}

 */

function mapAuftragTyp(typRaw) {

  const t = String(typRaw || '').toLowerCase();

  if (t.includes('montage')) return CCW_CALENDAR_EVENT_TYPES.MONTAGE;

  if (t.includes('liefer')) return CCW_CALENDAR_EVENT_TYPES.LIEFERUNG;

  return CCW_CALENDAR_EVENT_TYPES.AUFTRAG;

}



/**

 * @param {CcwCalendarEvent[]} events

 */

function sortCalendarEvents(events) {

  return [...events].sort((a, b) => String(a.start).localeCompare(String(b.start)));

}



/**

 * @param {object} input

 * @param {string} input.projectId

 * @param {string} input.projectTitle

 * @param {string} [input.deadline]

 * @param {Array<{ id: string, name?: string, typ?: string, status?: string, termin?: string, terminEnde?: string }>} [input.auftraege]

 * @param {Array<{ id: string, name?: string, status?: number, montageTermin?: string, montageEnde?: string, pruefungBis?: string }>} [input.walls]

 * @returns {CcwCalendarEvent[]}

 */

export function buildCcwProjectCalendarEvents(input) {

  const { projectId, projectTitle } = input;

  const deadlineStr = input.deadline;

  /** @type {CcwCalendarEvent[]} */

  const out = [];



  const dDeadline = parseCalendarDateToDate(deadlineStr);

  if (dDeadline) {

    const dEnd = endOrDefault(dDeadline, null);

    out.push({

      id: `${projectId}::deadline`,

      title: `Liefertermin / Deadline — ${projectTitle}`,

      start: dDeadline.toISOString(),

      end: dEnd.toISOString(),

      type: CCW_CALENDAR_EVENT_TYPES.LIEFERUNG,

      projectId,

    });

  }



  for (const a of input.auftraege || []) {

    if (!a || !a.id) continue;

    const ds = parseCalendarDateToDate(a.termin);

    if (!ds) continue;

    const de = endOrDefault(ds, parseCalendarDateToDate(a.terminEnde));

    const evType = mapAuftragTyp(a.typ);

    out.push({

      id: `${projectId}::auftrag::${a.id}`,

      title: String(a.name || a.id),

      start: ds.toISOString(),

      end: de.toISOString(),

      type: evType,

      projectId,

      resource: undefined,

    });

  }



  for (const w of input.walls || []) {

    if (!w || !w.id) continue;

    const wname = String(w.name || w.id);



    const dm = parseCalendarDateToDate(w.montageTermin);

    if (dm) {

      const dmEnd = endOrDefault(dm, parseCalendarDateToDate(w.montageEnde));

      out.push({

        id: `${projectId}::wall::${w.id}::montage`,

        title: `Montage — ${wname}`,

        start: dm.toISOString(),

        end: dmEnd.toISOString(),

        type: CCW_CALENDAR_EVENT_TYPES.MONTAGE,

        projectId,

        resource: undefined,

      });

    }



    const st = w.status;

    if ((st === 6 || st === 7) && w.pruefungBis) {

      const dp = parseCalendarDateToDate(w.pruefungBis);

      if (dp) {

        const dpEnd = endOrDefault(dp, null);

        out.push({

          id: `${projectId}::wall::${w.id}::schaden`,

          title: `Prüfung / Schaden — ${wname}`,

          start: dp.toISOString(),

          end: dpEnd.toISOString(),

          type: CCW_CALENDAR_EVENT_TYPES.SCHADEN,

          projectId,

        });

      }

    }

  }



  return sortCalendarEvents(out);

}



/**

 * @param {CcwCalendarEvent[]} events

 * @param {{ fromIso?: string, toIso?: string } | null | undefined} range

 */

export function filterCalendarEventsByRange(events, range) {

  if (!range || (!range.fromIso && !range.toIso)) return sortCalendarEvents(events);

  const fromMs = range.fromIso ? new Date(range.fromIso).getTime() : -Infinity;

  const toMs = range.toIso ? new Date(range.toIso).getTime() : Infinity;

  const filtered = events.filter(ev => {

    const s = new Date(ev.start).getTime();

    const e = new Date(ev.end).getTime();

    return s < toMs && e > fromMs;

  });

  return sortCalendarEvents(filtered);

}

