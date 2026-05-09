/**
 * Zentrales Mapping: API-Rohdaten → FUSA-Dashboard-View-Modell (keine erfundenen KPIs).
 */

import { resolveFusaAuftragUiStatus, fusaAuftragBadgeClassesForBucket } from './fusa-auftrag-ui-status.js';

/**
 * @param {unknown} v
 */
function str(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {unknown} iso
 */
function formatDeShort(iso) {
  const s = str(iso);
  if (!s) return '—';
  if (s.length >= 10) {
    const y = s.slice(0, 4);
    const m = s.slice(5, 7);
    const d = s.slice(8, 10);
    return `${d}.${m}.${y}`;
  }
  return s;
}

/**
 * @param {Record<string, unknown>|null|undefined} row
 */
function parseExtra(row) {
  if (!row || typeof row !== 'object') return {};
  const raw = /** @type {Record<string, unknown>} */ (row).fusa_extra_json;
  if (raw == null || raw === '') return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return /** @type {Record<string, unknown>} */ (raw);
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? /** @type {Record<string, unknown>} */ (o) : {};
  } catch {
    return {};
  }
}

/**
 * @param {Record<string, unknown>} fz
 */
function fahrzeugDashboardBucket(fz) {
  const st = str(fz.status).toLowerCase();
  if (!st) return 'sonstige';
  if (st.includes('schaden') || st.includes('defekt') || st.includes('reparatur')) return 'schaden';
  if (st.includes('frei') || st.includes('verfügbar')) return 'frei';
  if (st.includes('belegt') || st.includes('gebucht') || st.includes('aktiv')) return 'belegt';
  return 'sonstige';
}

/**
 * @param {object[]} auftraegeProject
 * @param {Map<string, string>} fzKennById
 */
function buildQuickRows(auftraegeProject, fzKennById) {
  const list = Array.isArray(auftraegeProject) ? auftraegeProject.slice(0, 5) : [];
  return list.map(row => {
    if (!row || typeof row !== 'object') return null;
    const r = /** @type {Record<string, unknown>} */ (row);
    const id = str(r.id);
    const title = str(r.title) || id;
    const kunde = str(r.kunde_name) || '—';
    let fzLine = '—';
    const rawIds = r.fusa_fahrzeug_ids;
    if (rawIds != null && String(rawIds).trim() !== '') {
      try {
        const p = typeof rawIds === 'string' ? JSON.parse(rawIds) : rawIds;
        const ids = Array.isArray(p) ? p.map(x => str(x)).filter(Boolean) : [];
        const parts = ids.map(i => fzKennById.get(i) || i).filter(Boolean);
        if (parts.length) fzLine = parts.join(', ');
      } catch {
        fzLine = '—';
      }
    }
    const ui = resolveFusaAuftragUiStatus(r, {});
    const stDisp = ui.statusRaw || '—';
    const bdgFull = fusaAuftragBadgeClassesForBucket(ui.bucket);
    const von = formatDeShort(r.termin);
    const bis = formatDeShort(r.termin_ende);
    const lauf = von !== '—' || bis !== '—' ? `${von} – ${bis}` : '—';
    return { id, title, kunde, fzLine, lauf, statusLabel: stDisp, statusBdgClass: bdgFull };
  }).filter(Boolean);
}

/**
 * @param {object[]} auftraegeProject
 */
function buildQuartalRows(auftraegeProject) {
  const list = Array.isArray(auftraegeProject) ? auftraegeProject : [];
  /** @type {{ auftragLabel: string; quartal: string; zeitraum: string; betrag: string; statusLabel: string; statusBdg: string }[]} */
  const out = [];
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const ex = parseExtra(r);
    const av = ex.abrechnung_vorschau && typeof ex.abrechnung_vorschau === 'object' ? /** @type {Record<string, unknown>} */ (ex.abrechnung_vorschau) : {};
    const n = str(av.naechste_periode);
    const f = str(av.folgeperiode);
    if (!n && !f) continue;
    const id = str(r.id);
    const tit = str(r.title) || id;
    const summ = ex.summen && typeof ex.summen === 'object' ? /** @type {Record<string, unknown>} */ (ex.summen) : null;
    const net = summ && summ.netto_monat_gesamt != null ? Number(summ.netto_monat_gesamt) : NaN;
    const betrag = Number.isFinite(net) ? `€ ${net.toLocaleString('de-DE', { maximumFractionDigits: 0 })}` : '—';
    out.push({
      auftragLabel: `${id} · ${tit}`,
      quartal: n || f || '—',
      zeitraum: '—',
      betrag,
      statusLabel: 'Vorschau',
      statusBdg: 'bp',
    });
    if (out.length >= 5) break;
  }
  return out;
}

/**
 * @param {object[]} auftraegeProject
 * @param {object[]} schaedenProject
 * @param {object[]} fahrzeugeProject
 */
