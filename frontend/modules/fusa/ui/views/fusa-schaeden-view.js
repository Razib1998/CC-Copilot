/**
 * FUSA — Schäden: Vollständige Referenz-UI mit extra_json-Feldern.
 * Felder: typ, prioritaet, abrechnung_status, wiedervorlage, melder_name, terminanfrage.
 * KPIs:   Dringend, Unklar/Prüfung, Fremdschäden, Zur Abrechnung, Behoben.
 * Filter: Meldungsstatus, Typ, Abrechnung, Freitext.
 * Modals: "Schaden melden" (mehrstufig), "Termin anfragen".
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import CCState from '../../../../core/state/state.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';
import { renderFusaSchadenDetailHtml } from './fusa-schaden-detail-view.js';
import { schadenKpisFromRows } from '../../lib/fusa-schaden-ui-status.js';
import { mapSchadenApiRowToViewModel } from '../../lib/fusa-schaden-view-model.js';

/** Alt `WERKSTATT_MAILS` — für Vorschau & mailto. */
const WERKSTATT_MAILS = {
  'Essen Econova-Alee': 'werkstatt.econova@ruhrbahn.de',
  'Essen Rurhallee': 'werkstatt.rurhallee@ruhrbahn.de',
  'Essen Schweriner Str.': 'werkstatt.schweriner@ruhrbahn.de',
  'Essen Stadtmitte': 'werkstatt.stadtmitte@ruhrbahn.de',
  'Mülheim Duisburgerstr.': 'werkstatt.muelheim@ruhrbahn.de',
};

const DEPOT_TERMIN_OPTIONS = [
  { v: '', l: '— Werkstatt wählen —' },
  { v: 'Essen Econova-Alee', l: 'Depot Essen Econova-Alee' },
  { v: 'Essen Rurhallee', l: 'Depot Essen Rurhallee' },
  { v: 'Essen Schweriner Str.', l: 'Depot Essen Schweriner Str.' },
  { v: 'Essen Stadtmitte', l: 'Depot Essen Stadtmitte' },
  { v: 'Mülheim Duisburgerstr.', l: 'Depot Mülheim Duisburgerstr.' },
];

const ZEIT_SLOTS = [
  '06:00 – 08:00',
  '08:00 – 10:00',
  '10:00 – 12:00',
  '12:00 – 14:00',
  '14:00 – 16:00',
  'Flexibel',
];

/**
 * @param {string} iso
 */
