// ══════════════════════════════════════════════════════════════════════
// CC INTERN — SyncAdapter
// ─────────────────────────────────────────────────────────────────────
// Dual-Write Adapter: schreibt in localStorage UND Server-API.
// Lesen: API zuerst (aktuellste Daten), localStorage als Offline-Fallback.
//
// Aktivierung (automatisch in index.html wenn über HTTP geladen):
//   window.CCIntern.SyncAdapter.configure('http://<ip>:3002/api');
//   window.CCIntern.DataService.setAdapter(window.CCIntern.SyncAdapter);
//
// localStorage bleibt als Offline-Cache — App läuft auch ohne Server.
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

window.CCIntern.SyncAdapter = {

  _apiBase: '',   // z.B. 'http://192.168.1.10:3002/api'
  _local:   null, // window.CCIntern.LocalStorageAdapter

  // Key → REST-Endpunkt (Cockpit-Backend /api/v1/ccintern/* — verifiziert)
  // ✅ = vorhanden | 🔴 = muss noch gebaut werden
  _endpoints: {
    'cc_intern_auftraege_v1':   '/ccintern/auftraege',    // 🔴 muss gebaut werden
    'cc_intern_fusa_v1':        '/fusa/vehicles',          // ✅ vorhanden
    'cc_intern_ma_v1':          '/ccintern/mitarbeiter',   // 🔴 muss gebaut werden
    'cc_intern_aufgaben_v1':    '/ccintern/aufgaben',      // 🔴 muss gebaut werden
    'cc_intern_anwesenheit_v1': '/ccintern/anwesenheit',   // 🔴 muss gebaut werden
    'cc_intern_urlaub_v1':      '/api/v1/urlaub',
    'cc_urlaub_v1':             '/api/v1/urlaub',
    'cc_intern_leads_v1':       '/ccintern/anfragen',      // 🔴 muss gebaut werden
    'cc_intern_lager_v1':       '/ccintern/lager',         // 🔴 muss gebaut werden
    'cc_intern_rechnungen_v1':  '/ccintern/rechnungen',    // 🔴 muss gebaut werden
    'cc_intern_kunden_v1':      '/ccintern/kunden',        // ✅ vorhanden
    'cc_intern_kunden_v2':      '/ccintern/kunden',        // ✅ vorhanden
    'cc_intern_lieferanten_v1': '/ccintern/lager',         // 🔴 Teil von lager
    'cc_intern_angebote_v1':    '/ccintern/angebote',      // 🔴 muss gebaut werden
    'cc_intern_anfragen_v1':    '/ccintern/anfragen',      // 🔴 muss gebaut werden
    'cc_intern_cl_vorlagen_v1': '/checklisten',
    // Legacy `CC_BENUTZER` — kein POST an Cockpit `/users`.
    'cc_intern_benutzer_v1':    '/users',
    'cc_intern_rollen_v1':      '/role-templates',         // ✅ vorhanden
  },

  configure: function(apiBase) {
    this._apiBase = (apiBase || '').replace(/\/$/, '');
    this._local   = window.CCIntern.LocalStorageAdapter;
    console.info('SyncAdapter konfiguriert:', this._apiBase);
  },

  _endpoint: function(key) {
    var ep = this._endpoints[key] || ('/' + key);
    return this._apiBase + ep;
  },

  // ── Sync-Load: sofort aus localStorage (für App-Init) ─────────
  load: function(key, fallback) {
    if (key === 'cc_intern_auftraege_v1') {
      // Aufträge niemals aus localStorage laden: nur API-geführte Daten anzeigen.
      return [];
    }
    if (this._local) return this._local.load(key, fallback);
    return fallback;
  },

  // ── Async-Load: API zuerst, localStorage als Fallback ─────────
  loadAsync: function(key, fallback, callback) {
    var self = this;
    if (key === 'cc_intern_auftraege_v1') {
      var api = window.CCIntern && window.CCIntern.cockpitApi;
      if (api && typeof api.reloadAuftraegeFromApiIntoMemory === 'function') {
        api.reloadAuftraegeFromApiIntoMemory(null).then(function(err) {
          if (callback) callback(err || null, Array.isArray(window.AUFTRAEGE) ? window.AUFTRAEGE : []);
        });
        return;
      }
      if (callback) callback(new Error('Aufträge nur über /api/v1/ccintern/auftraege ladbar'), []);
      return;
    }
    if (key === 'cc_intern_benutzer_v1') {
      var localBen = this._local ? this._local.load(key, fallback) : fallback;
      if (callback) callback(null, localBen);
      return;
    }
    if (!this._apiBase) {
      if (callback) callback(new Error('SyncAdapter: kein API-Base konfiguriert'), fallback);
      return;
    }
    fetch(this._endpoint(key), { method: 'GET' })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(data) {
        if (callback) callback(null, (data !== null && data !== undefined) ? data : fallback);
      })
      .catch(function(err) {
        console.warn('SyncAdapter.loadAsync (' + key + '):', err.message);
        if (callback) callback(err, fallback);
      });
  },

  // ── Dual-Write: localStorage + API (fire-and-forget für API) ──
  save: function(key, data) {
    if (key === 'cc_intern_auftraege_v1') {
      var api = window.CCIntern && window.CCIntern.cockpitApi;
      if (api && typeof api.runSaveAuftraege === 'function') {
        return api.runSaveAuftraege(null);
      }
      console.warn('SyncAdapter.save: Aufträge nur über cockpitApi.runSaveAuftraege()');
      return false;
    }
    if (key === 'cc_intern_benutzer_v1') {
      return false;
    }
    // Async zum Server senden (non-blocking)
    if (this._apiBase) {
      var endpoint = this._endpoint(key);
      fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(data),
      }).catch(function(e) {
        console.warn('SyncAdapter.save Server-Fehler (' + key + '):', e.message);
        // localStorage hat bereits gespeichert → kein Datenverlust
      });
    }
    return true;
  },

  // ── Reset: localStorage + API ─────────────────────────────────
  reset: function(key) {
    if (key === 'cc_intern_benutzer_v1') {
      if (this._local) this._local.reset(key);
      return;
    }
    if (this._local) this._local.reset(key);
    if (this._apiBase) {
      fetch(this._endpoint(key), { method: 'DELETE' }).catch(function(e) {
        console.warn('SyncAdapter.reset Server-Fehler (' + key + '):', e.message);
      });
    }
  }

};
