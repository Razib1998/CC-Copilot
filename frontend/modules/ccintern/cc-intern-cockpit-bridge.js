/**
 * CC Intern — Cockpit-Einbindung (Schritt 8/9).
 *
 * 1) `loadCcInternScripts()` — klassische Skripte (window.CCIntern)
 * 2) `ApiAdapter.configure(getApiBaseUrl()/api/v1, Bearer)` — keine feste URL
 * 3) `loadCockpitData` + `cockpitBoot` — nur innerhalb `containerEl`
 *
 * Referenz: `migration/CC Inter End/` (Layout/Verhalten), Paket: `migration/CCinter_COCKPIT_UMZUG/`.
 */
import {
  apiFetch,
  formatApiErrorForUi,
  getAccessToken,
  getApiBaseUrl,
  getCurrentProjectId,
  hydrateCockpitAccessibleProjectsAndEnsureContext,
} from '../../core/auth/cc-auth-session.js';
import { loadCcInternScripts } from './cc-intern-loader.js';
import CCState from '../../core/state/state.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {string|null|undefined} token
 * @returns {Record<string, unknown>|null}
 */
function decodeJwtPayload(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (b64.length % 4)) % 4;
    const padded = b64 + '='.repeat(padLen);
    const json = JSON.parse(atob(padded));
    return json && typeof json === 'object' ? json : null;
  } catch {
    return null;
  }
}

/**
 * @returns {string|null}
 */
export function getCurrentUserIdFromAccessToken() {
  const p = decodeJwtPayload(getAccessToken());
  if (!p) return null;
  if (p.sub != null && String(p.sub).trim() !== '') return String(p.sub).trim();
  return null;
}

/** Cockpit-Sidebar-Key → CC-Intern-`goPage`-id + Titel */
const SHELL_TO_LEGACY = /** @type {Record<string, { id: string; title: string; sub: string }>} */ ({
  cc_dashboard: { id: 'dashboard', title: 'Dashboard', sub: 'CC Intern Übersicht' },
  cc_schnellanfragen: { id: 'anfragen', title: 'Schnell-Anfragen', sub: 'Angebote in 2 Minuten' },
  cc_angebote: { id: 'angebote', title: 'Angebote', sub: 'Angebotsverwaltung' },
  cc_auftraege: { id: 'auftraege', title: 'Aufträge', sub: 'Auftragsverwaltung' },
  cc_crm: { id: 'crm', title: 'CRM', sub: 'Kunden & Aktivitäten' },
  cc_produktion: { id: 'produktion', title: 'Produktion', sub: 'Workflow & Status' },
  cc_materiallager: { id: 'lager', title: 'Materiallager', sub: 'Bestand & Nachbestellung' },
  cc_checklisten: { id: 'checklisten', title: 'Checklisten', sub: 'Vorlagen verwalten' },
  cc_mitarbeiter: { id: 'mitarbeiter', title: 'Mitarbeiter', sub: 'Team & Zeitkonto' },
  cc_urlaub: { id: 'urlaub', title: 'Urlaub & Abwesenheit', sub: 'Anträge verwalten' },
  cc_mitarbeiter_app: { id: 'mobil', title: 'Mitarbeiter-App', sub: 'Handy-Ansicht' },
  cc_rechnungen: { id: 'rechnungen', title: 'Rechnungen', sub: 'Eingangs- & Ausgangsrechnungen' },
  cc_kunden: { id: 'kunden', title: 'Kunden', sub: 'Kundenstamm & Aufträge' },
});

/**
 * @param {HTMLElement} legacyHost — Root mit `data-ccw-ccintern-legacy-host`
 * @param {{ viewKey?: string }} [opts]
 * @returns {Promise<void>}
 */
