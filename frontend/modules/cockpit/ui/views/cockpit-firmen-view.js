/**
 * Cockpit Firmen (COMPANY) — Liste + Filter (CCState) + Dialog Neu/Bearbeiten.
 */
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import CCState from '../../../../core/state/state.js';
import {
  ensureFirmenStammLoaded,
  getFirmenStammRows,
  getFirmenStammStateSlice,
  refreshFirmenStammFromApi,
} from '../../../../core/state/firmen-stamm-store.js';
import {
  renderFirmaKundePrimaryCellHtml,
  firmaStammSearchHay,
} from '../../../shared/ui/firmen-stamm-list.js';

/** @type {object[]} */
let firmenLastRows = [];
/** @type {object[]} */
let firmenSourceAll = [];
/** @type {boolean} */
let firmenApiHasStatus = false;
/** @type {AbortController|null} */
let firmenHandlersAbort = null;

/** Freitext: Firmenname, Kundennummer, Alt-Nummer (clientseitig). */
let cockpitFirmaSucheText = '';

const TYPE_SET = new Set(['kunde', 'partner', 'lieferant', 'haendler', 'werkstatt']);

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object} rec
 * @param {'companies'|'firmen'|'kunden'} source
 * @returns {'kunde'|'partner'|'lieferant'|'haendler'|'werkstatt'|''}
 */
