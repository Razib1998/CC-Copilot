/**
 * Cockpit Rollen (ROLE) — Liste + Detail (read-only, Vorlagen; Rechte über PROJECT_ACCESS).
 */
import { apiFetch, formatApiErrorForUi, syncCockpitAccessibleProjectsCache } from '../../../../core/auth/cc-auth-session.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import CCState from '../../../../core/state/state.js';
import { normalizeCockpitIds } from '../../../../core/api/cockpit-id-adapter.js';

/** @type {object[]} */
let rollenLastRows = [];
/** @type {object[]} */
let rollenSourceAll = [];
/** @type {object|null} */
let rollenLastRaw = null;
/** @type {AbortController|null} */
let rollenHandlersAbort = null;

/** Katalog nur wenn Snapshot keine Rollen liefert — keine zusätzlichen fiktiven Rollen. */
const FALLBACK_ROLLEN = [
  {
    id: 'super-admin',
    name: 'Super-Admin',
    description:
      'Voller Zugriff auf Stammdaten, Benutzer, Rollen und technische Einstellungen — ausschließlich für Vertrauenspersonen (Planung).',
  },
  {
    id: 'admin',
    name: 'Admin',
    description:
      'Operative Verwaltung von Projekten, Aufträgen und Benutzern im definierten Umfang, ohne Systemkern-Eingriffe (Planung).',
  },
  {
    id: 'intern',
    name: 'Intern',
    description: 'Mitarbeitende mit Zugriff auf interne Abläufe, Produktion und Disposition (Planung).',
  },
  {
    id: 'kunde',
    name: 'Kunde',
    description: 'Externe Sicht auf eigene Projekte und Freigaben, ohne interne Kosten- oder Stammdaten (Planung).',
  },
  {
    id: 'extern-partner-werkstatt',
    name: 'Partner / Werkstatt',
    description:
      'Zulieferer, Werkstatt oder Partner mit klar abgegrenzten Auftrags- und Termin-Sichten (Planung).',
  },
];

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} raw
 * @returns {object[]}
 */
function extractSnapshotRoles(raw) {
  if (!raw || typeof raw !== 'object') return [];
  for (const key of ['rollen', 'roles', 'roleDefinitions']) {
    const arr = /** @type {unknown} */ (raw)[key];
    if (Array.isArray(arr) && arr.length > 0) return arr.filter(x => x && typeof x === 'object');
  }
  return [];
}

/**
 * @param {object} rec
 * @param {number} idx
 * @returns {{ stableKey: string, name: string, description: string, raw: object }|null}
 */
