/**
 * Rechte des angemeldeten Benutzers — nur aus dem Cockpit-Backend (GET /auth/my-rights).
 * Keine eigene Rechte-Logik: nur Lesen und Hilfsfunktionen für UI.
 */

import { apiFetch } from '../auth/cc-auth-session.js';

/** @type {{ at: number, data: object } | null} */
let cache = null;
const TTL_MS = 60_000;

export function clearMyRightsCache() {
  cache = null;
}

/**
 * @returns {Promise<object|null>}
 */
export async function loadMyRights(force = false) {
  if (!force && cache && Date.now() - cache.at < TTL_MS) {
    return cache.data;
  }
  const data = await apiFetch('/auth/my-rights');
  cache = { at: Date.now(), data };
  return data;
}

/**
 * @param {object|null|undefined} bundle — Antwort von loadMyRights()
 * @param {'cockpit'|'fusa'|'ccintern'} mod
 * @param {string} bereich
 * @param {string} flag
 */
export function myRight(bundle, mod, bereich, flag) {
  if (!bundle || !bundle.rights || typeof bundle.rights !== 'object') return false;
  if (bundle.global_role === 'SUPER_ADMIN') return true;
  const m = bundle.rights[mod];
  if (!m || typeof m !== 'object') return false;
  const b = m[bereich];
  if (!b || typeof b !== 'object') return false;
  return Boolean(b[flag]);
}

/**
 * OR über alle FUSA-Bereiche: preiseSehen (entspricht Backend canViewPricesAnywhere).
 * @param {object|null|undefined} bundle
 */
export function myFusaPreiseSehenAny(bundle) {
  if (!bundle?.rights?.fusa || typeof bundle.rights.fusa !== 'object') return false;
  if (bundle.global_role === 'SUPER_ADMIN') return true;
  for (const k of Object.keys(bundle.rights.fusa)) {
    const row = bundle.rights.fusa[k];
    if (row && typeof row === 'object' && row.preiseSehen) return true;
  }
  return false;
}

/**
 * Nutzung: `if (nested.fusa?.fahrzeuge?.erstellen)` — gleiche Schachtelung wie API `rights`.
 * @param {object|null|undefined} bundle
 */
export function myRightsNested(bundle) {
  return bundle && bundle.rights && typeof bundle.rights === 'object' ? bundle.rights : {};
}
