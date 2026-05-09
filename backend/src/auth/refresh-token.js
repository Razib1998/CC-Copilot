/**
 * Refresh-Token Rohwert (einmal an Client) + SHA-256-Hash in DB (Phase B6).
 */
import { createHash, randomBytes } from 'node:crypto';

export function generateRawRefreshToken() {
  return randomBytes(48).toString('hex');
}

/**
 * @param {string} raw
 */
export function hashRefreshToken(raw) {
  return createHash('sha256').update(String(raw), 'utf8').digest('hex');
}

/** Standard 30 Tage; überschreibbar via `JWT_REFRESH_TTL_SEC`. */
export function refreshTokenTtlSeconds() {
  const raw = process.env.JWT_REFRESH_TTL_SEC;
  if (raw == null || raw === '') return 30 * 24 * 60 * 60;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n >= 300 ? n : 30 * 24 * 60 * 60;
}
