// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/checklisten/index.js
// ─────────────────────────────────────────────────────────────────────
// Persistenz für CL_VORLAGEN (Checklisten-Vorlagen-Verwaltung).
// NICHT verwechseln mit auftraege/checklisten.js (Order-Checklisten).
//
// IST-Problem: CL_VORLAGEN ist nur in-memory (let).
//   clSaveVorlage, clDeleteVorlage, clSavePunkt, clDeletePunkt,
//   clMovePunkt, clToggleAktiv, clDuplizieren, clSaveBearbeiten
//   — alle nur in RAM. Nach Reload sind alle Änderungen weg.
//
// Besonderheit: clDeleteVorlage() REASSIGNS CL_VORLAGEN via .filter()
//   → save() und load() greifen immer per Name zu (nicht über Referenz)
//   → in-place Manipulation für load() auf dem aktuellen Array.
//
// Dieser Block:
//   1. Persistenz: ClVorlagenService.save() / ClVorlagenService.load()
//   2. Wraps alle 8 Schreibfunktionen → auto-save
//   3. Auto-Load beim Init
//
// DataService-Key: 'cc_intern_cl_vorlagen_v1' → Collection: 'cl_vorlagen'
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var KEY = 'cc_intern_cl_vorlagen_v1';

  // ── DataService ─────────────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  // Greift immer per Name auf CL_VORLAGEN zu (nie gespeicherte Referenz),
  // damit auch nach clDeleteVorlage() das korrekte Array gespeichert wird.
  function save() {
    var svc = ds();
    if (!svc || typeof CL_VORLAGEN === 'undefined') return;
    svc.save(KEY, CL_VORLAGEN);
  }

  // ── Laden ────────────────────────────────────────────────────────────
  // In-place: löscht aktuelles Array und befüllt mit gespeicherten Daten.
  // Funktioniert korrekt unabhängig davon ob CL_VORLAGEN reassigned wurde.
  function load(callback) {
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function(err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        // In-place: CL_VORLAGEN per Name ansprechen (nie Referenz)
        CL_VORLAGEN.length = 0;
        data.forEach(function(v) { CL_VORLAGEN.push(v); });
        console.info('[CL-Vorlagen] ' + data.length + ' Vorlage(n) aus DataService geladen');
        if (callback) callback(true);
      } else {
        // Keine gespeicherten Daten → Demo initial speichern
        console.info('[CL-Vorlagen] Keine gespeicherten Daten — Demo-Vorlagen werden initial gespeichert');
        save();
        if (callback) callback(false);
      }
    });
  }

  // ── Alle Schreibfunktionen wrappen (nach DOMContentLoaded) ──────────
  function _installWraps() {
    var _origClSaveVorlage = window.clSaveVorlage;
    window.clSaveVorlage = function() {
      var r = typeof _origClSaveVorlage === 'function' ? _origClSaveVorlage() : undefined;
      save(); return r;
    };
    var _origClDeleteVorlage = window.clDeleteVorlage;
    window.clDeleteVorlage = function(id) {
      var r = typeof _origClDeleteVorlage === 'function' ? _origClDeleteVorlage(id) : undefined;
      save(); return r;
    };
    var _origClSavePunkt = window.clSavePunkt;
    window.clSavePunkt = function() {
      var r = typeof _origClSavePunkt === 'function' ? _origClSavePunkt() : undefined;
      save(); return r;
    };
    var _origClDeletePunkt = window.clDeletePunkt;
    window.clDeletePunkt = function(vorlageId, idx) {
      var r = typeof _origClDeletePunkt === 'function' ? _origClDeletePunkt(vorlageId, idx) : undefined;
      save(); return r;
    };
    var _origClMovePunkt = window.clMovePunkt;
    window.clMovePunkt = function(vorlageId, idx, dir) {
      var r = typeof _origClMovePunkt === 'function' ? _origClMovePunkt(vorlageId, idx, dir) : undefined;
      save(); return r;
    };
    var _origClToggleAktiv = window.clToggleAktiv;
    window.clToggleAktiv = function(id) {
      var r = typeof _origClToggleAktiv === 'function' ? _origClToggleAktiv(id) : undefined;
      save(); return r;
    };
    var _origClDuplizieren = window.clDuplizieren;
    window.clDuplizieren = function(id) {
      var r = typeof _origClDuplizieren === 'function' ? _origClDuplizieren(id) : undefined;
      save(); return r;
    };
    var _origClSaveBearbeiten = window.clSaveBearbeiten;
    if (typeof _origClSaveBearbeiten === 'function') {
      window.clSaveBearbeiten = function(id) {
        var r = _origClSaveBearbeiten(id);
        save(); return r;
      };
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    load(function(loaded) {
      if (loaded) {
        if (typeof renderChecklisten === 'function') renderChecklisten();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 300); });
  } else {
    setTimeout(init, 300);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.ClVorlagenService = { save: save, load: load };

  console.info('[CC] checklisten/index.js geladen — CL_VORLAGEN Persistenz');

})();