export async function runCcInternLegacyMount(legacyHost, opts) {
  if (!(legacyHost instanceof HTMLElement)) return;
  const container = legacyHost.querySelector('[data-ccw-ccintern-container]');
  if (!(container instanceof HTMLElement)) return;

  window.__CCINTERN_DAL_INIT_DONE = false;

  const viewKey = opts && opts.viewKey != null ? String(opts.viewKey) : '';

  let usersResponse;
  let firmenResponse;
  try {
    usersResponse = await apiFetch('/api/v1/users');
    firmenResponse = await apiFetch('/api/v1/firmen');
  } catch (e) {
    container.innerHTML = `<p class="ckp-api-error" role="alert">${esc(formatApiErrorForUi(e))}</p>`;
    return;
  }

  /** Gleiche Firmenzeilen wie Kunden-Stamm (`firmen-stamm-store` / GET /api/v1/firmen). */
  const firmenRowsHydrate = Array.isArray(firmenResponse?.data?.firmen)
    ? firmenResponse.data.firmen
    : Array.isArray(firmenResponse?.firmen)
      ? firmenResponse.firmen
      : [];
  if (firmenRowsHydrate.length > 0) {
    const curFs = CCState.get('firmenStamm');
    CCState.set('firmenStamm', {
      rows: firmenRowsHydrate,
      error: null,
      version: (Number(curFs.version) || 0) + 1,
      loadState: 'ok',
    });
  }
  if (typeof window !== 'undefined') {
    window.CCState = CCState;
  }

  /** Für CC-Intern-Aufträge: `firma_id` in GET/POST (Backend + `uiToApiBody`). */
  let cockpitFirmaId = null;
  /** @type {'SUPER_ADMIN'|'EXTERN'|'INTERN'} */
  let cockpitUserGlobalRole = 'INTERN';
  try {
    const meRes = await apiFetch('/auth/me');
    const cid = meRes && meRes.user && meRes.user.company_id;
    if (cid != null && String(cid).trim() !== '') cockpitFirmaId = String(cid).trim();
    const grRaw = meRes && meRes.user && meRes.user.global_role != null ? String(meRes.user.global_role).trim() : '';
    if (grRaw === 'SUPER_ADMIN' || grRaw === 'EXTERN' || grRaw === 'INTERN') {
      cockpitUserGlobalRole = grRaw;
    }
  } catch {
    /* ohne /auth/me oder ohne company_id → Firmen-Fallback */
  }
  const firmenList = firmenResponse?.data?.firmen;
  if (!cockpitFirmaId && firmenResponse && Array.isArray(firmenList) && firmenList.length > 0) {
    const rows = firmenList;
    const exact = rows.find((f) => String((f && f.name) || '').trim().toLowerCase() === 'cc werbung');
    const pick = exact || rows[0];
    if (pick && pick.id != null && String(pick.id).trim() !== '') cockpitFirmaId = String(pick.id).trim();
  }
  if (cockpitFirmaId) {
    window.COCKPIT_FIRMA_ID = cockpitFirmaId;
    window.__COCKPIT_FIRMA_ID = cockpitFirmaId;
  }

  const currentUserId = getCurrentUserIdFromAccessToken();

  window.__CCINTERN_COCKPIT_MOUNT__ = true;

  // ─ Auth-Helper für klassische Skripte (z. B. anfragen-view.js) global bereitstellen.
  //   Hintergrund: anfragen-view.js wird als classic <script> geladen. Dynamische ES-Module-Imports
  //   im Skript würden Vite dazu veranlassen, oben einen statischen `import { … } from "/@vite/client"`
  //   zu injizieren. Das Skript wäre dann als classic Script nicht parsebar (SyntaxError) und sämtliche
  //   `function`/`window.…`-Definitionen würden niemals laufen — dadurch bliebe `window.renderAnfragen`
  //   die spätere (leere) Wrapper-Version aus `module/schnell-anfragen/index.js` und es käme nie zu
  //   einem GET /api/v1/ccintern/anfragen.
  if (typeof window !== 'undefined') {
    window.CCIntern = window.CCIntern || {};
    window.CCIntern.auth = {
      apiFetch,
      getCurrentProjectId,
      hydrateCockpitAccessibleProjectsAndEnsureContext,
      cockpitUserGlobalRole,
    };
  }

  try {
    await loadCcInternScripts();
  } catch (e) {
    window.__CCINTERN_COCKPIT_MOUNT__ = false;
    container.innerHTML = `<p class="ckp-api-error" role="alert">${esc(e instanceof Error ? e.message : 'CC Intern Skripte konnten nicht geladen werden.')}</p>`;
    return;
  }

  try {
    const cockpitApi = await import('./services/ccintern-cockpit-api.js');
    window.CCIntern = window.CCIntern || {};
    window.CCIntern.cockpitApi = cockpitApi;
  } catch (e) {
    container.innerHTML = `<p class="ckp-api-error" role="alert">${esc(e instanceof Error ? e.message : 'CC Intern API-Modul konnte nicht geladen werden.')}</p>`;
    return;
  }

  if (!window.__CCINTERN_BEFOREUNLOAD_AUFTRAEGE__) {
    window.__CCINTERN_BEFOREUNLOAD_AUFTRAEGE__ = true;
    window.addEventListener('beforeunload', function () {
      if (
        window.__CCINTERN_COCKPIT_MOUNT__ &&
        window.CCIntern &&
        window.CCIntern.cockpitApi &&
        typeof window.CCIntern.cockpitApi.flushAuftraegeNow === 'function'
      ) {
        window.CCIntern.cockpitApi.flushAuftraegeNow(null);
      }
    });
  }

  const baseRaw = String(getApiBaseUrl() || '').replace(/\/$/, '');
  const apiRoot = baseRaw.endsWith('/api/v1') ? baseRaw : `${baseRaw}/api/v1`;
  const token = getAccessToken();
  if (window.CCIntern && window.CCIntern.ApiAdapter && typeof window.CCIntern.ApiAdapter.configure === 'function') {
    window.CCIntern.ApiAdapter.configure(apiRoot, token);
  }
  if (window.CCIntern && window.CCIntern.DataService && window.CCIntern.ApiAdapter) {
    window.CCIntern.DataService.setAdapter(window.CCIntern.ApiAdapter);
  }

  const ci = typeof window !== 'undefined' ? window.CCIntern : null;
  if (!ci || typeof ci.cockpitBoot !== 'function') {
    container.innerHTML = `<p class="ckp-api-error" role="alert">CC Intern: <code>window.CCIntern.cockpitBoot</code> fehlt nach Skript-Ladung.</p>`;
    return;
  }

  container.innerHTML = '';
  if (typeof ci.loadCockpitData === 'function') {
    ci.loadCockpitData(usersResponse, firmenResponse);
  }
  const nav = viewKey && SHELL_TO_LEGACY[viewKey] ? SHELL_TO_LEGACY[viewKey] : SHELL_TO_LEGACY.cc_dashboard;
  ci.cockpitBoot(currentUserId, container, nav);
}
