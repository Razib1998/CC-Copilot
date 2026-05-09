// ══════════════════════════════════════════════════════════════════════
// CC INTERN — CCInternDataService
// ─────────────────────────────────────────────────────────────────────
// Zentrale Service-Schicht für alle Datenzugriffe.
// Delegiert an den aktiven Adapter (LocalStorage oder API).
//
// Phase 1: Standard Adapter nur wenn ApiAdapter konfiguriert — kein LocalStorage-DAL.
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
    var ls = window.CCIntern.LocalStorageAdapter;
    if (window.__CCINTERN_COCKPIT_MOUNT__ && adapter === ls && !window.__CCINTERN_ALLOW_LS_ADAPTER__) {
      return;
    }
    this._adapter = adapter;
    if (!(window.__CCINTERN_COCKPIT_MOUNT__ && adapter === ls)) {
      console.info('CCInternDataService: Adapter gesetzt →', adapter === ls ? 'LocalStorage' : 'API');
    }
  },

  // Sync-Load (für LocalStorageAdapter)
  // Gibt fallback zurück wenn kein Adapter gesetzt oder Fehler
  load: function(key, fallback) {
    if (key === 'cc_intern_auftraege_v1') {
      console.error(
        '[CCInternDataService] Aufträge: synchroner load(cc_intern_auftraege_v1) nicht unterstützt — nutze loadAuftraege().',
      );
      return fallback;
    }
    if (!this._adapter) {
      console.warn('DataService.load: kein Adapter gesetzt');
      return fallback;
    }
    return this._adapter.load(key, fallback);
  },

  // Async-Load mit callback(err, data) — funktioniert mit beiden Adaptern
  loadAsync: function(key, fallback, callback) {
    if (key === 'cc_intern_auftraege_v1') {
      console.error(
        '[CCInternDataService] Aufträge: loadAsync(cc_intern_auftraege_v1) nicht unterstützt — nutze loadAuftraege() / API.',
      );
      if (callback) callback(new Error('auftraege-api-only'), fallback);
      return;
    }
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
    if (key === 'cc_intern_auftraege_v1') {
      var api = window.CCIntern && window.CCIntern.cockpitApi;
      if (api && typeof api.runSaveAuftraege === 'function') {
        var toastFn =
          typeof window._ccShowToast === 'function'
            ? window._ccShowToast
            : typeof showToast === 'function'
              ? showToast
              : null;
        return api.runSaveAuftraege(toastFn);
      }
      console.error('[CCInternDataService] Aufträge: Speichern nur über Cockpit-API — kein localStorage-Adapter-Fallback.');
      return false;
    }
    if (!this._adapter) {
      console.warn('DataService.save: kein Adapter gesetzt');
      return false;
    }
    return this._adapter.save(key, data);
  },

  // Löschen / Zurücksetzen
  reset: function(key) {
    if (key === 'cc_intern_auftraege_v1') {
      console.error('[CCInternDataService] Aufträge: reset(cc_intern_auftraege_v1) nicht unterstützt — nutze DELETE /api/v1/ccintern/auftraege/:id.');
      return;
    }
    if (!this._adapter) {
      console.warn('DataService.reset: kein Adapter gesetzt');
      return;
    }
    this._adapter.reset(key);
  }

};

if (window.CCIntern.ApiAdapter && window.CCIntern.ApiAdapter._url) {
  window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
}
