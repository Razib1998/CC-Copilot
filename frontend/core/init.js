/**
 * CC Cockpit – Core Init
 * ──────────────────────
 * Einstiegspunkt für das Core-System.
 * Bereitet State, Events und spätere Modul-Verbindungen vor.
 *
 * PHASE: Brücke Alt → Core
 * STATUS: Vorbereitung – noch keine aktive Steuerung.
 *
 * Was diese Datei NICHT tut:
 *  - Keine bestehenden Dateien importieren oder verändern
 *  - Keine Logik aus ccw/ oder core/ (alt) überschreiben
 *  - Kein Eingriff in index.html oder sidebar.js
 *
 * Was diese Datei TUT:
 *  - Reserviert den zentralen Init-Punkt
 *  - Bindet State + Events ein (sobald bereit)
 *  - Gibt Entwicklern einen klaren Einstieg für spätere Phasen
 */

// ── Imports ───────────────────────────────────────────────────────────────────
import ModuleEvents from './events/module-events.js';
// import CCState   from './state/state.js';   // TODO: spätere Phase
// import ApiAdapter from './api/api-adapter.js'; // TODO: spätere Phase


// ── Init-Funktion ─────────────────────────────────────────────────────────────
function initCore() {

  // Phase 1: State vorbereiten
  // TODO: CCState.reset() – spätere Phase

  // Phase 2: Event-Listener registrieren (passiv – nur Log, keine Steuerung)
  ModuleEvents.on(ModuleEvents.EVENTS.MODULE_CHANGE, (payload) => {
    console.log('[Core] Modul gewechselt:', payload.module);
  });

  // Phase 3: API-Adapter vorbereiten
  // TODO: spätere Phase

  // Phase 4: Brücke Alt → Core
  // App-UI: cockpit-shell → #cockpit-content (main.js). core/bootstrap.js bleibt optional / unverdrahtet.

  console.log('[CC Cockpit] Core init ready.');
  console.log('[CC Cockpit] Events   → module:change Listener aktiv');
}


// ── Ausführung ────────────────────────────────────────────────────────────────
// Wird erst aufgerufen, wenn index.html explizit einbindet.
// JETZT: nur exportieren, noch nicht auto-ausführen.
export { initCore };
