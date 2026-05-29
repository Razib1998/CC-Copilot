// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/materiallager/index.js
// ─────────────────────────────────────────────────────────────────────
// saveLager() + loadLager() sind bereits in index.html definiert.
// LAGER_CC = Array, DAL_KEY_LAGER = 'cc_intern_lager_v1'
//
// Dieser Block:
//   1. Sicherstellt dass loadLager() beim Start aufgerufen wird
//   2. Feature: lagerBestandWarnung() — Ampel für Mindestbestand
//   3. Feature: lagerArtikelBuchen(idx, menge) — Schnell-Abbuchen
//   4. Feature: lagerBestandSetzen(idx, menge) — Direkteingabe
//   5. Feature: lagerExportCsv() — CSV-Export des Bestands
//   6. Wraps renderLagerCC → nach jedem Render auto-save
//
// Kalender: CC Cockpit liefert den Kalender
// Zugriffsrechte: CC Cockpit regelt Basis
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  function lagerMtlIsUuid(s) {
    var v = s != null ? String(s).trim() : '';
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
  }

  function lagerMtlCockpitBlockNoApi(msg) {
    if (!window.__CCINTERN_COCKPIT_MOUNT__) return false;
    if (window.__CCINTERN_LAGER_API_OK === true) return false;
    if (typeof showToast === 'function') showToast(msg || '⚠ Lager nicht mit dem Server verbunden.');
    return true;
  }

  function lagerMtlDesktopMaOpts() {
    try {
      var raw = typeof window !== 'undefined' && window.CURRENT_USER_ID != null ? String(window.CURRENT_USER_ID).trim() : '';
      return lagerMtlIsUuid(raw) ? { mitarbeiter_id: raw } : {};
    } catch (e) {
      return {};
    }
  }

  // ── Feature: Bestand-Warnung (Ampel) ─────────────────────────────────
  function lagerBestandWarnung() {
    if (typeof LAGER_CC === 'undefined') return { ok: 0, warn: 0, leer: 0 };
    var ok = 0, warn = 0, leer = 0;
    LAGER_CC.forEach(function (a) {
      if (a.bestand <= 0)                     leer++;
      else if (a.bestand <= (a.mindest || 0)) warn++;
      else                                     ok++;
    });
    return { ok: ok, warn: warn, leer: leer };
  }

  // ── Feature: Schnell-Abbuchen ─────────────────────────────────────────
  function lagerArtikelBuchen(idx, menge) {
    if (typeof LAGER_CC === 'undefined') return;
    var a = LAGER_CC[idx];
    if (!a) return;
    var m = Number(menge);
    if (!Number.isFinite(m) || m <= 0) m = 1;
    var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
    if (api && typeof api.postLagerBuchungAndRefresh === 'function') {
      var mid = a.id != null ? String(a.id).trim() : '';
      if (!mid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mid)) {
        if (typeof showToast === 'function') showToast('⚠ Keine Backend-ID — Abbuchen nicht möglich.');
        return;
      }
      var st = typeof showToast === 'function' ? showToast : null;
      api
        .postLagerBuchungAndRefresh(mid, 'entnahme', m, st, lagerMtlDesktopMaOpts())
        .then(function () {
          if (st) st('📦 Gebucht: ' + (a.art || a.nr) + ' (vom Server geladen)');
        })
        .catch(function () {
          if (st) st('⚠ Abbuchen fehlgeschlagen.');
        });
      return;
    }
    var neu = (a.bestand || 0) - m;
    a.bestand = Math.max(0, neu);
    a.status  = a.bestand <= 0 ? 'leer' : a.bestand <= (a.mindest || 0) ? 'warn' : 'ok';
    if (typeof saveLager      === 'function') saveLager();
    if (typeof renderLagerCC  === 'function') renderLagerCC();
    if (typeof showToast      === 'function') showToast('📦 Gebucht: ' + (a.art || a.nr) + ' → ' + a.bestand + ' ' + (a.eh || ''));
  }

  // ── Feature: Bestand direkt setzen ───────────────────────────────────
  function lagerBestandSetzen(idx, menge) {
    if (typeof LAGER_CC === 'undefined') return;
    var a = LAGER_CC[idx];
    if (!a) return;
    var neu = parseFloat(menge) || 0;
    var api = window.__CCINTERN_LAGER_API_OK === true && window.CCIntern && window.CCIntern.cockpitApi ? window.CCIntern.cockpitApi : null;
    if (api && typeof api.postLagerBuchungAndRefresh === 'function') {
      var mid = a.id != null ? String(a.id).trim() : '';
      if (!mid || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(mid)) {
        if (typeof showToast === 'function') showToast('⚠ Keine Backend-ID — Bestand nicht setzbar.');
        return;
      }
      var alt = Number(a.bestand || 0);
      var d = neu - alt;
      if (Math.abs(d) < 1e-9) {
        if (typeof showToast === 'function') showToast('✓ Bestand unverändert.');
        return;
      }
      var st = typeof showToast === 'function' ? showToast : null;
      var mo = lagerMtlDesktopMaOpts();
      var p =
        d > 0
          ? api.postLagerBuchungAndRefresh(mid, 'zugang', Math.abs(d), st, mo)
          : api.postLagerBuchungAndRefresh(mid, 'entnahme', Math.abs(d), st, mo);
      p.then(function () {
          if (st) st('✓ Bestand gesetzt: ' + (a.art || a.nr));
        }).catch(function () {
          if (st) st('⚠ Bestand konnte nicht gesetzt werden.');
        });
      return;
    }
    if (lagerMtlCockpitBlockNoApi()) return;
    a.bestand = neu;
    a.status  = a.bestand <= 0 ? 'leer' : a.bestand <= (a.mindest || 0) ? 'warn' : 'ok';
    if (typeof saveLager     === 'function') saveLager();
    if (typeof renderLagerCC === 'function') renderLagerCC();
    if (typeof showToast     === 'function') showToast('✓ Bestand gesetzt: ' + (a.art || a.nr) + ' = ' + a.bestand + ' ' + (a.eh || ''));
  }

  // ── Feature: CSV-Export ───────────────────────────────────────────────
  function lagerExportCsv() {
    if (typeof LAGER_CC === 'undefined' || !LAGER_CC.length) {
      if (typeof showToast === 'function') showToast('⚠ Keine Daten zum Exportieren');
      return;
    }
    var header = ['Nr', 'Artikel', 'Kategorie', 'Bestand', 'Einheit', 'Mindestbestand', 'Status', 'Bestellt'];
    var rows   = LAGER_CC.map(function (a) {
      return [
        a.nr || '', a.art || '', a.kat || '',
        a.bestand || 0, a.eh || '', a.mindest || 0,
        a.status || '', a.bestellt || 0,
      ].join(';');
    });
    var csv  = header.join(';') + '\n' + rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href     = url;
    link.download = 'Materiallager_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('📥 CSV exportiert');
  }

  // ── Feature: Niedrigbestand-Banner einblenden ─────────────────────────
  function _showBestandBanner() {
    var pg = document.getElementById('pg-lager');
    if (!pg) return;
    var existing = pg.querySelector('[data-lager-banner]');
    if (existing) existing.remove();

    var status = lagerBestandWarnung();
    if (status.warn === 0 && status.leer === 0) return;

    var banner = document.createElement('div');
    banner.setAttribute('data-lager-banner', '1');
    banner.style.cssText = 'background:#fffbeb;border:1px solid #fde68a;border-radius:8px;'
      + 'padding:9px 14px;margin-bottom:10px;font-size:12px;color:#92400e;display:flex;'
      + 'align-items:center;gap:10px;';
    banner.innerHTML = '⚠ <strong>' + status.leer + ' Artikel leer</strong> · '
      + '<strong>' + status.warn + ' unter Mindestbestand</strong> · '
      + '<button onclick="lagerBestellungAufgeben()" style="margin-left:auto;padding:4px 10px;'
      + 'background:#f59e0b;border:none;border-radius:6px;color:#fff;font-size:11px;cursor:pointer;">'
      + '🛒 Bestellung aufgeben</button>';

    var firstChild = pg.querySelector('.ph') || pg.firstElementChild;
    if (firstChild) firstChild.after(banner);
    else pg.prepend(banner);
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {
    var _origRenderLager = window.renderLagerCC;
    window.renderLagerCC = function () {
      var result = typeof _origRenderLager === 'function' ? _origRenderLager() : undefined;
      setTimeout(_showBestandBanner, 20);
      return result;
    };

    // Export-Button in Lager-Header einbauen
    var _origGoPage = window.goPage;
    window.goPage = function (id) {
      var result = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'lager') {
        setTimeout(function () {
          var ph = document.querySelector('#pg-lager .ph');
          if (!ph || ph.querySelector('[data-action="lager-csv"]')) return;
          var btn = document.createElement('button');
          btn.setAttribute('data-action', 'lager-csv');
          btn.className = 'btn';
          btn.style.marginLeft = '8px';
          btn.textContent = '📥 CSV';
          btn.title = 'Bestand als CSV exportieren';
          btn.onclick = lagerExportCsv;
          ph.appendChild(btn);
        }, 50);
      }
      return result;
    };
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    if (typeof loadLager === 'function') {
      loadLager();
      setTimeout(function () {
        if (typeof renderLagerCC === 'function') renderLagerCC();
      }, 100);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 220); });
  } else {
    setTimeout(init, 220);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.LagerService          = { warnung: lagerBestandWarnung, exportCsv: lagerExportCsv };
  window.lagerArtikelBuchen    = lagerArtikelBuchen;
  window.lagerBestandSetzen    = lagerBestandSetzen;
  window.lagerExportCsv        = lagerExportCsv;
  window.lagerBestandWarnung   = lagerBestandWarnung;

  console.info('[CC] materiallager/index.js geladen — Bestand-Ampel + Buchen + CSV-Export');

})();
