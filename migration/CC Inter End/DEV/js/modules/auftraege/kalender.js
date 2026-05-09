// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/auftraege/kalender.js
// ─────────────────────────────────────────────────────────────────────
// Erweiterung des bestehenden Kalenders (buildCCCalendar in index.html).
// Kein Ersetzen — nur Ergänzen via function-wrapping.
//
// Neue Features:
//   1. Liefertermin-Events (grün) — wenn abweichend von terminDatum & montageDatum
//   2. ccCalDayClick Override — zeigt alle Aufträge des Tages als Panel
//   3. Kalender-Filter (alle / nur Montage / nur Produktion / heute)
//   4. Auto-Init beim Wechsel zur Kalender-Seite
//
// WICHTIG: _installWraps() wird über DOMContentLoaded aufgerufen, damit
//   die function-Deklarationen aus dem Inline-Script nicht die Wraps
//   überschreiben (Inline-Script startet bei Zeile ~1318 in index.html).
// ══════════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  // ── 3. Kalender-Filter — setzt window._ccKalFilter + rebuild ────────
  window.ccKalenderSetFilter = function(typ) {
    window._ccKalFilter = typ || 'alle';
    ['alle', 'montage', 'produktion', 'heute'].forEach(function(f) {
      var btn = document.getElementById('cckal-filter-' + f);
      if (!btn) return;
      btn.style.background = (f === window._ccKalFilter) ? 'var(--blue)' : 'var(--gray-l)';
      btn.style.color      = (f === window._ccKalFilter) ? '#fff'        : 'var(--text2)';
    });
    if (typeof buildCCCalendar === 'function') buildCCCalendar();
  };

  // ── 4. Filter-UI in Kalender-Header einbauen (einmalig) ─────────────
  function injectKalenderFilter() {
    if (document.getElementById('cckal-filter-alle')) return;
    var ph = document.querySelector('#pg-kalender .ph-right');
    if (!ph) return;

    var filterDiv = document.createElement('div');
    filterDiv.style.cssText = 'display:flex;gap:4px;align-items:center;';
    filterDiv.innerHTML =
      _filterBtn('cckal-filter-alle',        '📋 Alle',        'alle',       true)
      + _filterBtn('cckal-filter-montage',   '🚌 Montage',     'montage',    false)
      + _filterBtn('cckal-filter-produktion','🎨 Produktion',  'produktion', false)
      + _filterBtn('cckal-filter-heute',     '📅 Heute',       'heute',      false);
    ph.insertBefore(filterDiv, ph.firstChild);
  }

  function _filterBtn(id, lbl, val, active) {
    var bg  = active ? 'var(--blue)' : 'var(--gray-l)';
    var col = active ? '#fff'        : 'var(--text2)';
    return '<button id="' + id + '" onclick="ccKalenderSetFilter(\'' + val + '\')" '
      + 'style="font-size:10px;padding:4px 10px;border:1px solid var(--border);border-radius:6px;'
      + 'background:' + bg + ';color:' + col + ';cursor:pointer;white-space:nowrap;font-weight:600;">'
      + lbl + '</button>';
  }

  // ── Wraps installieren (nach DOMContentLoaded) ───────────────────────
  // Erst nach DOMContentLoaded ausführen, damit die Inline-Funktions-
  // deklarationen (ccGetAlleTermine, ccCalDayClick, goPage) nicht
  // die Wraps überschreiben.
  function _installWraps() {

    // 1. ccGetAlleTermine: Liefertermin als grüner Event ergänzen
    var _origGetTermine = window.ccGetAlleTermine;
    window.ccGetAlleTermine = function() {
      var result = _origGetTermine ? _origGetTermine() : [];
      var filter = window._ccKalFilter || 'alle';

      if (typeof AUFTRAEGE !== 'undefined') {
        AUFTRAEGE.forEach(function(a) {
          var start   = (a.terminDatum || a.liefertermin || '').substring(0, 10);
          var montage = a.montageDatum ? a.montageDatum.substring(0, 10) : '';
          var liefer  = a.liefertermin  ? a.liefertermin.substring(0, 10)  : '';
          if (liefer && liefer !== start && liefer !== montage) {
            result.push({
              id:         'T-LIE-' + a.id,
              datum:      liefer,
              titel:      '🏁 Lieferung: ' + a.kunde + ' · ' + a.fz,
              typ:        'green',
              depot:      (a.depot || 'Intern').replace('Depot ', '').replace(' (Bogestra)', ''),
              monteur:    (a.schritte && a.schritte.montage && (a.schritte.montage.verantwortlicherName || a.schritte.montage.wer)) || '—',
              quelle:     'cc',
              step:       'lieferung',
              auftragId:  a.id,
            });
          }
        });
      }

      if (filter === 'montage')    return result.filter(function(t) { return t.step === 'montage' || t.step === 'lieferung'; });
      if (filter === 'produktion') return result.filter(function(t) { return t.quelle === 'cc' && t.step !== 'abgeschlossen'; });
      if (filter === 'heute') {
        var h = new Date().toISOString().substring(0, 10);
        return result.filter(function(t) { return t.datum === h; });
      }
      return result;
    };

    // 2. ccCalDayClick Override — Tagesdetail in Sidebar
    var _origDayClick = window.ccCalDayClick;
    window.ccCalDayClick = function(dStr) {
      var alle = window.ccGetAlleTermine();
      var tt   = alle.filter(function(t) { return t.datum === dStr; });
      if (!tt.length) return;

      var el = document.getElementById('ccUpcomingList');
      if (!el) {
        if (_origDayClick) _origDayClick(dStr);
        return;
      }

      var d    = new Date(dStr);
      var WOCHENTAGE_LANG = ['Sonntag','Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag'];
      var wt   = WOCHENTAGE_LANG[d.getDay()];
      var dFmt = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
      var cMap = { blue: 'var(--blue)', green: 'var(--green)', amber: 'var(--amber)', red: 'var(--red)', purple: '#7C3AED', teal: 'var(--teal)' };

      var html = '<div style="padding:10px 12px;background:#F5F7FA;border-bottom:1px solid var(--border);margin-bottom:6px;">'
        + '<div style="font-size:12px;font-weight:700;color:var(--text);">' + wt + ', ' + dFmt + '</div>'
        + '<div style="font-size:10px;color:var(--text3);">' + tt.length + ' Termin(e)</div>'
        + '<button onclick="ccBuildUpcoming()" style="margin-top:6px;font-size:10px;padding:2px 8px;border:1px solid var(--border);'
        + 'border-radius:5px;background:#fff;cursor:pointer;color:var(--text2);">✕ Schließen</button>'
        + '</div>';

      html += tt.map(function(t) {
        var col = t.quelle === 'fusa' ? 'var(--amber)' : (cMap[t.typ] || 'var(--blue)');
        var ico = { grafik: '🎨', druck: '🖨️', laminat: '📐', montage: '🚌', doku: '📷', abgeschlossen: '✅', lieferung: '🏁' }[t.step]
                  || (t.quelle === 'fusa' ? '🟠' : '📋');
        var qTag = t.quelle === 'fusa'
          ? '<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:#FFF3E0;color:#E65100;font-weight:700;margin-left:4px;">FUSA</span>'
          : '';
        var lieTag = t.step === 'lieferung'
          ? '<span style="font-size:9px;padding:1px 5px;border-radius:5px;background:#E8F5E9;color:#2E7D32;font-weight:700;margin-left:4px;">Lieferung</span>'
          : '';
        return '<div onclick="ccTerminClick(\'' + t.id + '\')" '
          + 'style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s;" '
          + 'onmouseover="this.style.background=\'#F0F5FF\'" onmouseout="this.style.background=\'transparent\'">'
            + '<div style="width:4px;align-self:stretch;border-radius:2px;background:' + col + ';flex-shrink:0;"></div>'
            + '<div style="flex:1;min-width:0;">'
              + '<div style="font-size:12px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">' + ico + ' ' + t.titel + '</div>'
              + '<div style="font-size:11px;color:var(--text2);margin-top:2px;">👷 ' + t.monteur + qTag + lieTag + '</div>'
            + '</div>'
          + '</div>';
      }).join('');

      el.innerHTML = html;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // 3. goPage Hook: Filter einbauen wenn Kalender-Seite geöffnet wird
    var _origGoPage = window.goPage;
    window.goPage = function(id) {
      var r = _origGoPage ? _origGoPage.apply(this, arguments) : undefined;
      if (id === 'kalender') setTimeout(injectKalenderFilter, 100);
      return r;
    };
  }

  // ── DOMContentLoaded: Wraps installieren ────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      _installWraps();
      // Direkt init wenn Kalender bereits aktiv
      if (document.getElementById('pg-kalender') &&
          document.getElementById('pg-kalender').classList.contains('active')) {
        setTimeout(injectKalenderFilter, 200);
      }
    });
  } else {
    _installWraps();
    if (document.getElementById('pg-kalender') &&
        document.getElementById('pg-kalender').classList.contains('active')) {
      setTimeout(injectKalenderFilter, 200);
    }
  }

  console.info('[CC] auftraege/kalender.js geladen — Liefertermin-Events + Filter + Tagesdetail');

})();
