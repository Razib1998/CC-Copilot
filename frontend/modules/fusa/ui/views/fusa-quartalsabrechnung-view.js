/**
 * **ALT-QUELLE (verbindlich):** `c:\Users\CC\Desktop\FUSA_CLEAN - Code\DEV\`
 *
 * **Regel:** UI, Struktur, Reihenfolge, Infobox, Export-Leiste, Haupttabelle, Drawer, Buttons und Bedienablauf
 * **so nah wie möglich 1:1** aus der Alt-Quelle (`templates.js` #pg-quartale, `logic/export.js` — Quartalsseite).
 * Keine neue Fantasie-UI.
 *
 * Diese Datei **lädt API-Daten** und **rendert HTML**. Fachlogik (Filter, Quartal, Gruppen, Summen, Status, Sortierung)
 * liegt ausschließlich in `fusa-quartalsabrechnung-aggregate.js`.
 *
 * **Daten:** `GET /api/v1/fusa/rechnungen` = einzige fachliche Hauptquelle für Quartalsauswertung.
 * **Aufträge:** nur `GET /api/v1/fusa/auftraege`, um Auftrags-IDs des gewählten Projekts zu ermitteln (Projektfilter auf Rechnungen) — keine Quartalsberechnung aus Aufträgen.
 * **Firmen:** nur `GET /api/v1/firmen` für Kundennamen (`kunde_id`).
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';
import { fetchFusaApiAuftraege, fetchFusaApiRechnungen } from '../../fusa-api-data-port.js';
import { formatEuroDe } from '../../lib/fusa-rechnung-view-model.js';
import {
  buildQuartalsabrechnungFachmodell,
  buildQuartalsCsvExportRows,
  formatQuartalLabel,
  quartalsAggregatStatusBadge,
  quartalsDetailZeileFromApiRow,
} from '../../lib/fusa-quartalsabrechnung-aggregate.js';
import { getRechnungStatusUi } from '../../lib/fusa-rechnung-ui-status.js';
import { setFusaRechnungenAfterMountActions } from './fusa-rechnungen-view.js';

/** @type {AbortController|null} */
let qAbort = null;

/**
 * @param {HTMLElement} root
 * @param {string} msg
 */
function flashQ(root, msg) {
  const el = root.querySelector('[data-fusa-q-result]');
  if (!(el instanceof HTMLElement)) return;
  el.textContent = msg;
  window.setTimeout(() => {
    el.textContent = '';
  }, 4200);
}

/**
 * @param {string} s
 */
