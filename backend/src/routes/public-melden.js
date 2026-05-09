import { randomUUID } from 'node:crypto';
import { Router } from 'express';

const TITEL_MAX = 200;
const BESCHREIBUNG_MAX = 4000;
const RATE_WINDOW_MS = 60_000;
const RATE_MAX_POSTS = 12;

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
  <title>Schaden melden</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f5f5f5; color: #111; }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    .sub { color: #444; margin-bottom: 20px; font-size: 0.95rem; }
    .card { background: #fff; border-radius: 12px; padding: 16px; box-shadow: 0 1px 4px rgba(0,0,0,.08); max-width: 480px; margin: 0 auto; }
    label { display: block; font-weight: 600; margin-top: 12px; margin-bottom: 4px; font-size: 0.9rem; }
    input, textarea { width: 100%; padding: 12px; font-size: 16px; border: 1px solid #ccc; border-radius: 8px; }
    textarea { min-height: 100px; resize: vertical; }
    button[type="submit"] { width: 100%; margin-top: 20px; padding: 14px; font-size: 1.05rem; font-weight: 600; border: none; border-radius: 10px; background: #1a5fb4; color: #fff; cursor: pointer; }
    button[type="submit"]:disabled { opacity: 0.6; cursor: not-allowed; }
    .err { color: #b3261e; margin-top: 12px; font-size: 0.95rem; }
    .ok { color: #0d6832; font-size: 1.1rem; font-weight: 600; text-align: center; padding: 24px 8px; }
    .load { text-align: center; padding: 32px; color: #666; }
    [hidden] { display: none !important; }
  </style>
</head>
<body>
  <div class="card" id="root">
    <p class="load" id="loading">Laden …</p>
    <div id="main" hidden>
      <h1 id="fz-title"></h1>
      <p class="sub" id="proj-line"></p>
      <form id="f">
        <label for="titel">Titel</label>
        <input id="titel" name="titel" type="text" required maxlength="${TITEL_MAX}" autocomplete="off" />
        <label for="beschreibung">Beschreibung (optional)</label>
        <textarea id="beschreibung" name="beschreibung" maxlength="${BESCHREIBUNG_MAX}" autocomplete="off"></textarea>
        <p class="err" id="msg" hidden role="alert"></p>
        <button type="submit" id="btn">Schaden melden</button>
      </form>
      <div id="done" class="ok" hidden>Schaden erfolgreich gemeldet ✅</div>
    </div>
    <p class="err" id="fatal" hidden role="alert"></p>
  </div>
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
  var projLine = document.getElementById('proj-line');
  var form = document.getElementById('f');
  var titel = document.getElementById('titel');
  var beschreibung = document.getElementById('beschreibung');
  var msg = document.getElementById('msg');
  var btn = document.getElementById('btn');
  var done = document.getElementById('done');

  function showErr(el, text) {
    el.textContent = text || '';
    el.hidden = !text;
  }

  fetch(BASE + '/public/fahrzeug/' + encodeURIComponent(FZ_ID), { headers: { Accept: 'application/json' } })
    .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
    .then(function (_ref) {
      var r = _ref.r;
      var j = _ref.j;
      loading.hidden = true;
      if (!r.ok) {
        showErr(fatal, (j && j.message) || 'Fahrzeug nicht gefunden.');
        return;
      }
      var fz = j.fahrzeug || {};
      var pr = j.projekt || {};
      var kn = fz.kennung != null ? String(fz.kennung) : '';
      var typ = fz.typ != null ? String(fz.typ) : '';
      fzTitle.textContent = kn || typ || 'Fahrzeug';
      projLine.textContent = 'Projekt: ' + (pr.name != null ? String(pr.name) : '—');
      main.hidden = false;
    })
    .catch(function () {
      loading.hidden = true;
      showErr(fatal, 'Verbindung fehlgeschlagen.');
    });

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    showErr(msg, '');
    var t = String(titel.value || '').trim();
    if (!t) {
      showErr(msg, 'Bitte Titel eingeben.');
      return;
    }
    btn.disabled = true;
    var body = { fahrzeug_id: FZ_ID, titel: t };
    var b = String(beschreibung.value || '').trim();
    if (b) body.beschreibung = b;
    fetch(BASE + '/public/schaeden', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
      .then(function (r) { return r.json().then(function (j) { return { r: r, j: j }; }); })
      .then(function (_ref2) {
        var r = _ref2.r;
        var j = _ref2.j;
        btn.disabled = false;
        if (!r.ok) {
          showErr(msg, (j && j.message) || 'Meldung fehlgeschlagen.');
          return;
        }
        form.hidden = true;
        done.hidden = false;
      })
      .catch(function () {
        btn.disabled = false;
        showErr(msg, 'Netzwerkfehler.');
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
      return res.status(200).json({
        fahrzeug: {
          kennung: fz.kennung != null ? String(fz.kennung) : '',
          typ: fz.typ != null ? String(fz.typ) : '',
        },
        projekt: {
          name: project && project.name != null ? String(project.name) : null,
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

      const id = randomUUID();
      try {
        await store.insertSchaden({
          id,
          projectId,
          fahrzeugId,
          titel,
          beschreibung,
          status: 'offen',
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
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