function normalizeRoleRecord(rec, idx) {
  if (!rec || typeof rec !== 'object') return null;
  const norm = normalizeCockpitIds(rec);
  const id =
    rec.id != null && String(rec.id).trim() !== ''
      ? String(rec.id).trim()
      : rec.rollenId != null && String(rec.rollenId).trim() !== ''
        ? String(rec.rollenId).trim()
      : norm.rollenId != null && String(norm.rollenId).trim() !== ''
        ? String(norm.rollenId).trim()
        : '';
  const name =
    rec.name != null && String(rec.name).trim() !== ''
      ? String(rec.name).trim()
      : rec.label != null && String(rec.label).trim() !== ''
        ? String(rec.label).trim()
        : rec.title != null && String(rec.title).trim() !== ''
          ? String(rec.title).trim()
          : id;
  if (!name && !id) return null;
  const stableKey = id || (name ? `name:${name.toLowerCase()}` : `idx:${idx}`);
  const description =
    rec.description != null && String(rec.description).trim() !== ''
      ? String(rec.description).trim()
      : rec.beschreibung != null && String(rec.beschreibung).trim() !== ''
        ? String(rec.beschreibung).trim()
        : '—';
  return { stableKey, name: name || id || '—', description, raw: rec };
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @returns {object[]}
 */
function buildAllRoles(raw) {
  const snap = extractSnapshotRoles(raw || {});
  if (snap.length > 0) {
    const out = [];
    for (let i = 0; i < snap.length; i++) {
      const n = normalizeRoleRecord(/** @type {object} */ (snap[i]), i);
      if (n) out.push(n);
    }
    return out;
  }
  return FALLBACK_ROLLEN.map((r, i) => ({
    stableKey: r.id,
    name: r.name,
    description: r.description,
    raw: r,
  }));
}

/**
 * @param {object} r normalized
 * @returns {string}
 */
export function stableRolleId(r) {
  if (r && r.stableKey != null && String(r.stableKey).trim() !== '') return String(r.stableKey).trim();
  return '';
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {{ rollenId?: string|null, roleName?: string|null }} ref
 * @returns {string|null}
 */
export function findRolleNavIdForRef(raw, ref) {
  const list = buildAllRoles(raw || {});
  const rid = ref.rollenId != null ? String(ref.rollenId).trim() : '';
  if (rid) {
    const hit = list.find(
      r =>
        stableRolleId(r) === rid ||
        (r.raw &&
          typeof r.raw === 'object' &&
          r.raw.id != null &&
          String(r.raw.id).trim() === rid) ||
        (r.raw &&
          typeof r.raw === 'object' &&
          normalizeCockpitIds(r.raw).rollenId != null &&
          String(normalizeCockpitIds(r.raw).rollenId).trim() === rid),
    );
    if (hit) return stableRolleId(hit);
  }
  const nm = ref.roleName != null ? String(ref.roleName).trim().toLowerCase() : '';
  if (nm) {
    const hit = list.find(r => r.name.toLowerCase() === nm);
    if (hit) return stableRolleId(hit);
    const slugHit = list.find(r => stableRolleId(r).toLowerCase().replace(/_/g, '-') === nm.replace(/_/g, '-'));
    if (slugHit) return stableRolleId(slugHit);
  }
  return null;
}

/**
 * @param {object} u
 * @returns {string}
 */
export function userRoleDisplayLine(u) {
  if (!u || typeof u !== 'object') return '';
  if (u.rolle != null && String(u.rolle).trim() !== '') return String(u.rolle).trim();
  if (u.role != null && String(u.role).trim() !== '') return String(u.role).trim();
  if (u.basisrolle != null && String(u.basisrolle).trim() !== '') return String(u.basisrolle).trim();
  if (u.rollenName != null && String(u.rollenName).trim() !== '') return String(u.rollenName).trim();
  if (u.rolleId != null && String(u.rolleId).trim() !== '') return String(u.rolleId).trim();
  if (u.rollenId != null && String(u.rollenId).trim() !== '') return String(u.rollenId).trim();
  if (u.rollenId != null && String(u.rollenId).trim() !== '') return String(u.rollenId).trim();
  if (Array.isArray(u.roles) && u.roles.length > 0) {
    const x = u.roles[0];
    if (typeof x === 'string' || typeof x === 'number') return String(x).trim();
    if (x && typeof x === 'object' && x.name != null) return String(x.name).trim();
    if (x && typeof x === 'object' && x.id != null) return String(x.id).trim();
  }
  return '';
}

/**
 * @param {object} u
 * @returns {string}
 */
export function userRoleIdHint(u) {
  if (!u || typeof u !== 'object') return '';
  if (u.rollenId != null && String(u.rollenId).trim() !== '') return String(u.rollenId).trim();
  if (u.rolleId != null && String(u.rolleId).trim() !== '') return String(u.rolleId).trim();
  if (u.rollenId != null && String(u.rollenId).trim() !== '') return String(u.rollenId).trim();
  if (Array.isArray(u.roles) && u.roles.length > 0) {
    const x = u.roles[0];
    if (x && typeof x === 'object' && x.id != null) return String(x.id).trim();
  }
  return '';
}

/**
 * @param {object} inv
 * @returns {string}
 */
export function invitationRoleDisplayLine(inv) {
  if (!inv || typeof inv !== 'object') return '';
  if (inv.rolle != null && String(inv.rolle).trim() !== '') return String(inv.rolle).trim();
  if (inv.role != null && String(inv.role).trim() !== '') return String(inv.role).trim();
  if (inv.roleName != null && String(inv.roleName).trim() !== '') return String(inv.roleName).trim();
  if (inv.intendedRole != null && String(inv.intendedRole).trim() !== '') return String(inv.intendedRole).trim();
  if (inv.rollenId != null && String(inv.rollenId).trim() !== '') return String(inv.rollenId).trim();
  if (inv.rollenId != null && String(inv.rollenId).trim() !== '') return String(inv.rollenId).trim();
  return '';
}

/**
 * @param {object} inv
 * @returns {string}
 */
export function invitationRoleIdHint(inv) {
  if (!inv || typeof inv !== 'object') return '';
  if (inv.rollenId != null && String(inv.rollenId).trim() !== '') return String(inv.rollenId).trim();
  if (inv.rollenId != null && String(inv.rollenId).trim() !== '') return String(inv.rollenId).trim();
  return '';
}

const PROJECT_ACCESS_HINT =
  'Projektzugriffe sind read-only aus <code>GET /projects/{id}/access</code> (nur sichtbar, wenn Sie Projekt-Admin sind).';

/**
 * @returns {Promise<object[]>}
 */
async function loadApiProjectAccessMatrix() {
  const rows = [];
  try {
    const { projects } = await apiFetch('/projects');
    const projList = Array.isArray(projects) ? projects : [];
    syncCockpitAccessibleProjectsCache(projList);
    for (const p of projList) {
      if (!p?.id) continue;
      const pname = p.name != null ? String(p.name) : String(p.id);
      try {
        const r = await apiFetch(`/projects/${encodeURIComponent(String(p.id))}/access`);
        const list = Array.isArray(r.access) ? r.access : [];
        for (const a of list) {
          if (!a || typeof a !== 'object' || !a.id) continue;
          const email = a.user_email != null ? String(a.user_email) : '—';
          const role = a.role != null ? String(a.role) : '—';
          const flagsLine = [
            Number(a.can_view_prices) === 1 ? 'Preise' : null,
            Number(a.can_edit) === 1 ? 'Bearbeiten' : null,
            Number(a.can_create_auftraege) === 1 ? 'Aufträge anlegen' : null,
          ]
            .filter(Boolean)
            .join(', ');
          rows.push({
            stableKey: String(a.id),
            name: `${pname} — ${email}`,
            description: `${role} · ${flagsLine || '—'}`,
            projectName: pname,
            projektId: String(p.id),
            userEmail: email,
            role,
            flagsLine: flagsLine || '—',
            accessRow: a,
          });
        }
      } catch {
        /* kein Zugriff */
      }
    }
  } catch {
    /* */
  }
  return rows;
}

/**
 * @param {object} r
 * @returns {string}
 */
function renderRolleDetailHtml(r) {
  const ar = r && r.accessRow && typeof r.accessRow === 'object' ? r.accessRow : null;
  if (!ar) {
    return `<div class="ckp-rollen-detail__inner"><p class="ckp-rollen-detail__p">Keine Detaildaten.</p></div>`;
  }
  const cv = Number(ar.can_view_prices) === 1 ? 'ja' : 'nein';
  const ce = Number(ar.can_edit) === 1 ? 'ja' : 'nein';
  const cc = Number(ar.can_create_auftraege) === 1 ? 'ja' : 'nein';
  return `<div class="ckp-rollen-detail__inner">
  <button type="button" class="ckp-rollen-back" data-ccw-rollen-back>Zurück zur Liste</button>
  <h3 class="ckp-rollen-detail__title">Projektzugriff</h3>
  <dl class="ckp-rollen-detail__dl">
    <div><dt>Projekt</dt><dd>${esc(r.projectName || '—')}</dd></div>
    <div><dt>Benutzer</dt><dd>${esc(r.userEmail || '—')}</dd></div>
    <div><dt>Rolle</dt><dd>${esc(r.role || '—')}</dd></div>
    <div><dt>Preise sehen</dt><dd>${esc(cv)}</dd></div>
    <div><dt>Bearbeiten</dt><dd>${esc(ce)}</dd></div>
    <div><dt>Aufträge anlegen</dt><dd>${esc(cc)}</dd></div>
  </dl>
  <div class="ckp-rollen-detail__hint" role="note">
    <p class="ckp-rollen-detail__hint-title">Hinweis</p>
    <p class="ckp-rollen-detail__hint-body">${esc(PROJECT_ACCESS_HINT)}</p>
  </div>
</div>`;
}

/**
 * @param {object[]} rows
 * @returns {string}
 */
function renderRollenTableHtml(rows) {
  if (rows.length === 0) {
    return `<p class="ckp-rollen-empty">Keine Zugriffszeilen (API oder keine Admin-Projekte).</p>`;
  }
  const body = rows
    .map(r => {
      const id = stableRolleId(r);
      return `<tr class="ckp-rollen-row" tabindex="0" role="button" data-rolle-id="${esc(id)}" data-ccw-row-id="${esc(id)}" aria-label="Zugriff ${esc(r.userEmail || '')}">
  <td>${esc(r.projectName || '—')}</td>
  <td>${esc(r.userEmail || '—')}</td>
  <td>${esc(r.role || '—')}</td>
  <td>${esc(r.flagsLine || '—')}</td>
</tr>`;
    })
    .join('');
  return `<div class="ckp-table-wrap">
  <table class="ckp-table ckp-rollen-table">
    <thead>
      <tr>
        <th scope="col">Projekt</th>
        <th scope="col">Benutzer</th>
        <th scope="col">Rolle</th>
        <th scope="col">Rechte</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

function phase2Notice() {
  return `<div class="ckp-phase2-notice" role="status">
  <span class="ckp-phase2-notice__badge">API</span>
  <div class="ckp-phase2-notice__body">
    <p>Projektzugriffe aus <code>GET /projects/{id}/access</code> (aggregiert über Ihre Projekte).</p>
    <p style="margin-top:8px;">Rollen-Vorlagen: <code>GET/POST/DELETE /api/v1/role-templates</code> (Cockpit-Recht „Rollen“).</p>
  </div>
</div>`;
}

/**
 * @returns {Promise<string>}
 */
async function buildRoleTemplatesSectionHtml() {
  let tplErr = '';
  /** @type {object[]} */
  let templates = [];
  try {
    const tr = await apiFetch('/api/v1/role-templates');
    templates = Array.isArray(tr?.data?.templates) ? tr.data.templates : [];
  } catch (e) {
    tplErr = formatApiErrorForUi(e);
  }
  let my = null;
  try {
    my = await loadMyRights(true);
  } catch {
    my = null;
  }
  const canWrite =
    my &&
    (my.global_role === 'SUPER_ADMIN' || myRight(my, 'cockpit', 'rollen', 'bearbeiten'));
  const rows =
    templates.length === 0
      ? `<tr><td colspan="4" class="ckp-snapshot-ro-empty-cell">Keine Vorlagen.</td></tr>`
      : templates
          .map(t => {
            const mods = Array.isArray(t.modules) ? t.modules.join(', ') : '—';
            const del =
              canWrite && t.id
                ? `<button type="button" class="ckp-api-auftrag-submit" data-ccw-rt-del="${esc(String(t.id))}">Löschen</button>`
                : '—';
            return `<tr>
  <td>${esc(t.name || '—')}</td>
  <td>${esc(t.description || '—')}</td>
  <td>${esc(mods)}</td>
  <td>${del}</td>
</tr>`;
          })
          .join('');
  const form = canWrite
    ? `<form data-ccw-rt-create style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;margin-bottom:12px;">
  <label style="display:flex;flex-direction:column;font-size:12px;">Name
    <input name="name" required style="padding:6px 10px;min-width:200px;border:1px solid #cbd5e1;border-radius:6px;" />
  </label>
  <button type="submit" class="ckp-api-auftrag-submit">Vorlage aus meinen Rechten anlegen</button>
</form>`
    : `<p class="ckp-mock-note">Keine Bearbeitungsrechte für Rollen-Vorlagen (<code>cockpit.rollen.bearbeiten</code>).</p>`;

  let assignBlock = '';
  if (my && my.global_role === 'SUPER_ADMIN' && templates.length > 0) {
    let usersOpts = '';
    try {
      const ur = await apiFetch('/api/v1/users');
      const users = Array.isArray(ur?.data?.users) ? ur.data.users : [];
      usersOpts = users
        .map(u => {
          if (!u || !u.id) return '';
          const lab = u.email != null ? String(u.email) : String(u.id);
          return `<option value="${esc(String(u.id))}">${esc(lab)}</option>`;
        })
        .filter(Boolean)
        .join('');
    } catch {
      usersOpts = '';
    }
    const tplOpts = templates
      .map(t => {
        if (!t || !t.id) return '';
        return `<option value="${esc(String(t.id))}">${esc(t.name || t.id)}</option>`;
      })
      .filter(Boolean)
      .join('');
    if (usersOpts && tplOpts) {
      assignBlock = `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #e2e8f0;">
  <div style="font-weight:600;font-size:13px;margin-bottom:8px;">Vorlage einem Benutzer zuweisen (SUPER_ADMIN)</div>
  <div style="display:flex;flex-wrap:wrap;gap:8px;align-items:flex-end;">
    <label style="display:flex;flex-direction:column;font-size:12px;">Benutzer
      <select data-ccw-rt-assign-user style="min-width:220px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;">${usersOpts}</select>
    </label>
    <label style="display:flex;flex-direction:column;font-size:12px;">Vorlage
      <select data-ccw-rt-assign-template style="min-width:200px;padding:6px;border:1px solid #cbd5e1;border-radius:6px;">${tplOpts}</select>
    </label>
    <button type="button" class="ckp-api-auftrag-submit" data-ccw-rt-assign>Zuweisen</button>
  </div>
</div>`;
    }
  }

  return `<div id="ckp-rollen-templates" style="margin-bottom:20px;padding:14px;border:1px solid #e2e8f0;border-radius:10px;background:#fafafa;">
  <h3 style="margin:0 0 10px;font-size:15px;">Rollen-Vorlagen</h3>
  ${tplErr ? `<p class="ckp-api-error" role="alert">${esc(tplErr)}</p>` : ''}
  ${form}
  ${assignBlock}
  <div class="ckp-table-wrap">
    <table class="ckp-table">
      <thead><tr><th>Name</th><th>Beschreibung</th><th>Module</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitRollenViewHtml() {
  let loadErr = '';
  /** @type {object[]} */
  let list = [];
  try {
    list = await loadApiProjectAccessMatrix();
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  rollenLastRaw = null;
  rollenSourceAll = list;
  rollenLastRows = list;

  const tplSection = await buildRoleTemplatesSectionHtml();
  const mainInner = `${tplSection}${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}${renderRollenTableHtml(rollenLastRows)}`;

  const selId = CCState.get('cockpitRolleSelectedId');
  let selected = null;
  if (selId) {
    for (const r of rollenSourceAll) {
      if (stableRolleId(r) === selId) {
        selected = r;
        break;
      }
    }
  }
  const detailHidden = !selected;
  const detailBody = selected ? renderRolleDetailHtml(selected) : '';

  return `<div class="ckp-rollen" data-ccw-ro="cockpit-rollen">
  ${phase2Notice()}
  <div id="ckp-rollen-main" data-ccw-rollen-main="1">
    ${mainInner}
  </div>
  <div id="ckp-rollen-detail" class="ckp-rollen-detail${detailHidden ? ' ckp-rollen-detail--hidden' : ''}" role="region" aria-label="Rollendetails">${detailBody}</div>
</div>`;
}

/**
 * @param {HTMLElement} root
 */
async function refreshRollenMainDom(root) {
  const main = root.querySelector('[data-ccw-rollen-main="1"]');
  const detailEl = root.querySelector('#ckp-rollen-detail');
  if (!main) return;

  let loadErr = '';
  /** @type {object[]} */
  let list = [];
  try {
    list = await loadApiProjectAccessMatrix();
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  rollenLastRaw = null;
  rollenSourceAll = list;
  rollenLastRows = list;

  const tplSection = await buildRoleTemplatesSectionHtml();
  main.innerHTML = `${tplSection}${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}${renderRollenTableHtml(rollenLastRows)}`;

  if (detailEl) {
    const selId = CCState.get('cockpitRolleSelectedId');
    let selected = null;
    if (selId) {
      for (const r of rollenSourceAll) {
        if (stableRolleId(r) === selId) {
          selected = r;
          break;
        }
      }
    }
    if (selected) {
      detailEl.innerHTML = renderRolleDetailHtml(selected);
      detailEl.classList.remove('ckp-rollen-detail--hidden');
    } else {
      detailEl.innerHTML = '';
      detailEl.classList.add('ckp-rollen-detail--hidden');
    }
  }
}

/**
 * @param {ParentNode|null|undefined} mount
 */
export function attachCockpitRollenHandlers(mount) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="cockpit-rollen"]');
  if (!root || !(root instanceof HTMLElement)) return;
  if (rollenHandlersAbort) rollenHandlersAbort.abort();
  rollenHandlersAbort = new AbortController();
  const sig = rollenHandlersAbort.signal;

  mount.addEventListener('click', async ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!root.contains(t)) return;

    const assignBtn = t.closest('[data-ccw-rt-assign]');
    if (assignBtn) {
      ev.preventDefault();
      const selU = root.querySelector('[data-ccw-rt-assign-user]');
      const selT = root.querySelector('[data-ccw-rt-assign-template]');
      const uid = selU instanceof HTMLSelectElement ? String(selU.value || '').trim() : '';
      const tid = selT instanceof HTMLSelectElement ? String(selT.value || '').trim() : '';
      if (!uid || !tid) return;
      try {
        await apiFetch(`/api/v1/users/${encodeURIComponent(uid)}/apply-role-template`, {
          method: 'POST',
          body: { template_id: tid },
        });
      } catch {
        /* ignore */
      }
      return;
    }

    const delBtn = t.closest('[data-ccw-rt-del]');
    if (delBtn) {
      ev.preventDefault();
      const id = delBtn.getAttribute('data-ccw-rt-del');
      if (!id) return;
      try {
        await apiFetch(`/api/v1/role-templates/${encodeURIComponent(id)}`, { method: 'DELETE' });
        await refreshRollenMainDom(root);
      } catch {
        /* UI: still refresh */
        await refreshRollenMainDom(root);
      }
      return;
    }

    if (t.closest('[data-ccw-rollen-back]')) {
      ev.preventDefault();
      CCState.set('cockpitRolleSelectedId', null);
      const detailEl = root.querySelector('#ckp-rollen-detail');
      if (detailEl) {
        detailEl.innerHTML = '';
        detailEl.classList.add('ckp-rollen-detail--hidden');
      }
      return;
    }

    const row = t.closest('tr.ckp-rollen-row[data-rolle-id]');
    if (row) {
      const id = row.getAttribute('data-rolle-id');
      if (!id) return;
      CCState.set('cockpitRolleSelectedId', id);
      let r = null;
      for (const x of rollenLastRows) {
        if (stableRolleId(x) === id) {
          r = x;
          break;
        }
      }
      const detailEl = root.querySelector('#ckp-rollen-detail');
      if (detailEl && r) {
        detailEl.innerHTML = renderRolleDetailHtml(r);
        detailEl.classList.remove('ckp-rollen-detail--hidden');
      }
    }
  }, { signal: sig });

  mount.addEventListener('submit', async ev => {
    const form = ev.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-ccw-rt-create]')) return;
    if (!root.contains(form)) return;
    ev.preventDefault();
    const fd = new FormData(form);
    const name = String(fd.get('name') || '').trim();
    if (!name) return;
    try {
      const my = await loadMyRights(true);
      if (!my || !Array.isArray(my.modules)) throw new Error('Rechte nicht ladbar.');
      await apiFetch('/api/v1/role-templates', {
        method: 'POST',
        body: {
          name,
          description: '',
          modules: my.modules,
          rights: my.rights || {},
        },
      });
      form.reset();
      await refreshRollenMainDom(root);
    } catch {
      await refreshRollenMainDom(root);
    }
  }, { signal: sig });
}

/**
 * @param {string|null} rolleId
 * @param {string} label
 * @returns {string}
 */
export function renderRolleCellHtml(rolleId, label) {
  const t = label == null || label === '' ? '—' : String(label);
  if (!rolleId || t === '—') return esc(t);
  return `<button type="button" class="ccds-rolle-nav-link" data-nav-key="roles" data-ccw-rolle-nav-id="${esc(rolleId)}">${esc(t)}</button>`;
}
