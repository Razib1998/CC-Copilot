/**
 * Cockpit — Angebote (Phase 17), an Projekt/Kunde gekoppelt.
 */
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import { normalizeCockpitIdList, toApiIdPayload } from '../../../../core/api/cockpit-id-adapter.js';
/** @type {AbortController | null} */
let angeboteHandlersAbort = null;

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STATUS_OPTS = [
  { v: 'entwurf', l: 'Entwurf' },
  { v: 'versendet', l: 'Versendet' },
  { v: 'angenommen', l: 'Angenommen' },
  { v: 'abgelehnt', l: 'Abgelehnt' },
];

/**
 * @param {string|null|undefined} st
 */
function statusLabel(st) {
  if (st == null || st === '') return '—';
  const r = STATUS_OPTS.find(o => o.v === String(st));
  return r ? r.l : String(st);
}

/**
 * @param {unknown} n
 */
function formatBetrag(n) {
  if (n == null || n === '') return '—';
  const x = typeof n === 'number' ? n : Number.parseFloat(String(n).replace(',', '.'));
  if (!Number.isFinite(x)) return '—';
  return new Intl.NumberFormat('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(x);
}

/**
 * @param {unknown} iso
 */
function formatDatum(iso) {
  if (iso == null || iso === '') return '—';
  const s = String(iso);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitAngeboteViewHtml() {
  let loadErr = '';
  /** @type {object[]} */
  let angebote = [];
  /** @type {object[]} */
  let projects = [];
  try {
    const ar = await apiFetch('/angebote');
    angebote = normalizeCockpitIdList(Array.isArray(ar.angebote) ? ar.angebote : []);
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  try {
    const pr = await apiFetch('/projects');
    projects = normalizeCockpitIdList(Array.isArray(pr.projects) ? pr.projects : []);
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  let myRights = null;
  try {
    myRights = await loadMyRights();
  } catch {
    myRights = null;
  }
  const canCreateAngebot = myRight(myRights, 'fusa', 'angebote', 'erstellen');
  const canBearbeitenAngebot = myRight(myRights, 'fusa', 'angebote', 'bearbeiten');

  const projOpts = projects
    .filter(p => p && p.id)
    .map(p => {
      const id = String(p.id);
      const nm = p.name != null && String(p.name).trim() !== '' ? String(p.name) : id;
      const kn =
        p.kunde_name != null && String(p.kunde_name).trim() !== '' ? String(p.kunde_name).trim() : '';
      return `<option value="${esc(id)}" data-kunde-name="${esc(kn)}">${esc(nm)}</option>`;
    })
    .join('');

  const statusOptsNeu = STATUS_OPTS.map(
    o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`,
  ).join('');

  const angOptsPatch = angebote
    .filter(a => a && a.id)
    .map(a => {
      const id = String(a.id);
      const nr =
        a.angebotsnummer != null && String(a.angebotsnummer).trim() !== ''
          ? String(a.angebotsnummer)
          : id;
      return `<option value="${esc(id)}">${esc(nr)}</option>`;
    })
    .join('');

  const rows =
    angebote.length === 0
      ? `<tr><td colspan="7" class="ckp-snapshot-ro-empty-cell">Keine Angebote.</td></tr>`
      : angebote
          .map(a => {
            const id = a.id != null ? String(a.id) : '';
            const nr = a.angebotsnummer != null ? String(a.angebotsnummer) : '—';
            const titel = a.titel != null ? String(a.titel) : '—';
            const kunde =
              a.kunde_name != null && String(a.kunde_name).trim() !== '' ? String(a.kunde_name) : '—';
            const proj =
              a.project_name != null && String(a.project_name).trim() !== ''
                ? String(a.project_name)
                : a.projektId != null
                  ? String(a.projektId)
                  : '—';
            return `<tr data-ccw-row-id="${esc(id)}">
          <td class="ckp-snapshot-ro-td">${esc(nr)}</td>
          <td class="ckp-snapshot-ro-td">${esc(titel)}</td>
          <td class="ckp-snapshot-ro-td">${esc(kunde)}</td>
          <td class="ckp-snapshot-ro-td">${esc(proj)}</td>
          <td class="ckp-snapshot-ro-td">${esc(statusLabel(a.status))}</td>
          <td class="ckp-snapshot-ro-td">${esc(formatBetrag(a.betrag_netto))}</td>
          <td class="ckp-snapshot-ro-td">${esc(formatDatum(a.created_at))}</td>
        </tr>`;
          })
          .join('');

  const neuFormBlock = canCreateAngebot
    ? `<form class="ckp-api-auftrag-form" data-ccw-angebot-neu-form style="margin-bottom:20px;">
    <h3 class="ckp-api-auftrag-form__title">Angebot anlegen</h3>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-proj">Projekt</label>
      <select id="ccw-ang-proj" name="projektId" required data-ccw-angebot-proj-select>
        <option value="">— Projekt wählen —</option>
        ${projOpts}
      </select>
    </div>
    <p class="ckp-mock-note" data-ccw-angebot-kunde-hint role="status" style="margin:0 0 8px;">Kunde: <strong data-ccw-angebot-kunde-name>—</strong> (aus Projekt)</p>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-titel">Titel</label>
      <input id="ccw-ang-titel" name="titel" type="text" required autocomplete="off" />
    </div>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-nr">Angebotsnummer</label>
      <input id="ccw-ang-nr" name="angebotsnummer" type="text" placeholder="leer = z. B. ANG-2026-001" autocomplete="off" />
    </div>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-st">Status</label>
      <select id="ccw-ang-st" name="status">${statusOptsNeu}</select>
    </div>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-betrag">Betrag netto (optional)</label>
      <input id="ccw-ang-betrag" name="betrag_netto" type="text" inputmode="decimal" autocomplete="off" />
    </div>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-notiz">Notiz</label>
      <textarea id="ccw-ang-notiz" name="notiz" rows="2"></textarea>
    </div>
    <button type="submit" class="ckp-api-auftrag-submit">Angebot speichern</button>
    <p class="ckp-api-error" data-ccw-angebot-neu-msg hidden role="alert"></p>
  </form>`
    : `<p class="ckp-mock-note" role="status">Kein Recht zum Anlegen — <code>fusa.angebote.erstellen</code>.</p>`;

  const patchFormBlock =
    angebote.length > 0 && canBearbeitenAngebot
      ? `<form class="ckp-api-auftrag-form" data-ccw-angebot-patch-form style="margin-bottom:20px;">
    <h3 class="ckp-api-auftrag-form__title">Status ändern</h3>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-patch-id">Angebot</label>
      <select id="ccw-ang-patch-id" name="angebot_id" required>${angOptsPatch}</select>
    </div>
    <div class="ckp-api-auftrag-form__row">
      <label for="ccw-ang-patch-st">Neuer Status</label>
      <select id="ccw-ang-patch-st" name="status" required>${statusOptsNeu}</select>
    </div>
    <button type="submit" class="ckp-api-auftrag-submit">Status speichern</button>
    <p class="ckp-api-error" data-ccw-angebot-patch-msg hidden role="alert"></p>
  </form>`
      : angebote.length > 0 && !canBearbeitenAngebot
        ? `<p class="ckp-mock-note" role="status">Kein Recht zur Bearbeitung — <code>fusa.angebote.bearbeiten</code>.</p>`
        : '';

  return `<div class="ckp-angebote" data-ccw-ro="cockpit-angebote">
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
  ${neuFormBlock}
  ${patchFormBlock}
  <section class="ckp-snapshot-ro-section">
    <h3 class="ckp-snapshot-ro-section-title">Angebote</h3>
    <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">Nr.</th>
            <th scope="col" class="ckp-snapshot-ro-th">Titel</th>
            <th scope="col" class="ckp-snapshot-ro-th">Kunde</th>
            <th scope="col" class="ckp-snapshot-ro-th">Projekt</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
            <th scope="col" class="ckp-snapshot-ro-th">Netto</th>
            <th scope="col" class="ckp-snapshot-ro-th">Datum</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </section>
</div>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachCockpitAngeboteHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="cockpit-angebote"]');
  if (!root || !(root instanceof HTMLElement)) return;
  if (angeboteHandlersAbort) angeboteHandlersAbort.abort();
  angeboteHandlersAbort = new AbortController();
  const sig = angeboteHandlersAbort.signal;

  const projSel = root.querySelector('[data-ccw-angebot-proj-select]');
  const kundeEl = root.querySelector('[data-ccw-angebot-kunde-name]');
  function syncKundeFromProject() {
    if (!(projSel instanceof HTMLSelectElement) || !(kundeEl instanceof HTMLElement)) return;
    const opt = projSel.selectedOptions[0];
    const kn = opt && opt.getAttribute('data-kunde-name') != null ? opt.getAttribute('data-kunde-name') : '';
    kundeEl.textContent = kn && kn.trim() !== '' ? kn.trim() : '—';
  }
  if (projSel instanceof HTMLSelectElement) {
    projSel.addEventListener('change', syncKundeFromProject, { signal: sig });
    syncKundeFromProject();
  }

  const neuForm = root.querySelector('[data-ccw-angebot-neu-form]');
  if (neuForm instanceof HTMLFormElement) {
    const msgEl = neuForm.querySelector('[data-ccw-angebot-neu-msg]');
    neuForm.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = '';
        msgEl.hidden = true;
      }
      const fd = new FormData(neuForm);
      const projektId = String(fd.get('projektId') || '').trim();
      const titel = String(fd.get('titel') || '').trim();
      const angebotsnummer = String(fd.get('angebotsnummer') || '').trim();
      const status = String(fd.get('status') || 'entwurf').trim();
      const betrag_netto = String(fd.get('betrag_netto') || '').trim();
      const notiz = String(fd.get('notiz') || '').trim();
      if (!projektId || !titel) return;
      const body = toApiIdPayload({
        projektId,
        titel,
        status,
        ...(angebotsnummer ? { angebotsnummer } : {}),
        ...(betrag_netto ? { betrag_netto: betrag_netto.replace(',', '.') } : {}),
        ...(notiz ? { notiz } : {}),
      });
      try {
        await apiFetch('/angebote', { method: 'POST', body });
        neuForm.reset();
        syncKundeFromProject();
        if (typeof onReload === 'function') await onReload();
      } catch (e) {
        const t = e instanceof Error ? e.message : 'Speichern fehlgeschlagen.';
        if (msgEl instanceof HTMLElement) {
          msgEl.textContent = t;
          msgEl.hidden = false;
        }
      }
    }, { signal: sig });
  }

  const patchForm = root.querySelector('[data-ccw-angebot-patch-form]');
  if (patchForm instanceof HTMLFormElement) {
    const msgEl = patchForm.querySelector('[data-ccw-angebot-patch-msg]');
    patchForm.addEventListener('submit', async ev => {
      ev.preventDefault();
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = '';
        msgEl.hidden = true;
      }
      const fd = new FormData(patchForm);
      const angebot_id = String(fd.get('angebot_id') || '').trim();
      const status = String(fd.get('status') || '').trim();
      if (!angebot_id || !status) return;
      try {
        await apiFetch(`/angebote/${encodeURIComponent(angebot_id)}`, {
          method: 'PATCH',
          body: { status },
        });
        if (typeof onReload === 'function') await onReload();
      } catch (e) {
        const t = e instanceof Error ? e.message : 'Update fehlgeschlagen.';
        if (msgEl instanceof HTMLElement) {
          msgEl.textContent = t;
          msgEl.hidden = false;
        }
      }
    }, { signal: sig });
  }
}
