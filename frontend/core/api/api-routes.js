/**
 * Zentrale API-Routen (Vorbereitung Phase 3).
 *
 * WICHTIG:
 * - Nur zentrale Definitionen, noch keine Umstellung der Aufrufer.
 * - Pfade hier sind absichtlich explizit und ohne Magie.
 * - Unsichere/zu verifizierende Pfade sind unten separat markiert.
 */

export const API_V1 = '/api/v1';

/**
 * Primäre, aktuell aktive Routen.
 * (Stand anhand Backend-Router geprüft: server.js + api-v1.js + invite-public.js)
 */
export const API_ROUTES = {
  auth: {
    login: '/auth/login',
    myRights: `${API_V1}/auth/my-rights`,
    me: '/auth/me',
    invitePublic: (token) => `/invites/${encodeURIComponent(String(token ?? ''))}`,
    inviteActivate: (token) => `/invites/${encodeURIComponent(String(token ?? ''))}/activate`,
  },

  cockpit: {
    projects: `${API_V1}/projects`,
    users: `${API_V1}/users`,
    firmen: `${API_V1}/firmen`,
    invites: `${API_V1}/invites`,
    roleTemplates: `${API_V1}/role-templates`,
  },

  fusa: {
    auftraege: `${API_V1}/fusa/auftraege`,
    fahrzeuge: `${API_V1}/fusa/fahrzeuge`,
    angebote: `${API_V1}/fusa/angebote`,
    rechnungen: `${API_V1}/fusa/rechnungen`,
    schaeden: `${API_V1}/schaeden`,
    auftraegeFormMeta: `${API_V1}/fusa/auftraege/form-meta`,
    auftraegeKalkulation: `${API_V1}/fusa/auftraege/kalkulation`,
    auftraegeVerfuegbareFahrzeuge: `${API_V1}/fusa/auftraege/verfuegbare-fahrzeuge`,
  },

  ccintern: {
    auftraege: `${API_V1}/ccintern/auftraege`,
    angebote: `${API_V1}/ccintern/angebote`,
    rechnungen: `${API_V1}/ccintern/rechnungen`,
    kunden: `${API_V1}/ccintern/kunden`,
    /** Firmen-Checklisten (Vorlagen); nicht unter /ccintern/checklisten */
    checklisten: `${API_V1}/checklisten`,
  },

  stammdaten: {
    kunden: `${API_V1}/stammdaten/kunden`,
    kalender: `${API_V1}/stammdaten/kalender`,
  },
};

/**
 * Sekundäre/teilweise uneinheitliche Pfade (noch verifizieren vor produktiver Nutzung).
 */
export const API_ROUTES_CANDIDATES = {
  // In Frontend teils als /api/v1/ccintern/messeflow-workspace genutzt;
  // im Backend existieren ebenfalls /api/v1/messeflow/workspace Varianten.
  ccinternMesseflowWorkspace: `${API_V1}/ccintern/messeflow-workspace`,
  messeflowWorkspace: `${API_V1}/messeflow/workspace`,
};

