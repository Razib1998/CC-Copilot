/**
 * Kunden-Stamm (Liste + Dialog) — ein Render-/Handler-Pfad für FUSA / Cockpit / CC Intern.
 * Liste: ensureFirmenStammLoaded → getFirmenStammRows → buildNormalizedFirmenFromApi;
 * Detailzeile: GET /api/v1/stammdaten/kunden/:id (zentral) + Lesepanel; Listenzeile nur Fallback-ID.
 */
import { loadMyRights, myRight } from '../../../core/access/cc-my-rights.js';
import { API_ROUTES } from '../../../core/api/api-routes.js';
import { apiFetch, formatApiErrorForUi } from '../../../core/auth/cc-auth-session.js';
import {
  ensureFirmenStammLoaded,
  getFirmenStammRows,
  getFirmenStammStateSlice,
  getFirmaDetailByListIdFromStammStore,
} from '../../../core/state/firmen-stamm-store.js';
import { buildNormalizedFirmenFromApi, renderFirmenStammListSectionHtml } from './firmen-stamm-list.js';
import {
  renderKundeFormHtml,
  initKundeWeitereAnsprechpartnerUi,
  submitKundeStammForm,
} from '../forms/kunde-form.js';
import { fetchKundenStammDetail } from '../lib/kunden-stamm-detail-api.js';
import { renderKundenStammDetailReadonlyHtml } from './kunden-stamm-detail-panel.js';
import { confirmDelete } from './delete-confirm-modal.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{
 *   dataRootRo: string,
 *   rootExtraClass?: string,
 *   hintText: string,
 *   statusMsgDataAttr?: string | null,
 *   kundenDetailVariant?: 'cockpit'|'fusa'|'ccintern',
 *   showDeleteButton?: boolean,
 * }} opts
 * @returns {Promise<string>}
 */
