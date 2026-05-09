// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/angebote/index.js
// ─────────────────────────────────────────────────────────────────────
// Erster Modul-Schritt für Angebote.
//
// IST-Problem: AG_DATEN ist nur in-memory.
//   agSave(), agSetStatus(), anfZuAngebot() schreiben nirgends hin.
//   Nach Reload sind alle Änderungen weg.
//
// Dieser Block:
//   1. Persistenz via DataService (localStorage + Server-Sync)
//   2. Wraps: agSetStatus, agSave, anfZuAngebot → auto-save nach jedem Schreibvorgang
//   3. Auto-Load beim Init → echte Daten überschreiben Demo-Daten
//   4. Neues Feature: agDuplizieren(id) — risikoarme Ergänzung
//
// DataService-Key: 'cc_intern_angebote_v1' → server-Collection: 'angebote'
// (server.js KEY_MAP + SyncAdapter._endpoints ergänzt)
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var KEY = 'cc_intern_angebote_v1';

  // ── Warten bis DataService bereit ist ───────────────────────────────
  function dataService() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService
      : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  function save() {
    var ds = dataService();
    if (!ds) { console.warn('[Angebote] Kein DataService — speichere nicht'); return; }
    if (typeof AG_DATEN === 'undefined') return;
    ds.save(KEY, AG_DATEN);
  }

  // ── Laden: DataService → AG_DATEN (überschreibt Demo-Daten wenn real) ─
  function load(callback) {
    var ds = dataService();
    if (!ds) {
      if (callback) callback(false);
      return;
    }
    ds.loadAsync(KEY, null, function(err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        // Reale Daten: Demo-Inhalte ersetzen (in-place, damit alle Referenzen stimmen)
        AG_DATEN.length = 0;
        data.forEach(function(item) { AG_DATEN.push(item); });
        console.info('[Angebote] ' + data.length + ' Angebot(e) aus DataService geladen');
        if (callback) callback(true);
      } else {
        // Keine gespeicherten Daten → Demo-Daten bleiben, direkt speichern
        console.info('[Angebote] Keine gespeicherten Daten — Demo-Daten werden initial gespeichert');
        save();
        if (callback) callback(false);
      }
    });
  }

  // (Wraps sind in _installWraps() — wird aus init() aufgerufen, nach DOMContentLoaded)

  // ── Neues Feature: Angebot duplizieren ───────────────────────────────
  function agDuplizieren(id) {
    if (typeof AG_DATEN === 'undefined') return;
    var a = AG_DATEN.find(function(x) { return x.id === id; });
    if (!a) { if (typeof showToast === 'function') showToast('⚠ Angebot nicht gefunden'); return; }

    // Neue Nummer: agNr hochzählen
    if (typeof agNr !== 'undefined') agNr++;
    var nr   = typeof agNr !== 'undefined' ? agNr : Math.floor(Math.random() * 900 + 100);
    var year = new Date().getFullYear();
    var newId = 'AG-' + year + '-' + String(nr).padStart(3, '0');
    var today = new Date().toLocaleDateString('de-DE');
    var gueltigDate = new Date(); gueltigDate.setDate(gueltigDate.getDate() + 30);
    var gueltig = gueltigDate.toLocaleDateString('de-DE');

    // Deep copy: Positionen-Array + alle Felder
    var copy = JSON.parse(JSON.stringify(a));
    copy.id       = newId;
    copy.datum    = today;
    copy.gueltig  = gueltig;
    copy.status   = 'entwurf';
    copy.erstellt = today;
    copy.vonAnfrage = null;
    copy.inotiz   = 'Kopie von ' + id + (a.inotiz ? ' · ' + a.inotiz.substring(0, 60) : '');

    AG_DATEN.unshift(copy);
    save();

    if (typeof renderAngebote === 'function')  renderAngebote();
    if (typeof agOpenDetail   === 'function')  agOpenDetail(newId);
    if (typeof showToast      === 'function')  showToast('📋 Kopie angelegt: ' + newId);
  }

  // ── Wraps installieren (nach DOMContentLoaded — inline-Funktionen sind dann definiert) ─
  function _installWraps() {
    // agSetStatus
    var _origSetStatus = window.agSetStatus;
    window.agSetStatus = function(id, status) {
      var result = typeof _origSetStatus === 'function' ? _origSetStatus(id, status) : undefined;
      save();
      return result;
    };
    // agSave
    var _origAgSave = window.agSave;
    window.agSave = function(status) {
      var result = typeof _origAgSave === 'function' ? _origAgSave(status) : undefined;
      save();
      return result;
    };
    // anfZuAngebot
    var _origAnfZuAngebot = window.anfZuAngebot;
    window.anfZuAngebot = function(anfId) {
      var result = typeof _origAnfZuAngebot === 'function' ? _origAnfZuAngebot(anfId) : undefined;
      save();
      return result;
    };
    // anfAngebotErstellen (optional)
    var _origAnfAngebot = window.anfAngebotErstellen;
    if (typeof _origAnfAngebot === 'function') {
      window.anfAngebotErstellen = function(id) {
        var result = _origAnfAngebot(id);
        save();
        return result;
      };
    }
    // agOpenDetail: "Duplizieren"-Button einbauen
    var _origOpenDetail = window.agOpenDetail;
    window.agOpenDetail = function(id) {
      var result = typeof _origOpenDetail === 'function' ? _origOpenDetail(id) : undefined;
      setTimeout(function() {
        var body = document.getElementById('ag-detail-body');
        if (!body) return;
        if (body.querySelector('[data-action="ag-duplizieren"]')) return;
        var aktDiv = body.querySelector('[style*="flex-direction:column"]');
        if (!aktDiv) return;
        var btn = document.createElement('button');
        btn.setAttribute('data-action', 'ag-duplizieren');
        btn.setAttribute('data-aid', id);
        btn.style.cssText = 'width:100%;padding:9px;background:#fff;border:1.5px solid var(--border);'
          + 'border-radius:9px;font-size:13px;cursor:pointer;color:var(--text2);';
        btn.textContent = '📋 Angebot duplizieren';
        btn.onclick = function() { agDuplizieren(this.dataset.aid); };
        aktDiv.appendChild(btn);
      }, 20);
      return result;
    };
  }

  // ── Init: Wraps installieren + Daten laden ────────────────────────────
  function init() {
    _installWraps();
    load(function(loaded) {
      if (loaded) {
        if (typeof renderAngebote === 'function') renderAngebote();
      }
    });
  }

  // Defer: erst nach allen anderen Initialisierungen laufen lassen
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 150); });
  } else {
    setTimeout(init, 150);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.AngeboteService = { save: save, load: load };
  window.agDuplizieren   = agDuplizieren;

  console.info('[CC] angebote/index.js geladen — Persistenz (DataService) + Duplizieren');

})();
