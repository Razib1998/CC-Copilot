/**
 * FUSA — Dokumente: UI/Struktur an `FUSA_UMZUG_FERTIG` (`templates.js` #pg-dokumente, `logic/dokument.js`).
 * Daten nur aus API: `GET /projects`, `GET /auftraege` → `fusa_extra_json.dokumente_meta` (keine Demo-Dateien, kein localStorage).
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi, getAccessToken, getApiBaseUrl } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';
import { FUSA_DOKUMENT_TYP_OPTIONS } from '../../lib/fusa-dokument-ui-status.js';
import { flattenDokumenteFromAuftraege } from '../../lib/fusa-dokument-view-model.js';

let dokAbort = /** @type {AbortController|null} */ (null);

/**
 * @returns {Promise<string>}
 */
export async function renderFusaDokumenteViewHtml() {
  let loadErr = '';
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let auftraegeAll = [];
  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    projects = Array.isArray(pr.projects) ? pr.projects.filter(p => p && p.id != null) : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  try {
    const ar = await apiFetch(API_ROUTES.fusa.auftraege);
    auftraegeAll = Array.isArray(ar.auftraege) ? ar.auftraege : [];
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  await ensureFusaProjectSelection(projects);
  const ctx = getFusaAppProject();
  const pid = ctx && ctx.id ? String(ctx.id) : '';

  const vmsAll = flattenDokumenteFromAuftraege(auftraegeAll, pid);
  const countLabel = `${vmsAll.length} Dokument${vmsAll.length === 1 ? '' : 'e'}`;

  const typFilterOpts = `<option value="">Alle Typen</option>${FUSA_DOKUMENT_TYP_OPTIONS.map(
    t => `<option value="${esc(t)}">${esc(t)}</option>`,
  ).join('')}`;

  const auftragOptions =
    pid === ''
      ? '<option value="">— Projekt wählen —</option>'
      : auftraegeAll
          .filter(a => a && String(/** @type {any} */ (a).project_id || '') === pid)
          .map(a => {
            const id = String(/** @type {any} */ (a).id);
            const tit = /** @type {any} */ (a).title != null ? String(/** @type {any} */ (a).title) : id;
            return `<option value="${esc(id)}">${esc(id)} · ${esc(tit)}</option>`;
          })
          .join('');
  const auftragSelectInner =
    auftragOptions === '' ? '<option value="">— Keine Aufträge —</option>' : `<option value="">— optional —</option>${auftragOptions}`;

  const rows =
    vmsAll.length === 0
      ? ''
      : vmsAll
          .map(vm => {
            return `<tr class="fusa-doc-row" style="cursor:pointer;" data-fusa-doc-row="1"
          data-fusa-doc-name="${esc(vm.name)}"
          data-fusa-doc-typ="${esc(vm.typ)}"
          data-fusa-doc-typbdg="${esc(vm.typBadgeClass)}"
          data-fusa-doc-auftrag="${esc(vm.auftragRef)}"
          data-fusa-doc-von="${esc(vm.von)}"
          data-fusa-doc-datum="${esc(vm.erstelltAm)}"
          data-fusa-doc-url="${esc(vm.fileUrl)}"
          data-fusa-doc-size="${esc(vm.sizeDisplay)}"
          data-fusa-doc-icon="${esc(vm.iconLabel)}"
          data-fusa-doc-search="${esc(vm.searchHaystack)}">
          <td class="ckp-snapshot-ro-td"><div class="tm" style="display:flex;align-items:center;gap:8px;"><span style="font-size:16px;" aria-hidden="true">${esc(vm.iconLabel)}</span>${esc(vm.name)}</div></td>
          <td class="ckp-snapshot-ro-td"><span class="fusa-doc-bdg bdg b${esc(vm.typBadgeClass)}">${esc(vm.typ)}</span></td>
          <td class="ckp-snapshot-ro-td" style="font-size:12px;">${esc(vm.auftragRef)}</td>
          <td class="ckp-snapshot-ro-td" style="font-size:12px;">${esc(vm.von)}</td>
          <td class="ckp-snapshot-ro-td" style="font-size:12px;">${esc(vm.erstelltAm)}</td>
          <td class="ckp-snapshot-ro-td"><button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-doc-download>↓ Download</button></td>
        </tr>`;
          })
          .join('');

  const tableBody =
    vmsAll.length === 0
      ? `<tr data-fusa-doc-empty><td colspan="6" class="ckp-snapshot-ro-empty-cell">Keine Dokumente in den Auftrags-Metadaten für dieses Projekt.</td></tr>`
      : rows;

  return `<div data-ccw-ro="fusa-dokumente" class="fusa-doc-scope">
<style>
.fusa-doc-scope{--blue:#D4500A;--blue-l:#FFF0E6;--green:#2E7D32;--green-l:#E8F5E9;--amber:#E65100;--amber-l:#FFF3E0;--red:#C62828;--red-l:#FFEBEE;--teal:#00695C;--teal-l:#E0F2F1;--purple:#4527A0;--purple-l:#EDE7F6;--gray:#546E7A;--gray-l:#ECEFF1;}
.fusa-doc-scope .fusa-doc-bdg.bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}
.fusa-doc-scope .fusa-doc-bdg.bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.fusa-doc-scope .fusa-doc-bdg.bdg.bb{background:var(--blue-l);color:var(--blue)} .fusa-doc-scope .fusa-doc-bdg.bdg.bb::before{background:var(--blue)}
.fusa-doc-scope .fusa-doc-bdg.bdg.bg{background:var(--green-l);color:var(--green)} .fusa-doc-scope .fusa-doc-bdg.bdg.bg::before{background:var(--green)}
.fusa-doc-scope .fusa-doc-bdg.bdg.ba{background:var(--amber-l);color:var(--amber)} .fusa-doc-scope .fusa-doc-bdg.bdg.ba::before{background:var(--amber)}
.fusa-doc-scope .fusa-doc-bdg.bdg.br{background:var(--red-l);color:var(--red)} .fusa-doc-scope .fusa-doc-bdg.bdg.br::before{background:var(--red)}
.fusa-doc-scope .fusa-doc-bdg.bdg.bt{background:var(--teal-l);color:var(--teal)} .fusa-doc-scope .fusa-doc-bdg.bdg.bt::before{background:var(--teal)}
.fusa-doc-scope .fusa-doc-bdg.bdg.bp{background:var(--purple-l);color:var(--purple)} .fusa-doc-scope .fusa-doc-bdg.bdg.bp::before{background:var(--purple)}
.fusa-doc-scope .fusa-doc-bdg.bdg.bgr{background:var(--gray-l);color:var(--gray)} .fusa-doc-scope .fusa-doc-bdg.bdg.bgr::before{background:var(--gray)}
.fusa-doc-scope .fusa-doc-toolbar .btn{font:inherit;font-size:12px;padding:6px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;}
.fusa-doc-scope .fusa-doc-toolbar .btn:hover{background:#f1f5f9;}
.fusa-doc-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10020;display:none;align-items:center;justify-content:center;padding:16px;}
.fusa-doc-overlay.fusa-doc-overlay--open{display:flex;}
.fusa-doc-dialog{background:#fff;border-radius:14px;width:100%;max-width:460px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow:auto;}
.fusa-doc-dh{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:12px;}
.fusa-doc-db{padding:16px 20px;}
.fusa-doc-df{padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
.fusa-doc-modal{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10021;display:none;align-items:center;justify-content:center;padding:16px;}
.fusa-doc-modal.fusa-doc-modal--open{display:flex;}
.fusa-doc-modal__box{background:#fff;border-radius:14px;width:100%;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:92vh;overflow:auto;}
.fusa-doc-modal__h{padding:14px 18px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;}
.fusa-doc-modal__b{padding:18px;}
.fusa-doc-modal__f{padding:12px 18px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;}
</style>
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
  <div class="fusa-doc-toolbar" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px;">
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
      <input type="search" class="fusa-start__proj-select" data-fusa-doc-search placeholder="Dokument suchen…" style="width:220px;max-width:100%;background:#fff;" />
      <select class="fusa-start__proj-select" data-fusa-doc-typ-filter aria-label="Dokumenttyp filtern" style="width:140px;font-size:12px;">${typFilterOpts}</select>
    </div>
    <button type="button" class="ckp-api-auftrag-submit" data-fusa-doc-open-upload>+ Dokument hochladen</button>
  </div>
  <section class="ckp-snapshot-ro-section">
    <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
      <div class="ckp-snapshot-ro-section-title" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
        <span>Alle Dokumente</span>
        <span data-fusa-doc-count style="font-size:12px;color:var(--ccds-muted,#64748b);">${esc(countLabel)}</span>
      </div>
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">Dateiname</th>
            <th scope="col" class="ckp-snapshot-ro-th">Typ</th>
            <th scope="col" class="ckp-snapshot-ro-th">Auftrag</th>
            <th scope="col" class="ckp-snapshot-ro-th">Hochgeladen von</th>
            <th scope="col" class="ckp-snapshot-ro-th">Datum</th>
            <th scope="col" class="ckp-snapshot-ro-th"></th>
          </tr>
        </thead>
        <tbody data-fusa-doc-tbody>${tableBody}</tbody>
      </table>
    </div>
    <p class="ckp-mock-note" style="margin-top:10px;" data-fusa-doc-result role="status"></p>
  </section>

  <div class="fusa-doc-overlay" data-fusa-doc-overlay aria-hidden="true">
    <div class="fusa-doc-dialog" data-fusa-doc-dialog>
      <div class="fusa-doc-dh">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:24px;" data-fusa-doc-ov-icon aria-hidden="true">📎</span>
          <div>
            <div style="font-size:14px;font-weight:600;" data-fusa-doc-ov-name>—</div>
            <div style="font-size:11px;color:#64748b;" data-fusa-doc-ov-sub>—</div>
          </div>
        </div>
        <button type="button" class="btn" data-fusa-doc-ov-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1;" aria-label="Schließen">×</button>
      </div>
      <div class="fusa-doc-db">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px;">
          <div style="background:var(--gray-l,#ECEFF1);border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px;">AUFTRAG</div>
            <div style="font-size:13px;" data-fusa-doc-ov-auftrag>—</div>
          </div>
          <div style="background:var(--gray-l,#ECEFF1);border-radius:8px;padding:10px;">
            <div style="font-size:10px;color:#64748b;font-weight:600;margin-bottom:4px;">HOCHGELADEN VON</div>
            <div style="font-size:13px;" data-fusa-doc-ov-von>—</div>
          </div>
        </div>
        <div style="padding:24px;border:2px dashed #e2e8f0;border-radius:8px;text-align:center;color:#64748b;background:#f8fafc;">
          <div style="font-size:32px;margin-bottom:8px;" data-fusa-doc-ov-icon2 aria-hidden="true">📎</div>
          <div style="font-size:12px;" data-fusa-doc-ov-name2>—</div>
          <div style="font-size:11px;margin-top:8px;color:#94a3b8;" data-fusa-doc-ov-preview-hint>Vorschau nur bei gültiger Datei-URL aus den Metadaten.</div>
        </div>
      </div>
      <div class="fusa-doc-df">
        <button type="button" class="btn fusa-doc-toolbar" data-fusa-doc-ov-close2>Schließen</button>
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-doc-ov-download>↓ Download</button>
      </div>
    </div>
  </div>

  <div class="fusa-doc-modal" data-fusa-doc-modal aria-hidden="true">
    <div class="fusa-doc-modal__box" data-fusa-doc-modal-box>
      <div class="fusa-doc-modal__h">
        <div style="font-weight:600;">Dokument hochladen</div>
        <button type="button" class="btn" data-fusa-doc-modal-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1;" aria-label="Schließen">×</button>
      </div>
      <div class="fusa-doc-modal__b">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-doc-typ">Dokumenttyp <span style="color:#b91c1c">*</span></label>
          <select id="fusa-doc-typ" class="fusa-start__proj-select">${FUSA_DOKUMENT_TYP_OPTIONS.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-doc-auftrag-sel">Auftrag</label>
          <select id="fusa-doc-auftrag-sel" class="fusa-start__proj-select">${auftragSelectInner}</select>
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-doc-name">Dateiname / Beschreibung <span style="color:#b91c1c">*</span></label>
          <input id="fusa-doc-name" class="fusa-start__proj-select" type="text" placeholder="z.B. bus1789-layout-v2.pdf" autocomplete="off" style="width:100%;" />
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-doc-von">Hochgeladen von</label>
          <input id="fusa-doc-von" class="fusa-start__proj-select" type="text" placeholder="Name" autocomplete="off" style="width:100%;" />
        </div>
        <div style="margin-top:12px;padding:16px;border:2px dashed #e2e8f0;border-radius:8px;text-align:center;color:#64748b;font-size:13px;cursor:pointer;" data-fusa-doc-drop-zone role="button" tabindex="0">📎 Datei auswählen oder hierher ziehen</div>
        <input type="file" hidden data-fusa-doc-file-input />
        <p class="ckp-api-error" data-fusa-doc-modal-msg hidden role="alert"></p>
      </div>
      <div class="fusa-doc-modal__f">
        <button type="button" class="btn" data-fusa-doc-modal-cancel>Abbrechen</button>
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-doc-modal-submit>✓ Hochladen</button>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * @param {HTMLElement} root
 * @param {HTMLTableRowElement} tr
 */
function fillDocOverlayFromRow(root, tr) {
  const g = (k) => tr.getAttribute(k) || '—';
  const name = g('data-fusa-doc-name');
  const typ = g('data-fusa-doc-typ');
  const datum = g('data-fusa-doc-datum');
  const auftrag = g('data-fusa-doc-auftrag');
  const von = g('data-fusa-doc-von');
  const icon = g('data-fusa-doc-icon');
  const url = tr.getAttribute('data-fusa-doc-url') || '';

  const el = (sel) => root.querySelector(sel);
  const set = (sel, text) => {
    const n = el(sel);
    if (n) n.textContent = text;
  };
  set('[data-fusa-doc-ov-name]', name);
  set('[data-fusa-doc-ov-sub]', `${typ} · ${datum}`);
  set('[data-fusa-doc-ov-auftrag]', auftrag);
  set('[data-fusa-doc-ov-von]', `${von} · ${datum}`);
  set('[data-fusa-doc-ov-name2]', name);
  const ic = el('[data-fusa-doc-ov-icon]');
  const ic2 = el('[data-fusa-doc-ov-icon2]');
  if (ic) ic.textContent = icon;
  if (ic2) ic2.textContent = icon;

  const hint = el('[data-fusa-doc-ov-preview-hint]');
  if (hint instanceof HTMLElement) {
    hint.textContent = url
      ? 'Datei-URL in Metadaten — Download über Button.'
      : 'Keine Datei-URL in den Metadaten — Vorschau/Download nicht verfügbar.';
  }

  const dl = el('[data-fusa-doc-ov-download]');
  if (dl instanceof HTMLButtonElement) {
    dl.setAttribute('data-fusa-doc-ov-url', url);
  }
}

/**
 * @param {HTMLElement} root
 */
function closeDocOverlay(root) {
  const ov = root.querySelector('[data-fusa-doc-overlay]');
  if (ov instanceof HTMLElement) {
    ov.classList.remove('fusa-doc-overlay--open');
    ov.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @param {HTMLElement} root
 */
function openDocOverlay(root) {
  const ov = root.querySelector('[data-fusa-doc-overlay]');
  if (ov instanceof HTMLElement) {
    ov.classList.add('fusa-doc-overlay--open');
    ov.setAttribute('aria-hidden', 'false');
  }
}

/**
 * @param {HTMLElement} root
 */
function closeDocModal(root) {
  const m = root.querySelector('[data-fusa-doc-modal]');
  if (m instanceof HTMLElement) {
    m.classList.remove('fusa-doc-modal--open');
    m.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @param {HTMLElement} root
 */
function openDocModal(root) {
  const m = root.querySelector('[data-fusa-doc-modal]');
  if (m instanceof HTMLElement) {
    m.classList.add('fusa-doc-modal--open');
    m.setAttribute('aria-hidden', 'false');
  }
}

/**
 * @param {HTMLElement} root
 * @param {string} msg
 */
function flashDocModalMsg(root, msg) {
  const el = root.querySelector('[data-fusa-doc-modal-msg]');
  if (!(el instanceof HTMLElement)) return;
  el.textContent = msg;
  el.hidden = false;
  window.setTimeout(() => {
    el.textContent = '';
    el.hidden = true;
  }, 4500);
}

/**
 * @param {HTMLElement} root
 * @param {string} msg
 */
function flashDocResult(root, msg) {
  const el = root.querySelector('[data-fusa-doc-result]');
  if (!(el instanceof HTMLElement)) return;
  el.textContent = msg;
  window.setTimeout(() => {
    el.textContent = '';
  }, 4000);
}

/**
 * @param {string} relUrl
 * @returns {Promise<void>}
 */
async function triggerAuthedDownload(relUrl) {
  const token = getAccessToken();
  const p = relUrl.startsWith('/') ? relUrl : `/${relUrl}`;
  const url = `${getApiBaseUrl()}${p}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  let fn = 'download';
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(cd);
    if (m) fn = decodeURIComponent(m[1].trim());
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fn;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaDokumenteHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="fusa-dokumente"]');
  if (!(root instanceof HTMLElement)) return;

  if (dokAbort) dokAbort.abort();
  dokAbort = new AbortController();
  const sig = dokAbort.signal;

  const tbody = root.querySelector('[data-fusa-doc-tbody]');
  const searchEl = root.querySelector('[data-fusa-doc-search]');
  const typSel = root.querySelector('[data-fusa-doc-typ-filter]');
  const countEl = root.querySelector('[data-fusa-doc-count]');
  const resultEl = root.querySelector('[data-fusa-doc-result]');
  const rowEls = tbody ? [...tbody.querySelectorAll('tr[data-fusa-doc-row]')] : [];
  const emptyRow = tbody ? tbody.querySelector('[data-fusa-doc-empty]') : null;

  function applyFilters() {
    const q = searchEl instanceof HTMLInputElement ? String(searchEl.value || '').trim().toLowerCase() : '';
    const typ = typSel instanceof HTMLSelectElement ? String(typSel.value || '').trim() : '';
    let n = 0;
    for (const tr of rowEls) {
      const hay = String(tr.getAttribute('data-fusa-doc-search') || '').toLowerCase();
      const trow = String(tr.getAttribute('data-fusa-doc-typ') || '').trim();
      const okQ = !q || hay.includes(q);
      const okT = !typ || trow === typ;
      const show = okQ && okT;
      tr.style.display = show ? '' : 'none';
      if (show) n += 1;
    }
    if (emptyRow instanceof HTMLElement) {
      emptyRow.style.display = rowEls.length === 0 ? '' : 'none';
    }
    if (countEl) {
      countEl.textContent =
        rowEls.length === 0 ? '0 Dokumente' : `${n} von ${rowEls.length} Dokument${rowEls.length === 1 ? '' : 'en'}`;
    }
    if (resultEl instanceof HTMLElement && rowEls.length > 0) {
      resultEl.textContent = `${n} von ${rowEls.length} sichtbar (Filter)`;
    }
  }

  if (searchEl instanceof HTMLInputElement) searchEl.addEventListener('input', applyFilters, { signal: sig });
  if (typSel instanceof HTMLSelectElement) typSel.addEventListener('change', applyFilters, { signal: sig });
  if (rowEls.length) applyFilters();

  root.addEventListener(
    'click',
    ev => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const dl = t.closest('[data-fusa-doc-download]');
      if (dl instanceof HTMLButtonElement) {
        ev.preventDefault();
        ev.stopPropagation();
        const tr = dl.closest('tr[data-fusa-doc-row]');
        const url = tr instanceof HTMLElement ? String(tr.getAttribute('data-fusa-doc-url') || '').trim() : '';
        if (!url) {
          flashDocResult(root, 'Download: Funktion folgt noch. (Keine Datei-URL in den Metadaten.)');
          return;
        }
        if (/^https?:\/\//i.test(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
        void (async () => {
          try {
            await triggerAuthedDownload(url);
          } catch (e) {
            flashDocResult(root, e instanceof Error ? e.message : 'Download fehlgeschlagen.');
          }
        })();
        return;
      }
      const tr = t.closest('tr[data-fusa-doc-row]');
      if (tr instanceof HTMLTableRowElement && root.contains(tr)) {
        fillDocOverlayFromRow(root, tr);
        openDocOverlay(root);
      }
    },
    { signal: sig },
  );

  const ov = root.querySelector('[data-fusa-doc-overlay]');
  if (ov instanceof HTMLElement) {
    ov.addEventListener(
      'click',
      e => {
        if (e.target === ov) closeDocOverlay(root);
      },
      { signal: sig },
    );
  }
  root.querySelectorAll('[data-fusa-doc-ov-close], [data-fusa-doc-ov-close2]').forEach(btn => {
    btn.addEventListener('click', () => closeDocOverlay(root), { signal: sig });
  });
  root.querySelector('[data-fusa-doc-ov-download]')?.addEventListener(
    'click',
    () => {
      const b = root.querySelector('[data-fusa-doc-ov-download]');
      const url = b instanceof HTMLButtonElement ? String(b.getAttribute('data-fusa-doc-ov-url') || '').trim() : '';
      if (!url) {
        flashDocResult(root, 'Download: Funktion folgt noch. (Keine Datei-URL in den Metadaten.)');
        return;
      }
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      void (async () => {
        try {
          await triggerAuthedDownload(url);
        } catch (e) {
          flashDocResult(root, e instanceof Error ? e.message : 'Download fehlgeschlagen.');
        }
      })();
    },
    { signal: sig },
  );

  root.querySelector('[data-fusa-doc-open-upload]')?.addEventListener(
    'click',
    () => {
      openDocModal(root);
    },
    { signal: sig },
  );
  root.querySelectorAll('[data-fusa-doc-modal-close], [data-fusa-doc-modal-cancel]').forEach(b => {
    b.addEventListener('click', () => closeDocModal(root), { signal: sig });
  });
  root.querySelector('[data-fusa-doc-modal-submit]')?.addEventListener(
    'click',
    () => {
      flashDocModalMsg(root, 'Hochladen: Funktion folgt noch. (Kein Dokument-Upload-Endpunkt im Backend.)');
    },
    { signal: sig },
  );
  const dz = root.querySelector('[data-fusa-doc-drop-zone]');
  const fi = root.querySelector('[data-fusa-doc-file-input]');
  if (dz instanceof HTMLElement) {
    dz.addEventListener(
      'click',
      () => {
        if (fi instanceof HTMLInputElement) fi.click();
      },
      { signal: sig },
    );
  }
  if (fi instanceof HTMLInputElement) {
    fi.addEventListener(
      'change',
      () => {
        flashDocModalMsg(root, 'Dateiauswahl: Funktion folgt noch. (Upload-Endpunkt fehlt.)');
        fi.value = '';
      },
      { signal: sig },
    );
  }

  const mod = root.querySelector('[data-fusa-doc-modal]');
  if (mod instanceof HTMLElement) {
    mod.addEventListener(
      'click',
      e => {
        if (e.target === mod) closeDocModal(root);
      },
      { signal: sig },
    );
  }
}
