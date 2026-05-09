/**
 * CC Cockpit – Global State
 * ─────────────────────────
 * Zentraler State-Container für die gesamte Anwendung.
 * Noch keine Logik – nur Grundstruktur.
 */

const CCState = (() => {

  // ── Interner State ───────────────────────────────────────────
  let _state = {
    user:    null,   // Aktuell eingeloggter Benutzer
    module:  null,   // Aktives Modul (z. B. 'fusa', 'platform')
    project: null,   // Aktives Projekt
    ui: {
      sidebarOpen: true,
      loading:     false,
    },
    /** @type {{ status: string|null, access: string|null, projectId: string|null, companyId: string|null }} Filter für Cockpit-Benutzerliste (Anzeige, siehe ccw-cockpit-listen-filter-logik.js). */
    cockpitUserListFilter: {
      status: null,
      access: null,
      projectId: null,
      companyId: null,
    },
    /** Ausgewählter Benutzer in der Benutzer-View (Detailpanel), stabilere ID aus Snapshot. */
    cockpitBenutzerSelectedId: null,
    /** @type {{ status: string|null, projectId: string|null, companyId: string|null }} Filter Einladungen (Anzeige). */
    cockpitInvitationFilter: {
      status: null,
      projectId: null,
      companyId: null,
    },
    cockpitInvitationSelectedId: null,
    /** @type {{ status: string|null, companyId: string|null }} Filter Projekte (Anzeige). */
    cockpitProjektFilter: {
      status: null,
      companyId: null,
    },
    cockpitProjektSelectedId: null,
    /**
     * Zuletzt geladene, zugängliche Projekte (GET /api/v1/projects o. Cockpit-Projektliste).
     * Nur für Kontext-Fallback — kein Ersatz für die API, keine geratenen IDs.
     * @type {{ id: string }[]}
     */
    cockpitAccessibleProjects: [],
    /** @type {{ type: string|null, status: string|null }} Filter Firmen (Anzeige; status nur wirksam wenn Snapshot Status liefert). */
    cockpitFirmaFilter: {
      type: null,
      status: null,
    },
    cockpitFirmaSelectedId: null,
    /** Ausgewählte Rolle in der Rollen-View (Detailpanel). */
    cockpitRolleSelectedId: null,
    /** FUSA Schäden: geöffnetes Schaden-Detail (Werkstatt + Fotos). */
    fusaSchadenDetailId: null,
    /** FUSA Schäden: „Schaden melden“ mit vorgewähltem Fahrzeug (von Fahrzeugakte). */
    fusaSchaedenMeldenFahrzeugId: null,
    /** FUSA Aufträge: Neuer Auftrag — Wizard soll diese Fahrzeug-ID(s) vorauswählen. */
    fusaAuftragNeuFahrzeugId: null,
    /** Nach Cross-Nav zu Aufträgen: Neu-Modal/Wizard sofort öffnen. */
    fusaAuftragNeuOpenWizard: false,
    /** FUSA Aufträge: Wizard — „Interne Notiz“ vorbelegen (z. B. Kontext aus Schaden). */
    fusaAuftragNeuInternNotiz: null,
    /**
     * Zentrale Firmen-Stammdaten (GET /api/v1/firmen) — eine Quelle für Cockpit-/FUSA-/CC-Intern-Kunden
     * und Firmenliste; siehe firmen-stamm-store.js.
     * @type {{ rows: object[], error: string|null, version: number, loadState: 'idle'|'loading'|'ok'|'error' }}
     */
    firmenStamm: {
      rows: [],
      error: null,
      version: 0,
      loadState: 'idle',
    },
  };

  // ── Getter ───────────────────────────────────────────────────
  function get(key) {
    return key ? _state[key] : { ..._state };
  }

  // ── Setter ───────────────────────────────────────────────────
  function set(key, value) {
    if (!(key in _state)) {
      console.warn(`[CCState] Unbekannter State-Key: "${key}"`);
      return;
    }
    _state[key] = value;
  }

  // ── Reset ────────────────────────────────────────────────────
  function reset() {
    _state.user    = null;
    _state.module  = null;
    _state.project = null;
    _state.ui      = { sidebarOpen: true, loading: false };
    _state.cockpitUserListFilter = {
      status: null,
      access: null,
      projectId: null,
      companyId: null,
    };
    _state.cockpitBenutzerSelectedId = null;
    _state.cockpitInvitationFilter = {
      status: null,
      projectId: null,
      companyId: null,
    };
    _state.cockpitInvitationSelectedId = null;
    _state.cockpitProjektFilter = {
      status: null,
      companyId: null,
    };
    _state.cockpitProjektSelectedId = null;
    _state.cockpitAccessibleProjects = [];
    _state.cockpitFirmaFilter = {
      type: null,
      status: null,
    };
    _state.cockpitFirmaSelectedId = null;
    _state.cockpitRolleSelectedId = null;
    _state.fusaSchadenDetailId = null;
    _state.fusaSchaedenMeldenFahrzeugId = null;
    _state.fusaAuftragNeuFahrzeugId = null;
    _state.fusaAuftragNeuOpenWizard = false;
    _state.fusaAuftragNeuInternNotiz = null;
    _state.firmenStamm = {
      rows: [],
      error: null,
      version: 0,
      loadState: 'idle',
    };
  }

  // ── Public API ───────────────────────────────────────────────
  return { get, set, reset };

})();

export default CCState;
