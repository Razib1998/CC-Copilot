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
 * @param {Object} usersResponse   - GET /api/v1/users   → { ok: true, data: { users: [...] } }
 * @param {Object} firmenResponse  - GET /api/v1/firmen  → { success, data: { firmen: [...] } }
 */
window.CCIntern.loadCockpitData = function(usersResponse, firmenResponse) {
  const apiUsers = Array.isArray(usersResponse?.data?.users) ? usersResponse.data.users : [];
  const apiFirmen = Array.isArray(firmenResponse?.data?.firmen) ? firmenResponse.data.firmen : [];

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

  // Users → COCKPIT_USERS + MA_ID_MAP + MA_DATA (Legacy-Felder maId/n/av/col für Mitarbeiter-App + maByID)
  if (apiUsers.length > 0) {
    window.COCKPIT_USERS = apiUsers;
    window.MA_ID_MAP = {};
    var maCols = ['#1565C0', '#2E7D32', '#6A1B9A', '#C62828', '#00695C', '#E65100'];
    function cockpitMaInitials() {
      return '?';
    }
    function resolveUserDisplayName(u, i) {
      var raw = u.name != null && String(u.name).trim() !== '' ? String(u.name).trim() : '';
      if (u.username != null && String(u.username).trim() !== '') {
        raw = raw || String(u.username).trim();
      }
      if (!raw || /^[0-9a-f]{8}-/i.test(raw)) {
        var em = u.email != null ? String(u.email).trim() : '';
        if (em && em.indexOf('@') > 0) raw = em.split('@')[0];
        else raw = 'User ' + (i + 1);
      }
      return raw;
    }
    var mappedUsers = apiUsers.map(function(u, idx) {
      var disp = resolveUserDisplayName(u, idx);
      if (disp) window.MA_ID_MAP[disp] = u.id;
      var sid = String(u.id);
      var n = disp;
      return {
        id: u.id,
        maId: sid,
        n: n,
        name: n,
        k: u.kuerzel != null ? String(u.kuerzel).trim().toUpperCase() : '',
        r: u.rolle || u.role || u.global_role || 'cc_intern',
        rolle: u.rolle || u.role || u.global_role || 'cc_intern',
        email: u.email || '',
        av: (u.kuerzel != null && String(u.kuerzel).trim() !== '')
          ? String(u.kuerzel).trim().toUpperCase()
          : cockpitMaInitials(),
        col: maCols[idx % maCols.length],
        soll: typeof u.soll === 'number' && u.soll > 0 ? u.soll : 160,
        urlaub: typeof u.urlaub === 'number' && u.urlaub >= 0 ? u.urlaub : 28,
      };
    });
    var maLive = window.CCIntern && window.CCIntern.__MA_DATA_LIVE;
    if (maLive && Array.isArray(maLive)) {
      maLive.length = 0;
      mappedUsers.forEach(function (row) {
        maLive.push(row);
      });
    }
    // Wichtig: `resolveCockpitMaIdToUserUuid` liest `window.MA_DATA`; ohne diese Zeile
    // bleibt `MA_DATA` undefined, sobald `__MA_DATA_LIVE` existiert (Auftrags-View).
    window.MA_DATA = maLive && Array.isArray(maLive) && maLive.length ? maLive : mappedUsers;
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
  if (typeof window.CC_NOTIF_LAST_SEEN === 'undefined') window.CC_NOTIF_LAST_SEEN = '';
};

// ── CC Intern initialisieren ──────────────────────────────────────
/**
 * Rendert CC Intern in den angegebenen Container.
 * @param {HTMLElement} container - DOM-Element für das Rendering
 * @param {{ cockpitInitialNav?: { id: string, title?: string, sub?: string } }} [initOpts] — Cockpit: gewünschte erste Legacy-Seite (Sidebar-Key → SHELL_TO_LEGACY), kein zweites goPage aus der Brücke.
 */
window.CCIntern.init = function(container, initOpts) {
  if (!container) {
    console.error('[CCIntern] init: kein Container angegeben');
    return;
  }

  // HTML-Shell rendern
  container.innerHTML = window.CCIntern.templates.getShellHTML();

  // Initialisierung nach DOM-Einfügen
  setTimeout(function() {
    /** Mobile Shell: gleiche Daten/API wie Desktop — hier nur Desktop-Startrenderer auslassen, kein eigener DAL. */
    var maBoot = typeof window !== 'undefined' && window.__CCINTERN_MITARBEITER_APP_BOOT__;
    // Module initialisieren (falls vorhanden)
    // renderDashboard bewusst nach goPage: schreibt nur in #pg-dashboard wenn diese Seite aktiv ist
    if (!maBoot) {
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
    }
    if (typeof initMitarbeiterApp === 'function')  initMitarbeiterApp();

    if (typeof goPage === 'function') {
      var cin = initOpts && initOpts.cockpitInitialNav;
      if (window.__CCINTERN_COCKPIT_MOUNT__ && cin && cin.id) {
        goPage(cin.id, null, cin.title || '', cin.sub || '');
        if (cin.id === 'checklisten' && typeof window.renderChecklisten === 'function') {
          window.requestAnimationFrame(function () {
            try {
              window.renderChecklisten();
            } catch {
              /* optional */
            }
          });
        }
      } else {
        goPage('dashboard', null, 'Dashboard', 'CC Intern Übersicht');
      }
    }

    if (!maBoot && typeof renderDashboard === 'function') {
      renderDashboard();
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
 *   2. window.CCIntern.cockpitBoot(currentUserId, containerEl, initialNav);
 *
 * @param {string|number} cockpitUserId - ID des eingeloggten Cockpit-Nutzers
 * @param {HTMLElement}   container     - DOM-Container für CC Intern Rendering
 * @param {{ id: string, title?: string, sub?: string }} [initialNav] — Erste Legacy-Seite (z. B. Angebote), sonst Dashboard
 */
window.CCIntern.cockpitBoot = function(cockpitUserId, container, initialNav) {
  // Cockpit-Kontext: nur innerhalb des Cockpit-Containers — nicht document.body anfassen
  if (container && container.classList) {
    container.classList.add('cc-intern-root', 'ckp-module');
    if (window.__CCINTERN_COCKPIT_MOUNT__) {
      container.classList.add('cc-intern-cockpit');
    }
  }

  // Eingeloggten Cockpit-User als aktiven MA setzen
  if (cockpitUserId && window.MA_DATA && window.MA_DATA.length > 0) {
    var cockpitUser = window.MA_DATA.find(function(u) {
      return String(u.id) === String(cockpitUserId) || String(u.maId) === String(cockpitUserId);
    });
    if (cockpitUser) {
      window.CURRENT_USER_ID   = String(cockpitUserId);
      window.CURRENT_USER_NAME = cockpitUser.n || cockpitUser.name || String(cockpitUserId);
      window.CURRENT_USER_ROLE = cockpitUser.r || cockpitUser.rolle || '';
    }
  } else {
    window.CURRENT_USER_ID = String(cockpitUserId || '');
  }

  // DataService: im Cockpit kein LocalStorage-Adapter (Aufträge → cockpitApi); sonst Legacy-DAL.
  if (
    !window.__CCINTERN_COCKPIT_MOUNT__ &&
    window.CCIntern.DataService &&
    typeof window.CCIntern.DataService.setAdapter === 'function' &&
    window.CCIntern.LocalStorageAdapter
  ) {
    window.CCIntern.DataService.setAdapter(window.CCIntern.LocalStorageAdapter);
  }

  // CC Intern starten — eine goPage-Quelle: init (kein Race mit separater Brücken-goPage)
  window.CCIntern.init(
    container,
    initialNav && initialNav.id
      ? { cockpitInitialNav: initialNav }
      : undefined,
  );
  window.setTimeout(function() {
    if (typeof window.mobApplyCockpitUser === 'function') {
      window.mobApplyCockpitUser(cockpitUserId);
    }
    if (typeof window.dalInit === 'function') {
      window.dalInit();
    }
    if (
      typeof window !== 'undefined' &&
      window.__CCINTERN_MITARBEITER_APP_BOOT__ &&
      typeof window.maRunBootDiagnose === 'function'
    ) {
      window.maRunBootDiagnose();
    }
  }, 0);
  console.log('[CCIntern] Cockpit-Boot abgeschlossen, User:', cockpitUserId);
};

// Rückwärtskompatibilität
function ccInternCockpitBoot(cockpitUserId, container) {
  return window.CCIntern.cockpitBoot(cockpitUserId, container);
}
function ccInternLoadCockpitData(usersResponse, firmenResponse) {
  return window.CCIntern.loadCockpitData(usersResponse, firmenResponse);
}
