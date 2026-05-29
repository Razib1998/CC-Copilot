import jwt from 'jsonwebtoken';

/** Kurzlebig (Mobile / Refresh-Flow); überschreibbar via `JWT_ACCESS_TTL_SEC`. */
const DEFAULT_EXPIRES_SEC = 15 * 60;

export function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || !String(secret).trim()) {
    throw new Error('JWT_SECRET ist nicht gesetzt (erforderlich für Auth).');
  }
  return String(secret).trim();
}

export function signAccessToken(payload, expiresInSec = DEFAULT_EXPIRES_SEC) {
  return jwt.sign(payload, getJwtSecret(), {
    algorithm: 'HS256',
    expiresIn: expiresInSec,
    issuer: 'cc-cockpit',
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret(), {
    algorithms: ['HS256'],
    issuer: 'cc-cockpit',
  });
}

export function accessTokenTtlSeconds() {
  const raw = process.env.JWT_EXPIRES_SEC;
  if (raw == null || raw === '') return DEFAULT_EXPIRES_SEC;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_EXPIRES_SEC;
}

/**
 * Access-TTL für Login + Refresh (Priorität: `JWT_ACCESS_TTL_SEC`, sonst `JWT_EXPIRES_SEC`, sonst Default 15 min).
 */
export function accessTokenShortTtlSeconds() {
  const raw = process.env.JWT_ACCESS_TTL_SEC;
  if (raw != null && raw !== '') {
    const n = Number.parseInt(String(raw), 10);
    if (Number.isFinite(n) && n >= 60) return n;
  }
  return accessTokenTtlSeconds();
}
