// ═══════════════════════════════════════════════════════════════════
// CC INTERN — Entry Point für CC Cockpit Integration
// Einstiegspunkt: window.CCIntern.init(container)
//                 window.CCIntern.cockpitBoot(userId, container)
//                 window.CCIntern.loadCockpitData(usersResp, firmenResp)
// ═══════════════════════════════════════════════════════════════════

window.CCIntern = window.CCIntern || {};

// ── Cockpit-Daten in CC Intern laden ─────────────────────────────
/**
 * Befüllt die globalen Arrays aus Cockpit-API-Antworten.
 * Muss VOR cockpitBoot() aufgerufen werden.
 *
 * @param {Object} usersResponse   - GET /api/v1/users   → { users: [...] }
 * @param {Object} firmenResponse  - GET /api/v1/firmen  → { firmen: [...] }
 */
window.CCIntern.loadCockpitData = function(usersResponse, firmenResponse) {
  const apiUsers  = Array.isArray(usersResponse?.users)   ? usersResponse.users   : [];
  const apiFirmen = Array.isArray(firmenResponse?.firmen)  ? firmenResponse.firmen  : [];

  // Firmen → COCKPIT_FIRMEN + CRM_KUNDEN
  if (apiFirmen.length > 0) {
    window.COCKPIT_FIRMEN = apiFirmen;
    window.CRM_KUNDEN     = apiFirmen;
    window.CCINTERN_KUNDEN = apiFirmen.map(function(f) {
      return {
        id:      'kd-ckp-' + f.id,
        firmaId: String(f.id),
        name:    f.name || f.firmenname || String(f.id),
        typ:     f.typ  || 'extern',
        aktiv:   f.aktiv !== false
      };
    });
    console.info('[CCIntern] loadCockpitData: COCKPIT_FIRMEN=', apiFirmen.length);
  }

  // Users → COCKPIT_USERS + MA_ID_MAP + MA_DATA
  if (apiUsers.length > 0) {
    window.COCKPIT_USERS = apiUsers;
    window.MA_ID_MAP = {};
    window.MA_DATA = apiUsers.map(function(u) {
      if (u.name) window.MA_ID_MAP[u.name] = u.id;
      return {
        id:    u.id,
        name:  u.name  || u.username || String(u.id),
        rolle: u.rolle || u.role     || 'cc_intern',
        email: u.email || ''
      };
    });
    console.info('[CCIntern] loadCockpitData: COCKPIT_USERS=', apiUsers.length);
  }

  // Noch nicht vorhandene Endpunkte → leere Arrays (Backend TODO)
  if (!window.AUFTRAEGE)       window.AUFTRAEGE       = [];
  if (!window.AG_DATEN)        window.AG_DATEN        = [];
  if (!window.ANF_DATEN)       window.ANF_DATEN       = [];
  if (!window.LEADS)           window.LEADS           = [];
  if (!window.LAGER_CC)        window.LAGER_CC        = [];
  if (!window.LIEFERANTEN)     window.LIEFERANTEN     = [];
  if (!window.URLAUB_ANTRAEGE) window.URLAUB_ANTRAEGE = [];
  if (!window.MA_ANWESENHEIT)  window.MA_ANWESENHEIT  = [];
  if (!window.MA_VERF)         window.MA_VERF         = {};
  if (!window.CC_NOTIF_DATA)   window.CC_NOTIF_DATA   = [];
};

// ── CC Intern initialisieren ──────────────────────────────────────
/**
 * Rendert CC Intern in den angegebenen Container.
 * @param {HTMLElement} container - DOM-Element für das Rendering
 */
