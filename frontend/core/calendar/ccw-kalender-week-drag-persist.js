/**
 * Wochenkalender: welche Termine dürfen verschoben werden und wohin persistiert die Verschiebung.
 * @see cockpit-kalender-view.js — Rendering + Commit konsumieren dieselbe Logik.
 */

/** @typedef {import('./ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent */

/**
 * @typedef {{ kind: 'auftrag_termin'; auftragId: string }} CockpitKalenderDragPlanAuftrag
 * @typedef {{ kind: 'projekt_deadline'; projectId: string }} CockpitKalenderDragPlanProjekt
 * @typedef {{ kind: 'client_session_overlay'; reason: string }} CockpitKalenderDragPlanClient
 * @typedef {{ kind: 'none'; reason: string }} CockpitKalenderDragPlanNone
 * @typedef {CockpitKalenderDragPlanAuftrag|CockpitKalenderDragPlanProjekt|CockpitKalenderDragPlanClient|CockpitKalenderDragPlanNone} CockpitKalenderDragPersistPlan
 */

/**
 * @param {string} s
 * @returns {string}
 */
function trimId(s) {
  const t = String(s ?? '').trim();
  return t;
}

/**
 * Liefert den Persistenzplan für ein Kalender-Event (ohne lokale allgemeine Termine — die behandelt die View).
 *
 * @param {Pick<CalendarEvent, 'eventId'|'auftragId'|'projektId'|'objektTyp'|'objektId'>} ev
 * @returns {CockpitKalenderDragPersistPlan}
 */
export function cockpitKalenderWeekDragPersistPlan(ev) {
  let auftragId = trimId(ev.auftragId);
  if (!auftragId && ev.objektTyp === 'auftrag') {
    auftragId = trimId(ev.objektId);
  }
  if (!auftragId) {
    const eid0 = trimId(ev.eventId);
    const mAuf = eid0.match(/::auftrag::(.+)$/);
    if (mAuf && mAuf[1]) auftragId = trimId(mAuf[1]);
  }
  if (auftragId) return { kind: 'auftrag_termin', auftragId };

  const eid = trimId(ev.eventId);
  const mDl = eid.match(/^(.+)::deadline$/);
  if (mDl) {
    const fromId = trimId(mDl[1]);
    const pid = trimId(ev.projektId) || fromId;
    if (pid) return { kind: 'projekt_deadline', projectId: pid };
  }

  const mWall = eid.match(/^(.+)::wall::(.+)::(montage|schaden)$/);
  if (mWall) {
    return {
      kind: 'client_session_overlay',
      reason: `wand_slot:${mWall[3]} (kein PATCH-Endpunkt; nur Sitzungs-Overlay bis Datenrefresh)`,
    };
  }

  if (ev.objektTyp === 'schaden' && trimId(ev.objektId)) {
    return {
      kind: 'client_session_overlay',
      reason: 'schaden (PATCH /schaeden/:id ohne Terminfelder — nur Sitzungs-Overlay)',
    };
  }

  if ((ev.objektTyp === 'fahrzeug' || ev.objektTyp === 'maschine') && trimId(ev.objektId)) {
    return {
      kind: 'client_session_overlay',
      reason: 'fahrzeug/maschine (PATCH ohne Terminzeit — nur Sitzungs-Overlay)',
    };
  }

  return { kind: 'none', reason: 'kein bekannter Persistenzweg und kein Fachobjekt für Session-Overlay' };
}

/**
 * @param {Pick<CalendarEvent, 'eventId'|'auftragId'|'projektId'|'objektTyp'|'objektId'|'ganztag'>} ev
 * @param {(eventId: string) => boolean} isLocalGeneral
 * @returns {boolean}
 */
export function cockpitKalenderWeekEventIsTimedDraggable(ev, isLocalGeneral) {
  if (ev.ganztag === true) return false;
  if (isLocalGeneral(String(ev.eventId))) return true;
  return cockpitKalenderWeekDragPersistPlan(ev).kind !== 'none';
}