function formatDatumDeLong(iso) {
  const s = String(iso || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return '—';
  try {
    const d = new Date(`${s}T12:00:00`);
    return d.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  } catch {
    return s;
  }
}

/**
 * @param {NonNullable<ReturnType<typeof mapSchadenApiRowToViewModel>>} vm
 */
function buildSchadenWizardNotizFromVm(vm) {
  const lines = [
    `Schaden ${vm.id}`,
    `Fahrzeug: ${vm.fahrzeugDisplay}`,
    `Titel: ${vm.titel}`,
    vm.beschreibung ? `Beschreibung: ${vm.beschreibung}` : '',
    vm.typLabel ? `Typ: ${vm.typLabel}` : '',
    vm.verursacher ? `Verursacher: ${vm.verursacher}` : '',
    vm.interneNotiz ? `Intern: ${vm.interneNotiz}` : '',
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * @param {NonNullable<ReturnType<typeof mapSchadenApiRowToViewModel>>} vm
 * @param {boolean} canEdit
 */
function schadenAktionenHtml(vm, canEdit) {
  const sid = vm.id;
  if (vm.status === 'erledigt') {
    return '<span style="font-size:10px;color:#2E7D32;">✓ Abgeschlossen</span>';
  }
  if (!canEdit) {
    return '<span style="font-size:10px;color:#94a3b8;">—</span>';
  }
  if (vm.reparaturPhase === 'in_reparatur' || vm.werkstatt_status === 'in_arbeit') {
    const aid = vm.linkedAuftragId ? esc(vm.linkedAuftragId) : '';
    return aid
      ? `<span style="font-size:10px;color:#1565C0;">🔧 Auftrag ${aid}</span>`
      : '<span style="font-size:10px;color:#1565C0;">🔧 In Bearbeitung</span>';
  }
  if (vm.reparaturPhase === 'termin_bestaetigt') {
    return `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;background:#E8F5E9;border-color:#2E7D32;color:#2E7D32;" data-fusa-sch-best-open="${esc(sid)}">→ Auftrag erstellen</button>`;
  }
  if (vm.reparaturPhase === 'termin_gesendet') {
    const ta = vm.terminanfrage && typeof vm.terminanfrage === 'object' ? /** @type {Record<string, unknown>} */ (vm.terminanfrage) : {};
    const sent = ta.angefragt_am != null ? String(ta.angefragt_am) : '—';
    const em = ta.empfaenger != null ? String(ta.empfaenger) : '';
    return `<div style="display:flex;flex-direction:column;gap:4px;min-width:120px;">
      <div style="display:flex;align-items:center;gap:5px;"><span style="width:7px;height:7px;border-radius:50%;background:#1565C0;"></span>
      <span style="font-size:10px;color:#1565C0;font-weight:600;">Warte auf Werkstatt</span></div>
      <span style="font-size:9px;color:#64748b;">Gesendet: ${esc(sent)}</span>
      ${em ? `<span style="font-size:9px;color:#64748b;" title="${esc(em)}">→ ${esc(em.length > 40 ? `${em.slice(0, 38)}…` : em)}</span>` : ''}
      <div style="display:flex;gap:4px;margin-top:2px;flex-wrap:wrap;">
        <button type="button" class="btn" style="font-size:9px;padding:2px 6px;background:#E8F5E9;border-color:#2E7D32;color:#2E7D32;" data-fusa-sch-manual-bestaetigt="${esc(sid)}">✓ Manuell best.</button>
        <button type="button" class="btn" style="font-size:9px;padding:2px 6px;" data-fusa-sch-termin-abbruch="${esc(sid)}">✗ Abbruch</button>
      </div>
    </div>`;
  }
  if (vm.terminanfrage && typeof vm.terminanfrage === 'object' && vm.reparaturPhase === 'geplant') {
    return `<button type="button" class="btn" disabled style="font-size:10px;padding:3px 7px;cursor:not-allowed;opacity:.65;" title="Anfrage gespeichert — Status zurücksetzen oder fortsetzen.">✉ Anfrage vorhanden</button>`;
  }
  return `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-sch-termin-btn="${esc(sid)}">📅 Termin anfragen</button>`;
}

// ── KPI-Karte ────────────────────────────────────────────────────────────────
/**
 * @param {{ key: string; value: number; label: string; icon: string; iconClass: string; urgent?: boolean }} opts
 */
function schKpiCard(opts) {
  const urgent = opts.urgent ? 'style="border-top:2px solid #C62828;"' : '';
  return `<div class="ccds-stat-card" ${urgent}>
  <div class="ccds-stat-icon-box ${esc(opts.iconClass)}" aria-hidden="true">${esc(opts.icon)}</div>
  <div><div class="ccds-stat-val" data-fusa-sch-kpi="${esc(opts.key)}">${esc(String(opts.value))}</div><div class="ccds-stat-label">${esc(opts.label)}</div></div>
</div>`;
}

// ── Filter-Optionen (Alt: Reparaturstatus / Typ / Abrechnung) ─────────────────
const FORM_STATUS_OPTIONS = [
  { v: 'offen', l: 'Offen' },
  { v: 'in_bearbeitung', l: 'In Bearbeitung' },
  { v: 'erledigt', l: 'Behoben / Erledigt' },
];

const TYP_OPTIONS = [
  { v: 'Eigenschaden', l: 'Eigenschaden' },
  { v: 'Fremdschaden', l: 'Fremdschaden' },
  { v: 'Unklar', l: 'Unklar / Prüfung' },
];

const ABRECHNUNG_OPTIONS = [
  { v: 'nicht', l: 'Nicht abrechenbar' },
  { v: 'potenziell', l: 'Potenziell abrechenbar' },
  { v: 'klaerung', l: 'In Klärung' },
  { v: 'vormerken', l: 'Zur Rechnung vormerken' },
  { v: 'erstellt', l: 'Rechnung erstellt' },
  { v: 'versendet', l: 'Rechnung versendet' },
  { v: 'bezahlt', l: 'Bezahlt ✓' },
];

const REP_FILTER_OPTIONS = [
  { v: '', l: 'Alle Status' },
  { v: 'dringend', l: 'Dringend' },
  { v: 'geplant', l: 'Reparatur geplant' },
  { v: 'anfrage', l: 'Terminanfrage gesendet' },
  { v: 'inarbeit', l: 'In Bearbeitung' },
  { v: 'behoben', l: 'Behoben' },
];

const TYP_FILTER_OPTIONS = [
  { v: '', l: 'Alle Typen' },
  { v: 'eigen', l: 'Eigenschaden' },
  { v: 'fremd', l: 'Fremdschaden' },
  { v: 'unklar', l: 'Unklar / Prüfung' },
];

const ABR_FILTER_OPTIONS = [
  { v: '', l: 'Alle Abrechnungen' },
  { v: 'vormerken', l: 'Zur Rechnung vormerken' },
  { v: 'klaerung', l: 'In Klärung' },
  { v: 'erstellt', l: 'Rechnung erstellt' },
  { v: 'versendet', l: 'Rechnung versendet' },
  { v: 'bezahlt', l: 'Bezahlt' },
];

let schadenListRowClickAbort = /** @type {AbortController|null} */ (null);

/**
 * @returns {Promise<string>}
 */
export async function renderFusaSchaedenViewHtml() {
  const detailId = CCState.get('fusaSchadenDetailId');
  if (detailId != null && String(detailId).trim() !== '') {
    return renderFusaSchadenDetailHtml(String(detailId).trim());
  }

  let loadErr = '';
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let schaedenAll = [];
  /** @type {object[]} */
  let fahrzeugeAll = [];

  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    projects = Array.isArray(pr.projects) ? pr.projects.filter(p => p && p.id != null) : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  try {
    const sr = await apiFetch(API_ROUTES.fusa.schaeden);
    schaedenAll = Array.isArray(sr.schaeden) ? sr.schaeden : [];
  } catch (e) {
    if (!loadErr) { loadErr = formatApiErrorForUi(e); }
  }
  try {
    const fr = await apiFetch(API_ROUTES.fusa.fahrzeuge);
    fahrzeugeAll = Array.isArray(fr.fahrzeuge) ? fr.fahrzeuge : [];
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  await ensureFusaProjectSelection(projects);
  const ctx = getFusaAppProject();
  const pid = ctx && ctx.id ? String(ctx.id) : '';
  let myRights = null;
  try { myRights = await loadMyRights(); } catch { myRights = null; }
  const canCreateSchaden = myRight(myRights, 'fusa', 'schaeden', 'erstellen');
  const canBearbeitenSchaden = myRight(myRights, 'fusa', 'schaeden', 'bearbeiten');

  const filtered = pid ? schaedenAll.filter(s => s && String(s.project_id || '') === pid) : [];
  const fzProj = pid ? fahrzeugeAll.filter(f => f && String(f.project_id || '') === pid) : [];

  const filteredVm = filtered
    .map(s => mapSchadenApiRowToViewModel(s && typeof s === 'object' ? /** @type {Record<string, unknown>} */ (s) : {}))
    .filter(/** @returns {v is NonNullable<typeof v>} */ v => v != null);

  const kpis = schadenKpisFromRows(filteredVm);

  // Fahrzeug-Optionen für Formular
  const fzOptions = fzProj.length === 0
    ? '<option value="">— Kein Fahrzeug im Projekt —</option>'
    : `<option value="">— Fahrzeug wählen —</option>${fzProj.map(f => {
        const id = String(f.id);
        const kn = f.kennung != null && String(f.kennung).trim() !== '' ? String(f.kennung) : id;
        return `<option value="${esc(id)}">${esc(kn)}</option>`;
      }).join('')}`;

  const statusOpts = FORM_STATUS_OPTIONS.map(o =>
    `<option value="${esc(o.v)}"${o.v === 'offen' ? ' selected' : ''}>${esc(o.l)}</option>`
  ).join('');

  const typSelectOpts = `<option value="">— Typ wählen —</option>${TYP_OPTIONS.map(o =>
    `<option value="${esc(o.v)}">${esc(o.l)}</option>`
  ).join('')}`;

  const abrSelectOpts = `${ABRECHNUNG_OPTIONS.map(o =>
    `<option value="${esc(o.v)}"${o.v === 'nicht' ? ' selected' : ''}>${esc(o.l)}</option>`,
  ).join('')}`;

  const heuteIso = new Date().toISOString().slice(0, 10);
  const wvFaellig = filteredVm.filter(
    vm => vm.wiedervorlage && vm.wiedervorlage <= heuteIso && vm.status !== 'erledigt',
  );
  const wvBannerHtml =
    wvFaellig.length === 0
      ? ''
      : `<div id="fusa-sch-wv-banner" style="background:#FFF3E0;border:1px solid #E8C87A;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px;color:#E65100;">
  ⏰ <b>Wiedervorlage:</b> ${wvFaellig.length} Schaden/Schäden zur Nachverfolgung fällig:
  ${wvFaellig.map(s => `${esc(s.id)} (${esc(s.fahrzeugDisplay)})`).join(', ')}
</div>`;

  const repFilterOpts = REP_FILTER_OPTIONS.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
  const typFilterOpts = TYP_FILTER_OPTIONS.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');
  const abrFilterOpts = ABR_FILTER_OPTIONS.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('');

  const zeitSelectOpts = ZEIT_SLOTS.map(
    (z, i) =>
      `<option value="${esc(z)}"${i === 2 ? ' selected' : ''}>${esc(z)}</option>`,
  ).join('');
  const depotTerminSelectOpts = DEPOT_TERMIN_OPTIONS.map(
    o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`,
  ).join('');

  // Tabellen-Zeilen (Alt: Fahrzeug, Beschreibung+Notiz+Fotos, Typ+Verursacher, Reparaturstatus, Abrechnung, WV, Aktion)
  const tableRows = filteredVm.length === 0
    ? `<tr data-fusa-sch-empty-row><td colspan="8" class="ckp-snapshot-ro-empty-cell">Keine Schäden im Projekt.</td></tr>`
    : filteredVm
        .flatMap(vm => {
          const sid = vm.id;
          const hay = esc(vm.searchHaystack);
          const typBadge = vm.typ
            ? `<span class="fusa-sch-bdg bdg b${esc(vm.typBadgeClass)}">${esc(vm.typLabel)}</span>`
            : `<span class="fusa-sch-bdg bdg bgr">—</span>`;
          const verurs =
            vm.typ === 'Fremdschaden' && vm.verursacher
              ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">${esc(vm.verursacher)}</div>`
              : '';
          const notizLine =
            vm.interneNotiz
              ? `<div style="font-size:10px;color:#64748b;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;" title="${esc(vm.interneNotiz)}">💬 ${esc(vm.interneNotiz)}</div>`
              : '';
          const fotoLine =
            vm.fotoCount > 0
              ? `<div style="font-size:10px;color:#1565C0;margin-top:3px;">📷 ${vm.fotoCount} Foto${vm.fotoCount > 1 ? 's' : ''}</div>`
              : '';
          const wvRed = vm.wiedervorlage && vm.wiedervorlage <= heuteIso && vm.status !== 'erledigt';
          const wvCell = vm.wiedervorlage
            ? `<span style="font-size:11px;color:${wvRed ? '#C62828' : '#64748b'};font-weight:${wvRed ? '600' : '400'};">📅 ${esc(vm.wiedervorlage)}</span>`
            : '—';
          const ta = vm.terminanfrage && typeof vm.terminanfrage === 'object' ? /** @type {Record<string, unknown>} */ (vm.terminanfrage) : null;
          const anfrageRow =
            vm.reparaturPhase === 'termin_gesendet' && ta
              ? `<tr data-fusa-sch-anfrage-for="${esc(sid)}" style="background:#EEF4FF;border-left:3px solid #1565C0;">
            <td colspan="8" style="padding:8px 14px;font-size:11px;color:#1565C0;">
              <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap;">
                <span>✉ <b>Terminanfrage gesendet</b> ${ta.angefragt_am != null ? `am ${esc(String(ta.angefragt_am))}` : ''}${ta.angefragt_zeit != null ? ` · ${esc(String(ta.angefragt_zeit))}` : ''}</span>
                ${ta.empfaenger != null ? `<span>→ ${esc(String(ta.empfaenger))}</span>` : ''}
                <span>📅 Wunschtermin: <b>${ta.wunschdatum_fmt != null ? esc(String(ta.wunschdatum_fmt)) : esc(String(ta.wunschdatum || '—'))}</b>${ta.wunschzeit != null ? ` · ${esc(String(ta.wunschzeit))}` : ''}</span>
                ${ta.werkstatt != null ? `<span>🏭 ${esc(String(ta.werkstatt))}</span>` : ''}
                <span style="margin-left:auto;font-weight:600;">Warte auf Antwort der Werkstatt …</span>
              </div>
            </td>
          </tr>`
              : '';
          const mainRow = `<tr data-ccw-row-id="${esc(sid)}" data-fusa-schaden-row="1" class="fusa-schaden-list-row" style="cursor:pointer;${vm.reparaturPhase === 'termin_gesendet' ? 'background:#EEF4FF;' : ''}"
            data-sch-rep="${esc(vm.reparaturFilterKey)}"
            data-sch-typ-alt="${esc(vm.typFilterKey)}"
            data-sch-abr="${esc(vm.abrechnungFilterKey)}"
            data-sch-search="${hay}">
          <td class="ckp-snapshot-ro-td" style="${vm.reparaturPhase === 'termin_gesendet' ? 'border-left:3px solid #1565C0;padding-left:11px;' : ''}">
            <span style="font-size:11px;font-weight:600;color:#64748b;">${esc(vm.shortIdDisplay)}</span>
            <div style="font-size:10px;color:#94a3b8;margin-top:2px;">${esc(vm.createdAtDisplay)}</div>
            ${wvRed ? `<div style="font-size:10px;color:#C62828;margin-top:4px;font-weight:600;">⏰ WV fällig</div>` : ''}
          </td>
          <td class="ckp-snapshot-ro-td tm" style="font-size:12px;">${esc(vm.fahrzeugDisplay)}</td>
          <td class="ckp-snapshot-ro-td" style="font-size:12px;max-width:220px;line-height:1.4;">
            <div style="font-weight:500;">${esc(vm.titel)}</div>
            ${vm.beschreibung ? `<div style="font-size:11px;color:#334155;margin-top:2px;">${esc(vm.beschreibung)}</div>` : ''}
            ${notizLine}${fotoLine}
          </td>
          <td class="ckp-snapshot-ro-td">${typBadge}${verurs}</td>
          <td class="ckp-snapshot-ro-td"><span class="fusa-sch-bdg bdg b${esc(vm.reparaturBadgeClass)}">${esc(vm.reparaturLabel)}</span>
            ${ta && ta.wunschdatum && vm.reparaturPhase !== 'termin_gesendet' ? `<div style="font-size:10px;color:#64748b;margin-top:2px;">📅 ${esc(String(ta.wunschdatum_fmt || ta.wunschdatum))}</div>` : ''}
          </td>
          <td class="ckp-snapshot-ro-td"><span class="fusa-sch-bdg bdg b${esc(vm.abrechnungBadgeClass)}">${esc(vm.abrechnungLabel)}</span></td>
          <td class="ckp-snapshot-ro-td">${wvCell}</td>
          <td class="ckp-snapshot-ro-td" style="white-space:nowrap;max-width:200px;" onclick="event.stopPropagation();">
            <button type="button" class="btn" style="font-size:11px;padding:4px 10px;" data-fusa-schaden-open-detail="${esc(sid)}">Details</button>
            <div style="margin-top:6px;">${schadenAktionenHtml(vm, canBearbeitenSchaden)}</div>
          </td>
        </tr>`;
          return anfrageRow ? [mainRow, anfrageRow] : [mainRow];
        })
        .join('');

  // "Schaden melden" Modal
  const meldenModal = canCreateSchaden && pid ? `
<div id="fusa-sch-melden-modal" role="dialog" aria-modal="true" aria-label="Schaden melden" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:28px 32px;min-width:440px;max-width:560px;width:100%;position:relative;max-height:90vh;overflow-y:auto;">
    <button type="button" data-fusa-sch-modal-close style="position:absolute;top:14px;right:18px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;" aria-label="Schließen">✕</button>
    <h3 style="margin:0 0 20px;font-size:16px;font-weight:700;color:#1e293b;">🔔 Schaden melden</h3>
    <form data-fusa-schaden-form style="display:flex;flex-direction:column;gap:14px;">
      <input type="hidden" name="project_id" value="${esc(pid)}" />
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;">1 — Fahrzeug &amp; Priorität</div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-fz">Fahrzeug *</label>
        <select id="fusa-sch-fz" name="fahrzeug_id" required>${fzOptions}</select>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-prio">Priorität</label>
          <select id="fusa-sch-prio" name="prioritaet">
            <option value="normal" selected>Normal — Reparatur geplant</option>
            <option value="dringend">🔴 Dringend</option>
          </select>
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-status">Meldungsstatus</label>
          <select id="fusa-sch-status" name="status">${statusOpts}</select>
        </div>
      </div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-titel">Titel / Kurzbezeichnung *</label>
        <input id="fusa-sch-titel" name="titel" type="text" required autocomplete="off" placeholder="z.B. Heckbeschädigung links" />
      </div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-beschr">Beschreibung</label>
        <textarea id="fusa-sch-beschr" name="beschreibung" rows="3" autocomplete="off" placeholder="Genaue Beschreibung des Schadens…"></textarea>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-melder">Gemeldet von</label>
          <input id="fusa-sch-melder" name="melder_name" type="text" autocomplete="off" placeholder="Name / Firma" />
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-meldedatum">Meldedatum</label>
          <input id="fusa-sch-meldedatum" name="meldedatum" type="date" value="${esc(heuteIso)}" />
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:8px;">2 — Schadentyp</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-typ">Schadentyp *</label>
          <select id="fusa-sch-typ" name="typ" required>${typSelectOpts}</select>
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-klaerung">Klärungsstatus</label>
          <select id="fusa-sch-klaerung" name="klaerung">
            <option value="offen" selected>Offen</option>
            <option value="in_klaerung">In Klärung</option>
            <option value="geklaert">Geklärt</option>
          </select>
        </div>
      </div>
      <div data-fusa-sch-fremd-block id="fusa-sch-fremd-block" style="display:none;margin-top:4px;padding:12px;background:#FFF3E0;border:1px solid #E8C87A;border-radius:10px;">
        <div style="font-size:11px;font-weight:700;color:#E65100;text-transform:uppercase;margin-bottom:8px;">Fremdschaden-Details</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="ckp-api-auftrag-form__row">
            <label for="fusa-sch-verursacher">Verursacher</label>
            <input id="fusa-sch-verursacher" name="verursacher" type="text" autocomplete="off" placeholder="Name / Firma / unbekannt" />
          </div>
          <div class="ckp-api-auftrag-form__row">
            <label for="fusa-sch-fremdart">Art des Fremdschadens</label>
            <select id="fusa-sch-fremdart" name="fremd_art">
              <option value="">— wählen —</option>
              <option>Vandalismus</option>
              <option>Verkehrsunfall</option>
              <option>Sachbeschädigung</option>
              <option>Witterungsschaden</option>
              <option>Sonstiger Dritter</option>
            </select>
          </div>
        </div>
        <div class="ckp-api-auftrag-form__row" style="margin-top:8px;">
          <label for="fusa-sch-haftung">Haftungsnotiz / Beweise</label>
          <input id="fusa-sch-haftung" name="haftung_notiz" type="text" autocomplete="off" placeholder="z.B. Fotos vorhanden, Zeugen…" />
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:8px;">3 — Abrechnungsstatus</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-abr">Abrechnungsstatus</label>
          <select id="fusa-sch-abr" name="abrechnung_legacy">${abrSelectOpts}</select>
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-wv">Wiedervorlage-Datum</label>
          <input id="fusa-sch-wv" name="wiedervorlage" type="date" title="Datum für Wiedervorlage / Nachverfolgung" />
        </div>
      </div>
      <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;margin-top:8px;">4 — Interne Notizen</div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-intern">Notizen zur Haftungsprüfung / Sonstiges</label>
        <textarea id="fusa-sch-intern" name="interne_notiz" rows="3" autocomplete="off" placeholder="Interne Anmerkungen, Klärungsstand…"></textarea>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
        <button type="button" class="btn" data-fusa-sch-modal-close>Abbrechen</button>
        <button type="submit" class="ckp-api-auftrag-submit">Schaden anlegen</button>
      </div>
      <p class="ckp-api-error" data-fusa-schaden-msg hidden role="alert"></p>
    </form>
  </div>
</div>` : '';

  // "Termin anfragen" Modal (Alt: Datum, Zeit, Depot, Notiz, Mail-Vorschau)
  const terminModal = canBearbeitenSchaden ? `
<div id="fusa-sch-termin-modal" role="dialog" aria-modal="true" aria-label="Reparaturtermin anfragen" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1200;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:28px 32px;min-width:420px;max-width:560px;width:100%;position:relative;max-height:92vh;overflow-y:auto;">
    <button type="button" data-fusa-sch-termin-close style="position:absolute;top:14px;right:18px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;" aria-label="Schließen">✕</button>
    <h3 style="margin:0 0 4px;font-size:16px;font-weight:700;color:#1e293b;">📅 Reparaturtermin anfragen</h3>
    <div data-fusa-sch-termin-sub style="font-size:11px;color:#64748b;margin-bottom:14px;"></div>
    <div data-fusa-sch-termin-info style="background:#f1f5f9;border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;line-height:1.7;"></div>
    <form data-fusa-sch-termin-form style="display:flex;flex-direction:column;gap:14px;">
      <input type="hidden" data-fusa-sch-termin-id />
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-termin-datum">Wunschdatum *</label>
          <input id="fusa-sch-termin-datum" name="wunschdatum" type="date" required />
        </div>
        <div class="ckp-api-auftrag-form__row">
          <label for="fusa-sch-termin-zeit">Uhrzeit</label>
          <select id="fusa-sch-termin-zeit" name="wunschzeit">${zeitSelectOpts}</select>
        </div>
      </div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-termin-werkstatt">Werkstatt / Depot *</label>
        <select id="fusa-sch-termin-werkstatt" name="werkstatt" required>${depotTerminSelectOpts}</select>
      </div>
      <div class="ckp-api-auftrag-form__row">
        <label for="fusa-sch-termin-notiz">Interne Notiz</label>
        <input id="fusa-sch-termin-notiz" name="notiz" type="text" autocomplete="off" placeholder="z.B. Zugang, Besonderheiten…" />
      </div>
      <div style="margin-top:4px;background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:12px;">
        <div style="font-size:10px;font-weight:700;color:#2E7D32;text-transform:uppercase;margin-bottom:6px;">✉ E-Mail an Werkstatt (Vorschau)</div>
        <div data-fusa-sch-termin-mailpre style="font-size:11px;line-height:1.7;white-space:pre-wrap;max-height:160px;overflow-y:auto;"></div>
        <div style="margin-top:8px;font-size:10px;color:#64748b;">Versand: Cockpit speichert die Anfrage. E-Mail-Client: <a data-fusa-sch-termin-mailto href="#" style="color:#1565C0;">mailto</a> vorbereiten.</div>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:6px;">
        <button type="button" class="btn" data-fusa-sch-termin-close>Abbrechen</button>
        <button type="submit" class="ckp-api-auftrag-submit" data-fusa-sch-termin-submit>✉ Terminanfrage speichern</button>
      </div>
      <p class="ckp-api-error" data-fusa-sch-termin-msg hidden role="alert"></p>
    </form>
  </div>
</div>
<div id="fusa-sch-best-modal" role="dialog" aria-modal="true" aria-label="Termin bestätigen" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:1210;align-items:center;justify-content:center;">
  <div style="background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);padding:28px 32px;min-width:400px;max-width:520px;width:100%;position:relative;">
    <button type="button" data-fusa-sch-best-close style="position:absolute;top:14px;right:18px;background:none;border:none;font-size:20px;cursor:pointer;color:#94a3b8;">✕</button>
    <h3 style="margin:0 0 14px;font-size:16px;font-weight:700;color:#1e293b;">✓ Termin bestätigen → Auftrag erstellen</h3>
    <div data-fusa-sch-best-body style="font-size:13px;line-height:1.7;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;">
      <button type="button" class="btn" data-fusa-sch-best-close>Abbrechen</button>
      <button type="button" class="btn" style="background:#FFEBEE;border-color:#C62828;color:#C62828;" data-fusa-sch-best-ablehnen>Ablehnen</button>
      <button type="button" class="ckp-api-auftrag-submit" data-fusa-sch-best-confirm>✓ Bestätigen → Auftrag-Wizard</button>
    </div>
    <p class="ckp-api-error" data-fusa-sch-best-msg hidden role="alert"></p>
  </div>
</div>` : '';

  const noProjMsg = !pid
    ? `<p class="ckp-mock-note" role="status">Bitte oben in der Kopfzeile ein Projekt wählen.</p>`
    : '';

  return `<div data-ccw-ro="fusa-schaeden" class="fusa-sch-scope">
<style>
.fusa-sch-scope{--blue:#D4500A;--blue-l:#FFF0E6;--green:#2E7D32;--green-l:#E8F5E9;--amber:#E65100;--amber-l:#FFF3E0;--red:#C62828;--red-l:#FFEBEE;--teal:#00695C;--teal-l:#E0F2F1;--purple:#4527A0;--purple-l:#EDE7F6;--gray:#546E7A;--gray-l:#ECEFF1;}
.fusa-sch-scope .fusa-sch-bdg.bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}
.fusa-sch-scope .fusa-sch-bdg.bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.fusa-sch-scope .fusa-sch-bdg.bdg.bb{background:var(--blue-l);color:var(--blue)} .fusa-sch-scope .fusa-sch-bdg.bdg.bb::before{background:var(--blue)}
.fusa-sch-scope .fusa-sch-bdg.bdg.bg{background:var(--green-l);color:var(--green)} .fusa-sch-scope .fusa-sch-bdg.bdg.bg::before{background:var(--green)}
.fusa-sch-scope .fusa-sch-bdg.bdg.ba{background:var(--amber-l);color:var(--amber)} .fusa-sch-scope .fusa-sch-bdg.bdg.ba::before{background:var(--amber)}
.fusa-sch-scope .fusa-sch-bdg.bdg.br{background:var(--red-l);color:var(--red)} .fusa-sch-scope .fusa-sch-bdg.bdg.br::before{background:var(--red)}
.fusa-sch-scope .fusa-sch-bdg.bdg.bt{background:var(--teal-l);color:var(--teal)} .fusa-sch-scope .fusa-sch-bdg.bdg.bt::before{background:var(--teal)}
.fusa-sch-scope .fusa-sch-bdg.bdg.bp{background:var(--purple-l);color:var(--purple)} .fusa-sch-scope .fusa-sch-bdg.bdg.bp::before{background:var(--purple)}
.fusa-sch-scope .fusa-sch-bdg.bdg.bgr{background:var(--gray-l);color:var(--gray)} .fusa-sch-scope .fusa-sch-bdg.bdg.bgr::before{background:var(--gray)}
.fusa-sch-scope .fusa-sch-filter select,.fusa-sch-scope .fusa-sch-filter input[type=search]{font:inherit;font-size:12px;padding:6px 10px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;outline:none;}
.fusa-sch-scope .fusa-sch-filter select:focus,.fusa-sch-scope .fusa-sch-filter input:focus{border-color:#4527A0;}
.fusa-sch-scope .fusa-sch-filter .btn{font:inherit;font-size:12px;padding:6px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;}
.fusa-sch-scope .fusa-sch-filter .btn:hover{background:#f1f5f9;}
[data-fusa-sch-melden-btn]{font-size:13px;font-weight:600;padding:8px 18px;border-radius:8px;border:none;background:#4527A0;color:#fff;cursor:pointer;}
[data-fusa-sch-melden-btn]:hover{background:#311B92;}
#fusa-sch-melden-modal[style*="flex"]{display:flex!important;}
#fusa-sch-termin-modal[style*="flex"]{display:flex!important;}
#fusa-sch-best-modal[style*="flex"]{display:flex!important;}
</style>
${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
${noProjMsg}
${wvBannerHtml}

<!-- KPI Zeile (Alt: 5 Karten) -->
<div class="ccds-stats-row" style="margin-bottom:20px;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;">
  ${schKpiCard({ key: 'dringend', value: kpis.dringend, label: 'Dringend', icon: '🔴', iconClass: 'ccds-stat-icon-box--red', urgent: true })}
  ${schKpiCard({ key: 'unklar', value: kpis.unklar, label: 'Unklar / Prüfung', icon: '❓', iconClass: 'ccds-stat-icon-box--purple' })}
  ${schKpiCard({ key: 'fremdschaden', value: kpis.fremdschaden, label: 'Fremdschäden', icon: '⚡', iconClass: 'ccds-stat-icon-box--teal' })}
  ${schKpiCard({ key: 'zur_abrechnung', value: kpis.zurAbrechnung, label: 'Zur Abrechnung', icon: '💶', iconClass: 'ccds-stat-icon-box--orange' })}
  ${schKpiCard({ key: 'erledigt', value: kpis.erledigt, label: 'Behoben', icon: '✅', iconClass: 'ccds-stat-icon-box--green' })}
</div>

<!-- Aktions-Button -->
${canCreateSchaden && pid ? `<div style="margin-bottom:16px;"><button type="button" data-fusa-sch-melden-btn>+ Schaden melden</button></div>` : ''}

<!-- Filter-Zeile -->
<section class="ckp-snapshot-ro-section">
  <h3 class="ckp-snapshot-ro-section-title">Schadenmeldungen (${filteredVm.length})</h3>
  <div class="fusa-sch-filter" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:14px;">
    <select data-fusa-sch-filter-rep aria-label="Reparaturstatus filtern" style="min-width:170px;">${repFilterOpts}</select>
    <select data-fusa-sch-filter-typ aria-label="Typ filtern" style="min-width:150px;">${typFilterOpts}</select>
    <select data-fusa-sch-filter-abr aria-label="Abrechnung filtern" style="min-width:180px;">${abrFilterOpts}</select>
    <input type="search" data-fusa-sch-search placeholder="Suche Titel, Fahrzeug, Melder…" style="flex:1;min-width:200px;max-width:320px;" />
    <button type="button" class="btn" data-fusa-sch-filter-reset>Alle zeigen</button>
  </div>

  <!-- Tabelle -->
  <div style="overflow-x:auto;">
  <table class="ckp-snapshot-ro-table" style="min-width:920px;">
    <thead>
      <tr>
        <th class="ckp-snapshot-ro-th" style="width:100px;">ID / Datum</th>
        <th class="ckp-snapshot-ro-th">Fahrzeug</th>
        <th class="ckp-snapshot-ro-th">Beschreibung</th>
        <th class="ckp-snapshot-ro-th" style="width:110px;">Schadentyp</th>
        <th class="ckp-snapshot-ro-th" style="width:130px;">Reparaturstatus</th>
        <th class="ckp-snapshot-ro-th" style="width:120px;">Abrechnung</th>
        <th class="ckp-snapshot-ro-th" style="width:90px;">WV-Datum</th>
        <th class="ckp-snapshot-ro-th" style="min-width:160px;">Aktion</th>
      </tr>
    </thead>
    <tbody data-fusa-sch-tbody>
      ${tableRows}
    </tbody>
  </table>
  </div>
</section>

${meldenModal}
${terminModal}
</div>`;
}

// ── Event-Handler (werden nach jedem Render neu gebunden) ───────────────────
/**
 * Bindet alle Schäden-Event-Handler. Wird von cockpit-shell.js aufgerufen.
 * @param {HTMLElement} root
 * @param {() => void} [reloadView]
 */
export function attachFusaSchaedenHandlers(root, reloadView) {
  if (typeof document === 'undefined' || !root) return;
  const scope = root.querySelector('[data-ccw-ro="fusa-schaeden"]') || root;
  const reload = typeof reloadView === 'function' ? reloadView : () => window.location.reload();

  // "Schaden melden" Button öffnet Modal
  scope.querySelectorAll('[data-fusa-sch-melden-btn]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = scope.querySelector('#fusa-sch-melden-modal');
      if (modal) modal.style.display = 'flex';
      syncMeldenFremdBlock();
    });
  });

  function syncMeldenFremdBlock() {
    const typEl = scope.querySelector('#fusa-sch-typ');
    const blk = scope.querySelector('[data-fusa-sch-fremd-block]');
    const abrEl = scope.querySelector('#fusa-sch-abr');
    if (!(typEl instanceof HTMLSelectElement) || !(blk instanceof HTMLElement)) return;
    const isFremd = typEl.value === 'Fremdschaden';
    blk.style.display = isFremd ? 'block' : 'none';
    if (isFremd && abrEl instanceof HTMLSelectElement && abrEl.value === 'nicht') abrEl.value = 'potenziell';
    if (!isFremd && abrEl instanceof HTMLSelectElement && abrEl.value === 'potenziell') abrEl.value = 'nicht';
  }

  // Modal schließen
  scope.querySelectorAll('[data-fusa-sch-modal-close]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modal = scope.querySelector('#fusa-sch-melden-modal');
      if (modal) {
        modal.style.display = 'none';
        modal.querySelector('form')?.reset();
        const md = scope.querySelector('#fusa-sch-meldedatum');
        if (md instanceof HTMLInputElement) md.value = new Date().toISOString().slice(0, 10);
        syncMeldenFremdBlock();
      }
      const msg = scope.querySelector('[data-fusa-schaden-msg]');
      if (msg) { msg.hidden = true; msg.textContent = ''; }
    });
  });

  scope.querySelector('#fusa-sch-typ')?.addEventListener('change', syncMeldenFremdBlock);
  syncMeldenFremdBlock();

  // Schaden-Formular absenden
  const schadenForm = scope.querySelector('[data-fusa-schaden-form]');
  if (schadenForm) {
    schadenForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(/** @type {HTMLFormElement} */ (schadenForm));
      const msg = scope.querySelector('[data-fusa-schaden-msg]');
      const submitBtn = schadenForm.querySelector('[type=submit]');
      if (submitBtn) submitBtn.disabled = true;
      try {
        const abLeg = String(fd.get('abrechnung_legacy') || 'nicht').trim();
        const body = {
          project_id: fd.get('project_id'),
          fahrzeug_id: fd.get('fahrzeug_id'),
          titel: fd.get('titel'),
          beschreibung: fd.get('beschreibung') || null,
          status: fd.get('status') || 'offen',
          typ: fd.get('typ') || null,
          prioritaet: fd.get('prioritaet') || 'normal',
          abrechnung_legacy: abLeg,
          wiedervorlage: fd.get('wiedervorlage') || null,
          melder_name: fd.get('melder_name') || null,
          meldedatum: fd.get('meldedatum') || null,
          klaerung: fd.get('klaerung') || 'offen',
          verursacher: fd.get('verursacher') || null,
          fremd_art: fd.get('fremd_art') || null,
          haftung_notiz: fd.get('haftung_notiz') || null,
          interne_notiz: fd.get('interne_notiz') || null,
          reparatur_phase: 'geplant',
        };
        await apiFetch(API_ROUTES.fusa.schaeden, { method: 'POST', body });
        const modal = scope.querySelector('#fusa-sch-melden-modal');
        if (modal) { modal.style.display = 'none'; schadenForm.reset(); }
        const md = scope.querySelector('#fusa-sch-meldedatum');
        if (md instanceof HTMLInputElement) md.value = new Date().toISOString().slice(0, 10);
        syncMeldenFremdBlock();
        reload();
      } catch (err) {
        if (msg) { msg.textContent = formatApiErrorForUi(err); msg.hidden = false; }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Filter-Logik
  const tbody = scope.querySelector('[data-fusa-sch-tbody]');
  if (tbody) {
    const applyFilter = () => {
      const rep = /** @type {HTMLSelectElement|null} */ (scope.querySelector('[data-fusa-sch-filter-rep]'))?.value || '';
      const typ = /** @type {HTMLSelectElement|null} */ (scope.querySelector('[data-fusa-sch-filter-typ]'))?.value || '';
      const abr = /** @type {HTMLSelectElement|null} */ (scope.querySelector('[data-fusa-sch-filter-abr]'))?.value || '';
      const q = (/** @type {HTMLInputElement|null} */ (scope.querySelector('[data-fusa-sch-search]'))?.value || '').toLowerCase().trim();
      tbody.querySelectorAll('[data-fusa-schaden-row]').forEach(row => {
        const tr = /** @type {HTMLElement} */ (row);
        const rowRep = tr.dataset.schRep || '';
        const rowTyp = tr.dataset.schTypAlt || '';
        const rowAbr = tr.dataset.schAbr || '';
        const rowHay = (tr.dataset.schSearch || '').toLowerCase();
        const ok =
          (!rep || rowRep === rep) && (!typ || rowTyp === typ) && (!abr || rowAbr === abr) && (!q || rowHay.includes(q));
        tr.style.display = ok ? '' : 'none';
        const sid = tr.dataset.ccwRowId || '';
        const sub = sid ? tbody.querySelector(`[data-fusa-sch-anfrage-for="${sid}"]`) : null;
        if (sub instanceof HTMLElement) sub.style.display = ok ? '' : 'none';
      });
    };
    scope.querySelector('[data-fusa-sch-filter-rep]')?.addEventListener('change', applyFilter);
    scope.querySelector('[data-fusa-sch-filter-typ]')?.addEventListener('change', applyFilter);
    scope.querySelector('[data-fusa-sch-filter-abr]')?.addEventListener('change', applyFilter);
    scope.querySelector('[data-fusa-sch-search]')?.addEventListener('input', applyFilter);
    scope.querySelector('[data-fusa-sch-filter-reset]')?.addEventListener('click', () => {
      scope.querySelectorAll('[data-fusa-sch-filter-rep],[data-fusa-sch-filter-typ],[data-fusa-sch-filter-abr]').forEach(s => {
        if (s instanceof HTMLSelectElement) s.value = '';
      });
      const search = scope.querySelector('[data-fusa-sch-search]');
      if (search instanceof HTMLInputElement) search.value = '';
      applyFilter();
    });
  }

  // Detail-Ansicht öffnen (Zeilen-Click oder Details-Button)
  scope.querySelectorAll('[data-fusa-schaden-open-detail]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const sid = /** @type {HTMLElement} */ (btn).dataset.fusaSchadenOpenDetail;
      if (sid) {
        CCState.set('fusaSchadenDetailId', sid);
        reload();
      }
    });
  });
  scope.querySelectorAll('.fusa-schaden-list-row').forEach(row => {
    row.addEventListener('click', () => {
      const sid = /** @type {HTMLElement} */ (row).dataset.ccwRowId;
      if (sid) {
        CCState.set('fusaSchadenDetailId', sid);
        reload();
      }
    });
  });

  /** @type {Record<string, unknown>|null} */
  let terminContextRow = null;
  /** @type {string|null} */
  let bestContextSchadenId = null;

  function updateTerminMailPreview() {
    const r = terminContextRow;
    const datumEl = /** @type {HTMLInputElement|null} */ (scope.querySelector('#fusa-sch-termin-datum'));
    const zeitEl = /** @type {HTMLSelectElement|null} */ (scope.querySelector('#fusa-sch-termin-zeit'));
    const wstEl = /** @type {HTMLSelectElement|null} */ (scope.querySelector('#fusa-sch-termin-werkstatt'));
    const notizEl = /** @type {HTMLInputElement|null} */ (scope.querySelector('#fusa-sch-termin-notiz'));
    const pre = scope.querySelector('[data-fusa-sch-termin-mailpre]');
    const mailA = scope.querySelector('[data-fusa-sch-termin-mailto]');
    if (!(pre instanceof HTMLElement)) return;
    const datum = datumEl?.value || '';
    const zeit = zeitEl?.value || '';
    const wst = wstEl?.value || '';
    const notiz = notizEl?.value || '';
    const mail = wst ? WERKSTATT_MAILS[wst] || '' : '';
    if (mailA instanceof HTMLAnchorElement) {
      const subj = encodeURIComponent(`Reparaturtermin / Schaden ${r?.id != null ? String(r.id) : ''}`);
      const fz = String(r?.fahrzeug_kennung || r?.fahrzeug_id || '—');
      const titel = String(r?.titel || '—');
      const typLbl = String(r?.typ || '—');
      const bodyLines = [
        `Fahrzeug: ${fz}`,
        `Schaden: ${titel}`,
        `Schadentyp: ${typLbl}`,
        `Wunschtermin: ${formatDatumDeLong(datum)}`,
        `Uhrzeit: ${zeit}`,
        notiz ? `Notiz: ${notiz}` : '',
      ].filter(Boolean);
      mailA.href = mail ? `mailto:${mail}?subject=${subj}&body=${encodeURIComponent(bodyLines.join('\n'))}` : '#';
    }
    if (!wst) {
      pre.textContent = '— Werkstatt wählen —';
      return;
    }
    const fz = esc(String(r?.fahrzeug_kennung || r?.fahrzeug_id || '—'));
    const titel = esc(String(r?.titel || '—'));
    const typLbl = esc(String(r?.typ || '—'));
    pre.innerHTML = `<div style="color:#2E7D32;font-weight:600;margin-bottom:6px;">An: ${esc(mail || '(keine E-Mail)')}</div>` +
      `<div><b>Fahrzeug:</b> ${fz}<br><b>Schaden:</b> ${titel}<br><b>Schadentyp:</b> ${typLbl}<br>` +
      `<b>Wunschtermin:</b> ${esc(formatDatumDeLong(datum))}<br><b>Uhrzeit:</b> ${esc(zeit || '—')}<br>` +
      `${notiz ? `<b>Notiz:</b> ${esc(notiz)}<br>` : ''}</div>` +
      `<div style="margin-top:8px;font-size:10px;color:#666;">Manuelle Bestätigung / Abbruch in der Schadenliste.</div>`;
  }

  async function openTerminModalForSchaden(sidRaw) {
    const sid = String(sidRaw || '').trim();
    if (!sid) return;
    terminContextRow = null;
    try {
      const d = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`);
      terminContextRow =
        d && typeof d === 'object' && /** @type {any} */ (d).schaden && typeof /** @type {any} */ (d).schaden === 'object'
          ? /** @type {Record<string, unknown>} */ (/** @type {any} */ (d).schaden)
          : null;
    } catch {
      terminContextRow = null;
    }
    const modal = scope.querySelector('#fusa-sch-termin-modal');
    const idInput = modal?.querySelector('[data-fusa-sch-termin-id]');
    if (idInput instanceof HTMLInputElement) idInput.value = sid;
    const sub = scope.querySelector('[data-fusa-sch-termin-sub]');
    const info = scope.querySelector('[data-fusa-sch-termin-info]');
    const r = terminContextRow;
    if (sub instanceof HTMLElement) {
      sub.textContent = r?.id != null ? `${String(r.id)} · ${String(r.fahrzeug_kennung || r.fahrzeug_id || '')}` : sid;
    }
    if (info instanceof HTMLElement && r) {
      const gem = r.melder_name != null ? String(r.melder_name) : '—';
      const fremd =
        String(r.typ || '') === 'Fremdschaden'
          ? `<br><span style="color:#C62828;font-weight:600;">Fremdschaden · ${esc(String(r.verursacher || 'Verursacher unbekannt'))}</span>`
          : '';
      info.innerHTML = `<b>Fahrzeug:</b> ${esc(String(r.fahrzeug_kennung || r.fahrzeug_id || '—'))} &nbsp; <b>Typ:</b> ${esc(String(r.typ || '—'))}<br>` +
        `<b>Titel:</b> ${esc(String(r.titel || '—'))}<br><b>Gemeldet von:</b> ${esc(gem)}${fremd}`;
    } else if (info instanceof HTMLElement) {
      info.textContent = 'Schadendaten konnten nicht geladen werden.';
    }
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    const de = /** @type {HTMLInputElement|null} */ (scope.querySelector('#fusa-sch-termin-datum'));
    if (de) de.value = morgen.toISOString().slice(0, 10);
    updateTerminMailPreview();
    if (modal instanceof HTMLElement) modal.style.display = 'flex';
  }

  function closeTerminModal() {
    const modal = scope.querySelector('#fusa-sch-termin-modal');
    if (modal) {
      modal.style.display = 'none';
      modal.querySelector('form')?.reset();
    }
    terminContextRow = null;
  }

  function closeBestModal() {
    const m = scope.querySelector('#fusa-sch-best-modal');
    if (m instanceof HTMLElement) m.style.display = 'none';
    bestContextSchadenId = null;
    const msg = scope.querySelector('[data-fusa-sch-best-msg]');
    if (msg instanceof HTMLElement) { msg.hidden = true; msg.textContent = ''; }
  }

  scope.querySelectorAll('[data-fusa-sch-termin-btn]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sid = /** @type {HTMLElement} */ (btn).dataset.fusaSchTerminBtn;
      void openTerminModalForSchaden(sid);
    });
  });
  scope.querySelectorAll('[data-fusa-sch-termin-close]').forEach(btn => {
    btn.addEventListener('click', () => closeTerminModal());
  });
  ['#fusa-sch-termin-datum', '#fusa-sch-termin-zeit', '#fusa-sch-termin-werkstatt', '#fusa-sch-termin-notiz'].forEach(sel => {
    scope.querySelector(sel)?.addEventListener('input', updateTerminMailPreview);
    scope.querySelector(sel)?.addEventListener('change', updateTerminMailPreview);
  });

  const terminForm = scope.querySelector('[data-fusa-sch-termin-form]');
  if (terminForm) {
    terminForm.addEventListener('submit', async e => {
      e.preventDefault();
      const fd = new FormData(/** @type {HTMLFormElement} */ (terminForm));
      const sid = String(scope.querySelector('[data-fusa-sch-termin-id]')?.value || '').trim();
      const msg = scope.querySelector('[data-fusa-sch-termin-msg]');
      const submitBtn = terminForm.querySelector('[data-fusa-sch-termin-submit]');
      if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = true;
      try {
        const wst = String(fd.get('werkstatt') || '').trim();
        const wdat = String(fd.get('wunschdatum') || '').trim();
        if (!wdat) throw new Error('Bitte Wunschdatum wählen.');
        if (!wst) throw new Error('Bitte Werkstatt wählen.');
        const zeit = String(fd.get('wunschzeit') || '').trim();
        const notiz = String(fd.get('notiz') || '').trim();
        const jetzt = new Date();
        const terminanfrage = {
          werkstatt: wst,
          wunschdatum: wdat,
          wunschdatum_fmt: formatDatumDeLong(wdat),
          wunschzeit: zeit || null,
          notiz: notiz || null,
          angefragt_am: jetzt.toISOString().slice(0, 10),
          angefragt_zeit: `${String(jetzt.getHours()).padStart(2, '0')}:${String(jetzt.getMinutes()).padStart(2, '0')} Uhr`,
          empfaenger: WERKSTATT_MAILS[wst] || wst,
        };
        if (!sid) throw new Error('Schaden-ID fehlt');
        await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, {
          method: 'PATCH',
          body: { terminanfrage, reparatur_phase: 'termin_gesendet', status: 'in_bearbeitung' },
        });
        closeTerminModal();
        await reload();
      } catch (err) {
        const errTxt = err instanceof Error ? err.message : formatApiErrorForUi(err);
        if (msg instanceof HTMLElement) {
          msg.textContent = errTxt;
          msg.hidden = false;
          msg.className = 'ckp-api-error';
        }
      } finally {
        if (submitBtn instanceof HTMLButtonElement) submitBtn.disabled = false;
      }
    });
  }

  scope.querySelectorAll('[data-fusa-sch-manual-bestaetigt]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const sid = /** @type {HTMLElement} */ (btn).dataset.fusaSchManualBestaetigt;
      if (!sid) return;
      try {
        await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, {
          method: 'PATCH',
          body: { reparatur_phase: 'termin_bestaetigt' },
        });
        await reload();
      } catch (err) {
        window.alert(formatApiErrorForUi(err));
      }
    });
  });

  scope.querySelectorAll('[data-fusa-sch-termin-abbruch]').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const sid = /** @type {HTMLElement} */ (btn).dataset.fusaSchTerminAbbruch;
      if (!sid || !window.confirm('Terminanfrage wirklich zurücknehmen?')) return;
      try {
        await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, {
          method: 'PATCH',
          body: { terminanfrage: null, reparatur_phase: 'geplant', status: 'offen' },
        });
        await reload();
      } catch (err) {
        window.alert(formatApiErrorForUi(err));
      }
    });
  });

  async function openBestModal(sidRaw) {
    const sid = String(sidRaw || '').trim();
    if (!sid) return;
    bestContextSchadenId = sid;
    let r = null;
    try {
      const d = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`);
      r =
        d && typeof d === 'object' && /** @type {any} */ (d).schaden && typeof /** @type {any} */ (d).schaden === 'object'
          ? /** @type {any} */ (d).schaden
          : null;
    } catch {
      r = null;
    }
    const body = scope.querySelector('[data-fusa-sch-best-body]');
    const ta = r?.terminanfrage && typeof r.terminanfrage === 'object' ? /** @type {Record<string, unknown>} */ (r.terminanfrage) : {};
    if (body instanceof HTMLElement && r) {
      body.innerHTML =
        `<div style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:10px;padding:14px;margin-bottom:12px;">` +
        `<div style="font-weight:700;color:#2E7D32;margin-bottom:8px;">Auftrag vorbereiten</div>` +
        `<div><b>Fahrzeug:</b> ${esc(String(r.fahrzeug_kennung || r.fahrzeug_id || '—'))}<br>` +
        `<b>Schadentyp:</b> ${esc(String(r.typ || '—'))}<br>` +
        `<b>Schaden:</b> ${esc(String(r.titel || '—'))}<br>` +
        `<b>Termin:</b> ${esc(String(ta.wunschdatum_fmt || ta.wunschdatum || '—'))} · ${esc(String(ta.wunschzeit || ''))}<br>` +
        `<b>Werkstatt:</b> ${esc(String(ta.werkstatt || '—'))}<br>` +
        `${String(r.typ) === 'Fremdschaden' ? `<b>Verursacher:</b> ${esc(String(r.verursacher || '—'))}<br>` : ''}` +
        `</div>` +
        `<p style="font-size:12px;color:#64748b;">Der Auftrag wird im Auftrags-Wizard angelegt; Kontext wird in die interne Notiz übernommen.</p>`;
    } else if (body instanceof HTMLElement) {
      body.textContent = 'Schaden nicht ladbar.';
    }
    const m = scope.querySelector('#fusa-sch-best-modal');
    if (m instanceof HTMLElement) m.style.display = 'flex';
  }

  scope.querySelectorAll('[data-fusa-sch-best-open]').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const sid = /** @type {HTMLElement} */ (btn).dataset.fusaSchBestOpen;
      void openBestModal(sid);
    });
  });
  scope.querySelectorAll('[data-fusa-sch-best-close]').forEach(btn => {
    btn.addEventListener('click', () => closeBestModal());
  });
  scope.querySelector('[data-fusa-sch-best-ablehnen]')?.addEventListener('click', async () => {
    const sid = bestContextSchadenId;
    if (!sid || !window.confirm('Termin ablehnen und zur Planung zurücksetzen?')) return;
    try {
      await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, {
        method: 'PATCH',
        body: { terminanfrage: null, reparatur_phase: 'geplant', status: 'offen' },
      });
      closeBestModal();
      await reload();
    } catch (err) {
      window.alert(formatApiErrorForUi(err));
    }
  });
  scope.querySelector('[data-fusa-sch-best-confirm]')?.addEventListener('click', async () => {
    const sid = bestContextSchadenId;
    if (!sid) return;
    let r = null;
    try {
      const d = await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`);
      r =
        d && typeof d === 'object' && /** @type {any} */ (d).schaden && typeof /** @type {any} */ (d).schaden === 'object'
          ? /** @type {any} */ (d).schaden
          : null;
    } catch {
      r = null;
    }
    const vm = r ? mapSchadenApiRowToViewModel(/** @type {Record<string, unknown>} */ (r)) : null;
    const notiz = vm ? buildSchadenWizardNotizFromVm(vm) : `Schaden ${sid}`;
    try {
      await apiFetch(`${API_ROUTES.fusa.schaeden}/${encodeURIComponent(sid)}`, {
        method: 'PATCH',
        body: { reparatur_phase: 'in_reparatur', status: 'in_bearbeitung' },
      });
    } catch (err) {
      window.alert(formatApiErrorForUi(err));
      return;
    }
    closeBestModal();
    document.dispatchEvent(
      new CustomEvent('ccw:fusa-navigate', {
        detail: {
          view: 'fusa_auftraege',
          fusaAuftragNeuOpenWizard: true,
          fusaAuftragNeuFahrzeugId: r?.fahrzeug_id != null ? String(r.fahrzeug_id) : null,
          fusaAuftragNeuInternNotiz: notiz,
        },
      }),
    );
  });

  const meldFz = CCState.get('fusaSchaedenMeldenFahrzeugId');
  if (meldFz != null && String(meldFz).trim()) {
    const v = String(meldFz).trim();
    const sel = scope.querySelector('#fusa-sch-fz');
    if (sel instanceof HTMLSelectElement) {
      const ok = [...sel.options].some(o => o.value === v);
      if (ok) sel.value = v;
    }
    const modal = scope.querySelector('#fusa-sch-melden-modal');
    if (modal instanceof HTMLElement) modal.style.display = 'flex';
    CCState.set('fusaSchaedenMeldenFahrzeugId', null);
  }

}
  