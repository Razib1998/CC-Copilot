// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Core Users  (§7 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Hilfsfunktionen für User-Verwaltung.
//  WICHTIG: window.isUserGesperrt, window.userMayUseApp kommen aus state.js
//           → diese werden hier NICHT überschrieben.
//  Laden NACH state.js + cc-global.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /** Gibt einen User anhand der ID zurück. */
  function getUserById(userId) {
    return (typeof USERS !== 'undefined' ? USERS : [])
      .find(function (u) { return u.id === userId; }) || null;
  }

  /** Gibt alle aktiven User zurück. */
  function getActiveUsers() {
    return (typeof USERS !== 'undefined' ? USERS : [])
      .filter(function (u) { return u.aktiv !== false; });
  }

  /** Gibt alle User einer Firma zurück. */
  function getUsersByFirma(firmaId) {
    return (typeof USERS !== 'undefined' ? USERS : [])
      .filter(function (u) { return u.firmaId === firmaId && u.aktiv !== false; });
  }

  /** Alle User die die App nutzen dürfen. Nutzt userMayUseApp aus state.js falls vorhanden. */
  function getAppUsers() {
    var mayUse = window.userMayUseApp;   // aus state.js
    var gesperrt = window.isUserGesperrt; // aus state.js
    return getActiveUsers().filter(function (u) {
      if (typeof gesperrt === 'function' && gesperrt(u)) return false;
      if (typeof mayUse   === 'function') return mayUse(u);
      return true;
    });
  }

  /** Formatiert den Anzeigenamen eines Users. */
  function formatUserName(userId) {
    var user = getUserById(userId);
    return user ? user.name : '(unbekannt)';
  }

  /** Alle User die einem Projekt angehören. */
  function getProjectUsers(projectId) {
    var projects = typeof MesseFlowState !== 'undefined'
      ? MesseFlowState.projects
      : (typeof state !== 'undefined' ? state.projects : []);
    var proj = projects.find(function (p) { return p.id === projectId; });
    if (!proj) return [];
    var ids = new Set();
    (proj.projektMitglieder || []).forEach(function (m) { if (m.userId) ids.add(m.userId); });
    if (proj.zwischenhaendler_id) ids.add(proj.zwischenhaendler_id);
    if (proj.koordinator_id)      ids.add(proj.koordinator_id);
    (proj.intern_ids || []).forEach(function (id) { ids.add(id); });
    return [...ids].map(getUserById).filter(Boolean);
  }

  // ── Exports: nur neue Funktionen, die state.js NICHT hat ─────────────────
  window.getUserById      = window.getUserById      || getUserById;
  window.getActiveUsers   = window.getActiveUsers   || getActiveUsers;
  window.getUsersByFirma  = window.getUsersByFirma  || getUsersByFirma;
  window.getAppUsers      = window.getAppUsers      || getAppUsers;
  window.formatUserName   = window.formatUserName   || formatUserName;
  window.getProjectUsers  = window.getProjectUsers  || getProjectUsers;

  // CC-Namespace
  if (window.CC && window.CC.core) {
    window.CC.core.users = window.CC.core.users || {};
    Object.assign(window.CC.core.users, {
      getUserById:     getUserById,
      getActiveUsers:  getActiveUsers,
      getUsersByFirma: getUsersByFirma,
      getAppUsers:     getAppUsers,
      formatName:      formatUserName,
      getProjectUsers: getProjectUsers,
      // Delegieren an state.js Originals
      isGesperrt:      function (u) {
        return typeof window.isUserGesperrt === 'function' ? window.isUserGesperrt(u) : false;
      },
      hasAccess:       window.CC && window.CC.core && window.CC.core.users
                       ? window.CC.core.users.hasAccess : function () { return false; },
    });
  }
})();
