/**
 * @typedef {import('../auth/rights-spec.js').AppModule} AppModule
 * @typedef {import('../auth/rights-spec.js').RightsFlags} RightsFlags
 */

import { sendError } from '../lib/api-v1-envelope.js';

/**
 * @param {keyof RightsFlags} flag
 */
export function requireSuperAdmin() {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p?.isSuperAdmin()) {
      return sendError(res, 403, 'SUPERADMIN_REQUIRED', 'Nur SUPER_ADMIN.');
    }
    return next();
  };
}

/**
 * Modulzugriff (Ebene 2).
 * @param {AppModule} module
 */
export function requireModule(module) {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (!p.hasModule(module)) {
      return sendError(res, 403, 'MODULE_FORBIDDEN', `Kein Zugriff auf Modul „${module}".`);
    }
    return next();
  };
}

/**
 * Bereich + Recht (Ebene 3).
 * @param {AppModule} module
 * @param {string} bereich
 * @param {keyof RightsFlags} flag
 */
export function requireRight(module, bereich, flag) {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (!p.has(module, bereich, flag)) {
      return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Unzureichende Berechtigung.');
    }
    return next();
  };
}

/**
 * GET /api/v1/projects: Cockpit-Projekte sehen ODER Mitarbeiter-App (Lesen) für Projekt-/Session-Kontext.
 */
export function requireCockpitProjekteSehenOrMitarbeiterAppSehen() {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    if (p.isSuperAdmin()) return next();
    const cockpitOk = p.hasModule('cockpit') && p.has('cockpit', 'projekte', 'sehen');
    const maOk = p.hasModule('ccintern') && p.has('ccintern', 'mitarbeiterapp', 'sehen');
    if (cockpitOk || maOk) return next();
    return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Unzureichende Berechtigung.');
  };
}

/**
 * GET /api/v1/users: volle Liste nur mit Cockpit-Recht; sonst Mitarbeiter-App → Handler liefert nur eigenen User.
 */
export function requireCockpitBenutzerSehenOrMitarbeiterAppSelfList() {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    if (p.isSuperAdmin()) return next();
    const cockpitOk = p.hasModule('cockpit') && p.has('cockpit', 'benutzer', 'sehen');
    const maOk = p.hasModule('ccintern') && p.has('ccintern', 'mitarbeiterapp', 'sehen');
    if (cockpitOk || maOk) return next();
    return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Unzureichende Berechtigung.');
  };
}

/**
 * GET /api/v1/firmen*: volle Liste nur mit Cockpit-Recht; sonst Mitarbeiter-App → nur eigene company_id (Handler).
 */
export function requireCockpitFirmenSehenOrMitarbeiterAppOwnFirma() {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    if (p.isSuperAdmin()) return next();
    const cockpitOk = p.hasModule('cockpit') && p.has('cockpit', 'firmen', 'sehen');
    const maOk = p.hasModule('ccintern') && p.has('ccintern', 'mitarbeiterapp', 'sehen');
    if (cockpitOk || maOk) return next();
    return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Unzureichende Berechtigung.');
  };
}
