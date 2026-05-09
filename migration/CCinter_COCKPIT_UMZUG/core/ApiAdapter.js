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
//   cc_intern_benutzer_v1    → /users
//   cc_intern_rollen_v1      → /roles
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

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
    'cc_intern_urlaub_v1':      '/ccintern/urlaub',        // 🔴 muss gebaut werden
    'cc_urlaub_v1':             '/ccintern/urlaub',        // 🔴 muss gebaut werden
    'cc_intern_leads_v1':       '/ccintern/anfragen',      // 🔴 muss gebaut werden
    'cc_intern_lager_v1':       '/ccintern/lager',         // 🔴 muss gebaut werden
    'cc_intern_rechnungen_v1':  '/ccintern/rechnungen',    // 🔴 muss gebaut werden
    'cc_intern_kunden_v1':      '/ccintern/kunden',        // ✅ vorhanden
    'cc_intern_kunden_v2':      '/ccintern/kunden',        // ✅ vorhanden
    'cc_intern_angebote_v1':    '/ccintern/angebote',      // 🔴 muss gebaut werden
    'cc_intern_anfragen_v1':    '/ccintern/anfragen',      // 🔴 muss gebaut werden
    'cc_intern_cl_vorlagen_v1': '/ccintern/checklisten',   // 🔴 muss gebaut werden
    'cc_intern_benutzer_v1':    '/users',                  // ✅ vorhanden
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

  // Sync load — nicht unterstützt für API, gibt fallback zurück
  load: function(key, fallback) {
    console.warn('ApiAdapter.load: synchroner Aufruf nicht unterstützt — bitte loadAsync() verwenden');
    return fallback;
  },

  // Async load mit callback(err, data)
  loadAsync: function(key, fallback, callback) {
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
      .then(function(data) {
        if (callback) callback(null, data);
      })
      .catch(function(e) {
        console.warn('ApiAdapter.loadAsync FEHLER (' + key + '):', e.message);
        if (callback) callback(e, fallback);
      });
  },

  save: function(key, data) {
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
