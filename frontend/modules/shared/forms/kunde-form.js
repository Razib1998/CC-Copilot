/**
 * Gemeinsame Kunden-Stammmaske (Cockpit / FUSA / CC Intern).
 * Stammdaten-Persistenz: POST/PATCH /api/v1/firmen; zentrales Lesen: GET /api/v1/stammdaten/kunden/:id (inkl. detail).
 */
import { apiFetch, formatApiErrorForUi } from '../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../core/api/api-routes.js';
import { refreshFirmenStammFromApi } from '../../../core/state/firmen-stamm-store.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object|null|undefined} kunde
 * @param {string} key
 * @param {string} [fb]
 */
function kv(kunde, key, fb = '') {
  if (!kunde || kunde[key] == null) return fb;
  const t = String(kunde[key]).trim();
  return t !== '' ? t : fb;
}

/**
 * @param {object} row
 * @returns {string}
 */
function renderWeitereRowHtml(row, idx) {
  const r = row && typeof row === 'object' ? row : {};
  const p = (k, fb = '') => esc(r[k] != null && String(r[k]).trim() !== '' ? String(r[k]).trim() : fb);
  const ar = r.anrede != null && String(r.anrede).trim() !== '' ? String(r.anrede).trim() : 'Herr';
  const o = v => (ar === v ? ' selected' : '');
  return `<div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three" data-ccw-kunde-weitere-item="${idx}" style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;">
  <label class="ckp-firmen-neu-field"><span>Anrede</span><select data-ccw-kunde-w-anrede><option value="Herr"${o('Herr')}>Herr</option><option value="Frau"${o('Frau')}>Frau</option><option value="Divers"${o('Divers')}>Divers</option></select></label>
  <label class="ckp-firmen-neu-field"><span>Vorname</span><input type="text" data-ccw-kunde-w-vorname value="${p('vorname')}" /></label>
  <label class="ckp-firmen-neu-field"><span>Nachname</span><input type="text" data-ccw-kunde-w-nachname value="${p('nachname')}" /></label>
  <label class="ckp-firmen-neu-field"><span>Position</span><input type="text" data-ccw-kunde-w-position value="${p('position')}" /></label>
  <label class="ckp-firmen-neu-field"><span>Abteilung</span><input type="text" data-ccw-kunde-w-abteilung value="${p('abteilung')}" /></label>
  <label class="ckp-firmen-neu-field"><span>E-Mail</span><input type="email" data-ccw-kunde-w-email value="${p('email')}" /></label>
  <label class="ckp-firmen-neu-field ckp-firmen-neu-field--span-2"><span>Mobil / Telefon</span><input type="text" data-ccw-kunde-w-mobil value="${p('mobil')}" /></label>
</div>`;
}

/**
 * @param {object|null} [kunde]
 * @param {{ showFusaFields?: boolean, showCcinternFields?: boolean, ccinternFieldsReadonly?: boolean, showInterneNotiz?: boolean }} [opts]
 * @returns {string}
 */
