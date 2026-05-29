/**
 * MesseFlow im CC-Cockpit (nur Inhalts-Slot): Shell-HTML injizieren, Daten laden, booten.
 */
import {
  apiFetch,
  apiFetchFormData,
  formatApiErrorForUi,
  getAccessToken,
  getApiBaseUrl,
} from '../../core/auth/cc-auth-session.js';
import { loadMyRights, myRight } from '../../core/access/cc-my-rights.js';
import { loadCcInternScripts } from '../ccintern/cc-intern-loader.js';
import { getCurrentUserIdFromAccessToken } from '../ccintern/cc-intern-cockpit-bridge.js';
import { loadMesseflowScripts } from './messeflow-loader.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Lange Freitexte in auditLog/notifs — verhindert riesige PUT-Bodies. */
function mfShortenText(v) {
  if (typeof v === 'string' && v.length > 500) return v.slice(0, 500) + '…';
  return v;
}

const MF_SAVE_LOG_STRING_DEPTH = 6;

function mfTruncateStringsDeep(val, depth) {
  if (depth <= 0) return val;
  if (typeof val === 'string') return mfShortenText(val);
  if (val == null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((x) => mfTruncateStringsDeep(x, depth - 1));
  const out = {};
  for (const k of Object.keys(val)) {
    out[k] = mfTruncateStringsDeep(val[k], depth - 1);
  }
  return out;
}

function messeflowEmbedInnerHtml() {
  return [
    '<div class="mf-cockpit-embed ckp-module" data-mf-root="1" data-ccw-ro="messeflow-embed">',
    '<div id="mf-invite-gate" style="display:none!important" aria-hidden="true">',
    '<div id="mf-invite-gate-inner"></div></div>',
    '<div id="mf-login-gate" style="display:none!important" aria-hidden="true">',
    '<div id="mf-login-gate-inner"></div></div>',
    '<div id="topbar" aria-hidden="true">',
    '<button id="mb-btn" type="button" style="display:none" onclick="document.getElementById(\'sidebar\').classList.toggle(\'open\')">☰</button>',
    '<div class="brand">Messe<span>Flow</span></div>',
    '<div id="testmodus-badge" style="display:none;background:#fef3c7;border:1px solid #f59e0b;border-radius:6px;padding:3px 9px;font-size:11px;font-weight:700;color:#92400e;" title="Test-Modus">🧪 TEST-MODUS</div>',
    '<div id="role-display" class="role-pill-active"></div>',
    '<div id="mf-module-bar" class="mf-module-bar" aria-label="Module wechseln"></div>',
    '<select id="role-sel" onchange="setUser(this.value)" style="display:none;padding:4px 8px;border:1px solid #f59e0b;border-radius:6px;font-size:12px;background:#fef3c7;color:#92400e;font-weight:600;" title="Benutzer wechseln"></select>',
    '<div id="server-status-indicator" style="padding:4px 10px;border-radius:6px;border:1px solid var(--line);background:#fafafa;cursor:pointer;" onclick="openServerConfig()" title="Prüf-Server">',
    '<span style="color:var(--muted);font-size:11px;">⏳ Server…</span></div>',
    '<button type="button" class="btn ghost" id="notif-btn" onclick="toggleNotif()" style="padding:5px 10px;font-size:13px;">🔔<span id="notif-badge">0</span></button>',
    '<button type="button" class="btn ghost sm" id="mf-devices-btn" onclick="mfOpenMyDevicesModal()" style="display:none;padding:5px 10px;font-size:12px;">🖥️</button>',
    '<button type="button" class="btn ghost sm" id="mf-logout-btn" onclick="mfLogout()" style="display:none;padding:5px 10px;font-size:12px;">Abmelden</button>',
    '<span id="speicher-badge" style="display:none;align-items:center;justify-content:center;min-width:18px;height:18px;padding:0 5px;border-radius:999px;background:#1d4ed8;color:#fff;font-size:10px;font-weight:800;margin-left:6px;">0</span>',
    '</div>',
    '<div id="notif-panel">',
    '<div class="nh"><span>Benachrichtigungen</span><button type="button" class="btn sm ghost" onclick="markAllRead()">Gelesen</button></div>',
    '<div id="notif-list"></div></div>',
    '<div id="shell">',
    '<aside id="sidebar">',
    '<h3>Projekte</h3>',
    '<div id="proj-list"></div>',
    '<button type="button" id="add-proj" onclick="openNewProjModal()">+ Neues Projekt</button>',
    '<button type="button" id="mf-sidebar-excel-btn" class="btn ghost sm" style="margin-top:4px;text-align:center;border-style:dashed;" onclick="document.getElementById(\'xl-sidebar-input\').click()">📊 Excel importieren</button>',
    '<input type="file" id="xl-sidebar-input" accept=".xlsx,.xls,.csv" style="display:none" onchange="importExcel(event,\'__new__\')">',
    '</aside>',
    '<main id="main"><div id="view">',
    '<div style="color:var(--muted);text-align:center;padding:60px 0;font-size:15px;">← Projekt auswählen</div>',
    '</div></main></div>',
    '<div id="toasts"></div>',
    '<div id="modal-bg" onclick="closeMBG(event)"><div id="modal-box"><h2 id="modal-h"></h2><div id="modal-c"></div></div></div>',
    '</div>',
  ].join('');
}

function loadExternalScriptOnce(src) {
  return new Promise((resolve, reject) => {
    let abs = src;
    try {
      abs = new URL(src, window.location.href).href;
    } catch {
      /* keep src */
    }
    const existing = Array.from(document.querySelectorAll('script[src]')).some((s) => s.src === abs);
    if (existing) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`Skript konnte nicht geladen werden: ${src}`));
    document.head.appendChild(s);
  });
}

