import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { createMulterMemory, writeUploadBufferSync } from '../lib/upload-storage.js';

const TITEL_MAX = 200;
const BESCHREIBUNG_MAX = 4000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 12;
const PUBLIC_PHOTO_MAX_BYTES = 12 * 1024 * 1024;
const DAMAGE_PARTS = new Set(['front', 'back', 'left', 'right', 'interior', 'roof', 'damage_closeup', 'other']);

const publicPhotoUpload = createMulterMemory({
  limits: { fileSize: PUBLIC_PHOTO_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase().trim();
    if (/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i.test(mt)) return cb(null, true);
    return cb(new Error('Nur Bilddateien sind erlaubt.'));
  },
});

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>}
 */
function parseJsonObject(raw) {
  if (raw == null || raw === '') return {};
  try {
    const parsed = JSON.parse(String(raw));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {unknown} raw
 * @param {number} max
 */
function safeText(raw, max) {
  if (raw == null) return '';
  return String(raw).trim().slice(0, max);
}

/**
 * @param {unknown} raw
 */
function normalizeDamagePart(raw) {
  const part = safeText(raw, 40);
  return DAMAGE_PARTS.has(part) ? part : 'other';
}

/**
 * @param {unknown} raw
 */
function normalizeDamageType(raw) {
  const t = safeText(raw, 40);
  if (t === 'Eigen') return 'Eigenschaden';
  if (t === 'Fremd') return 'Fremdschaden';
  if (t === 'Eigenschaden' || t === 'Fremdschaden' || t === 'Unklar') return t;
  return 'Unklar';
}

/**
 * @param {unknown} raw
 */
function normalizePriority(raw) {
  const p = safeText(raw, 40).toLowerCase();
  return p === 'dringend' ? 'dringend' : 'normal';
}

/**
 * @param {unknown} raw
 */
function normalizeSeverity(raw) {
  const s = safeText(raw, 40).toLowerCase();
  if (s === 'dringend' || s === 'klein') return s;
  return 'normal';
}

/**
 * @param {unknown} raw
 */
function normalizeUploadArt(raw) {
  const t = safeText(raw, 40);
  return t === 'fahrzeugfoto' ? 'fahrzeugfoto' : 'schaden';
}

/**
 * @param {unknown} raw
 */
function parseExistingDetails(raw) {
  return parseJsonObject(raw);
}

/**
 * @param {string} part
 */
function photoPartLabel(part) {
  if (part === 'left') return 'Linke Seite';
  if (part === 'right') return 'Rechte Seite';
  if (part === 'back') return 'Heck';
  if (part === 'front') return 'Gesamtansicht';
  if (part === 'interior') return 'Abnahme';
  if (part === 'damage_closeup') return 'Detail';
  if (part === 'roof') return 'Dach';
  return 'Fahrzeugfoto';
}

/**
 * @param {Date} d
 */
function formatDateDe(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear());
  return `${dd}.${mm}.${yy}`;
}

/**
 * Public QR "Fotos" uploads are registered in fahrzeuge.details_json.fotos,
 * because the admin Fahrzeug tab "Fotos & Dokumente" renders that list.
 *
 * @param {object} store
 * @param {string} fzId
 * @param {{ id: string, part: string, buffer: Buffer, mimetype?: string, originalname?: string }} foto
 */
async function appendPublicVehiclePhotoToFahrzeug(store, fzId, foto) {
  if (!fzId || !foto.buffer || !Buffer.isBuffer(foto.buffer)) return;
  if (typeof store.getFahrzeugById !== 'function' || typeof store.setFahrzeugDetailsJson !== 'function') return;
  const fz = await store.getFahrzeugById(fzId);
  if (!fz) return;
  const details = parseExistingDetails(fz.details_json);
  const prev = Array.isArray(details.fotos) ? details.fotos.filter((x) => x && typeof x === 'object').slice(0, 199) : [];
  const mt = safeText(foto.mimetype, 80) || 'image/jpeg';
  prev.push({
    lbl: photoPartLabel(foto.part),
    filled: true,
    datum: formatDateDe(new Date()),
    von: 'QR-Scan',
    dataUrl: `data:${mt};base64,${foto.buffer.toString('base64')}`,
    foto_id: foto.id,
    quelle: 'qr-scan',
    original_name: safeText(foto.originalname, 240),
  });
  details.fotos = prev;
  await store.setFahrzeugDetailsJson(fzId, JSON.stringify(details));
}

/**
 * @param {object} row
 */
function mapPublicFahrzeug(row) {
  const details = parseJsonObject(row.details_json);
  return {
    id: row.id != null ? String(row.id) : '',
    kennung: row.kennung != null ? String(row.kennung) : '',
    typ: row.typ != null ? String(row.typ) : '',
    kennzeichen: row.kennzeichen != null ? String(row.kennzeichen) : '',
    status: row.status != null ? String(row.status) : '',
    betreiber: details.betreiber != null ? String(details.betreiber) : '',
    depot: details.depot != null ? String(details.depot) : '',
    baujahr: details.baujahr != null ? String(details.baujahr) : '',
    antrieb: details.antrieb != null ? String(details.antrieb) : '',
    linien: details.linien != null ? String(details.linien) : '',
    werbeflaechen: Array.isArray(details.werbeflaechen) ? details.werbeflaechen.map((x) => String(x)) : [],
  };
}

/**
 * @param {object} row
 */
function mapPublicSchaden(row) {
  const extra = parseJsonObject(row.extra_json);
  return {
    id: row.id != null ? String(row.id) : '',
    fahrzeug_id: row.fahrzeug_id != null ? String(row.fahrzeug_id) : '',
    titel: row.titel != null ? String(row.titel) : '',
    beschreibung: row.beschreibung != null ? String(row.beschreibung) : '',
    status: row.status != null ? String(row.status) : 'offen',
    werkstatt_status: row.werkstatt_status != null ? String(row.werkstatt_status) : 'offen',
    typ: extra.typ != null ? String(extra.typ) : 'Unklar',
    prioritaet: extra.prioritaet != null ? String(extra.prioritaet) : 'normal',
    reparatur_phase: extra.reparatur_phase != null ? String(extra.reparatur_phase) : 'geplant',
    terminanfrage: extra.terminanfrage && typeof extra.terminanfrage === 'object' ? extra.terminanfrage : null,
    werkstatt_response: extra.werkstatt_response && typeof extra.werkstatt_response === 'object' ? extra.werkstatt_response : null,
    repair_started_at: extra.repair_started_at != null ? String(extra.repair_started_at) : null,
    repair_started_by: extra.repair_started_by != null ? String(extra.repair_started_by) : null,
    repair_completed_at: extra.repair_completed_at != null ? String(extra.repair_completed_at) : null,
    repair_completed_by: extra.repair_completed_by != null ? String(extra.repair_completed_by) : null,
  };
}

/**
 * @param {object} store
 * @param {string} schadenId
 * @param {string} eventType
 * @param {Record<string, unknown>} event
 */
async function insertPublicRepairHistory(store, schadenId, eventType, event) {
  if (typeof store.insertSchadenHistory !== 'function') return;
  await store.insertSchadenHistory({
    id: randomUUID(),
    schadenId,
    eventType,
    createdByType: 'staff',
    event,
  });
}

/**
 * @param {import('express').Request} req
 */
function uploadedRepairFiles(req) {
  const files =
    req.files && typeof req.files === 'object'
      ? /** @type {Record<string, { buffer?: Buffer, originalname?: string }[]|undefined>} */ (req.files)
      : {};
  return [...(files.fotos || []), ...(files.foto || []), ...(files.file || [])].filter((f) => f && f.buffer && Buffer.isBuffer(f.buffer));
}

/** Öffentliche GET /public/fahrzeug und GET /m/fahrzeug — moderat, getrennt von POST-Zähler. */
const PUBLIC_GET_WINDOW_MS = 60_000;
const PUBLIC_GET_MAX = 90;

/** @type {Map<string, number[]>} */
const postHitsByIp = new Map();

/** @type {Map<string, number[]>} */
const publicGetHitsByIp = new Map();

/**
 * @param {import('express').Request} req
 */
function clientKey(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.trim()) return xf.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function rateLimitPublicSchadenPost(req, res, next) {
  const ip = clientKey(req);
  const now = Date.now();
  let arr = postHitsByIp.get(ip) || [];
  arr = arr.filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_MAX_POSTS) {
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Zu viele Meldungen. Bitte später erneut versuchen.',
    });
  }
  arr.push(now);
  postHitsByIp.set(ip, arr);
  next();
}