export function renderKundeFormHtml(kunde = null, opts = {}) {
  const showFusa = opts.showFusaFields === true;
  const showCci = opts.showCcinternFields === true;
  const cciRo = opts.ccinternFieldsReadonly === true ? 'readonly' : '';
  const showNotiz = opts.showInterneNotiz !== false;
  const k = kunde && typeof kunde === 'object' ? kunde : null;
  const editId = k && k.id != null ? String(k.id).trim() : '';
  const weitere = k && Array.isArray(k.weitere_ansprechpartner) ? k.weitere_ansprechpartner : [];
  const weitereHtml =
    weitere.length > 0
      ? weitere.map((row, i) => renderWeitereRowHtml(row, i)).join('')
      : '';

  const typVal = k ? String(kv(k, 'typ', 'kunde')).toLowerCase() : 'kunde';
  const typSel = v => (typVal === v ? ' selected' : '');
  const ieVal = k ? String(kv(k, 'intern_extern', 'intern')).toLowerCase() : 'intern';
  const ieSel = v => (ieVal === v ? ' selected' : '');
  const anVal = kv(k, 'ansprechpartner_anrede', 'Herr');
  const anSel = v => (anVal === v ? ' selected' : '');

  return `<form class="ckp-kunde-stamm-form" data-ccw-kunde-stamm-form autocomplete="off">
  <input type="hidden" data-ccw-kunde-stamm-id value="${esc(editId)}" />
  <section class="ckp-firmen-neu-section">
    <h4 class="ckp-firmen-neu-section-title">1 — Basisdaten</h4>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
      <label class="ckp-firmen-neu-field"><span>Firmenname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-name value="${esc(kv(k, 'name'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Kundennummer</span><input type="text" data-ccw-kunde-kundennummer value="${esc(kv(k, 'kundennummer', k ? '—' : 'Automatisch (K-2026-00001)'))}" readonly /></label>
      <label class="ckp-firmen-neu-field"><span>Alt-Nummer</span><input type="text" data-ccw-kunde-altnummer value="${esc(kv(k, 'altnummer'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Typ</span><select data-ccw-kunde-typ><option value="kunde"${typSel('kunde')}>Kunde</option><option value="partner"${typSel('partner')}>Partner</option><option value="lieferant"${typSel('lieferant')}>Lieferant</option><option value="haendler"${typSel('haendler')}>Händler</option></select></label>
      <label class="ckp-firmen-neu-field"><span>Intern/Extern</span><select data-ccw-kunde-intern-extern><option value="intern"${ieSel('intern')}>intern</option><option value="extern"${ieSel('extern')}>extern</option></select></label>
      <label class="ckp-firmen-neu-field"><span>Umsatzsteuer-ID</span><input type="text" data-ccw-kunde-ust value="${esc(kv(k, 'umsatzsteuer_id'))}" /></label>
    </div>
  </section>
  <section class="ckp-firmen-neu-section">
    <h4 class="ckp-firmen-neu-section-title">2 — Adresse</h4>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--four">
      <label class="ckp-firmen-neu-field ckp-firmen-neu-field--span-2"><span>Straße & Hausnummer <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-strasse value="${esc(kv(k, 'strasse'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>PLZ <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-plz value="${esc(kv(k, 'plz'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Stadt <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-stadt value="${esc(kv(k, 'stadt'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Bundesland</span><input type="text" data-ccw-kunde-bundesland value="${esc(kv(k, 'bundesland'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Land</span><input type="text" data-ccw-kunde-land value="${esc(kv(k, 'land', 'Deutschland'))}" /></label>
    </div>
  </section>
  <section class="ckp-firmen-neu-section">
    <h4 class="ckp-firmen-neu-section-title">3 — Kontaktdaten</h4>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
      <label class="ckp-firmen-neu-field"><span>Telefon Zentrale</span><input type="text" data-ccw-kunde-telefon value="${esc(kv(k, 'telefon'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Fax</span><input type="text" data-ccw-kunde-fax value="${esc(kv(k, 'fax'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>E-Mail allgemein <span class="ckp-firmen-neu-required">*</span></span><input type="email" data-ccw-kunde-email value="${esc(kv(k, 'email'))}" /></label>
      <label class="ckp-firmen-neu-field ckp-firmen-neu-field--span-2"><span>Website</span><input type="text" data-ccw-kunde-website value="${esc(kv(k, 'website'))}" /></label>
    </div>
  </section>
  <section class="ckp-firmen-neu-section">
    <h4 class="ckp-firmen-neu-section-title">4 — Hauptansprechpartner</h4>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--three">
      <label class="ckp-firmen-neu-field"><span>Anrede</span><select data-ccw-kunde-ap-anrede><option value="Herr"${anSel('Herr')}>Herr</option><option value="Frau"${anSel('Frau')}>Frau</option><option value="Divers"${anSel('Divers')}>Divers</option></select></label>
      <label class="ckp-firmen-neu-field"><span>Vorname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-ap-vorname value="${esc(kv(k, 'ansprechpartner_vorname'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Nachname <span class="ckp-firmen-neu-required">*</span></span><input type="text" data-ccw-kunde-ap-nachname value="${esc(kv(k, 'ansprechpartner_nachname'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Position</span><input type="text" data-ccw-kunde-ap-position value="${esc(kv(k, 'haupt_position'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Abteilung</span><input type="text" data-ccw-kunde-ap-abteilung value="${esc(kv(k, 'haupt_abteilung'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>E-Mail direkt <span class="ckp-firmen-neu-required">*</span></span><input type="email" data-ccw-kunde-ap-email value="${esc(kv(k, 'ansprechpartner_email'))}" /></label>
      <label class="ckp-firmen-neu-field ckp-firmen-neu-field--span-2"><span>Mobil / Telefon direkt</span><input type="text" data-ccw-kunde-ap-telefon value="${esc(kv(k, 'ansprechpartner_telefon'))}" /></label>
    </div>
  </section>
  <section class="ckp-firmen-neu-section" data-ccw-kunde-weitere-wrap>
    <h4 class="ckp-firmen-neu-section-title">5 — Weitere Ansprechpartner</h4>
    <div data-ccw-kunde-weitere-list>${weitereHtml}</div>
    <p style="margin:8px 0 0;"><button type="button" class="ccds-btn-primary" style="background:#64748b;font-size:13px;padding:6px 12px;" data-ccw-kunde-weitere-add>+ hinzufügen</button></p>
    <template data-ccw-kunde-weitere-template>${renderWeitereRowHtml({}, 0)}</template>
  </section>
  ${
    showFusa
      ? `<section class="ckp-firmen-neu-section" data-ccw-kunde-fusa-block>
    <h4 class="ckp-firmen-neu-section-title">6 — FUSA-Felder</h4>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--two">
      <label class="ckp-firmen-neu-field"><span>Segment</span><input type="text" data-ccw-kunde-fusa-segment value="${esc(kv(k, 'fusa_segment'))}" /></label>
      <label class="ckp-firmen-neu-field"><span>Hinweis</span><input type="text" data-ccw-kunde-fusa-hinweis value="${esc(kv(k, 'fusa_hinweis'))}" /></label>
    </div>
  </section>`
      : `<section class="ckp-firmen-neu-section" data-ccw-kunde-fusa-block hidden aria-hidden="true"></section>`
  }
  ${
    showCci
      ? `<section class="ckp-firmen-neu-section" data-ccw-kunde-ccintern-block>
    <h4 class="ckp-firmen-neu-section-title">${showFusa ? '7' : '6'} — CC Intern (Zusatz)</h4>
    <p class="ckp-mock-note" style="font-size:11px;margin:0 0 8px;">Quelle: <code>ccintern_kunden_extra</code> — zentrale Firmen-ID.</p>
    <div class="ckp-firmen-neu-grid ckp-firmen-neu-grid--two">
      <label class="ckp-firmen-neu-field"><span>CRM-Status</span><input type="text" data-ccw-kunde-ccintern-crm value="${esc(kv(k, 'ccintern_crm_status'))}" ${cciRo} /></label>
      <label class="ckp-firmen-neu-field"><span>Betreuer</span><input type="text" data-ccw-kunde-ccintern-betreuer value="${esc(kv(k, 'ccintern_betreuer'))}" ${cciRo} /></label>
    </div>
  </section>`
      : ''
  }
  ${
    showNotiz
      ? `<section class="ckp-firmen-neu-section">
    <h4 class="ckp-firmen-neu-section-title">${showFusa ? (showCci ? '8' : '7') : showCci ? '7' : '6'} — Interne Notiz</h4>
    <label class="ckp-firmen-neu-field"><span>Interne Notiz</span><textarea data-ccw-kunde-notiz rows="4">${esc(kv(k, 'interne_notiz'))}</textarea></label>
  </section>`
      : ''
  }
  <p class="ckp-api-error" data-ccw-kunde-stamm-msg hidden role="alert"></p>
  <div class="ckp-firmen-neu-footer" style="margin-top:12px;">
    <button type="submit" class="ccds-btn-primary" data-ccw-kunde-stamm-submit>Speichern</button>
  </div>
</form>`;
}

