/**
 * FUSA — Fahrzeuge: UI/Struktur an `FUSA_Umzug_Fertig` (`_COCKPIT_UMZUG` / `fahrzeuge.js`, `templates.js`) angelehnt.
 * Daten ausschließlich Cockpit-API: `GET /fahrzeuge`, `GET /fahrzeuge/:id`, `POST /fahrzeuge` — kein state.fusa, keine Seeds.
 */
import { esc } from '../../fusa-ui-shared.js';
import { apiFetch, formatApiErrorForUi, getApiBaseUrl } from '../../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../../core/api/api-routes.js';
import CCState from '../../../../core/state/state.js';
import { mapSchadenApiRowToViewModel } from '../../lib/fusa-schaden-view-model.js';
import { loadMyRights, myRight } from '../../../../core/access/cc-my-rights.js';
import { getFusaAppProject, ensureFusaProjectSelection } from '../../fusa-project-context.js';

/**
 * Laufzeit-Debug (DevTools): `sessionStorage.setItem('cc_fusa_fz_debug','1')` oder `?fzdebug=1` in der URL.
 * Kein localStorage (keine persistente Debug-Flag-Quelle).
 */
function isFusaFzRuntimeDebug() {
  try {
    if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem('cc_fusa_fz_debug') === '1') return true;
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('fzdebug') === '1') return true;
    return false;
  } catch {
    return false;
  }
}

const FZ_TYP_FILTERS = [
  { id: 'fusa-fz-typ-solobus', label: 'Solobus', aliases: ['solobus'] },
  { id: 'fusa-fz-typ-gelenkbus', label: 'Gelenkbus', aliases: ['gelenkbus'] },
  { id: 'fusa-fz-typ-ubahn', label: 'U-Bahn 8 Achsen', aliases: ['u-bahn', 'ubahn'] },
  { id: 'fusa-fz-typ-stadtbahn', label: 'Stadtbahn 8 Achsen', aliases: ['stadtbahn'] },
];

const FZ_LOC_FILTERS = [
  { id: 'fusa-fz-loc-econova', label: 'Essen Econova-Alee' },
  { id: 'fusa-fz-loc-rurhallee', label: 'Essen Rurhallee' },
  { id: 'fusa-fz-loc-schweriner', label: 'Essen Schweriner Str.' },
  { id: 'fusa-fz-loc-stadtmitte', label: 'Essen Stadtmitte' },
  { id: 'fusa-fz-loc-muelheim', label: 'Mülheim Duisburgerstr.' },
];

const BETREIBER_DEPOTS = {
  'Ruhrbahn Essen': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'Bogestra AG': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'DVG Duisburg': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  'Stadtwerke Essen': [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
  Sonstiger: [
    'Essen Econova-Alee',
    'Essen Rurhallee',
    'Essen Schweriner Str.',
    'Essen Stadtmitte',
    'Mülheim Duisburgerstr.',
  ],
};

const HERSTELLER_OPTIONS = [
  'Mercedes-Benz (Citaro)',
  "MAN (Lion's City)",
  'Solaris (Urbino)',
  'Volvo',
  'Bombardier (Flexity)',
  'Alstom (Citadis)',
  'Siemens (Avenio)',
  'Van Hool',
  'Sonstiger',
];

function normalizeStatus(raw) {
  const s = raw == null ? '' : String(raw).trim().toLowerCase();
  if (s === 'belegt' || s === 'in_nutzung' || s === 'aktiv') return 'belegt';
  if (s === 'endet' || s === 'endet_bald') return 'endet';
  if (s === 'schaden' || s === 'defekt') return 'schaden';
  if (s === 'geplant' || s === 'in_planung') return 'geplant';
  if (s === 'frei' || s === 'verfuegbar' || s === 'verfügbar') return 'frei';
  return s || 'frei';
}

function statusLabel(statusNorm) {
  if (statusNorm === 'belegt') return 'Belegt';
  if (statusNorm === 'endet') return 'Endet bald';
  if (statusNorm === 'schaden') return 'Schaden';
  if (statusNorm === 'geplant') return 'Geplant';
  if (statusNorm === 'frei') return 'Frei';
  return statusNorm ? statusNorm[0].toUpperCase() + statusNorm.slice(1) : 'Frei';
}

function statusBadgeClass(statusNorm) {
  if (statusNorm === 'belegt') return 'bb';
  if (statusNorm === 'endet') return 'ba';
  if (statusNorm === 'schaden') return 'br';
  if (statusNorm === 'geplant') return 'bp';
  return 'bt';
}

function toLower(x) {
  return String(x == null ? '' : x).toLowerCase();
}

function encodeDetailPayload(obj) {
  try {
    return encodeURIComponent(JSON.stringify(obj));
  } catch {
    return '';
  }
}

/** @param {unknown} h */
function normalizeHistorieEntry(h) {
  if (!h || typeof h !== 'object') return { jahr: '—', kunde: '—', paket: '—', start: '—', end: '—' };
  const o = /** @type {Record<string, unknown>} */ (h);
  return {
    jahr: o.jahr != null ? String(o.jahr) : '—',
    kunde: o.kunde != null ? String(o.kunde) : '—',
    paket: o.paket != null ? String(o.paket) : '—',
    start: o.start != null ? String(o.start) : '—',
    end: o.end != null ? String(o.end) : '—',
  };
}

/** @param {unknown} fo */
function mapFotoSlot(fo) {
  if (!fo || typeof fo !== 'object') {
    return { lbl: '', filled: false, datum: '', von: '', dataUrl: '' };
  }
  const o = /** @type {Record<string, unknown>} */ (fo);
  const dataUrl = o.dataUrl != null ? String(o.dataUrl) : o.url != null ? String(o.url) : '';
  return {
    lbl: o.lbl != null ? String(o.lbl) : o.label != null ? String(o.label) : '',
    filled: !!(o.filled || dataUrl),
    datum: o.datum != null ? String(o.datum) : '',
    von: o.von != null ? String(o.von) : '',
    dataUrl,
  };
}

function decodeDetailPayload(raw) {
  try {
    return JSON.parse(decodeURIComponent(String(raw || '')));
  } catch {
    return null;
  }
}

/**
 * @param {HTMLElement} body
 * @param {string} message
 */
function flashFusaFzDetailPlaceholder(body, message) {
  const msg = String(message || '').trim() || 'Funktion folgt noch.';
  const prev = body.querySelector('[data-fusa-fz-detail-flash]');
  if (prev instanceof HTMLElement) prev.remove();
  const p = document.createElement('p');
  p.className = 'ckp-mock-note';
  p.setAttribute('role', 'status');
  p.setAttribute('data-fusa-fz-detail-flash', '');
  p.textContent = msg;
  body.insertBefore(p, body.firstChild);
  p.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  window.setTimeout(() => {
    p.remove();
  }, 3200);
}

/** Balkenfarbe Laufzeit — wie FERTIG an Status gekoppelt. */
function laufzeitBarColorFromStatusNorm(statusNorm) {
  if (statusNorm === 'belegt') return 'var(--blue)';
  if (statusNorm === 'endet') return 'var(--amber)';
  if (statusNorm === 'schaden') return 'var(--red)';
  if (statusNorm === 'geplant') return 'var(--purple)';
  if (statusNorm === 'frei') return 'var(--teal)';
  return 'var(--blue)';
}

/**
 * QR-/Scan-Ziel nur aus API-Feldern (details_json o. ä.), kein fester Marketing-Host.
 * @param {Record<string, unknown>} row
 */
function qrUrlFromApiRow(row) {
  const candidates = [row.qr_url, row.qrUrl, row.scan_url, row.scanUrl, row.qr_target_url];
  for (const c of candidates) {
    if (c == null) continue;
    const s = String(c).trim();
    if (s) return s;
  }
  return '';
}

/** @param {string} url */
function isLikelyQrRasterImageUrl(url) {
  const u = String(url || '').trim().toLowerCase();
  if (!u) return false;
  if (u.startsWith('data:image/')) return true;
  return /\.(png|jpe?g|gif|webp)(\?|$)/i.test(u);
}

/** @param {string} url */
function looksLikeHttpScanLandingUrl(url) {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (isLikelyQrRasterImageUrl(s)) return false;
  return true;
}

/**
 * Kanonische Scan-URL wie Alt `printFzQR` (Query fz/n/d/t auf `/scan`).
 * @param {Record<string, unknown>} vm
 */
function buildDefaultScanQueryUrlForFz(vm) {
  let base = String(getApiBaseUrl() || '')
    .trim()
    .replace(/\/+$/, '');
  base = base.replace(/\/api\/v1$/i, '');
  let origin = base;
  try {
    const u = new URL(base.startsWith('http') ? base : `https://${base}`);
    origin = u.origin;
  } catch {
    /* keep */
  }
  const params = new URLSearchParams();
  if (vm.id) params.set('fz', String(vm.id));
  if (vm.nummer) params.set('n', String(vm.nummer));
  if (vm.depot) params.set('d', String(vm.depot));
  const typLine = String((vm.subtyp != null ? vm.subtyp : '') || (vm.typ != null ? vm.typ : '') || '').trim();
  if (typLine) params.set('t', typLine);
  return `${String(origin).replace(/\/+$/, '')}/scan?${params.toString()}`;
}

/**
 * @param {Record<string, unknown>} vm
 */
function resolveCanonicalScanUrlForFz(vm) {
  const q = vm.qrUrl != null ? String(vm.qrUrl).trim() : '';
  if (q && looksLikeHttpScanLandingUrl(q)) return q;
  return buildDefaultScanQueryUrlForFz(vm);
}

/** @type {Promise<void>|null} */
let fusaFzQrScriptPromise = null;

function loadQrCodeJsOnce() {
  if (typeof window === 'undefined') return Promise.resolve();
  if (/** @type {{ QRCode?: unknown }} */ (window).QRCode) return Promise.resolve();
  if (!fusaFzQrScriptPromise) {
    fusaFzQrScriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector('script[data-ccw-qrcodejs]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('QRCode.js')), { once: true });
        return;
      }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
      s.async = true;
      s.dataset.ccwQrcodejs = '';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('QRCode.js'));
      document.head.appendChild(s);
    });
  }
  return fusaFzQrScriptPromise;
}

/**
 * @param {HTMLElement} host
 * @param {string} text
 */
async function renderQrIntoHost(host, text) {
  if (!(host instanceof HTMLElement)) return;
  host.innerHTML = '';
  const t = String(text || '').trim();
  if (!t) {
    host.innerHTML =
      '<div style="width:120px;height:120px;background:var(--gray-l);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:11px;color:var(--text3);text-align:center;padding:8px;">Kein Scan-Ziel</div>';
    return;
  }
  try {
    await loadQrCodeJsOnce();
    const QR = /** @type {{ new (el: HTMLElement, o: object): unknown, CorrectLevel: { H: unknown } }} */ (
      /** @type {unknown} */ (window).QRCode
    );
    if (!QR) throw new Error('no QR');
    // eslint-disable-next-line new-cap
    new QR(host, {
      text: t,
      width: 120,
      height: 120,
      colorDark: '#0F1923',
      colorLight: '#ffffff',
      correctLevel: QR.CorrectLevel.H,
    });
  } catch {
    host.innerHTML = `<div style="width:120px;height:120px;background:var(--gray-l);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;color:var(--text2);text-align:center;padding:8px;line-height:1.35;">QR konnte nicht erzeugt werden.</div>`;
  }
}

/**
 * @param {{ title: string, headline: string, sub: string, scanUrl: string, qrPixel?: number }} o
 */
function openFzQrPrintWindow(o) {
  const w = window.open('', '_blank', 'width=480,height=640,noopener,noreferrer');
  if (!w) return;
  const title = esc(o.title);
  const headline = esc(o.headline);
  const sub = esc(o.sub);
  const px = Math.max(96, Math.min(320, o.qrPixel == null ? 220 : Number(o.qrPixel)));
  const scanJson = JSON.stringify(o.scanUrl);
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><` +
    `/script><style>body{font-family:system-ui,sans-serif;text-align:center;padding:28px;color:#111;}h1{font-size:20px;margin:0 0 6px;}p.sub{color:#555;font-size:13px;margin:0 0 18px;}#qwrap{display:inline-block;padding:12px;border:2px solid #000;border-radius:8px;}.url{font-family:monospace;font-size:10px;word-break:break-all;color:#333;margin-top:14px;max-width:420px;margin-left:auto;margin-right:auto;}@media print{body{padding:12px;}}</style></head><body><h1>${headline}</h1><p class="sub">${sub}</p><div id="qwrap"><div id="qrprint"></div></div><p class="url">${esc(
    o.scanUrl,
  )}</p><script>(function(){var u=${scanJson};function go(){try{if(window.QRCode&&document.getElementById("qrprint")){new QRCode(document.getElementById("qrprint"),{text:u,width:${String(
    px,
  )},height:${String(px)},colorDark:"#000",colorLight:"#fff",correctLevel:QRCode.CorrectLevel.H});}}catch(e){}setTimeout(function(){window.print();},650);}if(window.QRCode)go();else window.addEventListener("load",go);})();<` +
    `/script></body></html>`;
  w.document.open();
  w.document.write(body);
  w.document.close();
}

/**
 * @param {Record<string, unknown>} vm
 * @param {string} scanUrl
 */
function openFzStickerPrintWindow(vm, scanUrl) {
  const w = window.open('', '_blank', 'width=360,height=420,noopener,noreferrer');
  if (!w) return;
  const title = esc(`Aufkleber ${vm.nummer != null ? String(vm.nummer) : ''}`);
  const num = esc(vm.nummer != null ? String(vm.nummer) : '—');
  const scanJson = JSON.stringify(scanUrl);
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><` +
    `/script><style>@page{size:55mm 40mm;margin:2mm;}body{margin:0;padding:2mm;font-family:system-ui,sans-serif;}.wrap{display:flex;align-items:center;gap:2mm;height:34mm;}#qrprint{flex-shrink:0;width:18mm;height:18mm;}.txt{flex:1;font-size:8pt;line-height:1.15;font-weight:600;}.mono{font-size:5pt;word-break:break-all;color:#333;margin-top:1mm;}</style></head><body><div class="wrap"><div id="qrprint"></div><div class="txt">${num}<div class="mono">${esc(
    scanUrl,
  )}</div></div></div><script>(function(){var u=${scanJson};function go(){try{if(window.QRCode&&document.getElementById("qrprint")){new QRCode(document.getElementById("qrprint"),{text:u,width:72,height:72,colorDark:"#000",colorLight:"#fff",correctLevel:QRCode.CorrectLevel.H});}}catch(e){}setTimeout(function(){window.print();},650);}if(window.QRCode)go();else window.addEventListener("load",go);})();<` +
    `/script></body></html>`;
  w.document.open();
  w.document.write(body);
  w.document.close();
}

/**
 * @param {Record<string, unknown>} vm
 */
