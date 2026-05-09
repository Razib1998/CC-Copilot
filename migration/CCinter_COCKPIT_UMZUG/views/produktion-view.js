// ════════════════════════════════════════════════════════════════════
// CC INTERN — Produktion View
// ────────────────────────────────────────────────────────────────────
// Quelle:   CC inter/DEV/index.html + module/produktion/index.js
// Funktion: renderProduktion() — Produktions-Kanban + Status-Header
//
// Daten:    AUFTRAEGE[] (globales Array, befüllt via DataService)
// Module:   module/produktion/index.js liefert:
//           auftragDringend(), auftragArchivieren(), produktionStatusBadge()
//           + wraps renderKanban() mit Dringend/Archivieren-Buttons
//
// TODO [Cockpit]: AUFTRAEGE → API GET /api/v1/ccintern/auftraege (noch nicht gebaut)
// ════════════════════════════════════════════════════════════════════

function renderProduktion() {
  var container = document.getElementById('pg-produktion');
  if (!container) return;

  // ── Status-Badge berechnen ──────────────────────────────────────
  var badge = typeof produktionStatusBadge === 'function'
    ? produktionStatusBadge()
    : { total: 0, dringend: 0, heute: 0 };

  // ── Daten prüfen ────────────────────────────────────────────────
  var auftraege = (typeof AUFTRAEGE !== 'undefined' && Array.isArray(AUFTRAEGE))
    ? AUFTRAEGE.filter(function(a) { return !a.archiv; })
    : [];

  var aktiv        = auftraege.filter(function(a) { return a.step !== 'abgeschlossen'; });
  var dringend     = aktiv.filter(function(a) { return a.urgent; });
  var heute        = new Date().toLocaleDateString('de-DE');
  var faelligHeute = aktiv.filter(function(a) {
    return a.liefertermin === heute || a.montageDatum === heute;
  });

  // ── Header-HTML ──────────────────────────────────────────────────
  var headerHtml = '<div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;">'
    + _prodBadgeHtml('Aktive Aufträge', aktiv.length, 'var(--blue)')
    + _prodBadgeHtml('🔴 Dringend',     dringend.length, dringend.length > 0 ? 'var(--red)' : 'var(--text3)')
    + _prodBadgeHtml('📅 Fällig heute', faelligHeute.length, faelligHeute.length > 0 ? 'var(--amber)' : 'var(--text3)')
    + '</div>';

  // ── Filter-Leiste ────────────────────────────────────────────────
  var filterHtml = '<div style="display:flex;gap:8px;margin-bottom:16px;align-items:center;">'
    + '<span style="font-size:12px;color:var(--text3);font-weight:600;">FILTER:</span>'
    + '<button class="btn" onclick="prodFilterSetzen(\'alle\')"    id="prod-filter-alle"    style="font-size:12px;padding:4px 12px;">Alle</button>'
    + '<button class="btn" onclick="prodFilterSetzen(\'dringend\')" id="prod-filter-dringend" style="font-size:12px;padding:4px 12px;">🔴 Dringend</button>'
    + '<button class="btn" onclick="prodFilterSetzen(\'heute\')"   id="prod-filter-heute"   style="font-size:12px;padding:4px 12px;">📅 Heute</button>'
    + '</div>';

  // ── Kanban-Container ─────────────────────────────────────────────
  var kanbanHtml = '<div id="prod-kanban-wrap">'
    + (auftraege.length === 0
      ? '<div style="padding:40px;text-align:center;color:var(--text3);font-size:14px;">'
        + 'Keine Aufträge vorhanden.<br>'
        + '<small style="font-size:12px;">Aufträge werden nach dem Backend-Anschluss hier angezeigt.</small>'
        + '</div>'
      : '<div id="kanban-board"></div>')
    + '</div>';

  container.innerHTML = headerHtml + filterHtml + kanbanHtml;

  // ── Kanban rendern (falls Funktion vorhanden) ────────────────────
  if (typeof renderKanban === 'function') {
    renderKanban();
  }

  // ── Filter-Button aktiv markieren ───────────────────────────────
  _prodFilterAktiv('alle');
}

// ── Hilfsfunktion: Status-Badge HTML ────────────────────────────────
function _prodBadgeHtml(label, count, farbe) {
  return '<div style="display:flex;align-items:center;gap:8px;padding:10px 16px;'
    + 'background:#fff;border:1px solid var(--border);border-radius:10px;min-width:120px;">'
    + '<span style="font-size:22px;font-weight:700;color:' + farbe + ';">' + count + '</span>'
    + '<span style="font-size:12px;color:var(--text2);line-height:1.3;">' + label + '</span>'
    + '</div>';
}

// ── Filter: Kanban nach Kriterium filtern ────────────────────────────
function prodFilterSetzen(filter) {
  if (typeof AUFTRAEGE === 'undefined') return;
  var heute = new Date().toLocaleDateString('de-DE');

  // Globales Array temporär filtern
  var gefilterteBak = window._AUFTRAEGE_BAK || null;
  if (!gefilterteBak) {
    window._AUFTRAEGE_BAK = AUFTRAEGE.slice();
  }

  if (filter === 'dringend') {
    window.AUFTRAEGE = window._AUFTRAEGE_BAK.filter(function(a) { return !a.archiv && a.urgent; });
  } else if (filter === 'heute') {
    window.AUFTRAEGE = window._AUFTRAEGE_BAK.filter(function(a) {
      return !a.archiv && (a.liefertermin === heute || a.montageDatum === heute);
    });
  } else {
    // Alle: Original wiederherstellen
    if (window._AUFTRAEGE_BAK) {
      window.AUFTRAEGE = window._AUFTRAEGE_BAK.slice();
      window._AUFTRAEGE_BAK = null;
    }
  }

  if (typeof renderKanban === 'function') renderKanban();
  _prodFilterAktiv(filter);
}

// ── Filter-Button aktiv markieren ────────────────────────────────────
function _prodFilterAktiv(filter) {
  ['alle','dringend','heute'].forEach(function(f) {
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
