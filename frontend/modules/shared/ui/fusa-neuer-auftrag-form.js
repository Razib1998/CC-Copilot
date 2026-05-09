/**
 * FUSA — „Neuer Auftrag“ mit Kundenwahl aus dem zentralen Firmenstamm (kein Cockpit-Import).
 *
 * - Anzeige/Optionen: {@link buildFirmenSelectOptions} / {@link resolveFirmenLabel}
 * - POST: gleicher Kern wie bisher (`project_id`, `title`, `status?`, `termin?`); zusätzlich
 *   optional `firma_id` und **Legacy** `kunde_name` (Anzeigetext aus Stamm), solange das Backend
 *   `insertAuftrag` noch nicht persistiert — Route ignoriert Extra-Felder ohne 400.
 *
 * **Backend-Persistenz für `firma_id`:** bewusst noch nicht umgesetzt — siehe
 * `docs/AUFTRAG-FIRMA-ID-VORMERKUNG.md`.
 */
import { apiFetch } from '../../../core/auth/cc-auth-session.js';
import { buildFirmenSelectOptions, resolveFirmenLabel } from '../lib/firma-kunden-referenz.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {{ id: string, name?: string }[]} projects
 * @returns {Promise<string>}
 */
export async function renderFusaNeuerAuftragFormHtml(projects) {
  const opts = await buildFirmenSelectOptions();
  const projOpts = (Array.isArray(projects) ? projects : [])
    .filter(p => p && p.id)
    .map(p => `<option value="${esc(String(p.id))}">${esc(p.name != null ? String(p.name) : p.id)}</option>`)
    .join('');
  const selectBody =
    projOpts ||
    `<option value="">— kein Projekt (API liefert keine Projekte) —</option>`;

  const firmaOpts =
    opts.length === 0
      ? `<option value="">— Keine Firmen im Stamm —</option>`
      : `<option value="">— Kunde wählen (Pflicht) —</option>${opts
          .map(o => `<option value="${esc(o.value)}">${esc(o.label)}</option>`)
          .join('')}`;

  return `<form class="ckp-api-auftrag-form" data-ccw-fusa-api-auftrag-form autocomplete="off">
  <h3 class="ckp-api-auftrag-form__title">Neuer Auftrag</h3>
  <div class="ckp-api-auftrag-form__row">
    <label for="ccw-fusa-auftrag-proj">Projekt</label>
    <select id="ccw-fusa-auftrag-proj" name="project_id" required>${selectBody}</select>
  </div>
  <div class="ckp-api-auftrag-form__row">
    <label for="ccw-fusa-auftrag-firma">Kunde (Firmenstamm)</label>
    <select id="ccw-fusa-auftrag-firma" name="firma_id" required aria-required="true">${firmaOpts}</select>
  </div>
  <p class="ckp-mock-note" style="font-size:12px;margin:0 0 8px;">Auswahl liefert intern <code>firma_id</code>; Anzeigename für künftige API-Felder wird aus dem Stamm abgeleitet (Legacy <code>kunde_name</code> im POST optional).</p>
  <div class="ckp-api-auftrag-form__row">
    <label for="ccw-fusa-auftrag-title">Titel</label>
    <input id="ccw-fusa-auftrag-title" name="title" type="text" required autocomplete="off" />
  </div>
  <div class="ckp-api-auftrag-form__row">
    <label for="ccw-fusa-auftrag-status">Status (optional)</label>
    <input id="ccw-fusa-auftrag-status" name="status" type="text" autocomplete="off" />
  </div>
  <div class="ckp-api-auftrag-form__row">
    <label for="ccw-fusa-auftrag-termin">Termin (optional)</label>
    <input id="ccw-fusa-auftrag-termin" name="termin" type="text" autocomplete="off" />
  </div>
  <button type="submit" class="ckp-api-auftrag-submit">Anlegen</button>
  <p class="ckp-api-error" data-ccw-fusa-api-auftrag-msg hidden role="alert"></p>
</form>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaNeuerAuftragApiHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const form = mount.querySelector('[data-ccw-fusa-api-auftrag-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const msgEl = form.querySelector('[data-ccw-fusa-api-auftrag-msg]');
  form.addEventListener('submit', async ev => {
    ev.preventDefault();
    if (msgEl instanceof HTMLElement) {
      msgEl.textContent = '';
      msgEl.hidden = true;
    }
    const fd = new FormData(form);
    const project_id = String(fd.get('project_id') || '').trim();
    const title = String(fd.get('title') || '').trim();
    const statusRaw = String(fd.get('status') || '').trim();
    const terminRaw = String(fd.get('termin') || '').trim();
    const firma_id = String(fd.get('firma_id') || '').trim();

    if (!project_id || !title) {
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = 'Projekt und Titel sind erforderlich.';
        msgEl.hidden = false;
      }
      return;
    }
    if (!firma_id) {
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = 'Bitte einen Kunden aus dem Firmenstamm wählen.';
        msgEl.hidden = false;
      }
      return;
    }

    /** Legacy-Anzeige für künftige Backend-Persistenz; führende Referenz ist firma_id. */
    const kunde_name = await resolveFirmenLabel(firma_id);

    const body = {
      project_id,
      title,
      ...(statusRaw ? { status: statusRaw } : {}),
      ...(terminRaw ? { termin: terminRaw } : {}),
      firma_id,
      kunde_name,
    };

    try {
      await apiFetch('/auftraege', { method: 'POST', body });
      form.reset();
      await onReload();
    } catch (e) {
      const st = /** @type {{ status?: number }} */ (e).status;
      const hint =
        st === 403
          ? 'Keine Berechtigung (403).'
          : st === 404
            ? 'Projekt nicht gefunden (404).'
            : st === 400
              ? 'Eingabe ungültig (400).'
              : '';
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = `${e instanceof Error ? e.message : 'Fehler'} ${hint}`.trim();
        msgEl.hidden = false;
      }
    }
  });
}
