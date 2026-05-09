// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Kalender-Kernel  (§8 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Ein einziger Kalender für FUSA + CC Intern (§8 – kein zweiter Kalender).
//  Datum: YYYY-MM-DD, Zeit: UTC ISO, Anzeige: Europe/Berlin (§6, §18).
//  Events via emitModuleEvent({ type: ... }).
//  Laden NACH module-events.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var _events      = [];   // interne Event-Liste
  var _listeners   = {};

  // ── Event-Typen ──────────────────────────────────────────────────────────
  var CAL_EVENT = Object.freeze({
    CREATED:   'cal_event_created',
    UPDATED:   'cal_event_updated',
    DELETED:   'cal_event_deleted',
    SELECTED:  'cal_event_selected',
    VIEW_CHANGED: 'cal_view_changed',
  });

  // ── CRUD ─────────────────────────────────────────────────────────────────

  function addEvent(ev) {
    if (!ev || !ev.id) { console.warn('[CalKernel] addEvent: id fehlt'); return; }
    _events.push(ev);
    _emit(CAL_EVENT.CREATED, ev);
    return ev;
  }

  function updateEvent(id, patch) {
    var idx = _events.findIndex(function (e) { return e.id === id; });
    if (idx < 0) { console.warn('[CalKernel] updateEvent: nicht gefunden', id); return; }
    Object.assign(_events[idx], patch);
    _emit(CAL_EVENT.UPDATED, _events[idx]);
    return _events[idx];
  }

  function deleteEvent(id) {
    var idx = _events.findIndex(function (e) { return e.id === id; });
    if (idx < 0) return;
    var ev = _events.splice(idx, 1)[0];
    _emit(CAL_EVENT.DELETED, ev);
  }

  function getEvents(filter) {
    if (!filter) return _events.slice();
    return _events.filter(function (ev) {
      if (filter.projectId && ev.projectId !== filter.projectId) return false;
      if (filter.from && ev.start < filter.from) return false;
      if (filter.to   && ev.start > filter.to)   return false;
      if (filter.type && ev.type !== filter.type) return false;
      return true;
    });
  }

  function getEventById(id) {
    return _events.find(function (e) { return e.id === id; }) || null;
  }

  // ── Datum-Hilfsfunktionen (§18) ──────────────────────────────────────────

  function formatCalDate(isoDate) {
    if (!isoDate) return '';
    try {
      return new Date(isoDate + 'T00:00:00').toLocaleDateString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Europe/Berlin'
      });
    } catch (e) { return isoDate; }
  }

  function todayISO() {
    return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  }

  // ── Interner Event-Bus ───────────────────────────────────────────────────

  function _emit(type, data) {
    (_listeners[type] || []).forEach(function (cb) {
      try { cb(data); } catch (e) { console.error('[CalKernel]', type, e); }
    });
    // MesseFlow emitModuleEvent (§8)
    if (typeof emitModuleEvent === 'function' && typeof MODULE_EVENT_TYPE !== 'undefined') {
      // Kalender-Änderungen als PROJECT_CHANGED melden
      if (data && data.projectId) {
        emitModuleEvent({ type: MODULE_EVENT_TYPE.PROJECT_CHANGED, projectId: data.projectId });
      }
    }
  }

  function onCalEvent(type, cb) {
    if (!_listeners[type]) _listeners[type] = [];
    _listeners[type].push(cb);
  }

  function offCalEvent(type, cb) {
    if (!_listeners[type]) return;
    _listeners[type] = _listeners[type].filter(function (f) { return f !== cb; });
  }

  // ── Imports aus CC-Intern-Bridge ─────────────────────────────────────────

  function importFromCCIntern(termine) {
    (termine || []).forEach(function (t) {
      if (!getEventById(t.id)) addEvent(t);
    });
  }

  // Exports
  window.CCWCalendar = {
    addEvent:     addEvent,
    updateEvent:  updateEvent,
    deleteEvent:  deleteEvent,
    getEvents:    getEvents,
    getById:      getEventById,
    onEvent:      onCalEvent,
    offEvent:     offCalEvent,
    formatDate:   formatCalDate,
    today:        todayISO,
    importFromCCIntern: importFromCCIntern,
    EVENT:        CAL_EVENT,
  };

  console.log('[CalKernel] Bereit');
})();
