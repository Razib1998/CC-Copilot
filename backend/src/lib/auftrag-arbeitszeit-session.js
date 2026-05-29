/**
 * Hilfslogik für CC Intern Auftrags-Arbeits-Session (Mitarbeiter-App, live).
 */

export const AUFTRAG_ARBEITS_STATUS_ACTIVE = new Set(['running', 'paused']);
export const AUFTRAG_ARBEITS_STATUS_STOPPED = 'stopped';

/**
 * @param {Date} [now]
 * @param {{ status?: string, pause_seconds?: number, pause_started_at?: string|null }} session
 * @returns {number}
 */
export function auftragArbeitsEffectivePauseSeconds(session, now = new Date()) {
  let total = Math.max(0, Math.floor(Number(session?.pause_seconds ?? 0) || 0));
  if (session?.status === 'paused' && session.pause_started_at) {
    const ps = new Date(session.pause_started_at);
    if (!Number.isNaN(ps.getTime())) {
      total += Math.max(0, Math.floor((now.getTime() - ps.getTime()) / 1000));
    }
  }
  return total;
}

/**
 * @param {{ started_at?: string, status?: string, pause_seconds?: number, pause_started_at?: string|null }} session
 * @param {Date} [now]
 * @returns {number}
 */
export function auftragArbeitsElapsedSeconds(session, now = new Date()) {
  const started = new Date(session?.started_at || '');
  if (Number.isNaN(started.getTime())) return 0;
  const gross = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  return Math.max(0, gross - auftragArbeitsEffectivePauseSeconds(session, now));
}

/**
 * @param {any} row
 */
export function mapAuftragArbeitsSessionRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    auftrag_id: row.auftrag_id,
    schritt_key: row.schritt_key,
    status: row.status,
    started_at: row.started_at,
    pause_seconds: Number(row.pause_seconds ?? 0) || 0,
    pause_started_at: row.pause_started_at ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {any} session
 * @param {Date} [now]
 */
export function auftragArbeitsSessionLogFields(session, now = new Date()) {
  if (!session) {
    return {
      user_id: null,
      auftrag_id: null,
      schritt_key: null,
      status: null,
      started_at: null,
      pause_seconds: null,
      pause_started_at: null,
      elapsed_seconds: null,
    };
  }
  return {
    user_id: session.user_id ?? null,
    auftrag_id: session.auftrag_id ?? null,
    schritt_key: session.schritt_key ?? null,
    status: session.status ?? null,
    started_at: session.started_at ?? null,
    pause_seconds: Number(session.pause_seconds ?? 0) || 0,
    pause_started_at: session.pause_started_at ?? null,
    elapsed_seconds: auftragArbeitsElapsedSeconds(session, now),
  };
}
