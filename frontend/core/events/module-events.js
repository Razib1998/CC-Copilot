/**
 * CC Cockpit – Module Events
 * ──────────────────────────
 * Zentraler Event-Bus für die Kommunikation zwischen Modulen.
 * Noch keine Logik – nur Grundstruktur.
 */

const ModuleEvents = (() => {

  // ── Event-Registry ───────────────────────────────────────────
  const _listeners = {};  // { eventName: [callback, ...] }

  // ── Bekannte Events (Platzhalter) ────────────────────────────
  const EVENTS = {
    MODULE_LOADED:    'module:loaded',
    MODULE_CHANGE:    'module:change',     // ← Sidebar → Core (Modul wechseln)
    MODULE_CHANGED:   'module:changed',    // ← Core → Rest  (Modul gewechselt)
    USER_LOGGED_IN:   'user:loggedIn',
    USER_LOGGED_OUT:  'user:loggedOut',
    PROJECT_SELECTED: 'project:selected',
    // TODO: weitere Events je Modul ergänzen
  };

  // ── Subscriber registrieren ──────────────────────────────────
  function on(event, callback) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(callback);
  }

  // ── Subscriber entfernen ─────────────────────────────────────
  function off(event, callback) {
    if (!_listeners[event]) return;
    _listeners[event] = _listeners[event].filter(cb => cb !== callback);
  }

  // ── Event auslösen ───────────────────────────────────────────
  function emit(event, payload = null) {
    if (!_listeners[event]) return;
    _listeners[event].forEach(cb => cb(payload));
  }

  // ── Public API ───────────────────────────────────────────────
  return { on, off, emit, EVENTS };

})();

export default ModuleEvents;