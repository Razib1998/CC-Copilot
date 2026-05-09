/**
 * FUSA / CC Intern — Rollen-Vorlagen nur lesend (GET /api/v1/role-templates).
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
 * @param {{ title: string, hint?: string }} opts
 * @returns {Promise<string>}
 */
export async function renderModuleRoleTemplatesReadonlyHtml(opts) {
  const title = opts.title || 'Rollen-Vorlagen';
  let err = '';
  /** @type {object[]} */
  let templates = [];
  try {
    const r = await apiFetch('/api/v1/role-templates');
    templates = Array.isArray(r?.data?.templates) ? r.data.templates : [];
  } catch (e) {
    err = formatApiErrorForUi(e);
  }
  const rows =
    templates.length === 0
      ? `<tr><td colspan="3" class="ckp-snapshot-ro-empty-cell">Keine Vorlagen oder keine Berechtigung zum Lesen.</td></tr>`
      : templates
          .map(t => {
            const mods = Array.isArray(t.modules) ? t.modules.join(', ') : '—';
            return `<tr>
  <td class="ckp-snapshot-ro-td">${esc(t.name ?? '—')}</td>
  <td class="ckp-snapshot-ro-td">${esc(t.description || '—')}</td>
  <td class="ckp-snapshot-ro-td">${esc(mods)}</td>
</tr>`;
          })
          .join('');
  const hint =
    opts.hint ||
    'Nur Anzeige. Vorlagen werden im Cockpit unter „Rollen“ gepflegt.';
  return `<div data-ccw-ro="module-role-templates-ro" class="ckp-snapshot-ro-section">
  <h2 class="ckp-snapshot-ro-section-title">${esc(title)}</h2>
  <p class="ckp-mock-note">${esc(hint)}</p>
  <p class="ckp-mock-note" style="font-size:11px;">Quelle: <code>GET /api/v1/role-templates</code></p>
  ${err ? `<p class="ckp-api-error" role="alert">${esc(err)}</p>` : ''}
  <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
    <table class="ckp-table ckp-snapshot-ro-table">
      <thead>
        <tr class="ckp-snapshot-ro-head-row">
          <th class="ckp-snapshot-ro-th">Name</th>
          <th class="ckp-snapshot-ro-th">Beschreibung</th>
          <th class="ckp-snapshot-ro-th">Module</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
}
