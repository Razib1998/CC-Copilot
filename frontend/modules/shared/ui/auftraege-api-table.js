/**
 * **Nur Tabellen-HTML-Helfer** (Fragmente) — **keine eigene View**, kein Routing, kein Mount.
 *
 * Produktive FUSA-Aufträge-UI: `renderFusaAuftraegeViewHtml` in `fusa-auftraege-view.js`, eingebunden
 * über `cockpit-shell.js` → `#cockpit-content` bei `activeView === 'fusa_auftraege'`.
 *
 * Auftragsliste (GET `/auftraege`-Shape) für FUSA-Tabellen — gleiche Tabellenklassen wie Cockpit,
 * Kunden-Spalte über {@link resolveAuftragKundenAnzeige}.
 */
import { resolveAuftragKundenAnzeige } from '../lib/firma-kunden-referenz.js';
import {
  resolveFusaAuftragUiStatus,
  fusaAuftragBadgeClassesForBucket,
} from '../../fusa/lib/fusa-auftrag-ui-status.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {object[]} auftraege
 * @param {Record<string, string>} projectNameById
 * @returns {Promise<string>}
 */
export async function renderApiAuftraegeTableInnerHtmlForStamm(auftraege, projectNameById) {
  const names = projectNameById && typeof projectNameById === 'object' ? projectNameById : {};
  const list = Array.isArray(auftraege) ? auftraege : [];
  if (list.length === 0) {
    return `<div class="ckp-snapshot-ro-wrap ckp-table-wrap">
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">ID</th>
            <th scope="col" class="ckp-snapshot-ro-th">Titel</th>
            <th scope="col" class="ckp-snapshot-ro-th">Projekt</th>
            <th scope="col" class="ckp-snapshot-ro-th">Kunde</th>
            <th scope="col" class="ckp-snapshot-ro-th">Termin</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
            <th scope="col" class="ckp-snapshot-ro-th">Erstellt</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="7" class="ckp-snapshot-ro-empty-cell">Keine Aufträge (API).</td></tr></tbody>
      </table>
    </div>`;
  }

  const rowHtmls = await Promise.all(
    list.map(async a => {
      const id = a.id != null ? String(a.id) : '—';
      const title = a.title != null && String(a.title).trim() !== '' ? String(a.title) : '—';
      const pid = a.project_id != null ? String(a.project_id) : '';
      const pname = pid && names[pid] ? names[pid] : pid || '—';
      const kunde = await resolveAuftragKundenAnzeige(a);
      const termin = a.termin != null && String(a.termin).trim() !== '' ? String(a.termin) : '—';
      const status = a.status != null && String(a.status).trim() !== '' ? String(a.status) : '—';
      const created =
        a.created_at != null && String(a.created_at).trim() !== '' ? String(a.created_at) : '—';
      return `<tr data-ccw-row-id="${esc(id)}">
              <td class="ckp-snapshot-ro-td">${esc(id)}</td>
              <td class="ckp-snapshot-ro-td">${esc(title)}</td>
              <td class="ckp-snapshot-ro-td">${esc(pname)}</td>
              <td class="ckp-snapshot-ro-td">${esc(kunde)}</td>
              <td class="ckp-snapshot-ro-td">${esc(termin)}</td>
              <td class="ckp-snapshot-ro-td">${esc(status)}</td>
              <td class="ckp-snapshot-ro-td">${esc(created)}</td>
            </tr>`;
    }),
  );

  return `<div class="ckp-snapshot-ro-wrap ckp-table-wrap">
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">ID</th>
            <th scope="col" class="ckp-snapshot-ro-th">Titel</th>
            <th scope="col" class="ckp-snapshot-ro-th">Projekt</th>
            <th scope="col" class="ckp-snapshot-ro-th">Kunde</th>
            <th scope="col" class="ckp-snapshot-ro-th">Termin</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
            <th scope="col" class="ckp-snapshot-ro-th">Erstellt</th>
          </tr>
        </thead>
        <tbody>${rowHtmls.join('')}</tbody>
      </table>
    </div>`;
}

/**
 * Tabellenliste für GET `/api/v1/fusa/auftraege` (FUSA-Migrationsfelder).
 * Zeilen: `data-fusa-auf-payload` (Detail), `data-fusa-auf-search-hay` / `data-fusa-auf-status` (Filter).
 *
 * @param {object[]} auftraege
 * @param {Record<string, string>} projectNameById
 * @returns {Promise<string>}
 */
/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseFusaExtraJsonQuick(raw) {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    return /** @type {Record<string, unknown>} */ (raw);
  }
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * FUSA-Auftragsliste mit Spalten/Struktur wie FUSA_UMZUG (`#pg-auftraege`); Filter-Attribut `data-fusa-umz-tab` via {@link resolveFusaAuftragUiStatus}.
 *
 * @param {object[]} auftraege
 * @param {Record<string, string>} projectNameById
 * @returns {Promise<string>}
 */
