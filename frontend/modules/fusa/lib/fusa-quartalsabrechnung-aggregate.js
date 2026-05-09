/**
 * **ALT-QUELLE (verbindlich):** `c:\Users\CC\Desktop\FUSA_CLEAN - Code\DEV\`
 * (Referenz-UI: `js/modules/fusa/views/templates.js` #pg-quartale, Leiste/Infobox; Bedienlogik an Alt angelehnt.)
 *
 * **Regel:** Quartalsgruppen, Summen, Status, Sortierung und Filter **`abrechnungsart === 'quartal'`** ausschließlich
 * aus **Rechnungs-API-Zeilen** — nie aus Aufträgen berechnet.
 *
 * **Aufträge:** nur ergänzend → Menge der `auftrag_id`, die zum gewählten Cockpit-Projekt gehören (Projektfilter auf Rechnungen).
 * **Firmen:** nur Namensauflösung `kunde_id` → Anzeigename.
 *
 * Quartal wird nicht persistiert; Schlüssel = Kalenderjahr + berechnetes Quartal (`rechnungsdatum` oder `von`).
 */
import { normalizeRechnungStatus } from './fusa-rechnung-ui-status.js';
import { formatDateDe, parseRechnungExtraJson } from './fusa-rechnung-view-model.js';
import { exportQuartalMatchesFilter } from './fusa-quartal-ui-status.js';

/**
 * @param {string|Date|number} date
 * @returns {'Q1'|'Q2'|'Q3'|'Q4'}
 */
export function getQuartal(date) {
  const m = new Date(date).getMonth() + 1;
  if (m <= 3) return 'Q1';
  if (m <= 6) return 'Q2';
  if (m <= 9) return 'Q3';
  return 'Q4';
}

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
 * @param {unknown} row
 * @returns {Date|null}
 */
