// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Projekt-Sichtbarkeit  (§7 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  WICHTIG: window.canSeeProject wird von state.js gesetzt (Signatur: user-Objekt, projekt-Objekt).
//  Diese Datei ÜBERSCHREIBT window.canSeeProject NICHT.
//  Sie liefert nur Cockpit-interne Hilfsfunktionen (ccwCanSeeProject, getVisibleProjectIds).
//  Laden NACH state.js (braucht USERS, PROJECTS, canSeeProject).
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /**
   * Cockpit-Adapter: prüft Projekt-Sichtbarkeit via userId (String).
   * Delegiert an die kanonische canSeeProject(userObj, projektObj) aus state.js.
   * @param {string} userId
   * @param {string} projectId
   * @returns {boolean}
   */
  function ccwCanSeeProject(userId, projectId) {
    var canSee = window.canSeeProject; // aus state.js: (userObj, projektObj)
    if (typeof canSee !== 'function') return false;

    var user = (typeof USERS !== 'undefined' ? USERS : [])
      .find(function (u) { return u.id === userId; });
    if (!user) return false;

    var proj = (typeof MesseFlowState !== 'undefined'
        ? MesseFlowState.projects
        : (typeof state !== 'undefined' ? state.projects : []))
      .find(function (p) { return p.id === projectId; });
    if (!proj) return false;

    return canSee(user, proj);
  }

  /**
   * Gibt alle für userId sichtbaren Projekt-IDs zurück.
   * @param {string} userId
   * @returns {string[]}
   */
  function getVisibleProjectIds(userId) {
    var getVisible = window.getVisibleProjects; // aus state.js
    if (typeof getVisible === 'function') {
      return getVisible(userId).map(function (p) { return p.id; });
    }
    return [];
  }

  // Nur Cockpit-interne Namen – keine Überschreibung von state.js-Exporten
  window.ccwCanSeeProject      = ccwCanSeeProject;
  window.getVisibleProjectIds  = getVisibleProjectIds;

  // CC.core.access
  if (window.CC && window.CC.core) {
    window.CC.core.access = window.CC.core.access || {};
    window.CC.core.access.canSeeProject        = ccwCanSeeProject;
    window.CC.core.access.getVisibleProjectIds = getVisibleProjectIds;
  }
})();
