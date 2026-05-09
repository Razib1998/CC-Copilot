// ══════════════════════════════════════════════════════════════════════
// CC INTERN → COCKPIT UMZUG
// Schritt 3: Bootstrap-Konfiguration (Vorbereitung — Endpunkte hier NICHT verifiziert)
// ─────────────────────────────────────────────────────────────────────
// Datei:   scripts/03_bootstrap_cockpit.js
//
// Hinweis: Die genannten Pfade sind beabsichtigte Ziele für die Cockpit-API.
// ** Endpunkte in diesem Skript NICHT verifiziert — nur Vorbereitung für spätere Integration. **
//
// Geplante Aufrufe (apiUrl = Basis inkl. /api/v1):
//   GET …/firmen
//   GET …/ccintern/kunden
//   GET …/users
//
// NICHT vorhanden (TODO — müssen noch gebaut werden):
//   /auftraege CC Intern, /mitarbeiter, /anwesenheit, /urlaub, /lager,
//   /angebote CC Intern, /anfragen, /rechnungen CC Intern, /crm-aktivitaeten
// ══════════════════════════════════════════════════════════════════════

'use strict';

/**
 * CC-Intern-Module in der Cockpit-Shell initialisieren.
 * Aufruf: wenn der CC-Intern-Tab in der Cockpit-Shell aktiviert wird.
 *
 * @param {Object} config
 * @param {string} config.apiUrl   - z.B. 'https://cc-werbung.de/api/v1'
 * @param {string} config.token    - JWT-Token aus Cockpit-Auth
 */
async function ccInternInit({ apiUrl, token }) {
  if (!apiUrl || !token) {
    console.error('[CCIntern] ccInternInit: apiUrl oder token fehlt!');
    return;
  }

  // ── 1. ApiAdapter auf Cockpit-Backend konfigurieren ──────────────
  window.CCIntern.ApiAdapter.configure(apiUrl, token);
  window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);

  // ── 2. DAL-Flags setzen ──────────────────────────────────────────
  window.DAL_USE_API     = true;
  window.DAL_BACKEND_URL = apiUrl.replace('/api/v1', '');

  // ── 3. MA_VERF In-Memory (kein localStorage nötig) ───────────────
  if (!window.MA_VERF) window.MA_VERF = {};

  console.info('[CCIntern] Bootstrap — Backend:', apiUrl);

  // ── 4. Initiale Daten laden ───────────────────────────────────────
  await ccInternLoadGlobalData(apiUrl, token);
}

/**
 * Globale Arrays aus dem Cockpit-Backend laden.
 * Endpunkte: nicht verifiziert (siehe Dateikopf).
 */
