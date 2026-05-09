// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/kunden/index.js
// ─────────────────────────────────────────────────────────────────────
// IST-Problem: CRM_KUNDEN ist nur in-memory (var-Objekt).
//   saveKunde() schreibt in CRM_KUNDEN aber persistiert nirgends.
//   Nach Reload sind alle neuen/geänderten Kunden weg.
//
// Dieser Block:
//   1. Persistenz: KundenService.save() / KundenService.load()
//   2. Wrap saveKunde() → auto-save nach jedem Schreibvorgang
//   3. Auto-Load beim Init → echte Daten überschreiben Demo-Daten
//   4. Neues Feature: kundeLoeschen(key) mit Bestätigung
//   5. Neues Feature: kundeStatusSetzen(key, status) — Schnell-Status
//
// DataService-Key: 'cc_intern_kunden_v2' → server-Collection: 'kunden'
// (cc_intern_kunden_v1/v2 beide bereits in server.js + SyncAdapter)
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var KEY = 'cc_intern_kunden_v2';

  // ── DataService-Zugriff ──────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  function save() {
    var svc = ds();
    if (!svc || typeof CRM_KUNDEN === 'undefined') return;
    svc.save(KEY, CRM_KUNDEN);
  }

  // ── Laden: DataService → window.CRM_KUNDEN ──────────────────────────
  // CRM_KUNDEN ist var → liegt auf window → direkte Zuweisung möglich
  function load(callback) {
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function(err, data) {
      if (!err && data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 0) {
        // Reale Objekt-Daten: Demo-Einträge ersetzen
        window.CRM_KUNDEN = data;
        console.info('[Kunden] ' + Object.keys(data).length + ' Kunden aus DataService geladen');
        if (callback) callback(true);
      } else {
        // Keine gespeicherten Daten → Demo-Daten initial speichern
        console.info('[Kunden] Keine gespeicherten Daten — Demo-Daten werden initial gespeichert');
        save();
        if (callback) callback(false);
      }
    });
  }

  // (Wraps in _installWraps() — wird aus init() aufgerufen, nach DOMContentLoaded)

  // ── Neues Feature: Kunde löschen ─────────────────────────────────────
  function kundeLoeschen(key) {
    var k = window.CRM_KUNDEN && window.CRM_KUNDEN[key];
    if (!k) return;
    if (!confirm('Kunde "' + k.name + '" wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.')) return;

    delete window.CRM_KUNDEN[key];
    save();

    // Detail schließen falls geöffnet
    if (typeof closeDetail === 'function') closeDetail();
    if (typeof renderKunden === 'function') renderKunden();
    if (typeof renderCrmPipeline === 'function') renderCrmPipeline();
    if (typeof showToast === 'function') showToast('🗑 Kunde gelöscht: ' + k.name);
  }

  // ── Neues Feature: Status schnell setzen ─────────────────────────────
  function kundeStatusSetzen(key, status) {
    var k = window.CRM_KUNDEN && window.CRM_KUNDEN[key];
    if (!k) return;
    k.status = status;
    k.letzterKontakt = new Date().toLocaleDateString('de-DE');
    save();
    if (typeof renderKunden === 'function') renderKunden();
    if (typeof openKundenDetail === 'function') openKundenDetail(key);
    if (typeof showToast === 'function') showToast('✓ Status → ' + status + ': ' + k.name);
  }

  // ── Neues Feature: Letzten Kontakt auf heute setzen ──────────────────
  function kundeLetzterKontaktHeute(key) {
    var k = window.CRM_KUNDEN && window.CRM_KUNDEN[key];
    if (!k) return;
    var heute = new Date().toLocaleDateString('de-DE');
    k.letzterKontakt = heute;
    save();
    if (typeof openKundenDetail === 'function') openKundenDetail(key);
    if (typeof showToast === 'function') showToast('📅 Letzter Kontakt → Heute: ' + k.name);
  }


  function _injectKundenButtons(key) {
    // "Löschen"-Button in den Kunden-Footer injizieren
    // Suche den Detail-Panel-Body
    var detailBody = document.getElementById('kunden-detail-body') ||
                     document.querySelector('#pg-kunden .detail-body') ||
                     document.querySelector('[id*="kunden"][id*="detail"]');
    if (!detailBody) return;

    // Schon injiziert?
    if (detailBody.querySelector('[data-action="kunden-loeschen"]')) return;

    // Letzten Button-Container (Aktionen) finden
    var btnContainers = detailBody.querySelectorAll('button, [style*="cursor:pointer"]');
    if (!btnContainers.length) return;

    // Löschen-Button
    var delBtn = document.createElement('button');
    delBtn.setAttribute('data-action', 'kunden-loeschen');
    delBtn.dataset.key = key;
    delBtn.style.cssText = 'display:block;width:100%;margin-top:6px;padding:8px;background:#fff;'
      + 'border:1.5px solid var(--red);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer;';
    delBtn.textContent = '🗑 Kunde löschen';
    delBtn.onclick = function() { kundeLoeschen(this.dataset.key); };

    // Kontakt-heute-Button
    var kontaktBtn = document.createElement('button');
    kontaktBtn.setAttribute('data-action', 'kunden-kontakt-heute');
    kontaktBtn.dataset.key = key;
    kontaktBtn.style.cssText = 'display:block;width:100%;margin-top:6px;padding:8px;background:var(--blue-l);'
      + 'border:1px solid var(--border);border-radius:8px;color:var(--blue);font-size:12px;cursor:pointer;';
    kontaktBtn.textContent = '📅 Kontakt heute markieren';
    kontaktBtn.onclick = function() { kundeLetzterKontaktHeute(this.dataset.key); };

    // An letzten Button anhängen
    var lastBtn = btnContainers[btnContainers.length - 1];
    var parent  = lastBtn.closest('div') || lastBtn.parentElement;
    if (parent) {
      parent.appendChild(kontaktBtn);
      parent.appendChild(delBtn);
    }
  }

  // ── Wraps installieren (nach DOMContentLoaded) ───────────────────────
  function _installWraps() {
    var _origSaveKunde = window.saveKunde;
    window.saveKunde = function() {
      var result = typeof _origSaveKunde === 'function' ? _origSaveKunde() : undefined;
      save();
      return result;
    };
    var _origOpenDetail = window.openKundenDetail;
    window.openKundenDetail = function(key) {
      var result = typeof _origOpenDetail === 'function' ? _origOpenDetail(key) : undefined;
      setTimeout(function() { _injectKundenButtons(key); }, 20);
      return result;
    };
  }

  // ── Init: Wraps installieren + Daten laden ────────────────────────────
  function init() {
    _installWraps();
    load(function(loaded) {
      if (loaded) {
        if (typeof renderKunden === 'function') renderKunden();
        if (typeof renderCrmPipeline === 'function') renderCrmPipeline();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 200); });
  } else {
    setTimeout(init, 200);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.KundenService          = { save: save, load: load };
  window.kundeLoeschen          = kundeLoeschen;
  window.kundeStatusSetzen      = kundeStatusSetzen;
  window.kundeLetzterKontaktHeute = kundeLetzterKontaktHeute;

  console.info('[CC] kunden/index.js geladen — Persistenz + Löschen + Kontakt-heute');

})();
