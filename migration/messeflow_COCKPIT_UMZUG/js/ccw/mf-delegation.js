// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – MF-Delegation  (§2 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Verarbeitet data-mf-action Attribute.
//  1 Button = 1 navKey = 1 View (§2).
//  Delegiert Aktionen an die richtige View-Funktion.
//  Laden NACH ui-registry.js + messeflow-app.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Aktions-Handler-Map ───────────────────────────────────────────────────
  var _actionHandlers = {};

  /**
   * Registriert einen Handler für eine data-mf-action.
   * @param {string} action  – Wert des data-mf-action Attributs
   * @param {Function} handler – function(element, event)
   */
  function registerAction(action, handler) {
    if (_actionHandlers[action]) {
      console.warn('[MFDelegation] Überschreibe Handler für:', action);
    }
    _actionHandlers[action] = handler;
  }

  /**
   * Führt eine registrierte Aktion aus.
   * @param {string} action
   * @param {Element} el
   * @param {Event} ev
   */
  function dispatchAction(action, el, ev) {
    var handler = _actionHandlers[action];
    if (!handler) {
      console.warn('[MFDelegation] Kein Handler für action:', action);
      return;
    }
    try {
      handler(el, ev);
    } catch (e) {
      console.error('[MFDelegation] Handler-Fehler:', action, e);
    }
  }

  // ── Globaler Klick-Listener (Event-Delegation) ───────────────────────────
  document.addEventListener('click', function (ev) {
    var el = ev.target.closest('[data-mf-action]');
    if (!el) return;
    var action = el.getAttribute('data-mf-action');
    if (!action) return;
    ev.preventDefault();
    dispatchAction(action, el, ev);
  }, { capture: false });

  // ── Standard-Actions registrieren ────────────────────────────────────────

  // NavKey: Projekt auswählen
  registerAction('selectProj', function (el) {
    var id = el.getAttribute('data-proj-id') || el.dataset.projId;
    if (id && typeof selectProj === 'function') selectProj(id);
  });

  // NavKey: Neues Projekt
  registerAction('newProj', function () {
    if (typeof openNewProjModal === 'function') openNewProjModal();
  });

  // NavKey: Admin-Zentrale
  registerAction('openAdmin', function () {
    if (typeof openAdminView === 'function') openAdminView();
  });

  // NavKey: Benachrichtigungen
  registerAction('toggleNotif', function () {
    if (typeof toggleNotif === 'function') toggleNotif();
  });

  // NavKey: Excel-Import
  registerAction('importExcel', function () {
    var input = document.getElementById('xl-sidebar-input');
    if (input) input.click();
  });

  // Exports
  window.CCWDelegation = {
    register:  registerAction,
    dispatch:  dispatchAction,
  };

  console.log('[MFDelegation] Bereit');
})();