function openFahrzeugaktePdfPrint(vm) {
  const w = window.open('', '_blank', 'width=900,height=1100,noopener,noreferrer');
  if (!w) return;
  const scanUrl = resolveCanonicalScanUrlForFz(vm);
  const scanJson = JSON.stringify(scanUrl);
  const px = 160;
  const rows = [
    ['Fahrzeugnummer', String(vm.nummer || '—')],
    ['Kennzeichen', String(vm.kennzeichen || '—')],
    ['Typ', String(vm.typ || '—')],
    ['Subtyp / Klasse', String(vm.subtyp || vm.fahrzeugklasse || '—')],
    ['Betreiber', String(vm.betreiber || '—')],
    ['Depot', String(vm.depot || '—')],
    ['Status', String(vm.statusLabel || '—')],
    ['Scan-URL', scanUrl],
  ];
  const tableHtml = rows
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 10px;border:1px solid #ccc;font-weight:600;width:32%;">${esc(k)}</td><td style="padding:6px 10px;border:1px solid #ccc;">${esc(v)}</td></tr>`,
    )
    .join('');
  const title = esc(`Fahrzeugakte ${vm.nummer != null ? String(vm.nummer) : ''}`);
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><script src="https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js"><` +
    `/script><style>body{font-family:system-ui,sans-serif;padding:18px;color:#111;}h1{font-size:18px;}table{border-collapse:collapse;width:100%;margin-top:12px;}#qwrap{display:inline-block;padding:8px;border:1px solid #000;margin-top:10px;}@media print{body{padding:10px;}}</style></head><body><h1>Fahrzeugakte</h1><p style="color:#555;font-size:13px;">${esc(
    String(vm.typ || '—'),
  )} · ${esc(String(vm.betreiber || '—'))} · Depot ${esc(String(vm.depot || '—'))}</p><table>${tableHtml}</table><div id="qwrap"><div id="qrprint"></div></div><script>(function(){var u=${scanJson};function go(){try{if(window.QRCode&&document.getElementById("qrprint")){new QRCode(document.getElementById("qrprint"),{text:u,width:${String(
    px,
  )},height:${String(px)},colorDark:"#000",colorLight:"#fff",correctLevel:QRCode.CorrectLevel.H});}}catch(e){}setTimeout(function(){window.print();},700);}if(window.QRCode)go();else window.addEventListener("load",go);})();<` +
    `/script></body></html>`;
  w.document.open();
  w.document.write(body);
  w.document.close();
}

function mapFahrzeugToViewModel(row) {
  const statusNorm = normalizeStatus(row.status);
  const laufzeitPctRaw = Number(row.laufzeit_pct ?? row.laufzeitPct ?? 0);
  const laufzeitPct = Number.isFinite(laufzeitPctRaw) ? Math.max(0, Math.min(100, Math.round(laufzeitPctRaw))) : 0;
  const typ = row.typ != null ? String(row.typ) : '';
  const subtyp =
    row.subtyp != null && String(row.subtyp).trim() !== ''
      ? String(row.subtyp)
      : row.modell != null && String(row.modell).trim() !== ''
        ? String(row.modell)
        : '';
  const standort = row.standort != null ? String(row.standort) : '';
  const depot = row.depot != null && String(row.depot).trim() !== '' ? String(row.depot) : standort;
  const betreiber = row.betreiber != null ? String(row.betreiber) : '';
  const typKategorie = row.typ_kategorie != null ? String(row.typ_kategorie) : '';
  const antriebStr = row.antrieb != null ? String(row.antrieb) : '';
  const herstellerStr = row.hersteller != null ? String(row.hersteller) : '';
  const modellStr = row.modell != null ? String(row.modell) : '';
  const wagennummerStr = row.wagennummer != null ? String(row.wagennummer) : '';
  const erstzulassungStr = row.erstzulassung != null ? String(row.erstzulassung) : '';
  const notizStr = row.notiz != null ? String(row.notiz) : '';
  const zustaendigStr = row.zustaendig_cc != null ? String(row.zustaendig_cc) : '';
  const werbeflaechenStr = Array.isArray(row.werbeflaechen)
    ? row.werbeflaechen
        .map((x) => String(x))
        .join(' ')
        .trim()
    : '';
  const laufzeitBis = row.laufzeit_bis ?? row.auftrag_ende ?? row.ende ?? null;
  const auftragKunde = row.auftrag_kunde ?? row.kunde_name ?? null;
  const auftragPaket = row.auftrag_paket ?? row.paket_name ?? null;
  const eigenwerbung = !!(row.eigenwerbung || row.is_eigenwerbung || row.eigenwerbung_aktiv);
  const statusGroup =
    statusNorm === 'belegt' || statusNorm === 'endet'
      ? 'belegt'
      : statusNorm === 'schaden'
        ? 'schaden'
        : 'frei';
  /** Muss zur Backend-Haystack-Logik in `buildFahrzeugTypHaystack` (fusa-belegung-verfuegbarkeit.js) passen. */
  const typeSearch = `${typ} ${subtyp} ${typKategorie} ${antriebStr} ${herstellerStr} ${modellStr}`.trim();
  return {
    id: row.id != null ? String(row.id) : '',
    nummer: row.kennung != null ? String(row.kennung) : row.num != null ? String(row.num) : '',
    kennzeichen: row.kennzeichen != null ? String(row.kennzeichen) : '',
    typ,
    subtyp,
    depot,
    betreiber,
    statusNorm,
    statusLabel: statusLabel(statusNorm),
    statusBadge: statusBadgeClass(statusNorm),
    statusGroup,
    auftragKunde: auftragKunde != null ? String(auftragKunde) : '',
    auftragPaket: auftragPaket != null ? String(auftragPaket) : '',
    laufzeitBis: laufzeitBis == null || String(laufzeitBis).trim() === '' ? '—' : String(laufzeitBis),
    laufzeitPct,
    eigenwerbung,
    hersteller: herstellerStr.trim() !== '' ? herstellerStr : '—',
    fahrzeugklasse: subtyp.trim() !== '' ? subtyp : '—',
    baujahr: row.baujahr != null ? String(row.baujahr) : '—',
    ausmusterung:
      row.ausmusterung != null && String(row.ausmusterung).trim() !== ''
        ? String(row.ausmusterung)
        : row.ausmusterung_geplant != null
          ? String(row.ausmusterung_geplant)
          : '—',
    linien: row.linie != null ? String(row.linie) : row.linien != null ? String(row.linien) : '—',
    wagennummer: wagennummerStr,
    erstzulassung: erstzulassungStr,
    notiz: notizStr,
    zustaendig_cc: zustaendigStr,
    werbeflaechen: Array.isArray(row.werbeflaechen) ? row.werbeflaechen.map((x) => String(x)) : [],
    typKategorie,
    antrieb: antriebStr,
    werkstattMail:
      row.werkstatt_mail != null
        ? String(row.werkstatt_mail)
        : depot && BETREIBER_DEPOTS['Ruhrbahn Essen'] && BETREIBER_DEPOTS['Ruhrbahn Essen'].includes(depot)
          ? 'werkstatt@ruhrbahn.de'
          : '—',
    qrUrl: qrUrlFromApiRow(/** @type {Record<string, unknown>} */ (row)),
    historie: Array.isArray(row.historie) ? row.historie.map((h) => normalizeHistorieEntry(h)) : [],
    fotos: Array.isArray(row.fotos) ? row.fotos.map((x) => mapFotoSlot(x)) : [],
    dokumente: Array.isArray(row.dokumente) ? row.dokumente : [],
    schaeden: Array.isArray(row.schaeden) ? row.schaeden : [],
    auftragPreis:
      row.auftrag_preis != null
        ? String(row.auftrag_preis)
        : row.preis != null
          ? String(row.preis)
          : '',
    auftragStart: row.auftrag_start != null ? String(row.auftrag_start) : row.start != null ? String(row.start) : '',
    auftragEnde: row.auftrag_ende != null ? String(row.auftrag_ende) : row.ende != null ? String(row.ende) : '',
    montageDatum: row.montage_datum != null ? String(row.montage_datum) : row.montage != null ? String(row.montage) : '',
    monteure: row.monteure != null ? String(row.monteure) : row.monteur != null ? String(row.monteur) : '',
    typeSearch: toLower(typeSearch),
    searchText: toLower(
      `${row.kennung ?? ''} ${typ} ${subtyp} ${depot} ${betreiber} ${row.kennzeichen ?? ''} ${row.linie ?? ''} ${row.linien ?? ''} ${wagennummerStr} ${typKategorie} ${antriebStr} ${herstellerStr} ${modellStr} ${erstzulassungStr} ${notizStr} ${zustaendigStr} ${werbeflaechenStr}`,
    ),
    locationSearch: toLower(depot),
  };
}

function kpiCardHtml(opts) {
  return `<div class="ccds-stat-card">
  <div class="ccds-stat-icon-box ${esc(opts.iconClass)}" aria-hidden="true">${esc(opts.icon)}</div>
  <div><div class="ccds-stat-val" data-fusa-fz-kpi="${esc(opts.key)}">${esc(String(opts.value))}</div><div class="ccds-stat-label">${esc(opts.label)}</div></div>
