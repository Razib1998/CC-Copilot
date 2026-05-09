/**
 * Cockpit Einladungen — Liste + Filter (CCState) + Detail (Phase 2, read-only, INVITATION).
 */
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { toApiIdPayload } from '../../../../core/api/cockpit-id-adapter.js';
import CCState from '../../../../core/state/state.js';

/** @type {object[]} */
let einladungenLastRows = [];
/** @type {object[]} */
let einladungenSourceAll = [];
/** @type {{ id: string, name?: string }[]} */
let einladungenLastProjects = [];
/** @type {object[]} */
let einladungenFirmen = [];
/** @type {AbortController|null} */
let einladungenHandlersAbort = null;

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
export function extractSnapshotInvitations(raw) {
  if (!raw || typeof raw !== 'object') return [];
  for (const key of ['einladungen', 'invitations', 'invitationen', 'invites']) {
    const arr = /** @type {unknown} */ (raw)[key];
    if (Array.isArray(arr) && arr.length > 0) return arr;
  }
  return [];
}

/**
 * @param {object} inv
 * @returns {'offen'|'angenommen'|'abgelaufen'|'widerrufen'}
 */
export function canonicalInvitationStatus(inv) {
  if (!inv || typeof inv !== 'object') return 'offen';
  const st = inv.status != null ? String(inv.status).trim().toLowerCase() : '';
  if (st === 'eingeloest' || st === 'eingelöst') return 'eingelöst';
  if (st === 'abgelaufen') return 'abgelaufen';
  if (st === 'widerrufen') return 'widerrufen';
  if (st === 'revoked' || st.includes('widerruf') || st.includes('revok') || st === 'cancelled' || st === 'storniert')
    return 'widerrufen';
  if (st.includes('abgelauf') || st.includes('expired') || st === 'expired') return 'abgelaufen';
  if (st.includes('angenomm') || st.includes('accept') || st === 'accepted' || st === 'complete') return 'angenommen';
  if (st === 'pending' || st.includes('offen') || st.includes('pending') || st === 'open' || st === 'sent' || st === '')
    return 'offen';
  return 'offen';
}

/**
 * @param {object} inv
 * @returns {string}
 */
function invitationEmail(inv) {
  if (!inv || typeof inv !== 'object') return '—';
  const e = inv.email ?? inv.eMail ?? inv.mail;
  return e != null && String(e).trim() !== '' ? String(e).trim() : '—';
}

/**
 * @param {object} inv
 * @returns {string}
 */
function formatIntendedAccess(inv) {
  if (!inv || typeof inv !== 'object') return '—';
  const ia = inv.intendedAccess ?? inv.intended_access ?? inv.zugangIntent;
  if (ia == null) return '—';
  if (typeof ia === 'string') return ia.trim() || '—';
  if (typeof ia === 'object') {
    try {
      const keys = Object.keys(ia).filter(k => ia[k] === true);
      if (keys.length) return keys.slice(0, 8).join(', ');
      return JSON.stringify(ia).slice(0, 120);
    } catch {
      return '—';
    }
  }
  return String(ia);
}

/**
 * @param {object} inv
 * @returns {string}
 */
