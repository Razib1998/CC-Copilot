// ══════════════════════════════════════════════════════════════════════
// CC INTERN — LocalStorageAdapter (Phase 1: deaktiviert)
// ─────────────────────────────────────────────────────────────────────
// Keine Persistenz im Browser — nur RAM/API. Alle Aufrufe sind No-Ops mit Fallback.
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

window.CCIntern.LocalStorageAdapter = {

  load: function(key, fallback) {
    return fallback;
  },

  save: function(/* key, data */) {
    return false;
  },

  reset: function(/* key */) {},

  loadAsync: function(key, fallback, callback) {
    if (callback) callback(null, fallback);
  },

};
