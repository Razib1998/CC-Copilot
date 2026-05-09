/**
 * Phase A4: Root-Legacy-API-Pfade, die unter `/api/v1/...` vollständig ersetzt sind.
 * Kein stiller Redirect — einheitlich HTTP 410 + Fehler-Envelope.
 */
import { sendError } from './api-v1-envelope.js';

const LEGACY_ROOT_PREFIXES = Object.freeze([
  '/users',
  '/projects',
  '/kunden',
  '/angebote',
  '/auftraege',
  '/fahrzeuge',
  '/schaeden',
]);

/**
 * @param {import('express').Express} app
 */
export function mountLegacyApiRemoved(app) {
  const handler = (_req, res) =>
    sendError(res, 410, 'LEGACY_REMOVED', 'Bitte /api/v1/... verwenden.');
  for (const prefix of LEGACY_ROOT_PREFIXES) {
    app.use(prefix, handler);
  }
}

export { LEGACY_ROOT_PREFIXES };
