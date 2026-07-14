/**
 * Hilfslogik für CC Intern Arbeitszeit-Session (Tages-Anwesenheit, live).
 */

/**
 * @param {unknown} projectId
 * @returns {string}
 */
export function arbeitszeitProjectKey(projectId) {
  const t = projectId != null ? String(projectId).trim() : '';
  return t || '';
}

/**
 * @param {Date} d
 * @returns {string} HH:MM (de-DE, Europe/Berlin)
 */
export function formatArbeitszeitDeHm(d) {
  return d.toLocaleTimeString('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
  });
}

/**
 * @param {{ status?: string, pause_seconds?: number, pause_started_at?: string|null }} session
 * @param {Date} [now]
 * @returns {number}
 */
export function effectivePauseSeconds(session, now = new Date()) {
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
export function netDurationMinutes(session, now = new Date()) {
  const started = new Date(session?.started_at || '');
  if (Number.isNaN(started.getTime())) return 0;
  const grossSec = Math.max(0, Math.floor((now.getTime() - started.getTime()) / 1000));
  const pauseSec = effectivePauseSeconds(session, now);
  const netSec = Math.max(0, grossSec - pauseSec);
  return netSec > 0 ? Math.ceil(netSec / 60) : 0;
}

/**
 * @param {{ status?: string, pause_seconds?: number, pause_started_at?: string|null }} session
 * @param {Date} [now]
 * @returns {number}
 */
export function pauseMinutesFromSession(session, now = new Date()) {
  return Math.round(effectivePauseSeconds(session, now) / 60);
}

/**
 * @param {any} row
 */
export function mapArbeitszeitSessionRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id ?? null,
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
export function arbeitszeitSessionLogFields(session, now = new Date()) {
  if (!session) {
    return {
      user_id: null,
      project_id: null,
      status: null,
      started_at: null,
      pause_seconds: null,
      pause_started_at: null,
      dauer_minuten: null,
      pause_minuten: null,
    };
  }
  return {
    user_id: session.user_id ?? null,
    project_id: session.project_id ?? null,
    status: session.status ?? null,
    started_at: session.started_at ?? null,
    pause_seconds: Number(session.pause_seconds ?? 0) || 0,
    pause_started_at: session.pause_started_at ?? null,
    dauer_minuten: netDurationMinutes(session, now),
    pause_minuten: pauseMinutesFromSession(session, now),
  };
}
