/**
 * Phase 8 — Auth-Session + API-Aufrufe mit Bearer-Token.
 */
import { API_ROUTES, API_V1 } from '../api/api-routes.js';
import CCState from '../state/state.js';

const TOKEN_KEY = 'cc_cockpit_access_token';
const REFRESH_TOKEN_KEY = 'cc_cockpit_refresh_token';

/** Tab-Session: gleiches Projekt nach Reload & für `x-project-id`. */
export const CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY = 'cc_cockpit_active_project_id';

export function getApiBaseUrl() {
  let base = 'http://localhost:5371';
  if (typeof document !== 'undefined') {
    const m = document.querySelector('meta[name="cc-api-base"]');
    const c = m && 'content' in m ? String(/** @type {HTMLMetaElement} */ (m).content).trim() : '';
    if (c) base = c.replace(/\/$/, '');
  }
  /**
   * Lokale Entwicklung auf dem Handy/LAN: HTML enthält oft `localhost:5371`.
   * Auf einem anderen Gerät zeigt `localhost` aber auf dieses Gerät, nicht auf den Dev-Rechner.
   */
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin.replace(/\/$/, '');
    const { protocol, hostname, port } = window.location;
    try {
      const u = new URL(base);
      if (
        (u.hostname === 'localhost' || u.hostname === '127.0.0.1') &&
        hostname &&
        hostname !== 'localhost' &&
        hostname !== '127.0.0.1'
      ) {
        u.hostname = hostname;
        u.port = u.port || '5371';
        u.protocol = protocol === 'https:' ? 'https:' : 'http:';
        return u.origin;
      }
    } catch {
      /* keep base */
    }
    if (base === origin) {
      if ((hostname === 'localhost' || hostname === '127.0.0.1') && port === '5370') {
        return 'http://localhost:5371';
      }
      if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
        return `${protocol === 'https:' ? 'https:' : 'http:'}//${hostname}:5371`;
      }
    }
  }
  return base;
}

export function getAccessToken() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const t = localStorage.getItem(TOKEN_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

export function setAccessToken(token) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (token == null || String(token).trim() === '') {
      localStorage.removeItem(TOKEN_KEY);
    } else {
      localStorage.setItem(TOKEN_KEY, String(token).trim());
    }
  } catch {
    /* ignore */
  }
}

function getRefreshToken() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const t = localStorage.getItem(REFRESH_TOKEN_KEY);
    return t && t.trim() ? t.trim() : null;
  } catch {
    return null;
  }
}

function setRefreshToken(token) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (token == null || String(token).trim() === '') {
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    } else {
      localStorage.setItem(REFRESH_TOKEN_KEY, String(token).trim());
    }
  } catch {
    /* ignore */
  }
}

/**
 * Access-Token aus Refresh erneuern (direktes fetch, kein apiFetch).
 * @returns {Promise<boolean>}
 */
export async function tryRefreshAccessToken() {
  const raw = getRefreshToken();
  if (!raw) {
    console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken skip — kein Refresh-Token');
    return false;
  }
  let base = getApiBaseUrl();
  base = base.replace(/\/$/, '');
  const url = base.endsWith('/api/v1') ? `${base}/auth/refresh` : `${base}/api/v1/auth/refresh`;
  console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken request', { url });
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ refresh_token: raw }),
    });
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    if (!res.ok) {
      console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken failed http', { status: res.status });
      setRefreshToken(null);
      return false;
    }
    const payload =
      data && typeof data === 'object' && data.success === true && data.data && typeof data.data === 'object'
        ? data.data
        : data && typeof data === 'object'
          ? data
          : null;
    if (!payload || !payload.access_token) {
      console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken failed — kein access_token im Body');
      setRefreshToken(null);
      return false;
    }
    setAccessToken(payload.access_token);
    if (payload.refresh_token && String(payload.refresh_token).trim()) {
      setRefreshToken(payload.refresh_token);
    } else {
      setRefreshToken(null);
    }
    console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken ok');
    return true;
  } catch (e) {
    console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken exception', {
      message: e instanceof Error ? e.message : String(e),
    });
    setRefreshToken(null);
    return false;
  }
}

