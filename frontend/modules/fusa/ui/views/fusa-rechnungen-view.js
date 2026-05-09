/**
 * FUSA — Rechnungen: UI/Struktur an `FUSA_UMZUG_FERTIG` (`templates.js` #pg-rechnungen, `logic/rechnungen.js`).
 * Daten: `GET /api/v1/fusa/rechnungen`, `GET /api/v1/fusa/auftraege`, optional `GET /api/v1/firmen` (Kundenname zu `kunde_id`).
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi, getAccessToken, getApiBaseUrl } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';
import { fetchFusaApiAuftraege, fetchFusaApiRechnungen } from '../../fusa-api-data-port.js';
import { rechnungMatchesTab } from '../../lib/fusa-rechnung-ui-status.js';
import {
  abrechnungsartLabelDe,
  aggregateRechnungKpis,
  computeNextReOriginalId,
  FUSA_RE_ABRECHNUNGSART_KEYS,
  formatDateDe,
  formatEuroDe,
  mapRechnungApiToViewModel,
  mwstBetragAngebotConfirmBlock,
  rechnungVmToRowPayload,
} from '../../lib/fusa-rechnung-view-model.js';

/** @type {AbortController|null} */
let reAbort = null;

/** @type {{ openNeu?: boolean; quartalHint?: string; focusRechnungId?: string } | null} */
let fusaRechnungenAfterMount = null;

/**
 * Nach Navigation (z. B. Quartalsabrechnung → Rechnungen): einmalig Modal öffnen / Zeile fokussieren.
 * Kein localStorage — nur In-Memory bis zum nächsten `attachFusaRechnungenHandlers`.
 * @param {{ openNeu?: boolean; quartalHint?: string; focusRechnungId?: string }|null} spec
 */
export function setFusaRechnungenAfterMountActions(spec) {
  fusaRechnungenAfterMount = spec && typeof spec === 'object' ? { ...spec } : null;
}

function consumeFusaRechnungenAfterMountActions() {
  const x = fusaRechnungenAfterMount;
  fusaRechnungenAfterMount = null;
  return x;
}

/**
 * @param {HTMLElement} root
 * @param {string} msg
 */
function flashReResult(root, msg) {
  const el = root.querySelector('[data-fusa-re-result]');
  if (!(el instanceof HTMLElement)) return;
  el.textContent = msg;
  window.setTimeout(() => {
    el.textContent = '';
  }, 4200);
}

/**
 * @param {string} relUrl
 * @returns {Promise<void>}
 */