export async function renderKundenStammFromStoreHtml(opts) {
  const {
    dataRootRo,
    rootExtraClass = '',
    hintText,
    statusMsgDataAttr = null,
    showDeleteButton = false,
  } = opts;

  await ensureFirmenStammLoaded();
  const slice = getFirmenStammStateSlice();
  const loadErr = slice.loadState === 'error' && slice.error ? slice.error : '';
  const rows = getFirmenStammRows();
  const firmenNorm = buildNormalizedFirmenFromApi(rows).list;

  let myRights = null;
  try {
    myRights = await loadMyRights();
  } catch {
    myRights = null;
  }
  const canCreate = myRight(myRights, 'cockpit', 'firmen', 'erstellen');

  const neuBlock = canCreate
    ? `<div style="display:flex;flex-wrap:wrap;justify-content:flex-end;margin-bottom:12px;">
    <button type="button" class="ccds-btn-primary" data-ccw-kunden-neu><span aria-hidden="true">+</span> Neu</button>
  </div>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zum Anlegen — <code>cockpit.firmen.erstellen</code> (<code>GET /auth/my-rights</code>).</p>`;

  const openDiv =
    rootExtraClass && String(rootExtraClass).trim() !== ''
      ? `<div class="${esc(String(rootExtraClass).trim())}" data-ccw-ro="${esc(dataRootRo)}">`
      : `<div data-ccw-ro="${esc(dataRootRo)}">`;

  const msgAttr = statusMsgDataAttr != null ? String(statusMsgDataAttr).trim() : '';
  const statusLine = msgAttr
    ? `<p class="ckp-api-error" ${msgAttr}="" hidden role="status"></p>`
    : '';

  return `${openDiv}
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
  ${neuBlock}
  <div class="ckp-kunden-stamm-toolbar" style="display:flex;flex-wrap:wrap;align-items:center;gap:10px;margin-bottom:10px;">
    <label style="display:flex;align-items:center;gap:8px;flex:1;min-width:200px;max-width:480px;">
      <span style="font-size:13px;color:#64748b;white-space:nowrap;">Suche</span>
      <input type="search" data-ccw-kunden-stamm-suche placeholder="Name, Kunden- oder Alt-Nummer…" autocomplete="off" style="flex:1;min-width:0;padding:6px 10px;font-size:13px;border:1px solid #e2e8f0;border-radius:6px;" />
    </label>
  </div>
  <p class="ckp-mock-note">${esc(hintText)}</p>
  <dialog class="ckp-kunden-edit-dialog" data-ccw-kunden-edit-dialog aria-label="Kunde">
    <div style="max-height:85vh;overflow:auto;padding:4px 8px 12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <h3 style="margin:0;font-size:1.1rem;" data-ccw-kunden-edit-title>Kunde</h3>
        <button type="button" class="ccds-dp-btn ccds-dp-btn--secondary" data-ccw-kunden-edit-close aria-label="Schliessen">Schliessen</button>
      </div>
      <div data-ccw-kunden-edit-body></div>
    </div>
  </dialog>
  ${renderFirmenStammListSectionHtml(firmenNorm, { sectionTitle: 'Firmen', emptyHint: 'Keine Firmen.', showDeleteAction: showDeleteButton === true })}
  ${statusLine}
</div>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 * @param {{
 *   dataRootRo: string,
 *   showFusaFields: boolean,
 *   showCcinternFields?: boolean,
 *   kundenDetailVariant?: 'cockpit'|'fusa'|'ccintern',
 *   statusMsgDataAttr?: string | null,
 *   savedToastText?: string | null,
 *   showDeleteButton?: boolean,
 * }} opts
 */
export function attachKundenStammFromStoreHandlers(mount, onReload, opts) {
  const {
    dataRootRo,
    showFusaFields,
    showCcinternFields = false,
    kundenDetailVariant = 'cockpit',
    statusMsgDataAttr = null,
    savedToastText = null,
    showDeleteButton = false,
  } = opts;
  if (!(mount instanceof HTMLElement)) return;
  const root = Array.from(mount.querySelectorAll('[data-ccw-ro]')).find(
    el => el.getAttribute('data-ccw-ro') === dataRootRo,
  );
  if (!(root instanceof HTMLElement)) return;

  const dlg = root.querySelector('[data-ccw-kunden-edit-dialog]');
  if (dlg instanceof HTMLDialogElement && !dlg.dataset.ccwKundenDlgScrollLock) {
    dlg.dataset.ccwKundenDlgScrollLock = '1';
    dlg.addEventListener('close', () => {
      document.documentElement.classList.remove('ccw-kunden-dialog-open');
      document.body.classList.remove('ccw-kunden-dialog-open');
    });
  }
  const dlgBody = root.querySelector('[data-ccw-kunden-edit-body]');
  const dlgTitle = root.querySelector('[data-ccw-kunden-edit-title]');
  const msgAttr = statusMsgDataAttr != null ? String(statusMsgDataAttr).trim() : '';
  const msg = msgAttr ? root.querySelector(`[${msgAttr}]`) : null;

  const setMsg = text => {
    if (!(msg instanceof HTMLElement)) return;
    msg.textContent = text || '';
    msg.hidden = !text;
  };

  /**
   * @param {object|null} ku
   * @param {'neu'|'bearbeiten'} mode
   */
  async function openStammDialog(ku, mode) {
    if (!(dlg instanceof HTMLDialogElement) || !(dlgBody instanceof HTMLElement)) return;
    if (dlgTitle instanceof HTMLElement) {
      dlgTitle.textContent = mode === 'neu' ? 'Neuer Kunde' : 'Kunde bearbeiten';
    }
    let myRights = null;
    try {
      myRights = await loadMyRights();
    } catch {
      myRights = null;
    }
    const canSeeInternNotiz = myRight(myRights, 'cockpit', 'firmen', 'sehen');
    const canEditCcinternExtra = myRight(myRights, 'ccintern', 'kunden', 'bearbeiten');

    let formKu = ku;
    let panelHtml = '';
    if (mode === 'bearbeiten' && ku && ku.id != null && String(ku.id).trim() !== '') {
      const { kunde, detail, error } = await fetchKundenStammDetail(String(ku.id).trim());
      if (error) {
        panelHtml = `<p class="ckp-api-error" role="alert">${esc(error)}</p>`;
      } else if (kunde && typeof kunde === 'object') {
        formKu = kunde;
        panelHtml = renderKundenStammDetailReadonlyHtml(detail, { variant: kundenDetailVariant });
      } else {
        panelHtml = `<p class="ckp-api-error" role="alert">Keine Detaildaten vom Server.</p>`;
      }
    }
    dlgBody.innerHTML =
      panelHtml +
      renderKundeFormHtml(formKu, {
        showFusaFields,
        showCcinternFields,
        ccinternFieldsReadonly: !canEditCcinternExtra,
        showInterneNotiz: canSeeInternNotiz,
      });
    const innerForm = dlgBody.querySelector('[data-ccw-kunde-stamm-form]');
    if (innerForm instanceof HTMLFormElement) {
      initKundeWeitereAnsprechpartnerUi(innerForm);
      innerForm.addEventListener(
        'submit',
        async e2 => {
          e2.preventDefault();
          await submitKundeStammForm(innerForm, {
            onSuccess: async () => {
              const toast = savedToastText != null ? String(savedToastText).trim() : '';
              if (toast) setMsg(toast);
              if (dlg instanceof HTMLDialogElement) dlg.close();
              if (typeof onReload === 'function') await onReload();
            },
          });
        },
        { once: true },
      );
    }
    document.documentElement.classList.add('ccw-kunden-dialog-open');
    document.body.classList.add('ccw-kunden-dialog-open');
    dlg.showModal();
  }

  root.addEventListener('input', ev => {
    const t = ev.target;
    if (!(t instanceof HTMLInputElement) || !root.contains(t)) return;
    if (!t.matches('[data-ccw-kunden-stamm-suche]')) return;
    const q = String(t.value || '').trim().toLowerCase();
    const tbody = root.querySelector('.ckp-firmen-table tbody');
    if (!(tbody instanceof HTMLElement)) return;
    for (const tr of tbody.querySelectorAll('tr.ckp-firmen-row')) {
      const hay = (tr.getAttribute('data-firma-search-hay') || '').toLowerCase();
      /** @type {HTMLElement} */ (tr).hidden = q !== '' && !hay.includes(q);
    }
  });

  root.addEventListener('click', ev => {
    const t = ev.target;
    if (!(t instanceof Element) || !root.contains(t)) return;

    if (t.closest('[data-ccw-kunden-edit-close]')) {
      ev.preventDefault();
      if (dlg instanceof HTMLDialogElement) dlg.close();
      return;
    }

    if (t.closest('[data-ccw-kunden-neu]')) {
      ev.preventDefault();
      void openStammDialog(null, 'neu');
      return;
    }

    const deletePlaceholder = t.closest('[data-ccw-kunden-delete-placeholder]');
    if (showDeleteButton && deletePlaceholder) {
      ev.preventDefault();
      ev.stopPropagation();
      const kid = String(deletePlaceholder.getAttribute('data-ccw-kunden-delete-placeholder') || '').trim();
      if (!kid) return;
      void (async () => {
        const ok = await confirmDelete({
          title: 'Kunde löschen?',
          itemLabel: `Kunde ${kid}`,
        });
        if (!ok) return;
        try {
          await apiFetch(`${API_ROUTES.cockpit.firmen}/${encodeURIComponent(kid)}`, { method: 'DELETE' });
          setMsg('Kunde gelöscht.');
          if (typeof onReload === 'function') await onReload();
        } catch (e) {
          setMsg(formatApiErrorForUi(e));
        }
      })();
      return;
    }

    const row = t.closest('tr.ckp-firmen-row[data-firma-id]');
    if (row && dlg instanceof HTMLDialogElement && dlgBody instanceof HTMLElement) {
      ev.preventDefault();
      const kid = (row.getAttribute('data-firma-id') || '').trim();
      if (!kid) return;
      const raw = getFirmaDetailByListIdFromStammStore(kid);
      if (raw && typeof raw === 'object') {
        void openStammDialog(raw, 'bearbeiten');
        return;
      }
      if (dlgTitle instanceof HTMLElement) dlgTitle.textContent = 'Kunde bearbeiten';
      dlgBody.innerHTML = `<p class="ckp-api-error" role="alert">Kein Datensatz für diese Zeile in der aktuellen Liste — Ansicht neu laden.</p>`;
      document.documentElement.classList.add('ccw-kunden-dialog-open');
      document.body.classList.add('ccw-kunden-dialog-open');
      dlg.showModal();
    }
  });
}
