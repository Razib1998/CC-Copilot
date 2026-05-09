// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – FUSA-Modul  (§2 FUSA NavKeys + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  FUSA NavKeys: dashboard, auftraege, fahrzeuge, kunden, rechnungen,
//               quartalsabrechnung, dokumente, schaeden, kalender,
//               benutzer, rollen
//  WICHTIG: auftraege ≠ orders (§2 Sonderfall)
//  Laden NACH ui-registry.js + module-events.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var FUSA_NAV_KEYS = [
    'dashboard', 'auftraege', 'fahrzeuge', 'kunden', 'rechnungen',
    'quartalsabrechnung', 'dokumente', 'schaeden', 'kalender',
    'benutzer', 'rollen',
  ];

  var _state = {
    activeNavKey: 'dashboard',
    shell:        'fusa',
  };

  function activateFusaNavKey(navKey, params) {
    if (!FUSA_NAV_KEYS.includes(navKey)) {
      console.warn('[FUSA] Unbekannter NavKey:', navKey);
      return;
    }
    _state.activeNavKey = navKey;

    // aria-current (§1.1 A11Y)
    document.querySelectorAll('[data-fusa-nav]').forEach(function (btn) {
      btn.setAttribute('aria-current', btn.dataset.fusaNav === navKey ? 'page' : 'false');
    });

    // Fokus auf Main
    if (window.CCWUIRegistry) window.CCWUIRegistry.focusMainArea();

    // Minimal-View
    var viewEl = document.getElementById('view') || document.getElementById('main');
    if (viewEl) {
      viewEl.innerHTML = '<div style="padding:18px;">' +
        '<h2 style="font-size:16px;font-weight:700;margin-bottom:8px;">FUSA – ' + navKey + '</h2>' +
        '<p style="color:var(--muted);">Modul wird geladen…</p>' +
        '</div>';
    }

    console.log('[FUSA] NavKey aktiviert:', navKey);
  }

  // Exports
  window.CCWFusa = {
    activate: activateFusaNavKey,
    navKeys:  FUSA_NAV_KEYS,
    getState: function () { return Object.assign({}, _state); },
  };

  // NavKeys in UIRegistry registrieren
  if (window.CCWUIRegistry) {
    FUSA_NAV_KEYS.forEach(function (key) {
      window.CCWUIRegistry.registerNavKey('fusa.' + key, function (params) {
        activateFusaNavKey(key, params);
      });
    });
  }

  console.log('[FUSA] Bereit –', FUSA_NAV_KEYS.length, 'NavKeys');
})();