export function getQuartalZuordnungsDatum(row) {
  const r = row && typeof row === 'object' ? /** @type {Record<string, unknown>} */ (row) : {};
  const rd = r.rechnungsdatum != null ? String(r.rechnungsdatum).trim() : '';
  const von = r.von != null ? String(r.von).trim() : '';
  const raw = rd || von;
  if (!raw) return null;
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) {
    const d = new Date(`${iso[1]}T12:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const t = Date.parse(raw);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * @param {unknown} row
 * @returns {string|null} z. B. "2026-Q1"
 */
export function getQuartalSchluesselFromRow(row) {
  const d = getQuartalZuordnungsDatum(row);
  if (!d) return null;
  const jahr = d.getFullYear();
  const q = getQuartal(d);
  return `${jahr}-${q}`;
}

/**
 * @param {string} key — "2026-Q1"
 * @returns {string} — "Q1 2026"
 */
export function formatQuartalLabel(key) {
  const m = String(key || '').match(/^(\d{4})-(Q[1-4])$/);
  if (!m) return String(key || '—');
  return `${m[2]} ${m[1]}`;
}

/**
 * Filter: `extra_json.abrechnungsart === 'quartal'` (keine zweite Datenquelle).
 * @param {unknown} row
 */
export function rowIstQuartalsabrechnung(row) {
  const ex = parseRechnungExtraJson(row);
  const a = ex.abrechnungsart != null ? String(ex.abrechnungsart).trim().toLowerCase() : '';
  return a === 'quartal';
}

/**
 * Nur Projekt-Scoping: welche `auftrag_id` zum gewählten Projekt gehören (keine Quartalslogik).
 * @param {object[]} auftraegeAll
 * @param {string} projectId
 * @returns {Set<string>}
 */
export function buildProjectAuftragIdSet(auftraegeAll, projectId) {
  const pid = projectId != null ? String(projectId).trim() : '';
  return new Set(
    (Array.isArray(auftraegeAll) ? auftraegeAll : [])
      .filter(a => a && String(a.project_id || '') === pid && a.id != null)
      .map(a => String(a.id)),
  );
}

/**
 * @param {object[]} firmenRows — API `firmen`
 * @returns {Map<string, string>}
 */
export function buildFirmaNameMapFromFirmenRows(firmenRows) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const f of Array.isArray(firmenRows) ? firmenRows : []) {
    if (!f || f.id == null) continue;
    const nm = f.name != null && String(f.name).trim() !== '' ? String(f.name).trim() : String(f.id);
    m.set(String(f.id), nm);
  }
  return m;
}

/**
 * @param {object[]} rechnungenRaw
 * @param {Set<string>} projectAuftragIds
 */
export function filterRechnungenNachProjektauftraegen(rechnungenRaw, projectAuftragIds) {
  return (Array.isArray(rechnungenRaw) ? rechnungenRaw : []).filter(
    r =>
      r &&
      r.auftrag_id != null &&
      String(r.auftrag_id).trim() !== '' &&
      projectAuftragIds.has(String(r.auftrag_id)),
  );
}

/**
 * @param {object[]} rechnungen — bereits projektgefiltert
 */
export function filterNurQuartalsabrechnung(rechnungen) {
  return (Array.isArray(rechnungen) ? rechnungen : []).filter(r => rowIstQuartalsabrechnung(r));
}

/**
 * @param {object[]} rechnungen — nur `abrechnungsart === quartal'`, projektgefiltert
 * @returns {Record<string, object[]>}
 */
export function gruppiereRechnungenNachQuartalsschluessel(rechnungen) {
  /** @type {Record<string, object[]>} */
  const out = {};
  for (const r of rechnungen) {
    const k = getQuartalSchluesselFromRow(r);
    if (!k) continue;
    if (!out[k]) out[k] = [];
    out[k].push(r);
  }
  return out;
}

/**
 * @param {string[]} keys
 */
export function sortQuartalSchluesselAbsteigend(keys) {
  return [...keys].sort((a, b) => {
    const ma = a.match(/^(\d{4})-(Q[1-4])$/);
    const mb = b.match(/^(\d{4})-(Q[1-4])$/);
    if (ma && mb) {
      const ya = Number(ma[1]);
      const yb = Number(mb[1]);
      if (ya !== yb) return yb - ya;
      return Number(mb[2][1]) - Number(ma[2][1]);
    }
    return String(b).localeCompare(String(a));
  });
}

/**
 * @param {string} key
 * @param {object[]} rechnungen — API-Zeilen einer Gruppe
 */
export function aggregateQuartalsgruppe(key, rechnungen) {
  let nettoSumme = 0;
  let bruttoSumme = 0;
  const anzahl = rechnungen.length;
  let bezahlt = 0;
  for (const r of rechnungen) {
    if (!r || typeof r !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (r);
    const n = parseAmount(row.netto);
    const b = parseAmount(row.brutto);
    if (n != null && Number.isFinite(n)) nettoSumme += n;
    if (b != null && Number.isFinite(b)) bruttoSumme += b;
    if (normalizeRechnungStatus(row.status) === 'bezahlt') bezahlt += 1;
  }
  let status = 'offen';
  if (anzahl > 0 && bezahlt === anzahl) status = 'bezahlt';
  else if (bezahlt > 0 && bezahlt < anzahl) status = 'teilweise bezahlt';
  return { key, quartalLabel: formatQuartalLabel(key), nettoSumme, bruttoSumme, anzahl, status };
}

/**
 * Badge für aggregierten Gruppenstatus (nur Darstellungs-Mapping, Wert kommt aus `aggregateQuartalsgruppe`).
 * @param {string} status
 */
export function quartalsAggregatStatusBadge(status) {
  const s = String(status || '');
  if (s === 'bezahlt') return { cls: 'bg', lbl: 'Bezahlt' };
  if (s === 'teilweise bezahlt') return { cls: 'ba', lbl: 'Teilweise bezahlt' };
  return { cls: 'bb', lbl: 'Offen' };
}

/**
 * @param {string[]} keysSorted
 * @param {number} curY
 */
export function buildExportJahreOptionen(keysSorted, curY) {
  /** @type {Set<number>} */
  const jahre = new Set([curY, curY + 1, curY - 1]);
  for (const k of keysSorted) {
    const m = k.match(/^(\d{4})-/);
    if (m) jahre.add(Number(m[1]));
  }
  return [...jahre].filter(y => y > 1900 && y < 2100).sort((a, b) => b - a);
}

/**
 * Einziger Einstieg: aus Roh-API → gruppiertes Fachmodell für die View (ohne HTML).
 * @param {{
 *   rechnungenRaw: object[];
 *   auftraegeAll: object[];
 *   projectId: string;
 *   firmenRows: object[];
 * }} p
 */
export function buildQuartalsabrechnungFachmodell(p) {
  const rechnungenRaw = Array.isArray(p.rechnungenRaw) ? p.rechnungenRaw : [];
  const auftraegeAll = Array.isArray(p.auftraegeAll) ? p.auftraegeAll : [];
  const firmenRows = Array.isArray(p.firmenRows) ? p.firmenRows : [];
  const projectId = p.projectId != null ? String(p.projectId) : '';

  const projectAuftragIds = buildProjectAuftragIdSet(auftraegeAll, projectId);
  const imProjekt = filterRechnungenNachProjektauftraegen(rechnungenRaw, projectAuftragIds);
  const quartalOnly = filterNurQuartalsabrechnung(imProjekt);
  const gruppen = gruppiereRechnungenNachQuartalsschluessel(quartalOnly);
  const keysSorted = sortQuartalSchluesselAbsteigend(Object.keys(gruppen));
  const summenZeilen = keysSorted.map(k => aggregateQuartalsgruppe(k, gruppen[k] || []));

  const firmaNameById = buildFirmaNameMapFromFirmenRows(firmenRows);
  const firmaNamesObj = Object.fromEntries(firmaNameById);

  const curY = new Date().getFullYear();
  const exportJahreSorted = buildExportJahreOptionen(keysSorted, curY);

  return {
    gruppen,
    summenZeilen,
    keysSorted,
    firmaNameById,
    firmaNamesObj,
    exportJahreSorted,
    curY,
  };
}

/**
 * CSV-Zeilen aus dem gespeicherten Fachmodell (Filter Jahr / Quartal-Label).
 * @param {{
 *   gruppen: Record<string, object[]>;
 *   summenZeilen: { key: string; quartalLabel: string }[];
 *   jahr: number;
 *   qOpt: string;
 *   firmaNameById: Map<string, string>;
 * }} p
 * @returns {{ rechnungsnummer: string; quartal: string; kunde: string; zeitraum: string; netto: number|null; brutto: number|null; status: string }[]}
 */
export function buildQuartalsCsvExportRows(p) {
  const gruppen = p.gruppen && typeof p.gruppen === 'object' ? p.gruppen : {};
  const summenZeilen = Array.isArray(p.summenZeilen) ? p.summenZeilen : [];
  const jahr = Number(p.jahr);
  const qOpt = p.qOpt != null ? String(p.qOpt).trim() : '';
  const firmaNameById = p.firmaNameById instanceof Map ? p.firmaNameById : new Map();
  const detailCtx = { firmaNameById };

  /** @type {{ rechnungsnummer: string; quartal: string; kunde: string; zeitraum: string; netto: number|null; brutto: number|null; status: string }[]} */
  const rows = [];
  for (const k of Object.keys(gruppen)) {
    const m = k.match(/^(\d{4})-(Q[1-4])$/);
    const y = m ? Number(m[1]) : 0;
    if (Number.isFinite(jahr) && y > 0 && y !== jahr) continue;
    const agg = summenZeilen.find(s => s && s.key === k);
    const lab = agg ? String(agg.quartalLabel) : k;
    if (!exportQuartalMatchesFilter(qOpt, lab)) continue;
    const list = gruppen[k] || [];
    for (const r of list) {
      const d = quartalsDetailZeileFromApiRow(r, detailCtx);
      rows.push({
        rechnungsnummer: d.rechnungsnummer,
        quartal: lab,
        kunde: d.kunde,
        zeitraum: d.zeitraum,
        netto: d.netto,
        brutto: d.brutto,
        status: d.statusLabel,
      });
    }
  }
  return rows;
}

/**
 * @param {unknown} row
 * @param {{ firmaNameById: Map<string, string> }} ctx
 */
export function quartalsDetailZeileFromApiRow(row, ctx) {
  const r = row && typeof row === 'object' ? /** @type {Record<string, unknown>} */ (row) : {};
  const id = r.id != null ? String(r.id) : '';
  const nr = r.original_id != null && String(r.original_id).trim() !== '' ? String(r.original_id).trim() : id || '—';
  const kid = r.kunde_id != null ? String(r.kunde_id).trim() : '';
  const kunde = kid && ctx.firmaNameById.has(kid) ? String(ctx.firmaNameById.get(kid)) : kid || '—';
  const von = formatDateDe(r.von != null ? String(r.von) : '');
  const bis = formatDateDe(r.bis != null ? String(r.bis) : '');
  const zeitraum = von !== '—' || bis !== '—' ? `${von} – ${bis}` : '—';
  const netto = parseAmount(r.netto);
  const brutto = parseAmount(r.brutto);
  const canon = normalizeRechnungStatus(r.status);
  const statusLabel =
    canon === 'bezahlt'
      ? 'Bezahlt'
      : canon === 'ueberfaellig'
        ? 'Überfällig'
        : canon === 'versendet'
          ? 'Versendet'
          : canon === 'erstellt'
            ? 'Erstellt'
            : canon === 'geplant'
              ? 'Geplant'
              : canon === 'angebot'
                ? 'Angebot'
                : r.status != null && String(r.status).trim()
                  ? String(r.status).trim()
                  : '—';
  return { id, rechnungsnummer: nr, kunde, zeitraum, netto, brutto, statusLabel, statusCanon: canon };
}