async function ccInternLoadGlobalData(apiUrl, token) {
  const headers = {
    'Content-Type':  'application/json',
    'Authorization': 'Bearer ' + token,
  };

  const get = async (path) => {
    const r = await fetch(apiUrl + path, { headers });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' für ' + path);
    return r.json();
  };

  // ── Geplante Endpunkte laden (Fehler → leere Arrays / Warnung) ───
  const [firmen, ccinternKunden, users] = await Promise.allSettled([
    get('/firmen'),            // → Cockpit-Stammdaten (alle Firmen)
    get('/ccintern/kunden'),   // → CC Intern Kunden (firmen + ccintern_kunden_extra)
    get('/users'),             // → Benutzer (für MITARBEITER_MAP)
  ]);

  if (firmen.status === 'fulfilled') {
    window.COCKPIT_FIRMEN = firmen.value?.firmen ?? firmen.value ?? [];
    // Für CRM_KUNDEN (Format: { firmaId: {...} } oder Array — je nach View)
    window.CRM_KUNDEN = window.COCKPIT_FIRMEN;
  } else {
    console.warn('[CCIntern] /firmen nicht geladen:', firmen.reason?.message);
    window.COCKPIT_FIRMEN = [];
    window.CRM_KUNDEN = [];
  }

  if (ccinternKunden.status === 'fulfilled') {
    window.CCINTERN_KUNDEN = ccinternKunden.value?.kunden ?? ccinternKunden.value ?? [];
  } else {
    console.warn('[CCIntern] /ccintern/kunden nicht geladen:', ccinternKunden.reason?.message);
    window.CCINTERN_KUNDEN = [];
  }

  if (users.status === 'fulfilled') {
    window.COCKPIT_USERS = users.value?.users ?? users.value ?? [];
    // Mitarbeiter-Map aufbauen: name → id (für Aktivitäten-Zuordnung)
    window.MA_ID_MAP = {};
    for (const u of window.COCKPIT_USERS) {
      if (u.name) window.MA_ID_MAP[u.name] = u.id;
    }
  } else {
    console.warn('[CCIntern] /users nicht geladen:', users.reason?.message);
    window.COCKPIT_USERS = [];
    window.MA_ID_MAP = {};
  }

  // ── NOCH NICHT VORHANDENE ENDPUNKTE → leere Arrays ───────────────
  // Diese müssen im Backend noch gebaut werden:
  window.AUFTRAEGE       = [];   // TODO: GET /api/v1/ccintern/auftraege (noch nicht gebaut)
  window.MA_DATA         = [];   // TODO: GET /api/v1/employees (noch nicht gebaut)
  window.MA_ANWESENHEIT  = [];   // TODO: GET /api/v1/time-entries (noch nicht gebaut)
  window.URLAUB_ANTRAEGE = [];   // TODO: GET /api/v1/absences (noch nicht gebaut)
  window.LAGER_CC        = [];   // TODO: GET /api/v1/inventory (noch nicht gebaut)
  window.LIEFERANTEN     = [];   // TODO: GET /api/v1/inventory (Lieferanten-Teil)
  window.AG_DATEN        = [];   // TODO: GET /api/v1/ccintern/angebote (noch nicht gebaut)
  window.ANF_DATEN       = [];   // TODO: GET /api/v1/inquiries (noch nicht gebaut)
  window.LEADS           = [];   // TODO: GET /api/v1/inquiries (noch nicht gebaut)
  window.CC_FUSA_TERMINE = [];   // TODO: GET /api/v1/fusa/vehicles (für Kalender)
  window.CC_NOTIF_DATA   = [];   // TODO: GET /api/v1/notifications (noch nicht gebaut)

  console.info('[CCIntern] Daten geladen:',
    'COCKPIT_FIRMEN=' + (window.COCKPIT_FIRMEN?.length ?? '?'),
    'CCINTERN_KUNDEN=' + (window.CCINTERN_KUNDEN?.length ?? '?'),
    'COCKPIT_USERS=' + (window.COCKPIT_USERS?.length ?? '?')
  );

  console.info('[CCIntern] Noch leer (Endpunkte fehlen):',
    'AUFTRAEGE, MA_DATA, MA_ANWESENHEIT, URLAUB_ANTRAEGE, LAGER_CC, AG_DATEN, ANF_DATEN'
  );
}

// ══════════════════════════════════════════════════════════════════════
// EINBINDEN in Cockpit-Shell:
// ══════════════════════════════════════════════════════════════════════
//
// In cockpit-shell.js oder cc-intern-module-loader.js:
//
//   globalThis.ccInternInit(...)  // nach Laden dieses Skripts (kein ES-Modul-Export)
//
//   // Beim Aktivieren des CC-Intern-Tabs:
//   await ccInternInit({
//     apiUrl: 'https://cc-werbung.de/api/v1',
//     token:  authStore.getToken()
//   });
//
// ══════════════════════════════════════════════════════════════════════
// AUSFÜHRUNGSREIHENFOLGE GESAMT:
// ══════════════════════════════════════════════════════════════════════
//
// 1. 01_schema_migration.sql ausführen (ccintern_kunden_extra + crm_aktivitaeten)
// 2. SELECT id, name FROM users; → MITARBEITER_MAP in 02_import_kunden.js befüllen
// 3. node 02_import_kunden.js --output sql   → SQL prüfen
// 4. node 02_import_kunden.js --execute      → Import ausführen
// 5. 03_bootstrap_cockpit.js in Cockpit-Shell einbinden
// 6. Routing-Fix: backend/src/routes/kunden.js requireModule('fusa') → requireModule('ccintern')
// 7. Fehlende Backend-Routen bauen (Auftraege CC Intern, Mitarbeiter, etc.)
//

globalThis.ccInternInit = ccInternInit;
if (typeof module !== 'undefined' && module.exports) {
  module.exports.ccInternInit = ccInternInit;
}

