// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Core Projects  (§6 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Hilfsfunktionen für Projekt-Verwaltung.
//  Datum: YYYY-MM-DD / DateTime: UTC ISO (§6, §18).
//  Geld: Integer Cents, kein Float (§5).
//  Pagination + Filter im State (§6).
//  Laden NACH state.js + core-users.js.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  /** Gibt ein Projekt anhand der ID zurück. */
  function getProjectById(projectId) {
    return (typeof PROJECTS !== 'undefined' ? PROJECTS : [])
      .find(function (p) { return p.id === projectId; }) || null;
  }

  /** Gibt alle Projekte zurück, die für userId sichtbar sind. */
  function getVisibleProjects(userId) {
    if (typeof window.canSeeProject === 'function') {
      return (typeof PROJECTS !== 'undefined' ? PROJECTS : [])
        .filter(function (p) { return window.canSeeProject(userId, p.id); });
    }
    return typeof PROJECTS !== 'undefined' ? PROJECTS : [];
  }

  /** Gibt das aktive Projekt zurück (via activeProjId). */
  function getActiveProject() {
    var id = typeof activeProjId !== 'undefined' ? activeProjId : null;
    return id ? getProjectById(id) : null;
  }

  /**
   * Gibt den Status-Meta für ein Projekt zurück.
   * Delegiert an getProjektStatusMeta wenn vorhanden.
   */
  function getProjectStatusMeta(status) {
    if (typeof getProjektStatusMeta === 'function') {
      return getProjektStatusMeta(status);
    }
    return { label: status || 'Neu', cl: '#374151', bg: '#f3f4f6', bd: '#d1d5db' };
  }

  /**
   * Hilfsfunktion: Geld in Cents formatieren → "1.234,56 €"
   * (§5 Master – kein Float, formatMoney Pflicht)
   */
  function formatMoney(cents, currency) {
    if (cents == null || isNaN(cents)) return '0,00 €';
    var cur = currency || 'EUR';
    var sign = cents < 0 ? '-' : '';
    var abs = Math.abs(Math.round(cents));
    var euros = Math.floor(abs / 100);
    var centPart = String(abs % 100).padStart(2, '0');
    var euroStr = String(euros).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return sign + euroStr + ',' + centPart + ' ' + (cur === 'EUR' ? '€' : cur);
  }

  /**
   * Parst eine Eingabe (z.B. "1.234,56") in Cent-Integer.
   */
  function parseMoneyInput(str) {
    if (!str && str !== 0) return 0;
    var s = String(str).replace(/\s/g, '').replace(/€/g, '');
    // "1.234,56" → 123456
    if (s.includes(',') && s.includes('.')) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else if (s.includes(',')) {
      s = s.replace(',', '.');
    }
    var n = parseFloat(s);
    return isNaN(n) ? 0 : Math.round(n * 100);
  }

  /**
   * Datum formatieren: YYYY-MM-DD → "01.01.2025" (Europe/Berlin §18)
   */
  function formatDate(isoDate) {
    if (!isoDate) return '';
    try {
      var d = new Date(isoDate + 'T00:00:00');
      return d.toLocaleDateString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        timeZone: 'Europe/Berlin'
      });
    } catch (e) { return isoDate; }
  }

  /**
   * DateTime formatieren: UTC-ISO → lokale Anzeige (§18)
   */
  function formatDateTime(isoDateTime) {
    if (!isoDateTime) return '';
    try {
      var d = new Date(isoDateTime);
      return d.toLocaleString('de-DE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
        timeZone: 'Europe/Berlin'
      });
    } catch (e) { return isoDateTime; }
  }

  // Exports
  window.getProjectById      = window.getProjectById      || getProjectById;
  window.getVisibleProjects  = window.getVisibleProjects  || getVisibleProjects;
  window.getActiveProject    = getActiveProject;
  window.getProjectStatusMeta= window.getProjectStatusMeta|| getProjectStatusMeta;
  window.formatMoney         = window.formatMoney         || formatMoney;
  window.parseMoneyInput     = window.parseMoneyInput     || parseMoneyInput;
  window.formatDate          = window.formatDate          || formatDate;
  window.formatDateTime      = window.formatDateTime      || formatDateTime;

  // CC-Namespace
  if (window.CC && window.CC.core) {
    window.CC.core.projects = {
      getById:      getProjectById,
      getVisible:   getVisibleProjects,
      getActive:    getActiveProject,
      getStatusMeta:getProjectStatusMeta,
      formatMoney:  formatMoney,
      parseInput:   parseMoneyInput,
      formatDate:   formatDate,
      formatDateTime:formatDateTime,
    };
  }
})();
