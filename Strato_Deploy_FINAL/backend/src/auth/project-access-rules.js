/** @typedef {'admin'|'editor'|'viewer'} ProjectRole */

export const PROJECT_ROLES = /** @type {const} */ (['admin', 'editor', 'viewer']);

/**
 * @param {unknown} role
 * @returns {role is ProjectRole}
 */
export function isValidProjectRole(role) {
  return typeof role === 'string' && PROJECT_ROLES.includes(/** @type {ProjectRole} */ (role));
}

/**
 * Standard-Flags pro Rolle; können bei Zuweisung explizit überschrieben werden.
 * @param {ProjectRole} role
 */
export function defaultFlagsForRole(role) {
  switch (role) {
    case 'admin':
      return {
        can_view_prices: true,
        can_edit: true,
        can_create_auftraege: true,
      };
    case 'editor':
      return {
        can_view_prices: true,
        can_edit: true,
        can_create_auftraege: true,
      };
    case 'viewer':
      return {
        can_view_prices: false,
        can_edit: false,
        can_create_auftraege: false,
      };
    default:
      return {
        can_view_prices: false,
        can_edit: false,
        can_create_auftraege: false,
      };
  }
}

/**
 * @param {unknown} v
 * @returns {boolean|undefined} undefined = nicht gesetzt
 */
export function parseOptionalBool(v) {
  if (v === undefined) return undefined;
  if (v === null) return undefined;
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return undefined;
}

/**
 * @param {object} row SQLite-Zeile mit Integer 0/1
 * @returns {{ role: ProjectRole, can_view_prices: boolean, can_edit: boolean, can_create_auftraege: boolean }}
 */
export function accessRowToEffective(row) {
  if (!row) {
    return {
      role: 'viewer',
      can_view_prices: false,
      can_edit: false,
      can_create_auftraege: false,
    };
  }
  return {
    role: /** @type {ProjectRole} */ (String(row.role)),
    can_view_prices: Number(row.can_view_prices) === 1,
    can_edit: Number(row.can_edit) === 1,
    can_create_auftraege: Number(row.can_create_auftraege) === 1,
  };
}

/**
 * Zentrale Prüfungen (ohne HTTP).
 */
export function createProjectAccessService(store) {
  return {
    /**
     * @param {string} userId
     * @param {string} projectId
     * @returns {Promise<object|null>}
     */
    async getAccessRow(userId, projectId) {
      return store.getProjectAccessByUserAndProject(userId, projectId);
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async hasAccess(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row != null;
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async canViewPrices(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row != null && Number(row.can_view_prices) === 1;
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async canEdit(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row != null && Number(row.can_edit) === 1;
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async canCreateAuftraege(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row != null && Number(row.can_create_auftraege) === 1;
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async getRole(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row ? String(row.role) : null;
    },

    /**
     * @param {string} userId
     * @param {string} projectId
     */
    async isProjectAdmin(userId, projectId) {
      const row = await store.getProjectAccessByUserAndProject(userId, projectId);
      return row != null && String(row.role) === 'admin';
    },

    /**
     * @param {string} projectId
     */
    async countAccessForProject(projectId) {
      return store.countProjectAccessForProject(projectId);
    },
  };
}