export function clearSession() {
  let refreshForLogout = null;
  try {
    if (typeof localStorage !== 'undefined') {
      refreshForLogout = localStorage.getItem(REFRESH_TOKEN_KEY);
      localStorage.removeItem(REFRESH_TOKEN_KEY);
    }
  } catch {
    /* ignore */
  }
  setAccessToken(null);
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY);
    }
  } catch {
    /* ignore */
  }
  try {
    const base = getApiBaseUrl().replace(/\/$/, '');
    const body =
      refreshForLogout && String(refreshForLogout).trim()
        ? JSON.stringify({ refresh_token: String(refreshForLogout).trim() })
        : '{}';
    fetch(`${base}/auth/logout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    }).catch(() => {});
  } catch {
    /* ignore */
  }
}

/**
 * Rekonstruiert den gespeicherten API-Projektkontext (ein Aufruf pro Tab-Lebenszyklus möglich).
 * Keine Auswahl in der Cockpit-Projektliste — nur Fallback, wenn sonst keine Id gesetzt ist.
 *
 * @param {unknown} projectId
 */
export function setSessionActiveProjectId(projectId) {
  try {
    if (typeof sessionStorage === 'undefined') return;
    const id = projectId != null ? String(projectId).trim() : '';
    if (!id) {
      sessionStorage.removeItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY);
      return;
    }
    sessionStorage.setItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY, id);
  } catch {
    /* ignore */
  }
}

/**
 * Nach erfolgreichem Laden der zugänglichen Projekte (Cockpit/FUSA, GET /api/v1/projects o. ä.).
 * Keine geratenen IDs — nur Server-Liste in `CCState.cockpitAccessibleProjects` spiegeln.
 *
 * @param {unknown[]} projects
 */
export function syncCockpitAccessibleProjectsCache(projects) {
  const list = Array.isArray(projects)
    ? projects.filter((p) => p && typeof p === 'object' && /** @type {{ id?: unknown }} */ (p).id != null)
    : [];
  const minimal = list
    .map((p) => ({
      id: String(/** @type {{ id: unknown }} */ (p).id).trim(),
    }))
    .filter((o) => o.id);
  try {
    CCState.set('cockpitAccessibleProjects', minimal);
  } catch {
    /* ignore */
  }
}

/**
 * Aktuelles, real ausgewähltes Projekt aus globalem App-State.
 * Reihenfolge: (1) Cockpit-Projektauswahl, (2) FUSA-Projekt, (3) Tab-Session (`setSessionActiveProjectId`).
 * Fallback „erstes Projekt“ nur in `ensureDefaultApiProjectContextFromApi` aus `cockpitAccessibleProjects`.
 *
 * @returns {string}
 */
export function getCurrentProjectId() {
  try {
    const sel = CCState.get('cockpitProjektSelectedId');
    if (sel != null) {
      const id = String(sel).trim();
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  try {
    const p = CCState.get('project');
    if (p && typeof p === 'object' && 'id' in p && p.id != null) {
      const id = String(/** @type {{ id?: unknown }} */ (p).id).trim();
      if (id) return id;
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY);
      if (raw != null) {
        const id = String(raw).trim();
        if (id) return id;
      }
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * Pfade unter `/api/v1`, bei denen kein `x-project-id` erzwungen wird.
 * Spiegel: `backend/src/middleware/api-v1-project-context.js` → `API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES`
 * (zusätzlich: jedes `/api/v1/auth/*`).
 * @type {readonly string[]}
 */
const API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES = Object.freeze([
  '/api/v1/users',
  '/api/v1/firmen',
  '/api/v1/role-templates',
  '/api/v1/invites',
  '/api/v1/projects',
  '/api/v1/kalender',
  '/api/v1/stammdaten/kalender',
  '/api/v1/aufgaben',
  '/api/v1/logs',
  '/api/v1/cockpit/dashboard',
  '/api/v1/fusa/dashboard',
  '/api/v1/fusa/quartale',
  '/api/v1/ccintern/dashboard',
  '/api/v1/ccintern/me',
  '/api/v1/ccintern/mitarbeiter',
  '/api/v1/ccintern/checklisten-zuordnung',
  '/api/v1/urlaub',
]);

/**
 * @param {Record<string, string>} headers
 * @returns {boolean}
 */
function hasNonEmptyXProjectIdHeader(headers) {
  return (
    Object.prototype.hasOwnProperty.call(headers, 'x-project-id') &&
    String(headers['x-project-id']).trim() !== ''
  );
}

/**
 * V1-Routen, die bewusst ohne Projekt-Kontext laufen (Policy-Pfad immer `/api/v1/...`, nicht nach Base-Umrechnung).
 * @param {string} path
 * @returns {boolean}
 */
function isNoProjectRoute(path) {
  const p = String(path || '');
  if (p.startsWith('/api/v1/auth/')) return true;
  return API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES.some(function (prefix) {
    return p === prefix || p.startsWith(prefix + '/');
  });
}

/**
 * Mappt alte Root-Pfade (410 LEGACY_REMOVED am Backend) auf `/api/v1/...`.
 * Läuft nach exakten `routed`-Treffern (`/users` → bereits v1).
 * @param {string} p — Pfad beginnend mit `/`
 * @returns {string}
 */
function rewriteLegacyRootPathsToApiV1(p) {
  if (p === '/api/v1' || p.startsWith('/api/v1/')) return p;
  const v1Projects = API_ROUTES.cockpit.projects;
  if (p === '/projects' || p.startsWith('/projects/')) {
    return `${v1Projects}${p === '/projects' ? '' : p.slice('/projects'.length)}`;
  }
  if (p === '/auftraege' || p.startsWith('/auftraege/')) {
    return `${API_V1}/auftraege${p === '/auftraege' ? '' : p.slice('/auftraege'.length)}`;
  }
  if (p === '/angebote' || p.startsWith('/angebote/')) {
    return `${API_ROUTES.fusa.angebote}${p === '/angebote' ? '' : p.slice('/angebote'.length)}`;
  }
  if (p === '/kunden' || p.startsWith('/kunden/')) {
    return `${API_ROUTES.stammdaten.kunden}${p === '/kunden' ? '' : p.slice('/kunden'.length)}`;
  }
  if (p === '/fahrzeuge' || p.startsWith('/fahrzeuge/')) {
    return `${API_ROUTES.fusa.fahrzeuge}${p === '/fahrzeuge' ? '' : p.slice('/fahrzeuge'.length)}`;
  }
  if (p === '/schaeden' || p.startsWith('/schaeden/')) {
    return `${API_ROUTES.fusa.schaeden}${p === '/schaeden' ? '' : p.slice('/schaeden'.length)}`;
  }
  if (p.startsWith('/users/')) {
    return `${API_ROUTES.cockpit.users}${p.slice('/users'.length)}`;
  }
  return p;
}

/** Exakte Kurzpfade wie `apiFetch` `routed` (für Blob/FormData dieselbe Policy). */
const API_FETCH_ROUTED_EXACT = Object.freeze({
  '/users': API_ROUTES.cockpit.users,
  '/firmen': API_ROUTES.cockpit.firmen,
  '/invites': API_ROUTES.cockpit.invites,
  '/role-templates': API_ROUTES.cockpit.roleTemplates,
  '/auth/my-rights': API_ROUTES.auth.myRights,
});

/**
 * @param {string} path
 * @returns {string}
 */
function normalizeApiClientRequestPath(path) {
  let p = path.startsWith('/') ? path : `/${path}`;
  if (Object.prototype.hasOwnProperty.call(API_FETCH_ROUTED_EXACT, p)) {
    p = API_FETCH_ROUTED_EXACT[/** @type {keyof typeof API_FETCH_ROUTED_EXACT} */ (p)];
  }
  return rewriteLegacyRootPathsToApiV1(p);
}

/**
 * Erzwingt den Backend-Envelope:
 * - Erfolg: { success: true, data: ... }
 * - Fehler: { success: false, error: { code, message } }
 *
 * @param {unknown} response
 * @returns {any}
 */
export function unwrapEnvelope(response) {
  if (!response || typeof response !== 'object') {
    const err = new Error('Ungueltige API-Antwort: Envelope erwartet.');
    // @ts-ignore
    err.code = 'API_INVALID_ENVELOPE';
    throw err;
  }
  const payload = /** @type {{ success?: unknown; data?: unknown; error?: unknown; status?: unknown }} */ (response);
  if (payload.success === true) {
    return payload.data;
  }
  if (payload.success === false) {
    const errObj =
      payload.error && typeof payload.error === 'object'
        ? /** @type {{ code?: unknown; message?: unknown; status?: unknown }} */ (payload.error)
        : null;
    const msg = errObj && errObj.message != null ? String(errObj.message).trim() : 'API-Anfrage fehlgeschlagen.';
    const code = errObj && errObj.code != null ? String(errObj.code).trim() : 'API_ERROR';
    const err = new Error(msg || 'API-Anfrage fehlgeschlagen.');
    // @ts-ignore
    err.code = code || 'API_ERROR';
    if (errObj && errObj.status != null && Number.isFinite(Number(errObj.status))) {
      // @ts-ignore
      err.status = Number(errObj.status);
    } else if (payload.status != null && Number.isFinite(Number(payload.status))) {
      // @ts-ignore
      err.status = Number(payload.status);
    }
    // @ts-ignore
    err.body = response;
    throw err;
  }
  const err = new Error('Ungueltige API-Antwort: Feld "success" fehlt oder ist ungueltig.');
  // @ts-ignore
  err.code = 'API_INVALID_ENVELOPE';
  // @ts-ignore
  err.body = response;
  throw err;
}

/**
 * Normalisiert beliebige API-/Fetch-Fehler auf ein einheitliches Shape.
 *
 * @param {unknown} error
 * @returns {{ code: string; message: string; status: number | null }}
 */
export function normalizeApiError(error) {
  const fallback = { code: 'API_UNKNOWN_ERROR', message: 'Unbekannter Fehler.', status: null };
  if (error == null) return fallback;
  if (typeof error === 'string') {
    const msg = String(error).trim();
    return { code: 'API_ERROR', message: msg || fallback.message, status: null };
  }
  if (typeof error !== 'object') return fallback;
  const e = /** @type {{ code?: unknown; message?: unknown; status?: unknown; body?: unknown; error?: unknown }} */ (error);
  let status = null;
  if (e.status != null && Number.isFinite(Number(e.status))) {
    status = Number(e.status);
  } else if (
    e.body &&
    typeof e.body === 'object' &&
    'status' in /** @type {object} */ (e.body) &&
    Number.isFinite(Number(/** @type {{ status?: unknown }} */ (e.body).status))
  ) {
    status = Number(/** @type {{ status?: unknown }} */ (e.body).status);
  }

  let code = '';
  if (e.code != null) {
    code = String(e.code).trim();
  } else if (e.body && typeof e.body === 'object') {
    const b = /** @type {{ error?: unknown }} */ (e.body);
    if (b.error && typeof b.error === 'object' && /** @type {{ code?: unknown }} */ (b.error).code != null) {
      code = String(/** @type {{ code?: unknown }} */ (b.error).code).trim();
    }
  }

  if (!code) code = status === 401 ? 'AUTH_REQUIRED' : status === 403 ? 'FORBIDDEN' : 'API_ERROR';

  let message = '';
  if (e.message != null) {
    message = String(e.message).trim();
  }
  if (!message && e.body && typeof e.body === 'object') {
    const b = /** @type {{ message?: unknown; error?: unknown }} */ (e.body);
    if (b.message != null) {
      message = String(b.message).trim();
    } else if (b.error && typeof b.error === 'object' && /** @type {{ message?: unknown }} */ (b.error).message != null) {
      message = String(/** @type {{ message?: unknown }} */ (b.error).message).trim();
    }
  }
  if (!message) message = fallback.message;

  return { code, message, status };
}

/**
 * @param {string} path — z. B. `/projects`
 * @param {{ method?: string, body?: object|null, headers?: Record<string, string> }} [options]
 * @returns {Promise<any>}
 */
export async function apiFetch(path, options = {}) {
  const token = getAccessToken();
  let p = normalizeApiClientRequestPath(path);
  /** Policy immer gegen den kanonischen `/api/v1/...`-Pfad (vor Base-Strip). */
  const pathForApiV1Policy = p;
  const isApiV1Request = pathForApiV1Policy === '/api/v1' || pathForApiV1Policy.startsWith('/api/v1/');
  let base = getApiBaseUrl();
  base = base.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && p.startsWith('/api/v1')) {
    p = p.slice('/api/v1'.length) || '/';
  }
  const url = `${base}${p}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (isApiV1Request && !isNoProjectRoute(pathForApiV1Policy) && !hasNonEmptyXProjectIdHeader(headers)) {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      console.error('KEIN PROJEKT BEIM SAVE', { path: pathForApiV1Policy });
      const err = new Error('Projekt-Kontext fehlt');
      // @ts-ignore
      err.code = 'PROJECT_CONTEXT_REQUIRED';
      throw err;
    }
    headers['x-project-id'] = projectId;
  }
  /** @type {RequestInit} */
  const init = {
    method: options.method || 'GET',
    headers,
  };
  if (options.cache != null) {
    init.cache = /** @type {RequestCache} */ (options.cache);
  }
  if (options.body != null && options.method && options.method !== 'GET' && options.method !== 'HEAD') {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, init);
  const rawText = await res.text();
  let data = null;
  if (rawText.trim() !== '') {
    try {
      data = JSON.parse(rawText);
    } catch {
      data = null;
    }
  }
  if (res.status === 401 && token && !options._isRetry) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiFetch(path, { ...options, _isRetry: true });
    }
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cc:session:expired'));
    }
  }
  if (!res.ok) {
    /** @param {any} d */
    const messageFromApiBody = (d) => {
      if (!d || typeof d !== 'object') return '';
      if (d.message != null) return String(d.message).trim();
      const e = d.error;
      if (e && typeof e === 'object' && e.message != null) return String(e.message).trim();
      if (e != null && typeof e !== 'object') return String(e).trim();
      return '';
    };
    const fromJson = messageFromApiBody(data);
    const fromHtml =
      !fromJson && rawText && !data && /<title>[^<]*<\/title>/i.test(rawText)
        ? (() => {
            const m = rawText.match(/<title>([^<]*)<\/title>/i);
            return m ? `Server-Antwort (${res.status}): ${String(m[1]).trim()}` : '';
          })()
        : '';
    const msg =
      fromJson ||
      fromHtml ||
      (rawText && rawText.length < 400 && !rawText.trim().startsWith('<') ? rawText.trim() : '') ||
      res.statusText ||
      'Anfrage fehlgeschlagen';
    let err = new Error(String(msg));
    if (data && typeof data === 'object' && /** @type {{ success?: unknown }} */ (data).success === false) {
      try {
        unwrapEnvelope(data);
      } catch (e) {
        if (e instanceof Error) err = e;
      }
    }
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.body = data;
    // @ts-ignore
    err.requestUrl = url;
    throw err;
  }
  if (data && typeof data === 'object' && 'success' in data) {
    return unwrapEnvelope(data);
  }
  return data;
}

/**
 * Binärabruf (Blob), z. B. geschützte Datei-Inhalte — ohne JSON-Parsing.
 * Gemeinsame Router-/Projekt-/Auth-Politik wie `apiFetch`.
 *
 * @param {string} path
 * @param {{ method?: string }} [options]
 * @returns {Promise<Blob>}
 */
export async function apiFetchBlob(path, options = {}) {
  const token = getAccessToken();
  let p = normalizeApiClientRequestPath(path);
  const pathForApiV1Policy = p;
  const isApiV1Request = pathForApiV1Policy === '/api/v1' || pathForApiV1Policy.startsWith('/api/v1/');
  let base = getApiBaseUrl();
  base = base.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && p.startsWith('/api/v1')) {
    p = p.slice('/api/v1'.length) || '/';
  }
  const url = `${base}${p}`;
  /** @type {Record<string, string>} */
  const headers = { ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (isApiV1Request && !isNoProjectRoute(pathForApiV1Policy) && !hasNonEmptyXProjectIdHeader(headers)) {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      const err = new Error('Projekt-Kontext fehlt');
      // @ts-ignore
      err.code = 'PROJECT_CONTEXT_REQUIRED';
      throw err;
    }
    headers['x-project-id'] = projectId;
  }
  const init = {
    method: options.method || 'GET',
    headers,
  };
  const res = await fetch(url, init);
  if (res.status === 401 && token && !options._isRetry) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiFetchBlob(path, { ...options, _isRetry: true });
    }
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cc:session:expired'));
    }
  }
  if (!res.ok) {
    let msg = res.statusText || 'Anfrage fehlgeschlagen';
    try {
      const t = await res.text();
      if (t && t.trim().startsWith('{')) {
        const j = JSON.parse(t);
        const inner =
          j && typeof j === 'object' && j.error != null && typeof j.error === 'object' && j.error.message != null
            ? String(j.error.message)
            : j && typeof j === 'object' && j.message != null
              ? String(j.message)
              : '';
        if (inner) msg = inner;
      }
    } catch {
      /* ignore */
    }
    const err = new Error(msg);
    // @ts-ignore
    err.status = res.status;
    throw err;
  }
  return res.blob();
}

/**
 * Wenn noch kein Projekt für API-Header ermittelt werden kann: erstes Projekt aus
 * `CCState.cockpitAccessibleProjects` (bereits geladen, kein blindes GET, keine geratenen IDs).
 *
 * @returns {{ ok: true } | { ok: false; reason: 'no_cached_projects' }}
 */
export function ensureDefaultApiProjectContextFromApi() {
  if (getCurrentProjectId()) return { ok: true };
  const cached = CCState.get('cockpitAccessibleProjects');
  const rows = Array.isArray(cached) ? cached : [];
  const withId = rows.filter((r) => r && r.id != null && String(r.id).trim() !== '');
  if (!withId.length) return { ok: false, reason: 'no_cached_projects' };
  const pid = String(withId[0].id).trim();
  if (!pid) return { ok: false, reason: 'no_cached_projects' };
  try {
    if (
      typeof sessionStorage !== 'undefined' &&
      !sessionStorage.getItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY) &&
      withId.length > 0
    ) {
      sessionStorage.setItem(CC_COCKPIT_ACTIVE_PROJECT_SESSION_KEY, String(withId[0].id).trim());
      console.log('[PROJECT] Default Projekt gesetzt:', withId[0].id);
    }
  } catch {
    /* ignore */
  }
  setSessionActiveProjectId(pid);
  return { ok: true };
}

/**
 * Lädt GET /api/v1/projects in `cockpitAccessibleProjects` und ruft danach
 * `ensureDefaultApiProjectContextFromApi` (Tab-Session bei genau einem Projekt bzw. wenn noch keine Auswahl).
 * Kein erfundenes Projekt — nur Server-Liste. Bei Netzwerkfehler bleibt der vorherige Cache bestehen.
 *
 * @returns {Promise<{ ok: true } | { ok: false; reason: 'no_cached_projects' }>}
 */
export async function hydrateCockpitAccessibleProjectsAndEnsureContext() {
  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    const projects = Array.isArray(pr?.projects) ? pr.projects.filter((p) => p && p.id != null) : [];
    syncCockpitAccessibleProjectsCache(projects);
  } catch {
    /* offline / Auth — weiter mit evtl. vorhandenem Cache */
  }
  return ensureDefaultApiProjectContextFromApi();
}

/**
 * Multipart (ohne JSON-Content-Type), z. B. Foto-Upload.
 * @param {string} path
 * @param {{ method?: string, body?: FormData }} [options]
 * @returns {Promise<any>}
 */
export async function apiFetchFormData(path, options = {}) {
  const token = getAccessToken();
  let p = normalizeApiClientRequestPath(path);
  const pathForApiV1Policy = p;
  const isApiV1Request = pathForApiV1Policy === '/api/v1' || pathForApiV1Policy.startsWith('/api/v1/');
  let base = getApiBaseUrl();
  base = base.replace(/\/$/, '');
  if (base.endsWith('/api/v1') && p.startsWith('/api/v1')) {
    p = p.slice('/api/v1'.length) || '/';
  }
  const url = `${base}${p}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (isApiV1Request && !isNoProjectRoute(pathForApiV1Policy) && !hasNonEmptyXProjectIdHeader(headers)) {
    const projectId = getCurrentProjectId();
    if (!projectId) {
      console.error('KEIN PROJEKT BEIM SAVE', { path: pathForApiV1Policy });
      const err = new Error('Projekt-Kontext fehlt');
      // @ts-ignore
      err.code = 'PROJECT_CONTEXT_REQUIRED';
      throw err;
    }
    headers['x-project-id'] = projectId;
  }
  const init = {
    method: options.method || 'POST',
    headers,
    body: options.body instanceof FormData ? options.body : undefined,
  };
  const res = await fetch(url, init);
  let data = null;
  const ct = res.headers.get('content-type');
  if (ct && ct.includes('application/json')) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  }
  if (res.status === 401 && token && !options._isRetry) {
    const refreshed = await tryRefreshAccessToken();
    if (refreshed) {
      return apiFetchFormData(path, { ...options, _isRetry: true });
    }
    clearSession();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('cc:session:expired'));
    }
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && (data.message || data.error)) || res.statusText || 'Anfrage fehlgeschlagen';
    const err = new Error(String(msg));
    // @ts-ignore
    err.status = res.status;
    // @ts-ignore
    err.body = data;
    // @ts-ignore
    err.requestUrl = url;
    throw err;
  }
  return data;
}