async function ensureMesseflowVendorLibs() {
  if (typeof XLSX === 'undefined') {
    await loadExternalScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js');
  }
  if (typeof pdfjsLib === 'undefined') {
    await loadExternalScriptOnce('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    try {
      pdfjsLib.GlobalWorkerOptions.workerSrc =
        'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    } catch {
      /* optional */
    }
  }
}

/**
 * @param {HTMLElement} containerEl
 * @returns {Promise<void>}
 */
export async function runMesseflowCockpitMount(containerEl) {
  if (!(containerEl instanceof HTMLElement)) return;

  window.__MF_COCKPIT_EMBED = true;
  window.__mfResolveCockpitApiOrigin = function () {
    return String(getApiBaseUrl() || '').replace(/\/$/, '');
  };

  containerEl.innerHTML = `<p class="ckp-mock-note" data-ccw-ro="messeflow-loading">MesseFlow wird geladen…</p>`;

  let usersResponse;
  let firmenResponse;
  try {
    await loadCcInternScripts();
    usersResponse = await apiFetch('/api/v1/users');
    firmenResponse = await apiFetch('/api/v1/firmen');
  } catch (e) {
    containerEl.innerHTML = `<p class="ckp-api-error" role="alert">${esc(formatApiErrorForUi(e))}</p>`;
    return;
  }

  if (window.CCIntern && typeof window.CCIntern.loadCockpitData === 'function') {
    window.CCIntern.loadCockpitData(usersResponse, firmenResponse);
  }

  await ensureMesseflowVendorLibs();

  containerEl.innerHTML = messeflowEmbedInnerHtml();

  let rightsBundle = null;
  try {
    rightsBundle = await loadMyRights(true);
  } catch {
    rightsBundle = null;
  }
  // Fehlendes/fehlerhaftes Rechte-Bundle: kein Vollzugriff (kein SUPER_ADMIN-Fallback).
  if (!rightsBundle || !rightsBundle.rights) {
    rightsBundle = { global_role: 'NONE', rights: {} };
  }
  window.__mfCockpitRightsBundle = rightsBundle;
  window.mfCockpitMesseflowRight = function (flag) {
    return myRight(rightsBundle, 'ccintern', 'messeflow', String(flag || ''));
  };

  /* Versehentlich Cockpit-API oder localhost:3030 (CORS vom Frontend) als Prüf-URL */
  try {
    const api = String(getApiBaseUrl() || '').replace(/\/+$/, '');
    const cur = localStorage.getItem('mf_server_url');
    const c = cur != null ? String(cur).trim().replace(/\/+$/, '') : '';
    if (c && api && c === api) localStorage.removeItem('mf_server_url');
    if (c && /^https?:\/\/(127\.0\.0\.1|localhost):3030$/i.test(c)) {
      localStorage.removeItem('mf_server_url');
    }
  } catch {
    /* ignore */
  }

  window.__mfApiFetchFormData = apiFetchFormData;

  window.__mfPruefFetch = function mfPruefFetchWithBearer(url, init = {}) {
    const token = getAccessToken();
    const headers = new Headers(init.headers ?? undefined);
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(url, { ...init, headers });
  };

  window.__mfSaveMesseflowWorkspace = async function mfSaveMesseflowWorkspace() {
    if (!window.__MF_COCKPIT_EMBED) return;
    const { apiFetch } = await import('../../core/auth/cc-auth-session.js');
    const st = typeof window.MesseFlowState !== 'undefined' ? window.MesseFlowState : null;
    if (!st) return;
    const payload = {
      projects: Array.isArray(st.projects) ? st.projects : [],
      notifs: Array.isArray(st.notifs) ? st.notifs : [],
      auditLog: Array.isArray(st.auditLog) ? st.auditLog : [],
    };
    const sanitized =
      typeof window.mfSanitizeMesseflowWorkspacePayload === 'function'
        ? window.mfSanitizeMesseflowWorkspacePayload(payload)
        : payload;
    let sizeBefore = -1;
    try {
      sizeBefore = JSON.stringify(sanitized).length;
    } catch {
      sizeBefore = -1;
    }
    sanitized.auditLog = Array.isArray(sanitized.auditLog)
      ? sanitized.auditLog
          .slice(-50)
          .map((e) => mfTruncateStringsDeep(e, MF_SAVE_LOG_STRING_DEPTH))
      : [];
    sanitized.notifs = Array.isArray(sanitized.notifs)
      ? sanitized.notifs
          .slice(-20)
          .map((e) => mfTruncateStringsDeep(e, MF_SAVE_LOG_STRING_DEPTH))
      : [];
    let rawJson = '';
    try {
      rawJson = JSON.stringify(sanitized);
    } catch (e) {
      rawJson = '';
    }
    const sizeAfter = rawJson.length;
    console.log('[MF SAVE PAYLOAD SIZE]', sizeAfter, {
      before: sizeBefore,
      after: sizeAfter,
      auditLog: sanitized.auditLog?.length,
      notifs: sanitized.notifs?.length,
    });
    if (sizeAfter > 100000) {
      console.warn(
        '[MF SAVE] Payload nach Kürzung noch > 100000 Bytes — speichere trotzdem mit gekürztem Body:',
        sizeAfter,
      );
    }
    await apiFetch('/api/v1/ccintern/messeflow-workspace', {
      method: 'PUT',
      body: sanitized,
    });
  };

  window.__mfLoadMesseflowWorkspace = async function mfLoadMesseflowWorkspace() {
    if (!window.__MF_COCKPIT_EMBED) return null;
    const { apiFetch } = await import('../../core/auth/cc-auth-session.js');
    const res = await apiFetch('/api/v1/ccintern/messeflow-workspace');
    if (!res || typeof res !== 'object') return null;
    return {
      projects: Array.isArray(res.projects) ? res.projects : [],
      notifs: Array.isArray(res.notifs) ? res.notifs : [],
      auditLog: Array.isArray(res.auditLog) ? res.auditLog : [],
    };
  };

  try {
    await loadMesseflowScripts();
  } catch (e) {
    containerEl.innerHTML = `<p class="ckp-api-error" role="alert">${esc(e instanceof Error ? e.message : 'MesseFlow Skripte fehlen.')}</p>`;
    return;
  }

  if (typeof window.mfLoadCockpitData === 'function') {
    window.mfLoadCockpitData(usersResponse, firmenResponse);
  }
  // Phase 1D: Kein GET /api/v1/role-templates — Rollen kommen ausschließlich aus dem Cockpit; MF baut keine ROLES-Liste aus Templates.

  const uid = getCurrentUserIdFromAccessToken();
  if (typeof window.messeflowCockpitBoot === 'function') {
    window.messeflowCockpitBoot(uid, containerEl);
  } else {
    containerEl.innerHTML =
      '<p class="ckp-api-error" role="alert">MesseFlow: <code>messeflowCockpitBoot</code> fehlt.</p>';
  }
}