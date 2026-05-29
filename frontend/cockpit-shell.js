/**
 * CC Cockpit — UI-Steuerzentrale: Sidebar + Content, lokaler View-Wechsel.
 * Zentraler Render-Pfad mit Sequenz-Token gegen Async-Race.
 */
import {
  getAccessToken,
  getApiBaseUrl,
  clearSession,
  loginRequest,
  apiFetch,
  tryRefreshAccessToken,
  fetchPublicInvite,
  activateInviteAccount,
  normalizeApiError,
  hydrateCockpitAccessibleProjectsAndEnsureContext,
  syncCockpitAccessibleProjectsCache,
} from './core/auth/cc-auth-session.js';
import { API_ROUTES } from './core/api/api-routes.js';
import { clearMyRightsCache, deriveShellUiAccess, loadMyRights } from './core/access/cc-my-rights.js';
import { setShellUiAccessSnapshot } from './core/shell/shell-ui-snapshot.js';
import {
  renderCcInternActiveViewHtml,
  attachCcInternActiveViewHandlers,
} from './modules/ccintern/ui/render-ccintern-active-view.js';
import { renderModuleUsersReadonlyHtml } from './modules/shared/ui/module-users-readonly-view.js';
import { renderModuleRoleTemplatesReadonlyHtml } from './modules/shared/ui/module-role-templates-readonly-view.js';
import { closeCalendarEventDetail } from './core/calendar/ccw-calendar-event-detail.js';
import {
  renderCcwCockpitKalenderViewHtml,
  renderCcwCockpitKalenderDynamicMountHtml,
  ccwInvalidateKalenderEventCache,
  ccwKalenderNavigate,
  ccwSetKalenderViewMode,
  attachCockpitKalenderRowDetailHandlers,
  attachCockpitKalenderWeekDragHandlers,
  attachCockpitKalenderGeneralSlotHandlers,
  updateCockpitKalenderNowLine,
  lastKalenderRenderPerf,
  kalenderRenderPerfRecordDomInsertMs,
} from './modules/cockpit/ui/views/cockpit-kalender-view.js';
import {
  renderCockpitDashboardViewHtml,
  attachCockpitDashboardHandlers,
} from './modules/cockpit/ui/views/cockpit-dashboard-view.js';
import {
  renderCockpitBenutzerViewHtml,
  attachCockpitBenutzerHandlers,
} from './modules/cockpit/ui/views/cockpit-benutzer-view.js';
import {
  renderCockpitEinladungenViewHtml,
  attachCockpitEinladungenHandlers,
} from './modules/cockpit/ui/views/cockpit-einladungen-view.js';
import {
  renderCockpitFirmenViewHtml,
  attachCockpitFirmenHandlers,
} from './modules/cockpit/ui/views/cockpit-firmen-view.js';
import CCState from './core/state/state.js';
import {
  renderCockpitRollenViewHtml,
  attachCockpitRollenHandlers,
} from './modules/cockpit/ui/views/cockpit-rollen-view.js';
import {
  renderCockpitKundenViewHtml,
  attachCockpitKundenHandlers,
} from './modules/cockpit/ui/views/cockpit-kunden-view.js';
import {
  renderSidebarForModule,
  getDefaultNavKeyForModule,
  navKeyIsValidForModule,
  getNavLabelForModule,
} from './sidebar.js';
import { renderFusaStartViewHtml } from './modules/fusa/ui/views/fusa-start-view.js';
import {
  renderFusaAuftraegeViewHtml,
  attachFusaAuftraegeViewHandlers,
} from './modules/fusa/ui/views/fusa-auftraege-view.js';
import { renderFusaPlaceholderViewHtml } from './modules/fusa/ui/views/fusa-placeholder-view.js';
import {
  renderFusaFahrzeugeViewHtml,
  attachFusaFahrzeugeHandlers,
} from './modules/fusa/ui/views/fusa-fahrzeuge-view.js';
import {
  renderFusaSchaedenViewHtml,
  attachFusaSchaedenHandlers,
} from './modules/fusa/ui/views/fusa-schaeden-view.js';
import { attachFusaSchadenDetailHandlers } from './modules/fusa/ui/views/fusa-schaden-detail-view.js';
import {
  renderFusaKundenViewHtml,
  attachFusaKundenHandlers,
} from './modules/fusa/ui/views/fusa-kunden-view.js';
import {
  renderFusaAngeboteViewHtml,
  attachFusaAngeboteHandlers,
} from './modules/fusa/ui/views/fusa-angebote-view.js';
import {
  renderFusaDokumenteViewHtml,
  attachFusaDokumenteHandlers,
} from './modules/fusa/ui/views/fusa-dokumente-view.js';
import {
  renderFusaRechnungenViewHtml,
  attachFusaRechnungenHandlers,
} from './modules/fusa/ui/views/fusa-rechnungen-view.js';
import {
  renderFusaQuartalsabrechnungViewHtml,
  attachFusaQuartalsabrechnungHandlers,
} from './modules/fusa/ui/views/fusa-quartalsabrechnung-view.js';
import { attachFusaShellHandlers } from './modules/fusa/fusa-shell-handlers.js';
import { ensureFusaProjectSelection, getFusaAppProject } from './modules/fusa/fusa-project-context.js';

/** Aktives Modul in der Topbar (nur UI). */
let activeModule = 'cockpit';

/** Lokaler UI-Zustand — aktueller Sidebar-Key je Modul. */
let activeView = 'dashboard';

const APP_ONLY_MODULE = 'ccintern';
const APP_ONLY_VIEW = 'cc_mitarbeiter_app';

/** Final gesetzt wenn `deriveShellUiAccess(...).isMitarbeiterAppOnlyShell === true` — blockiert Desktop-Routing. */
let shellAppOnlyLocked = false;

/**
 * @param {string} label
 * @param {object|null|undefined} bundle
 * @param {ReturnType<typeof deriveShellUiAccess>|null|undefined} ui
 * @param {{ activeModule?: string, activeView?: string }} [route]
 */
function logAppOnlyDebug(label, bundle, ui, route) {
  const mods = bundle && Array.isArray(bundle.modules) ? bundle.modules : [];
  console.warn('[APP_ONLY_DEBUG]', label, {
    user: bundle?.user_id ?? bundle?.user?.id ?? null,
    global_role: bundle?.global_role ?? null,
    modules: mods,
    rights: bundle?.rights ?? null,
    canSeeCockpit: ui?.canSeeCockpit ?? null,
    canSeeFusa: ui?.canSeeFusa ?? null,
    canSeeCcInternDesktop: ui?.canSeeCcInternDesktop ?? null,
    canSeeMitarbeiterApp: ui?.canSeeMitarbeiterApp ?? null,
    isMitarbeiterAppOnlyShell: ui?.isMitarbeiterAppOnlyShell ?? null,
    shellAppOnlyLocked,
    activeModule: route?.activeModule ?? activeModule,
    activeView: route?.activeView ?? activeView,
  });
}

function isAppOnlyShellLocked() {
  return shellAppOnlyLocked === true;
}

/**
 * @param {object|null|undefined} bundle
 * @returns {ReturnType<typeof deriveShellUiAccess>}
 */
function applyShellUiAccessFromBundle(bundle) {
  const ui = deriveShellUiAccess(bundle);
  setShellUiAccessSnapshot(ui);
  if (typeof window !== 'undefined') {
    window.CC_SHELL_UI_ACCESS = ui;
  }
  shellAppOnlyLocked = ui.isMitarbeiterAppOnlyShell === true;
  syncMitarbeiterAppOnlyShellLayoutClass();
  logAppOnlyDebug('applyShellUiAccessFromBundle', bundle, ui);
  return ui;
}

function clearShellUiAccessState() {
  shellAppOnlyLocked = false;
  setShellUiAccessSnapshot(null);
  if (typeof window !== 'undefined') {
    window.CC_SHELL_UI_ACCESS = null;
  }
  syncMitarbeiterAppOnlyShellLayoutClass();
}

function isMitarbeiterAppOnlyActive() {
  const ui = typeof window !== 'undefined' ? window.CC_SHELL_UI_ACCESS : null;
  return isAppOnlyShellLocked() || ui?.isMitarbeiterAppOnlyShell === true;
}

/** App-only + Ansicht cc_mitarbeiter_app: kein Cockpit-ckp-header. */
function isMitarbeiterAppOnlyMaView() {
  return (
    isMitarbeiterAppOnlyActive() &&
    activeModule === APP_ONLY_MODULE &&
    activeView === APP_ONLY_VIEW
  );
}

