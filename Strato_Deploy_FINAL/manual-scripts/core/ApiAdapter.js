// ══════════════════════════════════════════════════════════════════════
// CC INTERN — ApiAdapter  (Cockpit-Backend)
// ─────────────────────────────────────────────────────────────────────
// UMZUG-VERSION: Key-Mapping auf /api/v1/* angepasst (Cockpit-Backend)
//
// Aktivierung:
//   window.CCIntern.ApiAdapter.configure('https://cc-werbung.de/api/v1', token);
//   window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
//
// Backend implementiert:
//   GET    /api/v1/<endpoint>  → JSON-Array
//   POST   /api/v1/<endpoint>  → speichert Array
//   DELETE /api/v1/<endpoint>  → löscht Datensatz
//
// Key → Endpoint Mapping (aktualisiert für Cockpit-Backend):
//   cc_intern_auftraege_v1   → /orders
//   cc_intern_fusa_v1        → /fusa/vehicles
//   cc_intern_ma_v1          → /employees
//   cc_intern_aufgaben_v1    → /tasks
//   cc_intern_anwesenheit_v1 → /time-entries
//   cc_intern_urlaub_v1      → /absences
//   cc_urlaub_v1             → /absences
//   cc_intern_leads_v1       → /inquiries
//   cc_intern_lager_v1       → /inventory
//   cc_intern_rechnungen_v1  → /invoices
//   cc_intern_kunden_v1      → /customers
//   cc_intern_kunden_v2      → /customers
//   cc_intern_angebote_v1    → /offers
//   cc_intern_anfragen_v1    → /inquiries
//   cc_intern_cl_vorlagen_v1 → /checklist-templates
//   cc_intern_benutzer_v1    → (kein Cockpit-Users-Sync; Legacy nur im Client)
//   cc_intern_rollen_v1      → /roles
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

/** Phase 1: CC Intern lädt operative Daten nur über API (kein LocalStorage-DAL). */
var DAL_USE_API = true;
window.CCIntern.DAL_USE_API = DAL_USE_API;

