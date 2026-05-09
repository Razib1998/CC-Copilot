// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/urlaub/index.js
// ─────────────────────────────────────────────────────────────────────
// Urlaubsverwaltung auf Basis von URLAUB_ANTRAEGE.
// saveUrlaub() + loadUrlaub() + renderUrlaubAntraege() sind in index.html.
// urlaubEntscheiden(id, status) ebenfalls bereits vorhanden.
//
// Dieser Block:
//   1. Persistenz: loadUrlaub beim Start, auto-save nach Render
//   2. Feature: urlaubGenehmigen(id) — Antrag genehmigen
//   3. Feature: urlaubAblehnen(id)   — Antrag ablehnen
//   4. Feature: urlaubLoeschen(id)   — Antrag löschen (mit Bestätigung)
//   5. Feature: urlaubStatusBadge()  — Ampel-Übersicht für Dashboard
//   6. Feature: urlaubExportCsv()    — CSV-Export aller Anträge
//   7. Wraps renderUrlaubAntraege → nach jedem Render auto-save
//
// Kalender: CC Cockpit liefert den Kalender — kein eigener Code hier
// Zugriffsrechte: CC Cockpit regelt Basis
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var KEY = 'cc_intern_urlaub_v1';

  // ── DataService-Zugriff ──────────────────────────────────────────────
  function ds() {
    return (typeof window.CCIntern !== 'undefined' && window.CCIntern.DataService)
      ? window.CCIntern.DataService : null;
  }

  // ── Speichern ────────────────────────────────────────────────────────
  function save() {
    if (typeof saveUrlaub === 'function') { saveUrlaub(); return; }
    // Fallback direkt
    var svc = ds();
    if (!svc || typeof URLAUB_ANTRAEGE === 'undefined') return;
    svc.save(KEY, URLAUB_ANTRAEGE);
  }

  // ── Laden ────────────────────────────────────────────────────────────
  function load(callback) {
    if (typeof loadUrlaub === 'function') {
      loadUrlaub(callback);
      return;
    }
    var svc = ds();
    if (!svc) { if (callback) callback(false); return; }
    svc.loadAsync(KEY, null, function (err, data) {
      if (!err && Array.isArray(data) && data.length > 0) {
        if (typeof URLAUB_ANTRAEGE !== 'undefined') {
          URLAUB_ANTRAEGE.length = 0;
          data.forEach(function (x) { URLAUB_ANTRAEGE.push(x); });
        }
        if (callback) callback(true);
      } else {
        save();
        if (callback) callback(false);
      }
    });
  }

  // ── Feature: Antrag genehmigen ───────────────────────────────────────
  function urlaubGenehmigen(id) {
    if (typeof URLAUB_ANTRAEGE === 'undefined') return;
    var a = URLAUB_ANTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    a.status = 'genehmigt';
    a.entschiedenAm = new Date().toLocaleDateString('de-DE');
    save();
    if (typeof renderUrlaubAntraege === 'function') renderUrlaubAntraege();
    if (typeof showToast === 'function') showToast('✓ Genehmigt: ' + a.ma + ' · ' + a.typ);
  }

  // ── Feature: Antrag ablehnen ─────────────────────────────────────────
  function urlaubAblehnen(id) {
    if (typeof URLAUB_ANTRAEGE === 'undefined') return;
    var a = URLAUB_ANTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    a.status = 'abgelehnt';
    a.entschiedenAm = new Date().toLocaleDateString('de-DE');
    save();
    if (typeof renderUrlaubAntraege === 'function') renderUrlaubAntraege();
    if (typeof showToast === 'function') showToast('✗ Abgelehnt: ' + a.ma + ' · ' + a.typ);
  }

  // ── Feature: Antrag löschen ──────────────────────────────────────────
  function urlaubLoeschen(id) {
    if (typeof URLAUB_ANTRAEGE === 'undefined') return;
    var a = URLAUB_ANTRAEGE.find(function (x) { return x.id === id; });
    if (!a) return;
    if (!confirm('Antrag von ' + a.ma + ' (' + a.typ + ') wirklich löschen?\nDieser Vorgang kann nicht rückgängig gemacht werden.')) return;
    var idx = URLAUB_ANTRAEGE.findIndex(function (x) { return x.id === id; });
    if (idx !== -1) URLAUB_ANTRAEGE.splice(idx, 1);
    save();
    if (typeof renderUrlaubAntraege === 'function') renderUrlaubAntraege();
    if (typeof showToast === 'function') showToast('🗑 Antrag gelöscht: ' + id);
  }

  // ── Feature: Ampel-Badge für Dashboard ───────────────────────────────
  function urlaubStatusBadge() {
    if (typeof URLAUB_ANTRAEGE === 'undefined') return { offen: 0, genehmigt: 0, abgelehnt: 0, gesamt: 0 };
    var offen     = URLAUB_ANTRAEGE.filter(function (a) { return a.status === 'offen'; }).length;
    var genehmigt = URLAUB_ANTRAEGE.filter(function (a) { return a.status === 'genehmigt'; }).length;
    var abgelehnt = URLAUB_ANTRAEGE.filter(function (a) { return a.status === 'abgelehnt'; }).length;
    return { offen: offen, genehmigt: genehmigt, abgelehnt: abgelehnt, gesamt: URLAUB_ANTRAEGE.length };
  }

  // ── Feature: CSV-Export ───────────────────────────────────────────────
  function urlaubExportCsv() {
    if (typeof URLAUB_ANTRAEGE === 'undefined' || !URLAUB_ANTRAEGE.length) {
      if (typeof showToast === 'function') showToast('⚠ Keine Daten zum Exportieren');
      return;
    }
    var header = ['ID', 'Mitarbeiter', 'MA-ID', 'Typ', 'Von', 'Bis', 'Stunden', 'Notiz', 'Status', 'Erstellt', 'Entschieden am'];
    var rows = URLAUB_ANTRAEGE.map(function (a) {
      return [
        a.id || '', a.ma || '', a.maId || '', a.typ || '',
        a.von || '', a.bis || '', a.stunden || '',
        (a.notiz || '').replace(/;/g, ','),
        a.status || '', a.erstellt || '', a.entschiedenAm || ''
      ].join(';');
    });
    var csv  = header.join(';') + '\n' + rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href     = url;
    link.download = 'Urlaub_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('📥 CSV exportiert');
  }

  // ── Banner: offene Anträge anzeigen ──────────────────────────────────
  function _showUrlaubBanner() {
    var pg = document.getElementById('pg-urlaub');
    if (!pg) return;
    var existing = pg.querySelector('[data-urlaub-banner]');
    if (existing) existing.remove();

    var status = urlaubStatusBadge();
    if (status.offen === 0) return;

    var banner = document.createElement('div');
    banner.setAttribute('data-urlaub-banner', '1');
    banner.style.cssText = 'background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;'
      + 'padding:9px 14px;margin-bottom:10px;font-size:12px;color:#1e40af;display:flex;'
      + 'align-items:center;gap:10px;';
    banner.innerHTML = '📋 <strong>' + status.offen + ' Antrag' + (status.offen !== 1 ? 'anträge' : '') + ' offen</strong> · '
      + 'warten auf Entscheidung';

    var firstChild = pg.querySelector('.ph') || pg.firstElementChild;
    if (firstChild) firstChild.after(banner);
    else pg.prepend(banner);
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {
    // renderUrlaubAntraege: Banner + CSV-Button einblenden
    var _origRender = window.renderUrlaubAntraege;
    window.renderUrlaubAntraege = function () {
      var result = typeof _origRender === 'function' ? _origRender() : undefined;
      setTimeout(_showUrlaubBanner, 20);
      return result;
    };

    // urlaubEntscheiden wrappen (falls direkt aufgerufen — auch dann speichern)
    var _origEntscheiden = window.urlaubEntscheiden;
    if (typeof _origEntscheiden === 'function') {
      window.urlaubEntscheiden = function (id, status) {
        var result = _origEntscheiden(id, status);
        save();
        return result;
      };
    }

    // CSV-Button in Urlaub-Header einbauen
    var _origGoPage = window.goPage;
    window.goPage = function (id) {
      var result = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'urlaub') {
        setTimeout(function () {
          var ph = document.querySelector('#pg-urlaub .ph');
          if (!ph || ph.querySelector('[data-action="urlaub-csv"]')) return;
          var btn = document.createElement('button');
          btn.setAttribute('data-action', 'urlaub-csv');
          btn.className = 'btn';
          btn.style.marginLeft = '8px';
          btn.textContent = '📥 CSV';
          btn.title = 'Anträge als CSV exportieren';
          btn.onclick = urlaubExportCsv;
          ph.appendChild(btn);
        }, 50);
      }
      return result;
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    load(function (loaded) {
      if (loaded && typeof renderUrlaubAntraege === 'function') {
        renderUrlaubAntraege();
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 240); });
  } else {
    setTimeout(init, 240);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.UrlaubService      = { save: save, load: load, statusBadge: urlaubStatusBadge, exportCsv: urlaubExportCsv };
  window.urlaubGenehmigen   = urlaubGenehmigen;
  window.urlaubAblehnen     = urlaubAblehnen;
  window.urlaubLoeschen     = urlaubLoeschen;
  window.urlaubStatusBadge  = urlaubStatusBadge;
  window.urlaubExportCsv    = urlaubExportCsv;

  console.info('[CC] urlaub/index.js geladen — Genehmigen + Ablehnen + Löschen + CSV-Export');

})();