function buildWarnings(auftraegeProject, schaedenProject, fahrzeugeProject) {
  /** @type {{ tone: 'r'|'a'|'b'; title: string; body: string }[]} */
  const w = [];
  const auf = Array.isArray(auftraegeProject) ? auftraegeProject : [];
  for (const row of auf) {
    if (!row || typeof row !== 'object') continue;
    const r = /** @type {Record<string, unknown>} */ (row);
    const ui = resolveFusaAuftragUiStatus(r, {});
    if (ui.bucket !== 'endet_bald') continue;
    const tit = str(r.title) || str(r.id);
    const end = ui.enddatumYmd ? formatDeShort(ui.enddatumYmd) : '—';
    w.push({
      tone: 'a',
      title: 'Auftrag endet bald',
      body: `${tit} · Zielende ${end}`,
    });
    if (w.length >= 4) break;
  }
  const sch = Array.isArray(schaedenProject) ? schaedenProject : [];
  let offen = 0;
  for (const s of sch) {
    if (!s || typeof s !== 'object') continue;
    const o = /** @type {Record<string, unknown>} */ (s);
    const meld = str(o.status).toLowerCase();
    const ws = str(o.werkstatt_status).toLowerCase();
    if (meld === 'erledigt') continue;
    if (ws === 'fertig') continue;
    offen += 1;
  }
  if (offen > 0) {
    w.unshift({
      tone: 'r',
      title: 'Schäden in Bearbeitung',
      body: `${offen} Schadenmeldung${offen === 1 ? '' : 'en'} im Projekt (nicht erledigt / Werkstatt nicht fertig).`,
    });
  }
  const fz = Array.isArray(fahrzeugeProject) ? fahrzeugeProject : [];
  let ohne = 0;
  const samples = [];
  for (const f of fz) {
    if (!f || typeof f !== 'object') continue;
    const fr = /** @type {Record<string, unknown>} */ (f);
    const st = str(fr.status).toLowerCase();
    const kn = str(fr.kennung) || str(fr.id);
    if (st.includes('frei') && kn) {
      ohne += 1;
      if (samples.length < 5) samples.push(kn);
    }
  }
  if (ohne > 0) {
    w.push({
      tone: 'b',
      title: `${ohne} Fahrzeug${ohne === 1 ? '' : 'e'} mit Status „frei“`,
      body: samples.length ? samples.join(', ') : '—',
    });
  }
  return w.slice(0, 6);
}

/**
 * @param {{
 *   projectId: string;
 *   projectName: string;
 *   auftraegeAll: object[];
 *   fahrzeugeAll: object[];
 *   schaedenAll: object[];
 *   loadError?: string;
 * }} input
 */
export function mapFusaDashboardToViewModel(input) {
  const pid = str(input.projectId);
  const projName = str(input.projectName) || '—';
  const aufAll = Array.isArray(input.auftraegeAll) ? input.auftraegeAll : [];
  const fzAll = Array.isArray(input.fahrzeugeAll) ? input.fahrzeugeAll : [];
  const schAll = Array.isArray(input.schaedenAll) ? input.schaedenAll : [];

  const aufProj = pid ? aufAll.filter(a => a && String(/** @type {any} */ (a).project_id || '') === pid) : [];
  const fzProj = pid ? fzAll.filter(f => f && String(/** @type {any} */ (f).project_id || '') === pid) : [];
  const schProj = pid ? schAll.filter(s => s && String(/** @type {any} */ (s).project_id || '') === pid) : [];

  /** @type {Map<string, string>} */
  const fzKennById = new Map();
  for (const f of fzProj) {
    if (!f || typeof f !== 'object') continue;
    const fr = /** @type {Record<string, unknown>} */ (f);
    const id = str(fr.id);
    if (!id) continue;
    const kn = str(fr.kennung) || id;
    fzKennById.set(id, kn);
  }

  let aktiv = 0;
  let endetBald = 0;
  for (const row of aufProj) {
    const ui = resolveFusaAuftragUiStatus(row, {});
    if (ui.bucket === 'aktiv') aktiv += 1;
    if (ui.bucket === 'endet_bald') endetBald += 1;
  }

  let fzBelegt = 0;
  let fzFrei = 0;
  let fzSchaden = 0;
  let fzSonst = 0;
  for (const f of fzProj) {
    const b = fahrzeugDashboardBucket(/** @type {Record<string, unknown>} */ (f));
    if (b === 'belegt') fzBelegt += 1;
    else if (b === 'frei') fzFrei += 1;
    else if (b === 'schaden') fzSchaden += 1;
    else fzSonst += 1;
  }
  const fzTotal = fzProj.length;
  const belegtVis = fzBelegt + fzSonst;
  const pctBelegt = fzTotal > 0 ? Math.min(100, Math.round((belegtVis / fzTotal) * 1000) / 10) : 0;

  return {
    projectId: pid,
    projectName: projName,
    loadError: str(input.loadError),
    kpiAktiveAuftraege: aktiv,
    kpiFahrzeuge: fzTotal,
    kpiEndetBald: endetBald,
    kpiOffenePostenDisplay: '—',
    kpiOffenePostenSub: 'Keine Rechnungs-API',
    kpiOffenePostenSub2: 'Brutto-Summe',
    quickRows: buildQuickRows(aufProj, fzKennById),
    quartalRows: buildQuartalRows(aufProj),
    warnings: buildWarnings(aufProj, schProj, fzProj),
    fzStatus: {
      total: fzTotal,
      belegt: belegtVis,
      frei: fzFrei,
      schaden: fzSchaden,
      pctBelegt,
    },
  };
}
