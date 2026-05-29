/**
 * CC Cockpit — Sidebar-Nav je Modul (Stil C: Icon-Box, Label, optional Badge).
 */

import { ccwLucideIconMarkup } from './ccw-lucide-svgs.js';
import { getShellUiAccessSnapshot } from './core/shell/shell-ui-snapshot.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** @type {{ key: string, label: string, iconKey: string, badge?: string }[]} */
export const COCKPIT_NAV_DEFS = [
  { key: 'dashboard', label: 'Dashboard', iconKey: 'layoutDashboard' },
  { key: 'users', label: 'Benutzer', iconKey: 'users' },
  { key: 'einladungen', label: 'Einladungen', iconKey: 'mail' },
  { key: 'roles', label: 'Rollen', iconKey: 'lock' },
  { key: 'firms', label: 'Firmen', iconKey: 'building2' },
  { key: 'modules', label: 'Module', iconKey: 'puzzle' },
  { key: 'devices', label: 'Geräte', iconKey: 'monitor' },
  { key: 'logs', label: 'Logs', iconKey: 'clipboardList' },
  { key: 'kalender', label: 'Kalender', iconKey: 'calendar' },
];

/** Erster Block: Navigation (Mockup). */
const COCKPIT_NAV_PRIMARY_KEYS = new Set([
  'dashboard',
  'users',
  'einladungen',
  'roles',
  'firms',
  'modules',
  'devices',
]);

/** @type {{ key: string, label: string, iconKey: string, badge?: string }[]} */
export const FUSA_NAV_DEFS = [
  { key: 'fusa_dashboard', label: 'Dashboard', iconKey: 'layoutDashboard' },
  { key: 'fusa_auftraege', label: 'Aufträge', iconKey: 'fileText' },
  { key: 'fusa_fahrzeuge', label: 'Fahrzeuge', iconKey: 'truck' },
  { key: 'fusa_schaeden', label: 'Schäden / Werkstatt', iconKey: 'alertTriangle' },
  { key: 'fusa_kunden', label: 'Kunden', iconKey: 'users' },
  { key: 'fusa_angebote', label: 'Angebote', iconKey: 'fileText' },
  { key: 'fusa_dokumente', label: 'Dokumente', iconKey: 'files' },
  { key: 'fusa_kalender', label: 'Kalender', iconKey: 'calendar' },
  { key: 'fusa_rechnungen', label: 'Rechnungen', iconKey: 'receipt' },
  { key: 'fusa_quartalsabrechnung', label: 'Quartalsabrechnung', iconKey: 'pieChart' },
];

const FUSA_OPERATIVE_KEYS = new Set([
  'fusa_dashboard',
  'fusa_auftraege',
  'fusa_fahrzeuge',
  'fusa_schaeden',
  'fusa_kunden',
  'fusa_angebote',
  'fusa_dokumente',
  'fusa_kalender',
]);

const FUSA_BILLING_KEYS = new Set(['fusa_rechnungen', 'fusa_quartalsabrechnung']);
const FUSA_READONLY_KEYS = new Set();

/** @type {{ key: string, label: string, iconKey: string, badge?: string }[]} */
export const CC_NAV_DEFS = [
  { key: 'cc_dashboard', label: 'Dashboard', iconKey: 'layoutDashboard' },
  { key: 'cc_schnellanfragen', label: 'Schnell-Anfragen', iconKey: 'zap' },
  { key: 'cc_angebote', label: 'Angebote', iconKey: 'fileText' },
  { key: 'cc_auftraege', label: 'Aufträge', iconKey: 'fileText' },
  { key: 'cc_kunden', label: 'Kunden', iconKey: 'users' },
  { key: 'cc_crm', label: 'CRM', iconKey: 'handshake' },
  { key: 'cc_messeflow', label: 'MesseFlow', iconKey: 'layout' },
  { key: 'cc_produktion', label: 'Produktion', iconKey: 'factory' },
  { key: 'cc_materiallager', label: 'Materiallager', iconKey: 'package' },
  { key: 'cc_checklisten', label: 'Checklisten', iconKey: 'listChecks' },
  { key: 'cc_kalender', label: 'Kalender', iconKey: 'calendar' },
  { key: 'cc_mitarbeiter', label: 'Mitarbeiter', iconKey: 'userCircle' },
  { key: 'cc_urlaub', label: 'Urlaub', iconKey: 'palmtree' },
  { key: 'cc_mitarbeiter_app', label: 'Mitarbeiter-App', iconKey: 'smartphone' },
  { key: 'cc_rechnungen', label: 'Rechnungen', iconKey: 'receipt' },
];

/** @type {Record<string, { key: string, label: string, iconKey: string, badge?: string }[]>} */
const DEFS_BY_MODULE = {
  cockpit: COCKPIT_NAV_DEFS,
  fusa: FUSA_NAV_DEFS,
  ccintern: CC_NAV_DEFS,
};

