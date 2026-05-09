// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Platform (CC Intern)  (§2 CC Intern NavKeys + §27)
// ═══════════════════════════════════════════════════════════════════════════
//  CC Intern Module: dashboard, quick, angebote, orders, kunden, crm,
//                   messeflow, production, calendar, materiallager,
//                   checkliste, staff, urlaub, mitarbeiter_app,
//                   rechnungen, users, rollen
//  Einstieg: ccwDummyCcIntern (kein echter navKey, §2 Sonderfall)
//  Laden NACH ui-registry.js + module-events.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── CC Intern NavKeys (§2 Master) ─────────────────────────────────────────
  var CC_INTERN_NAV_KEYS = [
    'dashboard', 'quick', 'angebote', 'orders', 'kunden', 'crm',
    'messeflow', 'production', 'calendar', 'materiallager',
    'checkliste', 'staff', 'urlaub', 'mitarbeiter_app',
    'rechnungen', 'users', 'rollen',
  ];

  // ── Sonderfall Einstieg (§2) ──────────────────────────────────────────────
  var CCW_DUMMY_CC_INTERN = 'ccwDummyCcIntern';  // kein echter NavKey

  // ── Platform State ────────────────────────────────────────────────────────
  var _state = {
    activeNavKey: 'dashboard',
    shell:        'cc_intern',
  };

  // ── NavKey aktivieren ────────────────────────────────────────────────────
  function activateInternNavKey(navKey, params) {
    if (!CC_INTERN_NAV_KEYS.includes(navKey)) {
      console.warn('[Platform] Unbekannter CC Intern NavKey:', navKey);
      return;
    }
    _state.activeNavKey = navKey;

    // aria-current aktualisieren (§1.1 A11Y)
    document.querySelectorAll('[data-intern-nav]').forEach(function (btn) {
      btn.setAttribute('aria-current',
        btn.dataset.internNav === navKey ? 'page' : 'false');
    });

    // View laden
    _loadView(navKey, params);

    // Fokus auf Main (§1.1 A11Y)
    if (window.CCWUIRegistry) {
      window.CCWUIRegistry.focusMainArea();
    }
  }

  // ── View-Loader ──────────────────────────────────────────────────────────
  function _loadView(navKey, params) {
    var viewEl = document.getElementById('view') || document.getElementById('main');
    if (!viewEl) return;

    switch (navKey) {
      case 'dashboard':
        viewEl.innerHTML = _renderDashboard();
        break;
      case 'messeflow':
        // MesseFlow ist eingebettetes Modul – kein eigenes Top-Level (§8)
        if (typeof renderSidebar === 'function') renderSidebar();
        break;
      case 'calendar':
        viewEl.innerHTML = _renderCalendarPlaceholder();
        break;
      default:
        viewEl.innerHTML = '<div style="padding:32px;color:var(--muted);">Modul: <strong>' +
          navKey + '</strong><br>Wird geladen…</div>';
    }
  }

  // ── Einfache Dashboard-Ansicht ───────────────────────────────────────────
  function _renderDashboard() {
    return '<div style="padding:18px;">' +
      '<h2 style="font-size:18px;font-weight:800;margin-bottom:16px;">CC Intern – Dashboard</h2>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;">' +
      CC_INTERN_NAV_KEYS.map(function (key) {
        return '<div style="background:#fff;border:1px solid var(--line);border-radius:10px;' +
          'padding:14px;cursor:pointer;transition:box-shadow .12s;" ' +
          'data-intern-nav="' + key + '" ' +
          'onclick="CCWPlatform.activate(\'' + key + '\')">' +
          '<div style="font-weight:700;font-size:13px;">' + key + '</div>' +
          '</div>';
      }).join('') +
      '</div></div>';
  }

  function _renderCalendarPlaceholder() {
    return '<div style="padding:18px;">' +
      '<h2 style="font-size:16px;font-weight:700;margin-bottom:12px;">Kalender</h2>' +
      '<p style="color:var(--muted);">Kalender-Kernel: ccw-calendar-kernel.js</p>' +
      '</div>';
  }

  // Exports
  window.CCWPlatform = {
    activate:    activateInternNavKey,
    navKeys:     CC_INTERN_NAV_KEYS,
    dummyEntry:  CCW_DUMMY_CC_INTERN,
    getState:    function () { return Object.assign({}, _state); },
  };

  console.log('[Platform] CC Intern bereit –', CC_INTERN_NAV_KEYS.length, 'NavKeys');
})();
