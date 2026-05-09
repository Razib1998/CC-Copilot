// ═══════════════════════════════════════════════════════════════════════════
// CC Cockpit – Bootstrap  (§22 + §27 Master-Anweisung)
// ═══════════════════════════════════════════════════════════════════════════
//  Startreihenfolge: State → Sidebar → Main → Module → API → Backend (§22)
//  Deep-Link wiederherstellen (§4).
//
//  WICHTIG: messeflow-app.js startet sich selbst via IIFE (messeflowEntry).
//  Bootstrap startet die App NICHT neu – es ergänzt nur:
//    1. Deep-Link-Parameter auslesen
//    2. CC Cockpit-Shell-State synchronisieren
//    3. MODULE_ENTRY Event senden
//
//  Laden als LETZTES Skript.
// ═══════════════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  var _booted = false;

  function boot() {
    if (_booted) return;
    _booted = true;

    // ── 1. Deep-Link auslesen (§4) ───────────────────────────────────────
    var urlParams   = new URLSearchParams(window.location.search);
    var deepShell   = urlParams.get('shell');
    var deepNav     = urlParams.get('nav');
    var deepProject = urlParams.get('project');

    console.log('[Bootstrap] CC Cockpit – MesseFlow Modul');

    // ── 2. Deep-Link Projekt nachladen (App läuft bereits) ───────────────
    // messeflowEntry() hat schon das erste Projekt selektiert.
    // Wenn URL ein explizites Projekt enthält → dieses bevorzugen.
    if (deepProject) {
      setTimeout(function () {
        if (typeof selectProj === 'function') {
          var projExists = typeof MesseFlowState !== 'undefined' &&
            MesseFlowState.projects.some(function (p) { return p.id === deepProject; });
          if (projExists) {
            selectProj(deepProject);
            console.log('[Bootstrap] Deep-Link Projekt geladen:', deepProject);
          }
        }
      }, 300);
    }

    // ── 3. Nav-Key aus Deep-Link ─────────────────────────────────────────
    if (deepNav && window.CCWUIRegistry) {
      setTimeout(function () {
        window.CCWUIRegistry.activateNavKey(deepNav);
      }, 350);
    }

    // ── 4. CCWState synchronisieren (§3) ─────────────────────────────────
    if (window.CCWState) {
      if (typeof activeProjId !== 'undefined') {
        window.CCWState.set('activeProjId', activeProjId);
      }
      if (typeof currentUserId !== 'undefined') {
        window.CCWState.set('currentUserId', currentUserId);
      }
      window.CCWState.set('shell', deepShell || 'cockpit');
    }

    // ── 5. MODULE_ENTRY Event (§8 + §28) ─────────────────────────────────
    if (typeof emitModuleEvent === 'function' && typeof MODULE_EVENT_TYPE !== 'undefined') {
      emitModuleEvent({
        type:     MODULE_EVENT_TYPE.MODULE_ENTRY,
        moduleId: 'messeflow',
        shell:    deepShell || 'cockpit',
      });
    }

    // ── 6. Kalender: Termine aus CC Intern Bridge laden ──────────────────
    if (window.CCWCalendar && window.CCIntern) {
      try {
        var termine = window.CCIntern.getKalenderTermine
          ? window.CCIntern.getKalenderTermine()
          : [];
        window.CCWCalendar.importFromCCIntern(termine);
      } catch (e) { /* Bridge noch nicht bereit */ }
    }

    console.log('[Bootstrap] Abgeschlossen | shell:', deepShell, '| nav:', deepNav, '| project:', deepProject);
  }

  // messeflowEntry() läuft beim Script-Load sofort (IIFE).
  // Bootstrap startet NACH dem DOM-Ready, damit die App fertig initialisiert ist.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      setTimeout(boot, 100); // kurze Pause nach DOMContentLoaded
    });
  } else {
    setTimeout(boot, 100);
  }

  window.CCWBootstrap = { reboot: boot };
})();