/**
 * Rate-Limit für öffentliche Fahrzeug-GETs (JSON + Mobil-HTML nutzen dieselbe Logik).
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export function rateLimitPublicFahrzeugGet(req, res, next) {
  const ip = clientKey(req);
  const now = Date.now();
  let arr = publicGetHitsByIp.get(ip) || [];
  arr = arr.filter((t) => now - t < PUBLIC_GET_WINDOW_MS);
  if (arr.length >= PUBLIC_GET_MAX) {
    const p = req.path || '';
    if (p.startsWith('/m/')) {
      return res.status(429).type('text/plain').send('Zu viele Anfragen. Bitte später erneut versuchen.');
    }
    return res.status(429).json({
      error: 'RATE_LIMIT',
      message: 'Zu viele Anfragen. Bitte später erneut versuchen.',
    });
  }
  arr.push(now);
  publicGetHitsByIp.set(ip, arr);
  next();
}

/**
 * @param {string} id
 */
function buildMobileSchadenMeldenHtml(id) {
  const fzJson = JSON.stringify(id);
  return `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="cc-api-base" content="" />
  <title>FUSA Montage</title>
  <style>
    * { box-sizing: border-box; }
    :root { color-scheme: light; --bg:#edf2f7; --ink:#21120d; --muted:#6d6662; --top:#1d0d06; --accent:#efae34; --accent-dark:#df4c08; --card:#ffffff; --soft:#e6f2fd; --line:#e4e8ee; --danger:#ce2529; --ok:#1d8a45; }
    body { margin: 0; min-height: 100vh; background: var(--bg); color: var(--ink); font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .top { background: var(--top); color: #fff; padding: 16px 18px 22px; }
    .top-inner { max-width: 560px; margin: 0 auto; display: flex; align-items: center; justify-content: space-between; gap: 14px; }
    .brand { display: flex; align-items: center; gap: 13px; min-width: 0; }
    .logo { width: 54px; height: 54px; border-radius: 14px; background: var(--accent); color: #2a1608; font-weight: 900; display: grid; place-items: center; font-size: 1.12rem; flex: 0 0 auto; }
    .brand-title { font-size: 1.32rem; font-weight: 900; line-height: 1.05; }
    .brand-sub { color: rgba(255,255,255,.52); font-size: 1rem; margin-top: 2px; }
    .close { border: 0; border-radius: 14px; background: rgba(255,255,255,.14); color: #fff; padding: 12px 16px; font-size: 1.02rem; white-space: nowrap; }
    .app { max-width: 560px; margin: 0 auto; padding: 18px 14px 24px; }
    .vehicle-card { position: relative; display: flex; align-items: center; gap: 16px; background: var(--card); border-radius: 18px; padding: 20px 18px; box-shadow: 0 10px 28px rgba(20,28,38,.08); overflow: hidden; margin-bottom: 18px; }
    .vehicle-card:before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--accent); }
    .bus-icon { width: 64px; height: 64px; border-radius: 16px; background: #fff1d8; display: grid; place-items: center; font-size: 30px; flex: 0 0 auto; }
    .vehicle-text { min-width: 0; flex: 1; }
    h1 { margin: 0; font-size: 1.55rem; line-height: 1.1; letter-spacing: 0; }
    .vehicle-sub { color: var(--muted); font-size: 1.03rem; line-height: 1.24; margin-top: 4px; }
    .assignment { color: #e99e19; font-weight: 800; font-size: .96rem; margin-top: 8px; }
    .status-pill { align-self: center; border: 0; color: #df4c08; background: #eaf4ff; border-radius: 999px; padding: 8px 14px; font-weight: 900; font-size: .94rem; flex: 0 0 auto; }
    .tabs { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; padding: 8px; background: #fff; border-radius: 16px; box-shadow: 0 8px 24px rgba(20,28,38,.07); margin-bottom: 18px; }
    .tab { border: 0; border-radius: 11px; min-height: 56px; background: transparent; color: var(--muted); font-weight: 800; font-size: 1.08rem; }
    .tab.is-active { background: var(--accent); color: var(--ink); }
    .panel { background: var(--card); border-radius: 18px; padding: 18px; box-shadow: 0 10px 28px rgba(20,28,38,.08); }
    .panel h2 { margin: 0 0 16px; font-size: 1.22rem; }
    .photo-type-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .type-btn { border: 0; border-radius: 14px; min-height: 86px; background: var(--soft); color: var(--accent-dark); font-size: 1.02rem; font-weight: 900; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; text-align: center; }
    .type-btn span { font-size: 1.7rem; line-height: 1; }
    .type-btn.is-active { outline: 3px solid var(--accent); background: #fff4df; }
    .camera-card, .damage-photo { width: 100%; border: 0; border-radius: 18px; margin-top: 16px; padding: 28px 16px; background: var(--top); color: #fff; text-align: center; }
    .camera-card .icon, .damage-photo .icon { font-size: 2.1rem; display: block; margin-bottom: 12px; }
    .camera-card strong, .damage-photo strong { display: block; font-size: 1.3rem; }
    .camera-card small, .damage-photo small { display: block; color: rgba(255,255,255,.55); margin-top: 6px; font-size: .98rem; }
    .selected-list { margin-top: 12px; display: grid; gap: 8px; }
    .selected-file { background: #f7fafc; border: 1px solid var(--line); border-radius: 12px; padding: 10px 12px; color: var(--muted); font-size: .9rem; word-break: break-word; }
    .repair-list { display: grid; gap: 10px; }
    .repair-card { border: 1px solid var(--line); border-radius: 14px; background: #f8fbff; padding: 13px; text-align: left; }
    .repair-card.is-active { outline: 3px solid rgba(239,174,52,.35); border-color: var(--accent); background: #fff8ea; }
    .repair-card strong { display: block; font-size: 1.02rem; color: var(--ink); }
    .repair-card span { display: block; margin-top: 4px; color: var(--muted); font-size: .9rem; line-height: 1.35; }
    .repair-actions { display: grid; grid-template-columns: 1fr; gap: 10px; margin-top: 14px; }
    label { display: block; color: #5f5b57; font-size: 1.02rem; font-weight: 750; margin: 14px 0 8px; }
    textarea, input, select { width: 100%; border: 1px solid #d9d9d9; border-radius: 13px; background: #fff; color: var(--ink); padding: 14px; font-size: 16px; outline: none; }
    textarea { min-height: 108px; resize: vertical; }
    textarea:focus, input:focus, select:focus { border-color: var(--accent); box-shadow: 0 0 0 3px rgba(239,174,52,.18); }
    .damage-type, .severity { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 8px; }
    .dtype, .sev { border: 0; border-radius: 13px; min-height: 54px; font-weight: 900; font-size: .96rem; }
    .dtype { color: #5c390d; background: #fff4df; border: 1px solid #f0d7a7; }
    .dtype.is-active { color: var(--ink); background: var(--accent); outline: 3px solid rgba(239,174,52,.35); }
    .sev[data-severity="dringend"] { color: #bd272c; background: #fde8ea; }
    .sev[data-severity="normal"] { color: #82510d; background: #fbf0d7; }
    .sev[data-severity="klein"] { color: #16735c; background: #ddf4ec; }
    .sev.is-active { outline: 3px solid var(--accent); }
    .damage-photo { background: #fffaf2; color: #8a520c; border: 2px dashed var(--accent); }
    .damage-photo small { color: #9b8a78; }
    .submit-photo, .submit-damage, .submit-repair { width: 100%; border: 0; border-radius: 16px; padding: 18px; margin-top: 16px; color: #fff; font-weight: 900; font-size: 1.12rem; }
    .submit-photo { background: var(--top); }
    .submit-damage { background: var(--danger); }
    .submit-repair { background: var(--ok); }
    button:disabled { opacity: .58; }
    .err { color: #9f1d20; background: #fde8ea; border: 1px solid #f5b5b8; border-radius: 12px; padding: 11px 12px; margin-top: 12px; font-size: .94rem; }
    .ok { color: #146c38; background: #e5f8ed; border: 1px solid #a8e7c0; border-radius: 14px; font-size: 1rem; font-weight: 800; text-align: center; padding: 16px 12px; margin-top: 14px; }
    .load { text-align: center; padding: 40px 8px; color: var(--muted); }
    .hidden-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
    [hidden] { display: none !important; }
    @media (max-width: 430px) { .top { padding-left: 14px; padding-right: 14px; } .close { padding: 10px 12px; font-size: .95rem; } .vehicle-card { padding: 17px 14px; gap: 12px; } .bus-icon { width: 56px; height: 56px; } h1 { font-size: 1.36rem; } .vehicle-sub { font-size: .94rem; } .status-pill { padding: 7px 11px; } .panel { padding: 16px; } .photo-type-grid { gap: 9px; } .type-btn { min-height: 82px; } .damage-type, .severity { gap: 8px; } .dtype, .sev { font-size: .9rem; } }
  </style>
</head>
<body>
  <header class="top">
    <div class="top-inner">
      <div class="brand">
        <div class="logo">CC</div>
        <div>
          <div class="brand-title">FUSA Montage</div>
          <div class="brand-sub">Fahrzeug-Upload</div>
        </div>
      </div>
      <button type="button" class="close" id="close-btn">× Schließen</button>
    </div>
  </header>
  <main class="app">
    <p class="load" id="loading">Laden …</p>
    <div id="main" hidden>
      <section class="vehicle-card">
        <div class="bus-icon">🚌</div>
        <div class="vehicle-text">
          <h1 id="fz-title">Fahrzeug</h1>
          <div class="vehicle-sub" id="fz-sub">—</div>
          <div class="assignment" id="assignment-line">Aktive Auftrag: —</div>
        </div>
        <div class="status-pill" id="status-pill">—</div>
      </section>
      <nav class="tabs" aria-label="Upload-Bereich">
        <button type="button" class="tab is-active" data-tab="photos">📷 Fotos</button>
        <button type="button" class="tab" data-tab="damage">⚠ Schaden</button>
        <button type="button" class="tab" data-tab="repair" id="repair-tab" hidden>🔧 Reparatur</button>
      </nav>

      <section class="panel" id="photos-panel">
        <h2>Fotoart wählen</h2>
        <div class="photo-type-grid">
          <button type="button" class="type-btn is-active" data-photo-type="left"><span>🚌</span>Linke Seite</button>
          <button type="button" class="type-btn" data-photo-type="right"><span>🚌</span>Rechte Seite</button>
          <button type="button" class="type-btn" data-photo-type="back"><span>↩</span>Heck</button>
          <button type="button" class="type-btn" data-photo-type="front"><span>🔍</span>Gesamtansicht</button>
          <button type="button" class="type-btn" data-photo-type="interior"><span>✅</span>Abnahme</button>
          <button type="button" class="type-btn" data-photo-type="damage_closeup"><span>🔎</span>Detail</button>
        </div>
        <input id="photo-input" class="hidden-input" type="file" accept="image/*" capture="environment" />
        <button type="button" class="camera-card" id="photo-camera">
          <span class="icon">📷</span>
          <strong>Kamera öffnen</strong>
          <small>Foto aufnehmen oder aus Galerie wählen</small>
        </button>
        <div class="selected-list" id="photo-list"></div>
        <p class="err" id="photo-msg" hidden role="alert"></p>
        <button type="button" class="submit-photo" id="photo-submit">📤 Fotos speichern</button>
        <div id="photo-done" class="ok" hidden>Fotos wurden erfolgreich gesendet.</div>
      </section>

      <section class="panel" id="damage-panel" hidden>
        <h2>Schaden melden</h2>
        <label for="damage-desc">Schadenbeschreibung</label>
        <textarea id="damage-desc" maxlength="${BESCHREIBUNG_MAX}" autocomplete="off" placeholder="z.B. Blase Seitenfolie links, ca. 20cm..."></textarea>
        <label>Schaden-Typ</label>
        <div class="damage-type" role="radiogroup" aria-label="Schaden-Typ">
          <button type="button" class="dtype is-active" data-damage-type="Fremdschaden" aria-pressed="true">Fremd</button>
          <button type="button" class="dtype" data-damage-type="Eigenschaden" aria-pressed="false">Eigen</button>
          <button type="button" class="dtype" data-damage-type="Unklar" aria-pressed="false">Unklar</button>
        </div>
        <label for="damage-cause">Wer hat den Schaden verursacht?</label>
        <input id="damage-cause" maxlength="240" autocomplete="off" placeholder="z.B. Fremdfirma, Fahrer, unbekannt" />
        <label>Schweregrad</label>
        <div class="severity">
          <button type="button" class="sev" data-severity="dringend">🔴 Dringend</button>
          <button type="button" class="sev is-active" data-severity="normal">🟡 Normal</button>
          <button type="button" class="sev" data-severity="klein">🟢 Klein</button>
        </div>
        <label for="damage-title">Kurzer Titel</label>
        <input id="damage-title" maxlength="${TITEL_MAX}" autocomplete="off" placeholder="z.B. Folie linke Seite beschädigt" />
        <label for="damage-reporter">Name Fahrer / Melder</label>
        <input id="damage-reporter" maxlength="160" autocomplete="name" />
        <input id="damage-photo-input" class="hidden-input" type="file" accept="image/*" capture="environment" />
        <button type="button" class="damage-photo" id="damage-photo-btn">
          <span class="icon">📷</span>
          <strong>Schadensfoto aufnehmen</strong>
          <small id="damage-photo-name">Kein Foto ausgewählt</small>
        </button>
        <p class="err" id="damage-msg" hidden role="alert"></p>
        <button type="button" class="submit-damage" id="damage-submit">⚠ Schaden melden</button>
        <div id="damage-done" class="ok" hidden>Schaden wurde erfolgreich gesendet.</div>
      </section>

      <section class="panel" id="repair-panel" hidden>
        <h2>Reparatur aktualisieren</h2>
        <div class="repair-list" id="repair-list"></div>
        <label for="repair-staff">Name Monteur / Mitarbeiter</label>
        <input id="repair-staff" maxlength="160" autocomplete="name" placeholder="z.B. Max Mustermann" />
        <label for="repair-note">Notiz zur Reparatur</label>
        <textarea id="repair-note" maxlength="2000" autocomplete="off" placeholder="z.B. Folie ersetzt, Fläche gereinigt..."></textarea>
        <input id="repair-photo-input" class="hidden-input" type="file" accept="image/*" capture="environment" multiple />
        <button type="button" class="damage-photo" id="repair-photo-btn">
          <span class="icon">📷</span>
          <strong>Nachher-Fotos aufnehmen</strong>
          <small id="repair-photo-name">Keine Fotos ausgewählt</small>
        </button>
        <p class="err" id="repair-msg" hidden role="alert"></p>
        <div class="repair-actions">
          <button type="button" class="submit-photo" id="repair-start">🔧 Reparatur gestartet</button>
          <button type="button" class="submit-repair" id="repair-complete">✅ Reparatur abgeschlossen</button>
        </div>
        <div id="repair-done" class="ok" hidden>Reparaturstatus wurde aktualisiert.</div>
      </section>
    </div>
    <p class="err" id="fatal" hidden role="alert"></p>
  </main>
  <script>
(function () {
  var FZ_ID = ${fzJson};
  var meta = document.querySelector('meta[name="cc-api-base"]');
  var raw = meta && meta.getAttribute('content') != null ? String(meta.getAttribute('content')).trim() : '';
  var BASE = raw ? (raw.charAt(raw.length - 1) === '/' ? raw.slice(0, -1) : raw) : window.location.origin;

  var loading = document.getElementById('loading');
  var main = document.getElementById('main');
  var fatal = document.getElementById('fatal');
  var fzTitle = document.getElementById('fz-title');
  var fzSub = document.getElementById('fz-sub');
  var assignmentLine = document.getElementById('assignment-line');
  var statusPill = document.getElementById('status-pill');
  var photosPanel = document.getElementById('photos-panel');
  var damagePanel = document.getElementById('damage-panel');
  var repairPanel = document.getElementById('repair-panel');
  var repairTab = document.getElementById('repair-tab');
  var photoInput = document.getElementById('photo-input');
  var photoCamera = document.getElementById('photo-camera');
  var photoList = document.getElementById('photo-list');
  var photoMsg = document.getElementById('photo-msg');
  var photoSubmit = document.getElementById('photo-submit');
  var photoDone = document.getElementById('photo-done');
  var damageDesc = document.getElementById('damage-desc');
  var damageTitle = document.getElementById('damage-title');
  var damageReporter = document.getElementById('damage-reporter');
  var damageCause = document.getElementById('damage-cause');
  var damagePhotoInput = document.getElementById('damage-photo-input');
  var damagePhotoBtn = document.getElementById('damage-photo-btn');
  var damagePhotoName = document.getElementById('damage-photo-name');
  var damageMsg = document.getElementById('damage-msg');
  var damageSubmit = document.getElementById('damage-submit');
  var damageDone = document.getElementById('damage-done');
  var repairList = document.getElementById('repair-list');
  var repairStaff = document.getElementById('repair-staff');
  var repairNote = document.getElementById('repair-note');
  var repairPhotoInput = document.getElementById('repair-photo-input');
  var repairPhotoBtn = document.getElementById('repair-photo-btn');
  var repairPhotoName = document.getElementById('repair-photo-name');
  var repairMsg = document.getElementById('repair-msg');
  var repairStart = document.getElementById('repair-start');
  var repairComplete = document.getElementById('repair-complete');
  var repairDone = document.getElementById('repair-done');

  var selectedPhotoType = 'left';
  var selectedDamageType = 'Fremdschaden';
  var selectedSeverity = 'normal';
  var photoFiles = {};
  var repairPhotoFiles = [];
  var activeRepairs = [];
  var selectedRepairId = '';
  var currentFahrzeug = null;
  var currentProjekt = null;

  var photoLabels = {
    left: 'Linke Seite',
    right: 'Rechte Seite',
    back: 'Heck',
    front: 'Gesamtansicht',
    interior: 'Abnahme',
    damage_closeup: 'Detail'
  };

  function showErr(el, text) {
    el.textContent = text || '';
    el.hidden = !text;
  }

  function fileCount(map) {
    return Object.keys(map).filter(function (k) { return map[k]; }).length;
  }

  function renderPhotoList() {
    var keys = Object.keys(photoFiles).filter(function (k) { return photoFiles[k]; });
    if (!keys.length) {
      photoList.innerHTML = '';
      return;
    }
    photoList.innerHTML = keys.map(function (k) {
      var f = photoFiles[k];
      return '<div class="selected-file"><strong>' + (photoLabels[k] || k) + '</strong>: ' + String(f.name || 'Foto') + '</div>';
    }).join('');
  }

  function renderRepairPhotoList() {
    var n = repairPhotoFiles.length;
    repairPhotoName.textContent = n ? (n + ' Foto' + (n === 1 ? '' : 's') + ' ausgewählt') : 'Keine Fotos ausgewählt';
    var old = document.getElementById('repair-photo-list');
    if (old) old.remove();
    if (!n) return;
    var list = document.createElement('div');
    list.id = 'repair-photo-list';
    list.className = 'selected-list';
    list.innerHTML = repairPhotoFiles.map(function (f, idx) {
      return '<div class="selected-file"><strong>Nachher-Foto ' + String(idx + 1) + '</strong>: ' + String(f.name || 'Foto') + '</div>';
    }).join('');
    repairPhotoBtn.insertAdjacentElement('afterend', list);
  }

  function setTab(tab) {
    if (tab === 'repair' && !activeRepairs.length) tab = 'photos';
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.classList.toggle('is-active', b.getAttribute('data-tab') === tab);
    });
    photosPanel.hidden = tab !== 'photos';
    damagePanel.hidden = tab !== 'damage';
    repairPanel.hidden = tab !== 'repair';
    showErr(photoMsg, '');
    showErr(damageMsg, '');
    showErr(repairMsg, '');
  }

  function buildVehicleTitle(fz) {
    var kn = fz && fz.kennung != null ? String(fz.kennung).trim() : '';
    var typ = fz && fz.typ != null ? String(fz.typ).trim() : '';
    return kn || typ || 'Fahrzeug';
  }

  function buildVehicleSub(fz) {
    var parts = [];
    if (fz && fz.typ) parts.push(String(fz.typ));
    if (fz && fz.depot) parts.push(String(fz.depot));
    if (fz && fz.kennzeichen) parts.push(String(fz.kennzeichen));
    return parts.length ? parts.join(' · ') : 'Fahrzeugdaten geladen';
  }

  function createReport(payload, files) {
    return fetch(BASE + '/public/schaeden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (_ref) {
        var r = _ref.r;
        var j = _ref.j;
        if (!r.ok) throw new Error((j && j.message) || 'Meldung fehlgeschlagen.');
        var schadenId = j && j.schaden && j.schaden.id ? String(j.schaden.id) : '';
        var token = j && j.upload_token ? String(j.upload_token) : '';
        if (!schadenId || !token) throw new Error('Upload-Daten fehlen.');
        return Promise.all(files.map(function (item) {
          var fd = new FormData();
          fd.append('upload_token', token);
          fd.append('part', item.part || 'other');
          fd.append('foto', item.file);
          return fetch(BASE + '/public/schaeden/' + encodeURIComponent(schadenId) + '/fotos', {
            method: 'POST',
            body: fd,
            headers: { Accept: 'application/json' }
          }).then(function (fr) {
            return fr.json().then(function (fj) {
              if (!fr.ok) throw new Error((fj && fj.message) || 'Foto-Upload fehlgeschlagen.');
              return fj;
            });
          });
        }));
      });
  }

  function repairStatusLabel(s) {
    if (!s) return 'Geplant';
    if (s === 'termin_bestaetigt') return 'Termin bestätigt';
    if (s === 'in_reparatur') return 'In Bearbeitung';
    if (s === 'reparatur_abgeschlossen') return 'Abgeschlossen';
    return String(s);
  }

  function renderRepairs() {
    if (!activeRepairs.length) {
      repairList.innerHTML = '<div class="selected-file"><strong>Keine aktive Reparatur</strong><br>Für dieses Fahrzeug gibt es aktuell keinen offenen Reparaturschaden.</div>';
      selectedRepairId = '';
      return;
    }
    if (!selectedRepairId) selectedRepairId = String(activeRepairs[0].id || '');
    repairList.innerHTML = activeRepairs.map(function (s) {
      var id = String(s.id || '');
      var title = String(s.titel || 'Schaden');
      var desc = String(s.beschreibung || '');
      var status = repairStatusLabel(String(s.reparatur_phase || ''));
      var active = id === selectedRepairId ? ' is-active' : '';
      return '<button type="button" class="repair-card' + active + '" data-repair-id="' + id.replace(/"/g, '&quot;') + '"><strong>' + title.replace(/</g, '&lt;') + '</strong><span>' + status + (desc ? ' · ' + desc.replace(/</g, '&lt;') : '') + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(document.querySelectorAll('[data-repair-id]'), function (b) {
      b.addEventListener('click', function () {
        selectedRepairId = b.getAttribute('data-repair-id') || '';
        renderRepairs();
      });
    });
  }

  function refreshVehicle() {
    return fetch(BASE + '/public/fahrzeug/' + encodeURIComponent(FZ_ID), { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (_ref2) {
        var r = _ref2.r;
        var j = _ref2.j;
        loading.hidden = true;
        if (!r.ok) {
          showErr(fatal, (j && j.message) || 'Fahrzeug nicht gefunden.');
          return;
        }
        currentFahrzeug = j.fahrzeug || {};
        currentProjekt = j.projekt || {};
        activeRepairs = Array.isArray(j.schaeden) ? j.schaeden : [];
        if (selectedRepairId && !activeRepairs.some(function (s) { return String(s.id || '') === selectedRepairId; })) selectedRepairId = '';
        if (repairTab) repairTab.hidden = activeRepairs.length === 0;
        if (!activeRepairs.length && repairPanel && !repairPanel.hidden) setTab('photos');
        fzTitle.textContent = buildVehicleTitle(currentFahrzeug);
        fzSub.textContent = buildVehicleSub(currentFahrzeug);
        assignmentLine.textContent = 'Aktive Auftrag: ' + (currentProjekt && currentProjekt.name ? String(currentProjekt.name) : '—');
        statusPill.textContent = currentFahrzeug && currentFahrzeug.status ? String(currentFahrzeug.status) : 'Bereit';
        renderRepairs();
        main.hidden = false;
      });
  }

  function submitRepair(action) {
    showErr(repairMsg, '');
    repairDone.hidden = true;
    if (!selectedRepairId) {
      showErr(repairMsg, 'Bitte zuerst eine aktive Reparatur auswählen.');
      return;
    }
    var btn = action === 'complete' ? repairComplete : repairStart;
    var old = btn.textContent;
    btn.disabled = true;
    btn.textContent = action === 'complete' ? 'Wird abgeschlossen...' : 'Wird gestartet...';
    var fd = new FormData();
    fd.append('fahrzeug_id', FZ_ID);
    fd.append('staff_name', String(repairStaff.value || '').trim());
    fd.append('note', String(repairNote.value || '').trim());
    if (action === 'complete') {
      for (var i = 0; i < repairPhotoFiles.length; i += 1) fd.append('fotos', repairPhotoFiles[i]);
    }
    fetch(BASE + '/public/schaeden/' + encodeURIComponent(selectedRepairId) + (action === 'complete' ? '/repair-complete' : '/repair-start'), {
      method: 'POST',
      body: fd,
      headers: { Accept: 'application/json' }
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error((j && j.message) || 'Reparaturstatus konnte nicht gespeichert werden.');
        return j;
      });
    }).then(function () {
      repairDone.hidden = false;
      repairPhotoInput.value = '';
      repairPhotoFiles = [];
      renderRepairPhotoList();
      return refreshVehicle();
    }).catch(function (err) {
      showErr(repairMsg, err && err.message ? err.message : 'Reparaturstatus konnte nicht gespeichert werden.');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = old;
    });
  }

  document.getElementById('close-btn').addEventListener('click', function () {
    if (window.history.length > 1) window.history.back();
    else window.close();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
    b.addEventListener('click', function () {
      setTab(b.getAttribute('data-tab') || 'photos');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-photo-type]'), function (b) {
    b.addEventListener('click', function () {
      selectedPhotoType = b.getAttribute('data-photo-type') || 'left';
      Array.prototype.forEach.call(document.querySelectorAll('[data-photo-type]'), function (x) {
        x.classList.toggle('is-active', x === b);
      });
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-severity]'), function (b) {
    b.addEventListener('click', function () {
      selectedSeverity = b.getAttribute('data-severity') || 'normal';
      Array.prototype.forEach.call(document.querySelectorAll('[data-severity]'), function (x) {
        x.classList.toggle('is-active', x === b);
      });
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('[data-damage-type]'), function (b) {
    b.addEventListener('click', function () {
      selectedDamageType = b.getAttribute('data-damage-type') || 'Unklar';
      Array.prototype.forEach.call(document.querySelectorAll('[data-damage-type]'), function (x) {
        var active = x === b;
        x.classList.toggle('is-active', active);
        x.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
    });
  });

  photoCamera.addEventListener('click', function () {
    photoInput.click();
  });
  photoInput.addEventListener('change', function () {
    var file = photoInput.files && photoInput.files[0];
    if (!file) return;
    photoFiles[selectedPhotoType] = file;
    renderPhotoList();
    photoInput.value = '';
  });
  damagePhotoBtn.addEventListener('click', function () {
    damagePhotoInput.click();
  });
  damagePhotoInput.addEventListener('change', function () {
    var file = damagePhotoInput.files && damagePhotoInput.files[0];
    damagePhotoName.textContent = file ? file.name : 'Kein Foto ausgewählt';
  });

  repairPhotoBtn.addEventListener('click', function () {
    repairPhotoInput.click();
  });
  repairPhotoInput.addEventListener('change', function () {
    var files = repairPhotoInput.files || [];
    for (var i = 0; i < files.length; i += 1) {
      if (repairPhotoFiles.length < 8) repairPhotoFiles.push(files[i]);
    }
    repairPhotoInput.value = '';
    renderRepairPhotoList();
  });
  repairStart.addEventListener('click', function () { submitRepair('start'); });
  repairComplete.addEventListener('click', function () { submitRepair('complete'); });

  refreshVehicle()
    .catch(function () {
      loading.hidden = true;
      showErr(fatal, 'Verbindung fehlgeschlagen.');
    });

  photoSubmit.addEventListener('click', function () {
    showErr(photoMsg, '');
    var keys = Object.keys(photoFiles).filter(function (k) { return photoFiles[k]; });
    if (!keys.length) {
      showErr(photoMsg, 'Bitte zuerst ein Foto aufnehmen oder auswählen.');
      return;
    }
    photoSubmit.disabled = true;
    photoSubmit.textContent = 'Fotos werden gesendet...';
    Promise.all(keys.map(function (k) {
      var fd = new FormData();
      fd.append('part', k);
      fd.append('foto', photoFiles[k]);
      return fetch(BASE + '/public/fahrzeug/' + encodeURIComponent(FZ_ID) + '/fotos', {
        method: 'POST',
        body: fd,
        headers: { Accept: 'application/json' }
      }).then(function (fr) {
        return fr.json().then(function (fj) {
          if (!fr.ok) throw new Error((fj && fj.message) || 'Foto-Upload fehlgeschlagen.');
          return fj;
        });
      });
    })).then(function () {
      photoFiles = {};
      renderPhotoList();
      photoDone.hidden = false;
      photoSubmit.textContent = 'Fotos gespeichert';
    }).catch(function (err) {
      photoSubmit.disabled = false;
      photoSubmit.textContent = '📤 Fotos speichern';
      showErr(photoMsg, err && err.message ? err.message : 'Upload fehlgeschlagen.');
    });
  });

  damageSubmit.addEventListener('click', function () {
    showErr(damageMsg, '');
    var desc = String(damageDesc.value || '').trim();
    var title = String(damageTitle.value || '').trim();
    var file = damagePhotoInput.files && damagePhotoInput.files[0];
    if (!desc) {
      showErr(damageMsg, 'Bitte Schadenbeschreibung eingeben.');
      return;
    }
    if (!file) {
      showErr(damageMsg, 'Bitte ein Schadensfoto aufnehmen oder auswählen.');
      return;
    }
    damageSubmit.disabled = true;
    damageSubmit.textContent = 'Schaden wird gesendet...';
    createReport({
      fahrzeug_id: FZ_ID,
      titel: title || desc.slice(0, 80) || 'Schadenmeldung',
      beschreibung: desc,
      schaden_teil: 'damage_closeup',
      typ: selectedDamageType,
      verursacher: String(damageCause.value || '').trim(),
      prioritaet: selectedSeverity === 'dringend' ? 'dringend' : 'normal',
      schweregrad: selectedSeverity,
      melder_name: String(damageReporter.value || '').trim()
    }, [{ part: 'damage_closeup', file: file }]).then(function () {
      damageDone.hidden = false;
      damageSubmit.textContent = 'Schaden gesendet';
    }).catch(function (err) {
      damageSubmit.disabled = false;
      damageSubmit.textContent = '⚠ Schaden melden';
      showErr(damageMsg, err && err.message ? err.message : 'Meldung fehlgeschlagen.');
    });
  });
})();
  </script>
</body>
</html>`;
}

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 */
export function sendMobileSchadenMeldenPage(req, res) {
  const id = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
  if (!id) {
    return res.status(404).type('text/plain').send('Nicht gefunden');
  }
  res.status(200).type('html').send(buildMobileSchadenMeldenHtml(id));
}

