/**

 * Zentrale read-only Zusammenführung aller Kalender-relevanten Quellen → CcwCalendarEvent[].

 * Kein State-Schreiben, kein UI — nur Lesen/Transformieren über den Kalenderkern.

 *

 * CC-Plattform Regel 2: keine doppelte Terminpflege — eine Quelle pro Auftrag nach Merge;

 * Regel 3: keine Kalender-Sonderwahrheit — nur Mapping auf Kernfelder.

 * @see ./ccw-calendar-plattform-regeln.js

 *

 * Pipeline: Kernel-Events → mapSnapshotEventToCalendarEvent → filterValidCalendarEvents →

 * DTO kompatibel mit Legacy-`CcwCalendarEvent` für bestehende Views (ohne View-Änderung).

 */



import CCState from '../state/state.js';

import { buildCcwProjectCalendarEvents } from './ccw-calendar-kernel.js';

import { filterValidCalendarEvents } from './ccw-calendar-event-foundation.js';

import { mapSnapshotEventToCalendarEvent } from './ccw-calendar-event-mapper.js';

import { getFusaKalenderTerminFuerKernel, parseFusaExtraJson } from './fusa-beklebung-kalender.js';



/**

 * @typedef {import('./ccw-calendar-kernel.js').CcwCalendarEvent} CcwCalendarEvent

 * @deprecated Nutzung des Kern-Typs nur noch als View-DTO; fachliche Einheit ist `CalendarEvent` (Foundation).

 */



/**

 * Schlankes Auftragsfragment für den Kern (Mehrfachquellen vor dem Merge).

 * @typedef {object} CalendarAuftragRowLike

 * @property {string} id

 * @property {string} [name]

 * @property {string} [typ]

 * @property {string} [status]

 * @property {string} [termin]

 * @property {string} [terminEnde]

 */



/**

 * Liefertermin-String wie in projectView: Excel zuerst, sonst Deadline.

 * @param {{ deadline?: string, auftragsInfo?: { liefertermin?: string } } | null | undefined} project

 * @returns {string | undefined}

 */

export function pickProjectLieferterminSource(project) {

  if (!project) return undefined;

  const lt = project.auftragsInfo?.liefertermin;

  if (lt != null && String(lt).trim() !== '') return String(lt).trim();

  const dl = project.deadline;

  if (dl != null && String(dl).trim() !== '') return String(dl).trim();

  return undefined;

}



/**

 * Mehrere Quellen mit gleicher Auftrags-ID zu einer Zeile zusammenführen (spätere Keys überschreiben nur wenn gesetzt).

 * @param {CalendarAuftragRowLike[]} rows

 * @returns {Array<{ id: string, name?: string, typ?: string, status?: string, termin?: string, terminEnde?: string }>}

 */

/**
 * Snapshot `auftraege[].typ` kann den Quellsystem-Marker „FUSA“ tragen — der fachliche Typ
 * steht oft nur in `projects[].auftraege[]` (z. B. „Montage“). Marker dürfen keinen echten Typ überschreiben.
 * @param {string} typRaw
 */
function isCalendarAuftragSourceMarkerTyp(typRaw) {
  const t = String(typRaw ?? '')
    .trim()
    .toLowerCase();
  return t === 'fusa' || t === 'cc_intern' || t === 'cc-intern' || t === 'cc intern';
}

/** Kalender-Zusatzfelder (FUSA-Beklebung / Modal-Auflösung), ohne Termin-Logik zu duplizieren. */
const MERGE_OPTIONAL_AUFTRAG_KEYS = /** @type {const} */ ([
  'calendarPlainTitle',
  'beklebungstermin_status',
  'kunde_name',
  'werkstatt_label',
  'depot',
  'calendarFahrzeugKennungen',
  'fusa_extra_json',
  'fusa_fahrzeug_ids',
  'calendarCcInternTerminSparte',
  'quelleSystem',
  'auftragId',
  'projektName',
  'auftragsnummer',
]);

/**
 * @param {string|null|undefined} id
 * @returns {string|null}
 */
function kernelAuftragIdFromEventId(id) {
  const s = String(id || '');
  const m = s.match(/::auftrag::(.+)$/);
  return m && m[1] ? String(m[1]).trim() : null;
}

/**
 * @param {import('./ccw-calendar-kernel.js').CcwCalendarEvent} row
 * @param {Record<string, unknown>|null|undefined} auftragRow
 * @param {string} projectTitle
 * @returns {import('./ccw-calendar-kernel.js').CcwCalendarEvent}
 */