window.CCIntern.ApiAdapter = {

  _url: '',
  _token: null,

  // Key → REST-Endpunkt Mapping (Cockpit-Backend /api/v1/ccintern/*)
  // Verifizierte Endpunkte: ✅ = vorhanden | 🔴 = muss noch gebaut werden
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
    'cc_intern_angebote_v1':    '/ccintern/angebote',      // 🔴 muss gebaut werden
    'cc_intern_anfragen_v1':    '/ccintern/anfragen',      // 🔴 muss gebaut werden
    'cc_intern_cl_vorlagen_v1': '/checklisten',            // ✅ /api/v1/checklisten
    // Legacy `CC_BENUTZER` (module/benutzer/index.js) — kein POST an Cockpit `/users`.
    'cc_intern_benutzer_v1':    '/users',
    'cc_intern_rollen_v1':      '/role-templates',         // ✅ vorhanden
    'cc_intern_lieferanten_v1': '/ccintern/lager',         // 🔴 Teil von lager
  },

  configure: function(apiUrl, userToken) {
    this._url   = apiUrl   || '';
    this._token = userToken || null;
    console.info('ApiAdapter konfiguriert:', this._url);
  },

  _endpoint: function(key) {
    return this._endpoints[key] || ('/' + key);
  },

  _headers: function() {
    var h = { 'Content-Type': 'application/json' };
    if (this._token) h['Authorization'] = 'Bearer ' + this._token;
    return h;
  },

  _unwrapBody: function(raw) {
    if (raw && typeof raw === 'object' && raw.success === true && Object.prototype.hasOwnProperty.call(raw, 'data')) {
      return raw.data;
    }
    return raw;
  },

  // Sync load — nicht unterstützt für API, gibt fallback zurück
  load: function(key, fallback) {
    if (key === 'cc_intern_auftraege_v1') return [];
    console.warn('ApiAdapter.load: synchroner Aufruf nicht unterstützt — bitte loadAsync() verwenden');
    return fallback;
  },

  // Async load mit callback(err, data)
  loadAsync: function(key, fallback, callback) {
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
    if (key === 'cc_intern_cl_vorlagen_v1') {
      var capi = window.CCIntern && window.CCIntern.cockpitApi;
      if (capi && typeof capi.reloadChecklistenVorlagenFromApi === 'function') {
        capi.reloadChecklistenVorlagenFromApi(null).then(function(err) {
          var rows = typeof window !== 'undefined' && Array.isArray(window.CL_VORLAGEN) ? window.CL_VORLAGEN : [];
          if (callback) callback(err || null, rows.slice());
        });
        return;
      }
      if (callback) callback(new Error('Checklisten nur über /api/v1/checklisten (Cockpit) ladbar'), fallback);
      return;
    }
    if (key === 'cc_intern_benutzer_v1') {
      if (callback) callback(null, fallback);
      return;
    }
    if (!this._url) {
      console.warn('ApiAdapter: keine URL konfiguriert — Fallback wird verwendet');
      if (callback) callback(new Error('ApiAdapter nicht konfiguriert'), fallback);
      return;
    }
    var endpoint = this._endpoint(key);
    fetch(this._url + endpoint, {
      method: 'GET',
      headers: this._headers()
    })
      .then(function(r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function(raw) {
        var data = window.CCIntern.ApiAdapter._unwrapBody(raw);
        if (callback) callback(null, data);
      })
      .catch(function(e) {
        console.warn('ApiAdapter.loadAsync FEHLER (' + key + '):', e.message);
        if (callback) callback(e, fallback);
      });
  },

  save: function(key, data) {
    if (key === 'cc_intern_auftraege_v1') {
      var api = window.CCIntern && window.CCIntern.cockpitApi;
      if (api && typeof api.runSaveAuftraege === 'function') {
        return api.runSaveAuftraege(null);
      }
      console.warn('ApiAdapter.save: Aufträge nur über cockpitApi.runSaveAuftraege()');
      return;
    }
    if (key === 'cc_intern_cl_vorlagen_v1') {
      var capiSave = window.CCIntern && window.CCIntern.cockpitApi;
      var toast =
        typeof window !== 'undefined' && typeof window._ccShowToast === 'function'
          ? window._ccShowToast
          : typeof showToast === 'function'
            ? showToast
            : null;
      if (capiSave && typeof capiSave.saveChecklistenVorlagenToApi === 'function') {
        capiSave.saveChecklistenVorlagenToApi(toast).catch(function() {
          /* Fehler bereits in saveChecklistenVorlagenToApi geloggt */
        });
        return true;
      }
      console.error('[ApiAdapter] Checklisten: saveChecklistenVorlagenToApi nicht verfügbar (Cockpit).');
      return false;
    }
    if (key === 'cc_intern_benutzer_v1') {
      return false;
    }
    if (!this._url) {
      console.warn('ApiAdapter: keine URL konfiguriert — save() übersprungen');
      return;
    }
    var endpoint = this._endpoint(key);
    fetch(this._url + endpoint, {
      method: 'POST',
      headers: this._headers(),
      body: JSON.stringify(data)
    }).catch(function(e) {
      console.warn('ApiAdapter.save FEHLER (' + key + '):', e.message);
    });
  },

  reset: function(key) {
    if (key === 'cc_intern_benutzer_v1') {
      return;
    }
    if (!this._url) {
      console.warn('ApiAdapter: keine URL konfiguriert — reset() übersprungen');
      return;
    }
    var endpoint = this._endpoint(key);
    fetch(this._url + endpoint, {
      method: 'DELETE',
      headers: this._headers()
    }).catch(function(e) {
      console.warn('ApiAdapter.reset FEHLER (' + key + '):', e.message);
    });
  }

};