/**
 * @param {{ key: string, label: string, iconKey: string, badge?: string }} d
 * @param {string} activeKey
 */
function navButtonHtml(d, activeKey) {
  const active = d.key === activeKey ? ' ccds-nav-item--active' : '';
  const svg = ccwLucideIconMarkup(d.iconKey);
  const iconInner = svg
    ? `<span class="ccds-nav-icon-box">${svg}</span>`
    : `<span class="ccds-nav-icon-box">·</span>`;
  const badge =
    d.badge != null && String(d.badge).trim() !== ''
      ? `<span class="ccds-nav-badge">${esc(String(d.badge))}</span>`
      : '';
  return `<button type="button" class="ccds-nav-item${active}" data-nav-key="${esc(d.key)}">${iconInner}<span class="ccds-nav-label">${esc(d.label)}</span>${badge}</button>`;
}

/**
 * @param {{ key: string, label: string, iconKey: string, badge?: string }[]} defs
 * @param {string} activeKey
 */
function renderNavGroupHtml(defs, activeKey) {
  return defs.map(d => navButtonHtml(d, activeKey)).join('');
}

/**
 * @param {string} activeKey
 */
function renderSidebarCockpitHtml(activeKey) {
  const primary = COCKPIT_NAV_DEFS.filter(d => COCKPIT_NAV_PRIMARY_KEYS.has(d.key));
  const system = COCKPIT_NAV_DEFS.filter(d => !COCKPIT_NAV_PRIMARY_KEYS.has(d.key));
  return `<div class="ccds-sidebar-label">Navigation</div>${renderNavGroupHtml(primary, activeKey)}<div class="ccds-sidebar-label" style="margin-top:6px;">System</div>${renderNavGroupHtml(system, activeKey)}`;
}

export function renderSidebarCockpit(sidebarEl, activeKey) {
  sidebarEl.innerHTML = renderSidebarCockpitHtml(activeKey);
}

export function renderSidebarFusa(sidebarEl, activeKey) {
  const operative = FUSA_NAV_DEFS.filter(d => FUSA_OPERATIVE_KEYS.has(d.key));
  const billing = FUSA_NAV_DEFS.filter(d => FUSA_BILLING_KEYS.has(d.key));
  const readOnly = FUSA_NAV_DEFS.filter(d => FUSA_READONLY_KEYS.has(d.key));
  sidebarEl.innerHTML = `<div class="ccds-sidebar-label">Operativ</div>${renderNavGroupHtml(operative, activeKey)}<div class="ccds-sidebar-label" style="margin-top:6px;">Abrechnung</div>${renderNavGroupHtml(billing, activeKey)}<div class="ccds-sidebar-label" style="margin-top:6px;">System (Read-only)</div>${renderNavGroupHtml(readOnly, activeKey)}`;
}

export function renderSidebarCcIntern(sidebarEl, activeKey) {
  sidebarEl.innerHTML = `<div class="ccds-sidebar-label">Navigation</div>${renderNavGroupHtml(CC_NAV_DEFS, activeKey)}`;
}

/**
 * Sidebar neu aufbauen. Ziel-Element: `#cockpit-sidebar` (App-Markup).
 * @param {'cockpit'|'fusa'|'ccintern'} modul
 * @param {string} activeKey
 */
export function renderSidebarForModule(modul, activeKey) {
  if (getShellUiAccessSnapshot()?.isMitarbeiterAppOnlyShell === true) {
    const sidebar = document.getElementById('cockpit-sidebar');
    if (sidebar) sidebar.innerHTML = '';
    return '';
  }
  const sidebar = document.getElementById('cockpit-sidebar');
  if (!sidebar) return;
  sidebar.setAttribute('data-sidebar-module', modul);
  if (modul === 'cockpit') renderSidebarCockpit(sidebar, activeKey);
  else if (modul === 'fusa') renderSidebarFusa(sidebar, activeKey);
  else if (modul === 'ccintern') renderSidebarCcIntern(sidebar, activeKey);
}

/** @param {'cockpit'|'fusa'|'ccintern'} modul */
export function getDefaultNavKeyForModule(modul) {
  const defs = DEFS_BY_MODULE[modul];
  return defs && defs[0] ? defs[0].key : 'dashboard';
}

/** @param {'cockpit'|'fusa'|'ccintern'} modul */
export function navKeyIsValidForModule(modul, key) {
  const defs = DEFS_BY_MODULE[modul];
  if (!defs || !key) return false;
  return defs.some(d => d.key === key);
}

/** @param {'cockpit'|'fusa'|'ccintern'} modul */
export function getNavLabelForModule(modul, key) {
  const defs = DEFS_BY_MODULE[modul];
  if (!defs) return 'Ansicht';
  const row = defs.find(d => d.key === key);
  return row ? row.label : 'Ansicht';
}

export function initSidebar() {}

export function safeEmit() {}
