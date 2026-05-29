// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/mitarbeiter-app/index.js
// ─────────────────────────────────────────────────────────────────────
// Mitarbeiter-App = Mobile Shell (pg-mobil div) mit Zeiterfassung,
// Aufgaben, Lager, Fotos und Urlaubsanträgen.
//
// Folgende Funktionen sind bereits in index.html vorhanden:
//   mobInit(), mobSetMA(maId), mobAbmelden(), mobZeitToggle()
//   mobRenderHome(), mobRenderAlle(), mobRenderFotos()
//   mobRenderLager(), mobRenderUrlaub(), mobUrlaubSenden()
//   MOB_MA_ID, MA_ANWESENHEIT, saveAnwesenheit(), loadAnwesenheit()
//
// Dieser Block:
//   1. Sicherstellt dass mobInit() beim Seitenwechsel gerufen wird
//   2. Feature: mobAnwesenheitStats(maId) — Stundenübersicht Badge
//   3. Feature: mobOffeneAntraege()       — Anzahl offener Urlaubsanträge
//   4. Feature: mobSidebarBadge()         — Badge im Sidebar-Icon aktuell halten
//   5. Feature: mobZeitExportCsv(maId)    — CSV der Anwesenheitszeiten
//   6. Wraps goPage('mobil') → mobInit + Daten nachladen
//
// Kalender: CC Cockpit liefert Kalender — kein eigener Code hier
// Zugriffsrechte: CC Cockpit regelt Basis
// ══════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  // ── Feature: Anwesenheits-Stats eines MA ─────────────────────────────
  // Gibt Stunden für aktuellen Monat zurück: { soll, gebucht, rest, tage }
  function mobAnwesenheitStats(maId) {
    var id    = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    var empty = { soll: 0, gebucht: 0, rest: 0, tage: 0 };
    if (!id || typeof MA_ANWESENHEIT === 'undefined') return empty;

    var heute = new Date();
    var monat = heute.toISOString().slice(0, 7); // YYYY-MM

    var ma    = typeof maByID === 'function' ? maByID(id) : null;
    var soll  = ma ? (ma.soll || 160) : 160;

    var eintraege = MA_ANWESENHEIT.filter(function (a) {
      return a.maId === id && (a.datum || '').slice(0, 7) === monat;
    });

    var gebucht = eintraege.reduce(function (s, a) { return s + (a.dauer || 0); }, 0);
    gebucht = Math.round(gebucht * 10) / 10;

    return {
      soll:    soll,
      gebucht: gebucht,
      rest:    Math.max(0, Math.round((soll - gebucht) * 10) / 10),
      tage:    eintraege.length,
    };
  }

  // ── Feature: Offene Urlaubsanträge ───────────────────────────────────
  function mobOffeneAntraege(maId) {
    if (typeof URLAUB_ANTRAEGE === 'undefined') return 0;
    var id = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    if (!id) return URLAUB_ANTRAEGE.filter(function (a) { return a.status === 'offen'; }).length;
    return URLAUB_ANTRAEGE.filter(function (a) { return a.maId === id && a.status === 'offen'; }).length;
  }

  // ── Feature: Sidebar-Badge aktualisieren ─────────────────────────────
  function mobSidebarBadge() {
    // Suche Link/Button für Mobil in der Sidebar
    var nav = document.querySelector('[data-page="mobil"]')
      || document.querySelector('[onclick*="mobil"]');
    if (!nav) return;

    var offene = typeof URLAUB_ANTRAEGE !== 'undefined'
      ? URLAUB_ANTRAEGE.filter(function (a) { return a.status === 'offen'; }).length
      : 0;

    var badge = nav.querySelector('[data-mob-badge]');
    if (offene > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.setAttribute('data-mob-badge', '1');
        badge.style.cssText = 'display:inline-block;background:#ef4444;color:#fff;'
          + 'border-radius:99px;font-size:10px;font-weight:700;'
          + 'padding:1px 5px;margin-left:5px;vertical-align:middle;';
        nav.appendChild(badge);
      }
      badge.textContent = offene;
    } else if (badge) {
      badge.remove();
    }
  }

  // ── Feature: Anwesenheits-CSV-Export ─────────────────────────────────
  function mobZeitExportCsv(maId) {
    if (typeof MA_ANWESENHEIT === 'undefined' || !MA_ANWESENHEIT.length) {
      if (typeof showToast === 'function') showToast('⚠ Keine Anwesenheitsdaten vorhanden');
      return;
    }
    var id    = maId || (typeof MOB_MA_ID !== 'undefined' ? MOB_MA_ID : null);
    var daten = id ? MA_ANWESENHEIT.filter(function (a) { return a.maId === id; }) : MA_ANWESENHEIT;

    if (!daten.length) {
      if (typeof showToast === 'function') showToast('⚠ Keine Daten für diesen Mitarbeiter');
      return;
    }

    var header = ['Mitarbeiter', 'MA-ID', 'Datum', 'Start', 'Ende', 'Dauer (h)', 'Typ'];
    var rows   = daten.map(function (a) {
      return [
        a.ma || '', a.maId || '', a.datum || '',
        a.start || '', a.end || '',
        (a.dauer || 0).toFixed(2).replace('.', ','),
        a.typ || 'anwesenheit'
      ].join(';');
    });

    var csv  = header.join(';') + '\n' + rows.join('\n');
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    var url  = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href     = url;
    link.download = 'Anwesenheit' + (id ? '_' + id : '') + '_' + new Date().toISOString().slice(0, 10) + '.csv';
    link.click();
    URL.revokeObjectURL(url);
    if (typeof showToast === 'function') showToast('📥 CSV exportiert');
  }

  // ── Wraps installieren ────────────────────────────────────────────────
  function _installWraps() {
    // goPage('mobil') → mobInit aufrufen + Badge aktualisieren
    var _origGoPage = window.goPage;
    window.goPage = function (id) {
      var result = typeof _origGoPage === 'function' ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'mobil') {
        setTimeout(function () {
          if (typeof mobInit === 'function') mobInit();
          mobSidebarBadge();
        }, 50);
      }
      return result;
    };

    // saveAnwesenheit wrappen → Badge nach jedem Speichern aktualisieren
    var _origSaveAnwesenheit = window.saveAnwesenheit;
    if (typeof _origSaveAnwesenheit === 'function') {
      window.saveAnwesenheit = function () {
        var result = _origSaveAnwesenheit();
        setTimeout(mobSidebarBadge, 100);
        return result;
      };
    }

    // mobUrlaubSenden wrappen → Badge aktualisieren
    var _origMobUrlaubSenden = window.mobUrlaubSenden;
    if (typeof _origMobUrlaubSenden === 'function') {
      window.mobUrlaubSenden = function () {
        var result = _origMobUrlaubSenden.apply(this, arguments);
        setTimeout(mobSidebarBadge, 200);
        return result;
      };
    }
  }

  // ── Init ──────────────────────────────────────────────────────────────
  function init() {
    _installWraps();
    // Daten laden falls noch nicht geschehen
    if (typeof loadAnwesenheit === 'function') loadAnwesenheit();
    if (typeof loadUrlaub      === 'function') loadUrlaub();
    setTimeout(mobSidebarBadge, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 260); });
  } else {
    setTimeout(init, 260);
  }

  // ── Globaler Export ───────────────────────────────────────────────────
  window.MitarbeiterAppService  = {
    anwesenheitStats: mobAnwesenheitStats,
    offeneAntraege:   mobOffeneAntraege,
    sidebarBadge:     mobSidebarBadge,
    zeitExportCsv:    mobZeitExportCsv,
  };
  window.mobAnwesenheitStats  = mobAnwesenheitStats;
  window.mobOffeneAntraege    = mobOffeneAntraege;
  window.mobSidebarBadge      = mobSidebarBadge;
  window.mobZeitExportCsv     = mobZeitExportCsv;

  console.info('[CC] mitarbeiter-app/index.js geladen — Stats + Badge + CSV-Export');

})();