/**
 * @param {HTMLFormElement} form
 * @param {{ includeFusa: boolean }} [opts]
 * @returns {object}
 */
export function collectKundeStammPayload(form, opts = {}) {
  const q = sel => form.querySelector(sel);
  const val = sel => {
    const el = q(sel);
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
      ? String(el.value || '').trim()
      : '';
  };
  const weitere = [];
  form.querySelectorAll('[data-ccw-kunde-weitere-item]').forEach((wrap, idx) => {
    if (!(wrap instanceof HTMLElement)) return;
    const w = s => {
      const el = wrap.querySelector(s);
      return el instanceof HTMLInputElement || el instanceof HTMLSelectElement
        ? String(el.value || '').trim()
        : '';
    };
    const row = {
      anrede: w('[data-ccw-kunde-w-anrede]'),
      vorname: w('[data-ccw-kunde-w-vorname]'),
      nachname: w('[data-ccw-kunde-w-nachname]'),
      position: w('[data-ccw-kunde-w-position]'),
      abteilung: w('[data-ccw-kunde-w-abteilung]'),
      email: w('[data-ccw-kunde-w-email]'),
      mobil: w('[data-ccw-kunde-w-mobil]'),
    };
    const nonempty =
      row.vorname ||
      row.nachname ||
      row.email ||
      row.mobil ||
      row.position ||
      row.abteilung;
    if (nonempty) weitere.push(row);
    wrap.setAttribute('data-ccw-kunde-weitere-item', String(idx));
  });
  const body = {
    name: val('[data-ccw-kunde-name]'),
    altnummer: val('[data-ccw-kunde-altnummer]'),
    typ: val('[data-ccw-kunde-typ]'),
    intern_extern: val('[data-ccw-kunde-intern-extern]'),
    umsatzsteuer_id: val('[data-ccw-kunde-ust]'),
    strasse: val('[data-ccw-kunde-strasse]'),
    plz: val('[data-ccw-kunde-plz]'),
    stadt: val('[data-ccw-kunde-stadt]'),
    bundesland: val('[data-ccw-kunde-bundesland]'),
    land: val('[data-ccw-kunde-land]') || 'Deutschland',
    telefon: val('[data-ccw-kunde-telefon]'),
    fax: val('[data-ccw-kunde-fax]'),
    email: val('[data-ccw-kunde-email]'),
    website: val('[data-ccw-kunde-website]'),
    ansprechpartner_anrede: val('[data-ccw-kunde-ap-anrede]'),
    ansprechpartner_vorname: val('[data-ccw-kunde-ap-vorname]'),
    ansprechpartner_nachname: val('[data-ccw-kunde-ap-nachname]'),
    haupt_position: val('[data-ccw-kunde-ap-position]'),
    haupt_abteilung: val('[data-ccw-kunde-ap-abteilung]'),
    ansprechpartner_email: val('[data-ccw-kunde-ap-email]'),
    ansprechpartner_telefon: val('[data-ccw-kunde-ap-telefon]'),
    weitere_ansprechpartner: weitere,
  };
  const notizEl = q('[data-ccw-kunde-notiz]');
  if (notizEl instanceof HTMLTextAreaElement) {
    body.interne_notiz = String(notizEl.value || '').trim();
  }
  if (opts.includeFusa) {
    body.fusa_segment = val('[data-ccw-kunde-fusa-segment]');
    body.fusa_hinweis = val('[data-ccw-kunde-fusa-hinweis]');
  }
  if (opts.includeCcintern) {
    body.ccintern_crm_status = val('[data-ccw-kunde-ccintern-crm]');
    body.ccintern_betreuer = val('[data-ccw-kunde-ccintern-betreuer]');
  }
  return body;
}

