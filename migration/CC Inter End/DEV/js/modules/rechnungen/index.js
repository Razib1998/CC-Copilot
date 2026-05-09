// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/rechnungen/index.js
// ─────────────────────────────────────────────────────────────────────
// Ergänzt die bestehende RECHNUNGEN-Persistenz in index.html um:
//   1. Async-Load beim Init (Server-first statt nur localStorage)
//   2. RechnungenService — save/loadAsync für externe Nutzung
//
// IST-Stand: saveRechnungenData() ruft DataService.save() auf → OK.
//   loadRechnungen() nutzt DataService.load() (sync, nur localStorage).
//   → Beim Start holt dieses Modul die aktuellen Server-Daten nach.
//
// RECHNUNGEN ist var → window.RECHNUNGEN → direktes Reassign möglich.
// DataService-Key: 'cc_intern_rechnungen_v1' → Collection: 'rechnungen'
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var KEY = 'cc_intern_rechnungen_v1';

  // ── DataService ─────────────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  // Delegiert an saveRechnungenData() aus index.html (bereits DataService-ready).
  // Fallback falls direkt aufgerufen.
  function save() {
    if (typeof saveRechnungenData === 'function') {
      saveRechnungenData();
      return;
    }
    var svc = ds();
    if (!svc || typeof RECHNUNGEN === 'undefined') return;
    svc.save(KEY, RECHNUNGEN);
  }

  // ── Async-Load vom Server ────────────────────────────────────────────
  // Holt aktuelle Daten vom Server (via SyncAdapter).
  // RECHNUNGEN ist var → direktes window.RECHNUNGEN = data möglich.
  function loadAsync(callback) {
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function(err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        // Direktes Reassign (var — kein in-place nötig)
        window.RECHNUNGEN = data;
        console.info('[Rechnungen] ' + data.length + ' Rechnung(en) vom Server geladen');
        if (callback) callback(true);
      } else {
        // Keine Server-Daten → aktuelle Daten sicherstellen
        if (typeof loadRechnungen === 'function') loadRechnungen();
        if (callback) callback(false);
      }
    });
  }

  // ── Init ─────────────────────────────────────────────────────────────
  // Läuft nach index.html-Init (400ms Delay).
  // loadRechnungen() (sync) läuft früher bei DOMContentLoaded → kein Konflikt.
  function init() {
    // Nur async laden wenn SyncAdapter konfiguriert (HTTP-Modus)
    var adapter = (typeof window.CCIntern !== 'undefined') ? window.CCIntern.SyncAdapter : null;
    if (!adapter || !adapter._apiBase) {
      // Offline/file://-Modus → sync load reicht
      console.info('[Rechnungen] Offline-Modus — sync load bleibt aktiv');
      return;
    }

    loadAsync(function(loaded) {
      if (loaded && currentPage === 'rechnungen') {
        // Ansicht neu aufbauen falls gerade sichtbar
        if (typeof renderRechnungen === 'function') renderRechnungen();
        if (typeof reUpdateStats === 'function') reUpdateStats();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 400); });
  } else {
    setTimeout(init, 400);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.RechnungenService = { save: save, loadAsync: loadAsync };

  console.info('[CC] rechnungen/index.js geladen — Rechnungen Async-Sync');

})();