</div>`;
}

/**
 * @returns {Promise<string>}
 */
export async function renderFusaFahrzeugeViewHtml() {
  let loadErr = '';
  /** @type {{ id: string, name?: string|null }[]} */
  let projects = [];
  /** @type {object[]} */
  let fahrzeugeAll = [];
  try {
    const pr = await apiFetch(API_ROUTES.cockpit.projects);
    projects = Array.isArray(pr.projects) ? pr.projects.filter((p) => p && p.id != null) : [];
  } catch (e) {
    loadErr = formatApiErrorForUi(e);
  }
  try {
    const fr = await apiFetch(API_ROUTES.fusa.fahrzeuge);
    fahrzeugeAll = Array.isArray(fr.fahrzeuge) ? fr.fahrzeuge : [];
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  /** @type {Map<string, number>} */
  const schadenCountByFz = new Map();
  try {
    const sc = await apiFetch(API_ROUTES.fusa.schaeden);
    const arr = Array.isArray(sc.schaeden) ? sc.schaeden : [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const fid = /** @type {{ fahrzeug_id?: unknown }} */ (r).fahrzeug_id;
      if (fid == null || String(fid).trim() === '') continue;
      const id = String(fid).trim();
      schadenCountByFz.set(id, (schadenCountByFz.get(id) || 0) + 1);
    }
  } catch (e) {
    if (!loadErr) loadErr = formatApiErrorForUi(e);
  }

  await ensureFusaProjectSelection(projects);
  const ctx = getFusaAppProject();
  const pid = ctx && ctx.id ? String(ctx.id) : '';
  const fallbackPid =
    pid || (projects[0] && projects[0].id != null ? String(projects[0].id) : '');
  let rightsBundle = null;
  try {
    rightsBundle = await loadMyRights();
  } catch {
    rightsBundle = null;
  }
  const canCreate = myRight(rightsBundle, 'fusa', 'fahrzeuge', 'erstellen');

  const sourceRows = fallbackPid
    ? fahrzeugeAll.filter((f) => f && String(f.project_id || '') === fallbackPid)
    : [];
  const allRows = sourceRows
    .map(row => {
      const vm = mapFahrzeugToViewModel(row);
      if (!vm || !vm.id) return null;
      const apiC = schadenCountByFz.get(String(vm.id)) || 0;
      const emb = Array.isArray(row.schaeden) && row.schaeden.length > 0;
      return { ...vm, hasSchadenDot: apiC > 0 || emb };
    })
    .filter((v) => v && v.id);

  const kpiBelegt = allRows.filter((r) => r.statusGroup === 'belegt').length;
  const kpiFrei = allRows.filter((r) => r.statusGroup === 'frei').length;
  const kpiSchaden = allRows.filter((r) => r.statusNorm === 'schaden').length;
  const kpiEndet = allRows.filter((r) => r.statusNorm === 'endet' || r.laufzeitPct >= 75).length;

  const projectHint =
    projects.length === 0
      ? `<p class="ckp-api-error" role="status">Keine Projekte verfügbar.</p>`
      : '';

  const typeFilterRows = FZ_TYP_FILTERS.map(
    (x) =>
      `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text);"><input type="checkbox" id="${esc(x.id)}" data-fusa-fz-type-filter="${esc(x.aliases.join('|'))}" data-fusa-fz-filter-label="${esc(x.label)}" style="width:16px;height:16px;accent-color:#E8A83A;cursor:pointer;"> ${esc(x.label)}</label>`,
  ).join('');
  const locFilterRows = FZ_LOC_FILTERS.map(
    (x) =>
      `<label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:13px;color:var(--text);"><input type="checkbox" id="${esc(x.id)}" data-fusa-fz-loc-filter="${esc(toLower(x.label))}" data-fusa-fz-filter-label="${esc(x.label)}" style="width:16px;height:16px;accent-color:#E8A83A;cursor:pointer;"> ${esc(x.label)}</label>`,
  ).join('');

  const tableRowsHtml =
    allRows.length === 0
      ? `<tr data-fusa-fz-empty-row><td colspan="7" class="ckp-snapshot-ro-empty-cell">Keine Fahrzeuge in diesem Projekt.</td></tr>`
      : allRows
          .map((f) => {
            const detailPayload = encodeDetailPayload(f);
            const barCol = laufzeitBarColorFromStatusNorm(f.statusNorm);
            const laufBar =
              f.laufzeitPct > 0
                ? `<div style="height:4px;background:var(--gray-l);border-radius:2px;margin-top:5px;width:120px;overflow:hidden;"><div style="height:100%;width:${esc(String(f.laufzeitPct))}%;background:${barCol};border-radius:2px;"></div></div>`
                : '';
            const laufzeitBlock =
              f.laufzeitPct > 0
                ? `<div style="height:4px;background:var(--gray-l);border-radius:2px;margin-top:5px;width:120px;overflow:hidden;"><div style="height:100%;width:${esc(String(f.laufzeitPct))}%;background:${barCol};border-radius:2px;"></div></div><div style="font-size:11px;color:var(--text2);margin-top:4px;">${esc(String(f.laufzeitPct))}% der Laufzeit abgelaufen</div>`
                : '';
            const schadenDot =
              f.hasSchadenDot
                ? `<span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--red);margin-left:5px;vertical-align:middle;" title="Schadenmeldung" aria-hidden="true"></span>`
                : '';
            const bjLine =
              f.baujahr != null && String(f.baujahr).trim() !== '' && String(f.baujahr) !== '—'
                ? String(f.baujahr)
                : '—';
            const auftragCol = f.eigenwerbung
              ? `<div style="font-size:12px;font-weight:600;color:var(--purple);">⚫ Eigenwerbung Ruhrbahn</div><div style="font-size:11px;color:var(--text2);">Nicht für externe Aufträge verfügbar</div>`
              : f.auftragKunde || f.auftragPaket
                ? `<div style="font-weight:600;color:var(--blue);">${esc(f.auftragKunde || 'Belegung aktiv')}</div><div style="font-size:11px;color:var(--text2);">${esc(f.auftragPaket || '—')}</div>${laufBar}`
                : `<span style="font-size:12px;color:var(--text3);font-style:italic;">Keine aktive Auftrag</span>`;
            const bisCol =
              f.eigenwerbung ? '—' : f.auftragKunde || f.auftragPaket ? esc(f.laufzeitBis) : '—';
            const ewBadge = f.eigenwerbung
              ? `<span class="bdg bp" style="margin-left:6px;font-size:10px;">Eigenwerbung</span>`
              : '';
            const rowBg = f.eigenwerbung ? `background:#fdf9ff;` : '';
            return `<tr data-fusa-fz-row data-fusa-fz-detail="${esc(detailPayload)}" data-ccw-row-id="${esc(f.id)}" data-status-group="${esc(f.statusGroup)}" data-status="${esc(f.statusNorm)}" data-type-text="${esc(toLower(f.typeSearch))}" data-location-text="${esc(f.locationSearch)}" data-search-text="${esc(f.searchText)}" style="cursor:pointer;${rowBg}">
          <td class="ckp-snapshot-ro-td"><div style="font-size:14px;font-weight:700;color:var(--text);">${esc(f.nummer || '—')}${schadenDot}${ewBadge}</div><div style="font-size:11px;color:var(--text2);margin-top:1px;">${esc(f.kennzeichen || '—')}</div></td>
          <td class="ckp-snapshot-ro-td"><div class="tm">${esc(f.typ || '—')}</div><div class="ts">${esc(f.subtyp || '—')}</div></td>
          <td class="ckp-snapshot-ro-td"><div class="tm">${esc(f.depot || '—')}</div>${
            f.linien && String(f.linien).trim() && String(f.linien).trim() !== '—'
              ? `<div class="ts">Linie ${esc(String(f.linien).trim())}</div>`
              : ''
          }</td>
          <td class="ckp-snapshot-ro-td"><div>${esc(f.betreiber || '—')}</div><div class="ts">Bj. ${esc(bjLine)} · Ausm. ${esc(f.ausmusterung != null ? String(f.ausmusterung) : '—')}</div></td>
          <td class="ckp-snapshot-ro-td">${auftragCol}</td>
          <td class="ckp-snapshot-ro-td"><div style="font-size:12px;color:${f.eigenwerbung || (!f.auftragKunde && !f.auftragPaket) ? 'var(--text3)' : 'var(--text)'};">${bisCol}</div>${f.eigenwerbung ? '' : laufzeitBlock}</td>
          <td class="ckp-snapshot-ro-td"><span class="bdg b${esc(f.statusBadge)}">${esc(f.statusLabel)}</span></td>
        </tr>`;
          })
          .join('');

  const createModal =
    !canCreate
      ? `<p class="ckp-mock-note" role="status">Kein Recht zum Anlegen von Fahrzeugen.</p>`
      : `<div class="modal-ov" data-fusa-fz-create-modal style="display:none;" aria-hidden="true">
  <div class="modal" style="width:680px;">
    <div class="mhdr">
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="width:34px;height:34px;border-radius:8px;background:var(--blue-l);display:flex;align-items:center;justify-content:center;">
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="1" y="3" width="22" height="16" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
        </div>
        <div class="mtitle">Neues Fahrzeug erfassen</div>
      </div>
      <button type="button" class="dp-close" data-fusa-fz-create-close>×</button>
    </div>
    <form data-fusa-fahrzeug-form>
      <input type="hidden" name="project_id" value="${esc(fallbackPid)}" data-fusa-fahrzeug-project-id />
      <input type="hidden" value="" data-fusa-fz-typ-kategorie />
      <input type="hidden" value="" data-fusa-fz-antrieb />
      <div class="mbody">
        <p class="ckp-api-error" data-fusa-fahrzeug-msg hidden role="alert" style="margin:0 0 12px;"></p>

        <!-- 1. Fahrzeugidentifikation -->
        <div class="fsect">1 — Fahrzeugidentifikation</div>
        <div class="frow frow3">
          <div class="fg">
            <label class="fl">Fahrzeugnummer <span>*</span></label>
            <input class="fi" name="kennung" type="text" placeholder="z.B. Bus 1789 oder Tram 205" required />
          </div>
          <div class="fg">
            <label class="fl">Kennzeichen <span>*</span></label>
            <input class="fi" name="kennzeichen" type="text" placeholder="z.B. E-RB 1789" required />
          </div>
          <div class="fg">
            <label class="fl">Interne Wagennr.</label>
            <input class="fi" name="wagennummer" type="text" placeholder="z.B. 1789" />
          </div>
        </div>

        <!-- 2. Fahrzeugtyp -->
        <div class="fsect">2 — Fahrzeugtyp</div>
        <div class="fg">
          <label class="fl">Fahrzeugtyp <span>*</span></label>
          <div class="chip-row" data-fusa-fz-typ-chips>
            <div class="chip" data-val="Solobus" role="button" tabindex="0">🚌 Solobus</div>
            <div class="chip" data-val="Gelenkbus" role="button" tabindex="0">🚌 Gelenkbus</div>
            <div class="chip" data-val="U-Bahn 8 Achsen" role="button" tabindex="0">🚇 U-Bahn 8 Achsen</div>
            <div class="chip" data-val="Stadtbahn 8 Achsen" role="button" tabindex="0">🚊 Stadtbahn 8 Achsen</div>
          </div>
        </div>
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Hersteller <span>*</span></label>
            <select class="fs" name="hersteller">
              <option value="">— wählen —</option>
              ${HERSTELLER_OPTIONS.map((h) => `<option value="${esc(h)}">${esc(h)}</option>`).join('')}
            </select>
          </div>
          <div class="fg">
            <label class="fl">Modell / Baureihe</label>
            <input class="fi" name="modell" type="text" placeholder="z.B. Citaro G, Urbino 12" />
          </div>
        </div>

        <!-- 3. Antrieb -->
        <div class="fsect">3 — Antrieb</div>
        <div class="fg">
          <label class="fl">Antriebsart <span>*</span></label>
          <div class="chip-row" data-fusa-fz-antrieb-chips>
            <div class="chip" data-val="Diesel" role="button" tabindex="0">⛽ Diesel</div>
            <div class="chip" data-val="Elektro" role="button" tabindex="0">⚡ Elektro</div>
            <div class="chip" data-val="Wasserstoff (H₂)" role="button" tabindex="0">💧 Wasserstoff (H₂)</div>
            <div class="chip" data-val="Hybrid" role="button" tabindex="0">🔋 Hybrid</div>
            <div class="chip" data-val="Erdgas (CNG)" role="button" tabindex="0">🌿 Erdgas (CNG)</div>
          </div>
        </div>

        <!-- 4. Baujahr & Ausmusterung -->
        <div class="fsect">4 — Baujahr & Ausmusterung</div>
        <div class="frow frow3">
          <div class="fg">
            <label class="fl">Baujahr <span>*</span></label>
            <input class="fi" type="number" name="baujahr" placeholder="z.B. 2022" min="1990" max="2030" data-fusa-fz-baujahr required />
          </div>
          <div class="fg">
            <label class="fl">Erstzulassung</label>
            <input class="fi" name="erstzulassung" type="date" />
          </div>
          <div class="fg">
            <label class="fl">Ausm.-Datum (geplant)</label>
            <input class="fi" name="ausmusterung_geplant" type="number" placeholder="z.B. 2034" min="2024" max="2060" data-fusa-fz-ausmusterung />
            <div class="helper">Richtwert: Baujahr + 12 Jahre</div>
          </div>
        </div>

        <!-- 5. Betreiber & Standort -->
        <div class="fsect">5 — Betreiber & Standort</div>
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Betreiber <span>*</span></label>
            <select class="fs" name="betreiber" data-fusa-fz-betreiber required>
              <option value="">— wählen —</option>
              ${Object.keys(BETREIBER_DEPOTS)
                .map((b) => `<option value="${esc(b)}">${esc(b)}</option>`)
                .join('')}
            </select>
          </div>
          <div class="fg">
            <label class="fl">Depot / Standort <span>*</span></label>
            <select class="fs" name="depot" data-fusa-fz-depot required>
              <option value="">— erst Betreiber wählen —</option>
            </select>
          </div>
        </div>
        <div class="fg">
          <label class="fl">Linie(n)</label>
          <input class="fi" name="linien" type="text" placeholder="z.B. 102 / 104  oder  U17 / U18" />
        </div>

        <!-- 6. Werbeflächen -->
        <div class="fsect">6 — Verfügbare Werbeflächen</div>
        <div class="fg">
          <label class="fl">Werbeflächen <span>*</span> (mehrere möglich)</label>
          <div class="chip-row" data-fusa-fz-flaechen-chips>
            <div class="chip" role="button" tabindex="0">Seitenwand links</div>
            <div class="chip" role="button" tabindex="0">Seitenwand rechts</div>
            <div class="chip" role="button" tabindex="0">Heckfläche</div>
            <div class="chip" role="button" tabindex="0">Seitenfenster</div>
            <div class="chip" role="button" tabindex="0">Frontscheibe</div>
            <div class="chip" role="button" tabindex="0">Dachfläche (Traffic Board)</div>
            <div class="chip" role="button" tabindex="0">Innenraum</div>
            <div class="chip" role="button" tabindex="0">Gesamtgestaltung</div>
          </div>
        </div>

        <!-- 7. Eigenwerbung -->
        <div class="fsect">7 — Eigenwerbung</div>
        <div style="background:var(--purple-l);border-radius:10px;padding:14px 16px;margin-bottom:14px;">
          <div style="font-size:13px;font-weight:600;color:var(--purple);margin-bottom:6px;">Eigenwerbung (Ruhrbahn / Betreiber)</div>
          <div style="font-size:12px;color:var(--text2);margin-bottom:12px;">Wenn aktiv: Fahrzeug wird bei der automatischen Aufträge-Fahrzeugsuche <strong>nicht</strong> angezeigt und ist für externe Kunden gesperrt.</div>
          <div style="display:flex;gap:10px;">
            <div class="chip" data-fusa-fz-ew-nein role="button" tabindex="0" style="border-color:var(--green);background:var(--green-l);color:var(--green);font-weight:600;">✓ Nein — für Aufträge verfügbar</div>
            <div class="chip" data-fusa-fz-ew-ja role="button" tabindex="0">Ja — Eigenwerbung aktiv</div>
          </div>
          <input type="hidden" value="false" data-fusa-fz-ew />
        </div>

        <!-- 8. Notiz -->
        <div class="fsect">8 — Notiz & Status</div>
        <div class="frow frow2">
          <div class="fg">
            <label class="fl">Fahrzeugstatus</label>
            <select class="fs" name="status">
              <option value="frei">Frei — verfügbar</option>
              <option value="geplant">Geplant</option>
              <option value="belegt">Bereits belegt</option>
              <option value="schaden">Schaden / Reparatur</option>
            </select>
          </div>
          <div class="fg">
            <label class="fl">Zuständiger CC-Mitarbeiter</label>
            <select class="fs" name="zustaendig_cc">
              <option value="">— optional —</option>
              <option value="Celal (Geschäftsführung)">Celal (Geschäftsführung)</option>
              <option value="Momo (Geschäftsführung)">Momo (Geschäftsführung)</option>
              <option value="Elvan (Büro)">Elvan (Büro)</option>
              <option value="Okan (Montage)">Okan (Montage)</option>
            </select>
          </div>
        </div>
        <div class="fg">
          <label class="fl">Interne Notiz</label>
          <textarea class="fta" name="notiz" placeholder="Besonderheiten, technische Hinweise, Vereinbarungen…"></textarea>
        </div>
      </div>
      <div class="mfoot">
        <button type="button" class="btn" data-fusa-fz-create-close>Abbrechen</button>
        <button type="button" class="btn" style="background:var(--gray-l);" data-fusa-fz-save-draft>Als Entwurf</button>
        <button type="submit" class="btn p">Fahrzeug anlegen →</button>
      </div>
    </form>
  </div>
</div>`;

  const createActionBlock = canCreate
    ? `<div style="margin:0 0 12px;display:flex;justify-content:flex-end;">
  <button type="button" class="btn p" data-fusa-fahrzeug-open-create>+ Fahrzeug erfassen</button>
</div>`
    : '';

  return `<div data-ccw-ro="fusa-fahrzeuge" class="fusa-fz-view">
  <style>
    .fusa-fz-view{
      --blue:#D4500A;--blue-d:#A83D08;--blue-l:#FFF0E6;
      --green:#2E7D32;--green-l:#E8F5E9;
      --amber:#E65100;--amber-l:#FFF3E0;
      --red:#C62828;--red-l:#FFEBEE;
      --purple:#4527A0;--purple-l:#EDE7F6;
      --teal:#00695C;--teal-l:#E0F2F1;
      --gray:#546E7A;--gray-l:#ECEFF1;
      --border:#DDE3E8;--text:#0F1923;--text2:#546E7A;--text3:#90A4AE;
      --bg:#F0F4F8;--card:#FFF;
    }
    .fusa-fz-view .modal-ov{position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:200;display:none;align-items:center;justify-content:center;backdrop-filter:blur(3px)}
    .fusa-fz-view .modal{background:#fff;border-radius:13px;width:min(1080px,94vw);max-height:90vh;display:flex;flex-direction:column;min-height:0;box-shadow:0 24px 64px rgba(0,0,0,.2)}
    .fusa-fz-view .mhdr{padding:18px 22px;border-bottom:1px solid var(--border,#DDE3E8);display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
    .fusa-fz-view .mtitle{font-size:15px;font-weight:700}
    .fusa-fz-view .dp-close{width:28px;height:28px;border-radius:6px;border:1px solid var(--border,#DDE3E8);background:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text2,#546E7A)}
    .fusa-fz-view .mbody{flex:1;min-height:0;overflow-y:auto;padding:20px 22px;display:flex;flex-direction:column;gap:0}
    .fusa-fz-view .mfoot{padding:14px 22px;border-top:1px solid var(--border,#DDE3E8);display:flex;justify-content:flex-end;gap:10px;flex-shrink:0}
    .fusa-fz-view [data-fusa-fz-create-modal] .modal{max-height:min(90vh,920px)}
    .fusa-fz-view [data-fusa-fz-create-modal] form{display:flex;flex-direction:column;flex:1;min-height:0;overflow:hidden}
    .fusa-fz-view .fusa-fz-acc-chev{display:inline-block;transition:transform .18s ease;transform-origin:50% 55%;line-height:1}
    .fusa-fz-view [data-fusa-fz-accordion-toggle][aria-expanded="false"] .fusa-fz-acc-chev{transform:rotate(-90deg)}
    .fusa-fz-view [data-fusa-fz-accordion-body].fusa-fz-acc-body--collapsed{display:none !important}
    .fusa-fz-view .fg{display:flex;flex-direction:column;gap:5px;margin-bottom:14px}
    .fusa-fz-view .fl{font-size:12px;font-weight:500;color:var(--text,#0B1220)}
    .fusa-fz-view .fl span{color:var(--red,#C62828)}
    .fusa-fz-view .fi,.fusa-fz-view .fs,.fusa-fz-view .fta{padding:8px 11px;border:1px solid var(--border,#DDE3E8);border-radius:7px;font-size:13px;color:var(--text,#0B1220);background:#fff;outline:none;font-family:inherit;transition:border-color .12s;width:100%}
    .fusa-fz-view .fi:focus,.fusa-fz-view .fs:focus,.fusa-fz-view .fta:focus{border-color:var(--blue,#D4500A)}
    .fusa-fz-view .fta{resize:vertical;min-height:60px}
    .fusa-fz-view .frow{display:grid;gap:12px}
    .fusa-fz-view .frow2{grid-template-columns:1fr 1fr}
    .fusa-fz-view .frow3{grid-template-columns:1fr 1fr 1fr}
    .fusa-fz-view .fsect{font-size:11px;font-weight:700;color:var(--text2,#546E7A);text-transform:uppercase;letter-spacing:.06em;padding:12px 0 8px;border-bottom:1px solid var(--border,#DDE3E8);margin-bottom:14px}
    .fusa-fz-view .chip-row{display:flex;flex-wrap:wrap;gap:6px}
    .fusa-fz-view .chip{padding:5px 12px;border-radius:20px;font-size:12px;cursor:pointer;border:1.5px solid var(--border,#DDE3E8);color:var(--text2,#546E7A);transition:all .12s;user-select:none}
    .fusa-fz-view .chip.sel{border-color:var(--blue,#D4500A);background:var(--blue-l,#FFF3EC);color:var(--blue,#D4500A);font-weight:500}
    .fusa-fz-view .helper{font-size:11px;color:var(--text3,#7A8B99);margin-top:3px}
    .fusa-fz-view .btn{padding:6px 14px;border-radius:7px;font-size:12px;font-weight:500;cursor:pointer;border:1px solid var(--border,#DDE3E8);background:#fff;color:var(--text,#0B1220);transition:all .12s}
    .fusa-fz-view .btn:hover{background:var(--gray-l,#F3F5F7)}
    .fusa-fz-view .btn.p{background:var(--blue,#D4500A);color:#fff;border-color:var(--blue,#D4500A)}
    .fusa-fz-view .btn.p:hover{background:var(--blue-d,#B84308)}
    .fusa-fz-view .panel{background:#fff;border:1px solid var(--border,#DDE3E8);border-radius:10px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.05)}
    .fusa-fz-view .ph{padding:13px 16px;border-bottom:1px solid var(--border,#DDE3E8);display:flex;align-items:center;justify-content:space-between}
    .fusa-fz-view .ph-title{font-size:13px;font-weight:600}
    .fusa-fz-view .fz-tab{padding:10px 16px;font-size:13px;font-weight:500;cursor:pointer;color:var(--text2,#546E7A);border:none;background:none;border-bottom:2px solid transparent;transition:all .12s;white-space:nowrap}
    .fusa-fz-view .fz-tab:hover{color:var(--text)}
    .fusa-fz-view .fz-tab.active{color:var(--blue,#D4500A);border-bottom-color:var(--blue,#D4500A)}
    .fusa-fz-view [data-fusa-fz-detail-modal]{align-items:flex-start;justify-content:flex-end}
    .fusa-fz-view [data-fusa-fz-detail-modal] .fusa-fz-detail-panel{width:780px;max-width:100%;height:100vh;background:#fff;box-shadow:-6px 0 30px rgba(0,0,0,.14);display:flex;flex-direction:column;overflow:hidden;animation:fusaFzDetailIn .2s ease}
    @keyframes fusaFzDetailIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
    .fusa-fz-view [data-fusa-fz-detail-modal] .fusa-fz-detail-hdr{padding:16px 22px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;background:#fff}
    .fusa-fz-view [data-fusa-fz-detail-modal] .fusa-fz-detail-ico{width:38px;height:38px;border-radius:9px;background:var(--blue-l);display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .fusa-fz-view [data-fusa-fz-detail-modal] [data-fusa-fz-detail-name]{font-size:16px;font-weight:700;color:var(--text)}
    .fusa-fz-view [data-fusa-fz-detail-modal] [data-fusa-fz-detail-sub]{font-size:12px;color:var(--text2);margin-top:2px}
    .fusa-fz-view [data-fusa-fz-detail-modal] [data-fusa-fz-detail-tabs]{display:flex;gap:0;border-bottom:1px solid var(--border);flex-shrink:0;padding:0 22px;background:#fff}
    .fusa-fz-view [data-fusa-fz-detail-modal] [data-fusa-fz-detail-tabs] .fz-tab{border-radius:0;margin:0}
    .fusa-fz-view [data-fusa-fz-detail-modal] [data-fusa-fz-detail-body]{flex:1;min-height:0;overflow-y:auto;padding:20px 22px}
    .fusa-fz-view [data-fusa-fz-detail-modal] .fusa-fz-detail-foot{padding:14px 22px;border-top:1px solid var(--border);display:flex;gap:8px;flex-shrink:0;background:#fff;flex-wrap:wrap;align-items:center}
    .fusa-fz-view [data-fusa-fz-detail-body] .dp-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;border-bottom:1px solid var(--border)}
    .fusa-fz-view [data-fusa-fz-detail-body] .dp-row:last-child{border-bottom:none}
    .fusa-fz-view [data-fusa-fz-detail-body] .dp-lbl{font-size:12px;color:var(--text2)}
    .fusa-fz-view [data-fusa-fz-detail-body] .dp-val{font-size:12px;font-weight:500;color:var(--text);text-align:right;max-width:58%;word-break:break-word}
    .fusa-fz-view [data-fusa-fz-detail-body] .foto-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:16px}
    .fusa-fz-view [data-fusa-fz-detail-body] .foto-slot{aspect-ratio:4/3;border-radius:10px;border:2px dashed var(--border);background:var(--gray-l);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;cursor:default;transition:all .15s;position:relative;overflow:hidden}
    .fusa-fz-view [data-fusa-fz-detail-body] .foto-slot.filled{border:none;background:var(--blue-l)}
    .fusa-fz-view [data-fusa-fz-detail-body] .foto-slot.filled .foto-lbl{color:var(--blue)}
    .fusa-fz-view [data-fusa-fz-detail-body] .foto-lbl{font-size:12px;font-weight:600;color:var(--text2)}
    .fusa-fz-view [data-fusa-fz-detail-body] .warnbox{border-radius:9px;padding:12px 16px;display:flex;gap:10px;align-items:flex-start;margin-bottom:12px;border:1px solid}
    .fusa-fz-view [data-fusa-fz-detail-body] .warnbox .wi{flex-shrink:0;font-size:16px;line-height:1}
    .fusa-fz-view [data-fusa-fz-detail-body] .warnbox .wt{font-size:12px;color:var(--text2);line-height:1.45}
    .fusa-fz-view [data-fusa-fz-detail-body] .warnbox.purple{background:var(--purple-l);border-color:#C5B8F0}
    .fusa-fz-view [data-fusa-fz-detail-body] .warnbox.blueish{background:var(--blue-l);border-color:#FFD4B3}
    .fusa-fz-view [data-fusa-fz-detail-body] .empty{padding:32px 20px;text-align:center}
    .fusa-fz-view [data-fusa-fz-detail-body] .empty-icon{font-size:36px;margin-bottom:8px}
    .fusa-fz-view [data-fusa-fz-detail-body] .empty-text{font-size:13px;color:var(--text2)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:600;white-space:nowrap}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg::before{content:'';width:5px;height:5px;border-radius:50%;flex-shrink:0}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bb,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bb{background:var(--blue-l);color:var(--blue)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bb::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bb::before{background:var(--blue)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bg,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bg{background:var(--green-l);color:var(--green)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bg::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bg::before{background:var(--green)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bp,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bp{background:var(--purple-l);color:var(--purple)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bp::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bp::before{background:var(--purple)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bt,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bt{background:var(--teal-l);color:var(--teal)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bt::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bt::before{background:var(--teal)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.ba,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.ba{background:var(--amber-l);color:var(--amber)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.ba::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.ba::before{background:var(--amber)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.br,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.br{background:var(--red-l);color:var(--red)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.br::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.br::before{background:var(--red)}
    .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bgr,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bgr{background:var(--gray-l);color:var(--gray)} .fusa-fz-view [data-fusa-fz-detail-body] .bdg.bgr::before,.fusa-fz-view [data-fusa-fz-detail-modal] > .fusa-fz-detail-panel .bdg.bgr::before{background:var(--gray)}
    .fusa-fz-view [data-fusa-fz-detail-body] .panel table{width:100%;border-collapse:collapse;font-size:13px}
    .fusa-fz-view [data-fusa-fz-detail-body] .panel th,.fusa-fz-view [data-fusa-fz-detail-body] .panel td{padding:8px 10px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}
    .fusa-fz-view [data-fusa-fz-detail-body] .panel thead th{font-size:11px;font-weight:700;color:var(--text3);text-transform:uppercase;letter-spacing:.04em;background:#f8fafc}
    .fusa-fz-view [data-fusa-fz-detail-body] .tm{font-weight:600;color:var(--text)}
  </style>
  ${loadErr ? `<p class="ckp-api-error" role="alert">${esc(loadErr)}</p>` : ''}
  ${projectHint}
  <div class="ccds-stats-row" style="margin-bottom:16px;">
    ${kpiCardHtml({ key: 'belegt', value: kpiBelegt, label: 'Belegt', icon: '◎', iconClass: 'ccds-stat-icon-box--green' })}
    ${kpiCardHtml({ key: 'frei', value: kpiFrei, label: 'Frei & verfuegbar', icon: '◌', iconClass: 'ccds-stat-icon-box--teal' })}
    ${kpiCardHtml({ key: 'schaden', value: kpiSchaden, label: 'Schaden gemeldet', icon: '⚠', iconClass: 'ccds-stat-icon-box--red' })}
    ${kpiCardHtml({ key: 'endet', value: kpiEndet, label: 'Laufzeit endet bald', icon: '◔', iconClass: 'ccds-stat-icon-box--orange' })}
  </div>
  <div style="display:flex;gap:10px;align-items:center;margin-bottom:14px;">
    <input class="srch" id="fusa-fz-search" data-fusa-fz-search placeholder="Fahrzeug suchen..." style="width:260px;background:#fff;" />
    <div class="tabs" data-fusa-fz-tabs>
      <button type="button" class="tab active" data-fusa-fz-tab="alle">Alle</button>
      <button type="button" class="tab" data-fusa-fz-tab="belegt">Belegt</button>
      <button type="button" class="tab" data-fusa-fz-tab="frei">Frei</button>
      <button type="button" class="tab" data-fusa-fz-tab="schaden">Schaden</button>
    </div>
    <button type="button" class="btn" style="margin-left:auto;font-size:12px;" data-fusa-fz-reset>Filter zuruecksetzen</button>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px;">
    <div style="border-radius:10px;overflow:hidden;border:1px solid #E8C87A;">
      <button type="button" data-fusa-fz-accordion-toggle="typ" aria-expanded="true" style="width:100%;background:#E8A83A;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;border:none;cursor:pointer;">
        <span style="font-size:13px;font-weight:700;color:#fff;">Fahrzeugtyp-Filter</span>
        <span class="fusa-fz-acc-chev" aria-hidden="true" style="color:#fff;font-weight:700;">▾</span>
      </button>
      <div data-fusa-fz-accordion-body="typ" style="background:#fff;padding:14px 16px;display:flex;flex-direction:column;gap:11px;">${typeFilterRows}</div>
    </div>
    <div style="border-radius:10px;overflow:hidden;border:1px solid #E8C87A;">
      <button type="button" data-fusa-fz-accordion-toggle="loc" aria-expanded="true" style="width:100%;background:#E8A83A;padding:11px 16px;display:flex;align-items:center;justify-content:space-between;border:none;cursor:pointer;">
        <span style="font-size:13px;font-weight:700;color:#fff;">Standort-Filter</span>
        <span class="fusa-fz-acc-chev" aria-hidden="true" style="color:#fff;font-weight:700;">▾</span>
      </button>
      <div data-fusa-fz-accordion-body="loc" style="background:#fff;padding:14px 16px;display:flex;flex-direction:column;gap:11px;">${locFilterRows}</div>
    </div>
  </div>
  <div data-fusa-fz-chips style="display:none;flex-wrap:wrap;gap:6px;margin-bottom:10px;"></div>
  <div style="font-size:12px;color:var(--text2);margin-bottom:10px;" data-fusa-fz-result-count>${esc(
    `${allRows.length} Fahrzeug${allRows.length === 1 ? '' : 'e'} gefunden`,
  )}</div>
  ${createActionBlock}
  ${createModal}
  <section class="ckp-snapshot-ro-section" style="margin-top:20px;">
    <h3 class="ckp-snapshot-ro-section-title">Fahrzeugliste (operativ)</h3>
    <div class="ckp-snapshot-ro-wrap ckp-table-wrap">
      <table class="ckp-table ckp-snapshot-ro-table">
        <thead>
          <tr class="ckp-snapshot-ro-head-row">
            <th scope="col" class="ckp-snapshot-ro-th">Fahrzeug</th>
            <th scope="col" class="ckp-snapshot-ro-th">Typ</th>
            <th scope="col" class="ckp-snapshot-ro-th">Depot / Standort</th>
            <th scope="col" class="ckp-snapshot-ro-th">Betreiber</th>
            <th scope="col" class="ckp-snapshot-ro-th">Aktuelle Auftrag</th>
            <th scope="col" class="ckp-snapshot-ro-th">Laufzeit bis</th>
            <th scope="col" class="ckp-snapshot-ro-th">Status</th>
          </tr>
        </thead>
        <tbody data-fusa-fz-table-body>${tableRowsHtml}</tbody>
      </table>
    </div>
  </section>
  <div class="modal-ov" data-fusa-fz-detail-modal style="display:none;" aria-hidden="true">
    <div class="fusa-fz-detail-panel" data-fusa-fz-detail-panel>
      <div class="fusa-fz-detail-hdr">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="fusa-fz-detail-ico" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--blue)" stroke-width="2"><rect x="1" y="3" width="22" height="16" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          </div>
          <div>
            <div data-fusa-fz-detail-name>Fahrzeugakte</div>
            <div data-fusa-fz-detail-sub>—</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;align-items:center;">
          <span data-fusa-fz-detail-status></span>
          <button type="button" class="dp-close" data-fusa-fz-detail-close aria-label="Schließen">×</button>
        </div>
      </div>
      <div data-fusa-fz-detail-tabs>
        <button type="button" class="fz-tab active" data-fusa-fz-detail-tab="stamm">Stammdaten</button>
        <button type="button" class="fz-tab" data-fusa-fz-detail-tab="werbung">Werbung & Auftrag</button>
        <button type="button" class="fz-tab" data-fusa-fz-detail-tab="fotos">Fotos & Dokumente</button>
        <button type="button" class="fz-tab" data-fusa-fz-detail-tab="schaeden">Schäden</button>
        <button type="button" class="fz-tab" data-fusa-fz-detail-tab="historie">Historie</button>
      </div>
      <div data-fusa-fz-detail-body></div>
      <div class="fusa-fz-detail-foot">
        <button type="button" class="btn" data-fusa-fz-qr-print>🔲 QR-Code drucken</button>
        <button type="button" class="btn" data-fusa-fz-foot-schaden>⚠ Schaden melden</button>
        <button type="button" class="btn" data-fusa-fz-foot-auftrag>+ Auftrag</button>
        <button type="button" class="btn p" style="margin-left:auto;" data-fusa-fz-foot-pdf>PDF Export →</button>
      </div>
    </div>
  </div>
</div>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaFahrzeugeHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  const fzScope =
    mount.querySelector('[data-ccw-ro="fusa-fahrzeuge"]') || mount.querySelector('.fusa-fz-view');
  if (!fzScope) return;
  if (isFusaFzRuntimeDebug()) {
    console.info(
      '[FUSA-FZ] Debug aktiv: sessionStorage.removeItem("cc_fusa_fz_debug") oder URL ohne ?fzdebug=1',
    );
  }
  const searchEl = fzScope.querySelector('[data-fusa-fz-search]');
  const tabsWrap = fzScope.querySelector('[data-fusa-fz-tabs]');
  const resetBtn = fzScope.querySelector('[data-fusa-fz-reset]');
  const resultCountEl = fzScope.querySelector('[data-fusa-fz-result-count]');
  const chipsWrap = fzScope.querySelector('[data-fusa-fz-chips]');
  const tbody = fzScope.querySelector('[data-fusa-fz-table-body]');
  const emptyRow = tbody && typeof tbody.querySelector === 'function' ? tbody.querySelector('[data-fusa-fz-empty-row]') : null;
  const rowEls = tbody ? [...tbody.querySelectorAll('[data-fusa-fz-row]')] : [];
  const typeChecks = [...fzScope.querySelectorAll('[data-fusa-fz-type-filter]')];
  const locChecks = [...fzScope.querySelectorAll('[data-fusa-fz-loc-filter]')];
  /** @type {'alle'|'belegt'|'frei'|'schaden'} */
  let activeTab = 'alle';

  function selectedTypeTokens() {
    return typeChecks
      .filter((x) => x instanceof HTMLInputElement && x.checked)
      .map((x) => String(x.getAttribute('data-fusa-fz-type-filter') || '').split('|').map((s) => s.trim()).filter(Boolean))
      .flat();
  }

  function selectedLocTokens() {
    return locChecks
      .filter((x) => x instanceof HTMLInputElement && x.checked)
      .map((x) => String(x.getAttribute('data-fusa-fz-loc-filter') || '').trim())
      .filter(Boolean);
  }

  function selectedLabels() {
    return [...typeChecks, ...locChecks]
      .filter((x) => x instanceof HTMLInputElement && x.checked)
      .map((x) => String(x.getAttribute('data-fusa-fz-filter-label') || '').trim())
      .filter(Boolean);
  }

  function renderChips(labels) {
    if (!(chipsWrap instanceof HTMLElement)) return;
    if (!labels.length) {
      chipsWrap.style.display = 'none';
      chipsWrap.innerHTML = '';
      return;
    }
    chipsWrap.style.display = 'flex';
    chipsWrap.innerHTML =
      `<span style="font-size:11px;font-weight:600;color:#A06010;align-self:center;margin-right:4px;">Filter aktiv:</span>` +
      labels
        .map(
          (v) =>
            `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;background:#FEF3DC;border:1px solid #E8C87A;border-radius:20px;font-size:11px;font-weight:600;color:#A06010;">${esc(v)}</span>`,
        )
        .join('');
  }

  function syncKpis(visibleRows) {
    const belegt = visibleRows.filter((r) => r.getAttribute('data-status-group') === 'belegt').length;
    const frei = visibleRows.filter((r) => r.getAttribute('data-status-group') === 'frei').length;
    const schaden = visibleRows.filter((r) => r.getAttribute('data-status') === 'schaden').length;
    const endet = visibleRows.filter((r) => r.getAttribute('data-status') === 'endet').length;
    const set = (k, v) => {
      const el = fzScope.querySelector(`[data-fusa-fz-kpi="${k}"]`);
      if (el) el.textContent = String(v);
    };
    set('belegt', belegt);
    set('frei', frei);
    set('schaden', schaden);
    set('endet', endet);
  }

  function applyFilters() {
    const q = searchEl instanceof HTMLInputElement ? String(searchEl.value || '').trim().toLowerCase() : '';
    const typeTokens = selectedTypeTokens();
    const locTokens = selectedLocTokens();
    const labels = selectedLabels();
    renderChips(labels);

    let visibleCount = 0;
    const visibleRows = [];
    for (const tr of rowEls) {
      const statusGroup = String(tr.getAttribute('data-status-group') || '');
      const typeText = String(tr.getAttribute('data-type-text') || '');
      const locText = String(tr.getAttribute('data-location-text') || '');
      const searchText = String(tr.getAttribute('data-search-text') || '');

      const tabMatch = activeTab === 'alle' ? true : statusGroup === activeTab;
      const typeMatch = typeTokens.length === 0 ? true : typeTokens.some((t) => typeText.includes(t.toLowerCase()));
      const locMatch = locTokens.length === 0 ? true : locTokens.some((t) => locText.includes(t.toLowerCase()));
      const searchMatch = !q || searchText.includes(q);
      const show = tabMatch && typeMatch && locMatch && searchMatch;
      tr.style.display = show ? '' : 'none';
      if (show) {
        visibleCount += 1;
        visibleRows.push(tr);
      }
    }

    if (resultCountEl instanceof HTMLElement) {
      resultCountEl.textContent = `${visibleCount} Fahrzeug${visibleCount === 1 ? '' : 'e'} gefunden`;
    }
    if (emptyRow instanceof HTMLElement) {
      emptyRow.style.display = visibleCount === 0 ? '' : 'none';
    }
    syncKpis(visibleRows);
  }

  if (tabsWrap instanceof HTMLElement) {
    tabsWrap.addEventListener('click', (ev) => {
      const t = ev.target;
      const btn = t && typeof t.closest === 'function' ? t.closest('[data-fusa-fz-tab]') : null;
      if (!(btn instanceof HTMLElement)) return;
      const k = String(btn.getAttribute('data-fusa-fz-tab') || 'alle');
      if (k !== 'alle' && k !== 'belegt' && k !== 'frei' && k !== 'schaden') return;
      activeTab = k;
      for (const b of tabsWrap.querySelectorAll('[data-fusa-fz-tab]')) {
        b.classList.toggle('active', b === btn);
      }
      applyFilters();
    });
  }
  if (searchEl instanceof HTMLInputElement) {
    searchEl.addEventListener('input', applyFilters);
  }
  for (const x of [...typeChecks, ...locChecks]) {
    x.addEventListener('change', applyFilters);
  }
  if (resetBtn instanceof HTMLButtonElement) {
    resetBtn.addEventListener('click', () => {
      activeTab = 'alle';
      if (tabsWrap instanceof HTMLElement) {
        const tabButtons = [...tabsWrap.querySelectorAll('[data-fusa-fz-tab]')];
        tabButtons.forEach((b, i) => b.classList.toggle('active', i === 0));
      }
      if (searchEl instanceof HTMLInputElement) searchEl.value = '';
      for (const x of [...typeChecks, ...locChecks]) {
        if (x instanceof HTMLInputElement) x.checked = false;
      }
      applyFilters();
    });
  }

  if (fzScope instanceof HTMLElement) {
    fzScope.addEventListener('click', (ev) => {
      const t = ev.target;
      if (!t || typeof t.closest !== 'function') return;
      const btn = t.closest('[data-fusa-fz-accordion-toggle]');
      if (!(btn instanceof HTMLElement) || !fzScope.contains(btn)) return;
      const key = String(btn.getAttribute('data-fusa-fz-accordion-toggle') || '');
      if (!key) return;
      const body = fzScope.querySelector(`[data-fusa-fz-accordion-body="${key}"]`);
      if (!(body instanceof HTMLElement)) return;
      const expanded = btn.getAttribute('aria-expanded') !== 'false';
      const next = !expanded;
      btn.setAttribute('aria-expanded', next ? 'true' : 'false');
      body.classList.toggle('fusa-fz-acc-body--collapsed', !next);
      body.toggleAttribute('hidden', !next);
    });
  }

  applyFilters();

  const detailModal = fzScope.querySelector('[data-fusa-fz-detail-modal]');
  const detailName = fzScope.querySelector('[data-fusa-fz-detail-name]');
  const detailSub = fzScope.querySelector('[data-fusa-fz-detail-sub]');
  const detailStatus = fzScope.querySelector('[data-fusa-fz-detail-status]');
  const detailBody = fzScope.querySelector('[data-fusa-fz-detail-body]');
  const detailTabsWrap = fzScope.querySelector('[data-fusa-fz-detail-tabs]');
  let currentDetail = null;
  /** @type {NonNullable<ReturnType<typeof mapSchadenApiRowToViewModel>>[]} */
  let currentDetailApiSchaeden = [];

  function renderDetailTab(tab) {
    if (!(detailBody instanceof HTMLElement) || !currentDetail) return;
    const f = currentDetail;
    const bjShow = f.baujahr != null && String(f.baujahr).trim() !== '' && String(f.baujahr) !== '—' ? esc(String(f.baujahr)) : '—';
    const ezShow =
      f.erstzulassung != null && String(f.erstzulassung).trim() !== ''
        ? esc(String(f.erstzulassung))
        : '—';
    const wnShow = f.wagennummer != null && String(f.wagennummer).trim() !== '' ? esc(String(f.wagennummer)) : '—';
    const tkShow = f.typKategorie != null && String(f.typKategorie).trim() !== '' ? esc(String(f.typKategorie)) : '—';
    const adShow = f.antrieb != null && String(f.antrieb).trim() !== '' ? esc(String(f.antrieb)) : '—';
    const wfShow =
      Array.isArray(f.werbeflaechen) && f.werbeflaechen.length
        ? esc(f.werbeflaechen.join(', '))
        : '—';
    const notizShow = f.notiz != null && String(f.notiz).trim() !== '' ? esc(String(f.notiz)) : '—';
    const zuShow = f.zustaendig_cc != null && String(f.zustaendig_cc).trim() !== '' ? esc(String(f.zustaendig_cc)) : '—';
    if (tab === 'stamm') {
      const scanCanon = resolveCanonicalScanUrlForFz(f);
      const qrRaster = f.qrUrl && isLikelyQrRasterImageUrl(f.qrUrl);
      const apiQrImg = qrRaster
        ? `<div style="font-size:10px;color:var(--text3);margin-bottom:6px;">API-QR-Bild</div><img alt="QR API" src="${esc(f.qrUrl)}" width="120" height="120" />`
        : '';
      detailBody.innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
  <div class="panel" style="margin-bottom:0;"><div class="ph"><div class="ph-title">Fahrzeug-Grunddaten</div></div><div style="padding:0 16px;">
    <div class="dp-row"><span class="dp-lbl">Fahrzeugnummer</span><span class="dp-val" style="font-size:15px;font-weight:700;">${esc(f.nummer || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Interne Wagennr.</span><span class="dp-val">${wnShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Hersteller / Typ</span><span class="dp-val">${esc(f.typ || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Fahrzeugklasse</span><span class="dp-val">${esc(f.fahrzeugklasse || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Fahrzeugtyp (Kategorie)</span><span class="dp-val">${tkShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Antrieb</span><span class="dp-val">${adShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Baujahr</span><span class="dp-val">${bjShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Erstzulassung</span><span class="dp-val">${ezShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Ausgemustert geplant</span><span class="dp-val">${esc(f.ausmusterung)}</span></div>
    <div class="dp-row"><span class="dp-lbl">Kennzeichen</span><span class="dp-val">${esc(f.kennzeichen || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Linie(n)</span><span class="dp-val">${esc(f.linien)}</span></div>
    <div class="dp-row"><span class="dp-lbl">Werbeflächen</span><span class="dp-val">${wfShow}</span></div>
  </div></div>
  <div class="panel" style="margin-bottom:0;"><div class="ph"><div class="ph-title">Betrieb & Standort</div></div><div style="padding:0 16px;">
    <div class="dp-row"><span class="dp-lbl">Betreiber</span><span class="dp-val">${esc(f.betreiber || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Depot</span><span class="dp-val">${esc(f.depot || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Werkstatt-Mail</span><span class="dp-val" style="color:var(--blue);font-size:11px;">${esc(f.werkstattMail || '—')}</span></div>
    <div class="dp-row"><span class="dp-lbl">Eigenwerbung</span><span class="dp-val">${f.eigenwerbung ? '<span class="bdg bp">Ja — nicht für Aufträge</span>' : '<span class="bdg bg">Nein — verfügbar</span>'}</span></div>
    <div class="dp-row"><span class="dp-lbl">Zuständiger CC</span><span class="dp-val">${zuShow}</span></div>
    <div class="dp-row"><span class="dp-lbl">Status</span><span class="dp-val"><span class="bdg b${esc(f.statusBadge)}">${esc(f.statusLabel)}</span></span></div>
    <div class="dp-row"><span class="dp-lbl">Interne Notiz</span><span class="dp-val" style="white-space:pre-wrap;">${notizShow}</span></div>
  </div></div>
</div>
<div class="panel">
  <div class="ph">
    <div class="ph-title">QR-Code — Fahrzeug scannen</div>
    <div style="display:flex;gap:6px;flex-shrink:0;">
      <button type="button" class="btn" data-fusa-fz-qr-print>🖨️ Drucken</button>
      <button type="button" class="btn p" data-fusa-fz-scan-open>📱 Scan-Seite öffnen</button>
    </div>
  </div>
  <div style="padding:16px;display:flex;align-items:flex-start;gap:20px;">
    <div style="background:#fff;border:2px solid var(--border);border-radius:10px;padding:12px;flex-shrink:0;display:flex;flex-direction:column;align-items:center;gap:8px;">
      ${apiQrImg}
      <div data-fusa-fz-qr-host style="min-width:120px;min-height:120px;display:flex;align-items:center;justify-content:center;"></div>
    </div>
    <div style="flex:1;min-width:0;">
      <div style="font-size:15px;font-weight:700;margin-bottom:4px;">${esc(f.nummer || '—')}</div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;">${esc(f.typ || '—')} · ${esc(f.betreiber || '—')} · Depot ${esc(f.depot || '—')}</div>
      <div style="background:var(--gray-l);border-radius:7px;padding:8px 12px;margin-bottom:10px;">
        <div style="font-size:10px;color:var(--text3);margin-bottom:2px;">QR-Code URL (Scan-Ziel)</div>
        <div style="font-size:11px;font-family:monospace;color:var(--blue);word-break:break-all;">${esc(scanCanon)}</div>
      </div>
      <div style="font-size:12px;color:var(--text2);margin-bottom:10px;line-height:1.6;">
        📱 Monteur scannt QR → Handy öffnet Kamera direkt<br>
        📷 Fotos werden sofort dem Fahrzeug <strong>${esc(f.nummer || '—')}</strong> zugewiesen<br>
        ⚠️ Schaden melden direkt vom Handy möglich
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap;">
        <button type="button" class="btn" data-fusa-fz-qr-print>🖨️ QR drucken</button>
        <button type="button" class="btn" data-fusa-fz-qr-sticker>🏷️ Aufkleber-Format</button>
        <button type="button" class="btn p" data-fusa-fz-scan-test>📱 Scan-Seite testen</button>
      </div>
    </div>
  </div>
</div>`;
      void (async () => {
        const host = detailBody.querySelector('[data-fusa-fz-qr-host]');
        if (host instanceof HTMLElement) await renderQrIntoHost(host, scanCanon);
      })();
      return;
    }
    if (tab === 'werbung') {
      if (f.eigenwerbung) {
        const k = f.auftragKunde || f.auftragPaket;
        detailBody.innerHTML = `<div class="warnbox purple" style="margin-bottom:14px;"><div class="wi">⚫</div><div class="wt"><strong style="color:var(--purple)">Eigenwerbung aktiv</strong><br>Dieses Fahrzeug wird für Eigenwerbung der Ruhrbahn genutzt und steht <strong>nicht für externe Aufträge</strong> zur Verfügung. Bei der automatischen Fahrzeugsuche wird es nicht angezeigt.</div></div>${
          k
            ? '<div class="panel"><div class="ph"><div class="ph-title">Hinterlegte Eigenwerbung</div></div><div style="padding:0 16px"><div class="dp-row"><span class="dp-lbl">Beschreibung</span><span class="dp-val">Ruhrbahn Eigenwerbung</span></div></div></div>'
            : ''
        }`;
        return;
      }
      const k = f.auftragKunde || f.auftragPaket;
      if (k) {
        const preis = f.auftragPreis && String(f.auftragPreis).trim() ? esc(String(f.auftragPreis)) : '—';
        const start = f.auftragStart && String(f.auftragStart).trim() ? esc(String(f.auftragStart)) : '—';
        const ende = f.auftragEnde && String(f.auftragEnde).trim() ? esc(String(f.auftragEnde)) : '—';
        const mont = f.montageDatum && String(f.montageDatum).trim() ? esc(String(f.montageDatum)) : '—';
        const monteur = f.monteure && String(f.monteure).trim() ? esc(String(f.monteure)) : '—';
        detailBody.innerHTML = `<div class="panel" style="margin-bottom:14px;"><div class="ph"><div class="ph-title">Aktuelle Auftrag</div><span class="bdg bb">Aktiv</span></div>
      <div style="padding:16px;">
        <div class="dp-row"><span class="dp-lbl">Kunde</span><span class="dp-val" style="font-size:14px;font-weight:700;color:var(--blue);">${esc(f.auftragKunde || '—')}</span></div>
        <div class="dp-row"><span class="dp-lbl">Werbepaket</span><span class="dp-val">${esc(f.auftragPaket || '—')}</span></div>
        <div class="dp-row"><span class="dp-lbl">Preis</span><span class="dp-val" style="color:var(--green);font-weight:700;">${preis}</span></div>
        <div class="dp-row"><span class="dp-lbl">Auftragsbeginn</span><span class="dp-val">${start}</span></div>
        <div class="dp-row"><span class="dp-lbl">Auftragsende</span><span class="dp-val">${ende}</span></div>
        <div class="dp-row"><span class="dp-lbl">Montagedatum</span><span class="dp-val">${mont}</span></div>
        <div class="dp-row"><span class="dp-lbl">Monteur(e)</span><span class="dp-val">${monteur}</span></div>
        <div style="margin-top:12px;"><div style="font-size:11px;color:var(--text2);margin-bottom:5px;">Laufzeit-Fortschritt</div>
          <div style="height:8px;background:var(--gray-l);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${esc(String(f.laufzeitPct || 0))}%;background:${laufzeitBarColorFromStatusNorm(f.statusNorm)};border-radius:4px;"></div></div>
          <div style="font-size:11px;color:var(--text2);margin-top:4px;">${esc(String(f.laufzeitPct || 0))}% der Laufzeit abgelaufen</div>
        </div>
      </div></div>
      <div class="warnbox blueish"><div class="wi">ℹ</div><div class="wt">Das System erinnert automatisch 30 Tage vor Auftragsende — neue Werbung rechtzeitig verkaufen!</div></div>`;
      } else {
        detailBody.innerHTML =
          '<div class="empty" style="padding:40px 20px;"><div class="empty-icon">📋</div><div class="empty-text">Keine aktive Auftrag auf diesem Fahrzeug.</div></div>';
      }
      return;
    }
    if (tab === 'fotos') {
      const defaultSlots = [
        { lbl: 'Linke Seite', filled: false, datum: '', von: '', dataUrl: '' },
        { lbl: 'Rechte Seite', filled: false, datum: '', von: '', dataUrl: '' },
        { lbl: 'Heck', filled: false, datum: '', von: '', dataUrl: '' },
        { lbl: 'Gesamtansicht', filled: false, datum: '', von: '', dataUrl: '' },
      ];
      const rawSlots = Array.isArray(f.fotos) && f.fotos.length ? f.fotos.map((x) => mapFotoSlot(x)) : defaultSlots;
      const slots = rawSlots.map((x) => mapFotoSlot(x));
      const filled = slots.filter((s) => s.filled).length;
      const slotsHtml =
        slots.length === 0
          ? '<div class="empty" style="padding:24px 12px;"><div class="empty-icon">📷</div><div class="empty-text">Keine Fotos in den API-Daten.</div></div>'
          : `<div class="foto-grid">${slots
              .map((s) => {
                const lbl = esc(String(s.lbl || ''));
                const du = s.dataUrl ? esc(String(s.dataUrl)) : '';
                if (s.filled && du) {
                  return `<div class="foto-slot filled" style="padding:0;overflow:hidden;">
            <a href="${du}" target="_blank" rel="noopener noreferrer" style="display:block;">
                 <img src="${du}" alt="" style="width:100%;height:110px;object-fit:cover;display:block;">
               </a>
               <div style="padding:6px 8px;">
                 <div class="foto-lbl" style="margin:0 0 2px;">${lbl} ✓</div>
                 <div style="font-size:10px;color:var(--text3);">${esc(String(s.datum || ''))} · ${esc(String(s.von || ''))}</div>
               </div>
            </div>`;
                }
                return `<div class="foto-slot ${s.filled ? 'filled' : ''}">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${s.filled ? 'var(--blue)' : 'var(--text3)'}" stroke-width="1.5" aria-hidden="true"><rect x="3" y="6" width="18" height="15" rx="2"/><circle cx="12" cy="13" r="3.5"/><path d="M8 6l1-2h6l1 2"/></svg>
               <div class="foto-lbl">${s.filled ? `${lbl} ✓` : lbl}</div>
               <div style="font-size:10px;color:var(--text3);">${s.filled ? `${esc(String(s.datum || ''))} · ${esc(String(s.von || ''))}` : '—'}</div>
          </div>`;
              })
              .join('')}</div>`;
      const docs = Array.isArray(f.dokumente) ? f.dokumente : [];
      const docRows =
        docs.length === 0
          ? '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px;">Keine Dokumente</td></tr>'
          : docs
              .map((d) => {
                if (!d || typeof d !== 'object') return '';
                const o = /** @type {Record<string, unknown>} */ (d);
                const name = esc(String(o.name || '—'));
                const typ = esc(String(o.typ || '—'));
                const dt = esc(String(o.datum || '—'));
                const von = esc(String(o.von || '—'));
                return `<tr><td class="tm">${name}</td><td><span class="bdg bb">${typ}</span></td><td>${dt}</td><td>${von}</td></tr>`;
              })
              .join('');
      detailBody.innerHTML = `
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-fusa-fz-foto-file style="display:none;" />
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px;">
        <div><div style="font-size:14px;font-weight:600;">${slots.length ? `${filled} von ${slots.length} Fotos` : 'Keine Fotos'}</div><div style="font-size:12px;color:var(--text2);">Montagefotos & Dokumentation</div></div>
        <button type="button" class="btn p" data-fusa-fz-foto-upload>📷 Foto hochladen</button>
      </div>
      ${slotsHtml}
      <div class="panel"><div class="ph"><div class="ph-title">Dokumente</div><button type="button" class="btn" data-fusa-fz-doc-add>+ Dokument</button></div>
        <table><thead><tr><th>Dateiname</th><th>Typ</th><th>Datum</th><th>Von</th></tr></thead><tbody>
          ${docRows}
        </tbody></table>
      </div>`;
      return;
    }
    if (tab === 'schaeden') {
      const embedded = Array.isArray(f.schaeden) ? f.schaeden.filter(x => x && typeof x === 'object') : [];
      const apiIds = new Set(currentDetailApiSchaeden.map(s => s.id));
      const localOnly = embedded.filter(ls => {
        const o = /** @type {Record<string, unknown>} */ (ls);
        const id = o.id != null ? String(o.id) : '';
        return !id || !apiIds.has(id);
      });
      /** @type {{ kind: 'api'; vm: NonNullable<ReturnType<typeof mapSchadenApiRowToViewModel>> }|{ kind: 'local'; o: Record<string, unknown> }}[]} */
      const merged = [
        ...currentDetailApiSchaeden.map(vm => ({ kind: /** @type {const} */ ('api'), vm })),
        ...localOnly.map(o => ({ kind: /** @type {const} */ ('local'), o: /** @type {Record<string, unknown>} */ (o) })),
      ];
      const head = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
        <div style="font-size:14px;font-weight:600;">${merged.length} Schadenmeldung${merged.length !== 1 ? 'en' : ''}</div>
        <button type="button" class="btn p" data-fusa-fz-schaden-melden-tab>⚠ Schaden melden</button>
      </div>`;
      if (!merged.length) {
        detailBody.innerHTML = `${head}<div class="empty"><div class="empty-icon">✅</div><div class="empty-text">Keine Schäden gemeldet</div></div>`;
        return;
      }
      detailBody.innerHTML =
        head +
        merged
          .map(item => {
            if (item.kind === 'api') {
              const s = item.vm;
              const titel = esc(s.titel || s.beschreibungDisplay || 'Schadeneingang');
              const dt = esc(s.createdAtDisplay || '—');
              const meld = esc(s.meldungLabel || '—');
              const typL = esc(s.typLabel || '');
              const wf = esc(s.werkstattLabel || '—');
              return `<div class="schaden-card" style="margin-bottom:10px;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #E8E0D8;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:600;flex:1;margin-right:8px;">${titel}</div>
            <span class="bdg b${esc(s.meldungBadgeClass || 'bgr')}" style="white-space:nowrap;font-size:10px;">${meld}</span>
          </div>
          <div style="display:flex;gap:12px;font-size:12px;color:var(--text2);flex-wrap:wrap;margin-bottom:8px;">
            <span>📅 ${dt}</span>
            <span class="bdg b${esc(s.typBadgeClass || 'bgr')}" style="font-size:10px;">${typL || '—'}</span>
            <span>Werkstatt: ${wf}</span>
          </div>
          <button type="button" class="btn" style="font-size:11px;padding:4px 10px;" data-fusa-fz-schaden-open="${esc(s.id)}">✏ Details</button>
        </div>`;
            }
            const o = item.o;
            const titel = esc(String(o.beschr ?? o.titel ?? 'Schadeneingang'));
            const datum = o.datum != null ? esc(String(o.datum)) : '—';
            const gemeldet = o.gemeldet != null ? esc(String(o.gemeldet)) : '—';
            const st = o.statusLbl != null ? esc(String(o.statusLbl)) : '—';
            return `<div class="schaden-card" style="margin-bottom:10px;padding:12px 14px;background:#fff;border-radius:10px;border:1px solid #E8E0D8;box-shadow:0 1px 4px rgba(0,0,0,.05);">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
            <div style="font-size:13px;font-weight:600;flex:1;margin-right:8px;">${titel}</div>
            <span class="bdg bgr" style="white-space:nowrap;font-size:10px;">${st}</span>
          </div>
          <div style="display:flex;gap:12px;font-size:12px;color:var(--text2);flex-wrap:wrap;">
            <span>📅 ${datum}</span>
            <span>👤 ${gemeldet}</span>
          </div>
        </div>`;
          })
          .join('');
      return;
    }
    const hist = Array.isArray(f.historie) ? f.historie : [];
    detailBody.innerHTML = `
      <div style="font-size:14px;font-weight:600;margin-bottom:14px;">Werbehistorie — ${esc(f.nummer || '—')}</div>
      <div class="panel" style="margin-bottom:14px;"><table>
        <thead><tr><th>Jahr</th><th>Kunde</th><th>Paket</th><th>Laufzeit</th></tr></thead>
        <tbody>${
          hist.length
            ? hist
                .map(
                  (h) =>
                    `<tr><td><span class="bdg bb">${esc(String(h.jahr))}</span></td><td class="tm">${esc(String(h.kunde))}</td><td>${esc(String(h.paket))}</td><td style="font-size:12px;color:var(--text2);">${esc(String(h.start))} – ${esc(String(h.end))}</td></tr>`,
                )
                .join('')
            : '<tr><td colspan="4" style="text-align:center;color:var(--text3);padding:16px;">Keine Historie</td></tr>'
        }
        </tbody></table>
      </div>
      <div class="warnbox blueish"><div class="wi">ℹ</div><div class="wt">Bei Fahrzeugwechsel bleibt die gesamte Historie erhalten. Alle früheren Aufträge, Fotos und Schäden bleiben dokumentiert.</div></div>`;
  }

  async function openDetailByRow(tr) {
    const raw = tr.getAttribute('data-fusa-fz-detail');
    const vm = decodeDetailPayload(raw);
    if (!vm || !(detailModal instanceof HTMLElement)) return;
    currentDetail = vm;
    if (detailName instanceof HTMLElement) detailName.textContent = vm.nummer || 'Fahrzeug';
    if (detailSub instanceof HTMLElement) detailSub.textContent = `${vm.typ || '—'} · ${vm.betreiber || '—'} · Depot ${vm.depot || '—'}`;
    if (detailStatus instanceof HTMLElement) detailStatus.innerHTML = `<span class="bdg b${esc(vm.statusBadge || 'bt')}">${esc(vm.statusLabel || '—')}</span>`;
    for (const b of detailTabsWrap ? detailTabsWrap.querySelectorAll('[data-fusa-fz-detail-tab]') : []) {
      b.classList.toggle('active', b.getAttribute('data-fusa-fz-detail-tab') === 'stamm');
    }
    detailModal.style.display = 'flex';
    detailModal.setAttribute('aria-hidden', 'false');
    if (detailBody instanceof HTMLElement) {
      detailBody.innerHTML = '<p class="ckp-mock-note" role="status">Lade Detail…</p>';
    }
    const idStr = String(vm.id || '').trim();
    currentDetailApiSchaeden = [];
    if (idStr) {
      try {
        const [d, schRes] = await Promise.all([
          apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(idStr)}`),
          apiFetch(API_ROUTES.fusa.schaeden),
        ]);
        const fz = d && typeof d === 'object' && /** @type {{ fahrzeug?: unknown }} */ (d).fahrzeug;
        if (fz && typeof fz === 'object') {
          currentDetail = mapFahrzeugToViewModel(/** @type {object} */ (fz));
          if (detailName instanceof HTMLElement) detailName.textContent = currentDetail.nummer || 'Fahrzeug';
          if (detailSub instanceof HTMLElement) {
            detailSub.textContent = `${currentDetail.typ || '—'} · ${currentDetail.betreiber || '—'} · Depot ${currentDetail.depot || '—'}`;
          }
          if (detailStatus instanceof HTMLElement) {
            detailStatus.innerHTML = `<span class="bdg b${esc(currentDetail.statusBadge || 'bt')}">${esc(currentDetail.statusLabel || '—')}</span>`;
          }
        }
        const rows = schRes && typeof schRes === 'object' && Array.isArray(/** @type {{ schaeden?: unknown[] }} */ (schRes).schaeden)
          ? /** @type {{ schaeden: object[] }} */ (schRes).schaeden
          : [];
        currentDetailApiSchaeden = rows
          .filter(r => r && typeof r === 'object' && String(/** @type {{ fahrzeug_id?: unknown }} */ (r).fahrzeug_id) === idStr)
          .map(r => mapSchadenApiRowToViewModel(/** @type {Record<string, unknown>} */ (r)))
          .filter(Boolean);
      } catch (e) {
        flashFusaFzDetailPlaceholder(
          detailBody,
          `Detaildaten konnten nicht geladen werden: ${formatApiErrorForUi(e)}`,
        );
      }
    }
    renderDetailTab('stamm');
  }

  if (tbody instanceof HTMLElement) {
    tbody.addEventListener('click', (ev) => {
      const t = ev.target;
      const tr = t && typeof t.closest === 'function' ? t.closest('[data-fusa-fz-row]') : null;
      if (!(tr instanceof HTMLElement)) return;
      void openDetailByRow(tr);
    });
  }

  function closeDetailModal() {
    if (!(detailModal instanceof HTMLElement)) return;
    detailModal.style.display = 'none';
    detailModal.setAttribute('aria-hidden', 'true');
    currentDetailApiSchaeden = [];
  }

  function dispatchFusaNav(detail) {
    document.dispatchEvent(new CustomEvent('ccw:fusa-navigate', { detail }));
  }

  function ensureScanOverlay() {
    let ov = document.getElementById('ccw-fusa-scan-overlay');
    if (ov) return ov;
    ov = document.createElement('div');
    ov.id = 'ccw-fusa-scan-overlay';
    ov.setAttribute('style', 'display:none;position:fixed;inset:0;z-index:13000;background:#F0F4F8;overflow-y:auto;');
    ov.innerHTML = `<div style="max-width:560px;margin:0 auto;padding:18px 16px 40px;">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
    <h2 style="margin:0;font-size:18px;color:#0F1923;">Fahrzeug scannen</h2>
    <button type="button" class="btn" data-ccw-fusa-scan-close>Schließen</button>
  </div>
  <p style="font-size:12px;color:#546E7A;margin:0 0 10px;">Scan-Ziel (auch für externes Handy): <a data-ccw-fusa-scan-url href="#" target="_blank" rel="noopener noreferrer" style="word-break:break-all;"></a></p>
  <div data-ccw-fusa-scan-fzinfo style="background:#fff;border-radius:10px;padding:12px 14px;margin-bottom:12px;border:1px solid #dde3e8;"></div>
  <div style="display:flex;gap:8px;margin-bottom:10px;">
    <button type="button" class="btn p" data-ccw-fusa-scan-tab="foto">📷 Foto</button>
    <button type="button" class="btn" data-ccw-fusa-scan-tab="schaden">⚠ Schaden</button>
  </div>
  <div data-ccw-fusa-scan-pane="foto" style="display:block;background:#fff;border-radius:10px;padding:14px;border:1px solid #dde3e8;">
    <p style="font-size:13px;color:#546E7A;margin:0 0 10px;">Foto dem Fahrzeug zuordnen (Montage / Dokumentation).</p>
    <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-ccw-fusa-scan-foto-inp style="margin-bottom:10px;" />
    <img data-ccw-fusa-scan-foto-prev alt="" style="display:none;max-width:100%;border-radius:8px;border:1px solid #eee;" />
    <p class="ckp-api-error" data-ccw-fusa-scan-foto-err hidden role="alert" style="margin:8px 0 0;"></p>
    <button type="button" class="btn p" data-ccw-fusa-scan-foto-save style="margin-top:10px;">Foto speichern</button>
  </div>
  <div data-ccw-fusa-scan-pane="schaden" style="display:none;background:#fff;border-radius:10px;padding:14px;border:1px solid #dde3e8;">
    <label style="display:block;font-size:12px;font-weight:600;margin-bottom:4px;">Beschreibung</label>
    <textarea data-ccw-fusa-scan-sch-text rows="3" style="width:100%;font:inherit;padding:8px;border:1px solid #dde3e8;border-radius:8px;"></textarea>
    <div style="margin-top:10px;font-size:12px;font-weight:600;">Schaden-Typ</div>
    <label style="margin-right:12px;font-size:13px;"><input type="radio" name="ccw-fusa-scan-styp" value="fremd" checked /> Fremd</label>
    <label style="margin-right:12px;font-size:13px;"><input type="radio" name="ccw-fusa-scan-styp" value="eigen" /> Eigen</label>
    <label style="font-size:13px;"><input type="radio" name="ccw-fusa-scan-styp" value="unklar" /> Unklar</label>
    <div style="margin-top:10px;">
      <label style="font-size:12px;font-weight:600;">Schadensfoto (optional)</label><br/>
      <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-ccw-fusa-scan-sch-foto />
    </div>
    <p class="ckp-api-error" data-ccw-fusa-scan-sch-err hidden role="alert" style="margin:8px 0 0;"></p>
    <button type="button" class="btn p" data-ccw-fusa-scan-sch-save style="margin-top:12px;">Schaden melden</button>
  </div>
</div>`;
    document.body.appendChild(ov);
    ov.addEventListener('click', ev => {
      if (ev.target === ov) closeScanOverlay();
    });
    ov.querySelector('[data-ccw-fusa-scan-close]')?.addEventListener('click', () => closeScanOverlay());
    ov.querySelectorAll('[data-ccw-fusa-scan-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn instanceof HTMLElement ? String(btn.getAttribute('data-ccw-fusa-scan-tab') || 'foto') : 'foto';
        ov.querySelectorAll('[data-ccw-fusa-scan-pane]').forEach(p => {
          if (!(p instanceof HTMLElement)) return;
          const k = p.getAttribute('data-ccw-fusa-scan-pane');
          p.style.display = k === tab ? 'block' : 'none';
        });
      });
    });
    const finp = ov.querySelector('[data-ccw-fusa-scan-foto-inp]');
    const prev = ov.querySelector('[data-ccw-fusa-scan-foto-prev]');
    if (finp instanceof HTMLInputElement && prev instanceof HTMLImageElement) {
      finp.addEventListener('change', () => {
        const file = finp.files && finp.files[0];
        if (!file) return;
        const r = new FileReader();
        r.onload = () => {
          prev.src = String(r.result || '');
          prev.style.display = 'block';
        };
        r.readAsDataURL(file);
      });
    }
    ov.querySelector('[data-ccw-fusa-scan-foto-save]')?.addEventListener('click', async () => {
      const errEl = ov.querySelector('[data-ccw-fusa-scan-foto-err]');
      if (errEl instanceof HTMLElement) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      const inp = ov.querySelector('[data-ccw-fusa-scan-foto-inp]');
      const file = inp instanceof HTMLInputElement && inp.files && inp.files[0] ? inp.files[0] : null;
      if (!file || !currentDetail || !currentDetail.id) {
        if (errEl instanceof HTMLElement) {
          errEl.textContent = 'Bitte Foto wählen.';
          errEl.hidden = false;
        }
        return;
      }
      const dataUrl = await new Promise((resolve, reject) => {
        const rd = new FileReader();
        rd.onload = () => resolve(String(rd.result || ''));
        rd.onerror = () => reject(new Error('read'));
        rd.readAsDataURL(file);
      });
      try {
        const fr = await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`);
        const fz = fr && typeof fr === 'object' && /** @type {{ fahrzeug?: { fotos?: unknown[] } }} */ (fr).fahrzeug;
        const prevFotos =
          fz && typeof fz === 'object' && Array.isArray(fz.fotos) ? fz.fotos.map(x => (x && typeof x === 'object' ? { ...x } : x)) : [];
        const now = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        prevFotos.push({
          lbl: 'Monteur (Scan)',
          filled: true,
          datum: now,
          von: 'Monteur (Scan)',
          dataUrl,
        });
        await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`, {
          method: 'PATCH',
          body: { details: { fotos: prevFotos } },
        });
        closeScanOverlay();
        if (typeof onReload === 'function') void onReload();
        const tr = findFzRowByVehicleId(currentDetail.id);
        if (tr instanceof HTMLElement) void openDetailByRow(tr);
      } catch (e) {
        if (errEl instanceof HTMLElement) {
          errEl.textContent = formatApiErrorForUi(e);
          errEl.hidden = false;
        }
      }
    });
    ov.querySelector('[data-ccw-fusa-scan-sch-save]')?.addEventListener('click', async () => {
      const errEl = ov.querySelector('[data-ccw-fusa-scan-sch-err]');
      if (errEl instanceof HTMLElement) {
        errEl.hidden = true;
        errEl.textContent = '';
      }
      const tx = ov.querySelector('[data-ccw-fusa-scan-sch-text]');
      const text = tx instanceof HTMLTextAreaElement ? tx.value.trim() : '';
      const typEl = ov.querySelector('input[name="ccw-fusa-scan-styp"]:checked');
      const typ = typEl instanceof HTMLInputElement ? typEl.value : 'unklar';
      const proj = getFusaAppProject();
      const pid = proj && proj.id ? String(proj.id) : '';
      if (!pid || !currentDetail || !currentDetail.id) {
        if (errEl instanceof HTMLElement) {
          errEl.textContent = 'Projekt oder Fahrzeug fehlt.';
          errEl.hidden = false;
        }
        return;
      }
      try {
        await apiFetch(API_ROUTES.fusa.schaeden, {
          method: 'POST',
          body: {
            project_id: pid,
            fahrzeug_id: String(currentDetail.id),
            titel: text ? text.slice(0, 200) : 'Schadeneingang',
            beschreibung: text || null,
            status: 'offen',
            typ: typ === 'eigen' ? 'Eigenschaden' : typ === 'fremd' ? 'Fremdschaden' : 'Unklar',
            prioritaet: 'normal',
            abrechnung_status: 'ausstehend',
            melder_name: 'Monteur (QR-Scan)',
          },
        });
        closeScanOverlay();
        if (typeof onReload === 'function') void onReload();
        const tr = findFzRowByVehicleId(currentDetail.id);
        if (tr instanceof HTMLElement) void openDetailByRow(tr);
      } catch (e) {
        if (errEl instanceof HTMLElement) {
          errEl.textContent = formatApiErrorForUi(e);
          errEl.hidden = false;
        }
      }
    });
    return ov;
  }

  function openScanOverlay() {
    if (!currentDetail) return;
    const ov = ensureScanOverlay();
    if (!(ov instanceof HTMLElement)) return;
    const finp = ov.querySelector('[data-ccw-fusa-scan-foto-inp]');
    if (finp instanceof HTMLInputElement) finp.value = '';
    const prev = ov.querySelector('[data-ccw-fusa-scan-foto-prev]');
    if (prev instanceof HTMLImageElement) {
      prev.removeAttribute('src');
      prev.style.display = 'none';
    }
    const tx = ov.querySelector('[data-ccw-fusa-scan-sch-text]');
    if (tx instanceof HTMLTextAreaElement) tx.value = '';
    const scanUrl = resolveCanonicalScanUrlForFz(currentDetail);
    const a = ov.querySelector('[data-ccw-fusa-scan-url]');
    if (a instanceof HTMLAnchorElement) {
      a.href = scanUrl;
      a.textContent = scanUrl;
    }
    const info = ov.querySelector('[data-ccw-fusa-scan-fzinfo]');
    if (info instanceof HTMLElement) {
      info.innerHTML = `<div style="display:flex;align-items:center;gap:12px;">
        <div style="width:44px;height:44px;background:#FAEEDA;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;">🚌</div>
        <div style="flex:1;">
          <div style="font-size:16px;font-weight:700;">${esc(String(currentDetail.nummer || '—'))}</div>
          <div style="font-size:12px;color:#666;margin-top:2px;">${esc(String(currentDetail.typ || '—'))} · ${esc(String(currentDetail.depot || '—'))} · ${esc(String(currentDetail.kennzeichen || '—'))}</div>
        </div>
        <span class="bdg b${esc(String(currentDetail.statusBadge || 'bt'))}">${esc(String(currentDetail.statusLabel || ''))}</span>
      </div>`;
    }
    ov.style.display = 'block';
    try {
      document.body.style.overflow = 'hidden';
    } catch {
      /* ignore */
    }
  }

  function closeScanOverlay() {
    const ov = document.getElementById('ccw-fusa-scan-overlay');
    if (ov instanceof HTMLElement) ov.style.display = 'none';
    try {
      document.body.style.overflow = '';
    } catch {
      /* ignore */
    }
  }

  function findFzRowByVehicleId(fid) {
    const id = String(fid || '').trim();
    if (!id) return null;
    for (const r of fzScope.querySelectorAll('[data-fusa-fz-row][data-ccw-row-id]')) {
      if (r instanceof HTMLElement && r.getAttribute('data-ccw-row-id') === id) return r;
    }
    return null;
  }

  if (detailModal instanceof HTMLElement) {
    detailModal.addEventListener('click', (ev) => {
      const t = ev.target;
      if (t === detailModal) {
        closeDetailModal();
        return;
      }
      if (!t || typeof t.closest !== 'function') return;
      if (t.closest('[data-fusa-fz-detail-close]')) {
        closeDetailModal();
        return;
      }
      if (t.closest('[data-fusa-fz-detail-stub]')) {
        ev.preventDefault();
        const btn = t.closest('[data-fusa-fz-detail-stub]');
        const lab =
          btn instanceof HTMLElement
            ? String(btn.textContent || '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 72)
            : 'Aktion';
        if (detailBody instanceof HTMLElement) flashFusaFzDetailPlaceholder(detailBody, `${lab}: Funktion folgt noch.`);
        return;
      }
      if (t.closest('[data-fusa-fz-foot-schaden]') || t.closest('[data-fusa-fz-schaden-melden-tab]')) {
        ev.preventDefault();
        if (!currentDetail || !currentDetail.id) return;
        closeDetailModal();
        dispatchFusaNav({ view: 'fusa_schaeden', fusaSchaedenMeldenFahrzeugId: String(currentDetail.id) });
        return;
      }
      if (t.closest('[data-fusa-fz-foot-auftrag]')) {
        ev.preventDefault();
        if (!currentDetail || !currentDetail.id) return;
        closeDetailModal();
        dispatchFusaNav({
          view: 'fusa_auftraege',
          fusaAuftragNeuFahrzeugId: String(currentDetail.id),
          fusaAuftragNeuOpenWizard: true,
        });
        return;
      }
      if (t.closest('[data-fusa-fz-foot-pdf]')) {
        ev.preventDefault();
        if (currentDetail) openFahrzeugaktePdfPrint(currentDetail);
        return;
      }
      if (t.closest('[data-fusa-fz-schaden-open]')) {
        ev.preventDefault();
        const b = t.closest('[data-fusa-fz-schaden-open]');
        const sid = b instanceof HTMLElement ? String(b.getAttribute('data-fusa-fz-schaden-open') || '').trim() : '';
        if (!sid) return;
        closeDetailModal();
        CCState.set('fusaSchadenDetailId', sid);
        dispatchFusaNav({ view: 'fusa_schaeden' });
        return;
      }
      if (t.closest('[data-fusa-fz-qr-print]')) {
        ev.preventDefault();
        if (!currentDetail) return;
        const scanUrl = resolveCanonicalScanUrlForFz(currentDetail);
        openFzQrPrintWindow({
          title: `QR ${currentDetail.nummer || ''}`,
          headline: String(currentDetail.nummer || '—'),
          sub: `${String(currentDetail.typ || '—')} · ${String(currentDetail.betreiber || currentDetail.depot || '')}`,
          scanUrl,
        });
        return;
      }
      if (t.closest('[data-fusa-fz-qr-sticker]')) {
        ev.preventDefault();
        if (!currentDetail) return;
        openFzStickerPrintWindow(currentDetail, resolveCanonicalScanUrlForFz(currentDetail));
        return;
      }
      if (t.closest('[data-fusa-fz-scan-open]') || t.closest('[data-fusa-fz-scan-test]')) {
        ev.preventDefault();
        openScanOverlay();
        return;
      }
      if (t.closest('[data-fusa-fz-foto-upload]')) {
        ev.preventDefault();
        const inp = detailBody && detailBody.querySelector ? detailBody.querySelector('[data-fusa-fz-foto-file]') : null;
        if (inp instanceof HTMLInputElement) inp.click();
        return;
      }
      if (t.closest('[data-fusa-fz-doc-add]')) {
        ev.preventDefault();
        const name = window.prompt('Dokument-Name', 'Dokument');
        if (name == null || !String(name).trim()) return;
        void (async () => {
          if (!currentDetail || !currentDetail.id) return;
          try {
            const fr = await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`);
            const fz = fr && typeof fr === 'object' && /** @type {{ fahrzeug?: { dokumente?: unknown[] } }} */ (fr).fahrzeug;
            const prevD =
              fz && typeof fz === 'object' && Array.isArray(fz.dokumente)
                ? fz.dokumente.map(x => (x && typeof x === 'object' ? { ...x } : x))
                : [];
            const now = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
            prevD.push({ name: String(name).trim(), typ: 'Intern', datum: now, von: 'Cockpit' });
            await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`, {
              method: 'PATCH',
              body: { details: { dokumente: prevD } },
            });
            if (typeof onReload === 'function') void onReload();
            const tr = findFzRowByVehicleId(currentDetail.id);
            if (tr instanceof HTMLElement) void openDetailByRow(tr);
            else renderDetailTab('fotos');
          } catch (e) {
            window.alert(formatApiErrorForUi(e));
          }
        })();
        return;
      }
    });

    detailModal.addEventListener('change', ev => {
      const t = ev.target;
      if (!(t instanceof HTMLInputElement) || !t.matches('[data-fusa-fz-foto-file]')) return;
      const file = t.files && t.files[0];
      if (!file || !currentDetail || !currentDetail.id) return;
      void (async () => {
        const dataUrl = await new Promise((resolve, reject) => {
          const rd = new FileReader();
          rd.onload = () => resolve(String(rd.result || ''));
          rd.onerror = () => reject(new Error('read'));
          rd.readAsDataURL(file);
        });
        try {
          const fr = await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`);
          const fz = fr && typeof fr === 'object' && /** @type {{ fahrzeug?: { fotos?: unknown[] } }} */ (fr).fahrzeug;
          const prevFotos =
            fz && typeof fz === 'object' && Array.isArray(fz.fotos) ? fz.fotos.map(x => (x && typeof x === 'object' ? { ...x } : x)) : [];
          const now = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
          prevFotos.push({
            lbl: 'Montagefoto',
            filled: true,
            datum: now,
            von: 'Cockpit',
            dataUrl,
          });
          await apiFetch(`${API_ROUTES.fusa.fahrzeuge}/${encodeURIComponent(String(currentDetail.id))}`, {
            method: 'PATCH',
            body: { details: { fotos: prevFotos } },
          });
          t.value = '';
          if (typeof onReload === 'function') void onReload();
          const tr = findFzRowByVehicleId(currentDetail.id);
          if (tr instanceof HTMLElement) void openDetailByRow(tr);
          else renderDetailTab('fotos');
        } catch (e) {
          window.alert(formatApiErrorForUi(e));
        }
      })();
    });
  }

  if (detailTabsWrap instanceof HTMLElement) {
    detailTabsWrap.addEventListener('click', (ev) => {
      const t = ev.target;
      const btn = t && typeof t.closest === 'function' ? t.closest('[data-fusa-fz-detail-tab]') : null;
      if (!(btn instanceof HTMLElement)) return;
      const tab = String(btn.getAttribute('data-fusa-fz-detail-tab') || 'stamm');
      for (const b of detailTabsWrap.querySelectorAll('[data-fusa-fz-detail-tab]')) {
        b.classList.toggle('active', b === btn);
      }
      renderDetailTab(tab);
    });
  }

  const createOpenBtn = fzScope.querySelector('[data-fusa-fahrzeug-open-create]');
  const createModal = fzScope.querySelector('[data-fusa-fz-create-modal]');
  const form = fzScope.querySelector('[data-fusa-fahrzeug-form]');
  const createCloseButtons = fzScope.querySelectorAll('[data-fusa-fz-create-close]');
  const typHidden = fzScope.querySelector('[data-fusa-fz-typ-kategorie]');
  const antriebHidden = fzScope.querySelector('[data-fusa-fz-antrieb]');
  const typChipWrap = fzScope.querySelector('[data-fusa-fz-typ-chips]');
  const antriebChipWrap = fzScope.querySelector('[data-fusa-fz-antrieb-chips]');
  const flaechenChipWrap = fzScope.querySelector('[data-fusa-fz-flaechen-chips]');
  const betreiberSel = fzScope.querySelector('[data-fusa-fz-betreiber]');
  const depotSel = fzScope.querySelector('[data-fusa-fz-depot]');
  const bjInput = fzScope.querySelector('[data-fusa-fz-baujahr]');
  const ausmInput = fzScope.querySelector('[data-fusa-fz-ausmusterung]');
  const ewHidden = fzScope.querySelector('[data-fusa-fz-ew]');
  const ewNein = fzScope.querySelector('[data-fusa-fz-ew-nein]');
  const ewJa = fzScope.querySelector('[data-fusa-fz-ew-ja]');
  const saveDraftBtn = fzScope.querySelector('[data-fusa-fz-save-draft]');

  function autoFillAusm() {
    if (!(bjInput instanceof HTMLInputElement) || !(ausmInput instanceof HTMLInputElement)) return;
    const bj = Number.parseInt(String(bjInput.value || ''), 10);
    if (bj > 1990 && !String(ausmInput.value || '').trim()) {
      ausmInput.value = String(bj + 12);
    }
  }

  function applyEwUi(isJa) {
    if (!(ewHidden instanceof HTMLInputElement)) return;
    ewHidden.value = isJa ? 'true' : 'false';
    if (ewJa instanceof HTMLElement) ewJa.style.cssText = '';
    if (ewNein instanceof HTMLElement) ewNein.style.cssText = '';
    if (isJa && ewJa instanceof HTMLElement) {
      ewJa.style.cssText = 'border-color:var(--purple);background:var(--purple-l);color:var(--purple);font-weight:600;';
    }
    if (!isJa && ewNein instanceof HTMLElement) {
      ewNein.style.cssText = 'border-color:var(--green);background:var(--green-l);color:var(--green);font-weight:600;';
    }
  }

  function openCreateModal() {
    if (!(createModal instanceof HTMLElement) || !(form instanceof HTMLFormElement)) return;
    form.reset();
    const pidField = form.querySelector('[data-fusa-fahrzeug-project-id]');
    const ap = getFusaAppProject();
    if (pidField instanceof HTMLInputElement && ap?.id) {
      pidField.value = String(ap.id);
    }
    if (typHidden instanceof HTMLInputElement) typHidden.value = '';
    if (antriebHidden instanceof HTMLInputElement) antriebHidden.value = '';
    if (depotSel instanceof HTMLSelectElement) depotSel.innerHTML = '<option value="">— erst Betreiber wählen —</option>';
    for (const c of fzScope.querySelectorAll('[data-fusa-fz-typ-chips] .chip, [data-fusa-fz-antrieb-chips] .chip')) {
      c.classList.remove('sel');
    }
    if (flaechenChipWrap instanceof HTMLElement) {
      for (const c of flaechenChipWrap.querySelectorAll('.chip')) c.classList.remove('sel');
    }
    applyEwUi(false);
    createModal.style.display = 'flex';
    createModal.setAttribute('aria-hidden', 'false');
  }

  function closeCreateModal() {
    if (!(createModal instanceof HTMLElement)) return;
    createModal.style.display = 'none';
    createModal.setAttribute('aria-hidden', 'true');
  }

  if (createOpenBtn instanceof HTMLButtonElement) {
    createOpenBtn.addEventListener('click', openCreateModal);
  }
  for (const btn of createCloseButtons) {
    btn.addEventListener('click', closeCreateModal);
  }
  if (createModal instanceof HTMLElement) {
    createModal.addEventListener('click', (ev) => {
      if (ev.target === createModal) closeCreateModal();
    });
  }

  if (typChipWrap instanceof HTMLElement && typHidden instanceof HTMLInputElement) {
    typChipWrap.addEventListener('click', (ev) => {
      const t = ev.target;
      const chip = t && typeof t.closest === 'function' ? t.closest('.chip[data-val]') : null;
      if (!(chip instanceof HTMLElement)) return;
      for (const c of typChipWrap.querySelectorAll('.chip[data-val]')) c.classList.remove('sel');
      chip.classList.add('sel');
      typHidden.value = String(chip.getAttribute('data-val') || '');
      autoFillAusm();
    });
  }
  if (antriebChipWrap instanceof HTMLElement && antriebHidden instanceof HTMLInputElement) {
    antriebChipWrap.addEventListener('click', (ev) => {
      const t = ev.target;
      const chip = t && typeof t.closest === 'function' ? t.closest('.chip[data-val]') : null;
      if (!(chip instanceof HTMLElement)) return;
      for (const c of antriebChipWrap.querySelectorAll('.chip[data-val]')) c.classList.remove('sel');
      chip.classList.add('sel');
      antriebHidden.value = String(chip.getAttribute('data-val') || '');
    });
  }

  if (flaechenChipWrap instanceof HTMLElement) {
    flaechenChipWrap.addEventListener('click', (ev) => {
      const t = ev.target;
      const chip = t && typeof t.closest === 'function' ? t.closest('.chip') : null;
      if (!(chip instanceof HTMLElement)) return;
      chip.classList.toggle('sel');
    });
  }

  if (ewNein instanceof HTMLElement) {
    ewNein.addEventListener('click', () => applyEwUi(false));
  }
  if (ewJa instanceof HTMLElement) {
    ewJa.addEventListener('click', () => applyEwUi(true));
  }

  if (betreiberSel instanceof HTMLSelectElement && depotSel instanceof HTMLSelectElement) {
    betreiberSel.addEventListener('change', () => {
      const deps = BETREIBER_DEPOTS[String(betreiberSel.value || '')] || [];
      depotSel.innerHTML = deps.length
        ? deps.map((d) => `<option value="${esc(d)}">${esc(d)}</option>`).join('')
        : '<option value="">— kein Depot verfügbar —</option>';
    });
  }

  if (bjInput instanceof HTMLInputElement && ausmInput instanceof HTMLInputElement) {
    bjInput.addEventListener('input', () => {
      autoFillAusm();
    });
  }

  if (saveDraftBtn instanceof HTMLButtonElement && form instanceof HTMLFormElement) {
    saveDraftBtn.addEventListener('click', () => {
      const st = form.querySelector('select[name="status"]');
      if (st instanceof HTMLSelectElement) st.value = 'geplant';
    });
  }

  if (!(form instanceof HTMLFormElement)) return;
  const msgEl = form.querySelector('[data-fusa-fahrzeug-msg]');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    if (msgEl instanceof HTMLElement) {
      msgEl.textContent = '';
      msgEl.hidden = true;
    }
    const fd = new FormData(form);
    const fromFormPid = String(fd.get('project_id') || '').trim();
    const ap = getFusaAppProject();
    const ctxPid = ap?.id != null ? String(ap.id).trim() : '';
    const project_id = ctxPid || fromFormPid;
    if (isFusaFzRuntimeDebug() && ctxPid && fromFormPid && ctxPid !== fromFormPid) {
      console.warn('[FUSA-FZ] project_id: verstecktes Feld', fromFormPid, 'weicht von CCState ab', ctxPid, '→ es wird CCState verwendet.');
    }
    const kennung = String(fd.get('kennung') || '').trim();
    const kennzeichen = String(fd.get('kennzeichen') || '').trim();
    const typKategorie = typHidden instanceof HTMLInputElement ? String(typHidden.value || '').trim() : '';
    const hersteller = String(fd.get('hersteller') || '').trim();
    const modell = String(fd.get('modell') || '').trim();
    const baujahr = String(fd.get('baujahr') || '').trim();
    const betreiber = String(fd.get('betreiber') || '').trim();
    const depot = String(fd.get('depot') || '').trim();
    const status = String(fd.get('status') || '').trim() || 'frei';
    const antrieb = antriebHidden instanceof HTMLInputElement ? String(antriebHidden.value || '').trim() : '';
    const wagennummer = String(fd.get('wagennummer') || '').trim();
    const erstzulassung = String(fd.get('erstzulassung') || '').trim();
    const ausmusterungGeplant = String(fd.get('ausmusterung_geplant') || '').trim();
    const linien = String(fd.get('linien') || '').trim();
    const notiz = String(fd.get('notiz') || '').trim();
    const zustaendig_cc = String(fd.get('zustaendig_cc') || '').trim();
    const werbeflaechen =
      flaechenChipWrap instanceof HTMLElement
        ? [...flaechenChipWrap.querySelectorAll('.chip.sel')]
            .map((c) => String(c.textContent || '').replace(/\s+/g, ' ').trim())
            .filter(Boolean)
        : [];
    const eigenwerbungSave = ewHidden instanceof HTMLInputElement && String(ewHidden.value || '') === 'true';
    if (!project_id || !kennung || !kennzeichen || !typKategorie || !baujahr || !betreiber || !depot || !antrieb) {
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = 'Pflichtfelder: Fahrzeugnummer, Kennzeichen, Typ, Baujahr, Betreiber, Depot, Antrieb.';
        msgEl.hidden = false;
      }
      return;
    }
    const typ = `${hersteller ? `${hersteller} ` : ''}${modell || typKategorie}`.trim();
    const details = {
      wagennummer: wagennummer || undefined,
      typ_kategorie: typKategorie,
      hersteller: hersteller || undefined,
      modell: modell || undefined,
      antrieb,
      baujahr: baujahr || undefined,
      erstzulassung: erstzulassung || undefined,
      ausmusterung_geplant: ausmusterungGeplant || undefined,
      betreiber,
      depot,
      linien: linien || undefined,
      werbeflaechen,
      eigenwerbung: eigenwerbungSave,
      notiz: notiz || undefined,
      zustaendig_cc: zustaendig_cc || undefined,
    };
    const postBody = {
      project_id,
      kennung,
      typ,
      kennzeichen,
      status,
      details,
    };
    if (isFusaFzRuntimeDebug()) {
      const named = Object.fromEntries(
        [...fd.entries()].map(([k, v]) => [k, typeof v === 'string' ? v : String(v)]),
      );
      console.group('[FUSA-FZ] Submit — Formular / Hidden / Chips (unmittelbar vor POST)');
      console.table({
        ...named,
        typ_kategorie_hidden: typKategorie,
        antrieb_hidden: antrieb,
        eigenwerbung_hidden: ewHidden instanceof HTMLInputElement ? ewHidden.value : '',
        werbeflaechen_chips: werbeflaechen.join(' | '),
      });
      console.log('[FUSA-FZ] details-Objekt', details);
      console.log('[FUSA-FZ] POST-Body (wie Network-Payload)', postBody);
      console.groupEnd();
    }
    try {
      const postResponse = await apiFetch(API_ROUTES.fusa.fahrzeuge, {
        method: 'POST',
        body: postBody,
      });
      if (isFusaFzRuntimeDebug()) {
        console.info('[FUSA-FZ] POST /fahrzeuge — API-Antwort (wie Network-Response)', postResponse);
      }
      closeCreateModal();
      if (typeof onReload === 'function') await onReload();
      if (isFusaFzRuntimeDebug()) {
        queueMicrotask(() => {
          const root = typeof document !== 'undefined' ? document.getElementById('cockpit-content') : null;
          const scope = root?.querySelector('[data-ccw-ro="fusa-fahrzeuge"]');
          if (!scope) {
            console.warn('[FUSA-FZ] Nach Reload: kein [data-ccw-ro="fusa-fahrzeuge"] unter #cockpit-content.');
            return;
          }
          const trs = [...scope.querySelectorAll('tr[data-fusa-fz-row]')];
          console.group(`[FUSA-FZ] Nach Reload: ${trs.length} Zeile(n), je data-search-text / data-type-text / data-location-text`);
          for (const tr of trs.slice(0, 40)) {
            console.log(tr.getAttribute('data-ccw-row-id'), {
              data_search_text: tr.getAttribute('data-search-text'),
              data_type_text: tr.getAttribute('data-type-text'),
              data_location_text: tr.getAttribute('data-location-text'),
            });
          }
          console.groupEnd();
        });
      }
    } catch (e) {
      const t = e instanceof Error ? e.message : 'Anlegen fehlgeschlagen';
      if (msgEl instanceof HTMLElement) {
        msgEl.textContent = t;
        msgEl.hidden = false;
      }
    }
  });
}