/**
 * @param {HTMLElement} formRoot Form oder umschließendes Element mit Form darin
 */
export function initKundeWeitereAnsprechpartnerUi(formRoot) {
  const form =
    formRoot instanceof HTMLFormElement
      ? formRoot
      : formRoot.querySelector('[data-ccw-kunde-stamm-form]');
  if (!(form instanceof HTMLFormElement)) return;
  const list = form.querySelector('[data-ccw-kunde-weitere-list]');
  const tpl = form.querySelector('[data-ccw-kunde-weitere-template]');
  const addBtn = form.querySelector('[data-ccw-kunde-weitere-add]');
  if (!(list instanceof HTMLElement) || !(tpl instanceof HTMLTemplateElement) || !(addBtn instanceof HTMLButtonElement))
    return;
  const renumber = () => {
    list.querySelectorAll('[data-ccw-kunde-weitere-item]').forEach((el, i) => {
      if (el instanceof HTMLElement) el.setAttribute('data-ccw-kunde-weitere-item', String(i));
    });
  };
  addBtn.addEventListener('click', () => {
    const frag = tpl.content.cloneNode(true);
    const first = frag.firstElementChild;
    if (first instanceof HTMLElement) {
      const n = list.querySelectorAll('[data-ccw-kunde-weitere-item]').length;
      first.setAttribute('data-ccw-kunde-weitere-item', String(n));
      list.appendChild(first);
      renumber();
    }
  });
}

