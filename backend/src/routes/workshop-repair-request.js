import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { hashRepairAppointmentToken } from '../lib/repair-appointment-email.js';

function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function parseJson(raw) {
  if (raw == null || raw === '') return {};
  try {
    const o = JSON.parse(String(raw));
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

function pick(v, max = 1000) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function tokenFromReq(req) {
  return pick(req.params.token, 300);
}

function isExpired(row) {
  const t = Date.parse(String(row?.expires_at || ''));
  return Number.isFinite(t) && t < Date.now();
}

function publicPayload(row) {
  const extra = parseJson(row.extra_json);
  const ta = extra.terminanfrage && typeof extra.terminanfrage === 'object' ? extra.terminanfrage : {};
  return {
    tokenId: row.id,
    schadenId: row.schaden_id,
    fahrzeug: row.fahrzeug_kennung || row.fahrzeug_id || '-',
    titel: row.titel || '-',
    beschreibung: row.beschreibung || '',
    typ: extra.typ || '-',
    terminanfrage: ta,
    werkstattResponse: extra.werkstatt_response && typeof extra.werkstatt_response === 'object' ? extra.werkstatt_response : null,
    usedAt: row.used_at || null,
    expired: isExpired(row),
  };
}

function responseLabel(action) {
  if (action === 'counter') return 'Neuer Termin vorgeschlagen';
  if (action === 'decline') return 'Termin abgelehnt';
  return 'Termin akzeptiert';
}

function responseSummaryHtml(response) {
  if (!response || typeof response !== 'object') return '';
  const date = response.proposed_date || null;
  const time = response.proposed_time || null;
  const note = response.note || null;
  return `<section class="card">
    <div class="section-head">
      <span class="section-kicker">Antwortstatus</span>
      <h2>Gespeicherte Antwort</h2>
    </div>
    <div class="response-summary">
      <div class="response-icon">OK</div>
      <div>
        <div class="response-title">${esc(responseLabel(response.action))}</div>
        <div class="meta-grid compact">
          ${date ? `<div><span>Neues Datum</span><strong>${esc(date)}</strong></div>` : ''}
          ${time ? `<div><span>Neue Uhrzeit</span><strong>${esc(time)}</strong></div>` : ''}
          ${note ? `<div class="wide"><span>Notiz</span><strong>${esc(note)}</strong></div>` : ''}
        </div>
      </div>
    </div>
  </section>`;
}

function renderResponseForm(payload) {
  if (payload.usedAt || payload.expired) {
    return responseSummaryHtml(payload.werkstattResponse);
  }
  return `<section class="card">
    <div class="section-head">
      <span class="section-kicker">Werkstatt</span>
      <h2>Termin beantworten</h2>
      <p>Bitte bestaetigen Sie den Termin oder schlagen Sie einen passenden Ersatztermin vor.</p>
    </div>
    <form method="post">
      <div class="field">
        <label for="action">Antwort</label>
        <select id="action" name="action">
          <option value="accept">Termin akzeptieren</option>
          <option value="counter">Neuen Termin vorschlagen</option>
          <option value="decline">Ablehnen</option>
        </select>
      </div>
      <div class="row">
        <div class="field"><label for="proposed_date">Neues Datum</label><input id="proposed_date" name="proposed_date" type="date"></div>
        <div class="field"><label for="proposed_time">Neue Uhrzeit</label><input id="proposed_time" name="proposed_time" placeholder="z.B. 13:00-15:00"></div>
      </div>
      <div class="field">
        <label for="note">Notiz</label>
        <textarea id="note" name="note" placeholder="Optional, z.B. Rueckfrage, Ersatztermin oder interner Hinweis"></textarea>
      </div>
      <div class="actions">
        <button class="primary" type="submit">Antwort senden</button>
      </div>
    </form>
  </section>`;
}

function renderPage(payload, options = {}) {
  const { message = '', justSubmitted = false } = typeof options === 'string' ? { message: options } : options;
  const ta = payload.terminanfrage || {};
  const reason = payload.expired ? 'Dieser Link ist abgelaufen.' : payload.usedAt && !justSubmitted ? 'Diese Anfrage wurde bereits beantwortet.' : '';
  const requestStatus = payload.expired ? 'Abgelaufen' : payload.usedAt ? 'Beantwortet' : 'Offen';
  const statusClass = payload.expired ? 'expired' : payload.usedAt ? 'done' : 'open';
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reparaturtermin beantworten</title>
  <style>
    *{box-sizing:border-box}
    :root{color-scheme:light;--bg:#eef3f8;--ink:#121b2f;--muted:#607089;--card:#fff;--line:#d8e2ef;--top:#0f172a;--accent:#0f766e;--accent2:#ea9f1a;--soft:#f8fafc;--danger:#b42318}
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:var(--bg);color:var(--ink)}
    .top{background:var(--top);color:#fff;padding:22px 18px 56px}
    .top-inner{max-width:980px;margin:0 auto;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .brand{display:flex;align-items:center;gap:14px;min-width:0}
    .logo{width:50px;height:50px;border-radius:12px;background:var(--accent2);color:#1d1204;display:grid;place-items:center;font-weight:900}
    .brand-title{font-size:25px;font-weight:900;line-height:1.05}
    .brand-sub{color:#cbd5e1;margin-top:3px;font-size:14px}
    .status-pill{border:1px solid rgba(255,255,255,.22);border-radius:999px;padding:9px 14px;font-weight:800;white-space:nowrap}
    .status-pill.open{background:#123f3c;color:#a7f3d0}.status-pill.done{background:#132d4f;color:#bfdbfe}.status-pill.expired{background:#4c1d1d;color:#fecaca}
    main{max-width:980px;margin:-34px auto 0;padding:0 18px 44px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr) 360px;gap:18px;align-items:start}
    .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:24px;box-shadow:0 14px 36px rgba(15,23,42,.08);margin:0 0 18px}
    .section-head{margin-bottom:18px}.section-kicker{display:block;color:var(--accent);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;margin-bottom:6px}
    h1,h2,p{margin:0}h2{font-size:22px;line-height:1.15}.section-head p{color:var(--muted);font-size:14px;line-height:1.45;margin-top:7px}
    .request-title{font-size:28px;font-weight:900;line-height:1.12;margin-bottom:8px}.request-sub{color:var(--muted);font-size:15px;line-height:1.45}
    .hero-card{border-left:5px solid var(--accent2)}
    .meta-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
    .meta-grid.compact{margin-top:14px}.meta-grid .wide{grid-column:1/-1}
    .meta-grid div{background:var(--soft);border:1px solid #e4ebf5;border-radius:11px;padding:13px 14px;min-width:0}
    .meta-grid span{display:block;color:var(--muted);font-size:12px;font-weight:800;margin-bottom:5px;text-transform:uppercase;letter-spacing:.04em}
    .meta-grid strong{display:block;color:var(--ink);font-size:16px;line-height:1.35;word-break:break-word}
    .description{margin-top:14px;border:1px solid #e4ebf5;border-radius:11px;padding:14px;background:#fff;color:#334155;line-height:1.5}
    .field{margin-bottom:14px}label{display:block;font-weight:850;margin:0 0 7px;color:#243047}
    input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:10px;background:#fff;color:var(--ink);padding:12px 13px;font:inherit;outline:none}
    input:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px rgba(15,118,110,.14)}
    textarea{min-height:104px;resize:vertical}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    .actions{display:flex;justify-content:flex-end;margin-top:8px}button{border:0;border-radius:11px;padding:13px 18px;font-weight:900;cursor:pointer;font:inherit}
    .primary{background:var(--accent);color:#fff;min-width:180px}.primary:hover{background:#0d665f}
    .notice{border-radius:12px;padding:14px 16px;margin:0 0 18px;font-weight:800;border:1px solid}
    .msg{background:#ecfdf5;border-color:#86efac;color:#166534}.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}
    .response-summary{display:grid;grid-template-columns:58px 1fr;gap:15px;align-items:start}
    .response-icon{width:58px;height:58px;border-radius:14px;background:#dcfce7;color:#166534;display:grid;place-items:center;font-weight:950}
    .response-title{font-size:20px;font-weight:900;margin-top:2px}
    .side-note{background:#0f172a;color:#e2e8f0;border-radius:14px;padding:20px;border:1px solid rgba(255,255,255,.08)}
    .side-note h2{font-size:18px;margin-bottom:10px}.side-note p{color:#b6c2d4;line-height:1.5;font-size:14px}
    @media (max-width:820px){.top{padding-bottom:44px}.top-inner{align-items:flex-start}.layout{grid-template-columns:1fr}.meta-grid{grid-template-columns:1fr}.row{grid-template-columns:1fr}.status-pill{font-size:13px}.brand-title{font-size:22px}.request-title{font-size:24px}.card{padding:18px}}
  </style>
</head>
<body>
<header class="top">
  <div class="top-inner">
    <div class="brand">
      <div class="logo">CC</div>
      <div>
        <div class="brand-title">Reparaturtermin beantworten</div>
        <div class="brand-sub">Werkstatt-Rueckmeldung fuer FUSA Cockpit</div>
      </div>
    </div>
    <div class="status-pill ${statusClass}">${esc(requestStatus)}</div>
  </div>
</header>
<main>
  ${message ? `<div class="notice msg">${esc(message)}</div>` : ''}
  ${reason ? `<div class="notice warn">${esc(reason)}</div>` : ''}
  <div class="layout">
    <div>
      <section class="card hero-card">
        <span class="section-kicker">Anfrage</span>
        <div class="request-title">${esc(payload.fahrzeug)}</div>
        <p class="request-sub">${esc(payload.titel)} · ${esc(payload.typ)}</p>
        <div class="meta-grid" style="margin-top:18px">
          <div><span>Wunschtermin</span><strong>${esc(ta.wunschdatum_fmt || ta.wunschdatum || '-')}</strong></div>
          <div><span>Uhrzeit</span><strong>${esc(ta.wunschzeit || '-')}</strong></div>
          <div><span>Werkstatt</span><strong>${esc(ta.werkstatt || '-')}</strong></div>
          <div><span>Status</span><strong>${esc(requestStatus)}</strong></div>
        </div>
        ${payload.beschreibung ? `<div class="description"><strong>Beschreibung:</strong><br>${esc(payload.beschreibung)}</div>` : ''}
        ${ta.notiz ? `<div class="description"><strong>Notiz zur Anfrage:</strong><br>${esc(ta.notiz)}</div>` : ''}
      </section>
      ${renderResponseForm(payload)}
    </div>
    <aside class="side-note">
      <h2>Hinweis</h2>
      <p>Ihre Antwort wird direkt im Cockpit gespeichert. Nach dem Absenden ist dieser Link fuer weitere Antworten gesperrt.</p>
    </aside>
  </div>
</main>
</body>
</html>`;
}

export function createWorkshopRepairRequestRouter(store) {
  const router = Router();

  router.get('/repair-request/:token', async (req, res, next) => {
    try {
      const token = tokenFromReq(req);
      const row = token ? await store.getRepairAppointmentTokenByHash?.(hashRepairAppointmentToken(token)) : null;
      if (!row) return res.status(404).type('html').send(renderPage({ terminanfrage: {}, expired: true }, 'Anfrage nicht gefunden.'));
      return res.status(200).type('html').send(renderPage(publicPayload(row)));
    } catch (e) {
      next(e);
    }
  });

  router.post('/repair-request/:token', async (req, res, next) => {
    try {
      const token = tokenFromReq(req);
      const row = token ? await store.getRepairAppointmentTokenByHash?.(hashRepairAppointmentToken(token)) : null;
      if (!row) return res.status(404).type('html').send(renderPage({ terminanfrage: {}, expired: true }, 'Anfrage nicht gefunden.'));
      const payload = publicPayload(row);
      if (payload.expired || payload.usedAt) return res.status(409).type('html').send(renderPage(payload));

      const actionRaw = pick(req.body?.action, 40);
      const action = ['accept', 'counter', 'decline'].includes(actionRaw) ? actionRaw : 'accept';
      const proposedDate = pick(req.body?.proposed_date, 32);
      const proposedTime = pick(req.body?.proposed_time, 80);
      const note = pick(req.body?.note, 2000);
      if (action === 'counter' && !proposedDate) {
        return res.status(400).type('html').send(renderPage(payload, 'Bitte ein neues Datum eintragen.'));
      }
      const event = {
        action,
        proposed_date: action === 'counter' ? proposedDate : null,
        proposed_time: action === 'counter' ? proposedTime || null : null,
        note: note || null,
        responded_at: new Date().toISOString(),
      };
      await store.insertSchadenHistory?.({
        id: randomUUID(),
        schadenId: row.schaden_id,
        eventType: action === 'accept' ? 'workshop_accepted' : action === 'counter' ? 'workshop_counter_proposed' : 'workshop_declined',
        createdByType: 'workshop',
        event,
      });
      const patchExtra =
        action === 'accept'
          ? { reparatur_phase: 'termin_bestaetigt', werkstatt_response: event }
          : action === 'counter'
            ? { reparatur_phase: 'termin_vorschlag', werkstatt_response: event }
            : { reparatur_phase: 'geplant', werkstatt_response: event };
      const patchStatus = action === 'decline' ? 'offen' : 'in_bearbeitung';
      await store.updateSchaden?.(row.schaden_id, { status: patchStatus, extra: patchExtra });
      await store.markRepairAppointmentTokenResponded?.(row.id);
      const next = { ...payload, usedAt: new Date().toISOString(), werkstattResponse: event };
      return res.status(200).type('html').send(renderPage(next, { message: 'Vielen Dank. Ihre Antwort wurde gespeichert.', justSubmitted: true }));
    } catch (e) {
      next(e);
    }
  });

  return router;
}
