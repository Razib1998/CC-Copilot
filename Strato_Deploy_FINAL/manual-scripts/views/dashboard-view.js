// ════════════════════════════════════════════════════════════════════
// CC INTERN — Dashboard: Cockpit API vor renderDashboard()
// Lädt Aufträge + Angebote (+ MA_DATA wenn cockpitApi-Helper existiert),
// danach unverändertes renderDashboard() aus module/dashboard/index.js.
// ════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function _ccDashboardCockpitApiKontext() {
    return !!(
      typeof window !== 'undefined' &&
      window.__CCINTERN_COCKPIT_MOUNT__ &&
      window.CCIntern &&
      window.CCIntern.auth &&
      typeof window.CCIntern.auth.apiFetch === 'function'
    );
  }

	  /** KPI „Aktive Aufträge“: nur step !== abgeschlossen (AUFTRAEGE, kein archiv-/Text-Status). */
	  function dashboardIsArchived(a) {
	    if (!a) return false;
	    var v = a.archiv != null ? a.archiv : a.archived;
	    if (v === true || v === 1) return true;
	    if (v === false || v === 0 || v == null) return false;
	    var s = String(v).trim().toLowerCase();
	    return s === 'true' || s === '1' || s === 'ja' || s === 'archiviert';
	  }

	  function dashboardCorrectAktiveAuftraegeKpi() {
	    var host = document.querySelector('.cc-intern-root') || document.body;
	    var root = host.querySelector('#pg-dashboard');
	    if (!root || !root.classList.contains('active')) return;
	    var arr = typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE) ? AUFTRAEGE : [];
	    var n = arr.filter(function (a) {
	      if (!a) return false;
	      if (dashboardIsArchived(a)) return false;
	      return String(a.step != null ? a.step : '').trim() !== 'abgeschlossen';
	    }).length;
    var el = root.querySelector('#db-stat-auftraege');
    if (el) el.textContent = String(n);
  }

  /** @param {unknown} raw */
  function dashboardParseTerminIso(raw) {
    if (raw == null) return null;
    var t = String(raw).trim();
    if (!t) return null;
    var iso10 = t.length >= 10 ? t.substring(0, 10) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso10)) return iso10;
    var m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (m) {
      var dd = m[1].length === 1 ? '0' + m[1] : m[1];
      var mm = m[2].length === 1 ? '0' + m[2] : m[2];
      return m[3] + '-' + mm + '-' + dd;
    }
    return null;
  }

  /** Aktiver Auftrag mit Liefer-/Montagetermin heute oder überfällig. */
  function dashboardIstProduktionDringendTermin(a) {
    if (!a) return false;
    if (String(a.step != null ? a.step : '').trim() === 'abgeschlossen') return false;
    var heute = new Date().toISOString().slice(0, 10);
    var felder = ['montageDatum', 'montage_datum', 'termin', 'terminDatum', 'liefertermin', 'lieferdatum'];
    for (var i = 0; i < felder.length; i++) {
      var d = dashboardParseTerminIso(a[felder[i]]);
      if (d && d <= heute) return true;
    }
    return false;
  }

  /** KPI „Produktion dringend“: nur Termin <= heute (kein urgent-only). */
  function dashboardCorrectProduktionDringendKpi() {
    var host = document.querySelector('.cc-intern-root') || document.body;
    var root = host.querySelector('#pg-dashboard');
    if (!root || !root.classList.contains('active')) return;
    var arr = typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE) ? AUFTRAEGE : [];
    var n = arr.filter(dashboardIstProduktionDringendTermin).length;
    var el = root.querySelector('#db-stat-dringend');
    if (el) el.textContent = String(n);
  }

  /**
   * @returns {Promise<void>}
   */
  function dashboardCockpitEnsureGlobalsFromApi() {
    if (!_ccDashboardCockpitApiKontext()) {
      return Promise.resolve();
    }
    var capi = window.CCIntern && window.CCIntern.cockpitApi;
    var st = typeof showToast === 'function' ? showToast : null;
    /** @type {Promise<unknown>[]} */
    var jobs = [];
    if (capi && typeof capi.reloadAuftraegeFromApiIntoMemory === 'function') {
      jobs.push(Promise.resolve(capi.reloadAuftraegeFromApiIntoMemory(st)));
    }
    if (typeof agReloadListeFromApi === 'function') {
      jobs.push(Promise.resolve(agReloadListeFromApi()));
    }
    if (capi && typeof capi.reloadUsersFromApiIntoMaTarget === 'function') {
      jobs.push(Promise.resolve(capi.reloadUsersFromApiIntoMaTarget(st)));
    }
    return Promise.allSettled(jobs).then(function () {
      if (typeof AG_DATEN === 'undefined' || !Array.isArray(AG_DATEN)) return;
      if (typeof window.ANGEBOTE === 'undefined') window.ANGEBOTE = [];
      if (!Array.isArray(window.ANGEBOTE)) return;
      window.ANGEBOTE.length = 0;
      AG_DATEN.forEach(function (a) {
        if (!a) return;
        var g = a.gesamt != null ? a.gesamt : a.netto;
        window.ANGEBOTE.push(Object.assign({}, a, { gesamt: g }));
      });
    });
  }

  var _installTries = 0;
  function installDashboardApiWrap() {
    if (window.__CC_DASHBOARD_COCKPIT_API_WRAP) return;
    if (typeof window.renderDashboard !== 'function') {
      _installTries += 1;
      if (_installTries < 200) setTimeout(installDashboardApiWrap, 50);
      return;
    }
    window.__CC_DASHBOARD_COCKPIT_API_WRAP = true;
    var orig = window.renderDashboard;
    window.renderDashboard = function () {
      var args = arguments;
      var run = function () {
        var r = orig.apply(null, args);
        dashboardCorrectAktiveAuftraegeKpi();
        dashboardCorrectProduktionDringendKpi();
        return r;
      };
      if (!_ccDashboardCockpitApiKontext()) {
        return run();
      }
      return dashboardCockpitEnsureGlobalsFromApi()
        .catch(function (e) {
          console.warn('[dashboard-view] Cockpit-Daten vor Dashboard:', e);
        })
        .then(function () {
          run();
        });
    };
  }

  installDashboardApiWrap();
})();