function canonicalCompanyTypeFromSource(rec, source) {
  const t = (rec.type ?? rec.typ ?? rec.firmenTyp ?? rec.kind ?? '')
    .toString()
    .trim()
    .toLowerCase();
  if (TYPE_SET.has(t)) return /** @type {'kunde'|'partner'|'lieferant'|'haendler'|'werkstatt'} */ (t);
  if (t.includes('liefer')) return 'lieferant';
  if (t.includes('haendl') || t.includes('händl')) return 'haendler';
  if (t.includes('partner')) return 'partner';
  if (t.includes('werkstatt')) return 'werkstatt';
  if (t.includes('kunde')) return 'kunde';
  if (source === 'kunden') return 'kunde';
  return '';
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {('companies'|'firmen'|'kunden')[]} sourceOrder
 * @returns {{ list: object[], hasStatus: boolean }}
 */
function buildFirmaListFromSources(raw, sourceOrder) {
  const byKey = new Map();
  let hasStatus = false;

  /**
   * @param {object} rec
   * @param {'companies'|'firmen'|'kunden'} source
   */
  function add(rec, source) {
    if (!rec || typeof rec !== 'object') return;
    const rid = rec.id != null && String(rec.id).trim() !== '' ? String(rec.id).trim() : '';
    const name =
      rec.name != null && String(rec.name).trim() !== ''
        ? String(rec.name).trim()
        : rec.firma != null && String(rec.firma).trim() !== ''
          ? String(rec.firma).trim()
          : rec.firmenname != null && String(rec.firmenname).trim() !== ''
            ? String(rec.firmenname).trim()
            : '';
    if (!rid && !name) return;
    const stableKey = rid || `name:${name.toLowerCase()}`;
    if (byKey.has(stableKey)) return;
    const statusRaw = rec.status != null ? String(rec.status).trim() : '';
    if (statusRaw) hasStatus = true;
    const typ = canonicalCompanyTypeFromSource(rec, source);
    const typeLabel = typ || '—';
    const kundennummer =
      rec.kundennummer != null && String(rec.kundennummer).trim() !== ''
        ? String(rec.kundennummer).trim()
        : '—';
    const altnummer =
      rec.altnummer != null && String(rec.altnummer).trim() !== ''
        ? String(rec.altnummer).trim()
        : '—';
    const internExtern =
      rec.intern_extern != null && String(rec.intern_extern).trim() !== ''
        ? String(rec.intern_extern).trim()
        : '—';
    const stadt =
      rec.stadt != null && String(rec.stadt).trim() !== '' ? String(rec.stadt).trim() : '—';
    byKey.set(stableKey, {
      stableKey,
      name: name || rid || '—',
      kundennummer,
      altnummer,
      type: typ,
      typeLabel,
      internExtern,
      stadt,
      statusRaw: statusRaw || null,
      source,
      raw: rec,
    });
  }

  const r = raw && typeof raw === 'object' ? raw : {};
  for (const source of sourceOrder) {
    const key =
      source === 'companies' ? 'companies' : source === 'kunden' ? 'kunden' : 'firmen';
    const arr = Array.isArray(/** @type {any} */ (r)[key]) ? /** @type {any} */ (r)[key] : [];
    for (const rec of arr) add(/** @type {object} */ (rec), source);
  }

  return { list: Array.from(byKey.values()), hasStatus };
}

/**
 * @param {object[]} firmenArr
 * @returns {{ list: object[], hasStatus: boolean }}
 */
function buildNormalizedFirmenFromApi(firmenArr) {
  const arr = Array.isArray(firmenArr) ? firmenArr : [];
  return buildFirmaListFromSources({ firmen: arr }, ['firmen']);
}

/**
 * @param {object} c normalized
 * @returns {string}
 */
export function stableFirmaId(c) {
  if (c && c.stableKey != null && String(c.stableKey).trim() !== '') return String(c.stableKey).trim();
  return '';
}

/**
 * @param {Record<string, unknown>|null|undefined} raw
 * @param {{ firmaId?: string|null, firmaName?: string|null }} ref
 * @returns {string|null}
 */
export function findFirmaNavIdForRef(raw, ref) {
  const { list } = buildFirmaListFromSources(raw || {}, ['companies', 'firmen', 'kunden']);
  const cid = ref.firmaId != null ? String(ref.firmaId).trim() : '';
  if (cid) {
    const hit = list.find(
      c =>
        stableFirmaId(c) === cid ||
        (c.raw && c.raw.id != null && String(c.raw.id).trim() === cid),
    );
    if (hit) return stableFirmaId(hit);
  }
  const nm = ref.firmaName != null ? String(ref.firmaName).trim().toLowerCase() : '';
  if (nm) {
    const hit = list.find(c => c.name.toLowerCase() === nm);
    if (hit) return stableFirmaId(hit);
  }
  return null;
}

/**
 * @param {object} c normalized
 * @returns {boolean}
 */
function firmaPassesFilter(c) {
  const f = CCState.get('cockpitFirmaFilter');
  if (!f) return true;
  if (f.type && String(f.type).trim() !== '') {
    if (!c.type || c.type !== f.type) return false;
  }
  if (firmenApiHasStatus && f.status && String(f.status).trim() !== '') {
    const want = String(f.status).trim().toLowerCase();
    const got = (c.statusRaw || '').toLowerCase();
    if (got !== want) return false;
  }
  const q = String(cockpitFirmaSucheText || '').trim().toLowerCase();
  if (q) {
    const hay = firmaStammSearchHay(c);
    if (!hay.includes(q)) return false;
  }
  return true;
}

/**
 * @param {object[]} rows
 * @param {object[]} all
 * @returns {string}
 */
function renderFirmenTableHtml(rows, all) {
  if (rows.length === 0) {
    return `<p class="ckp-firmen-empty">Keine Firmen für die aktuellen Filter.</p>`;
  }
  const body = rows
    .map(c => {
      const id = stableFirmaId(c);
      const st =
        c.statusRaw != null && String(c.statusRaw).trim() !== ''
          ? String(c.statusRaw).trim()
          : '—';
      const nu = 0;
      const np = 0;
      const hay = esc(firmaStammSearchHay(c));
      return `<tr class="ckp-firmen-row" tabindex="0" role="button" data-firma-id="${esc(id)}" data-ccw-row-id="${esc(id)}" data-firma-search-hay="${hay}" aria-label="Firma ${esc(c.name)}">
  <td>${renderFirmaKundePrimaryCellHtml(c)}</td>
  <td>${esc(c.typeLabel)}</td>
  <td>${esc(c.internExtern || '—')}</td>
  <td>${esc(c.stadt || '—')}</td>
  <td>${esc(st)}</td>
  <td>${esc(String(nu))}</td>
  <td>${esc(String(np))}</td>
</tr>`;
    })
    .join('');
  return `<div class="ckp-table-wrap">
  <table class="ckp-table ckp-firmen-table">
    <thead>
      <tr>
        <th scope="col">Kunde</th>
        <th scope="col">Typ</th>
        <th scope="col">Intern/Extern</th>
        <th scope="col">Stadt</th>
        <th scope="col">Status</th>
        <th scope="col">Benutzer</th>
        <th scope="col">Projekte</th>
      </tr>
    </thead>
    <tbody>${body}</tbody>
  </table>
</div>`;
}

function renderFilterBarHtml() {
  const f = CCState.get('cockpitFirmaFilter') || {};
  const parts = [];
  if (f.type) parts.push(`type = ${f.type}`);
  if (firmenApiHasStatus && f.status) parts.push(`status = ${f.status}`);
  const summary = parts.length ? parts.join(' · ') : 'alle anzeigen';
  const qVal = esc(cockpitFirmaSucheText);
  return `<div class="ckp-firmen-filterbar">
  <span class="ckp-firmen-filterbar__label">Filter:</span>
  <span class="ckp-firmen-filterbar__summary">${esc(summary)}</span>
  <label class="ckp-firmen-suche-label" style="display:inline-flex;align-items:center;gap:6px;margin-left:12px;">
    <span style="font-size:12px;color:#64748b;">Suche</span>
    <input type="search" data-ccw-firmen-suche placeholder="Name, Nr.…" value="${qVal}" style="min-width:160px;padding:4px 8px;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;" />
  </label>
  <button type="button" class="ckp-firmen-filter-reset" data-ccw-firmen-filter-reset>Zurücksetzen</button>
</div>`;
}

const FIRMA_FORM_TYP_OPTS = ['kunde', 'partner', 'lieferant', 'haendler'];

/**
 * @param {Record<string, unknown>} r
 * @param {string} key
 * @param {string} [fb]
 * @returns {string}
 */
function firmaFormField(r, key, fb = '') {
  const v = r[key];
  if (v != null && String(v).trim() !== '') return String(v).trim();
  return fb;
}

/**
 * @param {{ mode: 'create' } | { mode: 'edit', normalizedFirma: object }} opts
 * @returns {string}
 */
export function renderFirmaFormHtml(opts) {
  const mode = opts.mode;
  const c = mode === 'edit' ? opts.normalizedFirma : null;
  const r = c && c.raw && typeof c.raw === 'object' ? /** @type {Record<string, unknown>} */ (c.raw) : {};
  const field = (key, fb = '') => firmaFormField(r, key, fb);
  const title = mode === 'edit' ? 'Firma bearbeiten' : 'Neue Firma';
  const editId = mode === 'edit' && c ? stableFirmaId(c) : '';

  const typRaw = mode === 'edit' ? field('typ', 'kunde') : '';
  const typV = FIRMA_FORM_TYP_OPTS.includes(typRaw) ? typRaw : 'kunde';
  const typSel = v => (mode === 'edit' && typV === v ? ' selected' : '');

  const ieRaw = mode === 'edit' ? field('intern_extern', 'intern') : '';
  const ieV = ieRaw === 'extern' ? 'extern' : 'intern';
  const ieSel = v => (mode === 'edit' && ieV === v ? ' selected' : '');

  let anredeV = mode === 'edit' ? field('ansprechpartner_anrede', 'Herr') : '';
  if (!['Herr', 'Frau', 'Divers'].includes(anredeV)) anredeV = 'Herr';
  const anredeSel = v => (mode === 'edit' && anredeV === v ? ' selected' : '');

  const vName = mode === 'edit' ? field('name', c && c.name ? String(c.name) : '') : '';
  const vKn =
    mode === 'edit'
      ? field('kundennummer', c && c.kundennummer && c.kundennummer !== '—' ? String(c.kundennummer) : '') ||
        '—'
      : '';
  const vAlt = mode === 'edit' ? field('altnummer', '') : '';
  const vUst = mode === 'edit' ? field('umsatzsteuer_id', '') : '';
  const vStr = mode === 'edit' ? field('strasse', '') : '';
  const vPlz = mode === 'edit' ? field('plz', '') : '';
  const vStadt = mode === 'edit' ? field('stadt', '') : '';
  const vLand = mode === 'edit' ? field('land', 'Deutschland') : '';
  const vTel = mode === 'edit' ? field('telefon', '') : '';
  const vEm = mode === 'edit' ? field('email', '') : '';
  const vWeb = mode === 'edit' ? field('website', '') : '';
  const vVn = mode === 'edit' ? field('ansprechpartner_vorname', '') : '';
  const vNn = mode === 'edit' ? field('ansprechpartner_nachname', '') : '';
  const vApEm = mode === 'edit' ? field('ansprechpartner_email', '') : '';
  const vApTel = mode === 'edit' ? field('ansprechpartner_telefon', '') : '';
  const vNotiz = mode === 'edit' ? field('interne_notiz', '') : '';

  const knInputValue = mode === 'edit' ? vKn : 'Automatisch (K-2026-00001)';
  const landAttr = mode === 'edit' ? esc(vLand || 'Deutschland') : 'Deutschland';

  return `<dialog class="ckp-firmen-neu-wrap" data-ccw-firmen-neu-wrap>
  <input type="hidden" data-ccw-firmen-form-edit-id value="${esc(editId)}" />
  <div class="ckp-firmen-neu-head">
    <h3 class="ckp-firmen-neu-title">${esc(title)}</h3>
  </div>
  <div class="ckp-firmen-neu-body">
    <section class="ckp-firmen-neu-section">
      <h4 class="ckp-firmen-neu-section-title">1 — Firmendaten</h4>
      <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
        <label class="ckp-firmen-neu-field"><span>Firmenname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-name autocomplete="organization" value="${esc(vName)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Kundennummer</span><input type="text" value="${esc(knInputValue)}" readonly /></label>
        <label class="ckp-firmen-neu-field"><span>Alt-Nummer / Externe Nr.</span><input type="text" data-ccw-firmen-neu-altnummer value="${esc(vAlt)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Typ</span><select data-ccw-firmen-neu-typ><option value="kunde"${typSel('kunde')}>Kunde</option><option value="partner"${typSel('partner')}>Partner</option><option value="lieferant"${typSel('lieferant')}>Lieferant</option><option value="haendler"${typSel('haendler')}>Händler</option></select></label>
        <label class="ckp-firmen-neu-field"><span>Intern/Extern</span><select data-ccw-firmen-neu-intern-extern><option value="intern"${ieSel('intern')}>intern</option><option value="extern"${ieSel('extern')}>extern</option></select></label>
        <label class="ckp-firmen-neu-field"><span>Umsatzsteuer-ID</span><input type="text" data-ccw-firmen-neu-ust value="${esc(vUst)}" /></label>
      </div>
    </section>
    <section class="ckp-firmen-neu-section">
      <h4 class="ckp-firmen-neu-section-title">2 — Adresse</h4>
      <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--four">
        <label class="ckp-firmen-neu-field ckp-firmen-neu-field--span-2"><span>Straße & Hausnummer <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-strasse value="${esc(vStr)}" /></label>
        <label class="ckp-firmen-neu-field"><span>PLZ <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-plz value="${esc(vPlz)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Stadt <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-stadt value="${esc(vStadt)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Land</span><input type="text" data-ccw-firmen-neu-land value="${landAttr}" /></label>
      </div>
    </section>
    <section class="ckp-firmen-neu-section">
      <h4 class="ckp-firmen-neu-section-title">3 — Kontaktdaten</h4>
      <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
        <label class="ckp-firmen-neu-field"><span>Telefon</span><input type="text" data-ccw-firmen-neu-telefon value="${esc(vTel)}" /></label>
        <label class="ckp-firmen-neu-field"><span>E-Mail</span><input type="email" data-ccw-firmen-neu-email value="${esc(vEm)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Website</span><input type="text" data-ccw-firmen-neu-website value="${esc(vWeb)}" /></label>
      </div>
    </section>
    <section class="ckp-firmen-neu-section">
      <h4 class="ckp-firmen-neu-section-title">4 — Hauptansprechpartner</h4>
      <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
        <label class="ckp-firmen-neu-field"><span>Anrede</span><select data-ccw-firmen-neu-anrede><option value="Herr"${anredeSel('Herr')}>Herr</option><option value="Frau"${anredeSel('Frau')}>Frau</option><option value="Divers"${anredeSel('Divers')}>Divers</option></select></label>
        <label class="ckp-firmen-neu-field"><span>Vorname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-vorname value="${esc(vVn)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Nachname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-firmen-neu-nachname value="${esc(vNn)}" /></label>
        <label class="ckp-firmen-neu-field"><span>E-Mail direkt</span><input type="email" data-ccw-firmen-neu-ap-email value="${esc(vApEm)}" /></label>
        <label class="ckp-firmen-neu-field"><span>Telefon direkt</span><input type="text" data-ccw-firmen-neu-ap-telefon value="${esc(vApTel)}" /></label>
      </div>
    </section>
    <section class="ckp-firmen-neu-section">
      <h4 class="ckp-firmen-neu-section-title">5 — Interne Notizen</h4>
      <label class="ckp-firmen-neu-field"><span>Interne Notiz</span><textarea data-ccw-firmen-neu-notiz rows="4">${esc(vNotiz)}</textarea></label>
    </section>
  </div>
  <p class="ckp-api-error ckp-firmen-neu-msg" data-ccw-firmen-neu-msg hidden role="alert"></p>
  <div class="ckp-firmen-neu-footer">
    <button type="button" class="ccds-btn-primary" data-ccw-firmen-neu-submit>Speichern</button>
    <button type="button" class="ccds-btn-primary ckp-firmen-neu-btn-cancel" data-ccw-firmen-neu-cancel>Abbrechen</button>
  </div>
</dialog>`;
}

function phase2Notice() {
  return `<div class="ckp-phase2-notice" role="status">
  <span class="ckp-phase2-notice__badge">API</span>
  <div class="ckp-phase2-notice__body">
    <p>Datenquelle: <code>GET /api/v1/firmen</code> · Neu: <code>POST /api/v1/firmen</code> (Cockpit-Recht „firmen“).</p>
  </div>
</div>`;
}

/**
 * @returns {string}
 */
function renderNeueFirmaFormHtml() {
  return renderFirmaFormHtml({ mode: 'create' });
}

export async function renderCockpitFirmenViewHtml() {
  await ensureFirmenStammLoaded();
  const slice0 = getFirmenStammStateSlice();
  const loadErr = slice0.loadState === 'error' && slice0.error ? slice0.error : '';
  const apiFirmen = getFirmenStammRows();
  const { list, hasStatus } = buildNormalizedFirmenFromApi(apiFirmen);
  firmenApiHasStatus = hasStatus;
  firmenSourceAll = list;
  firmenLastRows = list.filter(firmaPassesFilter);

  const mainInner =
    list.length === 0
      ? `${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}<p class="ckp-firmen-empty">Keine Firmen vorhanden. Über „Neu“ anlegen (<code>POST /api/v1/firmen</code>).</p>`
      : `${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}${renderFilterBarHtml()}${renderFirmenTableHtml(firmenLastRows, list)}`;

  const selId = CCState.get('cockpitFirmaSelectedId');
  let navFirma = null;
  if (selId) {
    for (const c of firmenSourceAll) {
      if (stableFirmaId(c) === selId) {
        navFirma = c;
        break;
      }
    }
  }
  const dialogHtml = navFirma
    ? renderFirmaFormHtml({ mode: 'edit', normalizedFirma: navFirma })
    : renderNeueFirmaFormHtml();

  return `<div class="ckp-firmen" data-ccw-ro="cockpit-firmen">
  <div style="display:flex;flex-wrap:wrap;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px;">
    <div>
      <h2 style="margin:0;font-size:1.25rem;">Firmen</h2>
      <p style="margin:6px 0 0;font-size:13px;color:#64748b;">Verwaltung eigener Firmendatensätze (unabhängig von Projekten).</p>
    </div>
    <button
      type="button"
      class="ccds-btn-primary"
      data-ccw-firmen-neu-toggle
      hidden
      style="display:none !important;"
      tabindex="-1"
      aria-hidden="true"
    ><span aria-hidden="true">+</span> Neu</button>
  </div>
  ${phase2Notice()}
  ${dialogHtml}
  <div id="ckp-firmen-main" data-ccw-firmen-main="1">
    ${mainInner}
  </div>
</div>`;
}

/**
 * @param {HTMLElement} root
 */
async function refreshFirmenMainDom(root) {
  const main = root.querySelector('[data-ccw-firmen-main="1"]');
  if (!main) return;

  const slice = getFirmenStammStateSlice();
  const loadErr = slice.loadState === 'error' && slice.error ? slice.error : '';
  const apiFirmen = getFirmenStammRows();
  const { list, hasStatus } = buildNormalizedFirmenFromApi(apiFirmen);
  firmenApiHasStatus = hasStatus;
  firmenSourceAll = list;
  firmenLastRows = list.filter(firmaPassesFilter);

  const mainInner =
    list.length === 0
      ? `${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}<p class="ckp-firmen-empty">Keine Firmen vorhanden.</p>`
      : `${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}${renderFilterBarHtml()}${renderFirmenTableHtml(firmenLastRows, list)}`;
  main.innerHTML = mainInner;
}

/**
 * @param {HTMLElement} root
 * @param {string} dialogHtml
 * @returns {HTMLDialogElement|null}
 */
function replaceFirmenFormDialog(root, dialogHtml) {
  if (typeof document === 'undefined') return null;
  const tpl = document.createElement('template');
  tpl.innerHTML = dialogHtml.trim();
  const el = tpl.content.firstElementChild;
  const cur = root.querySelector('[data-ccw-firmen-neu-wrap]');
  if (!(el instanceof HTMLDialogElement) || !cur || !cur.parentElement) return null;
  cur.replaceWith(el);
  return el;
}

/**
 * @param {ParentNode|null|undefined} mount
 */
export function attachCockpitFirmenHandlers(mount) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="cockpit-firmen"]');
  if (!root || !(root instanceof HTMLElement)) return;
  if (firmenHandlersAbort) firmenHandlersAbort.abort();
  firmenHandlersAbort = new AbortController();
  const sig = firmenHandlersAbort.signal;

  mount.addEventListener(
    'input',
    async ev => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement)) return;
      if (!root.contains(t)) return;
      if (!t.matches('[data-ccw-firmen-suche]')) return;
      cockpitFirmaSucheText = String(t.value || '');
      await refreshFirmenMainDom(root);
    },
    { signal: sig },
  );

  mount.addEventListener('click', async ev => {
    const t = ev.target;
    if (!(t instanceof Element)) return;
    if (!root.contains(t)) return;

    if (t.closest('[data-ccw-firmen-neu-toggle]')) {
      ev.preventDefault();
      const oldWrap = root.querySelector('[data-ccw-firmen-neu-wrap]');
      if (oldWrap instanceof HTMLDialogElement && oldWrap.open) oldWrap.close();
      const newWrap = replaceFirmenFormDialog(root, renderFirmaFormHtml({ mode: 'create' }));
      if (newWrap) {
        const msg = newWrap.querySelector('[data-ccw-firmen-neu-msg]');
        if (msg instanceof HTMLElement) {
          msg.textContent = '';
          msg.hidden = true;
        }
        newWrap.showModal();
      }
      return;
    }
    if (t.closest('[data-ccw-firmen-neu-cancel]')) {
      ev.preventDefault();
      const oldWrap = root.querySelector('[data-ccw-firmen-neu-wrap]');
      if (oldWrap instanceof HTMLDialogElement) oldWrap.close();
      replaceFirmenFormDialog(root, renderFirmaFormHtml({ mode: 'create' }));
      const msg = root.querySelector('[data-ccw-firmen-neu-msg]');
      if (msg instanceof HTMLElement) {
        msg.textContent = '';
        msg.hidden = true;
      }
      return;
    }
    if (t.closest('[data-ccw-firmen-neu-submit]')) {
      ev.preventDefault();
      const msg = root.querySelector('[data-ccw-firmen-neu-msg]');
      const nm = root.querySelector('[data-ccw-firmen-neu-name]');
      const altNr = root.querySelector('[data-ccw-firmen-neu-altnummer]');
      const tp = root.querySelector('[data-ccw-firmen-neu-typ]');
      const ie = root.querySelector('[data-ccw-firmen-neu-intern-extern]');
      const ust = root.querySelector('[data-ccw-firmen-neu-ust]');
      const strasse = root.querySelector('[data-ccw-firmen-neu-strasse]');
      const plz = root.querySelector('[data-ccw-firmen-neu-plz]');
      const stadt = root.querySelector('[data-ccw-firmen-neu-stadt]');
      const land = root.querySelector('[data-ccw-firmen-neu-land]');
      const telefon = root.querySelector('[data-ccw-firmen-neu-telefon]');
      const email = root.querySelector('[data-ccw-firmen-neu-email]');
      const website = root.querySelector('[data-ccw-firmen-neu-website]');
      const anrede = root.querySelector('[data-ccw-firmen-neu-anrede]');
      const vorname = root.querySelector('[data-ccw-firmen-neu-vorname]');
      const nachname = root.querySelector('[data-ccw-firmen-neu-nachname]');
      const apEmail = root.querySelector('[data-ccw-firmen-neu-ap-email]');
      const apTelefon = root.querySelector('[data-ccw-firmen-neu-ap-telefon]');
      const notiz = root.querySelector('[data-ccw-firmen-neu-notiz]');
      if (msg instanceof HTMLElement) {
        msg.textContent = '';
        msg.hidden = true;
      }
      const name = nm instanceof HTMLInputElement ? String(nm.value || '').trim() : '';
      const typ =
        tp instanceof HTMLInputElement || tp instanceof HTMLSelectElement
          ? String(tp.value || '').trim()
          : '';
      const internExtern =
        ie instanceof HTMLInputElement || ie instanceof HTMLSelectElement
          ? String(ie.value || '').trim()
          : '';
      const adrStr = strasse instanceof HTMLInputElement ? String(strasse.value || '').trim() : '';
      const adrPlz = plz instanceof HTMLInputElement ? String(plz.value || '').trim() : '';
      const adrStadt = stadt instanceof HTMLInputElement ? String(stadt.value || '').trim() : '';
      const apVorname = vorname instanceof HTMLInputElement ? String(vorname.value || '').trim() : '';
      const apNachname = nachname instanceof HTMLInputElement ? String(nachname.value || '').trim() : '';
      const editIn = root.querySelector('[data-ccw-firmen-form-edit-id]');
      const editId =
        editIn instanceof HTMLInputElement ? String(editIn.value || '').trim() : '';
      const body = {
        name,
        altnummer: altNr instanceof HTMLInputElement ? String(altNr.value || '').trim() : '',
        typ,
        intern_extern: internExtern || 'extern',
        umsatzsteuer_id: ust instanceof HTMLInputElement ? String(ust.value || '').trim() : '',
        strasse: adrStr,
        plz: adrPlz,
        stadt: adrStadt,
        land: land instanceof HTMLInputElement ? String(land.value || '').trim() : 'Deutschland',
        telefon: telefon instanceof HTMLInputElement ? String(telefon.value || '').trim() : '',
        email: email instanceof HTMLInputElement ? String(email.value || '').trim() : '',
        website: website instanceof HTMLInputElement ? String(website.value || '').trim() : '',
        ansprechpartner_anrede:
          anrede instanceof HTMLInputElement || anrede instanceof HTMLSelectElement
            ? String(anrede.value || '').trim()
            : '',
        ansprechpartner_vorname: apVorname,
        ansprechpartner_nachname: apNachname,
        ansprechpartner_email:
          apEmail instanceof HTMLInputElement ? String(apEmail.value || '').trim() : '',
        ansprechpartner_telefon:
          apTelefon instanceof HTMLInputElement ? String(apTelefon.value || '').trim() : '',
        interne_notiz: notiz instanceof HTMLTextAreaElement ? String(notiz.value || '').trim() : '',
      };
      try {
        if (editId) {
          await apiFetch(`/api/v1/firmen/${encodeURIComponent(editId)}`, { method: 'PATCH', body });
        } else {
          await apiFetch('/api/v1/firmen', { method: 'POST', body });
        }
        await refreshFirmenStammFromApi();
        const oldWrap = root.querySelector('[data-ccw-firmen-neu-wrap]');
        if (oldWrap instanceof HTMLDialogElement && oldWrap.open) oldWrap.close();
        replaceFirmenFormDialog(root, renderFirmaFormHtml({ mode: 'create' }));
        await refreshFirmenMainDom(root);
      } catch (e) {
        if (msg instanceof HTMLElement) {
          msg.textContent = formatApiErrorForUi(e);
          msg.hidden = false;
        }
      }
      return;
    }

    if (t.closest('[data-ccw-firmen-filter-reset]')) {
      ev.preventDefault();
      cockpitFirmaSucheText = '';
      CCState.set('cockpitFirmaFilter', {
        type: null,
        status: null,
      });
      CCState.set('cockpitFirmaSelectedId', null);
      await refreshFirmenMainDom(root);
      return;
    }

    const row = t.closest('tr.ckp-firmen-row[data-firma-id]');
    if (row) {
      ev.preventDefault();
      const id = row.getAttribute('data-firma-id');
      if (!id) return;
      let c = null;
      for (const x of firmenSourceAll) {
        if (stableFirmaId(x) === id) {
          c = x;
          break;
        }
      }
      if (!c) return;
      const oldWrap = root.querySelector('[data-ccw-firmen-neu-wrap]');
      if (oldWrap instanceof HTMLDialogElement && oldWrap.open) oldWrap.close();
      const newWrap = replaceFirmenFormDialog(root, renderFirmaFormHtml({ mode: 'edit', normalizedFirma: c }));
      if (newWrap) {
        const rowMsg = newWrap.querySelector('[data-ccw-firmen-neu-msg]');
        if (rowMsg instanceof HTMLElement) {
          rowMsg.textContent = '';
          rowMsg.hidden = true;
        }
        newWrap.showModal();
      }
    }
  });

  queueMicrotask(() => {
    const editIn = root.querySelector('[data-ccw-firmen-form-edit-id]');
    const editId =
      editIn instanceof HTMLInputElement ? String(editIn.value || '').trim() : '';
    if (editId) {
      const wrap = root.querySelector('[data-ccw-firmen-neu-wrap]');
      if (wrap instanceof HTMLDialogElement && !wrap.open) wrap.showModal();
    }
    CCState.set('cockpitFirmaSelectedId', null);
  }, { signal: sig });
}

/**
 * Tabellenzelle: klickbare Firma zur Firmen-Ansicht (Navigation in die Firmen-Liste).
 * @param {string|null} firmaId Ergebnis von {@link findFirmaNavIdForRef}
 * @param {string} label Anzeigetext
 * @returns {string}
 */
export function renderFirmaCellHtml(firmaId, label) {
  const t = label == null || label === '' ? '—' : String(label);
  if (!firmaId || t === '—') return esc(t);
  return `<button type="button" class="ccds-firma-nav-link" data-nav-key="firms" data-ccw-firma-nav-id="${esc(firmaId)}">${esc(t)}</button>`;
}
