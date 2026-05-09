// ══════════════════════════════════════════════════════════════════════
// CC INTERN — js/modules/auftraege/checklisten.js
// ─────────────────────────────────────────────────────────────────────
// Erweiterung Checklisten-Logik im Auftragsdetail.
// Basis: auCheckToggle, schrittClToggle, auCheckAdd in index.html.
//
// Neue Features:
//   1. CL-Vorlage auf Schritt anwenden (aus CL_VORLAGEN)
//   2. Alle-Schritte-Übersicht: Mini-Progress für jeden Workflow-Schritt
//   3. "Vorlage anwenden" Button wird ins Detail injiziert
//   4. Hooks in auftragDetailModuleInit
// ══════════════════════════════════════════════════════════════════════

window.AuftragChecklisten = (function() {
  'use strict';

  var SCHRITTE = ['grafik', 'druck', 'laminat', 'montage', 'doku'];

  // ── CL-Vorlage auf einen Schritt anwenden ──────────────────────────
  function vonVorlageAnwenden(auftragId, step, vorlagenId) {
    var a = _findAuftrag(auftragId);
    if (!a) return;
    if (!a.schritte) a.schritte = {};
    if (!a.schritte[step]) a.schritte[step] = {};

    var vorlage = (typeof CL_VORLAGEN !== 'undefined' ? CL_VORLAGEN : [])
      .find(function(v) { return v.id === vorlagenId; });
    if (!vorlage) return;

    var existing = a.schritte[step].checkliste || [];
    function applyVorlageCheckliste() {
    var neueItems = (vorlage.punkte || []).map(function(p) {
      return {
        text:     p.text || '',
        kat:      p.kat  || 'pflicht',
        hinweis:  p.hinweis || '',
        quelle:   vorlage.name,
        erledigt: false,
      };
    });

    a.schritte[step].checkliste = existing.concat(neueItems);
    var apiCl = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
    if (apiCl && typeof apiCl.logCcInternChecklistAuditFromUi === 'function') {
      apiCl.logCcInternChecklistAuditFromUi(a, 'UI (Vorlage): schritte.checkliste nach Anwenden', {
        auftragId: auftragId,
        step: step,
        neueItems: neueItems.length,
      });
    }
    _saveAfterMutation(function() {
      if (typeof openAuftragDetail === 'function') openAuftragDetail(auftragId);
      if (typeof showToast === 'function') {
        showToast('✓ ' + neueItems.length + ' Punkte aus "' + vorlage.name + '" hinzugefügt');
      }
    });
    }

    if (existing.length > 0) {
      if (typeof ccInternConfirm !== 'function') return;
      ccInternConfirm('Schritt "' + step + '" hat bereits ' + existing.length + ' Prüfpunkte.\nVorlage ZUSÄTZLICH hinzufügen?', applyVorlageCheckliste);
    } else {
      applyVorlageCheckliste();
    }
  }

  // ── Alle Checklisten eines Auftrags leeren (Schritt-spezifisch) ─────
  function checklisteLeeren(auftragId, step) {
    var a = _findAuftrag(auftragId);
    if (!a || !a.schritte || !a.schritte[step]) return;
    if (typeof ccInternConfirm !== 'function') return;
    ccInternConfirm('Checkliste für "' + step + '" wirklich leeren?', function() {
    a.schritte[step].checkliste = [];
    var apiLeer = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
    if (apiLeer && typeof apiLeer.logCcInternChecklistAuditFromUi === 'function') {
      apiLeer.logCcInternChecklistAuditFromUi(a, 'UI (Vorlage): schritte.checkliste geleert', { auftragId: auftragId, step: step });
    }
    _saveAfterMutation(function() {
      if (typeof openAuftragDetail === 'function') openAuftragDetail(auftragId);
    });
    });
  }

  // ── Alle-Schritte Mini-Progress rendern ────────────────────────────
  function renderChecklistenOverview(auftragId) {
    var a = _findAuftrag(auftragId);
    if (!a || !a.schritte) return '';

    var rows = SCHRITTE.map(function(s) {
      var sch    = a.schritte[s] || {};
      var items  = sch.checkliste || [];
      var done   = items.filter(function(c) { return c.erledigt; }).length;
      var total  = items.length;
      var pct    = total ? Math.round(done / total * 100) : 0;
      var sl     = (typeof STEP_LABELS !== 'undefined' && STEP_LABELS[s]) || { title: s, col: 'var(--blue)' };
      var col    = sl.col;
      var barCol = pct === 100 ? 'var(--green)' : pct > 50 ? 'var(--amber)' : col;
      var status = sch.status || 'offen';
      var isDone = status === 'abgeschlossen';

      return '<div style="padding:8px 0;border-bottom:1px solid var(--border);">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">'
          + '<div style="display:flex;align-items:center;gap:6px;">'
            + '<div style="width:8px;height:8px;border-radius:50%;background:' + (isDone ? 'var(--green)' : col) + ';flex-shrink:0;"></div>'
            + '<span style="font-size:11px;font-weight:600;color:' + (isDone ? 'var(--green)' : col) + ';">' + sl.title + '</span>'
          + '</div>'
          + '<div style="display:flex;align-items:center;gap:6px;">'
            + (total > 0
                ? '<span style="font-size:10px;color:' + barCol + ';font-weight:700;">' + done + '/' + total + ' (' + pct + '%)</span>'
                : '<span style="font-size:10px;color:var(--text3);">Keine CL</span>')
            + _vorlagenPickerBtn(auftragId, s)
          + '</div>'
        + '</div>'
        + (total > 0
          ? '<div style="height:4px;background:var(--border);border-radius:2px;overflow:hidden;">'
              + '<div style="height:100%;width:' + pct + '%;background:' + barCol + ';border-radius:2px;transition:width .3s;"></div>'
            + '</div>'
          : '')
      + '</div>';
    }).join('');

    return '<div class="dp-section">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">'
        + '<div class="dp-slbl" style="margin-bottom:0;">📋 Checklisten-Übersicht</div>'
      + '</div>'
      + rows
    + '</div>';
  }

  // ── Vorlage-Picker Button (dropdown via prompt für Einfachheit) ──────
  function _vorlagenPickerBtn(auftragId, step) {
    var vorlagen = (typeof CL_VORLAGEN !== 'undefined' ? CL_VORLAGEN : []).filter(function(v) { return v.aktiv; });
    if (!vorlagen.length) return '';
    return '<button onclick="AuftragChecklisten.vorlagenPicker(\'' + auftragId + '\',\'' + step + '\')" '
      + 'style="font-size:9px;padding:2px 7px;border:1px solid var(--border);border-radius:5px;'
      + 'background:var(--blue-l);color:var(--blue);cursor:pointer;font-weight:600;" title="Vorlage anwenden">+ Vorlage</button>';
  }

  // ── Vorlage-Picker Modal (kleines Inline-Panel) ──────────────────────
  function vorlagenPicker(auftragId, step) {
    var vorlagen = (typeof CL_VORLAGEN !== 'undefined' ? CL_VORLAGEN : []).filter(function(v) { return v.aktiv; });
    if (!vorlagen.length) {
      if (typeof showToast === 'function') showToast('Keine aktiven Vorlagen vorhanden');
      return;
    }

    // Existierendes Picker-Overlay entfernen
    var old = document.getElementById('cc-cl-picker-overlay');
    if (old) old.remove();

    var overlay = document.createElement('div');
    overlay.id = 'cc-cl-picker-overlay';
    overlay.style.cssText = [
      'position:fixed',
      'inset:0',
      'background:rgba(0,0,0,.45)',
      'z-index:9999',
      'display:flex',
      'align-items:center',
      'justify-content:center',
    ].join(';');

    var sl = (typeof STEP_LABELS !== 'undefined' && STEP_LABELS[step]) || { title: step, col: 'var(--blue)' };

    var items = vorlagen.map(function(v) {
      var pAnz = (v.punkte || []).length;
      return '<div onclick="AuftragChecklisten.vonVorlageAnwenden(\'' + auftragId + '\',\'' + step + '\',\'' + v.id + '\');document.getElementById(\'cc-cl-picker-overlay\').remove();" '
        + 'style="display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--border);'
        + 'cursor:pointer;transition:background .12s;" '
        + 'onmouseover="this.style.background=\'#F0F5FF\'" onmouseout="this.style.background=\'transparent\'">'
          + '<span style="font-size:20px;">' + (v.ico || '📋') + '</span>'
          + '<div style="flex:1;">'
            + '<div style="font-size:13px;font-weight:600;color:var(--text);">' + v.name + '</div>'
            + '<div style="font-size:11px;color:var(--text2);">' + pAnz + ' Prüfpunkte</div>'
          + '</div>'
          + '<span style="font-size:11px;color:var(--blue);font-weight:700;">→</span>'
        + '</div>';
    }).join('');

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:min(420px,92vw);max-height:80vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3);">'
        + '<div style="padding:14px 18px;background:' + sl.col + '18;border-bottom:1px solid var(--border);'
          + 'display:flex;align-items:center;justify-content:space-between;border-radius:14px 14px 0 0;">'
          + '<div>'
            + '<div style="font-size:14px;font-weight:700;color:var(--text);">Vorlage anwenden</div>'
            + '<div style="font-size:11px;color:var(--text2);">Schritt: ' + sl.title + ' · Auftrag ' + auftragId + '</div>'
          + '</div>'
          + '<button onclick="document.getElementById(\'cc-cl-picker-overlay\').remove()" '
            + 'style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--text3);padding:0 4px;">✕</button>'
        + '</div>'
        + items
      + '</div>';

    // Klick auf Backdrop schließt
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });

    document.body.appendChild(overlay);
  }

  // ── Checklisten-Overview in Detail injizieren ───────────────────────
  function initInDetail(auftragId) {
    // Nach openAuftragDetail: Checklisten-Overview hinter dem dpBody anhängen
    // Finden: "dp-cl-items-{id}" Container — sein Elternteil ist die CL-Section
    var clSection = document.getElementById('dp-cl-items-' + auftragId);
    if (!clSection) return; // Keine aktive CL → keine Übersicht nötig

    var parent = clSection.parentElement; // dp-section
    if (!parent) return;

    // Overview-Block NACH der bestehenden CL-Section einfügen
    var overviewEl = document.createElement('div');
    overviewEl.id = 'dp-cl-overview-' + auftragId;
    overviewEl.innerHTML = renderChecklistenOverview(auftragId);
    parent.parentNode.insertBefore(overviewEl, parent.nextSibling);
  }

  // ── auftragDetailModuleInit Hook — nach DOMContentLoaded registrieren ─
  function _installHook() {
    var _prev = window.auftragDetailModuleInit;
    window.auftragDetailModuleInit = function(id) {
      if (typeof _prev === 'function') _prev(id);
      setTimeout(function() { initInDetail(id); }, 50);
    };
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _installHook);
  } else {
    _installHook();
  }

  // ── Hilfsfunktionen ──────────────────────────────────────────────────
  function _findAuftrag(id) {
    return (typeof AUFTRAEGE !== 'undefined' ? AUFTRAEGE : []).find(function(x) { return x.id === id; }) || null;
  }

  /**
   * @param {() => void} [done]
   */
  function _saveAfterMutation(done) {
    var api = typeof window !== 'undefined' ? window.CCIntern && window.CCIntern.cockpitApi : null;
    if (api && typeof api.persistAuftraegeImmediate === 'function') {
      api.persistAuftraegeImmediate(typeof showToast === 'function' ? showToast : null).then(function() {
        if (done) done();
      }).catch(function() {
        if (done) done();
      });
      return;
    }
    if (typeof saveAuftraege === 'function') saveAuftraege();
    if (done) done();
  }

  // Globaler Namespace
  window.AuftragChecklisten = {
    vonVorlageAnwenden:      vonVorlageAnwenden,
    checklisteLeeren:        checklisteLeeren,
    renderChecklistenOverview: renderChecklistenOverview,
    vorlagenPicker:          vorlagenPicker,
    initInDetail:            initInDetail,
  };

  console.info('[CC] auftraege/checklisten.js geladen — Vorlagen-Picker + Übersicht');

  return window.AuftragChecklisten;
})();
