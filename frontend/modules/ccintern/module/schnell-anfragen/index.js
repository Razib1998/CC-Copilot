// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/schnell-anfragen/index.js
// ─────────────────────────────────────────────────────────────────────
// IST-Problem: ANF_DATEN ist nur in-memory (let-Array in index.html).
//   Neue Anfragen, Status-Änderungen und Konvertierungen zu Angeboten
//   gehen nach Reload verloren.
//
// Dieser Block:
//   1. Persistenz via DataService (localStorage + Server-Sync)
//   2. Wraps: anfSpeichern, anfZuAngebot, anfStatusSetzen → auto-save
//   3. Auto-Load beim Init → echte Daten überschreiben Demo-Daten
//   4. Feature: anfLoeschen(id) — mit Bestätigung
//   5. Feature: anfStatusSetzen(id, status) — Schnell-Status
//   6. Feature: anfDuplizieren(id) — Kopie als neue offene Anfrage
//
// DataService-Key: 'cc_intern_anfragen_v1' → server-Collection: 'anfragen'
// Kalender: CC Cockpit liefert den Kalender — kein eigener Kalender-Code
// Zugriffsrechte: CC Cockpit regelt Basis — nur CC-Intern-Feinschliff hier
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var KEY    = 'cc_intern_anfragen_v1';
  var anfNrLocal = 100; // lokaler Zähler falls globaler anfNr nicht verfügbar

  // ── DataService-Zugriff ──────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  function save() {
    var svc = ds();
    if (!svc) { console.warn('[Anfragen] Kein DataService — speichere nicht'); return; }
    if (typeof ANF_DATEN === 'undefined') return;
    svc.save(KEY, ANF_DATEN);
  }

  // ── Laden: DataService → ANF_DATEN ──────────────────────────────────
  function load(callback) {
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function (err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        // Reale Daten: Demo-Einträge ersetzen (in-place)
        if (typeof ANF_DATEN !== 'undefined') {
          ANF_DATEN.length = 0;
          data.forEach(function (item) { ANF_DATEN.push(item); });
        }
        console.info('[Anfragen] ' + data.length + ' Anfrage(n) aus DataService geladen');
        if (callback) callback(true);
      } else {
        var g = window.__CCINTERN_DEFAULT_SEEDS__;
        if (g && Array.isArray(g.anfragen) && g.anfragen.length) {
          ANF_DATEN.length = 0;
          g.anfragen.forEach(function (item) { ANF_DATEN.push(JSON.parse(JSON.stringify(item))); });
          console.info('[Anfragen] ' + g.anfragen.length + ' Anfrage(n) aus Seed (CCinter_COCKPIT_UMZUG/daten)');
        } else {
          console.info('[Anfragen] Keine gespeicherten Daten — Demo-Daten werden initial gespeichert');
        }
        save();
        if (callback) callback(false);
      }
    });
  }

  // ── Feature: Anfrage löschen ─────────────────────────────────────────
  function anfLoeschen(id) {
    if (typeof ANF_DATEN === 'undefined') return;
    var anf = ANF_DATEN.find(function (x) { return x.id === id; });
    if (!anf) return;
    if (typeof ccInternConfirm !== 'function') return;
    ccInternConfirm('Anfrage "' + id + '" von ' + anf.kunde + ' wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.', function() {

    var idx = ANF_DATEN.findIndex(function (x) { return x.id === id; });
    if (idx !== -1) ANF_DATEN.splice(idx, 1);
    save();

    if (typeof renderAnfragen   === 'function') renderAnfragen();
    if (typeof showToast        === 'function') showToast('🗑 Anfrage gelöscht: ' + id);
    });
  }

  // ── Feature: Status direkt setzen ────────────────────────────────────
  function anfStatusSetzen(id, status) {
    if (typeof ANF_DATEN === 'undefined') return;
    var anf = ANF_DATEN.find(function (x) { return x.id === id; });
    if (!anf) return;
    anf.status = status;
    save();
    if (typeof renderAnfragen === 'function') renderAnfragen();
    if (typeof showToast      === 'function') showToast('✓ Status → ' + status + ': ' + id);
  }

  // ── Feature: Anfrage duplizieren ─────────────────────────────────────
  function anfDuplizieren(id) {
    if (typeof ANF_DATEN === 'undefined') return;
    var anf = ANF_DATEN.find(function (x) { return x.id === id; });
    if (!anf) { if (typeof showToast === 'function') showToast('⚠ Anfrage nicht gefunden'); return; }

    anfNrLocal++;
    var year  = new Date().getFullYear();
    var newId = 'ANF-' + year + '-' + String(anfNrLocal).padStart(3, '0');
    var today = new Date().toLocaleDateString('de-DE');

    var copy       = JSON.parse(JSON.stringify(anf));
    copy.id        = newId;
    copy.erstellt  = today;
    copy.status    = 'offen';

    ANF_DATEN.unshift(copy);
    save();

    if (typeof renderAnfragen === 'function') renderAnfragen();
    if (typeof showToast      === 'function') showToast('📋 Kopie angelegt: ' + newId);
  }

  // ── Löschen-Button in Anfrage-Detail einbauen ─────────────────────────
  function _injectAnfragenButtons(id) {
    // Suche den Aktions-Bereich im Anfragen-Detail
    var detail = document.getElementById('anf-detail-body') ||
                 document.querySelector('#pg-anfragen .detail-body') ||
                 document.querySelector('[id*="anf"][id*="detail"]');
    if (!detail) return;
    if (detail.querySelector('[data-action="anf-loeschen"]')) return;

    // Löschen-Button
    var delBtn = document.createElement('button');
    delBtn.setAttribute('data-action', 'anf-loeschen');
    delBtn.dataset.id = id;
    delBtn.style.cssText = 'display:block;width:100%;margin-top:6px;padding:8px;background:#fff;'
      + 'border:1.5px solid var(--red);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer;';
    delBtn.textContent = '🗑 Anfrage löschen';
    delBtn.onclick = function () { anfLoeschen(this.dataset.id); };

    // Duplizieren-Button
    var dupBtn = document.createElement('button');
    dupBtn.setAttribute('data-action', 'anf-duplizieren');
    dupBtn.dataset.id = id;
    dupBtn.style.cssText = 'display:block;width:100%;margin-top:6px;padding:8px;background:#fff;'
      + 'border:1.5px solid var(--border);border-radius:8px;color:var(--text2);font-size:12px;cursor:pointer;';
    dupBtn.textContent = '📋 Anfrage duplizieren';
    dupBtn.onclick = function () { anfDuplizieren(this.dataset.id); };

    // An letzten Button-Container anhängen
    var btns   = detail.querySelectorAll('button');
    var parent = btns.length ? (btns[btns.length - 1].closest('div') || btns[btns.length - 1].parentElement) : detail;
    if (parent) {
      parent.appendChild(dupBtn);
      parent.appendChild(delBtn);
    }
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {

    // anfZuAngebot: nach Konvertierung speichern
    var _origAnfZuAngebot = window.anfZuAngebot;
    window.anfZuAngebot = function (anfId) {
      var result = typeof _origAnfZuAngebot === 'function' ? _origAnfZuAngebot(anfId) : undefined;
      save();
      return result;
    };

    // anfNeuModal → nach Speichern auto-save
    // Der eigentliche Speicher-Aufruf passiert am Ende von anfNeuModal (ANF_DATEN.unshift + renderAnfragen)
    // Wir wrappen renderAnfragen um nach jedem Render zu speichern
    var _origRenderAnfragen = window.renderAnfragen;
    window.renderAnfragen = function () {
      var result = typeof _origRenderAnfragen === 'function' ? _origRenderAnfragen() : undefined;
      // Nur speichern wenn Daten vorhanden (verhindert leeres Überschreiben beim Init)
      if (typeof ANF_DATEN !== 'undefined' && ANF_DATEN.length > 0) {
        save();
      }
      return result;
    };

    // openAnfDetail (falls vorhanden): Buttons einbauen
    var _origOpenDetail = window.openAnfDetail;
    if (typeof _origOpenDetail === 'function') {
      window.openAnfDetail = function (id) {
        var result = _origOpenDetail(id);
        setTimeout(function () { _injectAnfragenButtons(id); }, 20);
        return result;
      };
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    load(function (loaded) {
      if (loaded) {
        if (typeof renderAnfragen === 'function') renderAnfragen();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 180); });
  } else {
    setTimeout(init, 180);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.AnfragenService  = { save: save, load: load };
  window.anfLoeschen      = anfLoeschen;
  window.anfStatusSetzen  = anfStatusSetzen;
  window.anfDuplizieren   = anfDuplizieren;

  console.info('[CC] schnell-anfragen/index.js geladen — Persistenz + Löschen + Duplizieren + Status');

})();
