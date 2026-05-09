/**
 * FUSA Rechnungen — API → View-Modell (`GET /api/v1/fusa/rechnungen` + Kontext aus Aufträgen/Firmen).
 */
import { getRechnungStatusUi, normalizeRechnungStatus } from './fusa-rechnung-ui-status.js';

/**
 * @param {unknown} v
 * @returns {number|null}
 */
function parseAmount(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {string|undefined|null} s
 * @returns {string}
 */
export function formatDateDe(s) {
  if (s == null || String(s).trim() === '') return '—';
  const raw = String(s).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const [, y, m, d] = iso;
    return `${d}.${m}.${y}`;
  }
  const t = Date.parse(raw);
  if (!Number.isNaN(t)) {
    const dt = new Date(t);
    const dd = String(dt.getDate()).padStart(2, '0');
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const yy = dt.getFullYear();
    return `${dd}.${mm}.${yy}`;
  }
  return raw;
}

/**
 * @param {number|null|undefined} amount
 * @returns {string}
 */
export function formatEuroDe(amount) {
  if (amount == null || !Number.isFinite(Number(amount))) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(amount));
}

/**
 * @param {string|undefined|null} von
 * @param {string|undefined|null} bis
 * @param {string|undefined|null} faellig
 * @param {string|undefined|null} created
 * @returns {string} Komma-separierte Jahreszahlen für Filter
 */
/** Alt `re-art` / templates.js Abrechnungsart-Werte. */
export const FUSA_RE_ABRECHNUNGSART_KEYS = /** @type {const} */ ([
  'quartal',
  'monatlich',
  'einmalig',
  'jaehrlich',
]);

/**
 * @param {string} key
 */
export function abrechnungsartLabelDe(key) {
  const k = key != null ? String(key).trim().toLowerCase() : '';
  const m = /** @type {Record<string, string>} */ ({
    quartal: 'Quartalsweise',
    monatlich: 'Monatlich',
    einmalig: 'Einmalig',
    jaehrlich: 'Jährlich',
  });
  return m[k] || (k ? k : '—');
}

/**
 * @param {unknown} apiRow
 * @returns {Record<string, unknown>}
 */