export async function renderFusaApiAuftraegeUmzugTableInnerHtml(auftraege, projectNameById) {
  const names = projectNameById && typeof projectNameById === 'object' ? projectNameById : {};
  const list = Array.isArray(auftraege) ? auftraege : [];
  if (list.length === 0) {
    return `<table>
        <thead><tr><th>Auftrag-Nr.</th><th>Kunde</th><th>Paket</th><th>Fahrzeug</th><th>Laufzeit</th><th>Abrechnung</th><th>Preis/Mon.</th><th>Status</th><th>Aktion</th></tr></thead>
        <tbody><tr><td colspan="9" style="padding:16px;text-align:center;color:var(--text2,#64748b);font-size:12px;">Keine Aufträge für die aktuelle Auswahl.</td></tr></tbody>
      </table>`;
  }

  /** Nur für Anzeige-Reihenfolge (ältere zuerst); ohne gültiges `created_at` ans Ende, dann stabil nach `id`. */
  const createdAtSortKey = row => {
    const raw = row?.created_at;
    if (raw == null || String(raw).trim() === '') return Number.POSITIVE_INFINITY;
    const t = Date.parse(String(raw));
    return Number.isFinite(t) ? t : Number.POSITIVE_INFINITY;
  };
  const sorted = [...list].sort((a, b) => {
    const ka = createdAtSortKey(a);
    const kb = createdAtSortKey(b);
    if (ka !== kb) return kb - ka;
    const ida = a?.id != null ? String(a.id) : '';
    const idb = b?.id != null ? String(b.id) : '';
    return ida.localeCompare(idb);
  });

  const abrLab = v => {
    const s = v != null ? String(v).trim() : '';
    const map = { monatlich: 'Monatlich', quartalsweise: 'Quartal', jaehrlich: 'Jahr' };
    return map[s] || (s || '—');
  };

  const rowHtmls = await Promise.all(
    sorted.map(async (a, index) => {
      const id = a.id != null ? String(a.id) : '—';
      const displayNr = `FUSA-${String(index + 1).padStart(5, '0')}`;
      const ex = parseFusaExtraJsonQuick(a.fusa_extra_json);
      const paket =
        ex.paket != null && String(ex.paket).trim() !== '' ? String(ex.paket).trim() : '—';
      const kundeRow = { ...(a && typeof a === 'object' ? a : {}), firma_id: a.fusa_kunde_id ?? a.firma_id };
      const apiKunde = a.kunde_name != null && String(a.kunde_name).trim() !== '' ? String(a.kunde_name).trim() : '';
      const kunde = apiKunde || (await resolveAuftragKundenAnzeige(kundeRow));
      const apiFz =
        a.fahrzeug_kurztext != null && String(a.fahrzeug_kurztext).trim() !== ''
          ? String(a.fahrzeug_kurztext).trim()
          : '';
      const fzDisp = apiFz || formatFusaFahrzeugIdsShort(a.fusa_fahrzeug_ids);
      const termin = a.termin != null && String(a.termin).trim() !== '' ? String(a.termin).trim() : '';
      const terminEnde =
        a.termin_ende != null && String(a.termin_ende).trim() !== '' ? String(a.termin_ende).trim() : '';
      const lzMon =
        ex.laufzeit_monate != null &&
        String(ex.laufzeit_monate).trim() !== '' &&
        Number.isFinite(Number(ex.laufzeit_monate))
          ? Math.floor(Number(ex.laufzeit_monate))
          : NaN;
      const lzStr = Number.isFinite(lzMon) && lzMon >= 1 ? `${lzMon} Mon.` : '—';
      const startShow = termin ? termin.slice(0, 10) : '—';
      const endShow = terminEnde ? terminEnde.slice(0, 10) : '—';
      const laufzeitCell =
        startShow !== '—' || endShow !== '—'
          ? `${esc(startShow)} – ${esc(endShow)}<div class="ts">${esc(lzStr)}</div>`
          : `<span class="tm">—</span><div class="ts">${esc(lzStr)}</div>`;

      const pmPf = ex.preis_monat_pflicht;
      const summ = ex.summen && typeof ex.summen === 'object' ? /** @type {Record<string, unknown>} */ (ex.summen) : null;
      const netSumm = summ && summ.netto_monat_gesamt != null ? Number(summ.netto_monat_gesamt) : NaN;
      const netPf = pmPf != null && Number.isFinite(Number(pmPf)) ? Number(pmPf) : NaN;
      const netMonat = Number.isFinite(netSumm) ? netSumm : netPf;
      const preisCell =
        Number.isFinite(netMonat) ?
          `€ ${netMonat.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
        : '—';

      const status = a.status != null && String(a.status).trim() !== '' ? String(a.status).trim() : '—';
      const statusFilter = status === '—' ? '__EMPTY__' : status;
      const resolved = resolveFusaAuftragUiStatus(a);
      const umzTab = resolved.filterTab;
      const bdgCls = fusaAuftragBadgeClassesForBucket(resolved.bucket);
      const payload = encodeURIComponent(JSON.stringify(a));
      const searchHay = encodeURIComponent(
        [id, displayNr, kunde, paket, fzDisp, laufzeitCell, abrLab(ex.abrechnungsart), preisCell, status].join(' ').toLowerCase(),
      );
      return `<tr data-ccw-row-id="${esc(id)}" data-fusa-auf-payload="${payload}" data-fusa-auf-search-hay="${searchHay}" data-fusa-auf-status="${esc(
        statusFilter,
      )}" data-fusa-umz-tab="${esc(umzTab)}">
      <td><div class="tm">${esc(displayNr)}</div></td>
      <td>${esc(kunde)}</td>
      <td><span class="bdg bgr">${esc(paket)}</span></td>
      <td>${esc(fzDisp)}</td>
      <td>${laufzeitCell}</td>
      <td><span class="bdg bb">${esc(abrLab(ex.abrechnungsart))}</span></td>
      <td style="font-weight:600;color:var(--green,#2E7D32)">${esc(preisCell)}</td>
      <td><span class="${bdgCls}">${esc(status)}</span></td>
      <td>
        <button type="button" class="btn" data-fusa-auf-delete-placeholder="${esc(id)}" style="font-size:11px;padding:4px 10px;background:var(--red-l,#FFEBEE);border-color:var(--red,#C62828);color:var(--red,#C62828);white-space:nowrap;">🗑 Löschen</button>
      </td>
    </tr>`;
    }),
  );

  return `<table>
      <thead><tr><th>Auftrag-Nr.</th><th>Kunde</th><th>Paket</th><th>Fahrzeug</th><th>Laufzeit</th><th>Abrechnung</th><th>Preis/Mon.</th><th>Status</th><th>Aktion</th></tr></thead>
      <tbody>${rowHtmls.join('')}</tbody>
    </table>`;
}

export async function renderFusaApiAuftraegeTableInnerHtml(auftraege, projectNameById) {
  const names = projectNameById && typeof projectNameById === 'object' ? projectNameById : {};
  const list = Array.isArray(auftraege) ? auftraege : [];
  if (list.length === 0) {
    return `<div class="ckp-snapshot-ro-wrap ckp-table-wrap" data-fusa-auf-table-wrap>
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">Bezeichnung</th>
            <th scope="col" class="ckp-snapshot-ro-th">Projekt</th>
            <th scope="col" class="ckp-snapshot-ro-th">Kunde</th>
            <th scope="col" class="ckp-snapshot-ro-th">Fahrzeugbezug</th>
            <th scope="col" class="ckp-snapshot-ro-th">Laufzeit / Termin</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
            <th scope="col" class="ckp-snapshot-ro-th">Erstellt</th>
          </tr>
        </thead>
        <tbody><tr><td colspan="7" class="ckp-snapshot-ro-empty-cell">Keine Aufträge für die aktuelle Auswahl.</td></tr></tbody>
      </table>
    </div>`;
  }

  const rowHtmls = await Promise.all(
    list.map(async (a) => {
      const id = a.id != null ? String(a.id) : '—';
      const fusaOrig =
        a.fusa_original_id != null && String(a.fusa_original_id).trim() !== ''
          ? String(a.fusa_original_id).trim()
          : '';
      const title = a.title != null && String(a.title).trim() !== '' ? String(a.title) : '—';
      const pid = a.project_id != null ? String(a.project_id) : '';
      const apiPname = a.projekt_name != null && String(a.projekt_name).trim() !== '' ? String(a.projekt_name).trim() : '';
      const pname = apiPname || (pid && names[pid] ? names[pid] : pid || '—');
      const kundeRow = { ...(a && typeof a === 'object' ? a : {}), firma_id: a.fusa_kunde_id ?? a.firma_id };
      const apiKunde = a.kunde_name != null && String(a.kunde_name).trim() !== '' ? String(a.kunde_name).trim() : '';
      const kunde = apiKunde || (await resolveAuftragKundenAnzeige(kundeRow));
      const apiFz =
        a.fahrzeug_kurztext != null && String(a.fahrzeug_kurztext).trim() !== ''
          ? String(a.fahrzeug_kurztext).trim()
          : '';
      const fzDisp = apiFz || formatFusaFahrzeugIdsShort(a.fusa_fahrzeug_ids);
      const fzCount = typeof a.fahrzeug_anzahl === 'number' && Number.isFinite(a.fahrzeug_anzahl) ? a.fahrzeug_anzahl : null;
      const fzTitle =
        fzCount != null && fzCount > 1 ? `${fzCount} Fahrzeuge (laut Stamm)` : fzCount === 1 ? '1 Fahrzeug' : '';
      const termin =
        a.termin != null && String(a.termin).trim() !== '' ? String(a.termin) : '—';
      const terminEnde =
        a.termin_ende != null && String(a.termin_ende).trim() !== '' ? String(a.termin_ende) : '—';
      let laufzeit = termin;
      if (terminEnde !== '—') {
        laufzeit = termin !== '—' ? `${termin} → ${terminEnde}` : `bis ${terminEnde}`;
      }
      const status = a.status != null && String(a.status).trim() !== '' ? String(a.status).trim() : '—';
      const statusFilter = status === '—' ? '__EMPTY__' : status;
      const created =
        a.created_at != null && String(a.created_at).trim() !== '' ? String(a.created_at) : '—';
      const payload = encodeURIComponent(JSON.stringify(a));
      const refShort =
        fusaOrig !== ''
          ? fusaOrig.length > 14
            ? `${fusaOrig.slice(0, 12)}…`
            : fusaOrig
          : id !== '—' && id.length > 10
            ? `…${id.slice(-8)}`
            : '—';
      const titleTip = [id, fusaOrig ? `Alt: ${fusaOrig}` : ''].filter(Boolean).join(' · ');
      const searchHay = encodeURIComponent(
        [title, pname, kunde, fzDisp, apiPname, apiKunde, apiFz, laufzeit, status, created, fusaOrig, id]
          .join(' ')
          .toLowerCase(),
      );
      const fzCellExtra =
        fzCount != null && fzCount > 1 && !String(fzDisp).includes('(+')
          ? ` <span class="fusa-auf-fz-count" style="font-size:10px;color:var(--ccds-muted,#64748b);">×${fzCount}</span>`
          : '';
      return `<tr data-ccw-row-id="${esc(id)}" data-fusa-auf-payload="${payload}" data-fusa-auf-search-hay="${searchHay}" data-fusa-auf-status="${esc(
        statusFilter,
      )}" class="fusa-auf-table-row" style="cursor:pointer;" title="${esc(titleTip)}">
              <td class="ckp-snapshot-ro-td"><strong class="fusa-auf-table-title">${esc(title)}</strong>${fusaOrig ? `<div class="fusa-auf-table-ref" style="font-size:11px;color:var(--ccds-muted,#64748b);margin-top:4px;">${esc(refShort)}</div>` : ''}</td>
              <td class="ckp-snapshot-ro-td">${esc(pname)}</td>
              <td class="ckp-snapshot-ro-td">${esc(kunde)}</td>
              <td class="ckp-snapshot-ro-td"${fzTitle ? ` title="${esc(fzTitle)}"` : ''}>${esc(fzDisp)}${fzCellExtra}</td>
              <td class="ckp-snapshot-ro-td">${esc(laufzeit)}</td>
              <td class="ckp-snapshot-ro-td">${status !== '—' ? `<span class="ckp-dash-chip ckp-dash-chip--amber">${esc(status)}</span>` : '—'}</td>
              <td class="ckp-snapshot-ro-td"><span class="fusa-auf-table-meta">${esc(created)}</span></td>
            </tr>`;
    }),
  );

  return `<div class="ckp-snapshot-ro-wrap ckp-table-wrap" data-fusa-auf-table-wrap>
      <table class="ckp-table ckp-snapshot-ro-table fusa-auf-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">Bezeichnung</th>
            <th scope="col" class="ckp-snapshot-ro-th">Projekt</th>
            <th scope="col" class="ckp-snapshot-ro-th">Kunde</th>
            <th scope="col" class="ckp-snapshot-ro-th">Fahrzeugbezug</th>
            <th scope="col" class="ckp-snapshot-ro-th">Laufzeit / Termin</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
            <th scope="col" class="ckp-snapshot-ro-th">Erstellt</th>
          </tr>
        </thead>
        <tbody>${rowHtmls.join('')}</tbody>
      </table>
    </div>`;
}

/**
 * @param {unknown} raw
 * @returns {string}
 */
export function formatFusaFahrzeugIdsShort(raw) {
  if (raw == null || raw === '') return '—';
  const s = typeof raw === 'string' ? raw.trim() : '';
  if (!s) return '—';
  try {
    const j = JSON.parse(s);
    if (Array.isArray(j) && j.length) {
      const bits = j.slice(0, 4).map((x) => (x != null ? String(x) : '')).filter(Boolean);
      const extra = j.length > 4 ? ` +${j.length - 4}` : '';
      return bits.length ? `${bits.join(', ')}${extra}` : '—';
    }
  } catch {
    /* String, kein JSON */
  }
  return s.length > 48 ? `${s.slice(0, 45)}…` : s;
}