/** @param {string} renderVariant */
function logMaHeaderHideDebug(renderVariant) {
  const root = typeof document !== 'undefined' ? document.getElementById('cockpit-root') : null;
  const ui = typeof window !== 'undefined' ? window.CC_SHELL_UI_ACCESS : null;
  console.warn('[MA_HEADER_HIDE_DEBUG]', {
    module: activeModule,
    view: activeView,
    isMitarbeiterAppOnlyShell: ui?.isMitarbeiterAppOnlyShell ?? null,
    renderVariant,
    rootClassName: root ? root.className : null,
  });
}

/** Layout-Klasse für vorhandenes CSS (#cockpit-root.ckp-shell-layout--mitarbeiter-app-only). */
function syncMitarbeiterAppOnlyShellLayoutClass() {
  if (typeof document === 'undefined') return;
  const root = document.getElementById('cockpit-root');
  if (!(root instanceof HTMLElement)) return;
  root.classList.toggle('ckp-shell-layout--mitarbeiter-app-only', isMitarbeiterAppOnlyActive());
}

/**
 * my-rights laden; bei Fehler einmal Refresh + Retry (kein Cockpit-Fallback vor finalen Rechten).
 * @returns {Promise<{ bundle: object, ui: ReturnType<typeof deriveShellUiAccess> }>}
 */
async function resolveShellRightsBundleForShell() {
  console.warn('[REFRESH_FLOW]', 'resolveShellRightsBundleForShell start', {
    hasAccessToken: !!getAccessToken(),
  });
  /** @type {unknown} */
  let lastErr = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const bundle = await loadMyRights(attempt > 0);
      if (!bundle || typeof bundle !== 'object') {
        throw new Error('my-rights: leere Antwort');
      }
      const ui = applyShellUiAccessFromBundle(bundle);
      console.warn('[REFRESH_FLOW]', 'resolveShellRightsBundleForShell ok', { attempt });
      return { bundle, ui };
    } catch (e) {
      lastErr = e;
      console.warn('[REFRESH_FLOW]', 'loadMyRights failed', {
        attempt,
        message: e instanceof Error ? e.message : String(e),
      });
      if (attempt === 0) {
        const refreshed = await tryRefreshAccessToken();
        console.warn('[REFRESH_FLOW]', 'tryRefreshAccessToken after my-rights fail', { refreshed });
        if (refreshed) continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Rechte konnten nicht geladen werden');
}

/**
 * Erzwingt Mitarbeiter-App-Routing wenn App-only final gesperrt.
 * @param {string} contextLabel
 * @returns {boolean}
 */
function enforceMitarbeiterAppOnlyShellState(contextLabel) {
  if (!isAppOnlyShellLocked()) return false;
  const before = { activeModule, activeView };
  if (activeModule === APP_ONLY_MODULE && activeView === APP_ONLY_VIEW) return true;
  activeModule = APP_ONLY_MODULE;
  activeView = APP_ONLY_VIEW;
  console.warn('[APP_ONLY_FORCE]', contextLabel, 'vorher:', before, 'nachher:', {
    activeModule,
    activeView,
  });
  console.warn('[APP_ONLY_ROUTE]', contextLabel, { activeModule, activeView });
  syncTopbarActiveModule(activeModule);
  return true;
}

/** Monoton steigend: nur der letzte gestartete Render darf ins DOM schreiben. */
let contentRenderSeq = 0;

/** @type {ReturnType<typeof setInterval> | null} */
let kalenderNowLineTimer = null;

/** Stellt sicher, dass der globale Kalender-Rerender-Listener nur einmal gebunden wird. */
let kalenderRerenderDocListenerBound = false;

/** FUSA: Navigation aus Unterviews (z. B. Fahrzeugakte → Schäden/Aufträge) ohne zirkuläre Imports. */
let fusaNavigateDocListenerBound = false;

/** Kalender: Delegation einmal am Content-Mount — Wochenwechsel ersetzt nur innerHTML. */
let cockpitKalenderMountHandlersBound = false;

/** Nächster Kalender-Render: nur `#ccw-cockpit-kal-dynamic` ersetzen (interne Nav), nicht ganzes #cockpit-content. */
let cockpitKalenderPartialDomNext = false;

function isSharedKalenderViewActive() {
  return (
    (activeModule === 'cockpit' && activeView === 'kalender') ||
    (activeModule === 'ccintern' && activeView === 'cc_kalender') ||
    (activeModule === 'fusa' && activeView === 'fusa_kalender')
  );
}

function clearKalenderNowLineTimer() {
  if (kalenderNowLineTimer != null) {
    clearInterval(kalenderNowLineTimer);
    kalenderNowLineTimer = null;
  }
}

/** @returns {HTMLButtonElement|null} */
function getLogoutButtonEl() {
  const el = document.getElementById('ccw-logout-btn');
  return el instanceof HTMLButtonElement ? el : null;
}

/**
 * @param {boolean} loggedIn
 */
function setLogoutVisibility(loggedIn) {
  const btn = getLogoutButtonEl();
  if (!btn) return;
  btn.hidden = !loggedIn;
}

/**
 * Einladungs-Aktivierung: keine Topbar/Sidebar/Abmelden, zentrierte Karte (nur Anzeige).
 * @param {boolean} active
 */
function setInviteActivationShellMode(active) {
  const root = document.getElementById('cockpit-root');
  const topbar = document.querySelector('[data-ccw-ro="topbar"]');
  const modBar = document.querySelector('.ckp-topbar-modules');
  const sidebar = document.getElementById('cockpit-sidebar');
  const main = document.getElementById('cockpit-main');
  const content = document.getElementById('cockpit-content');
  const logout = getLogoutButtonEl();
  if (!root) return;
  if (active) {
    root.classList.add('ckp-shell-layout--invite-only');
    if (main) {
      main.classList.add('ckp-main--invite-only');
    }
    if (content) {
      content.classList.add('ckp-invite-fullscreen-host');
    }
    if (topbar instanceof HTMLElement) topbar.style.display = 'none';
    if (modBar instanceof HTMLElement) modBar.style.display = 'none';
    if (sidebar instanceof HTMLElement) sidebar.style.display = 'none';
    if (logout instanceof HTMLElement) logout.hidden = true;
    setLogoutVisibility(false);
  } else {
    root.classList.remove('ckp-shell-layout--invite-only');
    if (main) {
      main.classList.remove('ckp-main--invite-only');
    }
    if (content) {
      content.classList.remove('ckp-invite-fullscreen-host');
    }
    if (topbar instanceof HTMLElement) topbar.style.display = '';
    if (modBar instanceof HTMLElement) modBar.style.display = '';
  }
}

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const BTN_NEU =
  '<button type="button" class="ccds-btn-neu"><span class="ccds-btn-neu-icon" aria-hidden="true">+</span> Neu</button>';

/**
 * Nur Dashboard: „+ Neu“ öffnet Navigationsmenü (keine Formulare, keine Speicherung).
 * @returns {string}
 */
function renderDashboardNeuDropdownHtml() {
  const entries = [
    { label: 'Neuer Auftrag', mod: 'ccintern', key: 'cc_auftraege', pending: 'new_auftrag' },
    { label: 'Neue Schadensmeldung', mod: 'fusa', key: 'fusa_schaeden', pending: 'new_schaden' },
    { label: 'Neuer Fahrzeugauftrag', mod: 'fusa', key: 'fusa_auftraege', pending: 'new_fahrzeugauftrag' },
    { label: 'Neuer Kunde', mod: 'fusa', key: 'fusa_kunden', pending: 'new_kunde' },
  ];
  const menuItems = entries
    .map(
      (it, i) =>
        `<button type="button" role="menuitem" class="ckp-neu-menuitem" tabindex="${i === 0 ? '0' : '-1'}" data-ccw-neu-mod="${esc(it.mod)}" data-ccw-neu-key="${esc(it.key)}" data-ccw-pending-neu="${esc(it.pending)}">${esc(it.label)}</button>`,
    )
    .join('');
  return `<div class="ckp-neu-wrap">
  <button type="button" class="ccds-btn-neu ckp-neu-trigger" aria-expanded="false" aria-haspopup="menu" id="ckp-header-neu-btn" aria-controls="ckp-neu-menu"><span class="ccds-btn-neu-icon" aria-hidden="true">+</span> Neu</button>
  <div id="ckp-neu-menu" class="ckp-neu-popover" role="menu" hidden aria-labelledby="ckp-header-neu-btn">${menuItems}</div>
</div>`;
}

/** @type {AbortController | null} */
let neuMenuDocListenersAbort = null;

function closeNeuDropdown() {
  const root = document.getElementById('cockpit-content');
  const trig = root && root.querySelector('.ckp-neu-trigger');
  const pop = root && root.querySelector('.ckp-neu-popover');
  if (neuMenuDocListenersAbort) {
    neuMenuDocListenersAbort.abort();
    neuMenuDocListenersAbort = null;
  }
  if (pop) pop.hidden = true;
  if (trig) trig.setAttribute('aria-expanded', 'false');
}

function syncTopbarActiveModule(mod) {
  const bar = document.querySelector('.ckp-topbar-modules');
  if (bar) {
    bar.querySelectorAll('.ckp-mod-btn').forEach(b => {
      const isActive = b.getAttribute('data-module') === mod;
      b.classList.toggle('active', isActive);
      if (isActive) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
    });
  }
  const root = document.getElementById('cockpit-root');
  if (root && (mod === 'cockpit' || mod === 'fusa' || mod === 'ccintern')) {
    root.setAttribute('data-app-module', mod);
  }
}

/**
 * @param {'cockpit'|'fusa'|'ccintern'} targetMod
 * @param {string} targetKey
 * @param {string} [pendingNeu]
 */
function navigateCrossModule(targetMod, targetKey, pendingNeu) {
  if (isAppOnlyShellLocked()) {
    console.warn('[APP_ONLY_BLOCK_DESKTOP]', 'navigateCrossModule', {
      targetMod,
      targetKey,
    });
    enforceMitarbeiterAppOnlyShellState('navigateCrossModule-block');
    return;
  }
  if (targetMod !== 'cockpit' && targetMod !== 'fusa' && targetMod !== 'ccintern') return;
  if (!navKeyIsValidForModule(targetMod, targetKey)) return;
  closeNeuDropdown();
  if (isSharedKalenderViewActive() && !(targetMod === 'cockpit' && targetKey === 'kalender')) {
    ccwInvalidateKalenderEventCache();
  }
  activeModule = targetMod;
  activeView = targetKey;
  syncTopbarActiveModule(targetMod);
  renderSidebarForModule(activeModule, activeView);
  void renderActiveViewIntoContent();
}

/**
 * @param {ParentNode} mount — #cockpit-content
 */
function attachDashboardNeuMenu(mount) {
  if (typeof document === 'undefined' || !mount || typeof mount.querySelector !== 'function') return;
  const wrap = mount.querySelector('.ckp-neu-wrap');
  if (!wrap) return;
  const trig = wrap.querySelector('.ckp-neu-trigger');
  const pop = wrap.querySelector('.ckp-neu-popover');
  if (!(trig instanceof HTMLElement) || !(pop instanceof HTMLElement)) return;

  /** @returns {HTMLElement[]} */
  function menuItemsEls() {
    return [...pop.querySelectorAll('.ckp-neu-menuitem')].filter(el => el instanceof HTMLElement);
  }

  function focusItemIndex(idx) {
    const list = menuItemsEls();
    if (list.length === 0) return;
    const i = ((idx % list.length) + list.length) % list.length;
    list.forEach((el, j) => el.setAttribute('tabindex', j === i ? '0' : '-1'));
    list[i].focus();
  }

  function openMenu() {
    pop.hidden = false;
    trig.setAttribute('aria-expanded', 'true');
    if (neuMenuDocListenersAbort) neuMenuDocListenersAbort.abort();
    neuMenuDocListenersAbort = new AbortController();
    const sig = neuMenuDocListenersAbort.signal;

    document.addEventListener(
      'pointerdown',
      ev => {
        const t = ev.target;
        if (t instanceof Node && !wrap.contains(t)) closeNeuDropdown();
      },
      { capture: true, signal: sig },
    );

    document.addEventListener(
      'keydown',
      ev => {
        if (ev.key !== 'Escape') return;
        ev.preventDefault();
        closeNeuDropdown();
        trig.focus();
      },
      { signal: sig },
    );

    focusItemIndex(0);
  }

  function toggleMenu() {
    if (pop.hidden) openMenu();
    else {
      closeNeuDropdown();
      trig.focus();
    }
  }

  trig.addEventListener('click', ev => {
    ev.preventDefault();
    ev.stopPropagation();
    toggleMenu();
  });

  trig.addEventListener('keydown', ev => {
    if (ev.key === 'ArrowDown' && pop.hidden) {
      ev.preventDefault();
      openMenu();
    }
  });

  pop.addEventListener('keydown', ev => {
    if (pop.hidden) return;
    const list = menuItemsEls();
    const ae = document.activeElement;
    const cur = ae instanceof HTMLElement ? list.indexOf(ae) : -1;
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      focusItemIndex(cur < 0 ? 0 : cur + 1);
    } else if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      focusItemIndex(cur <= 0 ? list.length - 1 : cur - 1);
    } else if (ev.key === 'Home') {
      ev.preventDefault();
      focusItemIndex(0);
    } else if (ev.key === 'End') {
      ev.preventDefault();
      focusItemIndex(list.length - 1);
    }
  });

  pop.addEventListener('click', ev => {
    const t = ev.target;
    const mi = t instanceof Element ? t.closest('.ckp-neu-menuitem') : null;
    if (!(mi instanceof HTMLElement)) return;
    const mod = mi.getAttribute('data-ccw-neu-mod');
    const key = mi.getAttribute('data-ccw-neu-key');
    const pending = mi.getAttribute('data-ccw-pending-neu');
    if (!mod || !key) return;
    ev.preventDefault();
    navigateCrossModule(mod, key, pending || undefined);
  });
}

