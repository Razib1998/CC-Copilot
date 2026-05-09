import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { redactPricesInPlainObject } from '../auth/price-redaction.js';
import {
  createProjectAccessRouter,
  registerProjectMyAccessRoute,
} from './project-access.js';
import { createProjectInvitesRouter } from './project-invites.js';
import {
  chainMiddleware,
  loadProjectMiddleware,
  requireMemberOfProject,
  requireCanEditProject,
} from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { logAudit } from '../lib/audit-log.js';

/**
 * LEGACY — nur Markierung, keine Migration: **projects.kunden_id** verweist auf die Tabelle **kunden** (altes Modell); Validierung erfolgt u. a. über `store.getKundeById`. Neue Entwicklung an **firmen** bzw. `/api/v1/firmen` oder `/api/v1/stammdaten/kunden` ausrichten; **projects.kunden_id** bleibt bis zu einer separaten Migration unverändert.
 *
 * @param {object} p
 * @param {boolean} canViewPrices
 */
function mapProjectPublic(p, canViewPrices) {
  return redactPricesInPlainObject(
    {
      id: p.id,
      name: p.name,
      kunden_id: p.kunden_id != null ? String(p.kunden_id) : null,
      kunde_name: p.kunde_name != null ? String(p.kunde_name) : null,
      kunde_ansprechpartner: p.kunde_ansprechpartner != null ? String(p.kunde_ansprechpartner) : null,
      deadline: p.deadline != null && String(p.deadline).trim() !== '' ? String(p.deadline).trim() : null,
      created_at: p.created_at,
    },
    canViewPrices,
  );
}

/**
 * @param {unknown} v
 * @returns {string|null|undefined} null erlaubt, undefined = nicht gesetzt
 */
function parseOptionalKundenId(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return v.trim();
}

export function createProjectsRouter(store) {
  const router = Router();

  const requireProjekteSehen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'projekte', 'sehen'),
  );
  const requireProjekteErstellen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'projekte', 'erstellen'),
  );

  router.get('/', requireProjekteSehen, async (req, res, next) => {
    try {
      const rows = await store.listProjectsForUser(req.auth.userId);
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      const projects = rows.map((p) => mapProjectPublic(p, canView));
      return sendSuccess(res, 200, { projects });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', requireProjekteErstellen, async (req, res, next) => {
    try {
      const userId = req.auth?.userId;
      if (!userId) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const name = req.body?.name;
      if (typeof name !== 'string' || !name.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich (nicht-leerer Text).');
      }
      const trimmed = name.trim();
      const kParsed = parseOptionalKundenId(req.body?.kunden_id);
      if (kParsed === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „kunden_id“ muss Text oder leer sein.');
      }
      if (kParsed && !(await store.getKundeById(kParsed))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Kunde wurde nicht gefunden.');
      }
      const id = randomUUID();
      try {
        await store.createProjectWithOwnerAccess({
          projectId: id,
          name: trimmed,
          userId,
          kundenId: kParsed,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : '';
        if (msg.includes('Kunde nicht gefunden')) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Kunde wurde nicht gefunden.');
        }
        return sendError(res, 500, 'INTERNAL_ERROR', 'Projekt konnte nicht angelegt werden.');
      }
      const row = await store.getProjectById(id);
      if (!row) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Projekt nach dem Anlegen nicht gefunden.');
      }
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'project',
        resource_id: id,
        project_id: id,
        payload: { name: trimmed },
      });
      const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
      return sendSuccess(res, 201, {
        project: mapProjectPublic(row, canView),
      });
    } catch (e) {
      return next(e);
    }
  });

  registerProjectMyAccessRoute(router, store);
  router.use('/:projectId/invites', createProjectInvitesRouter(store));
  router.use('/:projectId/access', createProjectAccessRouter(store));

  const loadProject = loadProjectMiddleware(store);

  router.patch(
    '/:projectId',
    loadProject,
    requireMemberOfProject(),
    requireCanEditProject(),
    async (req, res, next) => {
      try {
        const userId = req.auth?.userId;
        const p = req.cockpitProject;
        const patch = {};
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
          patch.name = req.body.name;
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'kunden_id')) {
          const raw = req.body.kunden_id;
          if (raw == null || raw === '') {
            patch.kunden_id = null;
          } else if (typeof raw === 'string' && raw.trim()) {
            patch.kunden_id = raw.trim();
          } else {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „kunden_id“ muss Text oder leer sein.');
          }
        }
        if (Object.prototype.hasOwnProperty.call(req.body || {}, 'deadline')) {
          const raw = req.body.deadline;
          if (raw == null || raw === '') {
            patch.deadline = null;
          } else if (typeof raw === 'string' && raw.trim()) {
            const d = new Date(raw.trim());
            if (Number.isNaN(d.getTime())) {
              return sendError(
                res,
                400,
                'VALIDATION_ERROR',
                'Feld „deadline“ muss ein gültiges ISO-Datum oder leer sein.',
              );
            }
            patch.deadline = raw.trim();
          } else {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „deadline“ muss Text oder leer sein.');
          }
        }
        if (Object.keys(patch).length === 0) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Mindestens ein Feld: name, kunden_id, deadline.');
        }
        if (patch.kunden_id && !(await store.getKundeById(patch.kunden_id))) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Kunde wurde nicht gefunden.');
        }
        const updated = await store.updateProject(String(p.id), patch);
        if (!updated) {
          return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
        }
        if (typeof updated === 'object' && updated.error) {
          const msg =
            updated.error === 'INVALID_NAME'
              ? 'Feld „name“ ungültig.'
              : updated.error === 'KUNDE_NOT_FOUND'
                ? 'Kunde wurde nicht gefunden.'
                : updated.error === 'INVALID_KUNDEN_ID'
                  ? 'Feld „kunden_id“ ungültig.'
                  : updated.error === 'INVALID_DEADLINE'
                    ? 'Feld „deadline“ ungültig.'
                    : 'Validierung fehlgeschlagen.';
          return sendError(res, 400, 'VALIDATION_ERROR', msg);
        }
        await logAudit(store, {
          user: req.auth,
          modul: 'cockpit',
          action: 'PATCH',
          resource_type: 'project',
          resource_id: String(p.id),
          project_id: String(p.id),
          payload: { keys: Object.keys(patch) },
        });
        const canView = req.accessProfile?.canViewPricesAnywhere() ?? false;
        return sendSuccess(res, 200, {
          project: mapProjectPublic(updated, canView),
        });
      } catch (e) {
        return next(e);
      }
    },
  );

  router.get('/:projectId', loadProject, requireMemberOfProject(), async (req, res, next) => {
    try {
      const p = req.cockpitProject;
      const prof = req.accessProfile;
      const canView = prof?.canViewPricesAnywhere() ?? false;
      return sendSuccess(res, 200, {
        project: mapProjectPublic(p, canView),
        your_access: {
          role: prof?.isSuperAdmin() ? 'admin' : 'viewer',
          can_view_prices: canView,
          can_edit: Boolean(prof?.has('cockpit', 'projekte', 'bearbeiten')),
          can_create_auftraege: Boolean(prof?.has('cockpit', 'auftraege', 'erstellen')),
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
