/**
 * Kalender-Konflikterkennung (nur Anzeige): Doppelbuchungen Mitarbeiter / Fahrzeug bei Zeitüberlappung.
 *
 * Abweichung von reiner „Snapshot-vs.-Snapshot“-Semantik: `readOnly` blockiert die Erkennung
 * nicht — sonst wäre in Phase 1 (alle Events readOnly) keine Anzeige möglich.
 *
 * @typedef {import('./ccw-calendar-event-foundation.js').CalendarEvent} CalendarEvent
 */

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim() !== '';
}

/**
 * @param {CalendarEvent} ev
 * @returns {{ t0: number, t1: number } | null}
 */
function eventTimeRangeMs(ev) {
  const t0 = new Date(ev.start).getTime();
  const t1 = new Date(ev.ende).getTime();
  if (Number.isNaN(t0) || Number.isNaN(t1)) return null;
  return { t0, t1 };
}

/**
 * @param {number} t0
 * @param {number} t1
 * @param {number} u0
 * @param {number} u1
 */
function rangesOverlap(t0, t1, u0, u1) {
  return t0 < u1 && u0 < t1;
}

/**
 * @param {CalendarEvent} ev
 * @returns {Set<string>}
 */
function mitarbeiterIdSet(ev) {
  const out = new Set();
  if (!ev || !Array.isArray(ev.mitarbeiterIds)) return out;
  for (const id of ev.mitarbeiterIds) {
    if (isNonEmptyString(id)) out.add(String(id).trim());
  }
  return out;
}

/**
 * @param {CalendarEvent} ev
 * @returns {boolean}
 */
function eventHatKeineRessource(ev) {
  const m = mitarbeiterIdSet(ev);
  const fz = isNonEmptyString(ev.fahrzeugId) ? String(ev.fahrzeugId).trim() : '';
  return m.size === 0 && fz === '';
}

/**
 * @param {CalendarEvent} a
 * @param {CalendarEvent} b
 */
function mitarbeiterKonflikt(a, b) {
  const A = mitarbeiterIdSet(a);
  const B = mitarbeiterIdSet(b);
  if (A.size === 0 || B.size === 0) return false;
  for (const id of A) {
    if (B.has(id)) return true;
  }
  return false;
}

/**
 * @param {CalendarEvent} a
 * @param {CalendarEvent} b
 */
function fahrzeugKonflikt(a, b) {
  const fa = isNonEmptyString(a.fahrzeugId) ? String(a.fahrzeugId).trim() : '';
  const fb = isNonEmptyString(b.fahrzeugId) ? String(b.fahrzeugId).trim() : '';
  if (fa === '' || fb === '') return false;
  return fa === fb;
}

/**
 * @param {CalendarEvent} a
 * @param {CalendarEvent} b
 * @returns {boolean}
 */
function pairHatKalenderKonflikt(a, b) {
  if (a.ganztag !== b.ganztag) return false;
  if (eventHatKeineRessource(a) || eventHatKeineRessource(b)) return false;

  const ra = eventTimeRangeMs(a);
  const rb = eventTimeRangeMs(b);
  if (!ra || !rb) return false;
  if (!rangesOverlap(ra.t0, ra.t1, rb.t0, rb.t1)) return false;

  return mitarbeiterKonflikt(a, b) || fahrzeugKonflikt(a, b);
}

/**
 * Liefert alle `eventId`, die in mindestens einem erkannten Konflikt stehen.
 * Arbeitet auf der bereits gefilterten Eventliste; keine Seiteneffekte.
 *
 * @param {CalendarEvent[]} events
 * @returns {Set<string>}
 */
export function detectKalenderKonflikte(events) {
  const out = new Set();
  if (!Array.isArray(events) || events.length < 2) return out;
  const n = events.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const a = events[i];
      const b = events[j];
      if (pairHatKalenderKonflikt(a, b)) {
        out.add(String(a.eventId));
        out.add(String(b.eventId));
      }
    }
  }
  return out;
}
