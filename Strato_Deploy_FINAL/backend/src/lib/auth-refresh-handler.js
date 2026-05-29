/**
 * POST /api/v1/auth/refresh — Access neu ausstellen, Refresh rotieren (Phase B6).
 */
import { signAccessToken } from '../auth/jwt.js';
import { generateRawRefreshToken, hashRefreshToken, refreshTokenTtlSeconds } from '../auth/refresh-token.js';
import { accessTokenShortTtlSeconds } from '../auth/jwt.js';
import { sendError, sendSuccess } from './api-v1-envelope.js';
import { randomUUID } from 'node:crypto';

/**
 * @param {{ findValidRefreshTokenByHash: Function, revokeRefreshTokenById: Function, insertRefreshToken: Function, getUserById: Function }} store
 */
export async function handleAuthRefresh(store, req, res) {
  const raw = req.body?.refresh_token;
  if (typeof raw !== 'string' || !raw.trim()) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'refresh_token fehlt.');
  }
  const tokenHash = hashRefreshToken(raw.trim());
  const row = await store.findValidRefreshTokenByHash(tokenHash);
  if (!row) {
    return sendError(res, 401, 'INVALID_REFRESH_TOKEN', 'Ungültiger Refresh-Token.');
  }
  const user = await store.getUserById(row.user_id);
  if (!user) {
    return sendError(res, 401, 'INVALID_REFRESH_TOKEN', 'Ungültiger Refresh-Token.');
  }

  await store.revokeRefreshTokenById(row.id);

  const ttl = accessTokenShortTtlSeconds();
  /** @type {'SUPER_ADMIN'|'EXTERN'|'INTERN'} */
  const globalRole =
    user.global_role === 'SUPER_ADMIN' || user.global_role === 'EXTERN' || user.global_role === 'INTERN'
      ? user.global_role
      : 'INTERN';
  const accessToken = signAccessToken({ sub: user.id, email: user.email, global_role: globalRole }, ttl);

  const newRaw = generateRawRefreshToken();
  const newHash = hashRefreshToken(newRaw);
  const expMs = Date.now() + refreshTokenTtlSeconds() * 1000;
  const expiresAt = new Date(expMs).toISOString();
  await store.insertRefreshToken({
    id: randomUUID(),
    userId: user.id,
    tokenHash: newHash,
    deviceId: row.device_id != null && String(row.device_id).trim() ? String(row.device_id).trim() : null,
    expiresAt,
  });

  return sendSuccess(res, 200, {
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: ttl,
    refresh_token: newRaw,
    refresh_expires_in: refreshTokenTtlSeconds(),
  });
}
