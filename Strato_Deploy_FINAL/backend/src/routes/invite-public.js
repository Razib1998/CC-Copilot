import { Router } from 'express';
import { inviteRowField, parseInviteModulesFromRow, parseInviteRightsFromRow } from '../auth/invite-redeem-normalize.js';
import { hashPassword } from '../auth/password.js';

/** Mindestlänge Aktivierungspasswort: MITARBEITER-App-Rolle kürzer, sonst Standard. */
function minPasswordLenForInvite(invRow) {
  const gr = String(invRow?.global_role ?? '').trim().toUpperCase();
  return gr === 'MITARBEITER' ? 4 : 8;
}

function inviteEffectiveStatus(inv) {
  if (!inv) return null;
  const st = String(inv.status || '');
  if (st !== 'offen') return st;
  const expMs = new Date(String(inv.expires_at)).getTime();
  if (Number.isNaN(expMs) || expMs < Date.now()) return 'abgelaufen';
  return 'offen';
}

function mapInviteForPublicGet(inv) {
  const eff = inviteEffectiveStatus(inv);
  return {
    email: inv.email,
    global_role: String(inv.global_role || 'INTERN'),
    modules: parseInviteModulesFromRow(inviteRowField(inv, 'modules_json')),
    areas: safeJsonArray(inviteRowField(inv, 'areas_json')),
    rights: parseInviteRightsFromRow(inviteRowField(inv, 'rights_json')),
    status: eff,
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  };
}

function activateErrorToHttp(code) {
  switch (code) {
    case 'INVITE_NOT_FOUND':
      return { status: 404, body: { error: 'NOT_FOUND', message: 'Einladung nicht gefunden.' } };
    case 'INVITE_EXPIRED':
      return { status: 410, body: { error: 'INVITE_EXPIRED', message: 'Die Einladung ist abgelaufen.' } };
    case 'INVITE_ALREADY_REDEEMED':
      return { status: 409, body: { error: 'INVITE_ALREADY_REDEEMED', message: 'Die Einladung wurde bereits eingelöst.' } };
    case 'INVITE_REVOKED':
      return { status: 410, body: { error: 'INVITE_REVOKED', message: 'Die Einladung wurde widerrufen.' } };
    case 'INVITE_INVALID_STATE':
      return { status: 400, body: { error: 'VALIDATION_ERROR', message: 'Einladung ist in einem ungültigen Zustand.' } };
    case 'DATABASE_ERROR':
      return { status: 500, body: { error: 'INTERNAL_ERROR', message: 'Aktivierung fehlgeschlagen.' } };
    default:
      return { status: 500, body: { error: 'INTERNAL_ERROR', message: 'Unbekannter Fehler.' } };
  }
}

/**
 * Öffentliche Token-Routen (GET + Erstaktivierung ohne Auth).
 * @param {object} store
 */
export function createInvitePublicRouter(store) {
  const router = Router();

  router.get('/:token', async (req, res, next) => {
    try {
      const token = req.params.token;
      const inv = await store.getCockpitInviteByToken(token);
      if (!inv) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Einladung nicht gefunden.',
        });
      }

      const eff = inviteEffectiveStatus(inv);
      if (eff === 'abgelaufen' && String(inv.status) === 'offen') {
        inv.status = 'abgelaufen';
      }
      return res.status(200).json({ invite: mapInviteForPublicGet(inv) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/:token/activate', async (req, res, next) => {
    try {
      const token = req.params.token;
      const password = req.body?.password;
      const passwordConfirm = req.body?.password_confirm;
      if (typeof password !== 'string' || typeof passwordConfirm !== 'string') {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Passwort und Passwort-Bestätigung sind erforderlich.',
        });
      }
      const invPre = await store.getCockpitInviteByToken(token);
      const minLen = minPasswordLenForInvite(invPre);
      if (invPre && inviteEffectiveStatus(invPre) === 'offen' && password.length < minLen) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: `Passwort muss mindestens ${minLen} Zeichen haben.`,
        });
      }
      if (password !== passwordConfirm) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Passwort und Bestätigung stimmen nicht überein.',
        });
      }
      const result = await store.redeemCockpitInviteAtomic(token, hashPassword(password));
      if (!result.ok) {
        const { status, body } = activateErrorToHttp(result.code);
        return res.status(status).json(body);
      }

      return res.status(200).json({
        ok: true,
        user: result.user ?? null,
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}

function safeJsonArray(json) {
  if (json == null) return [];
  try {
    const a = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function safeJsonObject(json) {
  if (json == null) return {};
  try {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}
