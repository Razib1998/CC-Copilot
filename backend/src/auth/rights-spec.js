/**
 * Zentrales Rollen- & Rechte-Modell (Cockpit-steuert, nicht projektbezogen).
 * @see docs/ARCHITEKTUR_REGEL.md — Abweichung: keine projektbezogenen Rechte (Spezifikation Nutzer).
 */

/** @typedef {'SUPER_ADMIN'|'INTERN'|'EXTERN'} GlobalRole */
export const GLOBAL_ROLES = /** @type {const} */ (['SUPER_ADMIN', 'INTERN', 'EXTERN']);

/** @typedef {'cockpit'|'fusa'|'ccintern'} AppModule */

export const MODULE_KEYS = /** @type {const} */ (['cockpit', 'fusa', 'ccintern']);

/** @type {readonly AppModule[]} */
export const ALL_MODULES = [...MODULE_KEYS];

/**
 * Rechte-Flags pro Bereich (JSON in DB).
 * @typedef {{
 *   sehen: boolean,
 *   erstellen: boolean,
 *   bearbeiten: boolean,
 *   loeschen: boolean,
 *   upload: boolean,
 *   freigeben: boolean,
 *   preiseSehen: boolean,
 *   margeSehen: boolean,
 *   rechnungSehen: boolean,
 *   reporting: boolean,
 *   export: boolean,
 *   fahrzeugMobilSehen: boolean,
 *   schadenAnlegen: boolean,
 *   fotoUpload: boolean,
 * }} RightsFlags
 */

/** @returns {RightsFlags} */
export function emptyRightsFlags() {
  return {
    sehen: false,
    erstellen: false,
    bearbeiten: false,
    loeschen: false,
    upload: false,
    freigeben: false,
    preiseSehen: false,
    margeSehen: false,
    rechnungSehen: false,
    reporting: false,
    export: false,
    fahrzeugMobilSehen: false,
    schadenAnlegen: false,
    fotoUpload: false,
  };
}

/** @returns {RightsFlags} */
export function fullRightsFlags() {
  const o = emptyRightsFlags();
  for (const k of Object.keys(o)) {
    /** @type {keyof RightsFlags} */
    const key = /** @type {keyof RightsFlags} */ (k);
    o[key] = true;
  }
  return o;
}

/**
 * @param {unknown} v
 * @returns {v is GlobalRole}
 */
export function isValidGlobalRole(v) {
  return typeof v === 'string' && GLOBAL_ROLES.includes(/** @type {GlobalRole} */ (v));
}

/**
 * @param {unknown} v
 * @returns {v is AppModule}
 */
export function isValidModuleKey(v) {
  return typeof v === 'string' && MODULE_KEYS.includes(/** @type {AppModule} */ (v));
}

/** Cockpit-Steuerbereiche (Slug = `bereich` in DB) */
export const COCKPIT_BEREICHE = /** @type {const} */ ([
  'dashboard',
  'benutzer',
  'einladungen',
  'rollen',
  'firmen',
  'module',
  'geraete',
  'logs',
  'projekte',
  'kalender',
  'auftraege',
]);

/** FUSA-Module (Slug) */
export const FUSA_BEREICHE = /** @type {const} */ ([
  'dashboard',
  'auftraege',
  'fahrzeuge',
  'schaeden',
  'kunden',
  'angebote',
  'dokumente',
  'kalender',
  'rechnungen',
  'quartalsabrechnung',
  'preisverwaltung',
  'montage_kalender',
  'benutzer_ro',
  'rollen_ro',
  'mobile',
]);

/** CC-Intern-Module (Slug) */
export const CCINTERN_BEREICHE = /** @type {const} */ ([
  'dashboard',
  'schnell_anfragen',
  'angebote',
  'auftraege',
  'kunden',
  'crm',
  'messeflow',
  'produktion',
  'materiallager',
  'checklisten',
  'kalender',
  'mitarbeiter',
  'urlaub',
  'mitarbeiterapp',
  'rechnungen',
  'benutzer_ro',
  'rollen_ro',
]);

/** @param {AppModule} mod */
export function bereicheForModule(mod) {
  if (mod === 'cockpit') return [...COCKPIT_BEREICHE];
  if (mod === 'fusa') return [...FUSA_BEREICHE];
  return [...CCINTERN_BEREICHE];
}

/**
 * @param {string} mod
 * @param {string} bereich
 */
export function isKnownBereich(mod, bereich) {
  if (!isValidModuleKey(mod)) return false;
  return bereicheForModule(/** @type {AppModule} */ (mod)).includes(bereich);
}

/**
 * @param {Partial<RightsFlags>} patch
 * @returns {RightsFlags}
 */
export function normalizeRightsJson(patch) {
  const base = emptyRightsFlags();
  if (!patch || typeof patch !== 'object') return base;
  for (const k of Object.keys(base)) {
    /** @type {keyof RightsFlags} */
    const key = /** @type {keyof RightsFlags} */ (k);
    if (Object.prototype.hasOwnProperty.call(patch, key)) {
      base[key] = Boolean(/** @type {Record<string, unknown>} */ (patch)[k]);
    }
  }
  return base;
}

/**
 * @param {string|null|undefined} json
 * @returns {RightsFlags}
 */
export function parseRightsJsonColumn(json) {
  if (json == null || String(json).trim() === '') return emptyRightsFlags();
  try {
    const o = JSON.parse(String(json));
    return normalizeRightsJson(o && typeof o === 'object' ? o : {});
  } catch {
    return emptyRightsFlags();
  }
}

/**
 * @param {RightsFlags} a
 * @param {RightsFlags} b
 * @returns {RightsFlags} OR je Schlüssel
 */
export function mergeRightsOr(a, b) {
  const out = emptyRightsFlags();
  for (const k of Object.keys(out)) {
    /** @type {keyof RightsFlags} */
    const key = /** @type {keyof RightsFlags} */ (k);
    out[key] = Boolean(a[key]) || Boolean(b[key]);
  }
  return out;
}

/**
 * @param {AppModule} mod
 * @returns {string}
 */
export function rightsJsonFullForModule(mod) {
  const o = fullRightsFlags();
  if (mod === 'fusa') {
    o.fahrzeugMobilSehen = true;
    o.schadenAnlegen = true;
    o.fotoUpload = true;
  }
  return JSON.stringify(o);
}
