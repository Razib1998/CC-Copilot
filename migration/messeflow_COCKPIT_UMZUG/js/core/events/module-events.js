// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – MODULE_EVENT_TYPE  (§28 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Einzige Quelle für alle Event-Typ-Konstanten.
//  Neue Typen NUR hier ergänzen + §28 im MASTER aktualisieren.
//  Listener + Cockpit-Brücke immer mitpflegen.
// ═══════════════════════════════════════════════════════════════════════════

const MODULE_EVENT_TYPE = Object.freeze({
  MODULE_ENTRY:       'module_entry',
  FILE_UPLOADED:      'file_uploaded',
  APPROVAL_NEEDED:    'approval_needed',
  PROJECT_CHANGED:    'project_changed',
  INVITE_CREATED:     'invite_created',
  EMBED_TEST_STARTED: 'embed_test_started',
  STATUS_GEAENDERT:   'status_geaendert',
});

// ── interne Event-Bus-Implementierung ────────────────────────────────────
var _moduleEventListeners = {};

/**
 * Sendet ein Modul-Event.
 * @param {{ type: string, [key: string]: any }} eventObj – Pflicht: type (aus MODULE_EVENT_TYPE)
 */
function emitModuleEvent(eventObj) {
  if (!eventObj || !eventObj.type) {
    console.warn('[ModuleEvents] emitModuleEvent: type fehlt', eventObj);
    return;
  }
  var listeners = _moduleEventListeners[eventObj.type] || [];
  listeners.forEach(function (cb) {
    try { cb(eventObj); } catch (e) {
      console.error('[ModuleEvents] Listener-Fehler:', eventObj.type, e);
    }
  });
  // globalen Listener (*)  bedienen
  var wildcard = _moduleEventListeners['*'] || [];
  wildcard.forEach(function (cb) {
    try { cb(eventObj); } catch (e) {
      console.error('[ModuleEvents] Wildcard-Listener-Fehler:', e);
    }
  });
}

/**
 * Registriert einen Listener für einen Event-Typ.
 * @param {string} type  – MODULE_EVENT_TYPE-Wert oder '*' für alle
 * @param {Function} cb
 */
function onModuleEvent(type, cb) {
  if (!_moduleEventListeners[type]) _moduleEventListeners[type] = [];
  _moduleEventListeners[type].push(cb);
}

/**
 * Entfernt einen Listener.
 */
function offModuleEvent(type, cb) {
  if (!_moduleEventListeners[type]) return;
  _moduleEventListeners[type] = _moduleEventListeners[type].filter(function (f) {
    return f !== cb;
  });
}

// Public API
if (typeof window !== 'undefined') {
  window.MODULE_EVENT_TYPE  = MODULE_EVENT_TYPE;
  window.emitModuleEvent    = emitModuleEvent;
  window.onModuleEvent      = onModuleEvent;
  window.offModuleEvent     = offModuleEvent;
}
