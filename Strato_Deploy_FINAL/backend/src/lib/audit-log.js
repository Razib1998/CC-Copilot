import { randomUUID } from 'node:crypto';

/** Schlüssel/Wortteile: nie im Audit-Payload speichern */
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'auth_header',
  'bearer',
  'cookie',
  'api_key',
  'apikey',
];

const MAX_PAYLOAD_CHARS = 8000;

/**
 * @param {string} key
 */
function isSensitiveKey(key) {
  const k = String(key || '').toLowerCase();
  if (!k) return false;
  for (const frag of SENSITIVE_KEY_FRAGMENTS) {
    if (k.includes(frag)) return true;
  }
  return false;
}

/**
 * Rekursiv bereinigen, Tiefe und Listen begrenzen — keine Secrets.
 * @param {unknown} payload
 * @param {number} depth
 * @returns {unknown}
 */
export function sanitizeAuditPayload(payload, depth = 0) {
  if (depth > 8) return '[max-depth]';
  if (payload == null) return null;
  const t = typeof payload;
  if (t === 'string') {
    const s = payload.length > 4000 ? `${payload.slice(0, 4000)}…` : payload;
    return s;
  }
  if (t === 'number' || t === 'boolean') return payload;
  if (Array.isArray(payload)) {
    return payload.slice(0, 64).map((x) => sanitizeAuditPayload(x, depth + 1));
  }
  if (t === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    let n = 0;
    for (const [k, v] of Object.entries(/** @type {Record<string, unknown>} */ (payload))) {
      if (isSensitiveKey(k)) continue;
      if (n++ >= 48) break;
      out[k] = sanitizeAuditPayload(v, depth + 1);
    }
    return out;
  }
  return String(payload).slice(0, 500);
}

/**
 * @param {unknown} user
 * @returns {string|null}
 */
function resolveUserId(user) {
  if (user == null) return null;
  if (typeof user === 'string') {
    const t = user.trim();
    return t || null;
  }
  if (typeof user === 'object') {
    const o = /** @type {Record<string, unknown>} */ (user);
    if (typeof o.userId === 'string' && o.userId.trim()) return o.userId.trim();
    if (typeof o.id === 'string' && o.id.trim()) return o.id.trim();
  }
  return null;
}

/**
 * Persistiert einen Audit-Eintrag. Fehler unterdrücken — Hauptaktion darf nie scheitern.
 * @param {object} store mit insertAuditLog
 * @param {{ user?: unknown, modul: string, action: string, resource_type?: string|null, resource_id?: string|null, project_id?: string|null, payload?: unknown }} opts
 */
export async function logAudit(store, opts) {
  const {
    user,
    modul,
    action,
    resource_type,
    resource_id,
    project_id,
    payload,
  } = opts || {};

  let payloadJson = null;
  try {
    const safe = sanitizeAuditPayload(payload);
    if (safe !== undefined && safe !== null) {
      payloadJson = JSON.stringify(safe);
      if (payloadJson.length > MAX_PAYLOAD_CHARS) {
        payloadJson = JSON.stringify({
          _truncated: true,
          preview: `${payloadJson.slice(0, MAX_PAYLOAD_CHARS - 120)}…`,
        });
      }
    }
  } catch {
    payloadJson = JSON.stringify({ _error: 'sanitize_failed' });
  }

  const row = {
    id: randomUUID(),
    ts: new Date().toISOString(),
    userId: resolveUserId(user),
    modul: String(modul || 'unknown').slice(0, 120),
    action: String(action || 'unknown').slice(0, 120),
    resourceType: resource_type != null ? String(resource_type).slice(0, 120) : null,
    resourceId: resource_id != null ? String(resource_id).slice(0, 200) : null,
    projectId: project_id != null ? String(project_id).slice(0, 120) : null,
    payloadJson,
  };

  try {
    if (typeof store?.insertAuditLog !== 'function') {
      console.warn('[audit-log] store.insertAuditLog fehlt');
      return;
    }
    await store.insertAuditLog(row);
  } catch (e) {
    console.warn('[audit-log] insertAuditLog:', e instanceof Error ? e.message : e);
  }
}
