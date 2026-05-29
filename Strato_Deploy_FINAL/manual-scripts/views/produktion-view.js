// ════════════════════════════════════════════════════════════════════
// CC INTERN — Produktion View
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html + module/produktion/index.js
// Funktion: renderProduktion() — Produktions-Kanban (KPI-Leiste in renderKanban)
//
// Daten:    AUFTRAEGE[] (globales Array, befüllt via DataService)
// Module:   module/produktion/index.js liefert:
//           auftragDringend(), auftragArchivieren(), produktionStatusBadge()
//           + wraps renderKanban() mit Dringend/Archivieren-Buttons
//
// Produktion: beim Öffnen immer GET /api/v1/ccintern/auftraege (kein alter RAM-Stand / Race mit dalInit).
// Desktop-Kanban: keine zeitbasierte Ausblendung abgeschlossener Aufträge.
// ════════════════════════════════════════════════════════════════════

async function renderProduktion() {
  var container = document.getElementById('pg-produktion');
  if (!container) return;

  if (!Array.isArray(window.AUFTRAEGE)) {
    window.AUFTRAEGE = [];
  }

  // Zuerst Temporärfilter zurücksetzen — sonst überschreibt ein altes Backup nach dem API-Reload wieder Stale-Daten.
  if (typeof AUFTRAEGE !== 'undefined' && window._AUFTRAEGE_BAK) {
    window.AUFTRAEGE = window._AUFTRAEGE_BAK.slice();
    window._AUFTRAEGE_BAK = null;
  }

  var api = typeof window !== 'undefined' && window.CCIntern && window.CCIntern.cockpitApi;
  if (api && typeof api.reloadAuftraegeFromApiIntoMemory === 'function') {
    try {
      var reloadErr = await api.reloadAuftraegeFromApiIntoMemory(null);
      if (reloadErr) console.error('Produktion Reload Fehler', reloadErr);
    } catch (e) {
      console.error('Produktion Reload Fehler', e);
    }
  }

  var auftraege = (typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE))
    ? AUFTRAEGE.filter(function (a) { return !a.archiv; })
    : [];

  var proMaPanel = '<div class="panel" id="cc-aufgaben-pro-ma-panel" style="margin-bottom:16px;"></div>';
  var kanbanHtml = '<div id="prod-kanban-wrap">'
    + proMaPanel
    + (auftraege.length === 0
      ? '<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;">'
        + 'Keine Aufträge vorhanden.<br>'
        + '<small style="font-size:12px;">Aufträge werden nach dem Backend-Anschluss hier angezeigt.</small>'
        + '</div>'
      : '<div id="kanbanBoard"></div>')
    + '</div>';

  container.innerHTML = kanbanHtml;

  if (typeof renderKanban === 'function') {
    renderKanban();
  }
}

// ── Filter: Kanban nach Kriterium filtern (ohne UI; z. B. Legacy-Aufrufe) ──
function prodFilterSetzen(filter) {
  if (typeof AUFTRAEGE === 'undefined') return;
  var heute = new Date().toLocaleDateString('de-DE');

  var gefilterteBak = window._AUFTRAEGE_BAK || null;
  if (!gefilterteBak) {
    window._AUFTRAEGE_BAK = AUFTRAEGE.slice();
  }

  if (filter === 'dringend') {
    window.AUFTRAEGE = window._AUFTRAEGE_BAK.filter(function (a) { return !a.archiv && a.urgent; });
  } else if (filter === 'heute') {
    window.AUFTRAEGE = window._AUFTRAEGE_BAK.filter(function (a) {
      return !a.archiv && (a.liefertermin === heute || a.montageDatum === heute);
    });
  } else {
    if (window._AUFTRAEGE_BAK) {
      window.AUFTRAEGE = window._AUFTRAEGE_BAK.slice();
      window._AUFTRAEGE_BAK = null;
    }
  }

  if (typeof renderKanban === 'function') renderKanban();
  _prodFilterAktiv(filter);
}

// ── Filter-Button aktiv markieren (No-Op wenn keine Buttons im DOM) ───
function _prodFilterAktiv(filter) {
  ['alle', 'dringend', 'heute'].forEach(function (f) {
    var btn = document.getElementById('prod-filter-' + f);
    if (!btn) return;
    if (f === filter) {
      btn.style.background = 'var(--blue)';
      btn.style.color = '#fff';
      btn.style.borderColor = 'var(--blue)';
    } else {
      btn.style.background = '';
      btn.style.color = '';
      btn.style.borderColor = '';
    }
  });
}
