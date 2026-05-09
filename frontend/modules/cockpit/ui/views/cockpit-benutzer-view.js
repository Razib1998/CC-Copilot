/**
 * Cockpit Benutzer — Liste + Filter (CCState) + Detail (Phase 2, read-only).
 */
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { clearMyRightsCache, loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import { collectAccessEditorPayload, renderAccessEditorHtml } from '../lib/cockpit-rights-editor.js';
import CCState from '../../../../core/state/state.js';
import { normalizeCockpitIds } from '../../../../core/api/cockpit-id-adapter.js';
import { findFirmaNavIdForRef } from './cockpit-firmen-view.js';
import { findRolleNavIdForRef, userRoleDisplayLine, userRoleIdHint } from './cockpit-rollen-view.js';

/** @type {object[]} zuletzt geladene Zeilen für Handler (gefiltert) */
let benutzerLastRows = [];

/** @type {object[]} ungefilterte Snapshot-Zeilen — gleiche Objektreferenzen wie in gefilterter Liste */
let benutzerSourceAll = [];
/** @type {string|null} */
let benutzerDetailEditUserId = null;
/** @type {string|null} */
let benutzerOpenRowMenuUserId = null;
/** @type {string} */
let benutzerFlashMessage = '';
/** @type {AbortController|null} */
let benutzerHandlersAbort = null;

/**
 * Session-basierter SUPER_ADMIN-Check (ohne E-Mail- oder User-Hardcode).
 * @param {object|null|undefined} bundle
 * @returns {boolean}
 */
function isSessionSuperAdmin(bundle) {
  const direct = bundle && bundle.global_role != null ? String(bundle.global_role).trim() : '';
  const nested =
    bundle && bundle.user && bundle.user.global_role != null
      ? String(bundle.user.global_role).trim()
      : '';
  const role = (direct || nested).toUpperCase();
  return role === 'SUPER_ADMIN';
}

/**
 * @param {object|null|undefined} bundle
 * @returns {string}
 */
function sessionUserId(bundle) {
  const b = bundle && typeof bundle === 'object' ? normalizeCockpitIds(bundle) : null;
  const direct = b && b.benutzerId != null ? String(b.benutzerId).trim() : '';
  const nested = bundle && bundle.user && bundle.user.id != null ? String(bundle.user.id).trim() : '';
  return direct || nested || '';
}

/**
 * @param {object|null|undefined} primary
 * @param {object|null|undefined} fallback
 * @returns {boolean}
 */
function canEditBenutzerFromSession(primary, fallback) {
  return Boolean(
    isSessionSuperAdmin(primary) ||
      isSessionSuperAdmin(fallback) ||
      myRight(primary, 'cockpit', 'benutzer', 'bearbeiten') ||
      myRight(fallback, 'cockpit', 'benutzer', 'bearbeiten'),
  );
}

/**
 * Liefert Sessiondaten für Bearbeitungsentscheidungen robust mit Fallback.
 * Primaer: /auth/my-rights, Fallback: /auth/me.
 * @param {boolean} [force]
 * @returns {Promise<object|null>}
 */
async function loadSessionForEdit(force = true) {
  try {
    return await loadMyRights(force);
  } catch {
    try {
      const me = await apiFetch('/auth/me');
      if (me && typeof me === 'object') {
        return { ...me, rights: {} };
      }
    } catch {
      return null;
    }
    return null;
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

/**
 * @param {unknown} v
 * @returns {string}
 */
function formatListField(v) {
  if (v == null) return '';
  if (Array.isArray(v)) {
    const parts = v
      .map(x => {
        if (x == null) return '';
        if (typeof x === 'string' || typeof x === 'number') return String(x).trim();
        if (typeof x === 'object' && x.name != null) return String(x.name).trim();
        if (typeof x === 'object' && x.id != null) return String(x.id).trim();
        return '';
      })
      .filter(Boolean);
    return parts.join(', ');
  }
  if (typeof v === 'string') return v.trim();
  return '';
}

/**
 * @param {object} u
 * @returns {string}
 */
function userEmail(u) {
  if (!u || typeof u !== 'object') return '—';
  const e = u.email ?? u.mail ?? u.eMail;
  return e != null && String(e).trim() !== '' ? String(e).trim() : '—';
}

/**
 * @param {object} u
 * @returns {string}
 */
function userDisplayName(u) {
  if (!u || typeof u !== 'object') return '—';
  if (u.name != null && String(u.name).trim() !== '') return String(u.name).trim();
  if (u.displayName != null && String(u.displayName).trim() !== '') return String(u.displayName).trim();
  const e = userEmail(u);
  if (e !== '—') return e;
  if (u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
  return '—';
}

/**
 * @param {object} u
 * @returns {'aktiv'|'eingeladen'|'deaktiviert'}
 */
function canonicalUserStatus(u) {
  if (!u || typeof u !== 'object') return 'deaktiviert';
  if (u.aktiv === false || u.active === false || u.isActive === false) return 'deaktiviert';
  const st = u.status != null ? String(u.status).trim().toLowerCase() : '';
  if (st.includes('eingelad') || st === 'invited' || st === 'pending' || u.eingeladen === true || u.invited === true)
    return 'eingeladen';
  if (st.includes('deaktiv') || st.includes('inaktiv') || st === 'inactive' || st === 'disabled')
    return 'deaktiviert';
  return 'aktiv';
}

/**
 * @param {object} u
 * @returns {string}
 */
function userFirma(u) {
  if (!u || typeof u !== 'object') return '—';
  const f =
    u.firma ??
    u.companyName ??
    u.company ??
    (u.firmaId != null ? String(u.firmaId) : '') ??
    u.organisation;
  return f != null && String(f).trim() !== '' ? String(f).trim() : '—';
}

/**
 * @param {object} u
 * @param {string} moduleLine
 * @returns {{ web: boolean, cc_intern_app: boolean, fusa_app: boolean }}
 */
function userAccessChannels(u, moduleLine) {
  const acc =
    u && typeof u === 'object' && u.modulZugriff && typeof u.modulZugriff === 'object'
      ? u.modulZugriff
      : u && typeof u === 'object' && u.moduleAccess && typeof u.moduleAccess === 'object'
        ? u.moduleAccess
        : null;

  let ccApp =
    u.hasCcInternAppAccess === true ||
    u.ccInternApp === true ||
    u.cc_intern_app === true;
  let fusaApp =
    u.hasFusaWerkstattAppAccess === true ||
    u.fusaWerkstattApp === true ||
    u.fusa_app === true;

  if (acc) {
    if (acc.ccInternApp === true || acc.cc_intern_app === true) ccApp = true;
    if (acc.fusaApp === true || acc.fusaWerkstattApp === true) fusaApp = true;
  }

  const t = (moduleLine || '').toLowerCase();
  const modsRaw = Array.isArray(u?.modules)
    ? u.modules
    : String(moduleLine || '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
  const mods = new Set(modsRaw.map(x => String(x || '').trim().toLowerCase()));
  const hasCockpitModule = mods.has('cockpit');
  const hasFusaModule = mods.has('fusa');
  const hasCcInternModule = mods.has('ccintern') || mods.has('cc intern');
  if (/\bcc\s*intern\s*app\b/.test(t) || /\bccinternapp\b/.test(t)) ccApp = true;
  if (/\bwerkstatt\b/.test(t) && /\bfusa\b/.test(t)) fusaApp = true;

  const cockpitOn =
    acc && (acc.cockpit === true || acc.Cockpit === true) ? true : /\bcockpit\b/.test(t);
  const ccOn = acc && (acc.ccIntern === true || acc.ccintern === true || acc['CC Intern'] === true);
  const fusaOn = acc && (acc.fusa === true || acc.FUSA === true);

  const web = hasCockpitModule || cockpitOn || /\bcockpit\b/.test(t);

  return {
    web,
    cc_intern_app: hasCcInternModule || ccOn || ccApp || /\bcc\s*intern\b/.test(t),
    fusa_app: hasFusaModule || fusaOn || fusaApp || (/\bfusa\b/.test(t) && /\b(app|werkstatt|mobile)\b/.test(t)),
  };
}

/**
 * @param {object} u
 * @returns {string}
 */
function projectsLine(u) {
  return (
    formatListField(u.projekte) ||
    formatListField(u.zugewieseneProjekte) ||
    formatListField(u.projectIds) ||
    formatListField(u.projektIds) ||
    '—'
  );
}

/**
 * @param {object} u
 * @returns {string}
 */
function moduleLine(u) {
  if (u && Array.isArray(u.modules) && u.modules.length > 0) {
    return u.modules.join(', ');
  }
  return (
    formatListField(u.module) ||
    formatListField(u.modules) ||
    formatListField(u.modulFreigaben) ||
    formatListField(u.freigeschalteteModule) ||
    formatListField(u.modulFreigabe) ||
    ''
  );
}

/**
 * @param {object} u
 * @param {number} index
 * @returns {string}
 */
function stableUserId(u, index) {
  if (u && u.id != null && String(u.id).trim() !== '') return String(u.id).trim();
  const em = userEmail(u);
  if (em !== '—') return `email:${em}`;
  return `idx:${index}`;
}

/**
 * @param {object} u
 * @param {string} moduleSummary
 * @returns {boolean}
 */
function userPassesFilter(u, moduleSummary) {
  const f = CCState.get('cockpitUserListFilter');
  if (!f) return true;
  if (f.status && canonicalUserStatus(u) !== f.status) return false;
  if (f.access) {
    const ch = userAccessChannels(u, moduleSummary);
    if (f.access === 'web' && !ch.web) return false;
    if (f.access === 'cc_intern_app' && !ch.cc_intern_app) return false;
    if (f.access === 'fusa_app' && !ch.fusa_app) return false;
  }
  if (f.projektId && f.projektId.trim() !== '') {
    const pl = projectsLine(u).toLowerCase();
    const pid = f.projektId.trim().toLowerCase();
    if (!pl.includes(pid)) return false;
  }
  if (f.firmaId && f.firmaId.trim() !== '') {
    const cid = f.firmaId.trim().toLowerCase();
    const comp = userFirma(u).toLowerCase();
    const rawId = u.firmaId != null ? String(u.firmaId).toLowerCase() : '';
    if (!comp.includes(cid) && rawId !== cid) return false;
  }
  return true;
}

function accessLabel(ch) {
  const parts = [];
  if (ch.web) parts.push('Web');
  if (ch.cc_intern_app) parts.push('CC Intern');
  if (ch.fusa_app) parts.push('FUSA');
  return parts.length ? parts.join(' · ') : '—';
}

function statusLabel(st) {
  if (st === 'aktiv') return 'aktiv';
  if (st === 'eingeladen') return 'eingeladen';
  return 'deaktiviert';
}

const AVATAR_VARIANTS = [
  'ccds-avatar--green',
  'ccds-avatar--blue',
  'ccds-avatar--purple',
  'ccds-avatar--orange',
  'ccds-avatar--pink',
  'ccds-avatar--teal',
];

/**
 * @param {string} name
 * @param {string} email
 * @returns {string}
 */
function initialsFromDisplay(name, email) {
  const n = (name && name !== '—' ? String(name) : '').trim();
  if (n) {
    const p = n.split(/\s+/).filter(Boolean);
    if (p.length >= 2) return (p[0][0] + p[1][0]).toUpperCase().slice(0, 2);
    return n.slice(0, 2).toUpperCase();
  }
  const e = (email && email !== '—' ? String(email) : '').trim();
  if (e) return e.slice(0, 2).toUpperCase();
  return '?';
}

/**
 * @param {number} rowIndex
 * @param {'aktiv'|'eingeladen'|'deaktiviert'} st
 * @returns {string}
 */
function avatarVariantClass(rowIndex, st) {
  if (st === 'eingeladen') return 'ccds-avatar--gray';
  return AVATAR_VARIANTS[Math.abs(rowIndex) % AVATAR_VARIANTS.length];
}

/**
 * @param {'aktiv'|'eingeladen'|'deaktiviert'} st
 * @returns {string}
 */
function statusChipHtml(st) {
  if (st === 'aktiv')
    return `<span class="ccds-chip ccds-chip--active"><span class="ccds-chip-dot" aria-hidden="true"></span>Aktiv</span>`;
  if (st === 'eingeladen')
    return `<span class="ccds-chip ccds-chip--invited"><span class="ccds-chip-dot" aria-hidden="true"></span>Eingeladen</span>`;
  return `<span class="ccds-chip ccds-chip--disabled"><span class="ccds-chip-dot" aria-hidden="true"></span>Gesperrt</span>`;
}

/**
 * @param {string} uid
 * @returns {object|null}
 */
function findUserById(uid) {
  if (!uid) return null;
  for (let i = 0; i < benutzerSourceAll.length; i++) {
    const u = benutzerSourceAll[i];
    if (stableUserId(u, i) === uid) return u;
  }
  return null;
}

/**
 * @param {string} rline
 * @returns {string}
 */
function roleBadgeClass(rline) {
  const t = (rline || '').toLowerCase();
  if (t.includes('super')) return 'ccds-role-badge--super';
  if (t.includes('admin')) return 'ccds-role-badge--admin';
  if (t.includes('intern') || t === 'intern') return 'ccds-role-badge--intern';
  if (t.includes('kunde') || t.includes('extern') || t.includes('partner') || t.includes('werkstatt'))
    return 'ccds-role-badge--extern';
  return 'ccds-role-badge--neutral';
}

/**
 * @param {string} rline
 * @param {string|null} rolleNavId
 * @returns {string}
 */
function roleCellStylCHtml(rline, rolleNavId) {
  const cls = roleBadgeClass(rline);
  if (!rline || rline === '—') return `<span class="ccds-role-badge ccds-role-badge--neutral">—</span>`;
  if (rolleNavId) {
    return `<button type="button" class="ccds-role-badge ${cls} ccds-rolle-nav-link" data-nav-key="roles" data-ccw-rolle-nav-id="${esc(rolleNavId)}">${esc(rline)}</button>`;
  }
  return `<span class="ccds-role-badge ${cls}">${esc(rline)}</span>`;
}

/**
 * @param {string} firmaText
 * @param {string|null} fid
 * @returns {string}
 */
function firmaCellStylCHtml(firmaText, fid) {
  if (firmaText === '—') return `<span class="ccds-cell-muted">—</span>`;
  if (fid) {
    return `<button type="button" class="ccds-firma-nav-link" data-nav-key="firms" data-ccw-firma-nav-id="${esc(fid)}">${esc(firmaText)}</button>`;
  }
  return `<span class="ccds-cell-muted">${esc(firmaText)}</span>`;
}

/**
 * @param {object} u
 * @returns {string}
 */
function deviceDotsHtml(u) {
  let n = 3;
  let on = 1;
  if (u && Array.isArray(u.devices)) {
    n = Math.min(3, Math.max(1, u.devices.length || 1));
    on = u.devices.filter(d => d && d.online !== false && d.active !== false).length;
    on = Math.min(n, Math.max(0, on));
  } else if (u && typeof u.deviceCount === 'number' && Number.isFinite(u.deviceCount)) {
    n = Math.min(3, Math.max(1, u.deviceCount));
    on = Math.min(n, n);
  }
  const parts = [];
  for (let i = 0; i < 3; i++) {
    parts.push(
      `<span class="ccds-dev-dot${i < on ? '' : ' ccds-dev-dot--off'}" aria-hidden="true"></span>`,
    );
  }
  return `<span class="ccds-devices">${parts.join('')}</span>`;
}

/**
 * @param {object[]} all
 * @returns {{ total: number, aktiv: number, eingeladen: number, deaktiviert: number }}
 */
/**
 * @param {object|null} selectedUser
 * @param {object[]} allRows
 */
async function buildUserDetailOpts(selectedUser, allRows, mySession = null) {
  if (!selectedUser) return {};
  const my = mySession || (await loadSessionForEdit(true));
  const myMe = await apiFetch('/auth/me').catch(() => null);
  const oi = allRows.indexOf(selectedUser);
  const uid = stableUserId(selectedUser, oi >= 0 ? oi : 0);
  let rightsBundle = null;
  let rightsLoadFailed = false;
  const selfEditAllowed = sessionUserId(my) === uid || sessionUserId(myMe) === uid;
  if ((my || myMe) && (isSessionSuperAdmin(my) || isSessionSuperAdmin(myMe) || selfEditAllowed)) {
    try {
      const rawRights = await apiFetch(`/api/v1/users/${encodeURIComponent(uid)}/rights`);
      rightsBundle =
        rawRights && typeof rawRights === 'object' && rawRights.data && typeof rawRights.data === 'object'
          ? rawRights.data
          : rawRights;
    } catch {
      rightsBundle = null;
      rightsLoadFailed = true;
    }
  }
  const listMods = moduleLine(selectedUser);
  const listGr = selectedUser.global_role != null ? String(selectedUser.global_role) : '—';
  const fallbackModules =
    selectedUser && Array.isArray(selectedUser.modules)
      ? selectedUser.modules.filter(x => typeof x === 'string')
      : [];
  const fallbackBundle = {
    global_role: listGr !== '—' ? listGr : 'INTERN',
    modules: fallbackModules,
    rights: {},
  };
  const canEdit = canEditBenutzerFromSession(my, myMe);
  const rightsSummary = rightsBundle
    ? `Aus API: Rolle ${esc(String(rightsBundle.global_role ?? '—'))} · Module ${esc((rightsBundle.modules || []).join(', ') || '—')}.`
    : rightsLoadFailed
      ? `API-Rechte konnten nicht geladen werden. Fallback: Rolle ${esc(listGr)} · Module ${esc(listMods || '—')}.`
      : `Aus Liste: Rolle ${esc(listGr)} · Module ${esc(listMods || '—')}.`;
  const editorSource = rightsBundle || fallbackBundle;
  const editorHtml =
    canEdit
      ? renderAccessEditorHtml(uid, {
          global_role: editorSource.global_role,
          modules: editorSource.modules,
          rights: editorSource.rights,
        })
      : '';
  return { rightsSummary, editorHtml, canEdit, benutzerId: uid };
}

function countUserStats(all) {
  let aktiv = 0;
  let eingeladen = 0;
  let deaktiviert = 0;
  for (const u of all) {
    const s = canonicalUserStatus(u);
    if (s === 'aktiv') aktiv++;
    else if (s === 'eingeladen') eingeladen++;
    else deaktiviert++;
  }
  return { total: all.length, aktiv, eingeladen, deaktiviert };
}

/**
 * @param {object[]} rows
 * @param {object[]} all
 * @param {object|null} raw
 * @param {string|null} selectedId
 * @returns {string}
 */
function renderBenutzerTableHtml(rows, all, raw, selectedId) {
  const head = `<div class="ccds-table-head" role="row">
  <div class="ccds-th" aria-hidden="true"></div>
  <div class="ccds-th">Name / E-Mail</div>
  <div class="ccds-th">Firma</div>
  <div class="ccds-th">Rolle</div>
  <div class="ccds-th">Status</div>
  <div class="ccds-th">Geräte</div>
  <div class="ccds-th" aria-hidden="true"></div>
</div>`;

  if (rows.length === 0) {
    return `${head}<div class="ccds-table-body" role="list"><div class="ckp-benutzer-empty ckp-cockpit-empty-inline">Keine Benutzer für die aktuellen Filter (oder leerer Snapshot).</div></div>`;
  }

  const body = rows
    .map(u => {
      const origI = all.indexOf(u);
      const id = stableUserId(u, origI >= 0 ? origI : 0);
      const ml = moduleLine(u);
      const ch = userAccessChannels(u, ml);
      const st = canonicalUserStatus(u);
      const nm = userDisplayName(u);
      const em = userEmail(u);
      const initials = initialsFromDisplay(nm, em);
      const avCls = avatarVariantClass(origI >= 0 ? origI : 0, st);
      const avText = st === 'eingeladen' ? '✉' : esc(initials);
      const firmaText = userFirma(u);
      const fid =
        raw && typeof raw === 'object' && firmaText !== '—'
          ? findFirmaNavIdForRef(raw, { firmaId: u.firmaId, firmaName: firmaText })
          : null;
      const rline = userRoleDisplayLine(u);
      const rHint = userRoleIdHint(u);
      const rolleNavId =
        raw && typeof raw === 'object' && rline
          ? findRolleNavIdForRef(raw, { rollenId: rHint || null, roleName: rline })
          : null;
      const sel = selectedId && id === selectedId;
      const rowCls = `ccds-table-row${sel ? ' ccds-table-row--selected' : ''}${st === 'deaktiviert' ? ' ccds-table-row--disabled' : ''}`;
      const lockLabel = st === 'deaktiviert' ? 'Benutzer entsperren' : 'Benutzer sperren';
      const menuHtml =
        benutzerOpenRowMenuUserId === id
          ? `<div class="ccds-row-menu" style="position:absolute;right:0;top:28px;z-index:40;min-width:210px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;box-shadow:0 10px 26px rgba(15,23,42,.14);padding:6px;">
  <button type="button" data-ccw-user-row-action="lock-toggle" data-ccw-user-row-action-id="${esc(id)}" style="display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:transparent;border-radius:8px;cursor:pointer;">${esc(lockLabel)}</button>
  <button type="button" data-ccw-user-row-action="password-reset" data-ccw-user-row-action-id="${esc(id)}" style="display:block;width:100%;text-align:left;padding:8px 10px;border:0;background:transparent;border-radius:8px;cursor:pointer;">Passwort zurücksetzen</button>
</div>`
          : '';
      return `<div class="${rowCls}" tabindex="0" role="button" data-user-id="${esc(id)}" aria-label="Benutzer ${esc(nm)}">
  <div class="ccds-avatar ${avCls}" aria-hidden="true">${avText}</div>
  <div class="ccds-user-cell">
    <div class="ccds-user-name">${esc(nm)}</div>
    <div class="ccds-user-email">${esc(em)}</div>
    <div class="ccds-user-email" style="font-size:11px;color:#64748b;margin-top:2px;">${esc(
      u.global_role != null ? String(u.global_role) : '—',
    )} · ${esc(moduleLine(u) || '—')}</div>
  </div>
  <div class="ccds-cell-muted">${firmaCellStylCHtml(firmaText, fid)}</div>
  <div>${roleCellStylCHtml(rline, rolleNavId)}</div>
  <div>${statusChipHtml(st)}</div>
  <div>${deviceDotsHtml(u)}</div>
  <div class="ccds-row-actions" style="position:relative;">
    <button type="button" class="ccds-act-btn" data-ccw-user-row-edit="${esc(id)}" title="Bearbeiten">✏</button>
    <button type="button" class="ccds-act-btn" data-ccw-user-row-menu="${esc(id)}" title="Aktionen">⋯</button>
    ${menuHtml}
  </div>
</div>`;
    })
    .join('');

  return `${head}<div class="ccds-table-body" role="list">${body}</div>`;
}

/**
 * @returns {string}
 */
function renderFilterBarHtml() {
  const f = CCState.get('cockpitUserListFilter') || {};
  const st = f.status || '';
  const chip = (label, value, dotColor, active) =>
    `<button type="button" class="ccds-filter-chip${active ? ' ccds-filter-chip--active' : ''}" data-ccw-benutzer-chip-status="${esc(value)}">
  <span class="ccds-filter-chip-dot" style="background:${dotColor};" aria-hidden="true"></span>
  ${esc(label)}
</button>`;
  const extra = [];
  if (f.access) extra.push(`access=${esc(f.access)}`);
  if (f.projektId) extra.push(`project=${esc(f.projektId)}`);
  if (f.firmaId) extra.push(`firma=${esc(f.firmaId)}`);
  const extraTxt = extra.length ? `<span class="ccds-cell-muted" style="font-size:11px;padding:4px 8px;">${esc(extra.join(' · '))}</span>` : '';
  return `<div class="ccds-filter-bar">
  ${chip('Alle', '', '#64748b', st === '')}
  ${chip('Aktiv', 'aktiv', '#22c55e', st === 'aktiv')}
  ${chip('Eingeladen', 'eingeladen', '#f59e0b', st === 'eingeladen')}
  ${chip('Gesperrt', 'deaktiviert', '#ef4444', st === 'deaktiviert')}
  ${extraTxt}
  <span class="ccds-filter-spacer"></span>
  <button type="button" class="ccds-sort-btn" data-ccw-benutzer-filter-reset title="Alle Filter zurücksetzen">
    <span class="ccds-sort-btn-icon" aria-hidden="true">↕</span>
    Zurücksetzen
  </button>
</div>`;
}

/**
 * @param {{ web: boolean, cc_intern_app: boolean, fusa_app: boolean }} ch
 * @returns {string}
 */
function accessGridReadOnlyHtml(ch) {
  const items = [
    ['Cockpit', ch.web],
    ['CC Intern', ch.cc_intern_app],
    ['FUSA', ch.fusa_app],
  ];
  return `<div class="ccds-access-grid">${items
    .map(
      ([label, on]) =>
        `<div class="ccds-access-item${on ? ' ccds-access-item--on' : ''}">
  <span>${esc(label)}</span>
  <span class="ccds-access-toggle${on ? ' ccds-access-toggle--on' : ' ccds-access-toggle--off'}" aria-hidden="true"><span class="ccds-access-knob"></span></span>
</div>`,
    )
    .join('')}</div>`;
}

/**
 * @param {object} u
 * @param {object[]} all
 * @param {object|null} raw
 * @returns {string}
 */
/**
 * @param {object} u
 * @param {object[]} all
 * @param {object|null} raw
 * @param {{ rightsBundle?: object|null, editorHtml?: string, rightsSummary?: string }} [opts]
 */
function renderUserDetailPanelHtml(u, all, raw, opts = {}) {
  const ml = moduleLine(u);
  const ch = userAccessChannels(u, ml);
  const pl = projectsLine(u);
  const st = canonicalUserStatus(u);
  const nm = userDisplayName(u);
  const em = userEmail(u);
  const initials = initialsFromDisplay(nm, em);
  const avText = st === 'eingeladen' ? '✉' : esc(initials);
  const firmaText = userFirma(u);
  const fid =
    raw && typeof raw === 'object' && firmaText !== '—'
      ? findFirmaNavIdForRef(raw, { firmaId: u.firmaId, firmaName: firmaText })
      : null;
  const rline = userRoleDisplayLine(u);
  const rHint = userRoleIdHint(u);
  const rolleNavId =
    raw && typeof raw === 'object' && rline
      ? findRolleNavIdForRef(raw, { rollenId: rHint || null, roleName: rline })
      : null;
  const roleChipInner = roleCellStylCHtml(rline, rolleNavId);
  const projBlock =
    pl === '—'
      ? `<p class="ccds-phase-inline">Keine Projekte im Snapshot.</p>`
      : `<ul style="margin:0;padding-left:1.1rem;font-size:12px;color:#475569;line-height:1.45;">${pl
          .split(',')
          .map(s => s.trim())
          .filter(Boolean)
          .map(p => `<li>${esc(p)}</li>`)
          .join('')}</ul>`;

  const emailInput = `<input type="email" data-ccw-user-edit-email value="${esc(em === '—' ? '' : em)}" readonly style="width:100%;max-width:420px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;" />`;
  const nameInput = `<input type="text" data-ccw-user-edit-name value="${esc(nm === '—' ? '' : nm)}" readonly style="width:100%;max-width:420px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;" />`;
  const editModal =
    opts.canEdit && opts.editorHtml
      ? `<dialog class="ckp-benutzer-edit-modal" data-ccw-benutzer-edit-dialog>
  <div class="ckp-benutzer-edit-modal__head">
    <h3 style="margin:0;font-size:16px;">Benutzer bearbeiten</h3>
    <button type="button" class="ccds-dp-btn ccds-dp-btn--secondary" data-ccw-benutzer-edit-close aria-label="Schliessen">X</button>
  </div>
  <div class="ckp-benutzer-edit-modal__body">
    ${opts.editorHtml}
  </div>
  <div class="ckp-benutzer-edit-modal__footer">
    <button type="button" class="ccds-btn-primary" data-ccw-benutzer-modal-save>Speichern</button>
    <button type="button" class="ccds-dp-btn ccds-dp-btn--secondary" data-ccw-benutzer-edit-cancel>Abbrechen</button>
  </div>
</dialog>`
      : '';
  return `<div class="ccds-dp-header">
  <div class="ccds-dp-avatar" aria-hidden="true">${avText}</div>
  <div>
    <div class="ccds-dp-name">${esc(nm)}</div>
    <div class="ccds-dp-email">${esc(em)}</div>
  </div>
  <div class="ccds-dp-chips">${roleChipInner}${statusChipHtml(st)}</div>
</div>
<div class="ccds-dp-section">
  <div class="ccds-dp-section-title">Kontakt & Firma</div>
  <div class="ccds-dp-row"><span class="ccds-dp-icon-box" aria-hidden="true">👤</span> ${nameInput}</div>
  <div class="ccds-dp-row"><span class="ccds-dp-icon-box" aria-hidden="true">✉</span> ${emailInput}</div>
  <div class="ccds-dp-row"><span class="ccds-dp-icon-box" aria-hidden="true">🏢</span> ${firmaCellStylCHtml(firmaText, fid)}</div>
  <div class="ccds-dp-row"><span class="ccds-dp-icon-box" aria-hidden="true">◎</span> Zugang: <strong>${esc(accessLabel(ch))}</strong></div>
  ${
    opts.canEdit
      ? `<div style="margin-top:8px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
    <button type="button" class="ccds-dp-btn ccds-dp-btn--secondary" data-ccw-benutzer-edit-toggle>Bearbeiten</button>
  </div>`
      : ''
  }
</div>
<div class="ccds-dp-section">
  <div class="ccds-dp-section-title">Modulzugriff</div>
  ${accessGridReadOnlyHtml(ch)}
</div>
<div class="ccds-dp-section">
  <div class="ccds-dp-section-title">Projekte</div>
  ${projBlock}
</div>
${
  opts.rightsSummary
    ? `<div class="ccds-dp-section">
  <div class="ccds-dp-section-title">Rechte (Cockpit)</div>
  <p class="ccds-phase-inline" style="margin:0;">${esc(opts.rightsSummary)}</p>
</div>`
    : ''
}
${editModal}
<div class="ccds-dp-footer">
  <button type="button" class="ccds-dp-btn ccds-dp-btn--secondary" data-ccw-benutzer-back>
    <span class="ccds-dp-icon-box" aria-hidden="true" style="width:22px;height:22px;">←</span>
    Zurück zur Liste
  </button>
</div>`;
}

function phase2Notice() {
  return `<p class="ccds-phase-inline" role="status">Daten von <code>GET /users</code> (inkl. Modulzuweisung). Rechte bearbeiten: <code>PATCH /users/:id/access</code> (nur SUPER_ADMIN).</p>`;
}

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitBenutzerViewHtml() {
  let loadErr = '';
  /** @type {object[]} */
  let all = [];
  try {
    const r = await apiFetch('/users');
    all = Array.isArray(r?.data?.users ?? r?.users)
      ? (r?.data?.users ?? r?.users ?? []).filter(u => u && typeof u === 'object')
      : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  const rawObj = null;
  benutzerSourceAll = all;
  benutzerLastRows = all.filter(u => userPassesFilter(u, moduleLine(u)));

  const stats = countUserStats(all);
  const selId = CCState.get('cockpitBenutzerSelectedId');
  let selectedUser = null;
  if (selId && benutzerLastRows.length) {
    for (const u of benutzerLastRows) {
      const oi = all.indexOf(u);
      if (stableUserId(u, oi >= 0 ? oi : 0) === selId) {
        selectedUser = u;
        break;
      }
    }
  }

  let myBtn = null;
  try {
    myBtn = await loadSessionForEdit(true);
  } catch {
    myBtn = null;
  }
  const canCreateUser =
    !!myBtn &&
    (isSessionSuperAdmin(myBtn) || myRight(myBtn, 'cockpit', 'benutzer', 'erstellen'));
  const newUserEditorHtml = renderAccessEditorHtml('__new__', {
    global_role: 'INTERN',
    modules: [],
    rights: {},
  });
  const detailOpts = selectedUser ? await buildUserDetailOpts(selectedUser, all, myBtn) : {};

  const tableBlock =
    all.length === 0
      ? `${renderFilterBarHtml()}${renderBenutzerTableHtml([], all, rawObj, selId)}<div class="ccds-table-footer"><span>0 von ${all.length} Benutzer(n)</span></div>`
      : `${renderFilterBarHtml()}${renderBenutzerTableHtml(benutzerLastRows, all, rawObj, selId)}<div class="ccds-table-footer"><span>${benutzerLastRows.length} von ${all.length} Benutzer(n)</span></div>`;

  const detailBody = selectedUser
    ? renderUserDetailPanelHtml(selectedUser, all, rawObj, detailOpts)
    : `Wählen Sie einen Benutzer aus der Liste — Details erscheinen hier (read-only).`;

  const detailPanelCls = `ccds-detail-panel${selectedUser ? '' : ' ccds-detail-panel--empty'}`;

  return `<div class="ckp-benutzer" data-ccw-ro="cockpit-benutzer">
  <div class="ccds-benutzer-layout">
    <div class="ccds-page-top">
      <div>
        <h2>Benutzer</h2>
        <p>Alle Zugänge einsehen — Filter und Details, ohne Bearbeitung (Phase 2).</p>
        ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
        <p class="ccds-phase-inline" data-ccw-benutzer-flash ${benutzerFlashMessage ? '' : 'hidden'}>${esc(benutzerFlashMessage)}</p>
        ${phase2Notice()}
      </div>
      <button type="button" class="ccds-btn-primary"${canCreateUser ? '' : ' disabled aria-disabled="true"'} title="${
        canCreateUser
          ? 'Neuen Benutzer mit Rolle, Modulen und Rechten anlegen (POST /api/v1/users)'
          : 'Recht „benutzer.erstellen“ oder SUPER_ADMIN erforderlich'
      }" data-ccw-benutzer-invite-hint="${canCreateUser ? '1' : '0'}">
        <span class="ccds-btn-primary-icon" aria-hidden="true">+</span>
        Neu einladen
      </button>
    </div>
    <div class="ccds-stats-row">
      <div class="ccds-stat-card">
        <div class="ccds-stat-icon-box ccds-stat-icon-box--blue" aria-hidden="true">👥</div>
        <div><div class="ccds-stat-val">${stats.total}</div><div class="ccds-stat-label">Gesamt</div></div>
      </div>
      <div class="ccds-stat-card">
        <div class="ccds-stat-icon-box ccds-stat-icon-box--green" aria-hidden="true">✓</div>
        <div><div class="ccds-stat-val">${stats.aktiv}</div><div class="ccds-stat-label">Aktiv</div></div>
      </div>
      <div class="ccds-stat-card">
        <div class="ccds-stat-icon-box ccds-stat-icon-box--amber" aria-hidden="true">✉</div>
        <div><div class="ccds-stat-val">${stats.eingeladen}</div><div class="ccds-stat-label">Eingeladen</div></div>
      </div>
      <div class="ccds-stat-card">
        <div class="ccds-stat-icon-box ccds-stat-icon-box--red" aria-hidden="true">🔒</div>
        <div><div class="ccds-stat-val">${stats.deaktiviert}</div><div class="ccds-stat-label">Gesperrt</div></div>
      </div>
    </div>
    <div class="ccds-table-card">
      <div class="ccds-table-area">
        <div data-ccw-benutzer-main="1">${tableBlock}</div>
      </div>
      <aside id="ckp-benutzer-detail" class="${detailPanelCls}" role="region" aria-label="Benutzerdetails">${detailBody}</aside>
    </div>
  </div>
  <dialog class="ckp-benutzer-dlg" data-ccw-benutzer-invite-dialog style="max-width:min(760px,96vw);padding:16px;border:1px solid #e2e8f0;border-radius:10px;">
    <h3 style="margin:0 0 8px;font-size:15px;">Neuen Benutzer anlegen</h3>
    <p style="margin:0 0 12px;font-size:12px;color:#64748b;line-height:1.45;">Speichern über <code>POST /api/v1/users</code> (Name, E-Mail, globale Rolle, Module, Rechte-Matrix). Das Anmeldepasswort wird serverseitig gesetzt — der Nutzer erhält Zugang z.&nbsp;B. über Passwort-Reset oder eine Einladung.</p>
    <div style="display:grid;gap:10px;margin-bottom:12px;max-width:420px;">
      <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">Name
        <input type="text" data-ccw-new-user-name autocomplete="name" style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;" />
      </label>
      <label style="font-size:12px;display:flex;flex-direction:column;gap:4px;">E-Mail <span style="color:#b91c1c">*</span>
        <input type="email" data-ccw-new-user-email required autocomplete="email" style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;" />
      </label>
    </div>
    <div style="max-height:50vh;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;padding:8px;background:#fafafa;">
      ${newUserEditorHtml}
    </div>
    <p class="ckp-api-error" data-ccw-new-user-msg hidden role="alert" style="margin-top:10px;"></p>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:14px;">
      <button type="button" class="ccds-btn-primary" data-ccw-benutzer-create-submit>Benutzer anlegen</button>
      <button type="button" class="ccds-btn-primary" data-ccw-benutzer-invite-close style="background:#64748b;">Abbrechen</button>
    </div>
  </dialog>
</div>`;
}

/**
 * @param {HTMLElement} root .ckp-benutzer
 */
async function refreshBenutzerMainDom(root, usersReloadNonce = '') {
  const main = root.querySelector('[data-ccw-benutzer-main="1"]');
  const detailEl = root.querySelector('#ckp-benutzer-detail');
  if (!main) return;

  let loadErr = '';
  /** @type {object[]} */
  let all = [];
  let myBtn = null;
  try {
    myBtn = await loadSessionForEdit(true);
  } catch {
    myBtn = null;
  }
  try {
    const usersPath = usersReloadNonce ? `/users?__r=${encodeURIComponent(String(usersReloadNonce))}` : '/users';
    const r = await apiFetch(usersPath);
    all = Array.isArray(r?.data?.users ?? r?.users)
      ? (r?.data?.users ?? r?.users ?? []).filter(u => u && typeof u === 'object')
      : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  const rawObj = null;
  benutzerSourceAll = all;
  benutzerLastRows = all.filter(u => userPassesFilter(u, moduleLine(u)));

  const selId = CCState.get('cockpitBenutzerSelectedId');
  const tableInner =
    all.length === 0
      ? `${renderFilterBarHtml()}${renderBenutzerTableHtml([], all, rawObj, selId)}<div class="ccds-table-footer"><span>0 von ${all.length} Benutzer(n)</span></div>`
      : `${renderFilterBarHtml()}${renderBenutzerTableHtml(benutzerLastRows, all, rawObj, selId)}<div class="ccds-table-footer"><span>${benutzerLastRows.length} von ${all.length} Benutzer(n)</span></div>`;
  main.innerHTML = `${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}${tableInner}`;
  const flashMount = root.querySelector('[data-ccw-benutzer-flash]');
  if (flashMount instanceof HTMLElement) {
    flashMount.textContent = benutzerFlashMessage || '';
    flashMount.hidden = !benutzerFlashMessage;
  }

  if (detailEl) {
    let selectedUser = null;
    if (selId && benutzerLastRows.length) {
      for (const u of benutzerLastRows) {
        const oi = all.indexOf(u);
        if (stableUserId(u, oi >= 0 ? oi : 0) === selId) {
          selectedUser = u;
          break;
        }
      }
    }
    if (selectedUser) {
      detailEl.classList.remove('ccds-detail-panel--empty');
      const dOpts = await buildUserDetailOpts(selectedUser, all, myBtn);
      detailEl.innerHTML = renderUserDetailPanelHtml(selectedUser, all, rawObj, dOpts);
    } else {
      detailEl.classList.add('ccds-detail-panel--empty');
      detailEl.innerHTML = `Wählen Sie einen Benutzer aus der Liste — Details erscheinen hier (read-only).`;
    }
  }
}

/**
 * @param {ParentNode|null|undefined} mount
 */
export function attachCockpitBenutzerHandlers(mount) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="cockpit-benutzer"]');
  if (!root || !(root instanceof HTMLElement)) return;
  if (benutzerHandlersAbort) benutzerHandlersAbort.abort();
  benutzerHandlersAbort = new AbortController();
  const sig = benutzerHandlersAbort.signal;

  /**
   * @param {string} uid
   * @param {{ openEditModal?: boolean }} [opts]
   */
  const selectUserAndMaybeOpenModal = async (uid, opts = {}) => {
    if (!uid) return;
    CCState.set('cockpitBenutzerSelectedId', uid);
    benutzerDetailEditUserId = uid;
    await refreshBenutzerMainDom(root);
    if (opts.openEditModal) {
      const dlg = root.querySelector('[data-ccw-benutzer-edit-dialog]');
      if (dlg instanceof HTMLDialogElement) dlg.showModal();
    }
  };

  mount.addEventListener('click', async ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!root.contains(t)) return;
    if (
      benutzerOpenRowMenuUserId &&
      !t.closest('[data-ccw-user-row-menu]') &&
      !t.closest('[data-ccw-user-row-action]') &&
      !t.closest('.ccds-row-menu')
    ) {
      benutzerOpenRowMenuUserId = null;
      await refreshBenutzerMainDom(root);
      return;
    }
    if (t.closest('[data-ccw-mod-toggle]')) {
      ev.stopPropagation();
    }
    if (t.closest('.ckp-benutzer-edit-modal__body')) {
      ev.stopPropagation();
    }

    const inviteHint = t.closest('[data-ccw-benutzer-invite-hint="1"]');
    if (inviteHint) {
      ev.preventDefault();
      const dlg = root.querySelector('[data-ccw-benutzer-invite-dialog]');
      if (dlg instanceof HTMLDialogElement) dlg.showModal();
      return;
    }
    const inviteClose = t.closest('[data-ccw-benutzer-invite-close]');
    if (inviteClose) {
      ev.preventDefault();
      const dlg = root.querySelector('[data-ccw-benutzer-invite-dialog]');
      if (dlg instanceof HTMLDialogElement) dlg.close();
      return;
    }

    const createSubmit = t.closest('[data-ccw-benutzer-create-submit]');
    if (createSubmit) {
      ev.preventDefault();
      const dlg = root.querySelector('[data-ccw-benutzer-invite-dialog]');
      const msg = root.querySelector('[data-ccw-new-user-msg]');
      const nameInp = root.querySelector('[data-ccw-new-user-name]');
      const emailInp = root.querySelector('[data-ccw-new-user-email]');
      const ed =
        dlg && dlg instanceof HTMLDialogElement ? dlg.querySelector('.ckp-access-editor') : null;
      if (!(dlg instanceof HTMLDialogElement) || !(ed instanceof HTMLElement)) return;
      if (msg instanceof HTMLElement) {
        msg.textContent = '';
        msg.hidden = true;
      }
      const email = emailInp instanceof HTMLInputElement ? String(emailInp.value || '').trim() : '';
      const name = nameInp instanceof HTMLInputElement ? String(nameInp.value || '').trim() : '';
      if (!email) {
        if (msg instanceof HTMLElement) {
          msg.textContent = 'E-Mail ist erforderlich.';
          msg.hidden = false;
        }
        return;
      }
      try {
        const payload = collectAccessEditorPayload(ed);
        await apiFetch('/api/v1/users', {
          method: 'POST',
          body: { email, name: name || null, ...payload },
        });
        clearMyRightsCache();
        if (emailInp instanceof HTMLInputElement) emailInp.value = '';
        if (nameInp instanceof HTMLInputElement) nameInp.value = '';
        dlg.close();
        await refreshBenutzerMainDom(root, Date.now());
      } catch (e) {
        if (msg instanceof HTMLElement) {
          msg.textContent = formatApiErrorForUi(e);
          msg.hidden = false;
        }
      }
      return;
    }

    const saveBtn = t.closest('[data-ccw-access-save]');
    if (saveBtn) {
      ev.preventDefault();
      const ed = saveBtn.closest('.ckp-access-editor');
      if (!(ed instanceof HTMLElement)) return;
      const uid = ed.getAttribute('data-ccw-access-editor');
      if (!uid) return;
      const msg = ed.querySelector('[data-ccw-access-save-msg]');
      try {
        const sessionNow = await loadSessionForEdit(true).catch(() => null);
        if (!isSessionSuperAdmin(sessionNow)) {
          const role =
            sessionNow && sessionNow.global_role != null
              ? String(sessionNow.global_role)
              : sessionNow && sessionNow.user && sessionNow.user.global_role != null
                ? String(sessionNow.user.global_role)
                : 'UNBEKANNT';
          if (msg instanceof HTMLElement) {
            msg.textContent = `Speichern abgelehnt: aktuelle Session hat Rolle ${role} (SUPER_ADMIN erforderlich).`;
            msg.style.color = '#b91c1c';
          }
          return;
        }
        const body = collectAccessEditorPayload(ed);
        const nameInp = root.querySelector('[data-ccw-user-edit-name]');
        const emailInp = root.querySelector('[data-ccw-user-edit-email]');
        const name =
          nameInp instanceof HTMLInputElement ? String(nameInp.value || '').trim() : null;
        const email =
          emailInp instanceof HTMLInputElement ? String(emailInp.value || '').trim() : null;
        const patchPayload = { ...body, name, email };
        console.log('DEBUG PATCH /users/:id/access payload:', patchPayload);
        await apiFetch(`/users/${encodeURIComponent(uid)}/access`, {
          method: 'PATCH',
          body: patchPayload,
        });
        if (msg instanceof HTMLElement) {
          msg.textContent = 'Gespeichert.';
          msg.style.color = '#15803d';
        }
        const editDlg = root.querySelector('[data-ccw-benutzer-edit-dialog]');
        if (editDlg instanceof HTMLDialogElement) editDlg.close();
        benutzerDetailEditUserId = uid;
        await refreshBenutzerMainDom(root);
      } catch (e) {
        if (msg instanceof HTMLElement) {
          msg.textContent = formatApiErrorForUi(e);
          msg.style.color = '#b91c1c';
        }
      }
      return;
    }

    const editToggle = t.closest('[data-ccw-benutzer-edit-toggle]');
    if (editToggle) {
      ev.preventDefault();
      const selId = CCState.get('cockpitBenutzerSelectedId');
      if (!selId) return;
      await selectUserAndMaybeOpenModal(selId, { openEditModal: true });
      return;
    }

    const rowEditBtn = t.closest('[data-ccw-user-row-edit]');
    if (rowEditBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const uid = rowEditBtn.getAttribute('data-ccw-user-row-edit') || '';
      if (!uid) return;
      await selectUserAndMaybeOpenModal(uid, { openEditModal: true });
      return;
    }

    const rowMenuBtn = t.closest('[data-ccw-user-row-menu]');
    if (rowMenuBtn) {
      ev.preventDefault();
      ev.stopPropagation();
      const uid = rowMenuBtn.getAttribute('data-ccw-user-row-menu') || '';
      if (!uid) return;
      benutzerOpenRowMenuUserId = benutzerOpenRowMenuUserId === uid ? null : uid;
      await refreshBenutzerMainDom(root);
      return;
    }

    const rowMenuAction = t.closest('[data-ccw-user-row-action]');
    if (rowMenuAction) {
      ev.preventDefault();
      ev.stopPropagation();
      const action = rowMenuAction.getAttribute('data-ccw-user-row-action') || '';
      const uid = rowMenuAction.getAttribute('data-ccw-user-row-action-id') || '';
      benutzerOpenRowMenuUserId = null;
      try {
        if (action === 'lock-toggle') {
          const res = await apiFetch(`/users/${encodeURIComponent(uid)}/lock-toggle`, { method: 'POST' });
          const st = String(res?.status || '').toLowerCase();
          benutzerFlashMessage = st === 'deaktiviert' ? 'Benutzer wurde gesperrt.' : 'Benutzer wurde entsperrt.';
        } else if (action === 'password-reset') {
          const res = await apiFetch(`/users/${encodeURIComponent(uid)}/reset-password`, { method: 'POST' });
          const pwd = res && typeof res.temporary_password === 'string' ? res.temporary_password : '';
          const user = findUserById(uid);
          const label = user && user.email ? String(user.email) : uid;
          benutzerFlashMessage = `Temporäres Passwort für ${label}: ${pwd}`;
        }
      } catch (e) {
        benutzerFlashMessage = `Aktion fehlgeschlagen: ${formatApiErrorForUi(e)}`;
      }
      await refreshBenutzerMainDom(root, Date.now());
      return;
    }

    const modalClose = t.closest('[data-ccw-benutzer-edit-close],[data-ccw-benutzer-edit-cancel]');
    if (modalClose) {
      ev.preventDefault();
      const dlg = root.querySelector('[data-ccw-benutzer-edit-dialog]');
      if (dlg instanceof HTMLDialogElement) dlg.close();
      return;
    }

    const modalSave = t.closest('[data-ccw-benutzer-modal-save]');
    if (modalSave) {
      ev.preventDefault();
      const dlg = root.querySelector('[data-ccw-benutzer-edit-dialog]');
      const saveBtn = dlg instanceof HTMLElement ? dlg.querySelector('[data-ccw-access-save]') : null;
      if (saveBtn instanceof HTMLElement) saveBtn.click();
      return;
    }

    if (t.closest('[data-ccw-firma-nav-id]')) return;
    if (t.closest('[data-ccw-rolle-nav-id]')) return;

    const resetBtn = t.closest('[data-ccw-benutzer-filter-reset]');
    if (resetBtn) {
      ev.preventDefault();
      CCState.set('cockpitUserListFilter', {
        status: null,
        access: null,
        projektId: null,
        firmaId: null,
      });
      CCState.set('cockpitBenutzerSelectedId', null);
      await refreshBenutzerMainDom(root);
      return;
    }

    const chip = t.closest('[data-ccw-benutzer-chip-status]');
    if (chip) {
      ev.preventDefault();
      const v = chip.getAttribute('data-ccw-benutzer-chip-status');
      const f = CCState.get('cockpitUserListFilter') || {};
      CCState.set('cockpitUserListFilter', {
        status: v == null || v === '' ? null : v,
        access: f.access,
        projektId: f.projektId,
        firmaId: f.firmaId,
      });
      CCState.set('cockpitBenutzerSelectedId', null);
      await refreshBenutzerMainDom(root);
      return;
    }

    const back = t.closest('[data-ccw-benutzer-back]');
    if (back) {
      ev.preventDefault();
      CCState.set('cockpitBenutzerSelectedId', null);
      benutzerDetailEditUserId = null;
      await refreshBenutzerMainDom(root);
      return;
    }

    const row = t.closest('.ccds-table-row[data-user-id]');
    if (row) {
      const id = row.getAttribute('data-user-id');
      if (!id) return;
      CCState.set('cockpitBenutzerSelectedId', id);
      benutzerDetailEditUserId = null;
      await refreshBenutzerMainDom(root);
    }
  }, { signal: sig });

  mount.addEventListener('change', async ev => {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement) || !root.contains(el)) return;
    if (!el.hasAttribute('data-ccw-mod-toggle')) return;
    if (el.closest('[data-ccw-benutzer-edit-dialog]')) {
      ev.stopPropagation();
      return;
    }
    const mod = el.getAttribute('data-ccw-mod-toggle');
    if (!mod) return;
    const blk = root.querySelector(`[data-ccw-mod-block="${mod}"]`);
    if (blk instanceof HTMLElement) blk.style.opacity = el.checked ? '1' : '0.45';
    const ed = el.closest('.ckp-access-editor');
    if (!(ed instanceof HTMLElement)) return;
    const uid = ed.getAttribute('data-ccw-access-editor');
    if (!uid || uid === '__new__') return;
    const msg = ed.querySelector('[data-ccw-access-save-msg]');
    try {
      const body = collectAccessEditorPayload(ed);
      await apiFetch(`/users/${encodeURIComponent(uid)}/access`, { method: 'PATCH', body });
      if (msg instanceof HTMLElement) {
        msg.textContent = 'Gespeichert.';
        msg.style.color = '#15803d';
      }
      benutzerDetailEditUserId = uid;
      await refreshBenutzerMainDom(root);
    } catch (e) {
      if (msg instanceof HTMLElement) {
        msg.textContent = formatApiErrorForUi(e);
        msg.style.color = '#b91c1c';
      }
    }
  }, { signal: sig });
}
