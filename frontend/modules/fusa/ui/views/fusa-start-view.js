/**
 * FUSA — Dashboard / Start: UI an `FUSA_UMZUG_FERTIG` `#pg-dashboard` (stats, g2, panels).
 * Daten: `GET /projects`, `GET /api/v1/fusa/auftraege`, `GET /fahrzeuge`, `GET /schaeden`, `GET /auth/my-rights` — View-Modell {@link mapFusaDashboardToViewModel}.
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';
import { fetchFusaApiAuftraege } from '../../fusa-api-data-port.js';
import { mapFusaDashboardToViewModel } from '../../lib/fusa-dashboard-view-model.js';

/**
 * @returns {Promise<string>}
 */
export async function renderFusaStartViewHtml() {
  let loadErr = '';
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let auftraegeAll = [];
  /** @type {object[]} */
  let fahrzeugeAll = [];
  /** @type {object[]} */
  let schaedenAll = [];
  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    projects = Array.isArray(pr.projects) ? pr.projects.filter(p => p && p.id != null) : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  try {
    auftraegeAll = await fetchFusaApiAuftraege();
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }
  try {
    const fr = await apiFetch(API_ROUTES.fusa.fahrzeuge);
    fahrzeugeAll = Array.isArray(fr.fahrzeuge) ? fr.fahrzeuge : [];
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }
  try {
    const sr = await apiFetch(API_ROUTES.fusa.schaeden);
    schaedenAll = Array.isArray(sr.schaeden) ? sr.schaeden : [];
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  await ensureFusaProjectSelection(projects);
  const ctx = getFusaAppProject();
  const pid = ctx && ctx.id ? String(ctx.id) : '';
  const projName = ctx && ctx.name != null && String(ctx.name).trim() !== '' ? String(ctx.name) : '—';

  const vm = mapFusaDashboardToViewModel({
    projectId: pid,
    projectName: projName,
    auftraegeAll,
    fahrzeugeAll,
    schaedenAll,
    loadError: loadErr,
  });

  const quickBody =
    vm.quickRows.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text2,#64748b);">Keine Aufträge in diesem Projekt</td></tr>`
      : vm.quickRows
          .map(
            r =>
              `<tr><td><div class="tm" style="font-weight:600;">${esc(r.title)}</div><div class="ts" style="font-size:11px;color:var(--text2,#94a3b8);">${esc(r.id)}</div></td>
      <td>${esc(r.kunde)}</td><td>${esc(r.fzLine)}</td><td>${esc(r.lauf)}</td><td><span class="${esc(r.statusBdgClass)}">${esc(r.statusLabel)}</span></td></tr>`,
          )
          .join('');

  const quartBody =
    vm.quartalRows.length === 0
      ? `<tr><td colspan="5" style="text-align:center;padding:16px;color:var(--text2,#64748b);">Keine Quartals-Vorschau in den Auftragsdaten. <button type="button" class="btn" style="font-size:12px;margin-top:8px;" data-ccw-open-fusa-view="fusa_quartalsabrechnung">Quartalsabrechnung öffnen</button></td></tr>`
      : vm.quartalRows
          .map(
            q =>
              `<tr><td class="tm">${esc(q.auftragLabel)}</td><td>${esc(q.quartal)}</td><td>${esc(q.zeitraum)}</td><td style="font-weight:700;color:var(--green,#2E7D32);">${esc(q.betrag)}</td><td><span class="bdg ${esc(q.statusBdg)}">${esc(q.statusLabel)}</span></td></tr>`,
          )
          .join('');

  const warnHtml =
    vm.warnings.length === 0
      ? `<p class="ckp-mock-note" role="status">Keine automatischen Warnungen aus den aktuellen API-Daten.</p>`
      : vm.warnings
          .map(w => {
            const cls = w.tone === 'r' ? 'r' : w.tone === 'a' ? 'a' : 'b';
            const ic = w.tone === 'r' ? '🔴' : w.tone === 'a' ? '🟡' : 'ℹ';
            return `<div class="warnbox ${cls}"><div class="wi">${ic}</div><div class="wt"><strong>${esc(w.title)}</strong><br>${esc(w.body)}</div></div>`;
          })
          .join('');

  const fz = vm.fzStatus;

  return `<div class="ckp-fusa-start fusa-dash-scope" data-ccw-ro="fusa-start">
<style>
.fusa-dash-scope .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px;}
@media (max-width:900px){.fusa-dash-scope .stats{grid-template-columns:repeat(2,1fr);}}
.fusa-dash-scope .sc{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:12px 14px;display:flex;gap:12px;align-items:flex-start;}
.fusa-dash-scope .sc-ico{width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;}
.fusa-dash-scope .sc-n{font-size:22px;font-weight:700;line-height:1.1;}
.fusa-dash-scope .sc-l{font-size:12px;font-weight:600;color:#334155;margin-top:4px;}
.fusa-dash-scope .sc-t{font-size:10px;color:#94a3b8;margin-top:2px;}
.fusa-dash-scope .sc-t.up::before{content:'▲ ';font-size:8px;}
.fusa-dash-scope .sc-t.dn::before{content:'▼ ';font-size:8px;}
.fusa-dash-scope .g2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
@media (max-width:1000px){.fusa-dash-scope .g2{grid-template-columns:1fr;}}
.fusa-dash-scope .panel{background:#fff;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:14px;overflow:hidden;}
.fusa-dash-scope .ph{padding:12px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;}
.fusa-dash-scope .ph-title{font-size:14px;font-weight:700;}
.fusa-dash-scope .panel table{width:100%;border-collapse:collapse;font-size:12px;}
.fusa-dash-scope .panel th,.fusa-dash-scope .panel td{padding:10px 14px;text-align:left;border-bottom:1px solid #f1f5f9;}
.fusa-dash-scope .panel thead th{font-size:11px;font-weight:600;color:#64748b;text-transform:uppercase;}
.fusa-dash-scope .warnbox{display:flex;gap:10px;padding:10px 12px;border-radius:8px;font-size:12px;}
.fusa-dash-scope .warnbox.r{background:#FFEBEE;border:1px solid #FFCDD2;}
.fusa-dash-scope .warnbox.a{background:#FFF8E1;border:1px solid #FFE082;}
.fusa-dash-scope .warnbox.b{background:#E3F2FD;border:1px solid #BBDEFB;}
.fusa-dash-scope .wi{flex-shrink:0;}
.fusa-dash-scope .prog{height:8px;background:#e2e8f0;border-radius:6px;overflow:hidden;}
.fusa-dash-scope .prog-f{height:100%;border-radius:6px;}
.fusa-dash-scope .bdg{display:inline-flex;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;}
.fusa-dash-scope .bdg.bb{background:#FFF0E6;color:#D4500A;}
.fusa-dash-scope .bdg.bg{background:#E8F5E9;color:#2E7D32;}
.fusa-dash-scope .bdg.ba{background:#FFF3E0;color:#E65100;}
.fusa-dash-scope .bdg.bp{background:#EDE7F6;color:#4527A0;}
.fusa-dash-scope .bdg.br{background:#FFEBEE;color:#C62828;}
.fusa-dash-scope .bdg.bgr{background:#ECEFF1;color:#546E7A;}
</style>
  ${vm.loadError ? `<p class="ckp-api-error" role="alert">${esc(vm.loadError)}</p>` : ''}

  <div class="stats">
    <div class="sc">
      <div class="sc-ico" style="background:var(--blue-l,#FFF0E6)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#D4500A" stroke-width="2" aria-hidden="true"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg></div>
      <div><div class="sc-n" style="color:#D4500A">${esc(String(vm.kpiAktiveAuftraege))}</div><div class="sc-l">Aktive Aufträge</div><div class="sc-t up">Projektbezogen</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--green-l,#E8F5E9)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#2E7D32" stroke-width="2" aria-hidden="true"><rect x="1" y="3" width="22" height="16" rx="2"/><path d="M8 21h8M12 17v4"/></svg></div>
      <div><div class="sc-n" style="color:#2E7D32">${esc(String(vm.kpiFahrzeuge))}</div><div class="sc-l">Fahrzeuge (Projekt)</div><div class="sc-t up">Alle im Filter</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--amber-l,#FFF3E0)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#E65100" stroke-width="2" aria-hidden="true"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 100 7h5a3.5 3.5 0 110 7H6"/></svg></div>
      <div><div class="sc-n" style="color:#E65100">${esc(vm.kpiOffenePostenDisplay)}</div><div class="sc-l">Offene Posten (netto sichtbar)</div><div class="sc-t dn">${esc(vm.kpiOffenePostenSub2)}</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--red-l,#FFEBEE)"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#C62828" stroke-width="2" aria-hidden="true"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
      <div><div class="sc-n" style="color:#C62828">${esc(String(vm.kpiEndetBald))}</div><div class="sc-l">Endet bald</div><div class="sc-t dn">im aktiven Projekt</div></div>
    </div>
  </div>
  <p class="ckp-mock-note" style="font-size:11px;margin:-6px 0 14px;">${esc(vm.kpiOffenePostenSub)}</p>

  <div class="g2">
    <div>
      <div class="panel">
        <div class="ph"><div class="ph-title">Aktuelle Aufträge</div><button type="button" class="btn" style="font-size:12px;" data-ccw-open-fusa-view="fusa_auftraege">Alle →</button></div>
        <table>
          <thead><tr><th>Auftrag</th><th>Kunde</th><th>Fahrzeug</th><th>Laufzeit</th><th>Status</th></tr></thead>
          <tbody>${quickBody}</tbody>
        </table>
      </div>
      <div class="panel">
        <div class="ph"><div class="ph-title">Nächste Quartalsrechnungen</div><button type="button" class="btn" style="font-size:12px;" data-ccw-open-fusa-view="fusa_quartalsabrechnung">Bereich öffnen</button></div>
        <table>
          <thead><tr><th>Auftrag</th><th>Quartal</th><th>Zeitraum</th><th>Betrag</th><th>Status</th></tr></thead>
          <tbody>${quartBody}</tbody>
        </table>
      </div>
    </div>
    <div>
      <div class="panel">
        <div class="ph"><div class="ph-title">Warnungen</div><button type="button" class="btn" style="font-size:12px;" data-ccw-open-fusa-view="fusa_schaeden">Schäden</button></div>
        <div style="padding:12px 16px;display:flex;flex-direction:column;gap:8px;">${warnHtml}</div>
      </div>
      <div class="panel">
        <div class="ph"><div class="ph-title">Fahrzeugstatus</div><button type="button" class="btn" style="font-size:12px;" data-ccw-open-fusa-view="fusa_fahrzeuge">Fahrzeuge</button></div>
        <div style="padding:12px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;"><span style="font-size:12px;">Belegt / sonstige</span><span style="font-size:12px;font-weight:600;color:#D4500A">${esc(String(fz.belegt))} / ${esc(String(fz.total))}</span></div>
          <div class="prog"><div class="prog-f" style="width:${esc(String(fz.pctBelegt))}%;background:#D4500A"></div></div>
          <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:12px;text-align:center;">
            <div style="background:#FFF0E6;border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;color:#D4500A">${esc(String(fz.belegt))}</div><div style="font-size:10px;color:#64748b;">Belegt+</div></div>
            <div style="background:#E8F5E9;border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;color:#2E7D32">${esc(String(fz.frei))}</div><div style="font-size:10px;color:#64748b;">Frei</div></div>
            <div style="background:#FFEBEE;border-radius:8px;padding:8px;"><div style="font-size:16px;font-weight:700;color:#C62828">${esc(String(fz.schaden))}</div><div style="font-size:10px;color:#64748b;">Schaden</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>`;
}
