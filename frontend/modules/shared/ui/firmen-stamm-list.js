/**
 * Gemeinsame Firmen-Stammliste (7 Spalten) — gleiche Darstellung wie Cockpit Firmen (ohne Benutzer/Projekte).
 * Daten: GET /api/v1/firmen → {@link buildNormalizedFirmenFromApi}.
 */

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
 * Erste Spalte: „K-2026-00015 – Firmenname“; optional zweite Zeile „Alt: …“.
 * @param {object} c normalisierte Zeile
 * @returns {string}
 */
export function renderFirmaKundePrimaryCellHtml(c) {
  const name = c.name != null && String(c.name).trim() !== '' ? String(c.name).trim() : '—';
  const kn =
    c.kundennummer != null && String(c.kundennummer).trim() !== '' && c.kundennummer !== '—'
      ? String(c.kundennummer).trim()
      : '';
  const alt =
    c.altnummer != null && String(c.altnummer).trim() !== '' && c.altnummer !== '—'
      ? String(c.altnummer).trim()
      : '';
  const line1 = kn ? `${esc(kn)} – ${esc(name)}` : esc(name);
  const line2 = alt
    ? `<div class="ckp-firma-alt-sub" style="font-size:11px;color:#64748b;margin-top:3px;">Alt: ${esc(
        alt,
      )}</div>`
    : '';
  return `<div class="ckp-firma-primary-cell"><div>${line1}</div>${line2}</div>`;
}

/**
 * @param {object} c normalisierte Zeile
 * @returns {string}
 */
export function firmaStammSearchHay(c) {
  const name = c.name != null ? String(c.name).trim() : '';
  const kn =
    c.kundennummer != null && String(c.kundennummer).trim() !== '' && c.kundennummer !== '—'
      ? String(c.kundennummer).trim()
      : '';
  const alt =
    c.altnummer != null && String(c.altnummer).trim() !== '' && c.altnummer !== '—'
      ? String(c.altnummer).trim()
      : '';
  return [name, kn, alt].join(' ').toLowerCase();
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
export function buildNormalizedFirmenFromApi(firmenArr) {
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
 * Primärschlüssel für DOM/API: immer echte `firmen.id` aus der API-Zeile, sonst stableKey.
 * @param {object} c normalisierte Zeile aus {@link buildNormalizedFirmenFromApi}
 * @returns {string}
 */
export function firmaListRowDomId(c) {
  const raw = c && c.raw && typeof c.raw === 'object' ? c.raw : null;
  if (raw && raw.id != null) {
    const s = String(raw.id).trim();
    if (s) return s;
  }
  return stableFirmaId(c);
}

/**
 * Zeilenobjekte für die Maske (Listen-Fallback); Detail lädt zentral per GET /api/v1/stammdaten/kunden/:id.
 * @param {object[]} normalizedList
 * @returns {Map<string, object>}
 */
export function buildFirmaDetailByListIdMap(normalizedList) {
  /** @type {Map<string, object>} */
  const m = new Map();
  const rows = Array.isArray(normalizedList) ? normalizedList : [];
  for (const c of rows) {
    const id = firmaListRowDomId(c);
    if (!id) continue;
    const raw = c.raw && typeof c.raw === 'object' ? { ...c.raw } : {};
    m.set(id, raw);
  }
  return m;
}

/**
 * @param {object[]} normalizedRows aus {@link buildNormalizedFirmenFromApi}
 * @param {{ emptyHint?: string }} [opts]
 * @returns {string}
 */
export function renderFirmenStammListTableHtml(normalizedRows, opts = {}) {
  const emptyHint = opts.emptyHint != null && String(opts.emptyHint).trim() !== '' ? String(opts.emptyHint).trim() : 'Keine Firmen.';
  const rows = Array.isArray(normalizedRows) ? normalizedRows : [];
  if (rows.length === 0) {
    return `<table class="ckp-table ckp-firmen-table">
  <thead>
    <tr>
      <th scope="col">Kunde</th>
      <th scope="col">Typ</th>
      <th scope="col">Intern/Extern</th>
      <th scope="col">Stadt</th>
      <th scope="col">Status</th>
    </tr>
  </thead>
  <tbody>
    <tr><td colspan="5" class="ckp-snapshot-ro-empty-cell">${esc(emptyHint)}</td></tr>
  </tbody>
</table>`;
  }
  const body = rows
    .map(c => {
      const id = firmaListRowDomId(c);
      const st =
        c.statusRaw != null && String(c.statusRaw).trim() !== ''
          ? String(c.statusRaw).trim()
          : '—';
      const hay = esc(firmaStammSearchHay(c));
      return `<tr class="ckp-firmen-row" tabindex="0" role="button" data-firma-id="${esc(id)}" data-ccw-row-id="${esc(id)}" data-firma-search-hay="${hay}" aria-label="Firma ${esc(c.name)}">
  <td>${renderFirmaKundePrimaryCellHtml(c)}</td>
  <td>${esc(c.typeLabel)}</td>
  <td>${esc(c.internExtern || '—')}</td>
  <td>${esc(c.stadt || '—')}</td>
  <td>${esc(st)}</td>
</tr>`;
    })
    .join('');
  return `<table class="ckp-table ckp-firmen-table">
  <thead>
    <tr>
      <th scope="col">Kunde</th>
      <th scope="col">Typ</th>
      <th scope="col">Intern/Extern</th>
      <th scope="col">Stadt</th>
      <th scope="col">Status</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
</table>`;
}

/**
 * @param {object[]} normalizedRows
 * @param {{ sectionTitle?: string, emptyHint?: string }} [opts]
 */
export function renderFirmenStammListSectionHtml(normalizedRows, opts = {}) {
  const title =
    opts.sectionTitle != null && String(opts.sectionTitle).trim() !== ''
      ? String(opts.sectionTitle).trim()
      : 'Firmen';
  return `<section class="ckp-snapshot-ro-section">
  <h3 class="ckp-snapshot-ro-section-title">${esc(title)}</h3>
  <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
    ${renderFirmenStammListTableHtml(normalizedRows, { emptyHint: opts.emptyHint })}
  </div>
</section>`;
}
