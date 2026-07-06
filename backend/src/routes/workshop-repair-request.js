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
  return `<section>
    <h2>Gespeicherte Antwort</h2>
    <dl>
      <dt>Status</dt><dd>${esc(responseLabel(response.action))}</dd>
      ${date ? `<dt>Neues Datum</dt><dd>${esc(date)}</dd>` : ''}
      ${time ? `<dt>Neue Uhrzeit</dt><dd>${esc(time)}</dd>` : ''}
      ${note ? `<dt>Notiz</dt><dd>${esc(note)}</dd>` : ''}
    </dl>
  </section>`;
}

function renderResponseForm(payload) {
  if (payload.usedAt || payload.expired) {
    return responseSummaryHtml(payload.werkstattResponse);
  }
  return `<section>
    <h2>Antwort</h2>
    <form method="post">
      <label for="action">Antwort</label>
      <select id="action" name="action">
        <option value="accept">Termin akzeptieren</option>
        <option value="counter">Neuen Termin vorschlagen</option>
        <option value="decline">Ablehnen</option>
      </select>
      <div class="row">
        <div><label for="proposed_date">Neues Datum</label><input id="proposed_date" name="proposed_date" type="date"></div>
        <div><label for="proposed_time">Neue Uhrzeit</label><input id="proposed_time" name="proposed_time" placeholder="z.B. 13:00-15:00"></div>
      </div>
      <label for="note">Notiz</label>
      <textarea id="note" name="note" placeholder="Optional"></textarea>
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
  return `<!doctype html>
<html lang="de">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Reparaturtermin beantworten</title>
  <style>
    body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#f6f8fb;color:#172033}
    main{max-width:720px;margin:0 auto;padding:28px 18px 48px}
    section{background:#fff;border:1px solid #dbe3ef;border-radius:10px;padding:18px;margin:0 0 16px}
    h1{font-size:24px;margin:0 0 8px} h2{font-size:16px;margin:0 0 12px}
    dl{display:grid;grid-template-columns:140px 1fr;gap:8px 12px;margin:0} dt{font-weight:700;color:#5b6b82} dd{margin:0}
    label{display:block;font-weight:700;margin:12px 0 6px} input,select,textarea{width:100%;box-sizing:border-box;border:1px solid #cbd5e1;border-radius:8px;padding:10px;font:inherit}
    textarea{min-height:90px}.row{display:grid;grid-template-columns:1fr 1fr;gap:12px}.actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}
    button{border:0;border-radius:8px;padding:11px 16px;font-weight:700;cursor:pointer}.primary{background:#0f766e;color:#fff}.secondary{background:#e0f2fe;color:#075985}.danger{background:#fee2e2;color:#991b1b}
    .msg{background:#ecfdf5;border-color:#86efac;color:#166534}.warn{background:#fff7ed;border-color:#fdba74;color:#9a3412}
  </style>
</head>
<body>
<main>
  <h1>Reparaturtermin beantworten</h1>
  ${message ? `<section class="msg">${esc(message)}</section>` : ''}
  ${reason ? `<section class="warn">${esc(reason)}</section>` : ''}
  <section>
    <h2>Anfrage</h2>
    <dl>
      <dt>Fahrzeug</dt><dd>${esc(payload.fahrzeug)}</dd>
      <dt>Schaden</dt><dd>${esc(payload.titel)}</dd>
      <dt>Schadentyp</dt><dd>${esc(payload.typ)}</dd>
      <dt>Wunschtermin</dt><dd>${esc(ta.wunschdatum_fmt || ta.wunschdatum || '-')}</dd>
      <dt>Uhrzeit</dt><dd>${esc(ta.wunschzeit || '-')}</dd>
      <dt>Werkstatt</dt><dd>${esc(ta.werkstatt || '-')}</dd>
      ${ta.notiz ? `<dt>Notiz</dt><dd>${esc(ta.notiz)}</dd>` : ''}
    </dl>
  </section>
  ${renderResponseForm(payload)}
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