/**
 * Einheitlicher Seitenrahmen (Pflicht-Layout).
 * @param {{ title: string, actions?: string[], content: string, dataRo?: string, headerAside?: string }} opts
 * @returns {string}
 */
export function renderCockpitShell(opts) {
  const title = opts.title != null ? String(opts.title) : '';
  const actions = Array.isArray(opts.actions) ? opts.actions.join('') : BTN_NEU;
  const content = opts.content != null ? String(opts.content) : '';
  const ro = opts.dataRo != null ? esc(opts.dataRo) : '';
  const headerAside = opts.headerAside != null ? String(opts.headerAside) : '';
  if (isMitarbeiterAppOnlyMaView()) {
    logMaHeaderHideDebug('styl-c');
    return `<div class="ccds-shell-root"${ro ? ` data-ccw-ro="${ro}"` : ''}>${content}</div>`;
  }
  if (opts.variant === 'styl-c') {
    return `<div class="ccds-shell-root"${ro ? ` data-ccw-ro="${ro}"` : ''}>${content}</div>`;
  }
  return `<div class="ccds-shell-root"${ro ? ` data-ccw-ro="${ro}"` : ''}>
  <div class="ckp-section ckp-view--styl-c-shell">
  <div class="ckp-header${headerAside ? ' ckp-header--has-aside' : ''}">
    <h2>${esc(title)}</h2>
    ${headerAside}
    ${actions}
  </div>
  <div class="ckp-body">
    ${content}
  </div>
</div>
</div>`;
}

function syncSidebarActiveStates() {
  const root = document.getElementById('cockpit-sidebar');
  if (!root) return;
  root.querySelectorAll('[data-nav-key]').forEach(btn => {
    const k = btn.getAttribute('data-nav-key');
    btn.classList.toggle('ccds-nav-item--active', k === activeView);
    btn.classList.toggle('cc-cockpit-nav--active', k === activeView);
  });
}

function renderModulesMockHtml() {
  const mods = [
    ['Kalender', 'Termine & Übersichten'],
    ['Aufträge', 'Auftragsstammdaten'],
    ['Projekte', 'Projektverwaltung'],
  ];
  const cards = mods
    .map(
      ([name, desc]) =>
        `<div class="ckp-card"><strong>${esc(name)}</strong><p>${esc(desc)}</p><span class="ckp-card__tag">Modul (Mock)</span></div>`,
    )
    .join('');
  return `<div class="ckp-card-grid">${cards}</div>`;
}

function renderDevicesMockHtml() {
  const devs = [
    ['Scanner-01', 'Online'],
    ['Terminal-Halle-2', 'Online'],
    ['Drucker-Büro', 'Wartung'],
  ];
  const cards = devs
    .map(
      ([name, st]) =>
        `<div class="ckp-card"><strong>${esc(name)}</strong><p>Status: ${esc(st)}</p><span class="ckp-card__tag">Gerät (Mock)</span></div>`,
    )
    .join('');
  return `<div class="ckp-card-grid">${cards}</div>`;
}