function enrichKernelRowForFusaBeklebungKalender(row, auftragRow, projectTitle) {
  if (!row || typeof row !== 'object' || !auftragRow) return row;
  const kal = getFusaKalenderTerminFuerKernel(auftragRow);
  if (!kal || !kal.termin) return row;

  const out = /** @type {Record<string, unknown>} */ ({ ...row });
  out.quelleSystem = 'fusa';
  /** Wochenraster-Drag (.ccw-cockpit-kal20-evt--timed) — Kern liefert UTC-Tagesbeginn + Default-Dauer. */
  out.ganztag = false;
  const extra = parseFusaExtraJson(auftragRow.fusa_extra_json);
  const bekRaw = extra.beklebungstermin_status ?? extra.beklebungsterminStatus;
  if (bekRaw != null && String(bekRaw).trim() !== '') {
    out.beklebungstermin_status = String(bekRaw).trim();
  }
  const wsTop = auftragRow.werkstatt_label != null ? String(auftragRow.werkstatt_label).trim() : '';
  const depTop = auftragRow.depot != null ? String(auftragRow.depot).trim() : '';
  const wsEx = extra.werkstatt_label != null ? String(extra.werkstatt_label).trim() : '';
  const depEx = extra.depot != null ? String(extra.depot).trim() : '';
  const stand = wsTop || depTop || wsEx || depEx;
  if (stand) out.standort = stand;

  out.projektName = projectTitle;
  const plain =
    auftragRow.calendarPlainTitle != null && String(auftragRow.calendarPlainTitle).trim() !== ''
      ? String(auftragRow.calendarPlainTitle).trim()
      : null;
  if (plain) out.calendarPlainTitle = plain;

  if (auftragRow.kunde_name != null && String(auftragRow.kunde_name).trim() !== '') {
    out.kunde_name = String(auftragRow.kunde_name).trim();
  }
  if (auftragRow.calendarFahrzeugKennungen != null && String(auftragRow.calendarFahrzeugKennungen).trim() !== '') {
    out.calendarFahrzeugKennungen = String(auftragRow.calendarFahrzeugKennungen).trim();
  }
  return /** @type {import('./ccw-calendar-kernel.js').CcwCalendarEvent} */ (/** @type {unknown} */ (out));
}

export function mergeCalendarAuftragRows(rows) {

  /** @type {Map<string, Record<string, unknown>>} */

  const byId = new Map();

  for (const r of rows) {

    if (!r || r.id == null || r.id === '') continue;

    const id = String(r.id);

    const prev = byId.get(id) || { id };

    const next = { ...prev };

    for (const k of ['name', 'typ', 'status', 'termin', 'terminEnde']) {

      const v = r[k];

      if (v == null || String(v).trim() === '') continue;

      if (k === 'typ') {
        const nv = String(v).trim();
        const pv = next[k] != null ? String(next[k]).trim() : '';
        if (!pv) {
          next[k] = nv;
        } else if (isCalendarAuftragSourceMarkerTyp(nv)) {
          /* behalten: z. B. Montage nicht durch FUSA ersetzen */
        } else if (isCalendarAuftragSourceMarkerTyp(pv)) {
          next[k] = nv;
        } else {
          next[k] = nv;
        }
        continue;
      }

      next[k] = v;

    }

    if (r.calendarFusaBeklebung === true) {
      next.calendarFusaBeklebung = true;
    }

    for (const ok of MERGE_OPTIONAL_AUFTRAG_KEYS) {
      const v = r[ok];
      if (ok === 'fusa_extra_json') {
        const s = v != null ? String(v).trim() : '';
        if (s === '' || s === '{}') continue;
        next[ok] = v;
        continue;
      }
      if (ok === 'quelleSystem') {
        if (v === 'cc_intern' || v === 'fusa') next[ok] = v;
        continue;
      }
      if (v == null || String(v).trim() === '') continue;
      next[ok] = v;
    }

    byId.set(id, next);

  }

  return /** @type {any} */ ([...byId.values()]);

}



/**

 * @param {import('./ccw-calendar-event-foundation.js').CalendarEvent} ce

 * @returns {CcwCalendarEvent}

 */

function legacyViewDtoFromCalendarEvent(ce) {

  return {

    id: ce.eventId,

    title: ce.titel,

    start: ce.start,

    end: ce.ende,

    type: /** @type {import('./ccw-calendar-kernel.js').CcwCalendarEventTypeNorm} */ (/** @type {unknown} */ (ce.typ)),

    projectId: ce.projektId != null && String(ce.projektId).trim() !== '' ? String(ce.projektId) : '',

  };

}