function invitationCreatedAt(inv) {
  const v = inv.createdAt ?? inv.created_at ?? inv.erstelltAm ?? inv.erstellt;
  return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

/**
 * @param {object} inv
 * @returns {string}
 */
function invitationExpiresAt(inv) {
  const v = inv.expiresAt ?? inv.expires_at ?? inv.ablauf ?? inv.ablaufdatum;
  return v != null && String(v).trim() !== '' ? String(v).trim() : '';
}

function formatDeDateShort(iso) {
  if (iso == null || String(iso).trim() === '') return '—';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return esc(String(iso).slice(0, 16));
  return new Intl.DateTimeFormat('de-DE', {
    timeZone: 'Europe/Berlin',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(d);
}

/**
 * @param {object} inv
 * @param {number} indexInAll
 * @returns {string}
 */
export function stableInvitationId(inv, indexInAll) {
  if (inv && inv.id != null && String(inv.id).trim() !== '') return String(inv.id).trim();
  const em = invitationEmail(inv);
  if (em !== '—') return `email:${em}:${indexInAll}`;
  return `idx:${indexInAll}`;
}

/**
 * @param {object} inv
 * @returns {boolean}
 */
function invitationPassesFilter(inv) {
  const f = CCState.get('cockpitInvitationFilter');
  if (!f) return true;
  if (f.status && canonicalInvitationStatus(inv) !== f.status) return false;
  return true;
}

/**
 * @param {object[]} rows
 * @param {object[]} all
 * @param {object|null} raw
 * @returns {string}
 */
/**
 * @param {object} inv
 */
function cockpitModulesLine(inv) {
  if (!inv || typeof inv !== 'object') return '—';
  if (Array.isArray(inv.modules) && inv.modules.length) return inv.modules.join(', ');
  return formatIntendedAccess(inv);
}

function cockpitAreasLine(inv) {
  if (!inv || typeof inv !== 'object' || !Array.isArray(inv.areas) || inv.areas.length === 0) return '—';
  return inv.areas.join(', ');
}

function invitationFirmaLine(inv) {
  if (!inv || typeof inv !== 'object') return '—';
  const name = inv.firma_name != null ? String(inv.firma_name).trim() : '';
  const kn = inv.firma_kundennummer != null ? String(inv.firma_kundennummer).trim() : '';
  if (name && kn) return `${name} (${kn})`;
  if (name) return name;
  return '—';
}

function renderEinladungenTableHtml(rows, all, raw) {
  if (rows.length === 0) {
    return `<p class="ckp-einladungen-empty">Keine Einladungen für die aktuellen Filter.</p>`;
  }
  const body = rows
    .map(inv => {
      const oi = all.indexOf(inv);
      const id = stableInvitationId(inv, oi >= 0 ? oi : 0);
      const st = canonicalInvitationStatus(inv);
      const gr = inv.global_role != null ? String(inv.global_role) : '—';
      const link = inv.invite_url != null ? String(inv.invite_url) : '—';
      return `<tr class="ckp-einladungen-row" tabindex="0" role="button" data-invitation-id="${esc(id)}" aria-label="Einladung ${esc(invitationEmail(inv))}">
  <td>${esc(invitationEmail(inv))}</td>
  <td>${esc(invitationFirmaLine(inv))}</td>
  <td>${esc(gr)}</td>
  <td>${esc(cockpitModulesLine(inv))}</td>
  <td>${esc(cockpitAreasLine(inv))}</td>
  <td>${esc(st)}</td>
  <td>${esc(formatDeDateShort(invitationCreatedAt(inv)))}</td>
  <td>${esc(formatDeDateShort(invitationExpiresAt(inv)))}</td>
  <td><code>${esc(link)}</code></td>
</tr>`;
    })
    .join('');
  return `<div class="ckp-table-wrap">
  <table class="ckp-table ckp-einladungen-table">
    <thead>
      <tr>
        <th scope="col">E-Mail</th>
        <th scope="col">Firma</th>
        <th scope="col">Globale Rolle</th>
        <th scope="col">Module</th>
        <th scope="col">Bereiche</th>
        <th scope="col">Status</th>
        <th scope="col">Erstellt</th>
        <th scope="col">Ablauf</th>
        <th scope="col">Einladungslink</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

function renderFilterBarHtml() {
  const f = CCState.get('cockpitInvitationFilter') || {};
  const parts = [];
  if (f.status) parts.push(`status = ${f.status}`);
  const summary = parts.length ? parts.join(' · ') : 'alle anzeigen';
  return `<div class="ckp-einladungen-filterbar">
  <span class="ckp-einladungen-filterbar__label">Filter:</span>
  <span class="ckp-einladungen-filterbar__summary">${esc(summary)}</span>
  <button type="button" class="ckp-einladungen-filter-reset" data-ccw-einladungen-filter-reset>Zurücksetzen</button>
</div>`;
}

/**
 * @param {object} inv
 * @returns {string}
 */
function renderStatusverlaufHtml(inv) {
  const hist = inv.statusHistory ?? inv.statusVerlauf ?? inv.verlauf;
  if (!Array.isArray(hist) || hist.length === 0) return '';
  const items = hist
    .slice(0, 12)
    .map(h => {
      if (h == null) return '';
      if (typeof h === 'string') return `<li>${esc(h)}</li>`;
      if (typeof h === 'object') {
        const t = h.at ?? h.time ?? h.zeit ?? '';
        const s = h.status ?? h.state ?? '';
        return `<li>${esc(String(t))} — ${esc(String(s))}</li>`;
      }
      return '';
    })
    .filter(Boolean)
    .join('');
  if (!items) return '';
  return `<h4 class="ckp-einladungen-detail__h">Statusverlauf</h4><ul class="ckp-einladungen-detail__ul">${items}</ul>`;
}

/**
 * @param {object} inv
 * @param {object|null} raw
 * @returns {string}
 */
function renderInvitationDetailHtml(inv, raw) {
  const gr = inv.global_role != null ? String(inv.global_role) : '—';
  const modLine = cockpitModulesLine(inv);
  const areaLine = cockpitAreasLine(inv);
  const firmaLine = invitationFirmaLine(inv);
  const inviteUrl = inv.invite_url != null ? String(inv.invite_url) : '';
  const whatsappHref = inviteUrl
    ? `https://wa.me/?text=${encodeURIComponent(`Dein Einladungslink: ${inviteUrl}`)}`
    : '';
  return `<div class="ckp-einladungen-detail__inner">
  <button type="button" class="ckp-einladungen-back" data-ccw-einladungen-back>Zurück zur Liste</button>
  <h3 class="ckp-einladungen-detail__title">Einladung (Cockpit)</h3>
  <dl class="ckp-einladungen-detail__dl">
    <div><dt>E-Mail</dt><dd>${esc(invitationEmail(inv))}</dd></div>
    <div><dt>Firma</dt><dd>${esc(firmaLine)}</dd></div>
    <div><dt>Globale Rolle</dt><dd>${esc(gr)}</dd></div>
    <div><dt>Module</dt><dd>${esc(modLine)}</dd></div>
    <div><dt>Bereiche</dt><dd>${esc(areaLine)}</dd></div>
    <div><dt>Status</dt><dd>${esc(canonicalInvitationStatus(inv))}</dd></div>
    <div><dt>Erstellt</dt><dd>${esc(formatDeDateShort(invitationCreatedAt(inv)))}</dd></div>
    <div><dt>Ablauf</dt><dd>${esc(formatDeDateShort(invitationExpiresAt(inv)))}</dd></div>
  </dl>
  <p><strong>Einladungslink:</strong> <code data-ccw-cockpit-inv-link>${esc(inviteUrl || '—')}</code></p>
  <p style="display:flex;gap:8px;flex-wrap:wrap;">
    <button type="button" class="ckp-api-auftrag-submit" data-ccw-cockpit-inv-copy-link ${inviteUrl ? '' : 'disabled'}>Link kopieren</button>
    <a class="ckp-api-auftrag-submit" data-ccw-cockpit-inv-whatsapp href="${esc(whatsappHref)}" target="_blank" rel="noopener noreferrer" ${inviteUrl ? '' : 'aria-disabled="true" style="pointer-events:none;opacity:.65;"'}>Per WhatsApp senden</a>
  </p>
  <p class="ckp-api-error" data-ccw-cockpit-inv-copy-msg hidden role="status"></p>
  ${renderStatusverlaufHtml(inv)}
</div>`;
}

function phase2Notice() {
  return `<div class="ckp-phase2-notice" role="status">
  <span class="ckp-phase2-notice__badge">API</span>
  <div class="ckp-phase2-notice__body">
    <p>Systemweite Einladungen: <code>GET /api/v1/invites</code> · Neu: <code>POST /api/v1/invites</code> (E-Mail, globale Rolle, Module).</p>
  </div>
</div>`;
}

/**
 * @returns {Promise<{ all: object[], rawObj: null }>}
 */
async function loadApiEinladungenBundle() {
  try {
    const [invRes, firmenRes] = await Promise.all([
      apiFetch('/api/v1/invites'),
      apiFetch('/api/v1/firmen'),
    ]);
    const invites = Array.isArray(invRes?.invites) ? invRes.invites : [];
    const arr = invites;
    einladungenFirmen = Array.isArray(firmenRes?.firmen) ? firmenRes.firmen : [];
    einladungenLastProjects = [];
    const all = arr
      .filter(inv => inv && typeof inv === 'object')
      .map(inv => ({
        ...inv,
        kind: 'cockpit',
      }));
    return { all, rawObj: null };
  } catch {
    einladungenLastProjects = [];
    einladungenFirmen = [];
    return { all: [], rawObj: null };
  }
}

function renderFirmaOptionsHtml() {
  const options = Array.isArray(einladungenFirmen)
    ? einladungenFirmen
        .map((f) => {
          const id = f && f.id != null ? String(f.id).trim() : '';
          if (!id) return '';
          const name = f && f.name != null ? String(f.name).trim() : '';
          const kn = f && f.kundennummer != null ? String(f.kundennummer).trim() : '';
          const label = name && kn ? `${name} (${kn})` : name || kn || id;
          return `<option value="${esc(id)}">${esc(label)}</option>`;
        })
        .filter(Boolean)
        .join('')
    : '';
  return `<option value="">Keine Firma</option>${options}`;
}

function renderApiInviteFormHtml() {
  return `<button type="button" class="ckp-einladungen-api-invite-toggle" data-ccw-cockpit-inv-toggle hidden style="display:none !important;" tabindex="-1" aria-hidden="true">Neu</button>
<div class="ckp-einladungen-api-form" data-ccw-cockpit-inv-wrap hidden style="margin:12px 0;padding:12px;border:1px solid #e2e8f0;border-radius:10px;background:#fafafa;">
  <h3 class="ckp-einladungen-api-form__title" style="margin-top:0;">Neue Einladung</h3>
  <div class="ckp-einladungen-api-form__row" style="margin-bottom:10px;">
    <label for="ckp-cockpit-inv-mail">E-Mail</label>
    <input id="ckp-cockpit-inv-mail" type="email" data-ccw-cockpit-inv-email required autocomplete="email" style="width:100%;max-width:360px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;" />
  </div>
  <div class="ckp-einladungen-api-form__row" style="margin-bottom:10px;">
    <label for="ckp-cockpit-inv-role">Globale Rolle</label>
    <select id="ckp-cockpit-inv-role" data-ccw-cockpit-inv-role style="padding:8px;border:1px solid #e2e8f0;border-radius:8px;">
      <option value="INTERN" selected>INTERN</option>
      <option value="EXTERN">EXTERN</option>
      <option value="SUPER_ADMIN">SUPER_ADMIN</option>
    </select>
  </div>
  <div class="ckp-einladungen-api-form__row" style="margin-bottom:10px;">
    <label for="ckp-cockpit-inv-firma">Firma (Pflicht für INTERN/EXTERN)</label>
    <select id="ckp-cockpit-inv-firma" data-ccw-cockpit-inv-firma style="min-width:280px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;">
      ${renderFirmaOptionsHtml()}
    </select>
  </div>
  <fieldset style="border:none;margin:0;padding:0;margin-bottom:10px;">
    <legend style="font-size:13px;margin-bottom:6px;">Module</legend>
    <label style="margin-right:12px;font-size:13px;"><input type="checkbox" data-ccw-cockpit-inv-mod value="cockpit" checked /> cockpit</label>
    <label style="margin-right:12px;font-size:13px;"><input type="checkbox" data-ccw-cockpit-inv-mod value="fusa" /> fusa</label>
    <label style="font-size:13px;"><input type="checkbox" data-ccw-cockpit-inv-mod value="ccintern" /> ccintern</label>
  </fieldset>
  <div class="ckp-einladungen-api-form__row" style="margin-bottom:10px;">
    <label for="ckp-cockpit-inv-areas">Bereiche (Komma-getrennt, optional)</label>
    <input id="ckp-cockpit-inv-areas" type="text" data-ccw-cockpit-inv-areas placeholder="z. B. benutzer, einladungen" style="width:100%;max-width:560px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;" />
  </div>
  <div class="ckp-einladungen-api-form__row" style="margin-bottom:10px;">
    <label for="ckp-cockpit-inv-rights">Rechte JSON (optional)</label>
    <textarea id="ckp-cockpit-inv-rights" data-ccw-cockpit-inv-rights rows="4" style="width:100%;max-width:720px;padding:8px;border:1px solid #e2e8f0;border-radius:8px;" placeholder='{"cockpit":{"einladungen":{"sehen":true,"erstellen":true}}}'></textarea>
  </div>
  <button type="button" class="ckp-einladungen-api-invite-submit" data-ccw-cockpit-inv-submit>Einladung erstellen</button>
  <p class="ckp-api-error" data-ccw-cockpit-inv-msg hidden role="alert"></p>
</div>`;
}

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitEinladungenViewHtml() {
  const { all, rawObj } = await loadApiEinladungenBundle();
  einladungenSourceAll = all;
  einladungenLastRows = all.filter(invitationPassesFilter);

  const mainInner =
    all.length === 0
      ? `<p class="ckp-einladungen-empty">Keine Einladungen. Über „Neu“ eine Einladung mit <code>POST /api/v1/invites</code> anlegen.</p>`
      : `${renderFilterBarHtml()}${renderEinladungenTableHtml(einladungenLastRows, all, rawObj)}`;

  const selId = CCState.get('cockpitInvitationSelectedId');
  let selected = null;
  if (selId && einladungenLastRows.length) {
    for (const inv of einladungenLastRows) {
      const oi = all.indexOf(inv);
      if (stableInvitationId(inv, oi >= 0 ? oi : 0) === selId) {
        selected = inv;
        break;
      }
    }
  }
  const detailHidden = !selected;
  const detailBody = selected ? renderInvitationDetailHtml(selected, rawObj) : '';

  return `<div class="ckp-einladungen" data-ccw-ro="cockpit-einladungen">
  ${phase2Notice()}
  ${renderApiInviteFormHtml()}
  <div id="ckp-einladungen-main" data-ccw-einladungen-main="1">
    ${mainInner}
  </div>
  <div id="ckp-einladungen-detail" class="ckp-einladungen-detail${detailHidden ? ' ckp-einladungen-detail--hidden' : ''}" role="region" aria-label="Einladungsdetails">${detailBody}</div>
</div>`;
}

/**
 * @param {HTMLElement} root
 */
async function refreshEinladungenMainDom(root) {
  const main = root.querySelector('[data-ccw-einladungen-main="1"]');
  const detailEl = root.querySelector('#ckp-einladungen-detail');
  if (!main) return;

  const { all, rawObj } = await loadApiEinladungenBundle();
  einladungenSourceAll = all;
  einladungenLastRows = all.filter(invitationPassesFilter);

  const mainInner =
    all.length === 0
      ? `<p class="ckp-einladungen-empty">Keine Einladungen.</p>`
      : `${renderFilterBarHtml()}${renderEinladungenTableHtml(einladungenLastRows, all, rawObj)}`;
  main.innerHTML = mainInner;

  if (detailEl) {
    const selId = CCState.get('cockpitInvitationSelectedId');
    let selected = null;
    if (selId && einladungenLastRows.length) {
      for (const inv of einladungenLastRows) {
        const oi = all.indexOf(inv);
        if (stableInvitationId(inv, oi >= 0 ? oi : 0) === selId) {
          selected = inv;
          break;
        }
      }
    }
    if (selected) {
      detailEl.innerHTML = renderInvitationDetailHtml(selected, rawObj);
      detailEl.classList.remove('ckp-einladungen-detail--hidden');
    } else {
      detailEl.innerHTML = '';
      detailEl.classList.add('ckp-einladungen-detail--hidden');
    }
  }
}

/**
 * @param {ParentNode|null|undefined} mount
 */
export function attachCockpitEinladungenHandlers(mount) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="cockpit-einladungen"]');
  if (!root || !(root instanceof HTMLElement)) return;
  if (einladungenHandlersAbort) einladungenHandlersAbort.abort();
  einladungenHandlersAbort = new AbortController();
  const sig = einladungenHandlersAbort.signal;

  mount.addEventListener('click', async ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!root.contains(t)) return;

    if (t.closest('[data-ccw-firma-nav-id]')) return;
    if (t.closest('[data-ccw-rolle-nav-id]')) return;

    if (t.closest('[data-ccw-cockpit-inv-toggle]')) {
      ev.preventDefault();
      const wrap = root.querySelector('[data-ccw-cockpit-inv-wrap]');
      if (wrap instanceof HTMLElement) {
        wrap.hidden = !wrap.hidden;
      }
      return;
    }

    if (t.closest('[data-ccw-cockpit-inv-submit]')) {
      ev.preventDefault();
      const msg = root.querySelector('[data-ccw-cockpit-inv-msg]');
      if (msg instanceof HTMLElement) {
        msg.textContent = '';
        msg.hidden = true;
      }
      const mailEl = root.querySelector('[data-ccw-cockpit-inv-email]');
      const roleEl = root.querySelector('[data-ccw-cockpit-inv-role]');
      const areasEl = root.querySelector('[data-ccw-cockpit-inv-areas]');
      const rightsEl = root.querySelector('[data-ccw-cockpit-inv-rights]');
      const firmaEl = root.querySelector('[data-ccw-cockpit-inv-firma]');
      const email = mailEl instanceof HTMLInputElement ? String(mailEl.value || '').trim() : '';
      const global_role =
        roleEl instanceof HTMLSelectElement ? String(roleEl.value || 'INTERN').trim() : 'INTERN';
      const areas =
        areasEl instanceof HTMLInputElement
          ? String(areasEl.value || '')
              .split(',')
              .map(x => x.trim())
              .filter(Boolean)
          : [];
      const firmaId =
        firmaEl instanceof HTMLSelectElement && String(firmaEl.value || '').trim()
          ? String(firmaEl.value).trim()
          : null;
      let rights = {};
      if (rightsEl instanceof HTMLTextAreaElement && String(rightsEl.value || '').trim() !== '') {
        try {
          const parsed = JSON.parse(String(rightsEl.value || '').trim());
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('Rechte-JSON muss ein Objekt sein.');
          }
          rights = parsed;
        } catch (e) {
          if (msg instanceof HTMLElement) {
            msg.textContent = e instanceof Error ? e.message : 'Rechte-JSON ist ungültig.';
            msg.hidden = false;
          }
          return;
        }
      }
      /** @type {string[]} */
      const modules = [];
      root.querySelectorAll('[data-ccw-cockpit-inv-mod]').forEach(cb => {
        if (cb instanceof HTMLInputElement && cb.checked && cb.value) modules.push(cb.value);
      });
      if (!email) {
        if (msg instanceof HTMLElement) {
          msg.textContent = 'E-Mail ist erforderlich.';
          msg.hidden = false;
        }
        return;
      }
      if (
        (global_role === 'INTERN' || global_role === 'EXTERN') &&
        (firmaId == null || String(firmaId).trim() === '')
      ) {
        if (msg instanceof HTMLElement) {
          msg.textContent = 'Bitte Firma auswählen.';
          msg.hidden = false;
        }
        return;
      }
      if (modules.length === 0) {
        if (msg instanceof HTMLElement) {
          msg.textContent = 'Mindestens ein Modul auswählen.';
          msg.hidden = false;
        }
        return;
      }
      try {
        await apiFetch('/api/v1/invites', {
          method: 'POST',
          body: toApiIdPayload({ email, global_role, modules, areas, rights, firmaId }),
        });
        if (mailEl instanceof HTMLInputElement) mailEl.value = '';
        if (areasEl instanceof HTMLInputElement) areasEl.value = '';
        if (rightsEl instanceof HTMLTextAreaElement) rightsEl.value = '';
        if (firmaEl instanceof HTMLSelectElement) firmaEl.value = '';
        await refreshEinladungenMainDom(root);
        if (msg instanceof HTMLElement) {
          msg.textContent = 'Einladung erstellt.';
          msg.hidden = false;
        }
      } catch (e) {
        if (msg instanceof HTMLElement) {
          msg.textContent = formatApiErrorForUi(e);
          msg.hidden = false;
        }
      }
      return;
    }

    if (t.closest('[data-ccw-einladungen-filter-reset]')) {
      ev.preventDefault();
      CCState.set('cockpitInvitationFilter', {
        status: null,
        projektId: null,
        firmaId: null,
      });
      CCState.set('cockpitInvitationSelectedId', null);
      await refreshEinladungenMainDom(root);
      return;
    }

    if (t.closest('[data-ccw-einladungen-back]')) {
      ev.preventDefault();
      CCState.set('cockpitInvitationSelectedId', null);
      const detailEl = root.querySelector('#ckp-einladungen-detail');
      if (detailEl) {
        detailEl.innerHTML = '';
        detailEl.classList.add('ckp-einladungen-detail--hidden');
      }
      return;
    }

    if (t.closest('[data-ccw-cockpit-inv-copy-link]')) {
      ev.preventDefault();
      const linkEl = root.querySelector('[data-ccw-cockpit-inv-link]');
      const copyMsg = root.querySelector('[data-ccw-cockpit-inv-copy-msg]');
      const text = linkEl instanceof HTMLElement ? String(linkEl.textContent || '').trim() : '';
      if (!text || text === '—') return;
      try {
        if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        }
        if (copyMsg instanceof HTMLElement) {
          copyMsg.textContent = 'Link kopiert';
          copyMsg.hidden = false;
          window.setTimeout(() => {
            copyMsg.hidden = true;
            copyMsg.textContent = '';
          }, 2000);
        }
      } catch {
        if (copyMsg instanceof HTMLElement) {
          copyMsg.textContent = 'Kopieren fehlgeschlagen';
          copyMsg.hidden = false;
          window.setTimeout(() => {
            copyMsg.hidden = true;
            copyMsg.textContent = '';
          }, 2000);
        }
      }
      return;
    }

    const row = t.closest('tr.ckp-einladungen-row[data-invitation-id]');
    if (row) {
      const id = row.getAttribute('data-invitation-id');
      if (!id) return;
      CCState.set('cockpitInvitationSelectedId', id);
      let inv = null;
      const all = einladungenSourceAll;
      for (const x of einladungenLastRows) {
        const oi = all.indexOf(x);
        if (stableInvitationId(x, oi >= 0 ? oi : 0) === id) {
          inv = x;
          break;
        }
      }
      const detailEl = root.querySelector('#ckp-einladungen-detail');
      if (detailEl && inv) {
        detailEl.innerHTML = renderInvitationDetailHtml(inv, null);
        detailEl.classList.remove('ckp-einladungen-detail--hidden');
      }
    }
  }, { signal: sig });
}

/**
 * @param {object|null|undefined} raw
 * @returns {number}
 */
export function countOpenInvitationsInSnapshot(raw) {
  const all = extractSnapshotInvitations(raw || {});
  return all.filter(inv => canonicalInvitationStatus(inv) === 'offen').length;
}