/**
 * @param {string} email
 * @param {string} password
 */
export async function loginRequest(email, password) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${API_ROUTES.auth.login}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    const msg =
      (data && typeof data === 'object' && (data.message || data.error)) || 'Anmeldung fehlgeschlagen';
    throw new Error(String(msg));
  }
  if (!data || typeof data !== 'object' || !data.access_token) {
    throw new Error('Kein Zugriffstoken erhalten.');
  }
  setAccessToken(data.access_token);
  if (data.refresh_token && String(data.refresh_token).trim()) {
    setRefreshToken(data.refresh_token);
  } else {
    setRefreshToken(null);
  }
  return data;
}

/**
 * Öffentlicher Invite-Status (ohne Bearer).
 * @param {string} token
 */
/**
 * @param {unknown} err
 * @returns {string}
 */
export function formatApiErrorForUi(err) {
  const st = err && typeof err === 'object' && 'status' in err ? /** @type {any} */ (err).status : undefined;
  const reqUrl =
    err && typeof err === 'object' && 'requestUrl' in err
      ? String(/** @type {any} */ (err).requestUrl || '').trim()
      : '';
  const urlHint = reqUrl ? ` (${reqUrl})` : '';
  const body = err && typeof err === 'object' && 'body' in err ? /** @type {any} */ (err).body : null;
  let bodyMsg = '';
  if (body && typeof body === 'object') {
    if (body.message != null) bodyMsg = String(body.message).trim();
    else if (body.error && typeof body.error === 'object' && body.error.message != null) {
      bodyMsg = String(body.error.message).trim();
    } else if (body.error != null && typeof body.error !== 'object') {
      bodyMsg = String(body.error).trim();
    }
  }
  if (st === 403) return 'Keine Berechtigung (403).';
  if (st === 404) {
    if (bodyMsg) return `${bodyMsg} (404).${urlHint}`;
    return `Nicht gefunden (404).${urlHint}`;
  }
  if (st === 401) return 'Nicht angemeldet (401).';
  if (st === 500 || st === 502 || st === 503) {
    if (bodyMsg) return bodyMsg;
    if (err instanceof Error && err.message && String(err.message).trim() !== '') return err.message;
    return 'Serverfehler.';
  }
  if (err instanceof Error) return err.message;
  return 'Unbekannter Fehler.';
}

