/**
 * Phase A2: Für `/api/v1/*` ist `x-project-id` Pflicht, außer dokumentierter Whitelist.
 * Zentral — nicht pro Route einzeln streuen.
 */

import { sendError } from '../lib/api-v1-envelope.js';

/** Klartext wie Roadmap / Akzeptanztests */
export const PROJECT_CONTEXT_REQUIRED_MESSAGE = 'Projekt-Kontext erforderlich.';

/**
 * Pfade unter `/api/v1`, bei denen kein Projekt-Header erzwungen wird (Roadmap A2).
 * Ergänzt durch Prefix `/api/v1/auth/` (= „auth/*“).
 *
 * @type {readonly string[]}
 */
export const API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES = Object.freeze([
  '/api/v1/users',
  '/api/v1/firmen',
  '/api/v1/role-templates',
  '/api/v1/invites',
  '/api/v1/projects',
  '/api/v1/kalender',
  '/api/v1/stammdaten/kalender',
  '/api/v1/aufgaben',
  '/api/v1/logs',
  '/api/v1/cockpit/dashboard',
  '/api/v1/fusa/dashboard',
  '/api/v1/fusa/quartale',
  '/api/v1/ccintern/dashboard',
  '/api/v1/ccintern/me',
  '/api/v1/ccintern/mitarbeiter',
  '/api/v1/ccintern/checklisten-zuordnung',
  '/api/v1/urlaub',
]);

/**
 * @param {string} fullPath Pfad inkl. `/api/v1`, ohne Query
 */
export function isApiV1ProjectContextOptionalPath(fullPath) {
  const pathOnly = fullPath.split('?')[0];
  const p =
    pathOnly.length > 1 && pathOnly.endsWith('/') ? pathOnly.replace(/\/+$/, '') : pathOnly;

  if (p.startsWith('/api/v1/auth/')) return true;

  for (const prefix of API_V1_PROJECT_CONTEXT_OPTIONAL_PREFIXES) {
    if (p === prefix || p.startsWith(`${prefix}/`)) return true;
  }
  return false;
}

/**
 * Läuft nach Auth + Profil. Prüft nur Nicht-Whitelist + nicht-leeren Header — keine DB.
 */
export function requireApiV1ProjectHeaderUnlessWhitelisted() {
  return (req, res, next) => {
    const fullPath =
      typeof req.originalUrl === 'string'
        ? req.originalUrl.split('?')[0]
        : `${req.baseUrl || ''}${req.path || ''}`;
    if (isApiV1ProjectContextOptionalPath(fullPath)) {
      return next();
    }
    const raw = req.get('x-project-id');
    const pid = typeof raw === 'string' ? raw.trim() : '';
    if (!pid) {
      return sendError(res, 400, 'PROJECT_CONTEXT_REQUIRED', PROJECT_CONTEXT_REQUIRED_MESSAGE);
    }
    return next();
  };
}