/**
 * @param {HTMLFormElement} form
 * @param {{ onSuccess?: () => void, onError?: (msg: string) => void }} [cb]
 */
export async function submitKundeStammForm(form, cb = {}) {
  const hid = form.querySelector('[data-ccw-kunde-stamm-id]');
  const id = hid instanceof HTMLInputElement ? String(hid.value || '').trim() : '';
  const includeFusa = !!form.querySelector('[data-ccw-kunde-fusa-segment]');
  const cciCrm = form.querySelector('[data-ccw-kunde-ccintern-crm]');
  const includeCcintern =
    cciCrm instanceof HTMLInputElement &&
    !cciCrm.readOnly &&
    !!form.querySelector('[data-ccw-kunde-ccintern-block]');
  const body = collectKundeStammPayload(form, { includeFusa, includeCcintern });
  const msg = form.querySelector('[data-ccw-kunde-stamm-msg]');
  const setErr = t => {
    if (msg instanceof HTMLElement) {
      msg.textContent = t;
      msg.hidden = !t;
    }
    if (t && cb.onError) cb.onError(t);
  };
  setErr('');
  try {
    /** @type {string} */
    let firmaId = id;
    if (id) {
      await apiFetch(`${API_ROUTES.cockpit.firmen}/${encodeURIComponent(id)}`, { method: 'PATCH', body });
    } else {
      const created = await apiFetch(API_ROUTES.cockpit.firmen, { method: 'POST', body });
      const nid =
        created && typeof created === 'object' && created.firma && created.firma.id != null
          ? String(created.firma.id).trim()
          : '';
      firmaId = nid;
    }
    if (includeCcintern && firmaId) {
      await apiFetch(`${API_ROUTES.ccintern.kunden}/${encodeURIComponent(firmaId)}`, {
        method: 'PATCH',
        body: {
          crm_status: body.ccintern_crm_status,
          betreuer: body.ccintern_betreuer,
        },
      });
    }
    await refreshFirmenStammFromApi();
    if (cb.onSuccess) await cb.onSuccess();
  } catch (e) {
    setErr(formatApiErrorForUi(e));
  }
}