window.CCIntern.init = function(container) {
  if (!container) {
    console.error('[CCIntern] init: kein Container angegeben');
    return;
  }

  // HTML-Shell rendern
  container.innerHTML = window.CCIntern.templates.getShellHTML();

  // Initialisierung nach DOM-Einfügen
  setTimeout(function() {
    // Module initialisieren (falls vorhanden)
    if (typeof renderDashboard === 'function')     renderDashboard();
    if (typeof renderAnfragen  === 'function')     renderAnfragen();
    if (typeof renderAngebote  === 'function')     renderAngebote();
    if (typeof renderAuftraege === 'function')     renderAuftraege();
    if (typeof renderKunden    === 'function')     renderKunden();
    if (typeof renderCRM       === 'function')     renderCRM();
    if (typeof renderProduktion === 'function')    renderProduktion();
    if (typeof renderLager     === 'function')     renderLager();
    if (typeof renderMitarbeiter === 'function')   renderMitarbeiter();
    if (typeof renderUrlaub    === 'function')     renderUrlaub();
    if (typeof renderRechnungen === 'function')    renderRechnungen();
    if (typeof renderChecklisten === 'function')   renderChecklisten();
    if (typeof initMitarbeiterApp === 'function')  initMitarbeiterApp();

    // Dashboard als Startseite
    if (typeof goPage === 'function') {
      goPage('dashboard', null, 'Dashboard', 'CC Intern Übersicht');
    }

    console.info('[CCIntern] init abgeschlossen');
  }, 0);
};

// ── Cockpit-Boot: Login überspringen, Cockpit-User direkt setzen ──
/**
 * Startet CC Intern im CC Cockpit-Kontext.
 * - Setzt body.ckp-module → blendet CC Intern-eigene Topbar/Sidebar aus
 * - Überspringt Login — Cockpit-User wird direkt übergeben
 * - Startet CCIntern.init(container)
 *
 * Aufruf aus Cockpit:
 *   1. window.CCIntern.loadCockpitData(usersResp, firmenResp);
 *   2. window.CCIntern.cockpitBoot(currentUserId, containerEl);
 *
 * @param {string|number} cockpitUserId - ID des eingeloggten Cockpit-Nutzers
 * @param {HTMLElement}   container     - DOM-Container für CC Intern Rendering
 */
window.CCIntern.cockpitBoot = function(cockpitUserId, container) {
  // Cockpit-Kontext: CSS blendet standalone Sidebar + Topbar aus
  document.body.classList.add('ckp-module');

  // Eingeloggten Cockpit-User als aktiven MA setzen
  if (cockpitUserId && window.MA_DATA && window.MA_DATA.length > 0) {
    var cockpitUser = window.MA_DATA.find(function(u) {
      return String(u.id) === String(cockpitUserId);
    });
    if (cockpitUser) {
      window.CURRENT_USER_ID   = String(cockpitUserId);
      window.CURRENT_USER_NAME = cockpitUser.name;
      window.CURRENT_USER_ROLE = cockpitUser.rolle;
    }
  } else {
    window.CURRENT_USER_ID = String(cockpitUserId || '');
  }

  // ApiAdapter auf Cockpit-Backend konfigurieren
  var cockpitApiUrl = window.CC_INTERN_COCKPIT_API || 'http://localhost:5371';
  if (window.CCIntern.ApiAdapter && typeof window.CCIntern.ApiAdapter.configure === 'function') {
    window.CCIntern.ApiAdapter.configure(cockpitApiUrl, null, 'cc_intern_state');
  }
  if (window.CCIntern.DataService && typeof window.CCIntern.DataService.setAdapter === 'function') {
    window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
  }

  // CC Intern starten
  window.CCIntern.init(container);
  console.log('[CCIntern] Cockpit-Boot abgeschlossen, User:', cockpitUserId);
};

// Rückwärtskompatibilität
function ccInternCockpitBoot(cockpitUserId, container) {
  return window.CCIntern.cockpitBoot(cockpitUserId, container);
}
function ccInternLoadCockpitData(usersResponse, firmenResponse) {
  return window.CCIntern.loadCockpitData(usersResponse, firmenResponse);
}
