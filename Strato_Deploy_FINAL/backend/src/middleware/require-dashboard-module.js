/**
 * Phase B2: Dashboard-Routen — Zugriff nur mit passendem App-Modul (oder SUPER_ADMIN).
 */

import { sendError } from '../lib/api-v1-envelope.js';

/**
 * @param {'cockpit'|'fusa'|'ccintern'} moduleName
 */
export function requireDashboardModule(moduleName) {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (p.isSuperAdmin()) {
      return next();
    }
    if (p.hasModule(moduleName)) {
      return next();
    }
    return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff');
  };
}
