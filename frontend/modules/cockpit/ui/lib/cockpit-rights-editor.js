/**
 * Cockpit — Rechte-Matrix (Anzeige + Formular für PATCH /users/:id/access).
 * Bereichs-Slugs in Sync mit backend/src/auth/rights-spec.js (COCKPIT/FUSA/CCINTERN).
 */

const COCKPIT_BEREICHE = [
  'dashboard',
  'benutzer',
  'einladungen',
  'rollen',
  'firmen',
  'module',
  'geraete',
  'logs',
  'kalender',
];

const FUSA_BEREICHE = [
  'dashboard',
  'auftraege',
  'fahrzeuge',
  'schaeden',
  'kunden',
  'angebote',
  'dokumente',
  'kalender',
  'rechnungen',
  'quartalsabrechnung',
  'preisverwaltung',
  'montage_kalender',
  'benutzer_ro',
  'rollen_ro',
  'mobile',
];

const CCINTERN_BEREICHE = [
  'dashboard',
  'schnell_anfragen',
  'angebote',
  'auftraege',
  'kunden',
  'crm',
  'messeflow',
  'produktion',
  'materiallager',
  'checklisten',
  'kalender',
  'mitarbeiter',
  'urlaub',
  'mitarbeiterapp',
  'rechnungen',
  'benutzer_ro',
  'rollen_ro',
];

export const RIGHT_FLAG_KEYS = [
  'sehen',
  'erstellen',
  'bearbeiten',
  'loeschen',
  'upload',
  'freigeben',
  'preiseSehen',
  'margeSehen',
  'rechnungSehen',
  'reporting',
  'export',
  'fahrzeugMobilSehen',
  'schadenAnlegen',
  'fotoUpload',
];

const MODULE_KEYS = /** @type {const} */ (['cockpit', 'fusa', 'ccintern']);
const GLOBAL_ROLES = /** @type {const} */ (['SUPER_ADMIN', 'INTERN', 'EXTERN', 'MITARBEITER']);

/** @param {string} mod */
function bereicheFor(mod) {
  if (mod === 'cockpit') return [...COCKPIT_BEREICHE];
  if (mod === 'fusa') return [...FUSA_BEREICHE];
  return [...CCINTERN_BEREICHE];
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
 * @param {string} userId
 * @param {{ global_role?: string, modules?: string[], rights?: Record<string, Record<string, Record<string, boolean>>> }} bundle
 */
export function renderAccessEditorHtml(userId, bundle) {
  const gr =
    bundle.global_role === 'EXTERN' ||
    bundle.global_role === 'INTERN' ||
    bundle.global_role === 'MITARBEITER' ||
    bundle.global_role === 'SUPER_ADMIN'
      ? bundle.global_role
      : 'INTERN';
  const mods = Array.isArray(bundle.modules) ? bundle.modules.filter(m => MODULE_KEYS.includes(m)) : [];
  const rights = bundle.rights && typeof bundle.rights === 'object' ? bundle.rights : {};

  const grOpts = GLOBAL_ROLES.map(
    r => `<option value="${esc(r)}"${r === gr ? ' selected' : ''}>${esc(r)}</option>`,
  ).join('');

  const modChecks = MODULE_KEYS.map(
    m =>
      `<label style="display:flex;align-items:center;gap:6px;font-size:12px;margin-right:12px;">
  <input type="checkbox" name="cc_mod_${esc(m)}" value="${esc(m)}" data-ccw-mod-toggle="${esc(m)}"${mods.includes(m) ? ' checked' : ''}/>
  ${esc(m)}</label>`,
  ).join('');

  const blocks = MODULE_KEYS.map(mod => {
    const on = mods.includes(mod);
    const bereiche = bereicheFor(mod);
    const head = RIGHT_FLAG_KEYS.map(f => `<th style="font-size:10px;padding:4px;">${esc(f)}</th>`).join('');
    const rows = bereiche.map(b => {
      const cell = rights[mod]?.[b] || {};
      const tds = RIGHT_FLAG_KEYS.map(f => {
        const id = `rf_${mod}_${b}_${f}`;
        const c = cell[f] === true;
        return `<td style="text-align:center;padding:2px;"><input type="checkbox" id="${esc(id)}" data-ccw-rf="${esc(mod)}|${esc(b)}|${esc(f)}"${c ? ' checked' : ''}/></td>`;
      }).join('');
      return `<tr><td style="font-size:11px;padding:4px 6px;white-space:nowrap;">${esc(b)}</td>${tds}</tr>`;
    }).join('');
    return `<div data-ccw-mod-block="${esc(mod)}" style="margin-top:12px;${on ? '' : 'opacity:0.45;'}">
  <div style="font-weight:600;font-size:12px;margin-bottom:6px;">Modul ${esc(mod)}</div>
  <div style="overflow:auto;max-width:100%;">
    <table class="ckp-rights-matrix" style="border-collapse:collapse;font-size:11px;">
      <thead><tr><th style="text-align:left;padding:4px;">Bereich</th>${head}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
</div>`;
  }).join('');

  return `<div class="ckp-access-editor" data-ccw-access-editor="${esc(userId)}">
  <div class="ccds-dp-section-title" style="margin-top:8px;">Globale Rolle & Module</div>
  <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:8px 0;">
    <label style="font-size:12px;">Rolle <select name="global_role" data-ccw-access-global-role>${grOpts}</select></label>
  </div>
  <div style="display:flex;flex-wrap:wrap;align-items:center;margin-bottom:8px;">${modChecks}</div>
  ${blocks}
  <div style="margin-top:14px;display:flex;gap:8px;">
    <button type="button" class="ccds-btn-primary" data-ccw-access-save>Zugriff speichern</button>
    <span class="ccds-cell-muted" style="font-size:11px;" data-ccw-access-save-msg></span>
  </div>
</div>`;
}

/**
 * @param {HTMLElement} root — .ckp-access-editor
 */
export function collectAccessEditorPayload(root) {
  const grEl = root.querySelector('[data-ccw-access-global-role]');
  const gr =
    grEl instanceof HTMLSelectElement && GLOBAL_ROLES.includes(/** @type {any} */ (grEl.value))
      ? grEl.value
      : 'INTERN';
  /** @type {string[]} */
  const modules = [];
  for (const m of MODULE_KEYS) {
    const cb = root.querySelector(`[data-ccw-mod-toggle="${m}"]`);
    if (cb instanceof HTMLInputElement && cb.checked) modules.push(m);
  }
  /** @type {Record<string, Record<string, Record<string, boolean>>>} */
  const rights = {};
  const inputs = root.querySelectorAll('input[data-ccw-rf]');
  for (const inp of inputs) {
    if (!(inp instanceof HTMLInputElement)) continue;
    const raw = inp.getAttribute('data-ccw-rf');
    if (!raw) continue;
    const [mod, bereich, flag] = raw.split('|');
    if (!mod || !bereich || !flag) continue;
    if (!modules.includes(mod)) continue;
    if (!rights[mod]) rights[mod] = {};
    if (!rights[mod][bereich]) rights[mod][bereich] = {};
    rights[mod][bereich][flag] = inp.checked;
  }
  for (const mod of modules) {
    if (!rights[mod]) rights[mod] = {};
    for (const b of bereicheFor(mod)) {
      if (!rights[mod][b]) rights[mod][b] = {};
      for (const f of RIGHT_FLAG_KEYS) {
        if (!Object.prototype.hasOwnProperty.call(rights[mod][b], f)) rights[mod][b][f] = false;
      }
    }
  }
  return { global_role: gr, modules, rights };
}
