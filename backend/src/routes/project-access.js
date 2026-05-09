import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import {
  createProjectAccessService,
  defaultFlagsForRole,
  isValidProjectRole,
  parseOptionalBool,
} from '../auth/project-access-rules.js';
import {
  loadProjectMiddleware,
  requireMemberOfProject,
  requireProjectAdmin,
  requireProjectAdminOrBootstrap,
} from '../middleware/project-access.js';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';

/**
 * @param {object} row
 */
function mapAccessResponse(row) {
  if (!row) return null;
  const base = {
    id: row.id,
    user_id: row.user_id,
    project_id: row.project_id,
    role: String(row.role),
    can_view_prices: Number(row.can_view_prices) === 1,
    can_edit: Number(row.can_edit) === 1,
    can_create_auftraege: Number(row.can_create_auftraege) === 1,
    created_at: row.created_at,
  };
  if (row.user_email != null) base.user_email = row.user_email;
  if (row.user_name != null) base.user_name = row.user_name;
  return base;
}

/** @param {object} store — Rückgabe von openDatabase() */
export function createProjectAccessRouter(store) {
  const r = Router({ mergeParams: true });
  const loadProject = loadProjectMiddleware(store);

  r.get('/', loadProject, requireMemberOfProject(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const rows = await store.listProjectAccessWithUsers(projectId);
      return sendSuccess(res, 200, {
        access: rows.map((row) => mapAccessResponse(row)),
      });
    } catch (e) {
      return next(e);
    }
  });

  r.post('/', loadProject, requireProjectAdminOrBootstrap(store), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const userId = req.body?.user_id;
      const role = req.body?.role;
      if (typeof userId !== 'string' || !userId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "user_id" ist erforderlich.');
      }
      if (!isValidProjectRole(role)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "role" muss admin, editor oder viewer sein.');
      }
      const uid = userId.trim();
      if (!(await store.getUserById(uid))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer wurde nicht gefunden.');
      }
      if (await store.getProjectAccessByUserAndProject(uid, projectId)) {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Für diesen Benutzer besteht bereits ein Zugriff auf das Projekt.',
        );
      }

      const defaults = defaultFlagsForRole(role);
      const pv = parseOptionalBool(req.body?.can_view_prices);
      const pe = parseOptionalBool(req.body?.can_edit);
      const pc = parseOptionalBool(req.body?.can_create_auftraege);

      const canViewPrices = pv !== undefined ? pv : defaults.can_view_prices;
      const canEdit = pe !== undefined ? pe : defaults.can_edit;
      const canCreateAuftraege = pc !== undefined ? pc : defaults.can_create_auftraege;

      const id = randomUUID();
      try {
        await store.insertProjectAccess({
          id,
          userId: uid,
          projectId,
          role,
          canViewPrices,
          canEdit,
          canCreateAuftraege,
        });
      } catch {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Zugriff konnte nicht angelegt werden (z. B. bereits vorhanden).',
        );
      }

      const created = await store.getProjectAccessByIdAndProject(id, projectId);
      return sendSuccess(res, 201, { access: mapAccessResponse(created) });
    } catch (e) {
      return next(e);
    }
  });

  r.patch('/:accessId', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const accessId = req.params.accessId;
      if (typeof accessId !== 'string' || !accessId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige accessId.');
      }
      const existing = await store.getProjectAccessByIdAndProject(accessId.trim(), projectId);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Zugriffseintrag nicht gefunden.');
      }

      const patch = {};
      if (req.body?.role !== undefined) {
        if (!isValidProjectRole(req.body.role)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "role" muss admin, editor oder viewer sein.');
        }
        patch.role = req.body.role;
      }
      const pv = parseOptionalBool(req.body?.can_view_prices);
      const pe = parseOptionalBool(req.body?.can_edit);
      const pc = parseOptionalBool(req.body?.can_create_auftraege);
      if (pv !== undefined) patch.can_view_prices = pv;
      if (pe !== undefined) patch.can_edit = pe;
      if (pc !== undefined) patch.can_create_auftraege = pc;

      if (Object.keys(patch).length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine änderbaren Felder übermittelt.');
      }

      const updated = await store.updateProjectAccess(accessId.trim(), projectId, patch);
      return sendSuccess(res, 200, { access: mapAccessResponse(updated) });
    } catch (e) {
      return next(e);
    }
  });

  r.delete('/:accessId', loadProject, requireProjectAdmin(), async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      const accessId = req.params.accessId;
      if (typeof accessId !== 'string' || !accessId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige accessId.');
      }
      const existing = await store.getProjectAccessByIdAndProject(accessId.trim(), projectId);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Zugriffseintrag nicht gefunden.');
      }
      await store.deleteProjectAccess(accessId.trim(), projectId);
      return res.status(204).send();
    } catch (e) {
      return next(e);
    }
  });

  return r;
}

/**
 * GET /projects/:projectId/my-access — effektiver Zugriff des angemeldeten Benutzers (Test/Clients).
 */
export function registerProjectMyAccessRoute(router, store) {
  const loadProject = loadProjectMiddleware(store);
  router.get(
    '/:projectId/my-access',
    loadProject,
    requireMemberOfProject(),
    async (req, res, next) => {
      try {
        const prof = req.accessProfile;
        const canView = prof?.canViewPricesAnywhere() ?? false;
        const canEdit = Boolean(prof?.has('cockpit', 'projekte', 'bearbeiten'));
        const canCreateAuftraege = Boolean(prof?.has('cockpit', 'auftraege', 'erstellen'));
        return sendSuccess(res, 200, {
          access: {
            id: 'global',
            user_id: req.auth.userId,
            project_id: req.cockpitProject.id,
            role: prof?.isSuperAdmin() ? 'admin' : 'viewer',
            can_view_prices: canView,
            can_edit: canEdit,
            can_create_auftraege: canCreateAuftraege,
            created_at: null,
          },
        });
      } catch (e) {
        return next(e);
      }
    },
  );
}
