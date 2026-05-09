/**
 * FUSA / CC Intern — Benutzer nur lesend (Daten von GET /api/v1/users).
 */

import { apiFetch, formatApiErrorForUi } from '../../../core/auth/cc-auth-session.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ title: string, moduleKey: 'fusa'|'ccintern', hint?: string }} opts
 * @returns {Promise<string>}
 */
export async function renderModuleUsersReadonlyHtml(opts) {
  const title = opts.title || 'Benutzer';
  const moduleKey = opts.moduleKey;
  let err = '';
  /** @type {object[]} */
  let users = [];
  try {
    const r = await apiFetch('/api/v1/users');
    users = Array.isArray(r?.data?.users) ? r.data.users : [];
  } catch (e) {
    err = formatApiErrorForUi(e);
  }
  const filtered = users.filter(u => {
    if (!u || typeof u !== 'object') return false;
    const mods = Array.isArray(u.modules) ? u.modules : [];
    return mods.includes(moduleKey) || u.global_role === 'SUPER_ADMIN';
  });
  const rows =
    filtered.length === 0
      ? `<tr><td colspan="4" class="ckp-snapshot-ro-empty-cell">Keine Benutzer mit Zugriff auf dieses Modul.</td></tr>`
      : filtered
          .map(u => {
            const mods = Array.isArray(u.modules) ? u.modules.join(', ') : '—';
            return `<tr>
  <td class="ckp-snapshot-ro-td">${esc(u.email ?? '—')}</td>
  <td class="ckp-snapshot-ro-td">${esc(u.name ?? '—')}</td>
  <td class="ckp-snapshot-ro-td">${esc(u.global_role ?? '—')}</td>
  <td class="ckp-snapshot-ro-td">${esc(mods)}</td>
</tr>`;
          })
          .join('');
  const hint =
    opts.hint ||
    'Nur Anzeige. Verwaltung und Rechtezuweisung erfolgen ausschließlich im Cockpit.';
  return `<div data-ccw-ro="module-users-ro" class="ckp-snapshot-ro-section">
  <h2 class="ckp-snapshot-ro-section-title">${esc(title)}</h2>
  <p class="ckp-mock-note">${esc(hint)}</p>
  <p class="ckp-mock-note" style="font-size:11px;">Quelle: <code>GET /api/v1/users</code> · Modulfilter: <code>${esc(moduleKey)}</code></p>
  ${err ? `<p class="ckp-api-error" role="alert">${esc(err)}</p>` : ''}
  <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
    <table class="ckp-table ckp-snapshot-ro-table">
      <thead>
        <tr class="ckp-snapshot-ro-head-row">
          <th class="ckp-snapshot-ro-th">E-Mail</th>
          <th class="ckp-snapshot-ro-th">Name</th>
          <th class="ckp-snapshot-ro-th">Globale Rolle</th>
          <th class="ckp-snapshot-ro-th">Module</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}
