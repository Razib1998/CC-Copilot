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
  var LAST_SAVED_COUNTS_BY_ID = {};
  var LAST_SAVED_TITLES_BY_ID = {};

  // ── DataService ─────────────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  function punktTitelListe(v) {
    return (v && Array.isArray(v.punkte) ? v.punkte : []).map(function(p) {
      return (p && (p.title || p.text)) ? String(p.title || p.text) : '';
    });
  }

  // ── Speichern ────────────────────────────────────────────────────────
  // Greift immer per Name auf CL_VORLAGEN zu (nie gespeicherte Referenz),
  // damit auch nach clDeleteVorlage() das korrekte Array gespeichert wird.
  function save() {
    if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__) {
      var capiS = window.CCIntern && window.CCIntern.cockpitApi;
      if (capiS && typeof capiS.saveChecklistenVorlagenToApi === 'function') {
        var toastS =
          typeof showToast === 'function'
            ? showToast
            : typeof window._ccShowToast === 'function'
              ? window._ccShowToast
              : null;
        capiS.saveChecklistenVorlagenToApi(toastS).then(function() {
          if (typeof renderChecklisten === 'function') renderChecklisten();
        });
        return;
      }
      console.error('[CL-Vorlagen] Cockpit: saveChecklistenVorlagenToApi fehlt.');
      return;
    }

    var svc = ds();
    if (!svc || typeof CL_VORLAGEN === 'undefined') return;
    LAST_SAVED_COUNTS_BY_ID = {};
    LAST_SAVED_TITLES_BY_ID = {};
    CL_VORLAGEN.forEach(function(v) {
      if (!v || typeof v !== 'object') return;
      var beforeSaveCount = Array.isArray(v.punkte) ? v.punkte.length : 0;
      var id = v.id != null ? String(v.id) : '';
      var titles = punktTitelListe(v);
      if (id) LAST_SAVED_COUNTS_BY_ID[id] = beforeSaveCount;
      if (id) LAST_SAVED_TITLES_BY_ID[id] = titles.slice();
      console.log('VORLAGE COUNT BEFORE SAVE', {
        id: v.id,
        name: v.name,
        beforeSaveCount: beforeSaveCount,
      });
      console.log('VORLAGE BEFORE SAVE', v.name, titles);
      console.log('VORLAGE TITEL', titles);
    });
    svc.save(KEY, CL_VORLAGEN);
  }

  // ── Laden ────────────────────────────────────────────────────────────
  // In-place: löscht aktuelles Array und befüllt mit gespeicherten Daten.
  // Funktioniert korrekt unabhängig davon ob CL_VORLAGEN reassigned wurde.
  function load(callback) {
    if (typeof window !== 'undefined' && window.__CCINTERN_COCKPIT_MOUNT__) {
      var capi = window.CCIntern && window.CCIntern.cockpitApi;
      if (capi && typeof capi.reloadChecklistenVorlagenFromApi === 'function') {
        capi.reloadChecklistenVorlagenFromApi(null).then(function(/* err */) {
          if (typeof renderChecklisten === 'function') renderChecklisten();
          if (callback) callback(!!(typeof CL_VORLAGEN !== 'undefined' && CL_VORLAGEN.length));
        });
        return;
      }
      console.error('[CL-Vorlagen] Cockpit: reloadChecklistenVorlagenFromApi fehlt — nichts geladen.');
      if (callback) callback(false);
      return;
    }

    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function(err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        // In-place: CL_VORLAGEN per Name ansprechen (nie Referenz)
        CL_VORLAGEN.length = 0;
        data.forEach(function(v) {
          if (!v || typeof v !== 'object') return;
          if (!Array.isArray(v.punkte)) v.punkte = [];
          CL_VORLAGEN.push(v);
          var afterLoadCount = Array.isArray(v.punkte) ? v.punkte.length : 0;
          console.log('VORLAGE COUNT AFTER LOAD', {
            id: v.id,
            name: v.name,
            afterLoadCount: afterLoadCount,
          });
          var titles = punktTitelListe(v);
          console.log('VORLAGE AFTER LOAD', v.name, titles);
          console.log('VORLAGE TITEL', titles);
          var id = v.id != null ? String(v.id) : '';
          var hasBefore = !!(id && Object.prototype.hasOwnProperty.call(LAST_SAVED_COUNTS_BY_ID, id));
          var beforeSaveCount = hasBefore ? LAST_SAVED_COUNTS_BY_ID[id] : null;
          var beforeTitles = id && LAST_SAVED_TITLES_BY_ID[id] ? LAST_SAVED_TITLES_BY_ID[id] : null;
          if (beforeTitles && beforeTitles.length) {
            var autoInserted = titles.filter(function(t) { return beforeTitles.indexOf(t) === -1; });
            if (autoInserted.length) {
              console.warn('UNERLAUBTER AUTO-INSERT', autoInserted);
            }
          }
          if (hasBefore && beforeSaveCount !== afterLoadCount) {
            console.warn('VORLAGE COUNT MISMATCH', {
              id: v.id,
              name: v.name,
              beforeSaveCount: beforeSaveCount,
              afterLoadCount: afterLoadCount,
              punkte: v.punkte,
            });
          }
        });
        console.info('[CL-Vorlagen] ' + data.length + ' Vorlage(n) aus DataService geladen');
        if (callback) callback(true);
      } else {
        if (Array.isArray(CL_VORLAGEN) && CL_VORLAGEN.length > 0) {
          console.info('[CL-Vorlagen] API/leer — bestehende RAM-Vorlagen bleiben');
          if (callback) callback(false);
          return;
        }
        CL_VORLAGEN.length = 0;
        console.info('[CL-Vorlagen] Keine API-/Seed-Daten — leer (kein localStorage-Backup)');
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
    load(function(/* loaded */) {
      // Immer nach load (auch Seed-Pfad: callback(false)) — sonst bleibt die Liste leer
      function paint() {
        if (typeof renderChecklisten === 'function') renderChecklisten();
      }
      paint();
      // Nach Cockpit-Remount / Layout: ein Frame später nochmal (DOM war evtl. noch nicht die aktive Shell)
      if (typeof requestAnimationFrame === 'function') {
        requestAnimationFrame(function () { paint(); });
      } else {
        setTimeout(paint, 0);
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