/**
 * @param {object} store
 */
export function createPublicMeldenRouter(store) {
  const router = Router();

  router.get('/fahrzeug/:fahrzeugId', rateLimitPublicFahrzeugGet, async (req, res, next) => {
    try {
      const fid = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
      if (!fid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Fahrzeug-ID.',
        });
      }
      const fz = await store.getFahrzeugById(fid);
      if (!fz) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Fahrzeug nicht gefunden.',
        });
      }
      const project = await store.getProjectById(String(fz.project_id));
      let schaeden = [];
      if (typeof store.listSchaedenForProject === 'function') {
        const rows = await store.listSchaedenForProject(String(fz.project_id));
        schaeden = (Array.isArray(rows) ? rows : [])
          .filter((row) => row && String(row.fahrzeug_id || '') === fid)
          .map((row) => mapPublicSchaden(row))
          .filter((row) => {
            if (!row || !row.id) return false;
            if (row.status === 'erledigt' || row.werkstatt_status === 'fertig') return false;
            return ['termin_bestaetigt', 'in_reparatur'].includes(row.reparatur_phase);
          });
      }
      return res.status(200).json({
        fahrzeug: mapPublicFahrzeug(fz),
        projekt: {
          name: project && project.name != null ? String(project.name) : null,
        },
        schaeden,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/fahrzeug/:fahrzeugId/fotos', rateLimitPublicSchadenPost, multerPublicSchadenFoto, async (req, res, next) => {
    try {
      const fid = typeof req.params.fahrzeugId === 'string' ? req.params.fahrzeugId.trim() : '';
      if (!fid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Fahrzeug-ID.',
        });
      }
      const fz = await store.getFahrzeugById(fid);
      if (!fz) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Fahrzeug nicht gefunden.',
        });
      }
      const files =
        req.files && typeof req.files === 'object'
          ? /** @type {Record<string, { buffer?: Buffer, originalname?: string, mimetype?: string }[]|undefined>} */ (req.files)
          : {};
      const f = (files.foto && files.foto[0]) || (files.file && files.file[0]);
      if (!f || !f.buffer || !Buffer.isBuffer(f.buffer)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Datei erforderlich (multipart-Feld „foto“ oder „file“, Bilddatei).',
        });
      }
      const part = normalizeDamagePart(req.body?.part);
      const fotoId = randomUUID();
      await appendPublicVehiclePhotoToFahrzeug(store, fid, {
        id: fotoId,
        part,
        buffer: f.buffer,
        mimetype: f.mimetype,
        originalname: f.originalname,
      });
      return res.status(201).json({
        ok: true,
        foto: {
          id: fotoId,
          part,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/schaeden', rateLimitPublicSchadenPost, async (req, res, next) => {
    try {
      const rawFz = req.body?.fahrzeug_id;
      if (rawFz == null || typeof rawFz !== 'string' || !rawFz.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „fahrzeug_id“ ist erforderlich.',
        });
      }
      const fahrzeugId = rawFz.trim();
      const fz = await store.getFahrzeugById(fahrzeugId);
      if (!fz) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Fahrzeug nicht gefunden.',
        });
      }
      const projectId = String(fz.project_id);
      if (!projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Fahrzeug ohne Projekt.',
        });
      }

      const titelRaw = req.body?.titel;
      if (typeof titelRaw !== 'string' || !titelRaw.trim()) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Feld „titel“ ist erforderlich.',
        });
      }
      const titel = titelRaw.trim().slice(0, TITEL_MAX);

      let beschreibung = null;
      const beschreibungRaw = req.body?.beschreibung;
      if (beschreibungRaw != null && beschreibungRaw !== '') {
        if (typeof beschreibungRaw !== 'string') {
          return res.status(400).json({
            error: 'VALIDATION_ERROR',
            message: 'Feld „beschreibung“ muss Text sein.',
          });
        }
        const b = beschreibungRaw.trim().slice(0, BESCHREIBUNG_MAX);
        beschreibung = b || null;
      }

      const uploadToken = randomUUID();
      const damagePart = normalizeDamagePart(req.body?.schaden_teil);
      const typ = normalizeDamageType(req.body?.typ);
      const prioritaet = normalizePriority(req.body?.prioritaet);
      const schweregrad = normalizeSeverity(req.body?.schweregrad ?? req.body?.prioritaet);
      const uploadArt = normalizeUploadArt(req.body?.upload_art);
      const melderName = safeText(req.body?.melder_name, 160);
      const verursacher = safeText(req.body?.verursacher, 240);
      const extraJson = JSON.stringify({
        typ,
        prioritaet,
        schweregrad,
        upload_art: uploadArt,
        melder_name: melderName || undefined,
        verursacher: verursacher || undefined,
        schaden_teil: damagePart,
        meldedatum: new Date().toISOString(),
        public_upload_token: uploadToken,
        public_uploads: [],
      });

      const id = randomUUID();
      try {
        await store.insertSchaden({
          id,
          projectId,
          fahrzeugId,
          titel,
          beschreibung,
          status: 'offen',
          extraJson,
        });
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Schaden konnte nicht gespeichert werden.',
        });
      }

      return res.status(201).json({
        ok: true,
        message: 'Schaden erfolgreich gemeldet.',
        upload_token: uploadToken,
        schaden: {
          id,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  function multerPublicSchadenFoto(req, res, next) {
    publicPhotoUpload.fields([
      { name: 'foto', maxCount: 8 },
      { name: 'file', maxCount: 8 },
      { name: 'fotos', maxCount: 8 },
    ])(req, res, (err) => {
      if (err) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: err instanceof Error ? err.message : 'Upload ungültig.',
        });
      }
      next();
    });
  }

  router.post('/schaeden/:schadenId/fotos', rateLimitPublicSchadenPost, multerPublicSchadenFoto, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Ungültige Schaden-ID.',
        });
      }
      const row = await store.getSchadenById(sid);
      if (!row) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Schaden nicht gefunden.',
        });
      }
      const extra = parseJsonObject(row.extra_json);
      const expectedToken = safeText(extra.public_upload_token, 80);
      const gotToken = safeText(req.body?.upload_token, 80);
      if (!expectedToken || gotToken !== expectedToken) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: 'Upload nicht erlaubt.',
        });
      }

      const files =
        req.files && typeof req.files === 'object'
          ? /** @type {Record<string, { buffer?: Buffer, originalname?: string }[]|undefined>} */ (req.files)
          : {};
      const f = (files.foto && files.foto[0]) || (files.file && files.file[0]);
      if (!f || !f.buffer || !Buffer.isBuffer(f.buffer)) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Datei erforderlich (multipart-Feld „foto“ oder „file“, Bilddatei).',
        });
      }
      const projectId = String(row.project_id || '').trim();
      if (!projectId) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Schaden hat keinen Projektkontext; Upload nicht möglich.',
        });
      }

      let rel;
      try {
        const w = writeUploadBufferSync({
          moduleKey: 'schaeden-fotos',
          projectId,
          resourceKey: 'schaden',
          buffer: f.buffer,
          originalName: f.originalname || 'foto.jpg',
        });
        rel = w.relativePath;
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Foto konnte nicht gespeichert werden.',
        });
      }

      const fotoId = randomUUID();
      try {
        await store.insertSchadenFoto({ id: fotoId, schadenId: sid, filePath: rel });
      } catch {
        return res.status(500).json({
          error: 'INTERNAL_ERROR',
          message: 'Foto konnte nicht gespeichert werden.',
        });
      }

      const part = normalizeDamagePart(req.body?.part);
      const uploads = Array.isArray(extra.public_uploads) ? extra.public_uploads.slice(0, 200) : [];
      uploads.push({
        foto_id: fotoId,
        part,
        original_name: safeText(f.originalname, 240),
        uploaded_at: new Date().toISOString(),
      });
      try {
        await store.updateSchaden(sid, { extra: { public_uploads: uploads } });
      } catch {
        /* Photo is saved; metadata is best-effort. */
      }

      const saved = await store.getSchadenFotoById(fotoId);
      return res.status(201).json({
        ok: true,
        foto: {
          id: fotoId,
          part,
          created_at: saved && saved.created_at != null ? String(saved.created_at) : new Date().toISOString(),
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/schaeden/:schadenId/repair-start', rateLimitPublicSchadenPost, multerPublicSchadenFoto, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ungültige Schaden-ID.' });
      const row = await store.getSchadenById(sid);
      if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Schaden nicht gefunden.' });
      const fid = safeText(req.body?.fahrzeug_id, 80);
      if (fid && String(row.fahrzeug_id || '') !== fid) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Schaden gehört nicht zu diesem Fahrzeug.' });
      }
      if (String(row.status || '') === 'erledigt' || String(row.werkstatt_status || '') === 'fertig') {
        return res.status(409).json({ error: 'ALREADY_DONE', message: 'Dieser Schaden ist bereits abgeschlossen.' });
      }
      const now = new Date().toISOString();
      const staffName = safeText(req.body?.staff_name, 160);
      const note = safeText(req.body?.note, 2000);
      const updated = await store.updateSchaden?.(sid, {
        status: 'in_bearbeitung',
        extra: {
          reparatur_phase: 'in_reparatur',
          repair_started_at: now,
          repair_started_by: staffName || null,
          repair_started_note: note || null,
        },
      });
      if (!updated || updated.error) {
        return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Reparatur konnte nicht gestartet werden.' });
      }
      if (typeof store.updateSchadenWerkstatt === 'function') {
        await store.updateSchadenWerkstatt(sid, 'in_arbeit', staffName || 'qr-staff');
      }
      await insertPublicRepairHistory(store, sid, 'staff_repair_started', {
        at: now,
        staff_name: staffName || null,
        note: note || null,
        fahrzeug_id: row.fahrzeug_id || null,
      });
      const fresh = await store.getSchadenById(sid);
      return res.status(200).json({ ok: true, schaden: fresh ? mapPublicSchaden(fresh) : mapPublicSchaden(updated) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/schaeden/:schadenId/repair-complete', rateLimitPublicSchadenPost, multerPublicSchadenFoto, async (req, res, next) => {
    try {
      const sid = typeof req.params.schadenId === 'string' ? req.params.schadenId.trim() : '';
      if (!sid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Ungültige Schaden-ID.' });
      const row = await store.getSchadenById(sid);
      if (!row) return res.status(404).json({ error: 'NOT_FOUND', message: 'Schaden nicht gefunden.' });
      const fid = safeText(req.body?.fahrzeug_id, 80);
      if (fid && String(row.fahrzeug_id || '') !== fid) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Schaden gehört nicht zu diesem Fahrzeug.' });
      }
      if (String(row.status || '') === 'erledigt' || String(row.werkstatt_status || '') === 'fertig') {
        return res.status(409).json({ error: 'ALREADY_DONE', message: 'Dieser Schaden ist bereits abgeschlossen.' });
      }
      const projectId = String(row.project_id || '').trim();
      if (!projectId) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Schaden hat keinen Projektkontext.' });
      }
      const now = new Date().toISOString();
      const staffName = safeText(req.body?.staff_name, 160);
      const note = safeText(req.body?.note, 2000);
      const files = uploadedRepairFiles(req);
      const photoIds = [];
      for (const f of files.slice(0, 8)) {
        let rel;
        try {
          const w = writeUploadBufferSync({
            moduleKey: 'schaeden-fotos',
            projectId,
            resourceKey: 'schaden',
            buffer: f.buffer,
            originalName: f.originalname || 'repair.jpg',
          });
          rel = w.relativePath;
        } catch {
          return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Reparaturfoto konnte nicht gespeichert werden.' });
        }
        const fotoId = randomUUID();
        await store.insertSchadenFoto?.({ id: fotoId, schadenId: sid, filePath: rel });
        photoIds.push(fotoId);
      }
      const extra = parseJsonObject(row.extra_json);
      const previousPhotos = Array.isArray(extra.repair_photo_ids) ? extra.repair_photo_ids.map((x) => String(x)) : [];
      const updated = await store.updateSchaden?.(sid, {
        status: 'erledigt',
        extra: {
          reparatur_phase: 'reparatur_abgeschlossen',
          repair_completed_at: now,
          repair_completed_by: staffName || null,
          repair_completed_note: note || null,
          repair_photo_ids: previousPhotos.concat(photoIds),
        },
      });
      if (!updated || updated.error) {
        return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Reparatur konnte nicht abgeschlossen werden.' });
      }
      if (typeof store.updateSchadenWerkstatt === 'function') {
        await store.updateSchadenWerkstatt(sid, 'fertig', staffName || 'qr-staff');
      }
      await insertPublicRepairHistory(store, sid, 'staff_repair_completed', {
        at: now,
        staff_name: staffName || null,
        note: note || null,
        fahrzeug_id: row.fahrzeug_id || null,
        photo_ids: photoIds,
      });
      const fresh = await store.getSchadenById(sid);
      return res.status(200).json({ ok: true, schaden: fresh ? mapPublicSchaden(fresh) : mapPublicSchaden(updated), photo_ids: photoIds });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
