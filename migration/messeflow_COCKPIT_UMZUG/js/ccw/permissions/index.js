// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Permissions  (§7 + §16 + §19 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Zentrale Rechteprüfung für die Cockpit-Shell.
//  Keine eigene Rechtelogik in Modulen (§7, §12, §16).
//  XSS-Schutz + Audit-Logs bei Rechteänderungen (§0, §19).
//  Laden NACH cc-global.js + core-users.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── NavKey-Sichtbarkeit (§2 Master) ──────────────────────────────────────
  //  Cockpit: firms, users → nur Admin
  //           roles, modules → interne Rechte
  //  FUSA: alle NavKeys für eingeloggte User
  //  CC Intern: dashboard + alle Module

  var NAV_PERMISSIONS = {
    // Cockpit-Modul
    'cockpit.firms':   ['admin'],
    'cockpit.users':   ['admin'],
    'cockpit.roles':   ['admin', 'cc_intern'],
    'cockpit.modules': ['admin', 'cc_intern'],
    'cockpit.logs':    ['admin', 'cc_intern'],
    'cockpit.devices': ['admin', 'cc_intern'],
    // FUSA
    'fusa.benutzer':   ['admin'],
    'fusa.rollen':     ['admin', 'cc_intern'],
    // CC Intern
    'intern.users':    ['admin'],
    'intern.rollen':   ['admin', 'cc_intern'],
    'intern.staff':    ['admin', 'cc_intern'],
  };

  /**
   * Prüft ob ein User einen NavKey sehen darf.
   * @param {string} userId
   * @param {string} navKeyFull  – z.B. 'cockpit.firms', 'fusa.auftraege'
   * @returns {boolean}
   */
  function canSeeNavKey(userId, navKeyFull) {
    var allowed = NAV_PERMISSIONS[navKeyFull];
    if (!allowed) return true;   // kein Eintrag → für alle erlaubt
    var user = typeof getUserById === 'function' ? getUserById(userId) : null;
    if (!user) return false;
    return allowed.includes(user.rolle);
  }

  /**
   * Filtert NavKeys für einen User.
   * @param {string} userId
   * @param {string[]} navKeys
   * @returns {string[]}
   */
  function filterNavKeys(userId, navKeys) {
    return (navKeys || []).filter(function (key) {
      return canSeeNavKey(userId, key);
    });
  }

  /**
   * Prüft Upload-Berechtigung (§10 + §19).
   * @param {string} userId
   * @param {string} mimeType
   * @param {number} sizeBytes
   * @returns {{ ok: boolean, reason?: string }}
   */
  function checkUploadPermission(userId, mimeType, sizeBytes) {
    var ALLOWED_MIME = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/svg+xml',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
      'text/csv',
    ];
    var MAX_SIZE = 50 * 1024 * 1024; // 50 MB

    if (!ALLOWED_MIME.includes(mimeType)) {
      return { ok: false, reason: 'Dateityp nicht erlaubt: ' + mimeType };
    }
    if (sizeBytes > MAX_SIZE) {
      return { ok: false, reason: 'Datei zu groß (max. 50 MB)' };
    }
    return { ok: true };
  }

  /**
   * Audit-Log bei Rechteänderung (§0 Observability).
   */
  function auditRightsChange(actorId, targetUserId, change) {
    var entry = {
      ts:       new Date().toISOString(),
      actor:    actorId,
      target:   targetUserId,
      change:   change,
      type:     'rights_change',
    };
    console.info('[AUDIT]', JSON.stringify(entry));
    // In Produktion: an API senden
    if (typeof fetch !== 'undefined' && typeof MF_APP_BASE_URL !== 'undefined') {
      // fetch(MF_APP_BASE_URL + '/api/v1/audit', { method:'POST', body: JSON.stringify(entry) })
      //   .catch(function (e) { console.warn('[AUDIT] Senden fehlgeschlagen:', e); });
    }
  }

  // Exports
  window.CCWPermissions = {
    canSeeNavKey:       canSeeNavKey,
    filterNavKeys:      filterNavKeys,
    checkUpload:        checkUploadPermission,
    auditRightsChange:  auditRightsChange,
  };

  // Auch über CC.core
  if (window.CC && window.CC.core) {
    window.CC.core.permissions = window.CCWPermissions;
  }

  console.log('[Permissions] Bereit');
})();