async function triggerAuthedDownload(relUrl) {
  const token = getAccessToken();
  const p = relUrl.startsWith('/') ? relUrl : `/${relUrl}`;
  const url = `${getApiBaseUrl()}${p}`;
  const res = await fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  const blob = await res.blob();
  const cd = res.headers.get('Content-Disposition');
  let fn = 'download';
  if (cd) {
    const m = /filename\*?=(?:UTF-8'')?["']?([^;"']+)/i.exec(cd);
    if (m) fn = decodeURIComponent(m[1].trim());
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fn;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** @param {unknown} obj */
function safeEncodeJsonPayload(obj) {
  try {
    return encodeURIComponent(JSON.stringify(obj));
  } catch {
    return '';
  }
}

/** @param {string} enc */
function safeDecodeJsonPayload(enc) {
  try {
    const s = decodeURIComponent(String(enc || ''));
    return JSON.parse(s);
  } catch {
    return null;
  }
}

/** @param {string|undefined|null} iso */
function isoToDateInputValue(iso) {
  const m = String(iso || '').trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : '';
}

/** @param {string} isoStart @param {string} isoEnd */
function monateZwischenIso(isoStart, isoEnd) {
  const a = isoToDateInputValue(isoStart);
  const b = isoToDateInputValue(isoEnd);
  if (!a || !b) return '';
  const t1 = Date.parse(a);
  const t2 = Date.parse(b);
  if (Number.isNaN(t1) || Number.isNaN(t2) || t2 < t1) return '';
  const months = Math.max(1, Math.round((t2 - t1) / (86400000 * 30.44)));
  return String(months);
}

/** @param {string} s */
function parseDeDecimalGlobal(s) {
  const t = String(s || '').trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * @param {HTMLElement} root
 * @param {HTMLTableRowElement} tr
 */
function fillReOverlayFromRow(root, tr) {
  const g = k => tr.getAttribute(k) || '—';
  const fullEnc = tr.getAttribute('data-re-full');
  /** @type {Record<string, unknown>|null} */
  const p = fullEnc ? safeDecodeJsonPayload(fullEnc) : null;

  const set = (sel, text) => {
    const n = root.querySelector(sel);
    if (n) n.textContent = text;
  };
  set('[data-fusa-re-ov-title]', g('data-re-num'));
  set('[data-fusa-re-ov-num]', g('data-re-num'));
  set('[data-fusa-re-ov-kunde]', g('data-re-kunde'));
  set('[data-fusa-re-ov-auftrag]', g('data-re-auftrag'));
  set('[data-fusa-re-ov-zeit]', `${g('data-re-von')} – ${g('data-re-bis')}`);
  set('[data-fusa-re-ov-art]', g('data-re-art'));
  set('[data-fusa-re-ov-netto]', g('data-re-netto'));
  set('[data-fusa-re-ov-mwst]', g('data-re-mwstline'));
  set('[data-fusa-re-ov-brutto]', g('data-re-brutto'));
  const bruttoEl = root.querySelector('[data-fusa-re-ov-brutto]');
  if (bruttoEl instanceof HTMLElement) {
    bruttoEl.style.color = g('data-re-brutto-color') || '';
  }
  set('[data-fusa-re-ov-faellig]', g('data-re-faellig'));
  const lz =
    p && p.laufzeit_monate != null && String(p.laufzeit_monate).trim() !== ''
      ? `${String(p.laufzeit_monate).trim()} Monate`
      : '—';
  set('[data-fusa-re-ov-laufzeit]', lz);

  const st = root.querySelector('[data-fusa-re-ov-status]');
  if (st instanceof HTMLElement) {
    st.textContent = g('data-re-statuslbl');
    const suf = g('data-re-statusbdg');
    const sfx = suf && suf !== '—' && String(suf).trim() !== '' ? String(suf).trim() : 'bgr';
    st.className = `bdg b${sfx}`;
  }
  const dlg = root.querySelector('[data-fusa-re-dialog]');
  if (dlg instanceof HTMLElement) {
    const rid = g('data-re-id');
    if (rid && rid !== '—') dlg.dataset.reId = rid;
    else delete dlg.dataset.reId;
  }

  const notiz = g('data-re-notiz');
  const sec = root.querySelector('[data-fusa-re-ov-notiz-wrap]');
  const notizBody = root.querySelector('[data-fusa-re-ov-notiz]');
  if (sec instanceof HTMLElement && notizBody instanceof HTMLElement) {
    if (notiz && notiz !== '—' && notiz.trim() !== '') {
      sec.hidden = false;
      notizBody.textContent = notiz;
    } else {
      sec.hidden = true;
      notizBody.textContent = '';
    }
  }

  const posWrap = root.querySelector('[data-fusa-re-ov-positionen-wrap]');
  const posEl = root.querySelector('[data-fusa-re-ov-positionen]');
  const posList = p && Array.isArray(p.positionen) ? p.positionen : [];
  if (posWrap instanceof HTMLElement && posEl instanceof HTMLElement) {
    if (posList.length) {
      posWrap.hidden = false;
      const ccPct = posList[0] && typeof posList[0] === 'object' && posList[0] != null && 'cc_pct' in posList[0] ? Number(/** @type {any} */ (posList[0]).cc_pct) : 22;
      const ppPct =
        posList[0] && typeof posList[0] === 'object' && posList[0] != null && 'partner_pct' in posList[0]
          ? Number(/** @type {any} */ (posList[0]).partner_pct)
          : 78;
      const rows = posList
        .map(x => {
          if (!x || typeof x !== 'object') return '';
          const o = /** @type {Record<string, unknown>} */ (x);
          const fz = o.fz != null ? String(o.fz) : '';
          const pak = o.paket != null ? String(o.paket) : '';
          const sp = o.servicePrice != null ? Number(o.servicePrice) : 0;
          const ae = o.ae != null ? Number(o.ae) : 0;
          const rab = o.rabatt != null ? Number(o.rabatt) : 0;
          const nm = o.nettoMo != null ? Number(o.nettoMo) : o.svcEff != null ? Number(o.svcEff) : 0;
          const ip = o.internalPrice != null ? Number(o.internalPrice) : 0;
          const cc = o.cc != null ? Number(o.cc) : 0;
          const partner = o.partner != null ? Number(o.partner) : 0;
          const ges = o.gesamt != null ? Number(o.gesamt) : 0;
          return `<tr><td>${esc(fz)}</td><td>${esc(pak)}</td><td class="re-num">${esc(formatEuroDe(sp))}</td><td class="re-num">${ae > 0 ? esc(String(ae)) + '%' : '—'}</td><td class="re-num">${rab > 0 ? esc(String(rab)) + '%' : '—'}</td><td class="re-num">${esc(formatEuroDe(nm))}</td><td class="re-num">${esc(formatEuroDe(ip))}</td><td class="re-num">${esc(formatEuroDe(cc))}</td><td class="re-num">${esc(formatEuroDe(partner))}</td><td class="re-num">${esc(formatEuroDe(ges))}</td></tr>`;
        })
        .join('');
      const nettoN = p.betrag_netto != null ? Number(p.betrag_netto) : 0;
      const bruttoN = p.betrag_brutto != null ? Number(p.betrag_brutto) : 0;
      const mwstFoot = mwstBetragAngebotConfirmBlock(nettoN);
      const tcc = p.total_cc != null && Number.isFinite(Number(p.total_cc)) ? Number(p.total_cc) : 0;
      const tpa = p.total_partner != null && Number.isFinite(Number(p.total_partner)) ? Number(p.total_partner) : 0;
      posEl.innerHTML = `<table class="fusa-re-ang-table"><thead><tr><th>Fahrzeug</th><th>Paket</th><th>Service/Mo.</th><th>AE %</th><th>Rabatt %</th><th>Netto/Mo.</th><th>Intern/Mo.</th><th>CC ${Number.isFinite(ccPct) ? ccPct : 22}%</th><th>Partner ${Number.isFinite(ppPct) ? ppPct : 78}%</th><th>Gesamt</th></tr></thead><tbody>${rows}</tbody><tfoot>
        <tr><td colspan="7">Servicepreis netto gesamt</td><td colspan="3" class="re-num">${esc(formatEuroDe(nettoN))}</td></tr>
        <tr><td colspan="7">MwSt. 19% (auf Servicepreis)</td><td colspan="3" class="re-num">${esc(formatEuroDe(mwstFoot))}</td></tr>
        <tr style="background:#E8F5E9;font-weight:700;"><td colspan="7">Gesamtbetrag brutto (Kundenrechnung)</td><td colspan="3" class="re-num">${esc(formatEuroDe(bruttoN))}</td></tr>
        <tr style="background:#EDE7F6;"><td colspan="7">Interner Anteil CC Werbung</td><td colspan="3" class="re-num">${esc(formatEuroDe(tcc))}</td></tr>
        <tr style="background:#E0F2F1;"><td colspan="7">Zahlung an Verkehrsbetrieb (Partner)</td><td colspan="3" class="re-num">${esc(formatEuroDe(tpa))}</td></tr>
      </tfoot></table>`;
    } else {
      posWrap.hidden = true;
      posEl.innerHTML = '';
    }
  }

  const oOrig = root.querySelector('[data-fusa-re-ed-original]');
  if (oOrig instanceof HTMLInputElement) oOrig.value = p && p.rechnungsnummer != null ? String(p.rechnungsnummer) : g('data-re-num');
  const oRd = root.querySelector('[data-fusa-re-ed-rechnungsdatum]');
  if (oRd instanceof HTMLInputElement) oRd.value = '';
  const oK = root.querySelector('[data-fusa-re-ed-kunde]');
  if (oK instanceof HTMLSelectElement) oK.value = p && p.kunde_id ? String(p.kunde_id) : '';
  const oA = root.querySelector('[data-fusa-re-ed-auftrag]');
  if (oA instanceof HTMLSelectElement) oA.value = p && p.auftrag_id ? String(p.auftrag_id) : '';
  const oV = root.querySelector('[data-fusa-re-ed-von]');
  if (oV instanceof HTMLInputElement) oV.value = p && p.von_raw ? isoToDateInputValue(String(p.von_raw)) : '';
  const oB = root.querySelector('[data-fusa-re-ed-bis]');
  if (oB instanceof HTMLInputElement) oB.value = p && p.bis_raw ? isoToDateInputValue(String(p.bis_raw)) : '';
  const oL = root.querySelector('[data-fusa-re-ed-laufzeit]');
  if (oL instanceof HTMLInputElement) oL.value = p && p.laufzeit_monate != null ? String(p.laufzeit_monate) : '';
  const oN = root.querySelector('[data-fusa-re-ed-netto]');
  if (oN instanceof HTMLInputElement) oN.value = p && p.betrag_netto != null && Number.isFinite(Number(p.betrag_netto)) ? String(p.betrag_netto) : '';
  const oMw = root.querySelector('[data-fusa-re-ed-mwst]');
  if (oMw instanceof HTMLSelectElement) {
    const m = p && p.mwst_pct != null ? String(Math.round(Number(p.mwst_pct))) : '19';
    oMw.value = m === '7' || m === '0' || m === '19' ? m : '19';
  }
  const oBr = root.querySelector('[data-fusa-re-ed-brutto]');
  if (oBr instanceof HTMLInputElement) oBr.value = p && p.betrag_brutto != null && Number.isFinite(Number(p.betrag_brutto)) ? String(p.betrag_brutto) : '';
  const oF = root.querySelector('[data-fusa-re-ed-faellig]');
  if (oF instanceof HTMLInputElement) oF.value = p && p.faellig_raw ? isoToDateInputValue(String(p.faellig_raw)) : '';
  const oSt = root.querySelector('[data-fusa-re-ed-status]');
  if (oSt instanceof HTMLSelectElement) {
    const raw = p && p.status_raw != null ? String(p.status_raw).toLowerCase() : '';
    oSt.value = ['angebot', 'geplant', 'erstellt', 'versendet', 'ueberfaellig', 'bezahlt'].includes(raw) ? raw : 'erstellt';
  }
  const oAr = root.querySelector('[data-fusa-re-ed-art]');
  if (oAr instanceof HTMLSelectElement) {
    const a = p && p.abrechnungsart != null ? String(p.abrechnungsart).trim() : 'quartal';
    oAr.value = FUSA_RE_ABRECHNUNGSART_KEYS.includes(/** @type {any} */ (a)) ? a : 'quartal';
  }
  const oQ = root.querySelector('[data-fusa-re-ed-quartal]');
  if (oQ instanceof HTMLInputElement) oQ.value = p && p.quartal != null ? String(p.quartal) : '';
  const oNo = root.querySelector('[data-fusa-re-ed-notiz]');
  if (oNo instanceof HTMLTextAreaElement) oNo.value = p && p.notiz != null ? String(p.notiz) : '';

  const nNet = root.querySelector('[data-fusa-re-ed-netto]');
  const nMw = root.querySelector('[data-fusa-re-ed-mwst]');
  const nBr = root.querySelector('[data-fusa-re-ed-brutto]');
  if (nNet instanceof HTMLInputElement && nMw instanceof HTMLSelectElement && nBr instanceof HTMLInputElement) {
    const nn = parseDeDecimalGlobal(nNet.value);
    const mm = Number(nMw.value) || 19;
    if (nn != null && nn > 0) nBr.value = (nn * (1 + mm / 100)).toFixed(2);
  }

  const pdf = g('data-re-pdf').trim();
  const dlBtn = root.querySelector('[data-fusa-re-ov-pdf]');
  if (dlBtn instanceof HTMLButtonElement) {
    dlBtn.setAttribute('data-re-open-url', pdf);
  }
  const bez = g('data-re-canon') === 'bezahlt';
  const mark = root.querySelector('[data-fusa-re-ov-bezahlt]');
  if (mark instanceof HTMLButtonElement) {
    mark.hidden = bez;
  }
}

/**
 * @param {HTMLElement} root
 */
function openReOverlay(root) {
  const ov = root.querySelector('[data-fusa-re-overlay]');
  if (ov instanceof HTMLElement) {
    ov.classList.add('fusa-re-overlay--open');
    ov.setAttribute('aria-hidden', 'false');
  }
}

/**
 * @param {HTMLElement} root
 */
function closeReOverlay(root) {
  const ov = root.querySelector('[data-fusa-re-overlay]');
  if (ov instanceof HTMLElement) {
    ov.classList.remove('fusa-re-overlay--open');
    ov.setAttribute('aria-hidden', 'true');
  }
}

/**
 * @returns {Promise<string>}
 */
export async function renderFusaRechnungenViewHtml() {
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

  /** @type {Map<string, { title?: string|null; kunde_name?: string|null; project_id?: string|null }>} */
  const auftragById = new Map();
  for (const a of auftraegeAll) {
    if (!a || a.id == null) continue;
    auftragById.set(String(a.id), {
      title: a.title != null ? String(a.title) : '',
      kunde_name: a.kunde_name != null ? String(a.kunde_name) : '',
      project_id: a.project_id != null ? String(a.project_id) : '',
    });
  }

  const projectAuftragIds = new Set(
    auftraegeAll.filter(a => a && String(a.project_id || '') === pid && a.id != null).map(a => String(a.id)),
  );

  /** @type {Map<string, string>} */
  const firmaNameById = new Map();
  for (const f of firmenRows) {
    if (!f || f.id == null) continue;
    const nm = f.name != null && String(f.name).trim() !== '' ? String(f.name).trim() : String(f.id);
    firmaNameById.set(String(f.id), nm);
  }

  const mapCtx = { projectId: pid, auftragById, firmaNameById };
  const vmsAll = rechnungenRaw
    .filter(r => r && r.auftrag_id != null && String(r.auftrag_id).trim() !== '' && projectAuftragIds.has(String(r.auftrag_id)))
    .map(r => mapRechnungApiToViewModel(r, mapCtx));

  const curY = String(new Date().getFullYear());
  /** @type {Set<string>} */
  const yearOpts = new Set([curY, '2027', '2026', '2025', '2024']);
  for (const vm of vmsAll) {
    for (const p of String(vm.yearHaystack || '').split(',')) {
      if (p.trim()) yearOpts.add(p.trim());
    }
  }
  const yearSorted = [...yearOpts].sort((a, b) => Number(b) - Number(a));
  const yearOptionsHtml = yearSorted.map(y => `<option value="${esc(y)}"${y === curY ? ' selected' : ''}>${esc(y)}</option>`).join('');

  const auftraegeProj = auftraegeAll.filter(a => a && String(a.project_id || '') === pid && a.id != null);
  const auftragOptionsHtml = auftraegeProj.length
    ? auftraegeProj
        .map(a => {
          const id = String(a.id);
          const t = a.title != null && String(a.title).trim() ? String(a.title).trim() : id;
          return `<option value="${esc(id)}">${esc(t)}</option>`;
        })
        .join('')
    : `<option value="">— Kein Auftrag im Projekt —</option>`;
  const neuAuftragMetaJson = JSON.stringify(
    auftraegeProj.map(a => ({
      id: String(a.id),
      kunde_id: a.fusa_kunde_id != null ? String(a.fusa_kunde_id).trim() : '',
    })),
  );

  const baseForKpi = vmsAll.filter(vm => {
    const ys = String(vm.yearHaystack || '').split(',').map(x => x.trim()).filter(Boolean);
    if (ys.length === 0) return true;
    return ys.includes(curY);
  });
  const kpis = aggregateRechnungKpis(baseForKpi);

  const nextReSuggestion = computeNextReOriginalId(vmsAll.flatMap(vm => [vm.rechnungsnummer, vm.id]));
  const firmenOptionsHtml =
    firmenRows.length > 0
      ? `<option value="">— wählen —</option>${firmenRows
          .map(f => {
            const id = String(f.id);
            const nm = f.name != null && String(f.name).trim() !== '' ? String(f.name).trim() : id;
            return `<option value="${esc(id)}">${esc(nm)}</option>`;
          })
          .join('')}`
      : `<option value="">— keine Firmen —</option>`;
  const abrechnungsartOptsHtml = FUSA_RE_ABRECHNUNGSART_KEYS.map(k => {
    const kk = String(k);
    return `<option value="${esc(kk)}">${esc(abrechnungsartLabelDe(kk))}</option>`;
  }).join('');

  const rowsHtml = vmsAll
    .map(vm => {
      const colorBrutto =
        vm.status_canon === 'ueberfaellig'
          ? 'var(--re-red)'
          : vm.status_canon === 'bezahlt'
            ? 'var(--re-green)'
            : vm.status_canon === 'geplant' || vm.status_canon === 'angebot'
              ? 'var(--re-blue)'
              : 'var(--re-amber)';
      const rowBg = vm.status_canon === 'angebot' ? 'background:var(--re-purple-l);' : '';
      const mwstLine =
        vm.mwst_betrag != null && Number.isFinite(vm.mwst_betrag)
          ? `${String(vm.mwst_pct).replace(/\.0+$/, '')}% · ${formatEuroDe(vm.mwst_betrag)}`
          : `${String(vm.mwst_pct).replace(/\.0+$/, '')}% · —`;
      const rowPayload = safeEncodeJsonPayload(rechnungVmToRowPayload(vm));
      const angebotBtn =
        vm.status_canon === 'angebot'
          ? `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;background:var(--re-purple);border-color:var(--re-purple);color:#fff;" data-fusa-re-act="promote" data-re-id="${esc(vm.id)}" data-re-promote-payload="${rowPayload}">→ Rechnung</button>`
          : '';
      const geplantBtn =
        vm.status_canon === 'geplant'
          ? `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-re-act="patch-status" data-re-id="${esc(vm.id)}" data-re-next-status="erstellt">Erstellen</button>`
          : '';
      const erstBtn =
        vm.status_canon === 'erstellt'
          ? `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-re-act="patch-status" data-re-id="${esc(vm.id)}" data-re-next-status="versendet">Versenden</button>`
          : '';
      const bezBtn =
        vm.status_canon === 'versendet' || vm.status_canon === 'ueberfaellig'
          ? `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-re-act="patch-status" data-re-id="${esc(vm.id)}" data-re-next-status="bezahlt">Bezahlt ✓</button>`
          : '';
      const pdfBtn = `<button type="button" class="btn" style="font-size:10px;padding:3px 8px;" data-fusa-re-pdf-row="1">PDF</button>`;

      const laufzSub =
        vm.laufzeit_monate && String(vm.laufzeit_monate).trim() !== ''
          ? `<div class="ts" style="font-size:10px;color:var(--ccds-muted,#64748b);">${esc(String(vm.laufzeit_monate))} Monate</div>`
          : '';
      return `<tr class="fusa-re-row" style="cursor:pointer;${rowBg}"
      data-fusa-re-row="1"
      data-re-full="${rowPayload}"
      data-re-id="${esc(vm.id)}"
      data-re-num="${esc(vm.rechnungsnummer)}"
      data-re-kunde="${esc(vm.kunde)}"
      data-re-auftrag="${esc(vm.auftrag)}"
      data-re-von="${esc(vm.von_display)}"
      data-re-bis="${esc(vm.bis_display)}"
      data-re-netto="${esc(formatEuroDe(vm.betrag_netto))}"
      data-re-mwstline="${esc(mwstLine)}"
      data-re-brutto="${esc(formatEuroDe(vm.betrag_brutto))}"
      data-re-brutto-color="${esc(colorBrutto)}"
      data-re-faellig="${esc(vm.faelligkeit)}"
      data-re-statuslbl="${esc(vm.status_label)}"
      data-re-statusbdg="${esc(vm.status_badge_suffix)}"
      data-re-notiz="${esc(vm.notiz)}"
      data-re-pdf="${esc(vm.download_url || vm.pdf_url)}"
      data-re-canon="${esc(vm.status_canon)}"
      data-re-art="${esc(vm.abrechnungsart_display)}"
      data-re-years="${esc(vm.yearHaystack)}"
      data-re-search="${esc(vm.searchHaystack)}"
      data-re-brutto-num="${esc(vm.betrag_brutto != null && Number.isFinite(vm.betrag_brutto) ? String(vm.betrag_brutto) : '')}"
    >
      <td class="ckp-snapshot-ro-td"><div class="tm">${esc(vm.rechnungsnummer)}</div>${vm.status_canon === 'angebot' ? '<div style="font-size:10px;color:var(--re-purple);font-weight:600;">ANGEBOT</div>' : ''}</td>
      <td class="ckp-snapshot-ro-td"><div style="font-size:12px;font-weight:500;">${esc(vm.auftrag)}</div><div class="ts" style="font-size:11px;color:var(--ccds-muted,#64748b);">${esc(vm.notiz || '')}</div></td>
      <td class="ckp-snapshot-ro-td">${esc(vm.kunde)}</td>
      <td class="ckp-snapshot-ro-td" style="font-size:12px;">${esc(vm.von_display)} – ${esc(vm.bis_display)}${laufzSub}</td>
      <td class="ckp-snapshot-ro-td" style="font-weight:600;">${esc(formatEuroDe(vm.betrag_netto))}</td>
      <td class="ckp-snapshot-ro-td" style="font-size:12px;color:var(--ccds-muted,#64748b);">${esc(mwstLine)}</td>
      <td class="ckp-snapshot-ro-td" style="font-weight:700;color:${esc(colorBrutto)};">${esc(formatEuroDe(vm.betrag_brutto))}</td>
      <td class="ckp-snapshot-ro-td" style="font-size:12px;color:${vm.status_canon === 'ueberfaellig' ? 'var(--re-red)' : 'inherit'};">${esc(vm.faelligkeit)}</td>
      <td class="ckp-snapshot-ro-td"><span class="bdg b${esc(vm.status_badge_suffix)}">${esc(vm.status_label)}</span></td>
      <td class="ckp-snapshot-ro-td"><div style="display:flex;gap:4px;flex-wrap:wrap;">${angebotBtn}${geplantBtn}${erstBtn}${bezBtn}${pdfBtn}</div></td>
    </tr>`;
    })
    .join('');

  const tableBody =
    vmsAll.length === 0
      ? `<tr data-fusa-re-empty><td colspan="10" class="ckp-snapshot-ro-empty-cell">Keine Rechnungen für dieses Projekt.</td></tr>`
      : rowsHtml;

  return `<div data-ccw-ro="fusa-rechnungen" class="fusa-re-scope" data-fusa-re-next-re="${esc(nextReSuggestion)}">
<style>
.fusa-re-scope{--re-red:#C62828;--re-red-l:#FFEBEE;--re-amber:#E65100;--re-amber-l:#FFF3E0;--re-blue:#1565C0;--re-blue-l:#E3F2FD;--re-green:#2E7D32;--re-green-l:#E8F5E9;--re-purple:#4527A0;--re-purple-l:#EDE7F6;--re-gray:#546E7A;--re-gray-l:#ECEFF1;}
.fusa-re-scope .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px;}
.fusa-re-scope .sc{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;background:var(--re-gray-l);border-radius:10px;border:1px solid #e2e8f0;}
.fusa-re-scope .sc-ico{flex-shrink:0;width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;}
.fusa-re-scope .sc-n{font-size:18px;font-weight:700;line-height:1.2;}
.fusa-re-scope .sc-l{font-size:12px;font-weight:600;color:#334155;margin-top:2px;}
.fusa-re-scope .sc-t{font-size:11px;color:#64748b;margin-top:2px;}
.fusa-re-scope .tabs{display:flex;flex-wrap:wrap;gap:6px;}
.fusa-re-scope .tab{font:inherit;font-size:12px;padding:6px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;}
.fusa-re-scope .tab:hover{background:#f8fafc;}
.fusa-re-scope .tab.fusa-re-tab--active{background:var(--re-amber-l);border-color:var(--re-amber);font-weight:600;}
.fusa-re-scope .srch{font:inherit;font-size:12px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:7px;}
.fusa-re-scope .fs{font:inherit;}
.fusa-re-scope .panel{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:auto;}
.fusa-re-scope .panel table{width:100%;border-collapse:collapse;font-size:13px;}
.fusa-re-scope .panel th,.fusa-re-scope .panel td{padding:10px 12px;text-align:left;border-bottom:1px solid #f1f5f9;vertical-align:top;}
.fusa-re-scope .panel thead th{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.04em;background:#f8fafc;}
.fusa-re-scope .bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap;}
.fusa-re-scope .bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0;}
.fusa-re-scope .bdg.bp{background:var(--re-purple-l);color:var(--re-purple)} .fusa-re-scope .bdg.bp::before{background:var(--re-purple)}
.fusa-re-scope .bdg.br{background:var(--re-red-l);color:var(--re-red)} .fusa-re-scope .bdg.br::before{background:var(--re-red)}
.fusa-re-scope .bdg.ba{background:var(--re-amber-l);color:var(--re-amber)} .fusa-re-scope .bdg.ba::before{background:var(--re-amber)}
.fusa-re-scope .bdg.bg{background:var(--re-green-l);color:var(--re-green)} .fusa-re-scope .bdg.bg::before{background:var(--re-green)}
.fusa-re-scope .bdg.bb{background:var(--re-blue-l);color:var(--re-blue)} .fusa-re-scope .bdg.bb::before{background:var(--re-blue)}
.fusa-re-scope .bdg.bgr{background:var(--re-gray-l);color:var(--re-gray)} .fusa-re-scope .bdg.bgr::before{background:var(--re-gray)}
.fusa-re-scope .btn{font:inherit;font-size:12px;padding:6px 12px;border-radius:7px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;}
.fusa-re-scope .btn:hover{background:#f1f5f9;}
.fusa-re-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10020;display:none;align-items:center;justify-content:center;padding:16px;}
.fusa-re-overlay.fusa-re-overlay--open{display:flex;}
.fusa-re-dialog{background:#fff;border-radius:14px;width:100%;max-width:520px;box-shadow:0 20px 60px rgba(0,0,0,0.3);max-height:90vh;overflow:auto;}
.fusa-re-dialog.fusa-re-dialog--wide{max-width:760px;}
.fusa-re-ang-table{width:100%;border-collapse:collapse;font-size:11px;margin-top:8px;}
.fusa-re-ang-table th,.fusa-re-ang-table td{padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:left;}
.fusa-re-ang-table th{background:#eff6ff;color:#1565C0;font-weight:600;}
.fusa-re-ang-table td.re-num{text-align:right;font-weight:600;}
.fusa-re-fgrid{display:grid;grid-template-columns:1fr 1fr;gap:10px;}
.fusa-re-fsect{font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin:12px 0 8px;}
.fusa-re-fg label{display:block;font-size:11px;color:#64748b;margin-bottom:4px;}
.fusa-re-fg input,.fusa-re-fg select,.fusa-re-fg textarea{width:100%;box-sizing:border-box;}
.fusa-re-dh{padding:16px 20px;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;justify-content:space-between;}
.fusa-re-db{padding:16px 20px;}
.fusa-re-df{padding:12px 20px;border-top:1px solid #e2e8f0;display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;}
.fusa-re-scope .dp-section{margin-bottom:14px;}
.fusa-re-scope .dp-slbl{font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;}
.fusa-re-scope .dp-row{display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:13px;}
.fusa-re-scope .dp-lbl{color:#64748b;}
.fusa-re-scope .dp-val{text-align:right;max-width:62%;}
</style>
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}

  <div class="stats" data-fusa-re-kpi-wrap>
    <div class="sc">
      <div class="sc-ico" style="background:var(--re-red-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--re-red)" stroke-width="2" aria-hidden="true"><path d="M12 9v4m0 4h.01"/><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg></div>
      <div><div class="sc-n" style="color:var(--re-red)" data-fusa-re-kpi-u-sum>${esc(formatEuroDe(kpis.ueberfaellig.sum))}</div><div class="sc-l">Überfällig</div><div class="sc-t" data-fusa-re-kpi-u-n>${esc(String(kpis.ueberfaellig.count))} Rechnung${kpis.ueberfaellig.count === 1 ? '' : 'en'}</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--re-amber-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--re-amber)" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
      <div><div class="sc-n" style="color:var(--re-amber)" data-fusa-re-kpi-o-sum>${esc(formatEuroDe(kpis.offen.sum))}</div><div class="sc-l">Versendet / Offen</div><div class="sc-t" data-fusa-re-kpi-o-n>${esc(String(kpis.offen.count))} Rechnung${kpis.offen.count === 1 ? '' : 'en'}</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--re-blue-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--re-blue)" stroke-width="2" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg></div>
      <div><div class="sc-n" style="color:var(--re-blue)" data-fusa-re-kpi-g-sum>${esc(formatEuroDe(kpis.geplant.sum))}</div><div class="sc-l">Geplant</div><div class="sc-t" data-fusa-re-kpi-g-n>${esc(String(kpis.geplant.count))} Rechnung${kpis.geplant.count === 1 ? '' : 'en'}</div></div>
    </div>
    <div class="sc">
      <div class="sc-ico" style="background:var(--re-green-l)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--re-green)" stroke-width="2" aria-hidden="true"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
      <div><div class="sc-n" style="color:var(--re-green)" data-fusa-re-kpi-b-sum>${esc(formatEuroDe(kpis.bezahlt.sum))}</div><div class="sc-l">Bezahlt</div><div class="sc-t" data-fusa-re-kpi-b-n>${esc(String(kpis.bezahlt.count))} Rechnung${kpis.bezahlt.count === 1 ? '' : 'en'}</div></div>
    </div>
  </div>

  <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;flex-wrap:wrap;">
    <div class="tabs" role="tablist" aria-label="Rechnungsfilter">
      <button type="button" class="tab fusa-re-tab--active" data-fusa-re-tab="alle" role="tab" aria-selected="true">Alle</button>
      <button type="button" class="tab" data-fusa-re-tab="ueberfaellig" role="tab" aria-selected="false">Überfällig</button>
      <button type="button" class="tab" data-fusa-re-tab="offen" role="tab" aria-selected="false">Offen</button>
      <button type="button" class="tab" data-fusa-re-tab="geplant" role="tab" aria-selected="false">Geplant</button>
      <button type="button" class="tab" data-fusa-re-tab="bezahlt" role="tab" aria-selected="false">Bezahlt</button>
    </div>
    <input type="search" class="srch" data-fusa-re-search placeholder="Rechnung suchen…" style="width:200px;max-width:100%;background:#fff;" />
    <select class="fs fusa-start__proj-select" data-fusa-re-jahr aria-label="Jahr" style="width:110px;padding:6px 10px;font-size:12px;">${yearOptionsHtml}</select>
    <button type="button" class="ckp-api-auftrag-submit" style="margin-left:auto;" data-fusa-re-neu>+ Neue Rechnung</button>
  </div>

  <div class="panel" data-fusa-re-panel>
    <table>
      <thead>
        <tr>
          <th>Rechnungs-Nr.</th>
          <th>Auftrag / Beschreibung</th>
          <th>Kunde</th>
          <th>Zeitraum</th>
          <th>Betrag netto</th>
          <th>MwSt. 19%</th>
          <th>Betrag brutto</th>
          <th>Fällig am</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody data-fusa-re-tbody>${tableBody}</tbody>
    </table>
  </div>
  <p class="ckp-mock-note" style="margin-top:10px;" data-fusa-re-result role="status"></p>

  <textarea hidden data-fusa-re-neu-auftraege-json>${neuAuftragMetaJson}</textarea>
  <textarea hidden data-fusa-re-firmen-json>${JSON.stringify(firmenRows.map(f => ({ id: String(f.id), name: f.name != null ? String(f.name) : String(f.id) })))}</textarea>

  <div class="fusa-re-overlay" data-fusa-re-neu-overlay aria-hidden="true">
    <div class="fusa-re-dialog fusa-re-dialog--wide" data-fusa-re-neu-dialog>
      <div class="fusa-re-dh">
        <div style="font-size:15px;font-weight:700;">Neue Rechnung erstellen</div>
        <button type="button" class="btn" data-fusa-re-neu-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1;" aria-label="Schließen">×</button>
      </div>
      <div class="fusa-re-db">
        <div class="fusa-re-fsect">1 — Rechnungsdaten</div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Rechnungsnummer</label><input class="srch" data-fusa-re-neu-nr readonly style="background:#f1f5f9;color:#64748b;" value="${esc(nextReSuggestion)}" /></div>
          <div class="fusa-re-fg"><label>Rechnungsdatum <span style="color:#C62828">*</span></label><input type="date" class="srch" data-fusa-re-neu-datum /></div>
        </div>
        <div class="fusa-re-fgrid" style="margin-top:10px;">
          <div class="fusa-re-fg"><label>Kunde <span style="color:#C62828">*</span></label><select class="srch" data-fusa-re-neu-kunde>${firmenOptionsHtml}</select></div>
          <div class="fusa-re-fg"><label>Auftrag</label><select class="srch" data-fusa-re-neu-auftrag>${auftragOptionsHtml}</select></div>
        </div>
        <div class="fusa-re-fsect">2 — Zeitraum & Betrag</div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Zeitraum von <span style="color:#C62828">*</span></label><input type="date" class="srch" data-fusa-re-neu-von /></div>
          <div class="fusa-re-fg"><label>Zeitraum bis <span style="color:#C62828">*</span></label><input type="date" class="srch" data-fusa-re-neu-bis /></div>
        </div>
        <div style="font-size:11px;color:#64748b;margin:4px 0 8px;" data-fusa-re-neu-laufzeit-hint></div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Betrag netto (€) <span style="color:#C62828">*</span></label><input type="text" inputmode="decimal" class="srch" data-fusa-re-neu-netto placeholder="0.00" /></div>
          <div class="fusa-re-fg"><label>MwSt. %</label><select class="srch" data-fusa-re-neu-mwst><option value="19">19%</option><option value="7">7%</option><option value="0">0% (steuerfrei)</option></select></div>
          <div class="fusa-re-fg" style="grid-column:1/-1;max-width:240px;"><label>Betrag brutto (€)</label><input type="text" class="srch" data-fusa-re-neu-brutto readonly style="background:#f1f5f9;font-weight:600;color:#2E7D32;" /></div>
        </div>
        <div class="srch" data-fusa-re-neu-preview style="display:none;background:#E8F5E9;border-radius:8px;padding:10px 12px;font-size:12px;color:#2E7D32;font-weight:500;margin-bottom:8px;"></div>
        <div class="fusa-re-fsect">3 — Zahlungsbedingungen</div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Fällig am <span style="color:#C62828">*</span></label><input type="date" class="srch" data-fusa-re-neu-faellig /></div>
          <div class="fusa-re-fg"><label>Zahlungsziel</label><select class="srch" data-fusa-re-neu-ziel><option value="14">14 Tage</option><option value="30" selected>30 Tage</option><option value="45">45 Tage</option><option value="60">60 Tage</option></select></div>
        </div>
        <div class="fusa-re-fsect">4 — Abrechnungsart & Status</div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Abrechnungsart</label><select class="srch" data-fusa-re-neu-art>${abrechnungsartOptsHtml}</select></div>
          <div class="fusa-re-fg"><label>Status (Vorschau)</label><select class="srch" data-fusa-re-neu-status-preview><option value="geplant">Geplant</option><option value="erstellt">Erstellt</option><option value="versendet">Versendet</option></select></div>
        </div>
        <div class="fusa-re-fg" style="margin-top:10px;"><label>Quartal / Kennzeichnung</label><input type="text" class="srch" data-fusa-re-neu-quartal placeholder="z. B. Q2 2026" /></div>
        <div class="fusa-re-fg" style="margin-top:10px;"><label>Notiz / Verwendungszweck</label><textarea class="srch" data-fusa-re-neu-notiz style="min-height:56px;" placeholder="z. B. Quartalsrechnung Q2 2026 …"></textarea></div>
      </div>
      <div class="fusa-re-df">
        <button type="button" class="btn" data-fusa-re-neu-cancel>Abbrechen</button>
        <button type="button" class="btn" data-fusa-re-neu-entwurf style="background:#f1f5f9;">Entwurf</button>
        <button type="button" class="btn" data-fusa-re-neu-erstellen>Erstellen</button>
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-re-neu-erstellen-versenden>Erstellen & Versenden →</button>
      </div>
    </div>
  </div>

  <div data-fusa-re-ang-host></div>

  <div class="fusa-re-overlay" data-fusa-re-overlay aria-hidden="true">
    <div class="fusa-re-dialog fusa-re-dialog--wide" data-fusa-re-dialog>
      <div class="fusa-re-dh">
        <div style="font-size:15px;font-weight:700;" data-fusa-re-ov-title>—</div>
        <button type="button" class="btn" data-fusa-re-ov-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;line-height:1;" aria-label="Schließen">×</button>
      </div>
      <div class="fusa-re-db">
        <div class="dp-section" data-fusa-re-ov-readonly>
          <div class="dp-slbl">Übersicht</div>
          <div class="dp-row"><span class="dp-lbl">Rechnungs-Nr.</span><span class="dp-val" style="font-weight:700;" data-fusa-re-ov-num>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Kunde</span><span class="dp-val" data-fusa-re-ov-kunde>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Auftrag</span><span class="dp-val" style="font-size:11px;" data-fusa-re-ov-auftrag>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Zeitraum</span><span class="dp-val" data-fusa-re-ov-zeit>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Laufzeit</span><span class="dp-val" data-fusa-re-ov-laufzeit>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Abrechnungsart</span><span class="dp-val"><span class="bdg bb" data-fusa-re-ov-art>—</span></span></div>
          <div class="dp-row"><span class="dp-lbl">Netto</span><span class="dp-val" data-fusa-re-ov-netto>—</span></div>
          <div class="dp-row"><span class="dp-lbl">MwSt.</span><span class="dp-val" data-fusa-re-ov-mwst>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Brutto</span><span class="dp-val" style="font-size:18px;font-weight:700;" data-fusa-re-ov-brutto>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Fällig am</span><span class="dp-val" data-fusa-re-ov-faellig>—</span></div>
          <div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val"><span class="bdg bgr" data-fusa-re-ov-status>—</span></span></div>
        </div>
        <div class="dp-section" data-fusa-re-ov-positionen-wrap hidden>
          <div class="dp-slbl">Positionen</div>
          <div data-fusa-re-ov-positionen></div>
        </div>
        <div class="dp-section" data-fusa-re-ov-notiz-wrap hidden>
          <div class="dp-slbl">Notiz</div>
          <div style="font-size:12px;color:#64748b;" data-fusa-re-ov-notiz></div>
        </div>
        <div class="fusa-re-fsect">Bearbeiten</div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Rechnungs-Nr. (original_id)</label><input class="srch" data-fusa-re-ed-original /></div>
          <div class="fusa-re-fg"><label>Rechnungsdatum</label><input type="date" class="srch" data-fusa-re-ed-rechnungsdatum /></div>
        </div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Kunde (Firma)</label><select class="srch" data-fusa-re-ed-kunde>${firmenOptionsHtml}</select></div>
          <div class="fusa-re-fg"><label>Auftrag</label><select class="srch" data-fusa-re-ed-auftrag>${auftragOptionsHtml}</select></div>
        </div>
        <div class="fusa-re-fgrid">
          <div class="fusa-re-fg"><label>Von</label><input type="date" class="srch" data-fusa-re-ed-von /></div>
          <div class="fusa-re-fg"><label>Bis</label><input type="date" class="srch" data-fusa-re-ed-bis /></div>
        </div>
        <div class="fusa-re-fg" style="margin-top:8px;"><label>Laufzeit (Monate, Text)</label><input class="srch" data-fusa-re-ed-laufzeit placeholder="z. B. 12" /></div>
        <div class="fusa-re-fgrid" style="margin-top:8px;">
          <div class="fusa-re-fg"><label>Netto</label><input type="text" class="srch" data-fusa-re-ed-netto inputmode="decimal" /></div>
          <div class="fusa-re-fg"><label>MwSt. %</label><select class="srch" data-fusa-re-ed-mwst><option value="19">19%</option><option value="7">7%</option><option value="0">0%</option></select></div>
          <div class="fusa-re-fg"><label>Brutto</label><input type="text" class="srch" data-fusa-re-ed-brutto inputmode="decimal" /></div>
        </div>
        <div class="fusa-re-fgrid" style="margin-top:8px;">
          <div class="fusa-re-fg"><label>Fällig am</label><input type="date" class="srch" data-fusa-re-ed-faellig /></div>
          <div class="fusa-re-fg"><label>Status</label><select class="srch" data-fusa-re-ed-status><option value="angebot">Angebot</option><option value="geplant">Geplant</option><option value="erstellt">Erstellt</option><option value="versendet">Versendet</option><option value="ueberfaellig">Überfällig</option><option value="bezahlt">Bezahlt</option></select></div>
        </div>
        <div class="fusa-re-fgrid" style="margin-top:8px;">
          <div class="fusa-re-fg"><label>Abrechnungsart</label><select class="srch" data-fusa-re-ed-art>${abrechnungsartOptsHtml}</select></div>
          <div class="fusa-re-fg"><label>Quartal</label><input class="srch" data-fusa-re-ed-quartal /></div>
        </div>
        <div class="fusa-re-fg" style="margin-top:8px;"><label>Notiz</label><textarea class="srch" data-fusa-re-ed-notiz style="min-height:52px;"></textarea></div>
        <div class="fusa-re-df" style="border:none;padding:12px 0 0;justify-content:flex-start;">
          <button type="button" class="ckp-api-auftrag-submit" data-fusa-re-ed-save>Änderungen speichern</button>
        </div>
      </div>
      <div class="fusa-re-df">
        <button type="button" class="btn" data-fusa-re-ov-pdf>📄 PDF</button>
        <button type="button" class="btn" data-fusa-re-ov-mail>✉ E-Mail</button>
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-re-ov-bezahlt>✓ Als bezahlt markieren</button>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * @param {{ status_canon: string; yearHaystack: string; betrag_brutto: number }[]} rows
 * @param {string} year
 */
function kpiForYearFromRowMeta(rows, year) {
  const y = year != null ? String(year).trim() : '';
  const base = rows.filter(vm => {
    const ys = String(vm.yearHaystack || '')
      .split(',')
      .map(x => x.trim())
      .filter(Boolean);
    if (!y) return true;
    if (ys.length === 0) return true;
    return ys.includes(y);
  });
  return aggregateRechnungKpis(
    base.map(r => ({
      status_canon: /** @type {any} */ (r.status_canon),
      betrag_brutto: r.betrag_brutto,
    })),
  );
}

/**
 * @param {HTMLElement} kpWrap
 * @param {ReturnType<typeof aggregateRechnungKpis>} kpis
 */
function paintKpi(kpWrap, kpis) {
  const set = (sel, text) => {
    const n = kpWrap.querySelector(sel);
    if (n) n.textContent = text;
  };
  set('[data-fusa-re-kpi-u-sum]', formatEuroDe(kpis.ueberfaellig.sum));
  set('[data-fusa-re-kpi-u-n]', `${kpis.ueberfaellig.count} Rechnung${kpis.ueberfaellig.count === 1 ? '' : 'en'}`);
  set('[data-fusa-re-kpi-o-sum]', formatEuroDe(kpis.offen.sum));
  set('[data-fusa-re-kpi-o-n]', `${kpis.offen.count} Rechnung${kpis.offen.count === 1 ? '' : 'en'}`);
  set('[data-fusa-re-kpi-g-sum]', formatEuroDe(kpis.geplant.sum));
  set('[data-fusa-re-kpi-g-n]', `${kpis.geplant.count} Rechnung${kpis.geplant.count === 1 ? '' : 'en'}`);
  set('[data-fusa-re-kpi-b-sum]', formatEuroDe(kpis.bezahlt.sum));
  set('[data-fusa-re-kpi-b-n]', `${kpis.bezahlt.count} Rechnung${kpis.bezahlt.count === 1 ? '' : 'en'}`);
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaRechnungenHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const root = mount.querySelector('[data-ccw-ro="fusa-rechnungen"]');
  if (!(root instanceof HTMLElement)) return;

  if (reAbort) reAbort.abort();
  reAbort = new AbortController();
  const sig = reAbort.signal;

  const runReload = async () => {
    if (typeof onReload === 'function') await onReload();
  };

  const tbody = root.querySelector('[data-fusa-re-tbody]');
  const rowEls = tbody ? [...tbody.querySelectorAll('tr[data-fusa-re-row]')] : [];
  const searchEl = root.querySelector('[data-fusa-re-search]');
  const jahrEl = root.querySelector('[data-fusa-re-jahr]');
  const kpWrap = root.querySelector('[data-fusa-re-kpi-wrap]');

  /** @type {import('../../lib/fusa-rechnung-ui-status.js').FusaRechnungTabFilter} */
  let tab = 'alle';

  function setTabUi() {
    root.querySelectorAll('[data-fusa-re-tab]').forEach(b => {
      if (!(b instanceof HTMLButtonElement)) return;
      const k = /** @type {import('../../lib/fusa-rechnung-ui-status.js').FusaRechnungTabFilter} */ (b.getAttribute('data-fusa-re-tab') || 'alle');
      const on = k === tab;
      b.classList.toggle('fusa-re-tab--active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
  }

  function readYear() {
    return jahrEl instanceof HTMLSelectElement ? String(jahrEl.value || '').trim() : '';
  }

  function rowMetaFromTr(tr) {
    const canon = String(tr.getAttribute('data-re-canon') || 'unknown');
    const ys = String(tr.getAttribute('data-re-years') || '');
    const rawB = tr.getAttribute('data-re-brutto-num');
    const betrag_brutto = rawB != null && String(rawB).trim() !== '' ? Number.parseFloat(String(rawB)) : 0;
    return {
      status_canon: canon,
      yearHaystack: ys,
      betrag_brutto: Number.isFinite(betrag_brutto) ? betrag_brutto : 0,
    };
  }

  function applyFilters() {
    const q = searchEl instanceof HTMLInputElement ? String(searchEl.value || '').trim().toLowerCase() : '';
    const year = readYear();
    const meta = rowEls.map(rowMetaFromTr);
    if (kpWrap instanceof HTMLElement && meta.length) {
      paintKpi(kpWrap, kpiForYearFromRowMeta(meta, year));
    }
    for (let i = 0; i < rowEls.length; i++) {
      const tr = rowEls[i];
      const canon = /** @type {import('../../lib/fusa-rechnung-ui-status.js').FusaRechnungStatusCanon} */ (
        tr.getAttribute('data-re-canon') || 'unknown'
      );
      const ys = String(tr.getAttribute('data-re-years') || '')
        .split(',')
        .map(x => x.trim())
        .filter(Boolean);
      const hay = String(tr.getAttribute('data-re-search') || '').toLowerCase();
      const okYear = !year || ys.length === 0 || ys.includes(year);
      const okTab = rechnungMatchesTab(canon, tab);
      const okQ = !q || hay.includes(q);
      tr.style.display = okYear && okTab && okQ ? '' : 'none';
    }
  }

  setTabUi();
  if (rowEls.length) applyFilters();

  function readNeuAuftragMeta() {
    const ta = root.querySelector('[data-fusa-re-neu-auftraege-json]');
    if (!(ta instanceof HTMLTextAreaElement)) return [];
    try {
      const raw = JSON.parse(ta.textContent || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  }

  function openNeuOverlay() {
    const ov = root.querySelector('[data-fusa-re-neu-overlay]');
    if (ov instanceof HTMLElement) {
      ov.classList.add('fusa-re-overlay--open');
      ov.setAttribute('aria-hidden', 'false');
    }
  }

  function closeNeuOverlay() {
    const ov = root.querySelector('[data-fusa-re-neu-overlay]');
    if (ov instanceof HTMLElement) {
      ov.classList.remove('fusa-re-overlay--open');
      ov.setAttribute('aria-hidden', 'true');
    }
  }

  /** @param {string} s */
  function parseDeDecimal(s) {
    const t = String(s || '').trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return null;
    const n = Number.parseFloat(t);
    return Number.isFinite(n) ? n : null;
  }

  function neuCalcBruttoPreview() {
    const nEl = root.querySelector('[data-fusa-re-neu-netto]');
    const mEl = root.querySelector('[data-fusa-re-neu-mwst]');
    const brEl = root.querySelector('[data-fusa-re-neu-brutto]');
    const prev = root.querySelector('[data-fusa-re-neu-preview]');
    const n = nEl instanceof HTMLInputElement ? parseDeDecimal(nEl.value) : null;
    const m = mEl instanceof HTMLSelectElement ? Number(mEl.value) || 19 : 19;
    const b = n != null && Number.isFinite(n) && n > 0 ? n * (1 + m / 100) : 0;
    if (brEl instanceof HTMLInputElement) {
      brEl.value = n != null && n > 0 && b > 0 ? b.toFixed(2) : '';
    }
    if (prev instanceof HTMLElement) {
      if (n != null && n > 0 && b > 0) {
        prev.style.display = 'block';
        prev.textContent = `Netto: ${formatEuroDe(n)}  +  MwSt. ${m}%: ${formatEuroDe(b - n)}  =  Brutto: ${formatEuroDe(b)}`;
      } else {
        prev.style.display = 'none';
        prev.textContent = '';
      }
    }
  }

  function neuCalcFaelligFromDatum() {
    const dEl = root.querySelector('[data-fusa-re-neu-datum]');
    const zEl = root.querySelector('[data-fusa-re-neu-ziel]');
    const fEl = root.querySelector('[data-fusa-re-neu-faellig]');
    const ds = dEl instanceof HTMLInputElement ? dEl.value : '';
    const z = zEl instanceof HTMLSelectElement ? Number(zEl.value) || 30 : 30;
    if (!ds || !(fEl instanceof HTMLInputElement)) return;
    const d = new Date(`${ds}T12:00:00`);
    if (Number.isNaN(d.getTime())) return;
    d.setDate(d.getDate() + z);
    fEl.value = d.toISOString().slice(0, 10);
  }

  function neuUpdateLaufzeitHint() {
    const v = root.querySelector('[data-fusa-re-neu-von]');
    const b = root.querySelector('[data-fusa-re-neu-bis]');
    const h = root.querySelector('[data-fusa-re-neu-laufzeit-hint]');
    if (!(h instanceof HTMLElement)) return;
    const mv =
      v instanceof HTMLInputElement && b instanceof HTMLInputElement ? monateZwischenIso(v.value, b.value) : '';
    h.textContent = mv ? `Laufzeit: ca. ${mv} Monate` : '';
  }

  function resetNeuFormForOpen() {
    const nrEl = root.querySelector('[data-fusa-re-neu-nr]');
    const next = root.getAttribute('data-fusa-re-next-re') || 're-0001';
    if (nrEl instanceof HTMLInputElement) nrEl.value = next;
    const dEl = root.querySelector('[data-fusa-re-neu-datum]');
    const todayIso = new Date().toISOString().slice(0, 10);
    if (dEl instanceof HTMLInputElement) dEl.value = todayIso;
    neuCalcFaelligFromDatum();
    ['[data-fusa-re-neu-kunde]', '[data-fusa-re-neu-auftrag]', '[data-fusa-re-neu-von]', '[data-fusa-re-neu-bis]'].forEach(sel => {
      const el = root.querySelector(sel);
      if (el instanceof HTMLSelectElement || el instanceof HTMLInputElement) {
        if (el instanceof HTMLSelectElement) el.selectedIndex = 0;
        else el.value = '';
      }
    });
    const n0 = root.querySelector('[data-fusa-re-neu-netto]');
    if (n0 instanceof HTMLInputElement) n0.value = '';
    const m0 = root.querySelector('[data-fusa-re-neu-mwst]');
    if (m0 instanceof HTMLSelectElement) m0.value = '19';
    const q0 = root.querySelector('[data-fusa-re-neu-quartal]');
    if (q0 instanceof HTMLInputElement) q0.value = '';
    const no0 = root.querySelector('[data-fusa-re-neu-notiz]');
    if (no0 instanceof HTMLTextAreaElement) no0.value = '';
    const a0 = root.querySelector('[data-fusa-re-neu-art]');
    if (a0 instanceof HTMLSelectElement) a0.value = 'quartal';
    neuCalcBruttoPreview();
    neuUpdateLaufzeitHint();
  }

  function syncNeuKundeFromAuftrag() {
    const meta = readNeuAuftragMeta();
    const sel = root.querySelector('[data-fusa-re-neu-auftrag]');
    const kid = sel instanceof HTMLSelectElement ? String(sel.value || '').trim() : '';
    const m = meta.find(x => x && String(x.id) === kid);
    const kEl = root.querySelector('[data-fusa-re-neu-kunde]');
    if (kEl instanceof HTMLSelectElement && m && m.kunde_id) {
      const id = String(m.kunde_id);
      if ([...kEl.options].some(o => o.value === id)) kEl.value = id;
    }
  }

  /**
   * @param {'entwurf'|'erstellt'|'versendet'} mode
   */
  async function submitNeuRechnung(mode) {
    const kEl = root.querySelector('[data-fusa-re-neu-kunde]');
    const kundeId = kEl instanceof HTMLSelectElement ? String(kEl.value || '').trim() : '';
    const aEl = root.querySelector('[data-fusa-re-neu-auftrag]');
    const auftragId = aEl instanceof HTMLSelectElement ? String(aEl.value || '').trim() : '';
    const nEl = root.querySelector('[data-fusa-re-neu-netto]');
    const netto = nEl instanceof HTMLInputElement ? parseDeDecimal(nEl.value) : null;
    const vEl = root.querySelector('[data-fusa-re-neu-von]');
    const bEl = root.querySelector('[data-fusa-re-neu-bis]');
    const fEl = root.querySelector('[data-fusa-re-neu-faellig]');
    const dEl = root.querySelector('[data-fusa-re-neu-datum]');
    const von = vEl instanceof HTMLInputElement && vEl.value ? vEl.value : null;
    const bis = bEl instanceof HTMLInputElement && bEl.value ? bEl.value : null;
    const faellig_am = fEl instanceof HTMLInputElement && fEl.value ? fEl.value : null;
    const rechnungsdatum = dEl instanceof HTMLInputElement && dEl.value ? dEl.value : null;
    const nrEl = root.querySelector('[data-fusa-re-neu-nr]');
    const original_id = nrEl instanceof HTMLInputElement && String(nrEl.value || '').trim() ? String(nrEl.value).trim() : null;
    if (!kundeId || netto == null || netto <= 0 || !von || !bis || !faellig_am) {
      flashReResult(root, '⚠ Pflichtfelder ausfüllen (Kunde, Netto, Zeitraum von/bis, Fälligkeit).');
      return;
    }
    const mEl = root.querySelector('[data-fusa-re-neu-mwst]');
    const mw = mEl instanceof HTMLSelectElement ? Number(mEl.value) || 19 : 19;
    const brutto = netto * (1 + mw / 100);
    const artEl = root.querySelector('[data-fusa-re-neu-art]');
    const abrechnungsart = artEl instanceof HTMLSelectElement ? String(artEl.value || 'quartal').trim() : 'quartal';
    const qEl = root.querySelector('[data-fusa-re-neu-quartal]');
    const quartal = qEl instanceof HTMLInputElement && String(qEl.value || '').trim() ? String(qEl.value).trim() : null;
    const noEl = root.querySelector('[data-fusa-re-neu-notiz]');
    const notiz = noEl instanceof HTMLTextAreaElement && String(noEl.value || '').trim() ? String(noEl.value).trim() : null;
    const lz = (() => {
      const h = root.querySelector('[data-fusa-re-neu-laufzeit-hint]');
      const t = h instanceof HTMLElement ? String(h.textContent || '') : '';
      const m1 = t.match(/ca\.\s*(\d+)\s*Monate/);
      return m1 ? m1[1] : monateZwischenIso(von, bis);
    })();
    /** @type {Record<string, unknown>} */
    const extra = { abrechnungsart, laufzeit_monate: lz || undefined };
    let status = 'erstellt';
    if (mode === 'entwurf') {
      status = 'geplant';
      extra.entwurf = true;
    } else if (mode === 'versendet') {
      status = 'versendet';
    }
    try {
      await apiFetch(API_ROUTES.fusa.rechnungen, {
        method: 'POST',
        body: {
          original_id,
          auftrag_id: auftragId || null,
          kunde_id: kundeId,
          von,
          bis,
          netto,
          mwst: mw,
          brutto,
          faellig_am,
          rechnungsdatum,
          status,
          quartal,
          notiz,
          extra_json: extra,
        },
      });
      flashReResult(
        root,
        mode === 'entwurf' ? 'Entwurf gespeichert (Geplant).' : mode === 'versendet' ? 'Rechnung erstellt & als versendet markiert.' : 'Rechnung erstellt.',
      );
      closeNeuOverlay();
      await runReload();
    } catch (e) {
      flashReResult(root, formatApiErrorForUi(e));
    }
  }

  function closeAngebotOverlay() {
    const host = root.querySelector('[data-fusa-re-ang-host]');
    if (host instanceof HTMLElement) host.innerHTML = '';
  }

  /**
   * @param {Record<string, unknown>} pl
   * @param {string} rid
   */
  function openAngebotBestaetigung(pl, rid) {
    const host = root.querySelector('[data-fusa-re-ang-host]');
    if (!(host instanceof HTMLElement)) return;
    const nextId = root.getAttribute('data-fusa-re-next-re') || 're-0001';
    const altNr = pl.rechnungsnummer != null ? String(pl.rechnungsnummer) : '';
    const fd = new Date();
    fd.setDate(fd.getDate() + 14);
    const faelligIso = fd.toISOString().slice(0, 10);
    const faelligDe = formatDateDe(faelligIso);
    const kunde = pl.kunde != null ? String(pl.kunde) : '—';
    const auftrag = pl.auftrag != null ? String(pl.auftrag) : '—';
    const von = pl.von_raw != null ? formatDateDe(String(pl.von_raw)) : '—';
    const bis = pl.bis_raw != null ? formatDateDe(String(pl.bis_raw)) : '—';
    const lz = pl.laufzeit_monate != null && String(pl.laufzeit_monate).trim() !== '' ? String(pl.laufzeit_monate) : '—';
    const adr = pl.adresse != null && String(pl.adresse).trim() !== '' ? String(pl.adresse) : '—';
    const nettoN = pl.betrag_netto != null ? Number(pl.betrag_netto) : 0;
    const bruttoN = pl.betrag_brutto != null ? Number(pl.betrag_brutto) : 0;
    const mwstFoot = mwstBetragAngebotConfirmBlock(nettoN);
    const posList = Array.isArray(pl.positionen) ? pl.positionen : [];
    const ccPct =
      posList[0] && typeof posList[0] === 'object' && posList[0] != null && 'cc_pct' in posList[0]
        ? Number(/** @type {any} */ (posList[0]).cc_pct)
        : 22;
    const ppPct =
      posList[0] && typeof posList[0] === 'object' && posList[0] != null && 'partner_pct' in posList[0]
        ? Number(/** @type {any} */ (posList[0]).partner_pct)
        : 78;
    const rows = posList
      .map(x => {
        if (!x || typeof x !== 'object') return '';
        const o = /** @type {Record<string, unknown>} */ (x);
        const fz = o.fz != null ? String(o.fz) : '';
        const pak = o.paket != null ? String(o.paket) : '';
        const sp = o.servicePrice != null ? Number(o.servicePrice) : 0;
        const ae = o.ae != null ? Number(o.ae) : 0;
        const rab = o.rabatt != null ? Number(o.rabatt) : 0;
        const nm = o.nettoMo != null ? Number(o.nettoMo) : o.svcEff != null ? Number(o.svcEff) : 0;
        const ip = o.internalPrice != null ? Number(o.internalPrice) : 0;
        const cc = o.cc != null ? Number(o.cc) : 0;
        const partner = o.partner != null ? Number(o.partner) : 0;
        const ges = o.gesamt != null ? Number(o.gesamt) : 0;
        return `<tr><td>${esc(fz)}</td><td>${esc(pak)}</td><td class="re-num">${esc(formatEuroDe(sp))}</td><td class="re-num">${ae > 0 ? esc(String(ae)) + '%' : '—'}</td><td class="re-num">${rab > 0 ? esc(String(rab)) + '%' : '—'}</td><td class="re-num">${esc(formatEuroDe(nm))}</td><td class="re-num">${esc(formatEuroDe(ip))}</td><td class="re-num">${esc(formatEuroDe(cc))}</td><td class="re-num">${esc(formatEuroDe(partner))}</td><td class="re-num">${esc(formatEuroDe(ges))}</td></tr>`;
      })
      .join('');
    const tcc = pl.total_cc != null && Number.isFinite(Number(pl.total_cc)) ? Number(pl.total_cc) : 0;
    const tpa = pl.total_partner != null && Number.isFinite(Number(pl.total_partner)) ? Number(pl.total_partner) : 0;
    const heuteIso = new Date().toISOString().slice(0, 10);
    host.innerHTML = `<div class="fusa-re-overlay fusa-re-overlay--open" data-fusa-re-ang-ov style="display:flex;z-index:10025;">
  <div class="fusa-re-dialog fusa-re-dialog--wide" style="max-height:90vh;overflow:auto;">
    <div class="fusa-re-dh">
      <div>
        <div style="font-size:15px;font-weight:700;">Angebot → Rechnung bestätigen</div>
        <div style="font-size:12px;color:#64748b;margin-top:2px;">${esc(altNr)} wird zu ${esc(nextId)}</div>
      </div>
      <button type="button" class="btn" data-fusa-re-ang-close style="background:none;border:none;font-size:20px;cursor:pointer;color:#64748b;">×</button>
    </div>
    <div class="fusa-re-db">
      <div class="fusa-re-fgrid" style="margin-bottom:14px;">
        <div style="background:#f1f5f9;border-radius:8px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Rechnungsempfänger</div>
          <div style="font-size:13px;font-weight:600;">${esc(kunde)}</div>
          <div style="font-size:12px;color:#64748b;">${esc(adr)}</div>
        </div>
        <div style="background:#f1f5f9;border-radius:8px;padding:12px 14px;">
          <div style="font-size:10px;font-weight:700;color:#64748b;text-transform:uppercase;">Rechnungsdetails</div>
          <div style="font-size:12px;">Rechnungs-Nr.: <strong>${esc(nextId)}</strong></div>
          <div style="font-size:12px;">Auftrag: <strong>${esc(auftrag)}</strong></div>
          <div style="font-size:12px;">Laufzeit: <strong>${esc(lz)} Monate (${esc(von)} – ${esc(bis)})</strong></div>
          <div style="font-size:12px;">Zahlungsziel: <strong>${esc(faelligDe)} (14 Tage)</strong></div>
        </div>
      </div>
      <table class="fusa-re-ang-table"><thead><tr><th>Fahrzeug</th><th>Paket</th><th>Service/Mo.</th><th>AE %</th><th>Rabatt %</th><th>Netto/Mo.</th><th>Intern/Mo.</th><th>CC ${Number.isFinite(ccPct) ? ccPct : 22}%</th><th>Partner ${Number.isFinite(ppPct) ? ppPct : 78}%</th><th>Gesamt</th></tr></thead><tbody>${rows || `<tr><td colspan="10" style="color:#64748b;">Keine Positionen in den Daten — Summen folgen aus Netto/Brutto.</td></tr>`}</tbody>
      <tfoot>
        <tr><td colspan="7">Servicepreis netto gesamt</td><td colspan="3" class="re-num">${esc(formatEuroDe(nettoN))}</td></tr>
        <tr><td colspan="7">MwSt. 19% (auf Servicepreis)</td><td colspan="3" class="re-num">${esc(formatEuroDe(mwstFoot))}</td></tr>
        <tr style="background:#E8F5E9;font-weight:700;"><td colspan="7">Gesamtbetrag brutto (Kundenrechnung)</td><td colspan="3" class="re-num">${esc(formatEuroDe(bruttoN))}</td></tr>
        <tr style="background:#EDE7F6;"><td colspan="7">Interner Anteil CC Werbung</td><td colspan="3" class="re-num">${esc(formatEuroDe(tcc))}</td></tr>
        <tr style="background:#E0F2F1;"><td colspan="7">Zahlung an Verkehrsbetrieb (Partner)</td><td colspan="3" class="re-num">${esc(formatEuroDe(tpa))}</td></tr>
      </tfoot></table>
      <div class="fusa-re-df" style="border:none;padding-top:14px;">
        <button type="button" class="btn" data-fusa-re-ang-abbr>Abbrechen</button>
        <button type="button" class="ckp-api-auftrag-submit" data-fusa-re-ang-ok data-fusa-re-ang-rid="${esc(rid)}" data-fusa-re-ang-next="${esc(nextId)}" data-fusa-re-ang-faellig="${esc(faelligIso)}" data-fusa-re-ang-heute="${esc(heuteIso)}">✓ Als Rechnung bestätigen</button>
      </div>
    </div>
  </div></div>`;
    const ov = host.querySelector('[data-fusa-re-ang-ov]');
    const close = () => closeAngebotOverlay();
    host.querySelector('[data-fusa-re-ang-close]')?.addEventListener('click', close);
    host.querySelector('[data-fusa-re-ang-abbr]')?.addEventListener('click', close);
    ov?.addEventListener('click', e => {
      if (e.target === ov) close();
    });
    const ok = host.querySelector('[data-fusa-re-ang-ok]');
    if (ok instanceof HTMLButtonElement) {
      ok.addEventListener('click', () => {
        void (async () => {
          const r = ok.getAttribute('data-fusa-re-ang-rid') || '';
          const nid = ok.getAttribute('data-fusa-re-ang-next') || '';
          const fa = ok.getAttribute('data-fusa-re-ang-faellig') || '';
          const heu = ok.getAttribute('data-fusa-re-ang-heute') || '';
          try {
            const mwPersist = pl.mwst_pct != null ? Number(pl.mwst_pct) : 19;
            await apiFetch(`${API_ROUTES.fusa.rechnungen}/${encodeURIComponent(r)}/promote-from-angebot`, {
              method: 'POST',
              body: {
                neue_original_id: nid,
                faellig_am: fa,
                rechnungsdatum: heu,
                netto: pl.betrag_netto,
                mwst: mwPersist,
                brutto: pl.betrag_brutto,
                kunde_id: pl.kunde_id || undefined,
                extra_json_patch: {
                  angebot_vorlage_nummer: altNr,
                  promoted_at: new Date().toISOString(),
                },
              },
            });
            flashReResult(root, `✓ Rechnung ${nid} erstellt · Fällig: ${faelligDe}`);
            close();
            await runReload();
          } catch (e) {
            flashReResult(root, formatApiErrorForUi(e));
          }
        })();
      });
    }
  }

  root.addEventListener(
    'click',
    ev => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const tabBtn = t.closest('[data-fusa-re-tab]');
      if (tabBtn instanceof HTMLButtonElement) {
        ev.preventDefault();
        const k = tabBtn.getAttribute('data-fusa-re-tab') || 'alle';
        tab = /** @type {import('../../lib/fusa-rechnung-ui-status.js').FusaRechnungTabFilter} */ (k);
        setTabUi();
        applyFilters();
        return;
      }
      const promoteBtn = t.closest('[data-fusa-re-act="promote"]');
      if (promoteBtn instanceof HTMLButtonElement) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(promoteBtn.getAttribute('data-re-id') || '').trim();
        const enc = promoteBtn.getAttribute('data-re-promote-payload') || '';
        const pl = enc ? safeDecodeJsonPayload(enc) : null;
        if (!id || !pl || typeof pl !== 'object') {
          flashReResult(root, 'Angebotsdaten fehlen.');
          return;
        }
        openAngebotBestaetigung(/** @type {Record<string, unknown>} */ (pl), id);
        return;
      }
      const patchBtn = t.closest('[data-fusa-re-act="patch-status"]');
      if (patchBtn instanceof HTMLButtonElement) {
        ev.preventDefault();
        ev.stopPropagation();
        const id = String(patchBtn.getAttribute('data-re-id') || '').trim();
        const next = String(patchBtn.getAttribute('data-re-next-status') || '').trim();
        if (!id || !next) return;
        void (async () => {
          try {
            await apiFetch(`${API_ROUTES.fusa.rechnungen}/${encodeURIComponent(id)}`, {
              method: 'PATCH',
              body: { status: next },
            });
            flashReResult(root, `Status → ${next}`);
            await runReload();
          } catch (e) {
            flashReResult(root, formatApiErrorForUi(e));
          }
        })();
        return;
      }
      const pdfRow = t.closest('[data-fusa-re-pdf-row]');
      if (pdfRow instanceof HTMLButtonElement) {
        ev.preventDefault();
        ev.stopPropagation();
        const tr = pdfRow.closest('tr[data-fusa-re-row]');
        const url = tr instanceof HTMLElement ? String(tr.getAttribute('data-re-pdf') || '').trim() : '';
        if (!url) {
          flashReResult(root, 'PDF: Funktion folgt noch. (Keine Datei-URL von der API.)');
          return;
        }
        if (/^https?:\/\//i.test(url)) {
          window.open(url, '_blank', 'noopener,noreferrer');
          return;
        }
        void (async () => {
          try {
            await triggerAuthedDownload(url);
          } catch (e) {
            flashReResult(root, e instanceof Error ? e.message : 'Download fehlgeschlagen.');
          }
        })();
        return;
      }
      const tr = t.closest('tr[data-fusa-re-row]');
      if (tr instanceof HTMLTableRowElement && root.contains(tr)) {
        if (t.closest('button')) return;
        fillReOverlayFromRow(root, tr);
        openReOverlay(root);
      }
    },
    { signal: sig },
  );

  if (searchEl instanceof HTMLInputElement) searchEl.addEventListener('input', applyFilters, { signal: sig });
  if (jahrEl instanceof HTMLSelectElement) jahrEl.addEventListener('change', applyFilters, { signal: sig });

  root.querySelector('[data-fusa-re-neu]')?.addEventListener(
    'click',
    () => {
      resetNeuFormForOpen();
      openNeuOverlay();
    },
    { signal: sig },
  );

  const neuOv = root.querySelector('[data-fusa-re-neu-overlay]');
  if (neuOv instanceof HTMLElement) {
    neuOv.addEventListener(
      'click',
      e => {
        if (e.target === neuOv) closeNeuOverlay();
      },
      { signal: sig },
    );
  }
  root.querySelector('[data-fusa-re-neu-close]')?.addEventListener('click', () => closeNeuOverlay(), { signal: sig });
  root.querySelector('[data-fusa-re-neu-cancel]')?.addEventListener('click', () => closeNeuOverlay(), { signal: sig });

  root.querySelector('[data-fusa-re-neu-entwurf]')?.addEventListener('click', () => void submitNeuRechnung('entwurf'), { signal: sig });
  root.querySelector('[data-fusa-re-neu-erstellen]')?.addEventListener('click', () => void submitNeuRechnung('erstellt'), { signal: sig });
  root.querySelector('[data-fusa-re-neu-erstellen-versenden]')?.addEventListener('click', () => void submitNeuRechnung('versendet'), {
    signal: sig,
  });

  root.querySelector('[data-fusa-re-neu-datum]')?.addEventListener('change', neuCalcFaelligFromDatum, { signal: sig });
  root.querySelector('[data-fusa-re-neu-ziel]')?.addEventListener('change', neuCalcFaelligFromDatum, { signal: sig });
  root.querySelector('[data-fusa-re-neu-netto]')?.addEventListener('input', neuCalcBruttoPreview, { signal: sig });
  root.querySelector('[data-fusa-re-neu-mwst]')?.addEventListener('change', neuCalcBruttoPreview, { signal: sig });
  root.querySelector('[data-fusa-re-neu-von]')?.addEventListener('change', neuUpdateLaufzeitHint, { signal: sig });
  root.querySelector('[data-fusa-re-neu-bis]')?.addEventListener('change', neuUpdateLaufzeitHint, { signal: sig });
  root.querySelector('[data-fusa-re-neu-auftrag]')?.addEventListener('change', syncNeuKundeFromAuftrag, { signal: sig });

  root.querySelector('[data-fusa-re-ed-save]')?.addEventListener(
    'click',
    () => {
      void (async () => {
        const dlg = root.querySelector('[data-fusa-re-dialog]');
        const rid = dlg instanceof HTMLElement && dlg.dataset.reId ? String(dlg.dataset.reId).trim() : '';
        if (!rid) {
          flashReResult(root, 'Keine Rechnungs-ID.');
          return;
        }
        const oO = root.querySelector('[data-fusa-re-ed-original]');
        const original_id = oO instanceof HTMLInputElement ? String(oO.value || '').trim() || null : null;
        const oRd = root.querySelector('[data-fusa-re-ed-rechnungsdatum]');
        const rechnungsdatum = oRd instanceof HTMLInputElement && oRd.value ? oRd.value : null;
        const oK = root.querySelector('[data-fusa-re-ed-kunde]');
        const kunde_id = oK instanceof HTMLSelectElement && oK.value ? String(oK.value).trim() : null;
        const oA = root.querySelector('[data-fusa-re-ed-auftrag]');
        const auftrag_id = oA instanceof HTMLSelectElement && oA.value ? String(oA.value).trim() : null;
        const oV = root.querySelector('[data-fusa-re-ed-von]');
        const oB = root.querySelector('[data-fusa-re-ed-bis]');
        const von = oV instanceof HTMLInputElement && oV.value ? oV.value : null;
        const bis = oB instanceof HTMLInputElement && oB.value ? oB.value : null;
        const oL = root.querySelector('[data-fusa-re-ed-laufzeit]');
        const lz = oL instanceof HTMLInputElement ? String(oL.value || '').trim() : '';
        const oN = root.querySelector('[data-fusa-re-ed-netto]');
        const netto = oN instanceof HTMLInputElement ? parseDeDecimal(oN.value) : null;
        const oMw = root.querySelector('[data-fusa-re-ed-mwst]');
        const mwst = oMw instanceof HTMLSelectElement ? Number(oMw.value) || 19 : 19;
        const oBr = root.querySelector('[data-fusa-re-ed-brutto]');
        let brutto = oBr instanceof HTMLInputElement ? parseDeDecimal(oBr.value) : null;
        if (netto != null && Number.isFinite(netto)) {
          brutto = netto * (1 + mwst / 100);
        }
        const oF = root.querySelector('[data-fusa-re-ed-faellig]');
        const faellig_am = oF instanceof HTMLInputElement && oF.value ? oF.value : null;
        const oSt = root.querySelector('[data-fusa-re-ed-status]');
        const status = oSt instanceof HTMLSelectElement ? String(oSt.value || '').trim() : null;
        const oAr = root.querySelector('[data-fusa-re-ed-art]');
        const abrechnungsart = oAr instanceof HTMLSelectElement ? String(oAr.value || 'quartal').trim() : 'quartal';
        const oQ = root.querySelector('[data-fusa-re-ed-quartal]');
        const quartal = oQ instanceof HTMLInputElement && String(oQ.value || '').trim() ? String(oQ.value).trim() : null;
        const oNo = root.querySelector('[data-fusa-re-ed-notiz]');
        const notiz = oNo instanceof HTMLTextAreaElement ? String(oNo.value || '') : null;
        try {
          await apiFetch(`${API_ROUTES.fusa.rechnungen}/${encodeURIComponent(rid)}`, {
            method: 'PATCH',
            body: {
              original_id,
              rechnungsdatum,
              kunde_id,
              auftrag_id,
              von,
              bis,
              netto,
              mwst,
              brutto,
              faellig_am,
              status,
              quartal,
              notiz,
              extra_json_patch: {
                abrechnungsart,
                laufzeit_monate: lz || undefined,
              },
            },
          });
          flashReResult(root, 'Rechnung gespeichert.');
          closeReOverlay(root);
          await runReload();
        } catch (e) {
          flashReResult(root, formatApiErrorForUi(e));
        }
      })();
    },
    { signal: sig },
  );

  function edCalcBrutto() {
    const nEl = root.querySelector('[data-fusa-re-ed-netto]');
    const mEl = root.querySelector('[data-fusa-re-ed-mwst]');
    const bEl = root.querySelector('[data-fusa-re-ed-brutto]');
    const n = nEl instanceof HTMLInputElement ? parseDeDecimal(nEl.value) : null;
    const m = mEl instanceof HTMLSelectElement ? Number(mEl.value) || 19 : 19;
    if (bEl instanceof HTMLInputElement && n != null && n > 0) {
      bEl.value = (n * (1 + m / 100)).toFixed(2);
    }
  }
  root.querySelector('[data-fusa-re-ed-netto]')?.addEventListener('input', edCalcBrutto, { signal: sig });
  root.querySelector('[data-fusa-re-ed-mwst]')?.addEventListener('change', edCalcBrutto, { signal: sig });

  const ov = root.querySelector('[data-fusa-re-overlay]');
  if (ov instanceof HTMLElement) {
    ov.addEventListener(
      'click',
      e => {
        if (e.target === ov) closeReOverlay(root);
      },
      { signal: sig },
    );
  }
  root.querySelector('[data-fusa-re-ov-close]')?.addEventListener('click', () => closeReOverlay(root), { signal: sig });

  root.querySelector('[data-fusa-re-ov-pdf]')?.addEventListener(
    'click',
    () => {
      const b = root.querySelector('[data-fusa-re-ov-pdf]');
      const url = b instanceof HTMLButtonElement ? String(b.getAttribute('data-re-open-url') || '').trim() : '';
      if (!url) {
        flashReResult(root, 'PDF: Funktion folgt noch. (Keine Datei-URL von der API.)');
        return;
      }
      if (/^https?:\/\//i.test(url)) {
        window.open(url, '_blank', 'noopener,noreferrer');
        return;
      }
      void (async () => {
        try {
          await triggerAuthedDownload(url);
        } catch (e) {
          flashReResult(root, e instanceof Error ? e.message : 'Download fehlgeschlagen.');
        }
      })();
    },
    { signal: sig },
  );

  root.querySelector('[data-fusa-re-ov-mail]')?.addEventListener(
    'click',
    () => {
      flashReResult(root, 'E-Mail: Funktion folgt noch.');
    },
    { signal: sig },
  );

  root.querySelector('[data-fusa-re-ov-bezahlt]')?.addEventListener(
    'click',
    () => {
      const dlg = root.querySelector('[data-fusa-re-dialog]');
      const rid = dlg instanceof HTMLElement && dlg.dataset.reId ? String(dlg.dataset.reId).trim() : '';
      if (!rid) {
        flashReResult(root, 'Keine Rechnungs-ID.');
        closeReOverlay(root);
        return;
      }
      void (async () => {
        try {
          await apiFetch(`${API_ROUTES.fusa.rechnungen}/${encodeURIComponent(rid)}`, {
            method: 'PATCH',
            body: { status: 'bezahlt' },
          });
          flashReResult(root, 'Als bezahlt markiert.');
          closeReOverlay(root);
          await runReload();
        } catch (e) {
          flashReResult(root, formatApiErrorForUi(e));
        }
      })();
    },
    { signal: sig },
  );

  const pam = consumeFusaRechnungenAfterMountActions();
  if (pam) {
    if (pam.focusRechnungId) {
      const fid = String(pam.focusRechnungId).trim();
      if (fid) {
        let trHit = null;
        for (const tr of rowEls) {
          if (tr.getAttribute('data-re-id') === fid) {
            trHit = tr;
            break;
          }
        }
        if (trHit instanceof HTMLTableRowElement) {
          trHit.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
          fillReOverlayFromRow(root, trHit);
          openReOverlay(root);
        }
      }
    } else if (pam.openNeu) {
      resetNeuFormForOpen();
      const q0 = root.querySelector('[data-fusa-re-neu-quartal]');
      if (pam.quartalHint && q0 instanceof HTMLInputElement) q0.value = String(pam.quartalHint);
      openNeuOverlay();
    }
  }
}
