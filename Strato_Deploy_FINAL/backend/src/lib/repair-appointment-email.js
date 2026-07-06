import { createHash, randomBytes, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

const DEFAULT_TOKEN_TTL_DAYS = 30;

function text(v, max = 4000) {
  if (v == null) return '';
  const s = String(v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

export function hashRepairAppointmentToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

function publicBaseUrl(req) {
  const env =
    text(process.env.PUBLIC_API_BASE_URL, 500) ||
    text(process.env.API_BASE_URL, 500) ||
    text(process.env.PUBLIC_APP_BASE_URL, 500) ||
    text(process.env.APP_BASE_URL, 500);
  if (env) return env.replace(/\/+$/, '');
  const proto = text(req?.headers?.['x-forwarded-proto'], 40) || req?.protocol || 'http';
  const host = text(req?.headers?.['x-forwarded-host'], 300) || text(req?.headers?.host, 300);
  return host ? `${proto}://${host}` : '';
}

function formatDateDisplay(terminanfrage) {
  return text(terminanfrage?.wunschdatum_fmt, 200) || text(terminanfrage?.wunschdatum, 80) || '-';
}

function buildSmtpTransport() {
  const host = text(process.env.SMTP_HOST, 300);
  const port = Number.parseInt(text(process.env.SMTP_PORT, 20) || '587', 10);
  const user = text(process.env.SMTP_USER, 320);
  const pass = process.env.SMTP_PASS != null ? String(process.env.SMTP_PASS) : '';
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port: Number.isFinite(port) ? port : 587,
    secure: text(process.env.SMTP_SECURE, 20) === 'true' || text(process.env.SMTP_SECURE, 20) === '1',
    auth: { user, pass },
  });
}

async function sendOutboxMail(store, outboxRow) {
  const mode = text(process.env.EMAIL_SEND_MODE, 40).toLowerCase();
  if (mode === 'disabled') {
    return store.markEmailOutboxFailed?.(outboxRow.id, 'EMAIL_SEND_MODE=disabled');
  }
  const transport = mode === 'log' ? null : buildSmtpTransport();
  if (mode === 'smtp' && !transport) {
    return store.markEmailOutboxFailed?.(
      outboxRow.id,
      'SMTP ist nicht vollstaendig konfiguriert: SMTP_HOST, SMTP_USER und SMTP_PASS sind erforderlich.',
    );
  }
  if (!transport) {
    console.log('[email:log]', {
      to: outboxRow.to_email,
      subject: outboxRow.subject,
      body: outboxRow.body_text,
    });
    return store.markEmailOutboxSent?.(outboxRow.id);
  }
  try {
    await transport.sendMail({
      from: outboxRow.from_email || text(process.env.SMTP_FROM, 320) || text(process.env.SMTP_USER, 320),
      to: outboxRow.to_email,
      subject: outboxRow.subject,
      text: outboxRow.body_text,
      html: outboxRow.body_html || undefined,
    });
    return store.markEmailOutboxSent?.(outboxRow.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.markEmailOutboxFailed?.(outboxRow.id, msg);
    throw e;
  }
}

export async function createAndSendRepairAppointmentEmail({ store, req, schaden, terminanfrage }) {
  if (!store || !schaden || !terminanfrage) return null;
  if (
    typeof store.insertEmailOutbox !== 'function' ||
    typeof store.insertRepairAppointmentToken !== 'function' ||
    typeof store.insertSchadenHistory !== 'function'
  ) {
    return null;
  }

  const toEmail = text(terminanfrage.empfaenger, 320);
  if (!toEmail || !toEmail.includes('@')) {
    await store.insertSchadenHistory({
      schadenId: schaden.id,
      eventType: 'repair_email_skipped',
      createdByType: 'system',
      event: { reason: 'missing_recipient', terminanfrage },
    });
    return { skipped: true, reason: 'missing_recipient' };
  }

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashRepairAppointmentToken(token);
  const ttlDays = Number.parseInt(text(process.env.REPAIR_APPOINTMENT_TOKEN_TTL_DAYS, 20), 10);
  const expires = new Date();
  expires.setDate(expires.getDate() + (Number.isFinite(ttlDays) && ttlDays > 0 ? ttlDays : DEFAULT_TOKEN_TTL_DAYS));
  const base = publicBaseUrl(req);
  const responseUrl = `${base}/public/repair-request/${encodeURIComponent(token)}`;
  const fz = text(schaden.fahrzeug_kennung || schaden.fahrzeug_id, 200) || '-';
  const typ = text(schaden.typ, 80) || '-';
  const title = text(schaden.titel, 300) || '-';
  const dateDisplay = formatDateDisplay(terminanfrage);
  const timeDisplay = text(terminanfrage.wunschzeit, 120) || '-';
  const subject = `Reparaturtermin anfragen - ${fz}`;
  const bodyText = [
    'Guten Tag,',
    '',
    'bitte pruefen Sie den folgenden Reparaturtermin:',
    '',
    `Fahrzeug: ${fz}`,
    `Schaden: ${title}`,
    `Schadentyp: ${typ}`,
    `Wunschtermin: ${dateDisplay}`,
    `Uhrzeit: ${timeDisplay}`,
    terminanfrage.notiz ? `Notiz: ${text(terminanfrage.notiz, 1000)}` : '',
    '',
    'Bitte antworten Sie ueber diesen Link:',
    responseUrl,
    '',
    'Sie koennen den Termin akzeptieren oder einen neuen Termin vorschlagen.',
  ]
    .filter((line) => line !== '')
    .join('\n');
  const bodyHtml = bodyText.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]).replace(/\n/g, '<br>');

  const outbox = await store.insertEmailOutbox({
    id: randomUUID(),
    type: 'repair_appointment_request',
    relatedType: 'schaden',
    relatedId: schaden.id,
    toEmail,
    fromEmail: text(process.env.SMTP_FROM, 320) || null,
    subject,
    bodyText,
    bodyHtml,
    status: 'pending',
  });
  const tokenRow = await store.insertRepairAppointmentToken({
    id: randomUUID(),
    schadenId: schaden.id,
    tokenHash,
    emailOutboxId: outbox.id,
    expiresAt: expires.toISOString(),
  });
  await store.insertSchadenHistory({
    schadenId: schaden.id,
    eventType: 'repair_request_email_created',
    createdByType: 'admin',
    event: { terminanfrage, toEmail, responseUrl, outboxId: outbox.id, tokenId: tokenRow.id, expiresAt: expires.toISOString() },
  });

  try {
    const sent = await sendOutboxMail(store, outbox);
    await store.insertSchadenHistory({
      schadenId: schaden.id,
      eventType: 'repair_request_email_sent',
      createdByType: 'system',
      event: { outboxId: outbox.id, status: sent?.status || 'sent', toEmail },
    });
    return { outbox: sent || outbox, token: tokenRow, responseUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await store.insertSchadenHistory({
      schadenId: schaden.id,
      eventType: 'repair_request_email_failed',
      createdByType: 'system',
      event: { outboxId: outbox.id, toEmail, error: msg },
    });
    return { outbox, token: tokenRow, responseUrl, error: msg };
  }
}