function utf8ToB64(s) {
  try {
    return btoa(unescape(encodeURIComponent(s)));
  } catch {
    return '';
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderFusaQuartalsabrechnungViewHtml() {
  let loadErr = '';
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let auftraegeAll = [];
  /** @type {object[]} */
  let rechnungenRaw = [];
  /** @type {object[]} */
  let firmenRows = [];
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
    auftraegeAll = [];
  }
  try {
    rechnungenRaw = await fetchFusaApiRechnungen();
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
    rechnungenRaw = [];
  }
  try {
    const fr = await apiFetch(API_ROUTES.cockpit.firmen);
    firmenRows = Array.isArray(fr?.firmen) ? fr.firmen : [];
  } catch {
    firmenRows = [];
  }

  await ensureFusaProjectSelection(projects);
  const ctx = getFusaAppProject();
  const pid = ctx && ctx.id ? String(ctx.id) : '';

  const fach = buildQuartalsabrechnungFachmodell({
    rechnungenRaw,
    auftraegeAll,
    projectId: pid,
    firmenRows,
  });

  const { gruppen, summenZeilen, firmaNamesObj, exportJahreSorted, curY } = fach;

  const exportJahrOpts = exportJahreSorted
    .map(y => `<option value="${y}"${y === curY ? ' selected' : ''}>${y}</option>`)
    .join('');

  const payloadB64 = utf8ToB64(JSON.stringify({ gruppen, summenZeilen, firmaNames: firmaNamesObj }));

  const tableRows =
    summenZeilen.length === 0
      ? `<tr><td colspan="6" style="text-align:center;padding:16px;color:#64748b;">Keine Quartalsrechnungen (<code>abrechnungsart: quartal</code>) für dieses Projekt.</td></tr>`
      : summenZeilen
          .map(row => {
            const st = quartalsAggregatStatusBadge(row.status);
            return `<tr class="fusa-q-main-row" style="cursor:pointer;" data-fusa-q-row-key="${esc(row.key)}" tabindex="0" role="button">
          <td class="tm">${esc(row.quartalLabel)}</td>
          <td>${esc(String(row.anzahl))}</td>
          <td style="font-weight:700;">${esc(formatEuroDe(row.nettoSumme))}</td>
          <td style="font-weight:700;">${esc(formatEuroDe(row.bruttoSumme))}</td>
          <td><span class="bdg b${esc(st.cls)}">${esc(st.lbl)}</span></td>
          <td><button type="button" class="btn" style="font-size:11px;padding:4px 10px;" data-fusa-q-open-key="${esc(row.key)}">Details</button></td>
        </tr>`;
          })
          .join('');

  return `<div data-ccw-ro="fusa-quartalsabrechnung" class="fq-scope" data-fusa-q-payload-b64="${esc(payloadB64)}">
<style>
.fq-scope{--fq-red:#C62828;--fq-red-l:#FFEBEE;--fq-amber:#E65100;--fq-amber-l:#FFF3E0;--fq-blue:#1565C0;--fq-blue-l:#E3F2FD;--fq-green:#2E7D32;--fq-green-l:#E8F5E9;--fq-purple:#4527A0;--fq-purple-l:#EDE7F6;--fq-gray:#546E7A;--fq-gray-l:#ECEFF1;}
.fq-scope .warnbox.b{display:flex;gap:10px;align-items:flex-start;margin-bottom:16px;padding:12px 14px;background:var(--fq-blue-l);border-radius:var(--border-radius-md,10px);border:1px solid #BBDEFB;}
.fq-scope .warnbox .wi{flex-shrink:0;width:28px;height:28px;border-radius:8px;background:#fff;display:flex;align-items:center;justify-content:center;font-weight:700;color:var(--fq-blue);}
.fq-scope .warnbox .wt{font-size:13px;color:#0f172a;}
.fq-scope .fq-export{display:flex;align-items:center;gap:10px;margin-bottom:16px;padding:10px 14px;background:var(--fq-gray-l);border-radius:10px;border:1px solid #e2e8f0;flex-wrap:wrap;}
.fq-scope .fq-export .fs{font:inherit;font-size:12px;padding:4px 8px;border-radius:6px;border:1px solid #cbd5e1;}
.fq-scope .fq-export .btn{font:inherit;font-size:12px;padding:6px 10px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;display:inline-flex;align-items:center;gap:6px;}
.fq-scope .bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}
.fq-scope .bdg::before{content:'';width:5px;height:5px;border-radius:50%;}
.fq-scope .bdg.br{background:var(--fq-red-l);color:var(--fq-red)} .fq-scope .bdg.br::before{background:var(--fq-red)}
.fq-scope .bdg.ba{background:var(--fq-amber-l);color:var(--fq-amber)} .fq-scope .bdg.ba::before{background:var(--fq-amber)}
.fq-scope .bdg.bg{background:var(--fq-green-l);color:var(--fq-green)} .fq-scope .bdg.bg::before{background:var(--fq-green)}
.fq-scope .bdg.bb{background:var(--fq-blue-l);color:var(--fq-blue)} .fq-scope .bdg.bb::before{background:var(--fq-blue)}
.fq-scope .bdg.bgr{background:var(--fq-gray-l);color:var(--fq-gray)} .fq-scope .bdg.bgr::before{background:var(--fq-gray)}
.fq-scope .tm{font-weight:600;}
.fq-scope .btn{font:inherit;cursor:pointer;border-radius:7px;border:1px solid #cbd5e1;background:#fff;}
.fq-draw{position:fixed;inset:0;z-index:10030;visibility:hidden;pointer-events:none;}
.fq-draw.fq-draw--open{visibility:visible;pointer-events:auto;}
.fq-draw-back{position:absolute;inset:0;background:rgba(15,23,42,0.45);opacity:0;transition:opacity .2s ease;}
.fq-draw.fq-draw--open .fq-draw-back{opacity:1;}
.fq-draw-panel{position:absolute;top:0;right:0;bottom:0;width:min(560px,100%);max-width:100%;background:#fff;box-shadow:-8px 0 32px rgba(0,0,0,0.12);transform:translateX(100%);transition:transform .22s ease;display:flex;flex-direction:column;}
.fq-draw.fq-draw--open .fq-draw-panel{transform:translateX(0);}
.fq-draw-h{padding:14px 16px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;gap:10px;}
.fq-draw-h h3{margin:0;font-size:16px;font-weight:700;}
.fq-draw-body{flex:1;overflow:auto;padding:12px 16px 16px;}
.fq-draw-foot{padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;}
.fq-draw table{width:100%;border-collapse:collapse;font-size:12px;}
.fq-draw th,.fq-draw td{padding:8px 6px;border-bottom:1px solid #e2e8f0;text-align:left;}
.fq-draw th{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#64748b;background:#f8fafc;}
.fq-draw td.re-num{text-align:right;font-weight:600;}
</style>
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}

  <div class="warnbox b" style="margin-bottom:16px;">
    <div class="wi">ℹ</div>
    <div class="wt"><strong>Automatische Quartalsabrechnung:</strong> Rechnungsperioden werden automatisch aus Auftragsstart und Abrechnungsart berechnet. Klick auf eine Periode → Rechnung erstellen.</div>
  </div>

  <div class="fq-export">
    <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="#64748b" stroke-width="2" aria-hidden="true"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
    <span style="font-size:12px;color:#64748b;">Abrechnungsliste exportieren:</span>
    <select class="fs" data-fusa-q-ex-jahr aria-label="Export Jahr">${exportJahrOpts}</select>
    <select class="fs" data-fusa-q-ex-q aria-label="Quartal">
      <option value="">Alle Quartale</option>
      <option value="Q1">Q1 (Jan–Mär)</option>
      <option value="Q2">Q2 (Apr–Jun)</option>
      <option value="Q3">Q3 (Jul–Sep)</option>
      <option value="Q4">Q4 (Okt–Dez)</option>
    </select>
    <button type="button" class="btn" data-fusa-q-excel><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>Excel exportieren</button>
    <button type="button" class="btn" data-fusa-q-csv><svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>CSV exportieren</button>
    <span style="margin-left:auto;font-size:11px;color:#94a3b8;">Quartal aus Rechnungsdatum bzw. Zeitraum von · nur API</span>
  </div>

  <div class="panel" data-fusa-q-panel>
    <table>
      <thead>
        <tr>
          <th>Quartal</th>
          <th>Anzahl Rechnungen</th>
          <th>Netto Gesamt</th>
          <th>Brutto Gesamt</th>
          <th>Status</th>
          <th>Aktionen</th>
        </tr>
      </thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>

  <p style="margin-top:10px;font-size:12px;color:#64748b;" data-fusa-q-result role="status"></p>

  <div class="fq-draw" data-fusa-q-draw aria-hidden="true">
    <div class="fq-draw-back" data-fusa-q-draw-back tabindex="-1"></div>
    <div class="fq-draw-panel" role="dialog" aria-modal="true" aria-labelledby="fusa-q-draw-title">
      <div class="fq-draw-h">
        <h3 id="fusa-q-draw-title" data-fusa-q-draw-title>—</h3>
        <button type="button" class="btn" data-fusa-q-draw-x style="background:none;border:none;font-size:22px;line-height:1;color:#64748b;" aria-label="Schließen">×</button>
      </div>
      <div class="fq-draw-body">
        <table>
          <thead>
            <tr>
              <th>Rechnungsnummer</th>
              <th>Kunde</th>
              <th>Zeitraum</th>
              <th class="re-num">Netto</th>
              <th class="re-num">Brutto</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody data-fusa-q-draw-tbody></tbody>
        </table>
      </div>
      <div class="fq-draw-foot">
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-q-draw-neu>Neue Rechnung</button>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} _onReload
 */
export function attachFusaQuartalsabrechnungHandlers(mount, _onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="fusa-quartalsabrechnung"]');
  if (!(root instanceof HTMLElement)) return;

  if (qAbort) qAbort.abort();
  qAbort = new AbortController();
  const sig = qAbort.signal;

  const b64 = root.getAttribute('data-fusa-q-payload-b64') || '';
  /** @type {{ gruppen: Record<string, object[]>; summenZeilen: { key: string; quartalLabel: string }[]; firmaNames?: Record<string, string> }} */
  let payload = { gruppen: {}, summenZeilen: [] };
  try {
    const json = decodeURIComponent(escape(atob(b64)));
    const p = JSON.parse(json);
    if (p && typeof p === 'object') {
      payload.gruppen = p.gruppen && typeof p.gruppen === 'object' ? p.gruppen : {};
      payload.summenZeilen = Array.isArray(p.summenZeilen) ? p.summenZeilen : [];
      payload.firmaNames = p.firmaNames && typeof p.firmaNames === 'object' ? p.firmaNames : {};
    }
  } catch {
    payload = { gruppen: {}, summenZeilen: [], firmaNames: {} };
  }
  if (!payload.firmaNames) payload.firmaNames = {};

  /** @type {Map<string, string>} */
  const firmaNameById = new Map();
  const fnObj = payload.firmaNames && typeof payload.firmaNames === 'object' ? payload.firmaNames : {};
  for (const k of Object.keys(fnObj)) {
    firmaNameById.set(k, String(fnObj[k]));
  }

  const detailCtx = { firmaNameById };

  const draw = root.querySelector('[data-fusa-q-draw]');
  const drawTitle = root.querySelector('[data-fusa-q-draw-title]');
  const drawTbody = root.querySelector('[data-fusa-q-draw-tbody]');
  /** @type {string|null} */
  let openKey = null;

  function closeDraw() {
    openKey = null;
    if (draw instanceof HTMLElement) {
      draw.classList.remove('fq-draw--open');
      draw.setAttribute('aria-hidden', 'true');
    }
  }

  /**
   * @param {string} key
   */
  function openDrawForKey(key) {
    const k = String(key || '').trim();
    if (!k) return;
    const list = payload.gruppen[k];
    if (!Array.isArray(list) || !drawTbody) return;
    openKey = k;
    const agg = payload.summenZeilen.find(s => s && s.key === k);
    const title = agg && agg.quartalLabel ? String(agg.quartalLabel) : k;
    if (drawTitle instanceof HTMLElement) drawTitle.textContent = title;
    drawTbody.innerHTML = list
      .map(r => {
        const d = quartalsDetailZeileFromApiRow(r, detailCtx);
        const su = getRechnungStatusUi(d.statusCanon);
        return `<tr>
        <td>${esc(d.rechnungsnummer)}</td>
        <td>${esc(d.kunde)}</td>
        <td>${esc(d.zeitraum)}</td>
        <td class="re-num">${esc(formatEuroDe(d.netto))}</td>
        <td class="re-num">${esc(formatEuroDe(d.brutto))}</td>
        <td><span class="bdg b${esc(su.badgeSuffix)}">${esc(d.statusLabel)}</span></td>
        <td><button type="button" class="btn" style="font-size:11px;padding:3px 8px;" data-fusa-q-open-re="${esc(d.id)}">Rechnung öffnen</button></td>
      </tr>`;
      })
      .join('');
    if (draw instanceof HTMLElement) {
      draw.classList.add('fq-draw--open');
      draw.setAttribute('aria-hidden', 'false');
    }
  }

  const exJ = root.querySelector('[data-fusa-q-ex-jahr]');
  const exQ = root.querySelector('[data-fusa-q-ex-q]');

  function runCsvExport() {
    const jahr =
      exJ instanceof HTMLSelectElement && exJ.value ? parseInt(String(exJ.value), 10) : new Date().getFullYear();
    const qOpt = exQ instanceof HTMLSelectElement ? String(exQ.value || '').trim() : '';
    const rows = buildQuartalsCsvExportRows({
      gruppen: payload.gruppen,
      summenZeilen: payload.summenZeilen,
      jahr,
      qOpt,
      firmaNameById,
    });
    if (!rows.length) {
      flashQ(root, 'CSV: keine Zeilen für die gewählten Filter.');
      return;
    }
    const head = ['rechnungsnummer', 'quartal', 'kunde', 'zeitraum', 'netto', 'brutto', 'status'];
    const lines = [head.join(';')].concat(
      rows.map(r =>
        [r.rechnungsnummer, r.quartal, r.kunde, r.zeitraum, r.netto, r.brutto, r.status]
          .map(x => {
            const s =
              typeof x === 'number' && Number.isFinite(x)
                ? String(x).replace('.', ',')
                : x != null
                  ? String(x)
                  : '';
            return `"${s.replace(/"/g, '""')}"`;
          })
          .join(';'),
      ),
    );
    const blob = new Blob([`\uFEFF${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `FUSA_Quartalsabrechnung_${jahr}_${qOpt || 'alle'}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flashQ(root, `CSV exportiert · ${rows.length} Zeile(n).`);
  }

  root.querySelector('[data-fusa-q-excel]')?.addEventListener(
    'click',
    () => {
      flashQ(root, 'Excel exportieren: optional vorbereitet — CSV ist verfügbar.');
    },
    { signal: sig },
  );
  root.querySelector('[data-fusa-q-csv]')?.addEventListener('click', () => runCsvExport(), { signal: sig });

  root.querySelector('[data-fusa-q-draw-x]')?.addEventListener('click', () => closeDraw(), { signal: sig });
  root.querySelector('[data-fusa-q-draw-back]')?.addEventListener('click', () => closeDraw(), { signal: sig });

  root.querySelector('[data-fusa-q-draw-neu]')?.addEventListener(
    'click',
    () => {
      const hint = openKey ? formatQuartalLabel(openKey) : '';
      setFusaRechnungenAfterMountActions({ openNeu: true, quartalHint: hint || undefined });
      closeDraw();
      document.dispatchEvent(new CustomEvent('ccw:fusa-navigate', { bubbles: true, detail: { view: 'fusa_rechnungen' } }));
    },
    { signal: sig },
  );

  root.addEventListener(
    'keydown',
    ev => {
      if (ev.key === 'Escape' && draw instanceof HTMLElement && draw.classList.contains('fq-draw--open')) {
        ev.preventDefault();
        closeDraw();
        return;
      }
      if ((ev.key === 'Enter' || ev.key === ' ') && ev.target instanceof HTMLElement) {
        const tr = ev.target.closest('[data-fusa-q-row-key]');
        if (tr instanceof HTMLElement && root.contains(tr) && !ev.target.closest('button')) {
          if (ev.key === ' ') ev.preventDefault();
          const k = tr.getAttribute('data-fusa-q-row-key');
          if (k) openDrawForKey(k);
        }
      }
    },
    { signal: sig },
  );

  root.addEventListener(
    'click',
    ev => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const openRe = t.closest('[data-fusa-q-open-re]');
      if (openRe instanceof HTMLElement) {
        ev.preventDefault();
        const id = String(openRe.getAttribute('data-fusa-q-open-re') || '').trim();
        if (!id) return;
        setFusaRechnungenAfterMountActions({ focusRechnungId: id });
        closeDraw();
        document.dispatchEvent(new CustomEvent('ccw:fusa-navigate', { bubbles: true, detail: { view: 'fusa_rechnungen' } }));
        return;
      }
      const openKeyBtn = t.closest('[data-fusa-q-open-key]');
      if (openKeyBtn instanceof HTMLElement) {
        ev.preventDefault();
        const k = openKeyBtn.getAttribute('data-fusa-q-open-key');
        if (k) openDrawForKey(k);
        return;
      }
      const tr = t.closest('[data-fusa-q-row-key]');
      if (tr instanceof HTMLElement && root.contains(tr) && !t.closest('button')) {
        const k = tr.getAttribute('data-fusa-q-row-key');
        if (k) openDrawForKey(k);
      }
    },
    { signal: sig },
  );

  mount.querySelector('[data-fusa-q-nav-neu-quartal]')?.addEventListener(
    'click',
    ev => {
      ev.preventDefault();
      setFusaRechnungenAfterMountActions({ openNeu: true });
      document.dispatchEvent(new CustomEvent('ccw:fusa-navigate', { bubbles: true, detail: { view: 'fusa_rechnungen' } }));
    },
    { signal: sig },
  );
}