/**

 * @param {object} opts

 * @param {Array<object>} opts.projects — wie state.projects

 * @param {Array<object>} [opts.auftraege] — wie state.auftraege (projektId, termin …)

 * @param {Record<string, CalendarAuftragRowLike[]>} [opts.fusaAuftraegeByProjectId] — z. B. von FUSA-Port, optional

 * @returns {import('./ccw-calendar-event-foundation.js').CalendarEvent[]}

 */

export function buildValidatedCalendarEventsFromStateSnapshot(opts) {

  const projects = Array.isArray(opts.projects) ? opts.projects : [];

  const auftraegeAll = Array.isArray(opts.auftraege) ? opts.auftraege : [];

  const fusaByPid = opts.fusaAuftraegeByProjectId && typeof opts.fusaAuftraegeByProjectId === 'object'

    ? opts.fusaAuftraegeByProjectId

    : {};



  /** @type {CcwCalendarEvent[]} */

  const kernelRows = [];



  for (const p of projects) {

    if (!p || p.id == null || p.id === '') continue;

    const projectId = String(p.id);

    const cockpitAuftraege = auftraegeAll.filter(

      a => a && String(a.projektId || a.projectId || '') === projectId

    );

    const fusaList = fusaByPid[projectId] || [];

    const embedded = Array.isArray(p.auftraege) ? p.auftraege : [];

    /** FUSA-Port liefert kanonische Zeilen; gleiche `id` aus Cockpit/embedded nicht doppelt mergen (sonst alter Werbe-`termin` die FUSA-Logik überschreiben). */
    const fusaIds = new Set(
      fusaList.map(x => (x && x.id != null && String(x.id).trim() !== '' ? String(x.id) : '')).filter(Boolean),
    );
    const embeddedFiltered = embedded.filter(
      x => !x || x.id == null || !fusaIds.has(String(x.id)),
    );
    const cockpitFiltered = cockpitAuftraege.filter(
      x => !x || x.id == null || !fusaIds.has(String(x.id)),
    );

    /** @type {CalendarAuftragRowLike[]} */

    const combinedRaw = [...embeddedFiltered, ...cockpitFiltered, ...fusaList];

    const auftraege = mergeCalendarAuftragRows(combinedRaw);



    const deadlineStr = pickProjectLieferterminSource(p);

    const ev = buildCcwProjectCalendarEvents({

      projectId,

      projectTitle: String(p.name || projectId),

      deadline: deadlineStr,

      auftraege,

      walls: Array.isArray(p.waende) ? p.waende : [],

    });

    const projectTitle = String(p.name || projectId);

    for (const row of ev) {
      const aid = kernelAuftragIdFromEventId(row.id);
      const src = aid ? auftraege.find(x => x && String(x.id) === aid) : null;
      let outRow = src ? enrichKernelRowForFusaBeklebungKalender(row, /** @type {Record<string, unknown>} */ (src), projectTitle) : row;
      const srcRec = src && typeof src === 'object' ? /** @type {Record<string, unknown>} */ (src) : null;
      const ccSp = srcRec?.calendarCcInternTerminSparte;
      if (ccSp === 'montage' || ccSp === 'lieferung') {
        const aid0 = kernelAuftragIdFromEventId(typeof outRow === 'object' && outRow && 'id' in outRow ? String(/** @type {any} */ (outRow).id) : '');
        const pnSrc =
          srcRec && srcRec.projektName != null && String(srcRec.projektName).trim() !== ''
            ? String(srcRec.projektName).trim()
            : projectTitle;
        const nrSrc =
          srcRec && srcRec.auftragsnummer != null && String(srcRec.auftragsnummer).trim() !== ''
            ? String(srcRec.auftragsnummer).trim()
            : '';
        outRow = /** @type {typeof row} */ (
          /** @type {unknown} */ ({
            ...(typeof outRow === 'object' && outRow ? /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (outRow)) : {}),
            quelleSystem: 'cc_intern',
            calendarCcInternTerminSparte: ccSp,
            projektName: pnSrc,
            ...(nrSrc ? { auftragsnummer: nrSrc } : {}),
            ...(aid0 ? { auftragId: aid0 } : {}),
          })
        );
      }
      kernelRows.push(outRow);
    }

  }



  kernelRows.sort((a, b) => String(a.start).localeCompare(String(b.start)));



  /** @type {import('./ccw-calendar-event-foundation.js').CalendarEvent[]} */

  const mappedCalendar = [];

  for (const row of kernelRows) {

    const ce = mapSnapshotEventToCalendarEvent(row);

    if (!ce) {

      if (typeof console !== 'undefined' && console.warn) {

        console.warn('[CCW-Kalender] Event verworfen', row, [

          'mapSnapshotEventToCalendarEvent: Mapping fehlgeschlagen',

        ]);

      }

      continue;

    }

    mappedCalendar.push(ce);

  }



  const validated = filterValidCalendarEvents(mappedCalendar, info =>

    console.warn('[CCW-Kalender] Event verworfen', info.raw, info.errors),

  );



  const seenAuftragIds = new Set();
  const deduped = [];
  for (const ev of validated) {
    if (!ev || typeof ev !== 'object') continue;
    const key = ev.auftragId != null && String(ev.auftragId).trim() !== ''
      ? String(ev.auftragId).trim()
      : String(ev.eventId || '').trim();
    if (!key) continue;
    if (seenAuftragIds.has(key)) continue;
    seenAuftragIds.add(key);
    deduped.push(ev);
  }

  deduped.forEach(function (event) {
    if (!event || typeof event !== 'object') return;
    const e = /** @type {Record<string, unknown>} */ (event);
    const sourceRaw =
      e.source != null ? String(e.source).trim() :
      e.quelleSystem != null ? String(e.quelleSystem).trim() :
      e.origin != null ? String(e.origin).trim() :
      '';
    const source = sourceRaw.toLowerCase();
    const allowed = source === '' || source === 'cc_intern' || source === 'fusa';
    if (!allowed) {
      console.warn('UNERLAUBTE KALENDERQUELLE', event);
    }
    const hasLegacyFusaTermineMarker =
      source === 'fusa/termine'
      || source.includes('fusa_termine')
      || source.includes('fusa-termine')
      || (e.fusa_termin_id != null && String(e.fusa_termin_id).trim() !== '');
    if (hasLegacyFusaTermineMarker) {
      console.warn('FUSA TERMINE FEED NOCH AKTIV', event);
    }
  });

  try {
    const kalDebug =
      typeof localStorage !== 'undefined' &&
      localStorage.getItem('ccwDebugKalender') === '1' &&
      typeof console !== 'undefined' &&
      typeof console.log === 'function';
    if (kalDebug) {
      for (const item of deduped) {
        if (!item || typeof item !== 'object') continue;
        const o = /** @type {Record<string, unknown>} */ (item);
        console.log('[KALENDER FINAL ITEM]', {
          id: o.eventId != null ? String(o.eventId) : o.id,
          titel: o.titel != null ? String(o.titel) : o.title,
          start: o.start != null ? String(o.start) : o.start_datum,
          ende: o.ende != null ? String(o.ende) : o.ende_datum,
          quelle: o.quelle != null ? String(o.quelle) : o.apiQuelle,
          typ: o.typ != null ? String(o.typ) : o.apiTyp,
          source: o.source != null ? String(o.source) : o._source,
          auftragsnummer: o.auftragsnummer,
          auftragId: o.auftrag_id != null ? String(o.auftrag_id) : o.auftragId,
        });
      }
    }
  } catch {
    /* ignore */
  }

  return deduped;

}



