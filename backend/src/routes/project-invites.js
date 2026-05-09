import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  defaultFlagsForRole,
  isValidProjectRole,
  parseOptionalBool,
} from '../auth/project-access-rules.js';
import { generateInviteToken } from '../auth/invite-token.js';
import {
  loadProjectMiddleware,
  requireProjectAdmin,
} from '../middleware/project-access.js';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';

const INVITE_STATUSES = new Set(['pending', 'accepted', 'revoked', 'expired']);

function normalizeEmail(e) {
  if (e == null || typeof e !== 'string') return '';
  return e.trim().toLowerCase();
}

function mapInvitePublic(inv, { includeToken = false } = {}) {
  const row = {
    id: inv.id,
    project_id: inv.project_id,
    email: inv.email,
    role: String(inv.role),
    can_view_prices: Number(inv.can_view_prices) === 1,
    can_edit: Number(inv.can_edit) === 1,
    can_create_auftraege: Number(inv.can_create_auftraege) === 1,
    status: String(inv.status),
    expires_at: inv.expires_at,
    created_at: inv.created_at,
  };
  if (inv.created_by_user_id != null) row.created_by_user_id = inv.created_by_user_id;
  if (includeToken) row.token = inv.token;
  return row;
}

/**
 * @param {object} store
 */
export function createProjectInvitesRouter(store) {
  const r = Router({ mergeParams: true });
  const loadProject = loadProjectMiddleware(store);

  r.get('/', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const rows = await store.listProjectInvites(projectId);
      const invites = rows.map((inv) => mapInvitePublic(inv, { includeToken: false }));
      return sendSuccess(res, 200, { invites });
    } catch (e) {
      return next(e);
    }
  });

  r.post('/', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const emailRaw = req.body?.email;
      const role = req.body?.role;
      if (typeof emailRaw !== 'string' || !normalizeEmail(emailRaw)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "email" ist erforderlich.');
      }
      if (!isValidProjectRole(role)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "role" muss admin, editor oder viewer sein.');
      }

      const email = normalizeEmail(emailRaw);
      const defaults = defaultFlagsForRole(role);
      const pv = parseOptionalBool(req.body?.can_view_prices);
      const pe = parseOptionalBool(req.body?.can_edit);
      const pc = parseOptionalBool(req.body?.can_create_auftraege);
      const canViewPrices = pv !== undefined ? pv : defaults.can_view_prices;
      const canEdit = pe !== undefined ? pe : defaults.can_edit;
      const canCreateAuftraege = pc !== undefined ? pc : defaults.can_create_auftraege;

      let expiresInDays = Number.parseInt(String(req.body?.expires_in_days ?? '14'), 10);
      if (!Number.isFinite(expiresInDays) || expiresInDays < 1) expiresInDays = 14;
      if (expiresInDays > 365) expiresInDays = 365;
      const expiresAt = new Date(Date.now() + expiresInDays * 86400000).toISOString();

      const existingUser = await store.getUserByEmail(email);
      if (existingUser) {
        const hasAccess = await store.getProjectAccessByUserAndProject(
          existingUser.id,
          projectId,
        );
        if (hasAccess) {
          return sendError(res, 409, 'CONFLICT', 'Diese E-Mail hat bereits Zugriff auf das Projekt.');
        }
      }

      if (await store.getPendingProjectInviteByProjectAndEmail(projectId, email)) {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Für diese E-Mail besteht bereits eine ausstehende Einladung.',
        );
      }

      const id = randomUUID();
      const token = generateInviteToken();
      const createdBy = req.auth?.userId ?? null;

      try {
        await store.insertProjectInvite({
          id,
          projectId,
          email,
          role,
          canViewPrices,
          canEdit,
          canCreateAuftraege,
          token,
          expiresAtIso: expiresAt,
          createdByUserId: createdBy,
        });
      } catch {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Einladung konnte nicht angelegt werden (z. B. doppeltes Token oder Einladung).',
        );
      }

      const created = await store.getProjectInviteByIdAndProject(id, projectId);
      const base = process.env.PUBLIC_APP_BASE_URL || '';
      const invite_link =
        base && typeof base === 'string' && base.trim()
          ? `${base.replace(/\/$/, '')}/invites/${encodeURIComponent(token)}`
          : null;

      return sendSuccess(res, 201, {
        invite: mapInvitePublic(created, { includeToken: true }),
        ...(invite_link ? { invite_link } : {}),
      });
    } catch (e) {
      return next(e);
    }
  });

  r.patch('/:inviteId', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const inviteId = req.params.inviteId;
      if (typeof inviteId !== 'string' || !inviteId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige inviteId.');
      }
      const inv = await store.getProjectInviteByIdAndProject(inviteId.trim(), projectId);
      if (!inv) {
        return sendError(res, 404, 'NOT_FOUND', 'Einladung nicht gefunden.');
      }
      if (String(inv.status) !== 'pending') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Nur ausstehende Einladungen können geändert werden.');
      }

      if (req.body?.status === 'revoked') {
        await store.updateProjectInviteStatus(inviteId.trim(), projectId, 'revoked');
        const updated = await store.getProjectInviteByIdAndProject(inviteId.trim(), projectId);
        return sendSuccess(res, 200, { invite: mapInvitePublic(updated, { includeToken: false }) });
      }

      if (req.body?.expires_at != null) {
        const raw = String(req.body.expires_at).trim();
        const d = new Date(raw);
        if (Number.isNaN(d.getTime()) || d.getTime() <= Date.now()) {
          return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            'Feld "expires_at" muss ein gültiges zukünftiges Datum sein (ISO 8601).',
          );
        }
        await store.updateProjectInviteExpiry(inviteId.trim(), projectId, d.toISOString());
        const updated = await store.getProjectInviteByIdAndProject(inviteId.trim(), projectId);
        return sendSuccess(res, 200, { invite: mapInvitePublic(updated, { includeToken: false }) });
      }

      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Erlaubt: status "revoked" setzen oder "expires_at" (ISO) anpassen.',
      );
    } catch (e) {
      return next(e);
    }
  });

  r.delete('/:inviteId', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const inviteId = req.params.inviteId;
      if (typeof inviteId !== 'string' || !inviteId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige inviteId.');
      }
      const ok = await store.deleteProjectInviteIfPending(inviteId.trim(), projectId);
      if (!ok) {
        return sendError(
          res,
          404,
          'NOT_FOUND',
          'Ausstehende Einladung nicht gefunden (oder bereits verarbeitet).',
        );
      }
      return res.status(204).send();
    } catch (e) {
      return next(e);
    }
  });

  return r;
}
