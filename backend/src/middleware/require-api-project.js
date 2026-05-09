import { sendError } from '../lib/api-v1-envelope.js';
import { PROJECT_CONTEXT_REQUIRED_MESSAGE } from './api-v1-project-context.js';

/**
 * Strenges Projekt-Gate für ausgewählte `/api/v1`-Routen:
 * - Header `x-project-id` ist Pflicht
 * - Projekt muss existieren
 * - Nutzer muss eine `project_access`-Zeile haben
 * - Ausnahme: nach `attachAccessProfile` ist `global_role === 'SUPER_ADMIN'` (`req.accessProfile`) → kein project_access nötig
 *
 * Setzt `req.apiProjectId` (string).
 *
 * @param {object} store
 * @returns {import('express').RequestHandler}
 */
export function requireApiProjectContext(store) {
  return async (req, res, next) => {
    try {
      const raw = req.get('x-project-id');
      const pid = typeof raw === 'string' ? raw.trim() : '';
      if (!pid) {
        return sendError(res, 400, 'PROJECT_CONTEXT_REQUIRED', PROJECT_CONTEXT_REQUIRED_MESSAGE);
      }
      const project = await store.getProjectById(pid);
      if (!project) {
        return sendError(res, 404, 'NOT_FOUND', 'Projekt wurde nicht gefunden.');
      }
      const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
      if (!uid) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'Authentifizierung erforderlich.');
      }
      const profile = req.accessProfile;
      if (
        profile &&
        profile.globalRole === 'SUPER_ADMIN' &&
        typeof profile.isSuperAdmin === 'function' &&
        profile.isSuperAdmin()
      ) {
        req.apiProjectId = pid;
        return next();
      }
      const access = await store.getProjectAccessByUserAndProject(uid, pid);
      if (!access) {
        return sendError(res, 403, 'PROJECT_FORBIDDEN', 'Kein Zugriff auf dieses Projekt.');
      }
      req.apiProjectId = pid;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