export function parseRechnungExtraJson(apiRow) {
  const row = apiRow && typeof apiRow === 'object' ? apiRow : {};
  try {
    const ej = row.extra_json != null ? String(row.extra_json).trim() : '';
    if (!ej) return {};
    const o = JSON.parse(ej);
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * Nächste `re-NNNN`-Nummer wie Alt (`padStart(4,'0')`), basierend auf bestehenden Anzeige-IDs.
 * @param {Iterable<string|undefined|null>} candidates — original_id oder id
 */
export function computeNextReOriginalId(candidates) {
  let max = 0;
  for (const c of candidates) {
    const s = c != null ? String(c).trim() : '';
    const m = /^re-(\d{1,6})$/i.exec(s);
    if (m) max = Math.max(max, Number.parseInt(m[1], 10) || 0);
  }
  const n = max + 1;
  return `re-${String(n).padStart(4, '0')}`;
}

/**
 * MwSt.-Betrag im Alt-Angebots-Bestätigungsdialog: fix 19 % auf Netto (`rechnungen.js`).
 * @param {number|null|undefined} netto
 */
export function mwstBetragAngebotConfirmBlock(netto) {
  const n = netto != null && Number.isFinite(Number(netto)) ? Number(netto) : 0;
  return n * 0.19;
}

export function extractYearHaystack(von, bis, faellig, created) {
  /** @type {Set<string>} */
  const ys = new Set();
  for (const src of [von, bis, faellig, created]) {
    if (src == null || String(src).trim() === '') continue;
    const s = String(src).trim();
    const m = s.match(/^(\d{4})/);
    if (m) ys.add(m[1]);
    else {
      const t = Date.parse(s);
      if (!Number.isNaN(t)) ys.add(String(new Date(t).getFullYear()));
    }
  }
  return [...ys].sort().join(',');
}

/**
 * @param {object} apiRow — Zeile aus `GET /api/v1/fusa/rechnungen`
 * @param {{
 *   projectId: string;
 *   auftragById: Map<string, { title?: string|null; kunde_name?: string|null; project_id?: string|null }>;
 *   firmaNameById: Map<string, string>;
 * }} ctx
 */
export function mapRechnungApiToViewModel(apiRow, ctx) {
  const row = apiRow && typeof apiRow === 'object' ? apiRow : {};
  const id = row.id != null ? String(row.id) : '';
  const originalId = row.original_id != null ? String(row.original_id) : '';
  const rechnungsnummer = originalId || id || '—';
  const auftragId = row.auftrag_id != null ? String(row.auftrag_id).trim() : '';
  const auftragRec = auftragId && ctx.auftragById.has(auftragId) ? ctx.auftragById.get(auftragId) : null;
  const auftragTitle =
    auftragRec && auftragRec.title != null && String(auftragRec.title).trim() !== ''
      ? String(auftragRec.title).trim()
      : auftragId || '—';
  const kundeFromAuftrag =
    auftragRec && auftragRec.kunde_name != null && String(auftragRec.kunde_name).trim() !== ''
      ? String(auftragRec.kunde_name).trim()
      : '';
  const kundeId = row.kunde_id != null ? String(row.kunde_id).trim() : '';
  const kundeFromFirma = kundeId && ctx.firmaNameById.has(kundeId) ? String(ctx.firmaNameById.get(kundeId)) : '';
  const kunde = kundeFromAuftrag || kundeFromFirma || '—';

  const netto = parseAmount(row.netto);
  const brutto = parseAmount(row.brutto);
  let mwstPct = parseAmount(row.mwst);
  if (mwstPct != null && mwstPct > 0 && mwstPct <= 1) mwstPct = mwstPct * 100;
  if (mwstPct == null || !Number.isFinite(mwstPct)) mwstPct = 19;
  let mwstBetrag = null;
  if (netto != null && brutto != null) mwstBetrag = brutto - netto;
  else if (netto != null && Number.isFinite(mwstPct)) mwstBetrag = netto * (mwstPct / 100);

  const vonRaw = row.von != null ? String(row.von) : '';
  const bisRaw = row.bis != null ? String(row.bis) : '';
  const vonDisp = formatDateDe(vonRaw);
  const bisDisp = formatDateDe(bisRaw);
  const faelligRaw = row.faellig_am != null ? String(row.faellig_am) : '';
  const faelligDisp = formatDateDe(faelligRaw);
  const createdRaw = row.created_at != null ? String(row.created_at) : '';
  const erstelltDisp = formatDateDe(createdRaw);

  const statusCanon = normalizeRechnungStatus(row.status);
  const { label: statusLabel, badgeSuffix: statusBadgeSuffix } = getRechnungStatusUi(statusCanon);

  const notiz = row.notiz != null && String(row.notiz).trim() !== '' ? String(row.notiz).trim() : '';

  const pdfRaw = row.pdf_url != null ? String(row.pdf_url).trim() : '';
  const dlRaw = row.download_url != null ? String(row.download_url).trim() : '';
  const pdfUrl = /^https?:\/\//i.test(pdfRaw) ? pdfRaw : '';
  const downloadUrl = /^https?:\/\//i.test(dlRaw) ? dlRaw : pdfUrl;

  const bezahltRaw = row.bezahlt_am != null ? String(row.bezahlt_am) : '';
  const bezahltDisp = formatDateDe(bezahltRaw);

  const quartal = row.quartal != null && String(row.quartal).trim() !== '' ? String(row.quartal).trim() : '';

  const extra = parseRechnungExtraJson(row);
  const abrechnungsart =
    extra.abrechnungsart != null
      ? String(extra.abrechnungsart).trim()
      : extra.art != null
        ? String(extra.art).trim()
        : '';
  const abrechnungsart_display = abrechnungsart ? abrechnungsartLabelDe(abrechnungsart) : '—';

  /** @type {unknown[]} */
  const positionen = Array.isArray(extra.positionen) ? extra.positionen : [];
  const total_cc =
    extra.totalCC != null
      ? Number(extra.totalCC)
      : extra.total_cc != null
        ? Number(extra.total_cc)
        : null;
  const total_partner =
    extra.totalPartner != null
      ? Number(extra.totalPartner)
      : extra.total_partner != null
        ? Number(extra.total_partner)
        : null;
  const laufzeit_monate =
    extra.laufzeit != null
      ? String(extra.laufzeit).trim()
      : extra.laufzeit_monate != null
        ? String(extra.laufzeit_monate).trim()
        : '';
  const adresse = extra.adresse != null ? String(extra.adresse).trim() : '';
  const entwurf = Boolean(extra.entwurf);

  const searchHaystack = [
    rechnungsnummer,
    id,
    auftragTitle,
    kunde,
    adresse,
    notiz,
    quartal,
    statusLabel,
    String(row.status || ''),
  ]
    .join(' ')
    .toLowerCase();

  const yearHaystack = extractYearHaystack(vonRaw, bisRaw, faelligRaw, createdRaw);

  return {
    id,
    rechnungsnummer,
    kunde,
    kunde_id: kundeId,
    auftrag: auftragTitle,
    auftrag_id: auftragId,
    projekt_id: ctx.projectId,
    betrag_netto: netto,
    betrag_brutto: brutto,
    mwst_pct: mwstPct,
    mwst_betrag: mwstBetrag,
    status_raw: row.status != null ? String(row.status) : '',
    status_canon: statusCanon,
    status_label: statusLabel,
    status_badge_suffix: statusBadgeSuffix,
    faelligkeit: faelligDisp,
    faellig_raw: faelligRaw,
    erstellt_am: erstelltDisp,
    erstellt_raw: createdRaw,
    bezahlt_am: bezahltDisp,
    von_display: vonDisp,
    bis_display: bisDisp,
    von_raw: vonRaw,
    bis_raw: bisRaw,
    notiz,
    quartal,
    pdf_url: pdfUrl,
    download_url: downloadUrl,
    searchHaystack,
    yearHaystack,
    abrechnungsart_display,
    abrechnungsart,
    positionen,
    total_cc: Number.isFinite(total_cc) ? total_cc : null,
    total_partner: Number.isFinite(total_partner) ? total_partner : null,
    laufzeit_monate,
    adresse,
    entwurf,
    mwst_foot_angebot_confirm: mwstBetragAngebotConfirmBlock(netto),
    extra_json_raw: row.extra_json != null ? String(row.extra_json) : '',
  };
}

/**
 * Kompakte Payload für `data-*`-Transport (Liste → Dialoge).
 * @param {ReturnType<typeof mapRechnungApiToViewModel>} vm
 */
export function rechnungVmToRowPayload(vm) {
  return {
    id: vm.id,
    rechnungsnummer: vm.rechnungsnummer,
    kunde: vm.kunde,
    kunde_id: vm.kunde_id,
    auftrag: vm.auftrag,
    auftrag_id: vm.auftrag_id,
    von_raw: vm.von_raw,
    bis_raw: vm.bis_raw,
    faellig_raw: vm.faellig_raw,
    betrag_netto: vm.betrag_netto,
    betrag_brutto: vm.betrag_brutto,
    mwst_pct: vm.mwst_pct,
    mwst_betrag: vm.mwst_betrag,
    status_raw: vm.status_raw,
    status_canon: vm.status_canon,
    notiz: vm.notiz,
    quartal: vm.quartal,
    abrechnungsart: vm.abrechnungsart,
    positionen: vm.positionen,
    total_cc: vm.total_cc,
    total_partner: vm.total_partner,
    laufzeit_monate: vm.laufzeit_monate,
    adresse: vm.adresse,
    entwurf: vm.entwurf,
  };
}

/**
 * KPI aus echten Zeilen (keine Demo-Werte).
 * @param {ReturnType<typeof mapRechnungApiToViewModel>[]} vms
 */
export function aggregateRechnungKpis(vms) {
  const list = Array.isArray(vms) ? vms : [];
  const brutto = /** @param {ReturnType<typeof mapRechnungApiToViewModel>} vm */ vm =>
    vm.betrag_brutto != null && Number.isFinite(vm.betrag_brutto) ? vm.betrag_brutto : 0;

  const ue = list.filter(vm => vm.status_canon === 'ueberfaellig');
  const offen = list.filter(vm => vm.status_canon === 'erstellt' || vm.status_canon === 'versendet');
  const geplant = list.filter(vm => vm.status_canon === 'geplant' || vm.status_canon === 'angebot');
  const bez = list.filter(vm => vm.status_canon === 'bezahlt');

  return {
    ueberfaellig: { sum: ue.reduce((a, vm) => a + brutto(vm), 0), count: ue.length },
    offen: { sum: offen.reduce((a, vm) => a + brutto(vm), 0), count: offen.length },
    geplant: { sum: geplant.reduce((a, vm) => a + brutto(vm), 0), count: geplant.length },
    bezahlt: { sum: bez.reduce((a, vm) => a + brutto(vm), 0), count: bez.length },
  };
}
