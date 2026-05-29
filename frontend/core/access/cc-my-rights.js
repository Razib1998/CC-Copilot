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

/**
 * Zentrale UI-Ableitung aus GET /auth/my-rights (kein paralleles Rechte-Modell).
 * Topbar und Shell nutzen dieselbe Logik.
 * `canSeeCcInternDesktop` wird nicht durch App-/API-Bereiche (Produktion, Aufträge, …) ausgelöst.
 *
 * @param {object|null|undefined} bundle
 * @returns {{
 *   canSeeMitarbeiterApp: boolean,
 *   canSeeCcInternDesktop: boolean,
 *   canSeeCockpit: boolean,
 *   canSeeFusa: boolean,
 *   isMitarbeiterAppOnlyShell: boolean,
 * }}
 */
/**
 * Modul nur dann „sichtbar“ in der Shell, wenn mindestens ein Bereich `sehen` hat
 * (reines `user_modules`-Flag ohne Rechte = kein Cockpit/FUSA in der Topbar).
 * @param {object|null|undefined} bundle
 * @param {'cockpit'|'fusa'} mod
 */
function moduleHasAnySehen(bundle, mod) {
  if (!bundle?.rights || typeof bundle.rights !== 'object') return false;
  const block = bundle.rights[mod];
  if (!block || typeof block !== 'object') return false;
  for (const k of Object.keys(block)) {
    const row = block[k];
    if (row && typeof row === 'object' && row.sehen) return true;
  }
  return false;
}

/**
 * `sehen` in diesen Bereichen **zählt nicht** als CC-Intern-Desktop (Sidebar/Menüs):
 * API-Rechte für Mitarbeiter-App bleiben aktiv, Shell bleibt App-only.
 * Desktop nur über andere ccintern-Bereiche (z. B. dashboard, kunden, angebote, …).
 */
const CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR = new Set([
  'mitarbeiter',
  'mitarbeiterapp',
  'urlaub',
  'produktion',
  'auftraege',
  'materiallager',
  'checklisten',
  'kalender',
  'kommunikation',
]);

export function deriveShellUiAccess(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return {
      canSeeMitarbeiterApp: false,
      canSeeCcInternDesktop: false,
      canSeeCockpit: false,
      canSeeFusa: false,
      isMitarbeiterAppOnlyShell: false,
    };
  }
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = Array.isArray(bundle.modules) ? bundle.modules : [];

  const canSeeCockpit = isSa || (mods.includes('cockpit') && moduleHasAnySehen(bundle, 'cockpit'));
  const canSeeFusa = isSa || (mods.includes('fusa') && moduleHasAnySehen(bundle, 'fusa'));
  const hasCcinternMod = isSa || mods.includes('ccintern');
  const canSeeMitarbeiterApp =
    isSa || (hasCcinternMod && myRight(bundle, 'ccintern', 'mitarbeiterapp', 'sehen'));

  let canSeeCcInternDesktop = false;
  if (isSa) {
    canSeeCcInternDesktop = true;
  } else if (hasCcinternMod && bundle.rights && typeof bundle.rights.ccintern === 'object') {
    const ci = bundle.rights.ccintern;
    for (const bereich of Object.keys(ci)) {
      if (CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR.has(bereich)) continue;
      const row = ci[bereich];
      if (row && typeof row === 'object' && row.sehen) {
        canSeeCcInternDesktop = true;
        break;
      }
    }
  }

  const isMitarbeiterAppOnlyShell =
    !isSa &&
    canSeeMitarbeiterApp &&
    !canSeeCcInternDesktop &&
    !canSeeCockpit &&
    !canSeeFusa;

  return {
    canSeeMitarbeiterApp,
    canSeeCcInternDesktop,
    canSeeCockpit,
    canSeeFusa,
    isMitarbeiterAppOnlyShell,
  };
}

/**
 * Konsole/Diagnose: zeigt **warum** `deriveShellUiAccess` jedes Flag setzt (keine neue Rechte-Logik).
 * @param {object|null|undefined} bundle
 */