/**

 * @param {object} opts

 * @param {Array<object>} opts.projects — wie state.projects

 * @param {Array<object>} [opts.auftraege] — wie state.auftraege (projektId, termin …)

 * @param {Record<string, CalendarAuftragRowLike[]>} [opts.fusaAuftraegeByProjectId] — z. B. von FUSA-Port, optional

 * @returns {CcwCalendarEvent[]}

 */

export function buildUnifiedCcwCalendarEventsFromStateSnapshot(opts) {

  return buildValidatedCalendarEventsFromStateSnapshot(opts).map(legacyViewDtoFromCalendarEvent);

}



/**

 * Liest aktuellen App-State (nur Lesen) und liefert alle Kalenderereignisse.

 * @param {{ fusaAuftraegeByProjectId?: Record<string, CalendarAuftragRowLike[]> }} [options]

 * @returns {CcwCalendarEvent[]}

 */

export function buildUnifiedCcwCalendarEventsFromAppState(options = {}) {

  const app = typeof CCState.get === 'function' ? CCState.get() : {};

  return buildUnifiedCcwCalendarEventsFromStateSnapshot({

    projects: app.projects || [],

    auftraege: app.auftraege || [],

    fusaAuftraegeByProjectId: options.fusaAuftraegeByProjectId,

  });

}

