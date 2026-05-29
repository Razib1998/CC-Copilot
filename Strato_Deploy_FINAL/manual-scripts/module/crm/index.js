// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/crm/index.js
// ─────────────────────────────────────────────────────────────────────
// IST-Problem: ANF_DATEN (Schnell-Anfragen) ist nur in-memory (let).
//   anfStatus() und anfAngebotErstellen() schreiben nirgends hin.
//   Nach Reload sind alle Anfragen weg.
//
// Dieser Block:
//   1. Persistenz: CrmService.save() / CrmService.load()
//   2. Wrap: anfStatus, anfAngebotErstellen, anfZuAngebot → auto-save
//   3. Auto-Load beim Init
//   4. Neues Feature: anfLoeschen(id) — Anfrage löschen
//   5. Neues Feature: anfNeu direkt aus Modul (vorbereitung für eigenständige Erfassung)
//
// DataService-Key: 'cc_intern_anfragen_v1' → server-Collection: 'anfragen'
// (server.js + SyncAdapter ergänzt)
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  var KEY = 'cc_intern_anfragen_v1';

  // ── DataService-Zugriff ──────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  function save() {
    var svc = ds();
    if (!svc || typeof ANF_DATEN === 'undefined') return;
    svc.save(KEY, ANF_DATEN);
  }

  // ── Laden: DataService → ANF_DATEN (in-place wie bei AG_DATEN) ────────
  function load(callback) {
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }

    svc.loadAsync(KEY, null, function(err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        ANF_DATEN.length = 0;
        data.forEach(function(item) { ANF_DATEN.push(item); });
        console.info('[CRM] ' + data.length + ' Anfrage(n) aus DataService geladen');
        if (callback) callback(true);
      } else {
        var g = window.__CCINTERN_DEFAULT_SEEDS__;
        if (g && Array.isArray(g.anfragen) && g.anfragen.length) {
          ANF_DATEN.length = 0;
          g.anfragen.forEach(function (item) { ANF_DATEN.push(JSON.parse(JSON.stringify(item))); });
          console.info('[CRM] ' + g.anfragen.length + ' Anfrage(n) aus Seed (CCinter_COCKPIT_UMZUG/daten)');
        } else {
          console.info('[CRM] Keine gespeicherten Daten — Demo-Anfragen werden initial gespeichert');
        }
        save();
        if (callback) callback(false);
      }
    });
  }

  // (Wraps in _installWraps() — wird aus init() aufgerufen, nach DOMContentLoaded)

  // ── Neues Feature: Anfrage löschen ───────────────────────────────────
  function anfLoeschen(id) {
    if (typeof ANF_DATEN === 'undefined') return;
    var a = ANF_DATEN.find(function(x) { return x.id === id; });
    if (!a) return;
    if (typeof ccInternConfirm !== 'function') return;
    ccInternConfirm('Anfrage "' + a.id + ' · ' + a.kunde + '" wirklich löschen?', function() {

    var idx = ANF_DATEN.indexOf(a);
    if (idx >= 0) ANF_DATEN.splice(idx, 1);

    save();
    if (typeof renderAnfragen === 'function') renderAnfragen();
    var body = document.getElementById('anf-detail-body') ||
               document.querySelector('#pg-crm [id*="anf"][id*="body"]');
    if (body) body.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text3);font-size:13px;">Anfrage gelöscht</div>';
    if (typeof showToast === 'function') showToast('🗑 Anfrage gelöscht: ' + id);
    });
  }


  function _injectAnfButtons(id) {
    // Löschen-Button in Anfrage-Detail injizieren
    var body = document.getElementById('anf-detail-body') ||
               document.querySelector('[id*="anf-det"]');
    if (!body || body.querySelector('[data-action="anf-loeschen"]')) return;

    var btn = document.createElement('button');
    btn.setAttribute('data-action', 'anf-loeschen');
    btn.dataset.id = id;
    btn.style.cssText = 'display:block;width:100%;margin-top:8px;padding:8px 12px;background:#fff;'
      + 'border:1.5px solid var(--red);border-radius:8px;color:var(--red);font-size:12px;cursor:pointer;';
    btn.textContent = '🗑 Anfrage löschen';
    btn.onclick = function() { anfLoeschen(this.dataset.id); };

    // An letzten Button-Container anhängen
    var lastBtnGroup = body.querySelectorAll('[style*="gap"][style*="flex"]');
    var target = lastBtnGroup.length ? lastBtnGroup[lastBtnGroup.length - 1] : body;
    target.appendChild(btn);
  }

  // ── Wraps installieren (nach DOMContentLoaded) ───────────────────────
  function _installWraps() {
    var _origAnfStatus = window.anfStatus;
    window.anfStatus = function(id, s) {
      var result = typeof _origAnfStatus === 'function' ? _origAnfStatus(id, s) : undefined;
      save();
      return result;
    };
    var _origAnfAngebot = window.anfAngebotErstellen;
    if (typeof _origAnfAngebot === 'function') {
      window.anfAngebotErstellen = function(id) {
        var result = _origAnfAngebot(id);
        save();
        return result;
      };
    }
    // anfZuAngebot: auch von angebote/index.js gewrappt — Kette ist OK
    var _origAnfZuAngebot = window.anfZuAngebot;
    if (typeof _origAnfZuAngebot === 'function') {
      window.anfZuAngebot = function(anfId) {
        var result = _origAnfZuAngebot(anfId);
        save();
        return result;
      };
    }
    var _origAnfOpenDetail = window.anfOpenDetail;
    window.anfOpenDetail = function(id) {
      var result = typeof _origAnfOpenDetail === 'function' ? _origAnfOpenDetail(id) : undefined;
      setTimeout(function() { _injectAnfButtons(id); }, 20);
      return result;
    };
  }

  // ── Init ─────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    load(function(loaded) {
      if (loaded && typeof renderAnfragen === 'function') renderAnfragen();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { setTimeout(init, 250); });
  } else {
    setTimeout(init, 250);
  }

  // ── Globaler Export ──────────────────────────────────────────────────
  window.CrmService  = { save: save, load: load };
  window.anfLoeschen = anfLoeschen;

  console.info('[CC] crm/index.js geladen — ANF_DATEN Persistenz + Löschen');

})();
