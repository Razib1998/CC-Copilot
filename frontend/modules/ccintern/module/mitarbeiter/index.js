// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/mitarbeiter/index.js
// ─────────────────────────────────────────────────────────────────────
// Funktionale Erweiterung für Mitarbeiter-Übersicht.
//
// IST-Stand (index.html):
//   loadMitarbeiter() → DataService.loadAsync()   ✅ Server-first
//   saveMitarbeiter() → DataService.save()         ✅ Dual-Write
//   Stammdaten: maId, n, r, av, col, soll, urlaub (vollständig)
//
// Was dieses Modul hinzufügt:
//   1. Quick-Verfügbarkeit — Status pro MA ohne Settings öffnen
//      { verfuegbar | abwesend | krank | urlaub | homeoffice }
//      Cockpit: `POST /api/v1/ccintern/mitarbeiter/status` + `window.MA_VERF`
//   2. Wrap renderMitarbeiter() → Status-Badge auf Karte
//   3. maSetVerfuegbar(maId, status) + Quick-Toggle im Popup
//   4. MitarbeiterService Export
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── Verfügbarkeits-Status-Store (Cockpit: window.MA_VERF + API) ─────
  function maVerfMap() {
    if (!window.MA_VERF) window.MA_VERF = {};
    return window.MA_VERF;
  }

  var VERF_LABELS = {
    verfuegbar:  { label: '✓ Verfügbar',   color: 'var(--green)',  badge: '●' },
    homeoffice:  { label: '🏠 Homeoffice', color: 'var(--blue)',   badge: '🏠' },
    abwesend:    { label: '⚫ Abwesend',   color: 'var(--text3)',  badge: '—' },
    krank:       { label: '🤒 Krank',      color: 'var(--red)',    badge: '🤒' },
    urlaub:      { label: '🌴 Urlaub',     color: 'var(--amber)',  badge: '🌴' },
  };

  function loadVerfuegbar() {
    if (window.__CCINTERN_COCKPIT_MOUNT__) return;
    window.MA_VERF = {};
  }

  // ── Quick-Status setzen ──────────────────────────────────────────────
  window.maSetVerfuegbar = function(maId, status) {
    if (!maId) return;
    var st = status || 'verfuegbar';
    function applyLocal() {
      maVerfMap()[maId] = st;
      closeVerfuegbarPicker();
      if (typeof renderMitarbeiter === 'function') renderMitarbeiter();
    }
    if (
      window.__CCINTERN_COCKPIT_MOUNT__ &&
      window.CCIntern &&
      window.CCIntern.cockpitApi &&
      typeof window.CCIntern.cockpitApi.postMitarbeiterTagStatus === 'function'
    ) {
      var toast = typeof showToast === 'function' ? showToast : null;
      window.CCIntern.cockpitApi
        .postMitarbeiterTagStatus(maId, st, null, toast)
        .then(applyLocal)
        .catch(function (e) {
          console.error('[Mitarbeiter] Status API', e);
          if (toast) toast('⚠ Status konnte nicht gespeichert werden.');
        });
      return;
    }
    applyLocal();
  };

  // ── Picker Popup schließen ───────────────────────────────────────────
  function closeVerfuegbarPicker() {
    var p = document.getElementById('ma-verf-picker');
    if (p) p.remove();
  }

  // ── Picker Popup öffnen ──────────────────────────────────────────────
  window.maOpenVerfuegbarPicker = function(maId, anchorEl) {
    closeVerfuegbarPicker();
    var current = maVerfMap()[maId] || 'verfuegbar';

    var picker = document.createElement('div');
    picker.id = 'ma-verf-picker';
    picker.style.cssText = [
      'position:fixed;z-index:900;background:#fff;border:1px solid var(--border);',
      'border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,.18);padding:6px 0;',
      'min-width:170px;',
    ].join('');

    var html = '<div style="font-size:10px;font-weight:700;color:var(--text3);padding:6px 14px 4px;letter-spacing:.06em;">STATUS SETZEN</div>';
    Object.keys(VERF_LABELS).forEach(function(key) {
      var vl = VERF_LABELS[key];
      var isActive = (key === current);
      html += '<div onclick="maSetVerfuegbar(\''+maId+'\',\''+key+'\')" '
        + 'style="display:flex;align-items:center;gap:9px;padding:7px 14px;cursor:pointer;'
        + (isActive ? 'background:var(--bg2);font-weight:700;' : '')
        + 'font-size:13px;transition:background .12s;" '
        + 'onmouseover="this.style.background=\'var(--bg2)\'" onmouseout="this.style.background=\''+(isActive?'var(--bg2)':'\'\'')+'\'>"'
        + '<span style="color:'+vl.color+';font-size:14px;">'+vl.badge+'</span>'
        + '<span style="color:'+(isActive?'var(--text1)':'var(--text2)')+'">'+vl.label+'</span>'
        + '</div>';
    });
    picker.innerHTML = html;
    document.body.appendChild(picker);

    // Position unter dem Auslöser
    if (anchorEl) {
      var rect = anchorEl.getBoundingClientRect();
      picker.style.top  = (rect.bottom + 6) + 'px';
      picker.style.left = Math.min(rect.left, window.innerWidth - 185) + 'px';
    } else {
      picker.style.top  = '50%';
      picker.style.left = '50%';
      picker.style.transform = 'translate(-50%,-50%)';
    }

    // Schließen bei Klick außerhalb
    setTimeout(function() {
      document.addEventListener('click', function _close(e) {
        if (!picker.contains(e.target)) {
          picker.remove();
          document.removeEventListener('click', _close);
        }
      });
    }, 100);
  };

  // ── Wraps installieren (nach DOMContentLoaded) ───────────────────────
  function _installWraps() {
    // renderMitarbeiter: Status-Badges auf jede MA-Karte
    var _origRenderMitarbeiter = window.renderMitarbeiter;
    window.renderMitarbeiter = function() {
      if (typeof _origRenderMitarbeiter === 'function') _origRenderMitarbeiter();
      setTimeout(function() {
        var cards = document.querySelectorAll('.ma-card');
        cards.forEach(function(card) {
          var onclick = card.getAttribute('onclick') || '';
          var match = onclick.match(/maOpenDetail\('([^']+)'\)/);
          if (!match) return;
          var maId = match[1];
          var status = maVerfMap()[maId] || 'verfuegbar';
          var vl = VERF_LABELS[status] || VERF_LABELS.verfuegbar;
          var existing = card.querySelector('.ma-verf-badge');
          if (existing) existing.remove();
          var badge = document.createElement('button');
          badge.className = 'ma-verf-badge';
          badge.title = 'Status: ' + vl.label + ' — klicken zum Ändern';
          badge.style.cssText = [
            'position:absolute;top:6px;right:6px;',
            'border:1px solid var(--border);border-radius:6px;',
            'background:#fff;padding:2px 7px;font-size:11px;',
            'cursor:pointer;color:'+vl.color+';font-weight:700;',
            'box-shadow:0 1px 4px rgba(0,0,0,.08);z-index:2;',
          ].join('');
          badge.textContent = vl.badge + ' ' + vl.label.replace(/^[^\s]+\s/, '');
          badge.onclick = function(e) {
            e.stopPropagation();
            window.maOpenVerfuegbarPicker(maId, badge);
          };
          var rel = card.querySelector('div[style*="position:relative"]');
          if (rel) { rel.style.position = 'relative'; rel.appendChild(badge); }
          else { card.style.position = 'relative'; card.appendChild(badge); }
        });
      }, 50);
    };
    // goPage: re-render bei Wechsel zur MA-Seite
    var _origGoPage = window.goPage;
    window.goPage = function(id) {
      var r = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'mitarbeiter') {
        setTimeout(function() {
          if (typeof renderMitarbeiter === 'function') renderMitarbeiter();
        }, 60);
      }
      return r;
    };
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    loadVerfuegbar();
    _installWraps();
    if (typeof renderMitarbeiter === 'function') {
      var grid = document.getElementById('maGrid');
      if (grid && grid.children.length > 0) renderMitarbeiter();
    }
    console.info('[Mitarbeiter] Quick-Verfügbarkeit geladen — ' + Object.keys(maVerfMap()).length + ' Einträge');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 500); });
  } else {
    setTimeout(init, 500);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.MitarbeiterService = {
    getVerfuegbar: function(maId) {
      return maVerfMap()[maId] || 'verfuegbar';
    },
    setVerfuegbar: window.maSetVerfuegbar,
    reload: function() {
      loadVerfuegbar();
      if (typeof renderMitarbeiter === 'function') renderMitarbeiter();
    },
  };

  console.info('[CC] mitarbeiter/index.js geladen — Quick-Verfügbarkeit aktiv');

})();
