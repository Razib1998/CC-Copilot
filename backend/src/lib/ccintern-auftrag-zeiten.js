/**
 * CC Intern: Auftrags-Zeitbuchungen in `ccintern_auftraege.bemerkung` (__ccintern_v1.payload.zeiten).
 * Gleiches Format wie Frontend `zeitStop` / `maAuftragsZeitHtml`.
 */

import { parseCcinternBemerkungPayload } from './ccintern-workflow-bemerkung.js';

const BEM_TAG = '{"__ccintern_v1"';

/**
 * @param {Date} d
 * @returns {string}
 */
export function formatZeitbuchungDeHm(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(x.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return (
    pad(x.getDate()) +
    '.' +
    pad(x.getMonth() + 1) +
    '.' +
    x.getFullYear() +
    ' ' +
    pad(x.getHours()) +
    ':' +
    pad(x.getMinutes())
  );
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {string}
 */
export function serializeCcinternBemerkungPayload(payload) {
  return JSON.stringify({ __ccintern_v1: 1, payload: payload || {} });
}

/**
 * @param {Record<string, unknown>} row — ccintern_auftrag_arbeits_session
 * @param {Date} [now]
 * @returns {number}
 */
export function netWorkMinutesFromArbeitsSessionRow(row, now = new Date()) {
  const started = new Date(String(row.started_at || ''));
  if (Number.isNaN(started.getTime())) return 1;
  let pauseSec = Math.max(0, Math.floor(Number(row.pause_seconds ?? 0) || 0));
  if (row.status === 'paused' && row.pause_started_at) {
    const ps = new Date(row.pause_started_at);
    if (!Number.isNaN(ps.getTime())) {
      pauseSec += Math.max(0, Math.floor((now.getTime() - ps.getTime()) / 1000));
    }
  }
  const gross = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  const net = Math.max(0, gross - pauseSec);
  return Math.max(1, Math.round(net / 60));
}

/**
 * @param {Record<string, unknown>} sessionRow
 * @param {{ id?: string, name?: string|null, email?: string|null }} user
 * @param {Date} [now]
 */
export function buildZeitbuchungEntryFromArbeitsSession(sessionRow, user, now = new Date()) {
  const started = new Date(String(sessionRow.started_at || ''));
  const end = now instanceof Date ? now : new Date(now);
  const uid = String(sessionRow.user_id || user?.id || '').trim();
  const name =
    user?.name != null && String(user.name).trim() !== ''
      ? String(user.name).trim()
      : user?.email != null
        ? String(user.email).split('@')[0]
        : uid;
  return {
    step: String(sessionRow.schritt_key || '').trim(),
    wer: name,
    maId: uid,
    start: formatZeitbuchungDeHm(started),
    end: formatZeitbuchungDeHm(end),
    dauer: netWorkMinutesFromArbeitsSessionRow(sessionRow, end),
  };
}

/**
 * @param {string|null|undefined} bemerkung
 * @param {Record<string, unknown>} entry
 * @returns {string}
 */
export function appendZeitbuchungToBemerkung(bemerkung, entry) {
  const raw = bemerkung != null ? String(bemerkung) : '';
  let payload = parseCcinternBemerkungPayload(raw);
  if (!payload || typeof payload !== 'object') {
    if (raw.trim() && !raw.trim().startsWith(BEM_TAG)) {
      payload = { legacyBemerkung: raw.trim() };
    } else {
      payload = {};
    }
  }
  if (!Array.isArray(payload.zeiten)) {
    payload.zeiten = [];
  }
  payload.zeiten.push(entry);
  return serializeCcinternBemerkungPayload(payload);
}

/**
 * Persistiert eine Zeitbuchung beim Stop (Server-first).
 * @param {object} store
 * @param {{ firmaId: string, sessionRow: Record<string, unknown>, user: Record<string, unknown>|null, now?: Date }} opts
 */
export async function persistAuftragZeitbuchungOnStop(store, opts) {
  const firmaId = String(opts.firmaId || '').trim();
  const sessionRow = opts.sessionRow;
  const auftragId = String(sessionRow.auftrag_id || '').trim();
  if (!firmaId || !auftragId) {
    return { ok: false, reason: 'missing_ids' };
  }
  const auftrag = await store.getCcInternAuftragById(auftragId, firmaId);
  if (!auftrag) {
    return { ok: false, reason: 'auftrag_not_found' };
  }
  const user = opts.user;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const entry = buildZeitbuchungEntryFromArbeitsSession(sessionRow, user || {}, now);
  const nextBemerkung = appendZeitbuchungToBemerkung(auftrag.bemerkung, entry);
  const updated = await store.updateCcInternAuftrag(auftragId, firmaId, {
    bemerkung: nextBemerkung,
  });
  if (!updated) {
    return { ok: false, reason: 'update_failed' };
  }
  return { ok: true, entry, zeitenCount: (parseCcinternBemerkungPayload(nextBemerkung)?.zeiten || []).length };
}
