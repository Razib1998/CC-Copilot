// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Globales CC-Objekt  (§7 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  window.CC  ist der zentrale Namespace für alle globalen Cockpit-APIs.
//  Laden als ERSTES Skript nach config.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  if (window.CC && window.CC.__initialized) {
    console.warn('[CC-Global] bereits initialisiert – Skip');
    return;
  }

  // ── CC-Namespace ─────────────────────────────────────────────────────────
  window.CC = window.CC || {};
  window.CC.__initialized = true;
  window.CC.__version     = '1.0.0-cockpit';

  // ── CC.core.users – Rechteprüfung (§7) ──────────────────────────────────
  window.CC.core = window.CC.core || {};
  window.CC.core.users = {
    /**
     * Prüft ob userId in projectId Zugriff hat.
     * @param {string} userId
     * @param {string} projectId
     * @returns {boolean}
     */
    hasAccess: function (userId, projectId) {
      if (typeof canUserAccessProject === 'function') {
        return canUserAccessProject(userId, projectId);
      }
      // Fallback: Project-Visibility
      if (typeof canSeeProject === 'function') {
        return canSeeProject(userId, projectId);
      }
      // Fallback: state.js USERS
      if (typeof USERS !== 'undefined' && typeof PROJECTS !== 'undefined') {
        var user = USERS.find(function (u) { return u.id === userId; });
        if (!user) return false;
        if (user.rolle === 'admin' || user.rolle === 'cc_intern') return true;
        var proj = PROJECTS.find(function (p) { return p.id === projectId; });
        if (!proj) return false;
        if (proj.zwischenhaendler_id === userId) return true;
        if (proj.koordinator_id === userId) return true;
        return (proj.projektMitglieder || []).some(function (m) { return m.userId === userId; });
      }
      return false;
    },

    /**
     * Gibt alle Zugriffsflags für einen User auf ein Projekt zurück.
     * @param {string} userId
     * @param {string} projectId
     * @returns {{ canView: boolean, canEdit: boolean, canApprove: boolean }}
     */
    getProjectAccessFlags: function (userId, projectId) {
      if (typeof getProjectAccessFlags === 'function') {
        return getProjectAccessFlags(userId, projectId);
      }
      var hasAccess = window.CC.core.users.hasAccess(userId, projectId);
      if (!hasAccess) return { canView: false, canEdit: false, canApprove: false };
      var user = typeof USERS !== 'undefined'
        ? USERS.find(function (u) { return u.id === userId; }) : null;
      var isAdmin = user && (user.rolle === 'admin' || user.rolle === 'cc_intern');
      return {
        canView:    true,
        canEdit:    isAdmin,
        canApprove: isAdmin,
      };
    },

    /**
     * Prüft ob ein User eine bestimmte Aktion ausführen darf.
     */
    canUserPerform: function (userId, action, context) {
      if (typeof canUserPerform === 'function') {
        return canUserPerform(userId, action, context);
      }
      var user = typeof USERS !== 'undefined'
        ? USERS.find(function (u) { return u.id === userId; }) : null;
      if (!user) return false;
      var role = typeof ROLES !== 'undefined'
        ? ROLES.find(function (r) { return r.id === user.rolle; }) : null;
      if (!role) return false;
      switch (action) {
        case 'editAll':       return !!role.permissions.editAll;
        case 'manageUsers':   return !!role.permissions.manageUsers;
        case 'seeAll':        return !!role.permissions.seeAll;
        case 'editProduction':return !!role.permissions.editProduction;
        default:              return false;
      }
    },
  };

  // ── CC.notify – Shell-Benachrichtigung ──────────────────────────────────
  window.CC.notify = function (type, data) {
    console.log('[CC.notify]', type, data);
    // Hier kann die Cockpit-Shell eigene Toast/Badge-Logik einbauen
    if (typeof window.showToast === 'function') {
      var msg = data && data.message ? data.message : type;
      window.showToast(msg, type === 'approval' ? 'warn' : 'info');
    }
  };

  // ── CCW State-Adapter (§3) ────────────────────────────────────────────────
  window.CCWState = {
    _data: {},
    set: function (key, value) {
      this._data[key] = value;
      // Sync mit globalen State-Variablen (Legacy-Kompatibilität)
      if (key === 'activeProjId' && typeof window !== 'undefined') {
        window.activeProjId = value;
      }
    },
    get: function (key) {
      return this._data[key];
    },
  };

  // ── CCW globales Ausschalten eines Moduls (§8) ────────────────────────────
  window.ccwModuleGlobalOff = function (moduleId) {
    console.log('[CC] Modul deaktiviert:', moduleId);
    var el = document.getElementById('ccw-module-' + moduleId);
    if (el) el.style.display = 'none';
  };

  console.log('[CC-Global] v' + window.CC.__version + ' bereit');
})();
