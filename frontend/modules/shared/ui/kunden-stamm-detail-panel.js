/**
 * Nur Darstellung: zentrales Kunden-Detail-Objekt (`detail` aus GET /api/v1/stammdaten/kunden/:id).
 */

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {unknown} v
 * @returns {boolean}
 */
function hasText(v) {
  return v != null && String(v).trim() !== '';
}

/**
 * @param {string} label
 * @param {unknown} val
 * @returns {string}
 */
function row(label, val) {
  if (!hasText(val)) return '';
  return `<div class="ckp-kunden-detail-row"><span class="ckp-kunden-detail-k">${esc(label)}</span><span class="ckp-kunden-detail-v">${esc(String(val).trim())}</span></div>`;
}

/**
 * @param {object|null|undefined} detail
 * @param {{ variant: 'fusa'|'ccintern'|'cockpit' }} opts
 * @returns {string}
 */
export function renderKundenStammDetailReadonlyHtml(detail, opts) {
  const variant = opts?.variant === 'fusa' || opts?.variant === 'ccintern' ? opts.variant : 'cockpit';
  const d = detail && typeof detail === 'object' ? detail : {};
  const stamm = d.stamm && typeof d.stamm === 'object' ? d.stamm : {};
  const ez = d.erweiterung_zusatz && typeof d.erweiterung_zusatz === 'object' ? d.erweiterung_zusatz : {};
  const fusa = d.fusa_extra && typeof d.fusa_extra === 'object' ? d.fusa_extra : {};
  const cci = d.ccintern_extra && typeof d.ccintern_extra === 'object' ? d.ccintern_extra : {};
  const acts = Array.isArray(d.aktivitaeten) ? d.aktivitaeten : [];

  const stammBits = [
    row('Name', stamm.name),
    row('Kundennummer', stamm.kundennummer),
    row('Alt-Nummer', stamm.altnummer),
    row('Typ', stamm.typ),
    row('Intern/Extern', stamm.intern_extern),
    row('Status', stamm.status),
    row('Straße', stamm.strasse),
    row('PLZ / Ort', [stamm.plz, stamm.stadt].filter(hasText).join(' ')),
    row('Telefon', stamm.telefon),
    row('E-Mail', stamm.email),
    row('Ansprechpartner', [stamm.ansprechpartner_anrede, stamm.ansprechpartner_nachname].filter(hasText).join(' ')),
  ]
    .filter(Boolean)
    .join('');

  const zusatzKeys = Object.keys(ez);
  const zusatzBits = zusatzKeys
    .map(k => row(k.replace(/_/g, ' '), ez[k]))
    .filter(Boolean)
    .join('');

  let fusaBlock = '';
  if (variant === 'fusa' || variant === 'cockpit') {
    const inner = [row('Segment', fusa.segment), row('Hinweis', fusa.hinweis)].filter(Boolean).join('');
    fusaBlock = inner
      ? `<section class="ckp-kunden-detail-block" data-ccw-kunden-detail-fusa>
  <h4 class="ckp-kunden-detail-block-title">FUSA</h4>
  <div class="ckp-kunden-detail-grid">${inner}</div>
</section>`
      : '';
  }

  let cciBlock = '';
  if (variant === 'ccintern' || variant === 'cockpit') {
    const inner = [
      row('CRM-Status', cci.crm_status),
      row('Betreuer', cci.betreuer),
      row('Stand Zusatzdaten', cci.updated_at),
    ]
      .filter(Boolean)
      .join('');
    cciBlock = inner
      ? `<section class="ckp-kunden-detail-block" data-ccw-kunden-detail-ccintern>
  <h4 class="ckp-kunden-detail-block-title">CC Intern</h4>
  <div class="ckp-kunden-detail-grid">${inner}</div>
</section>`
      : '';
  }

  const crmHint =
    acts.length === 0
      ? `<p class="ckp-mock-note ckp-kunden-detail-crm-hint" style="font-size:12px;margin:8px 0 0;">Aktivitäten: zentral für spätere <code>crm_aktivitaeten</code> vorgesehen — derzeit keine Einträge.</p>`
      : '';

  return `<div class="ckp-kunden-detail-readonly" data-ccw-kunden-detail-panel>
  <section class="ckp-kunden-detail-block">
    <h4 class="ckp-kunden-detail-block-title">Stammdaten</h4>
    <div class="ckp-kunden-detail-grid">${stammBits || '<p class="ckp-mock-note">Keine Stammdaten.</p>'}</div>
  </section>
  ${
    zusatzBits
      ? `<section class="ckp-kunden-detail-block">
    <h4 class="ckp-kunden-detail-block-title">Erweiterung</h4>
    <div class="ckp-kunden-detail-grid">${zusatzBits}</div>
  </section>`
      : ''
  }
  ${fusaBlock}
  ${cciBlock}
  ${crmHint}
</div>`;
}