function renderLogsMockTableHtml() {
  const rows = [
    ['10:02', 'Anmeldung', 'Benutzer session_start'],
    ['10:15', 'Ansicht', 'Kalender geöffnet'],
    ['10:18', 'Export', 'Tabelle CSV (Mock)'],
  ]
    .map(
      ([t, act, det]) =>
        `<tr><td>${esc(t)}</td><td>${esc(act)}</td><td>${esc(det)}</td></tr>`,
    )
    .join('');
  return `<div class="ckp-table-wrap">
    <table class="ckp-table">
      <thead><tr><th>Zeit</th><th>Aktion</th><th>Details</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/**
 * @param {number} rid
 * @returns {Promise<string>}
 */
async function buildHtmlForActiveView(rid) {
  if (rid !== contentRenderSeq) return '';

  enforceMitarbeiterAppOnlyShellState('buildHtmlForActiveView');

  if (isAppOnlyShellLocked() && activeModule === 'cockpit') {
    console.warn('[APP_ONLY_BLOCK_DESKTOP]', 'buildHtmlForActiveView-cockpit-branch', {
      activeModule,
      activeView,
    });
    enforceMitarbeiterAppOnlyShellState('buildHtmlForActiveView-cockpit-block');
  }

  if (activeModule !== 'cockpit') {
    const label = getNavLabelForModule(activeModule, activeView);
    let content = '';
    let dataRo = `ui-placeholder-${esc(activeModule)}`;
    if (activeModule === 'ccintern') {
      dataRo = 'ccintern-module';
      let ccProjectCtxBanner = '';
      const ctxRes = await hydrateCockpitAccessibleProjectsAndEnsureContext();
      if (ctxRes.ok === false && ctxRes.reason === 'no_cached_projects') {
        ccProjectCtxBanner =
          '<p class="ckp-api-error" role="alert">Kein Projekt-Kontext. Sie haben kein Projekt in diesem Mandanten, oder die Projektliste konnte nicht geladen werden. Bitte Seite neu laden oder einen Administrator kontaktieren.</p>';
      }
      content = ccProjectCtxBanner + (await renderCcInternActiveViewHtml(activeView, label));
      if (rid !== contentRenderSeq) return '';
    } else if (activeModule === 'fusa') {
      dataRo = 'fusa-module';
      let hasFusaProjectContext = false;
      try {
        const pr = await apiFetch(API_ROUTES.cockpit.projects);
        const projects = Array.isArray(pr.projects) ? pr.projects.filter(p => p && p.id != null) : [];
        syncCockpitAccessibleProjectsCache(projects);
        await ensureFusaProjectSelection(projects);
        const cur = getFusaAppProject();
        hasFusaProjectContext = !!(cur && cur.id && String(cur.id).trim() !== '');
      } catch {
        hasFusaProjectContext = false;
      }
      if (!hasFusaProjectContext) {
        content =
          '<p class="ckp-api-error" role="alert">Projekt-Kontext erforderlich.</p>' +
          '<p class="ckp-mock-note" role="status">Bitte zuerst ein FUSA-Projekt auswählen oder anlegen.</p>';
        return renderCockpitShell({
          title: label,
          actions: [],
          content,
          dataRo,
        });
      }
      switch (activeView) {
        case 'fusa_dashboard':
          // Einziger FUSA-Dashboard-Renderpfad: `fusa-start-view.js` + `mapFusaDashboardToViewModel`.
          content = await renderFusaStartViewHtml();
          dataRo = 'fusa-start';
          break;
        case 'fusa_auftraege':
          // Einzige produktive FUSA-Aufträge-UI (kein Parallel-Mount; s. modules/fusa/ui/index.js).
          content = await renderFusaAuftraegeViewHtml();
          dataRo = 'fusa-auftraege';
          break;
        case 'fusa_kalender': {
          content = await renderCcwCockpitKalenderViewHtml(null);
          dataRo = 'fusa-kalender';
          break;
        }
        case 'fusa_fahrzeuge':
          content = await renderFusaFahrzeugeViewHtml();
          dataRo = 'fusa-fahrzeuge';
          break;
        case 'fusa_schaeden':
          // Einziger FUSA-Schäden-Renderpfad: `fusa-schaeden-view.js` (Liste + Detail per CCState).
          content = await renderFusaSchaedenViewHtml();
          dataRo = 'fusa-schaeden';
          break;
        case 'fusa_kunden':
          content = await renderFusaKundenViewHtml();
          dataRo = 'fusa-kunden';
          break;
        case 'fusa_angebote':
          content = await renderFusaAngeboteViewHtml();
          dataRo = 'fusa-angebote';
          break;
        case 'fusa_rechnungen':
          // Einziger FUSA-Rechnungen-Renderpfad: `fusa-rechnungen-view.js` (`GET /api/v1/fusa/rechnungen`).
          content = await renderFusaRechnungenViewHtml();
          dataRo = 'fusa-rechnungen';
          break;
        case 'fusa_quartalsabrechnung':
          content = await renderFusaQuartalsabrechnungViewHtml();
          dataRo = 'fusa-quartalsabrechnung';
          break;
        case 'fusa_dokumente':
          // Einziger FUSA-Dokumente-Renderpfad: `fusa-dokumente-view.js` (Daten aus Auftrags-`dokumente_meta`).
          content = await renderFusaDokumenteViewHtml();
          dataRo = 'fusa-dokumente';
          break;
        case 'fusa_benutzer':
          content = await renderModuleUsersReadonlyHtml({ title: 'Benutzer', moduleKey: 'fusa' });
          break;
        case 'fusa_rollen':
          content = await renderModuleRoleTemplatesReadonlyHtml({ title: 'Rollen-Vorlagen' });
          break;
        default:
          content = renderFusaPlaceholderViewHtml(label, []);
      }
      if (rid !== contentRenderSeq) return '';
    }

    const fusaHeaderActions =
      activeView === 'fusa_quartalsabrechnung'
        ? [
            '<button type="button" class="ckp-api-auftrag-submit" data-fusa-q-nav-neu-quartal>+ Neue Quartalsrechnung</button>',
          ]
        : [];
    if (isMitarbeiterAppOnlyMaView()) {
      syncMitarbeiterAppOnlyShellLayoutClass();
      logMaHeaderHideDebug('styl-c');
      return renderCockpitShell({
        variant: 'styl-c',
        content,
        dataRo,
      });
    }
    return renderCockpitShell({
      title: label,
      /** CC Intern: kein globaler „+ Neu“ — jedes Legacy-Modul hat eigene Aktionen (s. Referenz `migration/CC Inter End/index.html`). */
      actions: activeModule === 'ccintern' ? [] : fusaHeaderActions,
      content,
      dataRo,
    });
  }

  if (activeView === 'projekte' || activeView === 'auftraege') {
    if (isAppOnlyShellLocked()) {
      console.warn('[APP_ONLY_BLOCK_DESKTOP]', 'cockpit-projekte-auftraege-fallback', {
        activeModule,
        activeView,
      });
      enforceMitarbeiterAppOnlyShellState('cockpit-projekte-auftraege-fallback-block');
    } else {
      activeView = 'dashboard';
      syncSidebarActiveStates();
    }
  }

  switch (activeView) {
    case 'dashboard': {
      const dash = await renderCockpitDashboardViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Dashboard',
        actions: [renderDashboardNeuDropdownHtml()],
        content: dash,
        dataRo: 'cockpit-dashboard',
      });
    }
    case 'users': {
      const usersInner = await renderCockpitBenutzerViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        variant: 'styl-c',
        content: usersInner,
        dataRo: 'cockpit-benutzer',
      });
    }
    case 'einladungen': {
      const invInner = await renderCockpitEinladungenViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Einladungen',
        actions: [BTN_NEU],
        content: invInner,
        dataRo: 'cockpit-einladungen',
      });
    }
    case 'roles': {
      const rollenInner = await renderCockpitRollenViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Rollen',
        actions: [BTN_NEU],
        content: rollenInner,
        dataRo: 'cockpit-rollen',
      });
    }
    case 'firms': {
      const firmInner = await renderCockpitFirmenViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Firmen',
        actions: [BTN_NEU],
        content: firmInner,
        dataRo: 'cockpit-firmen',
      });
    }
    case 'modules':
      return renderCockpitShell({
        title: 'Module',
        actions: [BTN_NEU],
        content: renderModulesMockHtml(),
        dataRo: 'cockpit-modules',
      });
    case 'devices':
      return renderCockpitShell({
        title: 'Geräte',
        actions: [BTN_NEU],
        content: renderDevicesMockHtml(),
        dataRo: 'cockpit-devices',
      });
    case 'logs':
      return renderCockpitShell({
        title: 'Logs',
        actions: [BTN_NEU],
        content: renderLogsMockTableHtml(),
        dataRo: 'cockpit-logs',
      });
    case 'kunden': {
      const kundenInner = await renderCockpitKundenViewHtml();
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Kunden',
        actions: [],
        content: kundenInner,
        dataRo: 'cockpit-kunden',
      });
    }
    case 'angebote': {
      return renderCockpitShell({
        title: 'Angebote',
        actions: [],
        content:
          '<p class="ckp-mock-note">Angebote werden operativ in FUSA geführt.</p><p><button type="button" class="ckp-api-auftrag-submit" data-ccw-open-fusa-view="fusa_angebote">In FUSA öffnen</button></p>',
        dataRo: 'cockpit-angebote',
      });
    }
    case 'kalender': {
      const kalInner = await renderCcwCockpitKalenderViewHtml(null);
      if (rid !== contentRenderSeq) return '';
      return renderCockpitShell({
        title: 'Kalender',
        actions: [],
        content: kalInner,
        dataRo: 'cockpit-kalender',
      });
    }
    default: {
      return renderCockpitShell({
        title: 'Ansicht',
        actions: [BTN_NEU],
        content: `<p class="ckp-mock-note">Unbekannte Ansicht.</p>`,
        dataRo: 'cockpit-unknown',
      });
    }
  }
}

async function renderActiveViewIntoContent() {
  const mount = document.getElementById('cockpit-content');
  if (!mount) return;

  enforceMitarbeiterAppOnlyShellState('renderActiveViewIntoContent');

  if (typeof document !== 'undefined' && !kalenderRerenderDocListenerBound) {
    kalenderRerenderDocListenerBound = true;
    document.addEventListener('ccw-kalender-rerender-request', () => {
      if (isSharedKalenderViewActive()) void renderActiveViewIntoContent();
    });
  }

  if (typeof document !== 'undefined' && !fusaNavigateDocListenerBound) {
    fusaNavigateDocListenerBound = true;
    document.addEventListener('ccw:fusa-navigate', ev => {
      const d = ev && 'detail' in ev ? /** @type {CustomEvent} */ (ev).detail : null;
      if (!d || typeof d !== 'object') return;
      const view = String(/** @type {Record<string, unknown>} */ (d).view || '').trim();
      if (!view) return;
      const sm = /** @type {Record<string, unknown>} */ (d).fusaSchaedenMeldenFahrzeugId;
      if (sm != null && String(sm).trim() !== '') CCState.set('fusaSchaedenMeldenFahrzeugId', String(sm).trim());
      else CCState.set('fusaSchaedenMeldenFahrzeugId', null);
      const an = /** @type {Record<string, unknown>} */ (d).fusaAuftragNeuFahrzeugId;
      if (an != null && String(an).trim() !== '') CCState.set('fusaAuftragNeuFahrzeugId', String(an).trim());
      else CCState.set('fusaAuftragNeuFahrzeugId', null);
      const ow = /** @type {Record<string, unknown>} */ (d).fusaAuftragNeuOpenWizard;
      if ('fusaAuftragNeuOpenWizard' in /** @type {Record<string, unknown>} */ (d)) {
        CCState.set('fusaAuftragNeuOpenWizard', ow === true);
      } else {
        CCState.set('fusaAuftragNeuOpenWizard', false);
      }
      const inn = /** @type {Record<string, unknown>} */ (d).fusaAuftragNeuInternNotiz;
      if (inn != null && String(inn).trim() !== '') CCState.set('fusaAuftragNeuInternNotiz', String(inn).trim());
      else CCState.set('fusaAuftragNeuInternNotiz', null);
      navigateCrossModule('fusa', view);
    });
  }

  closeNeuDropdown();
  closeCalendarEventDetail();

  const rid = ++contentRenderSeq;

  const partialKalRequested = cockpitKalenderPartialDomNext && isSharedKalenderViewActive();
  cockpitKalenderPartialDomNext = false;

  const kalDynEl =
    partialKalRequested && mount
      ? /** @type {HTMLElement|null} */ (mount.querySelector('#ccw-cockpit-kal-dynamic'))
      : null;

  if (partialKalRequested && kalDynEl instanceof HTMLElement) {
    const kalFrag = await renderCcwCockpitKalenderDynamicMountHtml(null);
    if (rid !== contentRenderSeq) return;
    clearKalenderNowLineTimer();
    const cockpitKalDbg =
      typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1';
    const tDom = cockpitKalDbg ? performance.now() : 0;
    kalDynEl.innerHTML = kalFrag;
    if (tDom && lastKalenderRenderPerf) {
      const domInsertMs = Math.round((performance.now() - tDom) * 100) / 100;
      kalenderRenderPerfRecordDomInsertMs(domInsertMs);
      const totalMs = Math.round((performance.now() - lastKalenderRenderPerf.t0) * 100) / 100;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ccw-kal] perf', {
          fusionCacheHit: lastKalenderRenderPerf.fusionCacheHit,
          viewMode: lastKalenderRenderPerf.viewMode,
          phases: lastKalenderRenderPerf.phases,
          domInsertMs,
          totalMs,
          partialKalInnerDom: true,
        });
      }
    }
  } else {
    let html = '';
    try {
      html = await buildHtmlForActiveView(rid);
    } catch (e) {
      console.error('[CockpitShell] buildHtmlForActiveView', e);
      if (rid !== contentRenderSeq) return;
      mount.innerHTML = `<div class="ccds-shell-root" data-ccw-ro="cockpit-view-error">
  <p class="ckp-api-error" role="alert">${esc(e instanceof Error ? e.message : String(e))}</p>
  <p class="ckp-mock-note">Ansicht konnte nicht gerendert werden. Bitte Konsole (F12) prüfen oder eine andere Seite in der Sidebar wählen.</p>
</div>`;
      return;
    }
    if (rid !== contentRenderSeq) return;
    clearKalenderNowLineTimer();
    const cockpitKalDbg =
      typeof localStorage !== 'undefined' && localStorage.getItem('ccwDebugKalender') === '1';
    const tDom =
      cockpitKalDbg && isSharedKalenderViewActive() ? performance.now() : 0;

    mount.innerHTML =
      html && String(html).trim() !== ''
        ? html
        : `<div class="ccds-shell-root" data-ccw-ro="cockpit-empty-render"><p class="ckp-mock-note">Keine Inhalte geladen (Abbruch oder veralteter Render). Bitte Navigation erneut wählen.</p></div>`;
    if (activeView === APP_ONLY_VIEW) {
      syncMitarbeiterAppOnlyShellLayoutClass();
      const leakedHeader = mount.querySelector('.ckp-header h2');
      logMaHeaderHideDebug(
        leakedHeader instanceof HTMLElement && String(leakedHeader.textContent || '').trim() !== ''
          ? 'leaked-header'
          : 'styl-c-dom',
      );
    }
    if (tDom && lastKalenderRenderPerf) {
      const domInsertMs = Math.round((performance.now() - tDom) * 100) / 100;
      kalenderRenderPerfRecordDomInsertMs(domInsertMs);
      const totalMs = Math.round((performance.now() - lastKalenderRenderPerf.t0) * 100) / 100;
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[ccw-kal] perf', {
          fusionCacheHit: lastKalenderRenderPerf.fusionCacheHit,
          viewMode: lastKalenderRenderPerf.viewMode,
          phases: lastKalenderRenderPerf.phases,
          domInsertMs,
          totalMs,
          partialKalInnerDom: false,
        });
      }
    }
  }

  if (isSharedKalenderViewActive()) {
    if (!cockpitKalenderMountHandlersBound) {
      cockpitKalenderMountHandlersBound = true;
      attachCockpitKalenderRowDetailHandlers(mount);
      attachCockpitKalenderWeekDragHandlers(mount);
      attachCockpitKalenderGeneralSlotHandlers(mount);
    }
    updateCockpitKalenderNowLine(mount);
    kalenderNowLineTimer = setInterval(() => updateCockpitKalenderNowLine(mount), 60000);
  }
  if (activeModule === 'cockpit' && activeView === 'dashboard') {
    attachCockpitDashboardHandlers(mount);
    attachDashboardNeuMenu(mount);
  }
  if (activeModule === 'cockpit' && activeView === 'users') {
    attachCockpitBenutzerHandlers(mount);
  }
  if (activeModule === 'cockpit' && activeView === 'einladungen') {
    attachCockpitEinladungenHandlers(mount);
  }
  if (activeModule === 'cockpit' && activeView === 'firms') {
    attachCockpitFirmenHandlers(mount);
  }
  if (activeModule === 'cockpit' && activeView === 'kunden') {
    attachCockpitKundenHandlers(mount, () => renderActiveViewIntoContent());
  }
  if (activeModule === 'cockpit' && activeView === 'roles') {
    attachCockpitRollenHandlers(mount);
  }
  if (activeModule === 'fusa') {
    attachFusaShellHandlers(mount, () => renderActiveViewIntoContent());
    if (activeView === 'fusa_kunden') {
      attachFusaKundenHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_angebote') {
      attachFusaAngeboteHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_auftraege') {
      attachFusaAuftraegeViewHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_fahrzeuge') {
      attachFusaFahrzeugeHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_schaeden') {
      attachFusaSchaedenHandlers(mount, () => renderActiveViewIntoContent());
      attachFusaSchadenDetailHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_dokumente') {
      attachFusaDokumenteHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_rechnungen') {
      attachFusaRechnungenHandlers(mount, () => renderActiveViewIntoContent());
    }
    if (activeView === 'fusa_quartalsabrechnung') {
      attachFusaQuartalsabrechnungHandlers(mount, () => renderActiveViewIntoContent());
    }
  }
  if (activeModule === 'ccintern') {
    attachCcInternActiveViewHandlers(mount, () => renderActiveViewIntoContent());
  }
}

function tryNavigateToNavKey(key) {
  if (isAppOnlyShellLocked()) {
    console.warn('[APP_ONLY_BLOCK_DESKTOP]', 'tryNavigateToNavKey', { key });
    enforceMitarbeiterAppOnlyShellState('tryNavigateToNavKey-block');
    return;
  }
  if (!key || !navKeyIsValidForModule(activeModule, key)) return;
  if (key === activeView) {
    return;
  }
  if (isSharedKalenderViewActive() && !(activeModule === 'cockpit' && key === 'kalender')) {
    ccwInvalidateKalenderEventCache();
  }
  activeView = key;
  syncSidebarActiveStates();
  void renderActiveViewIntoContent();
}

/**
 * @param {HTMLElement} btn
 */
function applyCockpitRolleNavFromButton(btn) {
  const navId = btn.getAttribute('data-ccw-rolle-nav-id');
  if (navId != null && String(navId).trim() !== '') {
    CCState.set('cockpitRolleSelectedId', String(navId).trim());
    return;
  }
  CCState.set('cockpitRolleSelectedId', null);
}

function applyCockpitFirmaNavFilterFromButton(btn) {
  const navId = btn.getAttribute('data-ccw-firma-nav-id');
  if (navId != null && String(navId).trim() !== '') {
    CCState.set('cockpitFirmaFilter', {
      type: null,
      status: null,
    });
    CCState.set('cockpitFirmaSelectedId', String(navId).trim());
    return;
  }
  const ty = btn.getAttribute('data-ccw-firma-filter-type');
  const st = btn.getAttribute('data-ccw-firma-filter-status');
  const hasAny =
    (ty != null && String(ty).trim() !== '') || (st != null && String(st).trim() !== '');
  if (hasAny) {
    CCState.set('cockpitFirmaFilter', {
      type: ty && String(ty).trim() !== '' ? String(ty).trim() : null,
      status: st && String(st).trim() !== '' ? String(st).trim() : null,
    });
  } else {
    CCState.set('cockpitFirmaFilter', {
      type: null,
      status: null,
    });
  }
  CCState.set('cockpitFirmaSelectedId', null);
}

function applyCockpitInvitationNavFilterFromButton(btn) {
  const st = btn.getAttribute('data-ccw-invitation-filter-status');
  const pid = btn.getAttribute('data-ccw-invitation-filter-project-id');
  const cid = btn.getAttribute('data-ccw-invitation-filter-company-id');
  const hasAny =
    (st != null && String(st).trim() !== '') ||
    (pid != null && String(pid).trim() !== '') ||
    (cid != null && String(cid).trim() !== '');
  if (hasAny) {
    CCState.set('cockpitInvitationFilter', {
      status: st && String(st).trim() !== '' ? String(st).trim() : null,
      projectId: pid && String(pid).trim() !== '' ? String(pid).trim() : null,
      companyId: cid && String(cid).trim() !== '' ? String(cid).trim() : null,
    });
  } else {
    CCState.set('cockpitInvitationFilter', {
      status: null,
      projectId: null,
      companyId: null,
    });
  }
  CCState.set('cockpitInvitationSelectedId', null);
}

function applyCockpitBenutzerNavFilterFromButton(btn) {
  const st = btn.getAttribute('data-ccw-user-filter-status');
  const acc = btn.getAttribute('data-ccw-user-filter-access');
  const pid = btn.getAttribute('data-ccw-user-filter-project-id');
  const cid = btn.getAttribute('data-ccw-user-filter-company-id');
  const hasAny =
    (st != null && String(st).trim() !== '') ||
    (acc != null && String(acc).trim() !== '') ||
    (pid != null && String(pid).trim() !== '') ||
    (cid != null && String(cid).trim() !== '');
  if (hasAny) {
    CCState.set('cockpitUserListFilter', {
      status: st && String(st).trim() !== '' ? String(st).trim() : null,
      access: acc && String(acc).trim() !== '' ? String(acc).trim() : null,
      projectId: pid && String(pid).trim() !== '' ? String(pid).trim() : null,
      companyId: cid && String(cid).trim() !== '' ? String(cid).trim() : null,
    });
  } else {
    CCState.set('cockpitUserListFilter', {
      status: null,
      access: null,
      projectId: null,
      companyId: null,
    });
  }
  CCState.set('cockpitBenutzerSelectedId', null);
}

function onSidebarClick(ev) {
  const t = ev.target;
  const btn = t && typeof t.closest === 'function' ? t.closest('[data-nav-key]') : null;
  if (!btn) return;
  const key = btn.getAttribute('data-nav-key');
  const stayOnSameView = key === activeView;
  if (key === 'users' && activeModule === 'cockpit') {
    applyCockpitBenutzerNavFilterFromButton(btn);
  }
  if (key === 'einladungen' && activeModule === 'cockpit') {
    applyCockpitInvitationNavFilterFromButton(btn);
  }
  if (key === 'firms' && activeModule === 'cockpit') {
    applyCockpitFirmaNavFilterFromButton(btn);
  }
  if (key === 'roles' && activeModule === 'cockpit') {
    applyCockpitRolleNavFromButton(btn);
  }
  tryNavigateToNavKey(key);
  if (
    stayOnSameView &&
    activeModule === 'cockpit' &&
    (key === 'users' || key === 'einladungen' || key === 'firms' || key === 'roles')
  ) {
    void renderActiveViewIntoContent();
  }
}

/** Kacheln im Dashboard: gleicher Nav-Key-Mechanismus, kein Reload. */
function onMainClick(ev) {
  const t = ev.target;
  const main = document.getElementById('cockpit-main');
  if (!main || !(t instanceof Element) || !main.contains(t)) return;

  const shellNeuBtn = typeof t.closest === 'function' ? t.closest('.ckp-header .ccds-btn-neu:not(.ckp-neu-trigger)') : null;
  if (shellNeuBtn instanceof HTMLElement && activeModule === 'cockpit') {
    ev.preventDefault();
    const toggleSelByView = {
      einladungen: '[data-ccw-cockpit-inv-toggle]',
      firms: '[data-ccw-firmen-neu-toggle]',
    };
    const sel = toggleSelByView[activeView];
    if (sel) {
      const toggleBtn = main.querySelector(sel);
      if (toggleBtn instanceof HTMLElement) {
        toggleBtn.click();
      }
    }
    return;
  }

  const openFusaBtn =
    typeof t.closest === 'function' ? t.closest('[data-ccw-open-fusa-view]') : null;
  if (openFusaBtn instanceof HTMLElement) {
    const key = openFusaBtn.getAttribute('data-ccw-open-fusa-view');
    if (key && navKeyIsValidForModule('fusa', key)) {
      ev.preventDefault();
      navigateCrossModule('fusa', key);
      return;
    }
  }

  const viewKalBtn = typeof t.closest === 'function' ? t.closest('[data-ccw-kal-view]') : null;
  if (
    viewKalBtn &&
    isSharedKalenderViewActive() &&
    viewKalBtn.closest('[data-ccw-ro="cockpit-kalender"]')
  ) {
    const v = viewKalBtn.getAttribute('data-ccw-kal-view');
    if (v === 'week' || v === 'month') {
      ev.preventDefault();
      ccwSetKalenderViewMode(v);
      cockpitKalenderPartialDomNext = true;
      void renderActiveViewIntoContent();
      return;
    }
  }

  const navBtn = typeof t.closest === 'function' ? t.closest('[data-ccw-kal-nav]') : null;
  if (
    navBtn &&
    isSharedKalenderViewActive() &&
    navBtn.closest('[data-ccw-ro="cockpit-kalender"]')
  ) {
    const nav = navBtn.getAttribute('data-ccw-kal-nav');
    let dir = null;
    if (nav === 'prev') dir = -1;
    else if (nav === 'today') dir = 0;
    else if (nav === 'next') dir = 1;
    if (dir !== null) {
      ev.preventDefault();
      ccwKalenderNavigate(dir);
      cockpitKalenderPartialDomNext = true;
      void renderActiveViewIntoContent();
      return;
    }
  }

  const btn = typeof t.closest === 'function' ? t.closest('[data-nav-key]') : null;
  if (!btn) return;
  if (!main.contains(btn)) return;
  const key = btn.getAttribute('data-nav-key');
  if (key === 'users' && activeModule === 'cockpit') {
    applyCockpitBenutzerNavFilterFromButton(btn);
    if (activeView === 'users') {
      void renderActiveViewIntoContent();
      return;
    }
  }
  if (key === 'einladungen' && activeModule === 'cockpit') {
    applyCockpitInvitationNavFilterFromButton(btn);
    if (activeView === 'einladungen') {
      void renderActiveViewIntoContent();
      return;
    }
  }
  if (key === 'firms' && activeModule === 'cockpit') {
    applyCockpitFirmaNavFilterFromButton(btn);
    if (activeView === 'firms') {
      void renderActiveViewIntoContent();
      return;
    }
  }
  if (key === 'roles' && activeModule === 'cockpit') {
    applyCockpitRolleNavFromButton(btn);
    if (activeView === 'roles') {
      void renderActiveViewIntoContent();
      return;
    }
  }
  tryNavigateToNavKey(key);
}

/** Topbar: Active + Sidebar neu — kein echtes Laden von FUSA/CC Intern. */
function onModuleBarClick(ev) {
  const t = ev.target;
  const btn = t && typeof t.closest === 'function' ? t.closest('.ckp-mod-btn[data-module]') : null;
  if (!btn) return;
  const bar = btn.closest('.ckp-topbar-modules');
  if (!bar) return;
  const mod = btn.dataset.module;
  if (mod !== 'cockpit' && mod !== 'fusa' && mod !== 'ccintern') return;

  if (isAppOnlyShellLocked()) {
    console.warn('[APP_ONLY_BLOCK_DESKTOP]', 'onModuleBarClick', { mod });
    enforceMitarbeiterAppOnlyShellState('onModuleBarClick-block');
    return;
  }

  if (isSharedKalenderViewActive()) {
    ccwInvalidateKalenderEventCache();
  }

  activeModule = mod;
  activeView = getDefaultNavKeyForModule(mod);
  syncTopbarActiveModule(mod);
  renderSidebarForModule(activeModule, activeView);
  console.log('Modul aktiv:', mod);
  void renderActiveViewIntoContent();
}

function parseInviteTokenFromLocation() {
  if (typeof window === 'undefined') return null;
  try {
    const u = new URL(window.location.href);
    if (u.pathname === '/invite') {
      const t = u.searchParams.get('token');
      if (t && String(t).trim()) return String(t).trim();
    }
    const t = u.searchParams.get('token');
    if (t && String(t).trim()) return String(t).trim();
    const q = u.searchParams.get('cc_invite');
    if (q && String(q).trim()) return String(q).trim();
    const h = window.location.hash || '';
    const m = /^#cc-invite=(.+)$/.exec(h);
    if (m && m[1]) return decodeURIComponent(m[1].trim());
  } catch {
    /* ignore */
  }
  return null;
}

/** Ob die aktuelle URL eine Einladungs-Aktivierung anzeigen soll (ohne Session). */
function isInviteActivationRoute() {
  return parseInviteTokenFromLocation() != null;
}

/** Entfernt Invite-Query/Hash aus der URL ohne Reload (F5 zeigt keine Aktivierungsmaske mehr). */
function stripInviteParamsFromLocation() {
  if (typeof window === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    let changed = false;
    if (u.searchParams.has('cc_invite')) {
      u.searchParams.delete('cc_invite');
      changed = true;
    }
    if (u.searchParams.has('token')) {
      u.searchParams.delete('token');
      changed = true;
    }
    if (u.pathname === '/invite') {
      u.pathname = '/';
      changed = true;
    }
    if (/^#cc-invite=/.test(u.hash || '')) {
      u.hash = '';
      changed = true;
    }
    if (!changed) return;
    const next = `${u.pathname}${u.search}${u.hash}` || '/';
    history.replaceState(history.state, '', next);
  } catch {
    /* ignore */
  }
}

/** Zentrierte Karte im Invite-/Post-Invite-Login-Fullscreen. */
function wrapInviteShellFullscreenHtml(innerHtml) {
  return `<div class="ckp-invite-fullscreen" data-ccw-ro="invite-fullscreen">
  <div class="ckp-invite-fullscreen__inner">${innerHtml}</div>
</div>`;
}

function renderLoginPanelHtml() {
  return `<div class="ckp-api-login-panel" data-ccw-ro="api-login">
  <h2 class="ckp-api-login-panel__title">Anmelden</h2>
  <p class="ckp-api-login-panel__hint">API-Basis: <code>${esc(getApiBaseUrl())}</code> · <code>POST /auth/login</code></p>
  <form class="ckp-api-login-form" data-ccw-login-form>
    <div class="ckp-api-login-form__row">
      <label for="ccw-login-email">E-Mail</label>
      <input id="ccw-login-email" name="email" type="email" autocomplete="username" required />
    </div>
    <div class="ckp-api-login-form__row">
      <label for="ccw-login-pass">Passwort</label>
      <input id="ccw-login-pass" name="password" type="password" autocomplete="current-password" required />
    </div>
    <button type="submit" class="ckp-api-login-submit">Anmelden</button>
    <p class="ckp-api-error" data-ccw-login-msg hidden role="alert"></p>
  </form>
</div>`;
}

/**
 * @param {string} token
 * @param {object|null} payload
 * @param {string|null} errMsg
 */
function renderInviteTokenPanelHtml(token, payload, errMsg) {
  let card = '';
  if (errMsg) {
    card = `<div class="ckp-api-login-panel" data-ccw-ro="api-invite-error">
  <p class="ckp-api-error" role="alert">${esc(errMsg)}</p>
  <button type="button" class="ckp-api-login-submit" data-ccw-invite-dismiss>Zurück</button>
</div>`;
  } else {
    const inv = payload && payload.invite && typeof payload.invite === 'object' ? payload.invite : {};
    const mail = inv.email != null ? String(inv.email) : '—';
    const role = inv.global_role != null ? String(inv.global_role) : '—';
    card = `<div class="ckp-api-login-panel" data-ccw-ro="api-invite-accept">
  <h2 class="ckp-api-login-panel__title">Einladung aktivieren</h2>
  <dl class="ckp-api-invite-dl">
    <div><dt>E-Mail</dt><dd>${esc(mail)}</dd></div>
    <div><dt>Rolle</dt><dd>${esc(role)}</dd></div>
  </dl>
  <p class="ckp-api-login-panel__hint">Bitte Passwort setzen, um dein Konto zu aktivieren.</p>
  <form class="ckp-api-login-form" data-ccw-invite-activate-form>
    <div class="ckp-api-login-form__row">
      <label for="ccw-inv-pass">Passwort</label>
      <input id="ccw-inv-pass" name="password" type="password" autocomplete="new-password" required />
    </div>
    <div class="ckp-api-login-form__row">
      <label for="ccw-inv-pass2">Passwort bestätigen</label>
      <input id="ccw-inv-pass2" name="password_confirm" type="password" autocomplete="new-password" required />
    </div>
    <button type="submit" class="ckp-api-login-submit">Konto aktivieren</button>
  </form>
  <p class="ckp-api-error" data-ccw-invite-msg hidden role="alert"></p>
  <button type="button" class="ckp-api-invite-dismiss" data-ccw-invite-dismiss>Abbrechen</button>
</div>`;
  }
  return wrapInviteShellFullscreenHtml(card);
}

function clearInviteFromLocation() {
  stripInviteParamsFromLocation();
  setInviteActivationShellMode(false);
}

/**
 * Session beenden und direkt zur Login-Ansicht zurück.
 * @param {HTMLElement} sidebar
 * @param {HTMLElement} content
 * @param {HTMLElement} main
 */
function doLogout(sidebar, content, main) {
  clearSession();
  clearMyRightsCache();
  clearShellUiAccessState();
  CCState.reset();
  clearKalenderNowLineTimer();
  closeNeuDropdown();
  closeCalendarEventDetail();
  sidebar.style.display = 'none';
  setLogoutVisibility(false);
  content.innerHTML = renderLoginPanelHtml();
  attachLoginPanelHandlers(content, sidebar, main);
}

/**
 * @param {HTMLElement} content
 * @param {string} token
 * @param {HTMLElement} sidebar
 * @param {HTMLElement} main
 */
function attachInviteTokenPanelHandlers(content, token, sidebar, main) {
  const dismissBtn = content.querySelector('[data-ccw-invite-dismiss]');
  if (dismissBtn instanceof HTMLElement) {
    dismissBtn.addEventListener('click', ev => {
      ev.preventDefault();
      clearInviteFromLocation();
    });
  }

  const showErr = (text) => {
    const msg = content.querySelector('[data-ccw-invite-msg]');
    if (msg instanceof HTMLElement) {
      msg.textContent = text;
      msg.hidden = false;
    }
  };

  const activateForm = content.querySelector('[data-ccw-invite-activate-form]');
  if (activateForm instanceof HTMLFormElement) {
    activateForm.addEventListener('submit', async ev => {
      ev.preventDefault();
      const fd = new FormData(activateForm);
      const password = String(fd.get('password') || '');
      const passwordConfirm = String(fd.get('password_confirm') || '');
      try {
        await activateInviteAccount(token, password, passwordConfirm);
        clearSession();
        clearMyRightsCache();
        stripInviteParamsFromLocation();
        sidebar.style.display = 'none';
        content.innerHTML = wrapInviteShellFullscreenHtml(
          `${renderLoginPanelHtml()}<p class="ckp-api-login-panel__hint" style="margin:12px 0 0;text-align:center;">Konto aktiviert. Bitte normal anmelden.</p>`,
        );
        attachLoginPanelHandlers(content, sidebar, main);
      } catch (e) {
        const ne = normalizeApiError(e);
        showErr(ne.message || 'Aktivierung fehlgeschlagen');
      }
    });
  }
}

/**
 * @param {HTMLElement} content
 * @param {HTMLElement} sidebar
 * @param {HTMLElement} main
 */
function attachLoginPanelHandlers(content, sidebar, main) {
  const form = content.querySelector('[data-ccw-login-form]');
  if (!(form instanceof HTMLFormElement)) return;
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    const msg = form.querySelector('[data-ccw-login-msg]');
    if (msg instanceof HTMLElement) {
      msg.textContent = '';
      msg.hidden = true;
    }
    const fd = new FormData(form);
    const email = String(fd.get('email') || '').trim();
    const password = String(fd.get('password') || '');
    try {
      await loginRequest(email, password);
      clearMyRightsCache();
      stripInviteParamsFromLocation();
      setInviteActivationShellMode(false);
      sidebar.style.display = '';
      await mountCockpitShellAuthenticated(sidebar, content, main);
    } catch (e) {
      const ne = normalizeApiError(e);
      if (msg instanceof HTMLElement) {
        msg.textContent = ne.message || 'Anmeldung fehlgeschlagen';
        msg.hidden = false;
      }
    }
  });
}

/**
 * @param {HTMLElement} sidebar
 * @param {HTMLElement} content
 * @param {HTMLElement} main
 */
async function mountCockpitShellAuthenticated(sidebar, content, main) {
  setInviteActivationShellMode(false);
  content.innerHTML =
    '<div class="ckp-mock-note" role="status" aria-live="polite" data-ccw-ro="cockpit-loading">Rechte werden geladen…</div>';

  /** @type {ReturnType<typeof deriveShellUiAccess>|null} */
  let shellUi = null;
  try {
    const resolved = await resolveShellRightsBundleForShell();
    shellUi = resolved.ui;
  } catch (e) {
    console.warn('[INTERN-CHECK] my-rights/refresh fehlgeschlagen:', e);
    clearShellUiAccessState();
    const ne = normalizeApiError(e);
    content.innerHTML = `<div class="ccds-shell-root" data-ccw-ro="cockpit-rights-error">
  <p class="ckp-api-error" role="alert">${esc(ne.message || 'Rechte konnten nicht geladen werden.')}</p>
  <p class="ckp-mock-note">Bitte erneut anmelden oder Seite neu laden (F5). Cockpit wird erst nach erfolgreichem Laden der Rechte geöffnet.</p>
</div>`;
    return;
  }

  const routeBefore = { activeModule, activeView };
  if (shellUi?.isMitarbeiterAppOnlyShell === true) {
    activeModule = APP_ONLY_MODULE;
    activeView = APP_ONLY_VIEW;
    console.warn('[APP_ONLY_FORCE]', 'mountCockpitShellAuthenticated', 'vorher:', routeBefore, 'nachher:', {
      activeModule,
      activeView,
    });
    console.warn('[APP_ONLY_ROUTE]', 'mountCockpitShellAuthenticated', { activeModule, activeView });
    logAppOnlyDebug('mountCockpitShellAuthenticated-route', null, shellUi, {
      activeModule,
      activeView,
    });
  } else {
    activeModule = 'cockpit';
    activeView = getDefaultNavKeyForModule('cockpit');
    logAppOnlyDebug('mountCockpitShellAuthenticated-route-desktop', null, shellUi, {
      activeModule,
      activeView,
    });
  }
  syncTopbarActiveModule(activeModule);
  renderSidebarForModule(activeModule, activeView);

  const hideChrome = shellUi?.isMitarbeiterAppOnlyShell === true;
  syncMitarbeiterAppOnlyShellLayoutClass();
  const _modBar = document.querySelector('.ckp-topbar-modules');
  if (_modBar) _modBar.style.display = hideChrome ? 'none' : '';
  if (hideChrome) sidebar.style.display = 'none';
  sidebar.removeEventListener('click', onSidebarClick);
  sidebar.addEventListener('click', onSidebarClick);

  main.removeEventListener('click', onMainClick);
  main.addEventListener('click', onMainClick);

  const moduleBar = document.querySelector('.ckp-topbar-modules');
  if (moduleBar) {
    moduleBar.removeEventListener('click', onModuleBarClick);
    moduleBar.addEventListener('click', onModuleBarClick);
  }
  const logoutBtn = getLogoutButtonEl();
  if (logoutBtn) {
    logoutBtn.onclick = (ev) => {
      ev.preventDefault();
      doLogout(sidebar, content, main);
    };
  }
  setLogoutVisibility(true);

  content.innerHTML =
    '<div class="ckp-mock-note" role="status" aria-live="polite" data-ccw-ro="cockpit-loading">Oberfläche wird geladen…</div>';
  try {
    enforceMitarbeiterAppOnlyShellState('mountCockpitShellAuthenticated-pre-render');
    await renderActiveViewIntoContent();
  } catch (e) {
    console.error('[CockpitShell] renderActiveViewIntoContent', e);
    content.innerHTML = `<div class="ccds-shell-root" data-ccw-ro="cockpit-boot-error">
  <p class="ckp-api-error" role="alert">${esc(e instanceof Error ? e.message : String(e))}</p>
  <p class="ckp-mock-note">Die Ansicht konnte nicht aufgebaut werden. Bitte prüfen Sie die Browser-Konsole (F12) und ob das Backend unter der konfigurierten API-URL erreichbar ist. Danach Seite neu laden.</p>
</div>`;
  }
}

export async function mountCockpitShell() {
  if (typeof document === 'undefined') return;

  const sidebar = document.getElementById('cockpit-sidebar');
  const content = document.getElementById('cockpit-content');
  const main = document.getElementById('cockpit-main');
  if (!sidebar || !content || !main) {
    console.error('[CockpitShell] fehlt #cockpit-sidebar, #cockpit-content oder #cockpit-main');
    return;
  }

  setInviteActivationShellMode(false);

  if (getAccessToken()) {
    stripInviteParamsFromLocation();
  }

  const inviteTok = isInviteActivationRoute() ? parseInviteTokenFromLocation() : null;
  if (inviteTok) {
    setInviteActivationShellMode(true);
    try {
      const data = await fetchPublicInvite(inviteTok);
      content.innerHTML = renderInviteTokenPanelHtml(inviteTok, data, null);
    } catch (e) {
      const ne = normalizeApiError(e);
      content.innerHTML = renderInviteTokenPanelHtml(
        inviteTok,
        null,
        ne.message || 'Einladung nicht ladbar.',
      );
    }
    attachInviteTokenPanelHandlers(content, inviteTok, sidebar, main);
    return;
  }

  if (!getAccessToken()) {
    sidebar.style.display = 'none';
    setLogoutVisibility(false);
    content.innerHTML = renderLoginPanelHtml();
    attachLoginPanelHandlers(content, sidebar, main);
    return;
  }

  sidebar.style.display = '';
  if (getAccessToken()) {
    console.warn('[REFRESH_FLOW]', 'mountCockpitShell boot refresh attempt');
    await tryRefreshAccessToken();
  }
  await mountCockpitShellAuthenticated(sidebar, content, main);
}
