// ══════════════════════════════════════════════════════════════════════
// CC INTERN — ApiAdapter  (Backend-Stub)
// ─────────────────────────────────────────────────────────────────────
// Vorbereitung für Strato/Backend-Betrieb.
// Aktuell: Stub — alle Methoden loggen und geben Fallback zurück.
//
// Aktivierung:
//   window.CCIntern.ApiAdapter.configure('https://cc-werbung.de/api', token);
//   window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
//
// Backend muss implementieren:
//   GET  /api/<endpoint>  → JSON-Array
//   POST /api/<endpoint>  → speichert Array
//   DELETE /api/<endpoint> → löscht Datensatz
//
// Key → Endpoint Mapping:
//   cc_intern_auftraege_v1  → /auftraege
//   cc_intern_fusa_v1       → /fusa_termine
//   cc_intern_ma_v1         → /mitarbeiter
//   cc_intern_aufgaben_v1   → /aufgaben
//   cc_intern_anwesenheit_v1→ /anwesenheit
//   cc_intern_urlaub_v1     → /urlaub
//   cc_intern_leads_v1      → /leads
//   cc_intern_lager_v1      → /lager
// ══════════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

window.CCIntern.ApiAdapter = {

  _url: '',
  _token: null,

  // Key → REST-Endpunkt Mapping
  _endpoints: {
    'cc_intern_auftraege_v1':   '/auftraege',
    'cc_intern_fusa_v1':        '/fusa_termine',
    'cc_intern_ma_v1':          '/mitarbeiter',
    'cc_intern_aufgaben_v1':    '/aufgaben',
    'cc_intern_anwesenheit_v1': '/anwesenheit',
    'cc_intern_urlaub_v1':      '/urlaub',
    'cc_intern_leads_v1':       '/leads',
    'cc_intern_lager_v1':       '/lager'
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