export function debugExplainShellUiAccess(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return {
      bundleOk: false,
      reason: 'bundle fehlt oder kein Objekt → alle Flags false / isMitarbeiterAppOnlyShell false',
    };
  }
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = Array.isArray(bundle.modules) ? bundle.modules : [];

  /** @type {string[]} */
  const cockpitSehenBereiche = [];
  if (bundle.rights?.cockpit && typeof bundle.rights.cockpit === 'object') {
    for (const k of Object.keys(bundle.rights.cockpit)) {
      const row = bundle.rights.cockpit[k];
      if (row && typeof row === 'object' && row.sehen) cockpitSehenBereiche.push(k);
    }
  }
  /** @type {string[]} */
  const fusaSehenBereiche = [];
  if (bundle.rights?.fusa && typeof bundle.rights.fusa === 'object') {
    for (const k of Object.keys(bundle.rights.fusa)) {
      const row = bundle.rights.fusa[k];
      if (row && typeof row === 'object' && row.sehen) fusaSehenBereiche.push(k);
    }
  }
  /** @type {string[]} */
  const ccDesktopSehenBereiche = [];
  let mitarbeiterappSehen = false;
  if (bundle.rights?.ccintern && typeof bundle.rights.ccintern === 'object') {
    for (const bereich of Object.keys(bundle.rights.ccintern)) {
      const row = bundle.rights.ccintern[bereich];
      if (!row || typeof row !== 'object') continue;
      if (bereich === 'mitarbeiterapp') {
        mitarbeiterappSehen = Boolean(row.sehen);
        continue;
      }
      if (CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR.has(bereich)) continue;
      if (row.sehen) ccDesktopSehenBereiche.push(bereich);
    }
  }

  const hasCockpitMod = mods.includes('cockpit');
  const hasFusaMod = mods.includes('fusa');
  const hasCcinternMod = mods.includes('ccintern');
  const cockpitAnySehen = cockpitSehenBereiche.length > 0;
  const fusaAnySehen = fusaSehenBereiche.length > 0;

  const canSeeCockpit = isSa || (hasCockpitMod && cockpitAnySehen);
  const canSeeFusa = isSa || (hasFusaMod && fusaAnySehen);
  const canSeeMitarbeiterApp =
    isSa || (hasCcinternMod && myRight(bundle, 'ccintern', 'mitarbeiterapp', 'sehen'));
  const canSeeCcInternDesktop = isSa || ccDesktopSehenBereiche.length > 0;

  const ui = deriveShellUiAccess(bundle);

  return {
    bundleOk: true,
    global_role: bundle.global_role,
    user_id: bundle.user_id,
    modules: mods,
    isSuperAdmin: isSa,
    cockpit: {
      moduleInList: hasCockpitMod,
      bereicheMitSehen: cockpitSehenBereiche,
      formula: 'canSeeCockpit = isSuperAdmin OR (cockpit in modules AND any cockpit.*.sehen)',
      result: canSeeCockpit,
    },
    fusa: {
      moduleInList: hasFusaMod,
      bereicheMitSehen: fusaSehenBereiche,
      formula: 'canSeeFusa = isSuperAdmin OR (fusa in modules AND any fusa.*.sehen)',
      result: canSeeFusa,
    },
    ccintern: {
      moduleInList: hasCcinternMod,
      mitarbeiterapp_sehen: mitarbeiterappSehen,
      desktopBereicheMitSehen: ccDesktopSehenBereiche,
      formulaDesktop:
        'canSeeCcInternDesktop = isSuperAdmin OR any ccintern.*.sehen außer App-/API-Bereiche (s. CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR)',
      formulaMaApp: 'canSeeMitarbeiterApp = isSuperAdmin OR (ccintern in modules AND mitarbeiterapp.sehen)',
      canSeeCcInternDesktop,
      canSeeMitarbeiterApp,
    },
    isMitarbeiterAppOnlyShell_formula:
      '!isSuperAdmin && canSeeMitarbeiterApp && !canSeeCcInternDesktop && !canSeeCockpit && !canSeeFusa',
    deriveShellUiAccess: ui,
  };
}