export async function fetchPublicInvite(token) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${API_ROUTES.auth.invitePublic(token)}`, {
    headers: { Accept: 'application/json' },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const norm = normalizeApiError(Object.assign(new Error('Einladung nicht gefunden.'), { status: res.status, body: data }));
    const err = new Error(norm.message);
    // @ts-ignore
    err.code = norm.code;
    // @ts-ignore
    err.status = norm.status;
    // @ts-ignore
    err.body = data;
    throw err;
  }
  if (data && typeof data === 'object' && 'success' in data) {
    return unwrapEnvelope(data);
  }
  return data;
}

/**
 * Erstaktivierung für Einladung (ohne Bearer).
 * @param {string} token
 * @param {string} password
 * @param {string} passwordConfirm
 */
export async function activateInviteAccount(token, password, passwordConfirm) {
  const base = getApiBaseUrl();
  const res = await fetch(`${base}${API_ROUTES.auth.inviteActivate(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ password, password_confirm: passwordConfirm }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const norm = normalizeApiError(Object.assign(new Error('Aktivierung fehlgeschlagen.'), { status: res.status, body: data }));
    const err = new Error(norm.message);
    // @ts-ignore
    err.code = norm.code;
    // @ts-ignore
    err.status = norm.status;
    // @ts-ignore
    err.body = data;
    throw err;
  }
  if (data && typeof data === 'object' && 'success' in data) {
    return unwrapEnvelope(data);
  }
  return data;
}

if (typeof window !== 'undefined') {
  window.ccClearSession = clearSession;
}
