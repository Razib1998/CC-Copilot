/**
 * Benutzer-API (Cockpit).
 *
 * Passwort-Self-Service („Passwort vergessen“ / E-Mail-Reset): **nicht** vorhanden.
 *
 * Vorhanden: Super-Admin setzt temporäres Kennwort über
 * `POST /users/:userId/reset-password` — Antwort enthält `temporary_password` (bewusst
 * nur für Admin-Workflow; kein Mail-Flow, kein öffentlicher Token-Link).
 */
import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { isValidGlobalRole, isValidModuleKey } from '../auth/rights-spec.js';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { logAudit } from '../lib/audit-log.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight, requireSuperAdmin } from '../middleware/require-rights.js';

export function createUsersRouter(store) {
  const router = Router();

  const benutzerSehen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'benutzer', 'sehen'),
  );

  router.get('/', benutzerSehen, async (req, res, next) => {
    try {
      const rows = await store.listUsers();
      const users = rows.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name ?? null,
        global_role: u.global_role ?? 'INTERN',
        companyId: u.company_id ?? null,
        status: u.status ?? 'aktiv',
        modules:
          u.modules_csv != null && String(u.modules_csv).trim() !== ''
            ? String(u.modules_csv)
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean)
            : [],
        created_at: u.created_at,
      }));
      return sendSuccess(res, 200, { users });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:userId/access', requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid =
        typeof req.params.userId === 'string' && req.params.userId.trim()
          ? req.params.userId.trim()
          : '';
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const gr = req.body?.global_role;
      if (!isValidGlobalRole(gr)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „global_role“ muss SUPER_ADMIN, INTERN oder EXTERN sein.');
      }
      if (!Array.isArray(req.body?.modules)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein Array sein.');
      }
      if (!req.body?.rights || typeof req.body.rights !== 'object') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „rights“ muss ein Objekt sein.');
      }
      const modules = req.body.modules.filter((m) => isValidModuleKey(m));
      await store.replaceUserAccessBundle({
        userId: uid,
        globalRole: gr,
        modules,
        rights: req.body.rights,
      });
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'PATCH',
        resource_type: 'user_access',
        resource_id: uid,
        project_id: null,
        payload: { global_role: gr, modules_count: modules.length },
      });
      return sendSuccess(res, 200, {});
    } catch (e) {
      return next(e);
    }
  });

  router.post('/:userId/lock-toggle', requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid =
        typeof req.params.userId === 'string' && req.params.userId.trim()
          ? req.params.userId.trim()
          : '';
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const now = String(existing.status || 'aktiv').toLowerCase();
      const nextStatus = now === 'deaktiviert' ? 'aktiv' : 'deaktiviert';
      await store.updateUserStatus(uid, nextStatus);
      return sendSuccess(res, 200, { status: nextStatus });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/:userId/reset-password', requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid =
        typeof req.params.userId === 'string' && req.params.userId.trim()
          ? req.params.userId.trim()
          : '';
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const tempPassword = `CC-${randomBytes(6).toString('base64url')}`;
      const passwordHash = await hashPassword(tempPassword);
      await store.updateUserPasswordHash(uid, passwordHash);
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'user_password_reset',
        resource_id: uid,
        project_id: null,
        payload: { issued_temporary_password: true },
      });
      return sendSuccess(res, 200, { temporary_password: tempPassword });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
