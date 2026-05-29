/**
 * DEV-ONLY: Lokaler Provision-Modus per Header `x-dev-provision-key`.
 *
 * WARNUNG — Niemals in Production aktivieren:
 * - Nur wenn NODE_ENV nicht "production" ist
 * - Nur wenn process.env.CC_DEV_PROVISION_KEY gesetzt und Länge ≥ 8
 * - Nur bei TCP-Verbindung von Loopback (127.0.0.1 / ::1 / ::ffff:127.0.0.1)
 * - Nur wenn Host-Header fehlt oder localhost/127.0.0.1/::1
 * - Kein Ersatz für echtes JWT — nur wenn kein Authorization: Bearer gesendet wurde
 *
 * Bei Erfolg wird req.auth wie nach JWT gesetzt (Super-Admin-User aus der DB).
 * Production und Strato: alle Bedingungen müssen zutreffen; sonst bleibt der Header wirkungslos.
 */
import crypto from 'node:crypto';
import { extractBearerToken } from './require-auth.js';

const HEADER_NAME = 'x-dev-provision-key';

/**
 * @param {import('express').Request} req
 */
export function isDevProvisionLoopbackRequest(req) {
  const ra = req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  const ip = String(ra);
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
}

/**
 * @param {string|undefined} hostHeader
 */
export function isDevProvisionLocalHostHeader(hostHeader) {
  if (hostHeader == null || String(hostHeader).trim() === '') return true;
  const raw = String(hostHeader).trim();
  const hostOnly = raw.split(':')[0].replace(/^\[/, '').replace(/\]$/, '').toLowerCase();
  return hostOnly === '127.0.0.1' || hostOnly === 'localhost' || hostOnly === '::1';
}

function timingSafeEqualUtf8(a, b) {
  const x = Buffer.from(String(a ?? ''), 'utf8');
  const y = Buffer.from(String(b ?? ''), 'utf8');
  if (x.length !== y.length) {
    try {
      crypto.timingSafeEqual(x, x);
    } catch {
      /* ignore */
    }
    return false;
  }
  return crypto.timingSafeEqual(x, y);
}

/**
 * @param {object} store
 * @returns {Promise<string>}
 */
export async function findDevProvisionSuperAdminUserId(store) {
  const users = await Promise.resolve(store.listUsers());
  const list = Array.isArray(users) ? users : [];
  const sa = list.find((u) => u && String(u.global_role || u.globalRole || '').trim() === 'SUPER_ADMIN');
  if (sa?.id != null) return String(sa.id).trim();
  const first = list.find((u) => u?.id != null);
  return first && first.id != null ? String(first.id).trim() : '';
}

/**
 * Läuft vor requireAuth: setzt req.auth bei gültigem Dev-Provision-Header (nur lokal / non-production).
 *
 * @param {object} store
 * @returns {import('express').RequestHandler}
 */
export function maybeAttachDevProvisionAuth(store) {
  return async (req, res, next) => {
    try {
      if (extractBearerToken(req.headers.authorization)) {
        return next();
      }
      if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
        return next();
      }
      const expected = String(process.env.CC_DEV_PROVISION_KEY || '').trim();
      if (!expected || expected.length < 8) {
        return next();
      }
      if (!isDevProvisionLoopbackRequest(req)) {
        return next();
      }
      if (!isDevProvisionLocalHostHeader(req.get('host'))) {
        return next();
      }
      const got = String(req.get(HEADER_NAME) || '').trim();
      if (!got || !timingSafeEqualUtf8(got, expected)) {
        return next();
      }
      const uid = await findDevProvisionSuperAdminUserId(store);
      if (!uid) {
        return next();
      }
      req.auth = {
        userId: uid,
        email: 'dev-provision@local.invalid',
      };
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
