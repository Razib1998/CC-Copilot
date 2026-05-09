// ══════════════════════════════════════════════════════════════════════
// CC INTERN — CCInternDataService
// ─────────────────────────────────────────────────────────────────────
// Zentrale Service-Schicht für alle Datenzugriffe.
// Delegiert an den aktiven Adapter (LocalStorage oder API).
//
// Standard:  LocalStorageAdapter  (Demo / aktuell)
// Backend:   ApiAdapter           (nach configure + setAdapter)
//
// Verwendung:
//   // Lesen (sync — nur LocalStorageAdapter)
//   var data = window.CCIntern.DataService.load(key, fallback);
//
//   // Lesen (async — funktioniert mit beiden Adaptern)
//   window.CCIntern.DataService.loadAsync(key, fallback, function(err, data){ ... });
//
//   // Schreiben
//   window.CCIntern.DataService.save(key, data);
//
//   // Löschen
//   window.CCIntern.DataService.reset(key);
//
// Adapter wechseln (auf Backend umschalten):
//   window.CCIntern.ApiAdapter.configure('https://cc-werbung.de/api', userToken);
//   window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

window.CCIntern.DataService = {

  _adapter: null,

  // Adapter setzen — z.B. LocalStorageAdapter oder ApiAdapter
  setAdapter: function(adapter) {
    this._adapter = adapter;
    console.info('CCInternDataService: Adapter gesetzt →', adapter === window.CCIntern.LocalStorageAdapter ? 'LocalStorage' : 'API');
  },

  // Sync-Load (für LocalStorageAdapter)
  // Gibt fallback zurück wenn kein Adapter gesetzt oder Fehler
  load: function(key, fallback) {
    if (!this._adapter) {
      console.warn('DataService.load: kein Adapter gesetzt');
      return fallback;
    }
    return this._adapter.load(key, fallback);
  },

  // Async-Load mit callback(err, data) — funktioniert mit beiden Adaptern
  loadAsync: function(key, fallback, callback) {
    if (!this._adapter) {
      console.warn('DataService.loadAsync: kein Adapter gesetzt');
      if (callback) callback(new Error('Kein Adapter'), fallback);
      return;
    }
    if (typeof this._adapter.loadAsync === 'function') {
      this._adapter.loadAsync(key, fallback, callback);
    } else {
      // Fallback: sync-Load in async-Kontext wrappen
      var data = this._adapter.load(key, fallback);
      if (callback) callback(null, data);
    }
  },

  // Speichern
  save: function(key, data) {
    if (!this._adapter) {
      console.warn('DataService.save: kein Adapter gesetzt');
      return false;
    }
    return this._adapter.save(key, data);
  },

  // Löschen / Zurücksetzen
  reset: function(key) {
    if (!this._adapter) {
      console.warn('DataService.reset: kein Adapter gesetzt');
      return;
    }
    this._adapter.reset(key);
  }

};

// Standard-Adapter setzen: LocalStorage (Demo / aktuell)
// Voraussetzung: LocalStorageAdapter.js muss VOR diesem Script geladen sein
if (window.CCIntern.LocalStorageAdapter) {
  window.CCIntern.DataService.setAdapter(window.CCIntern.LocalStorageAdapter);
}
