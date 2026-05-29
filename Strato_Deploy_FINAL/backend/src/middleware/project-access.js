import { sendError } from '../lib/api-v1-envelope.js';
import { requireModule, requireRight } from './require-rights.js';

/**
 * @param {...import('express').RequestHandler} fns
 * @returns {import('express').RequestHandler}
 */
export function chainMiddleware(...fns) {
  return (req, res, next) => {
    let i = 0;
    const run = (err) => {
      if (err) return next(err);
      if (i >= fns.length) return next();
      const fn = fns[i++];
      fn(req, res, run);
    };
    run();
  };
}

/**
 * Lädt Projekt aus `req.params.projectId`, setzt `req.cockpitProject` oder 404.
 */
export function loadProjectMiddleware(store) {
  return async (req, res, next) => {
    try {
      const projectId = req.params.projectId;
      if (typeof projectId !== 'string' || !projectId.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Projekt-ID.');
      }
      const project = await store.getProjectById(projectId.trim());
      if (!project) {
        return sendError(res, 404, 'NOT_FOUND', 'Projekt wurde nicht gefunden.');
      }
      req.cockpitProject = project;
      return next();
    } catch (e) {
      return next(e);
    }
  };
}

/** Cockpit: Projekt-Bereich sichtbar (zentrale Rechte, nicht projektbezogen). */
export function requireMemberOfProject() {
  return chainMiddleware(requireModule('cockpit'), requireRight('cockpit', 'projekte', 'sehen'));
}

/** Cockpit: Projekt strukturell bearbeiten. */
export function requireCanEditProject() {
  return chainMiddleware(requireModule('cockpit'), requireRight('cockpit', 'projekte', 'bearbeiten'));
}

/** Projekt-Zugriffszeilen (Legacy-Tabelle) verwalten → Cockpit „Rollen“. */
export function requireProjectAdminOrBootstrap(_store) {
  return chainMiddleware(requireModule('cockpit'), requireRight('cockpit', 'rollen', 'bearbeiten'));
}

/** Projekt-Einladungen verwalten. */
export function requireProjectAdmin() {
  return chainMiddleware(requireModule('cockpit'), requireRight('cockpit', 'einladungen', 'bearbeiten'));
}

/** Preisfelder (OR über FUSA-Bereiche mit preiseSehen). */
export function requireCanViewPrices() {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p?.canViewPricesAnywhere()) {
      return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Keine Berechtigung zur Einsicht von Preisen.');
    }
    return next();
  };
}
