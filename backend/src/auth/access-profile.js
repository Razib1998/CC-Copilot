import {
  bereicheForModule,
  emptyRightsFlags,
  fullRightsFlags,
  isValidModuleKey,
  mergeRightsOr,
  parseRightsJsonColumn,
} from './rights-spec.js';

/**
 * @typedef {import('./rights-spec.js').RightsFlags} RightsFlags
 * @typedef {import('./rights-spec.js').AppModule} AppModule
 * @typedef {import('./rights-spec.js').GlobalRole} GlobalRole
 */

/**
 * @typedef {object} AccessProfile
 * @property {string} userId
 * @property {GlobalRole} globalRole
 * @property {Set<AppModule>} modules
 * @property {Map<string, RightsFlags>} rightsByKey — Schlüssel `${module}:${bereich}`
 * @property {(module: AppModule, bereich: string, flag: keyof RightsFlags) => boolean} has
 * @property {(module: AppModule) => boolean} hasModule
 * @property {() => boolean} isSuperAdmin
 * @property {() => boolean} canViewPricesAnywhere — OR all `preiseSehen` in fusa (und cockpit Angebote/Aufträge falls relevant)
 */

/**
 * @param {string} module
 * @param {string} bereich
 */
function key(module, bereich) {
  return `${module}:${bereich}`;
}

/**
 * Legacy-Modulnamen auf aktuelle Slugs normalisieren.
 * @param {unknown} raw
 * @returns {AppModule|null}
 */
function normalizeModuleKey(raw) {
  const m = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (m === 'cockpit' || m === 'fusa' || m === 'ccintern') return /** @type {AppModule} */ (m);
  return null;
}

/**
 * Legacy-Bereichsslugs (z. B. `fusa_fahrzeuge`) auf aktuelle Slugs normalisieren.
 * @param {AppModule} module
 * @param {unknown} rawBereich
 * @returns {string}
 */
function normalizeBereichKey(module, rawBereich) {
  const b = typeof rawBereich === 'string' ? rawBereich.trim() : '';
  if (!b) return '';
  const lower = b.toLowerCase();
  const prefix = `${module}_`;
  if (lower.startsWith(prefix)) return lower.slice(prefix.length);
  if (module === 'ccintern' && lower.startsWith('ccintern_')) return lower.slice('ccintern_'.length);
  return lower;
}

/**
 * @param {object} store
 * @param {string} userId
 * @returns {Promise<AccessProfile>}
 */
export async function loadAccessProfile(store, userId) {
  const uid = typeof userId === 'string' ? userId.trim() : '';
  if (!uid) {
    return buildEmptyProfile('');
  }

  const row = await store.getUserById(uid);
  if (!row) {
    return buildEmptyProfile(uid);
  }

  /** @type {GlobalRole} */
  const globalRole =
    row.global_role === 'SUPER_ADMIN' || row.global_role === 'INTERN' || row.global_role === 'EXTERN'
      ? row.global_role
      : 'INTERN';

  if (globalRole === 'SUPER_ADMIN') {
    return buildSuperAdminProfile(uid);
  }

  const modRows = await store.listUserModules(uid);
  /** @type {Set<AppModule>} */
  const modules = new Set();
  for (const r of modRows) {
    const m = normalizeModuleKey(r.module);
    if (m && isValidModuleKey(m)) modules.add(m);
  }

  const rightRows = await store.listUserRights(uid);
  /** @type {Map<string, RightsFlags>} */
  const rightsByKey = new Map();
  for (const r of rightRows) {
    const m = normalizeModuleKey(r.module);
    if (!m || !isValidModuleKey(m)) continue;
    const b = normalizeBereichKey(m, r.bereich);
    if (!b) continue;
    const flags = parseRightsJsonColumn(r.rechte_json);
    const k = key(m, b);
    const prev = rightsByKey.get(k) || emptyRightsFlags();
    rightsByKey.set(k, mergeRightsOr(prev, flags));
  }

  return {
    userId: uid,
    globalRole,
    modules,
    rightsByKey,
    isSuperAdmin: () => false,
    hasModule: (module) => {
      if (!isValidModuleKey(module)) return false;
      return modules.has(module);
    },
    has: (module, bereich, flag) => {
      if (!isValidModuleKey(module)) return false;
      if (!modules.has(module)) return false;
      const f = (rightsByKey.get(key(module, bereich)) || emptyRightsFlags())[flag];
      return Boolean(f);
    },
    canViewPricesAnywhere: () => {
      if (!modules.has('fusa')) return false;
      for (const b of bereicheForModule('fusa')) {
        const r = rightsByKey.get(key('fusa', b)) || emptyRightsFlags();
        if (r.preiseSehen) return true;
      }
      return false;
    },
  };
}

/**
 * @param {string} uid
 * @returns {AccessProfile}
 */
function buildEmptyProfile(uid) {
  const modules = new Set();
  const rightsByKey = new Map();
  return {
    userId: uid,
    globalRole: 'INTERN',
    modules,
    rightsByKey,
    isSuperAdmin: () => false,
    hasModule: () => false,
    has: () => false,
    canViewPricesAnywhere: () => false,
  };
}

/**
 * @param {string} uid
 * @returns {AccessProfile}
 */
function buildSuperAdminProfile(uid) {
  const modules = new Set(/** @type {AppModule[]} */ (['cockpit', 'fusa', 'ccintern']));
  const rightsByKey = new Map();
  return {
    userId: uid,
    globalRole: 'SUPER_ADMIN',
    modules,
    rightsByKey,
    isSuperAdmin: () => true,
    hasModule: () => true,
    has: () => true,
    canViewPricesAnywhere: () => true,
  };
}

/**
 * Serialisierung für GET /auth/me (ohne Passwort).
 * @param {AccessProfile} profile
 */
export function accessProfileToJson(profile) {
  /** @type {Record<string, Record<string, RightsFlags>>} */
  const rights = {};
  if (profile.isSuperAdmin()) {
    for (const mod of ['cockpit', 'fusa', 'ccintern']) {
      rights[mod] = {};
      for (const b of bereicheForModule(/** @type {AppModule} */ (mod))) {
        rights[mod][b] = fullRightsFlags();
      }
    }
    return {
      global_role: profile.globalRole,
      modules: [...ALL_MODULES_LIST],
      rights,
    };
  }
  for (const mod of profile.modules) {
    rights[mod] = {};
    for (const b of bereicheForModule(mod)) {
      rights[mod][b] = { ...(profile.rightsByKey.get(key(mod, b)) || emptyRightsFlags()) };
    }
  }
  return {
    global_role: profile.globalRole,
    modules: [...profile.modules],
    rights,
  };
}

const ALL_MODULES_LIST = ['cockpit', 'fusa', 'ccintern'];
