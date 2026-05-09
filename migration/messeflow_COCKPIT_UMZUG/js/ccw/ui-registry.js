// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – UI-Registry  (§2 + §17 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Zentrale Registrierung aller UI-Komponenten.
//  Einheitliche Komponenten, gleiche Abstände, gleiche Interaktion (§17).
//  Laden NACH cc-global.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var _components = {};
  var _navHandlers = {};

  // ── Komponenten-Registry ─────────────────────────────────────────────────

  /**
   * Registriert eine UI-Komponente.
   * @param {string} name
   * @param {{ render: Function, update?: Function, destroy?: Function }} component
   */
  function registerComponent(name, component) {
    _components[name] = component;
  }

  /**
   * Rendert eine registrierte Komponente in ein Element.
   * @param {string} name
   * @param {Element|string} target – Element oder CSS-Selektor
   * @param {Object} props
   */
  function renderComponent(name, target, props) {
    var comp = _components[name];
    if (!comp) {
      console.warn('[UIRegistry] Komponente nicht gefunden:', name);
      return;
    }
    var el = typeof target === 'string'
      ? document.querySelector(target) : target;
    if (!el) {
      console.warn('[UIRegistry] Ziel-Element nicht gefunden:', target);
      return;
    }
    try {
      comp.render(el, props || {});
    } catch (e) {
      console.error('[UIRegistry] Render-Fehler:', name, e);
    }
  }

  // ── NavKey-Registry ──────────────────────────────────────────────────────
  // 1 navKey = 1 View (§2)

  /**
   * Registriert einen NavKey-Handler.
   * @param {string} navKey   – z. B. 'dashboard', 'auftraege'
   * @param {Function} handler – function(params)
   */
  function registerNavKey(navKey, handler) {
    _navHandlers[navKey] = handler;
  }

  /**
   * Aktiviert einen NavKey (navigiert zur View).
   * @param {string} navKey
   * @param {Object} params
   */
  function activateNavKey(navKey, params) {
    // aria-current setzen (§1.1 A11Y)
    document.querySelectorAll('[data-nav-key]').forEach(function (btn) {
      btn.setAttribute('aria-current', btn.dataset.navKey === navKey ? 'page' : 'false');
    });

    var handler = _navHandlers[navKey];
    if (!handler) {
      console.warn('[UIRegistry] Kein NavKey-Handler:', navKey);
      return;
    }
    try {
      handler(params || {});
    } catch (e) {
      console.error('[UIRegistry] NavKey-Fehler:', navKey, e);
    }
  }

  /**
   * Gibt alle registrierten NavKeys zurück.
   */
  function getRegisteredNavKeys() {
    return Object.keys(_navHandlers);
  }

  // ── Standard-Komponenten ─────────────────────────────────────────────────

  // Projekt-Liste Sidebar
  registerComponent('proj-list', {
    render: function (el) {
      if (typeof renderSidebar === 'function') renderSidebar();
    }
  });

  // ── Fokussteuerung nach Navigation (§1.1 A11Y) ───────────────────────────
  function focusMainArea() {
    var main = document.getElementById('main') || document.getElementById('view');
    if (main) {
      main.setAttribute('tabindex', '-1');
      main.focus({ preventScroll: true });
    }
  }

  // Exports
  window.CCWUIRegistry = {
    registerComponent: registerComponent,
    renderComponent:   renderComponent,
    registerNavKey:    registerNavKey,
    activateNavKey:    activateNavKey,
    getNavKeys:        getRegisteredNavKeys,
    focusMainArea:     focusMainArea,
  };

  console.log('[UIRegistry] Bereit');
})();
