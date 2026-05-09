import { randomUUID } from 'node:crypto';
/**
 * Auth: Login, /me.
 *
 * Nächste Validierungs-/Härtungspriorität (ohne Gesamt-Refactor auf Schema-Lib):
 * - Login: Rate-Limit / Lockout optional ergänzen
 * - Öffentliche Routen: `public-melden`, Uploads (`schaeden` Fotos, MesseFlow-Proxy)
 * - Schreib-Endpoints in `api-v1.js` mit hohem Risiko (Rechte, ggf. finanznahe Felder) punktuell verschärfen
 */
import { Router } from 'express';
import { accessTokenShortTtlSeconds, signAccessToken } from '../auth/jwt.js';
import { generateRawRefreshToken, hashRefreshToken, refreshTokenTtlSeconds } from '../auth/refresh-token.js';
import { verifyPassword } from '../auth/password.js';
import { accessProfileToJson, loadAccessProfile } from '../auth/access-profile.js';
import { requireAuth } from '../middleware/require-auth.js';
import { attachAccessProfile } from '../middleware/attach-access-profile.js';

export function createAuthRouter(store) {
  const router = Router();

  router.post('/login', async (req, res, next) => {
    try {
      const email = req.body?.email;
      const password = req.body?.password;
      if (typeof email !== 'string' || typeof password !== 'string') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'E-Mail und Passwort sind erforderlich.',
        });
      }
      const trimmedEmail = email.trim();
      if (!trimmedEmail || !password) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'E-Mail und Passwort sind erforderlich.',
        });
      }

      const row = await store.getUserByEmail(trimmedEmail);
      if (!row || !verifyPassword(password, row.password_hash)) {
        return res.status(401).json({
          error: 'INVALID_CREDENTIALS',
          message: 'E-Mail oder Passwort ist ungültig.',
        });
      }

      const ttl = accessTokenShortTtlSeconds();
      /** @type {'SUPER_ADMIN'|'EXTERN'|'INTERN'} */
      const globalRole =
        row.global_role === 'SUPER_ADMIN' || row.global_role === 'EXTERN' || row.global_role === 'INTERN'
          ? row.global_role
          : 'INTERN';
      const accessToken = signAccessToken(
        { sub: row.id, email: row.email, global_role: globalRole },
        ttl,
      );

      const refreshRaw = generateRawRefreshToken();
      const refreshHash = hashRefreshToken(refreshRaw);
      const deviceId =
        typeof req.body?.device_id === 'string' && req.body.device_id.trim()
          ? req.body.device_id.trim()
          : null;
      const expiresAt = new Date(Date.now() + refreshTokenTtlSeconds() * 1000).toISOString();
      await store.insertRefreshToken({
        id: randomUUID(),
        userId: row.id,
        tokenHash: refreshHash,
        deviceId,
        expiresAt,
      });

      const profile = await loadAccessProfile(store, row.id);
      const ap = accessProfileToJson(profile);

      return res.status(200).json({
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: ttl,
        refresh_token: refreshRaw,
        refresh_expires_in: refreshTokenTtlSeconds(),
        user: {
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          created_at: row.created_at,
          global_role: ap.global_role,
        },
        modules: ap.modules,
        rights: ap.rights,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/my-rights', requireAuth, attachAccessProfile(store), async (req, res, next) => {
    try {
      const ap = accessProfileToJson(req.accessProfile);
      return res.status(200).json({
        user_id: req.auth.userId,
        global_role: ap.global_role,
        modules: ap.modules,
        rights: ap.rights,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/me', requireAuth, attachAccessProfile(store), async (req, res, next) => {
    try {
      const row = await store.getUserById(req.auth.userId);
      if (!row) {
        return res.status(401).json({
          error: 'UNAUTHORIZED',
          message: 'Benutzer nicht gefunden.',
        });
      }
      const ap = accessProfileToJson(req.accessProfile);
      return res.status(200).json({
        user: {
          id: row.id,
          email: row.email,
          name: row.name ?? null,
          created_at: row.created_at,
          global_role: ap.global_role,
          company_id: row.company_id != null && String(row.company_id).trim() !== '' ? String(row.company_id).trim() : null,
        },
        modules: ap.modules,
        rights: ap.rights,
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
