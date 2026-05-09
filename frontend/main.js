/* Erwartung in der Konsole (Hart-Reload, Cache leeren), um zu prüfen, ob wirklich diese `main.js` bedient wird: [MAIN TEST] */
console.log('[MAIN TEST] aktuelle main.js geladen');
/**
 * CC Cockpit — App-Einstieg (Modul).
 * Kette: index.html → initCore() → UI-Shell (Sidebar + Views, Anweisung 37).
 */
import { initCore } from './core/init.js';
import { mountCockpitShell } from './cockpit-shell.js';

/** Bis `loadCcInternScripts()` / `views/auftraege-detail-view.js` laufen, ist kein `window` aus dem Bundle zu erwarten. */
if (typeof window !== 'undefined' && typeof window.ccInternDebugMaAufgaben !== 'function') {
  window.ccInternDebugMaAufgaben = function ccInternDebugMaAufgaben() {
    if (typeof console !== 'undefined' && console.warn) {
      console.warn(
        '[ccInternDebugMaAufgaben] CC-Intern-Legacy-Skripte fehlen noch. Modul «CC Intern» öffnen; danach ersetzt `views/auftraege-detail-view.js` diese Stubs durch die vollständige Funktion.',
      );
    }
  };
}

console.log('[CC Cockpit] App start');
initCore();
try {
  await mountCockpitShell();
} catch (e) {
  console.error('[CC Cockpit] mountCockpitShell', e);
  const c = document.getElementById('cockpit-content');
  if (c) {
    const msg = e instanceof Error ? e.message : String(e);
    c.textContent = '';
    const p = document.createElement('p');
    p.className = 'ckp-api-error';
    p.setAttribute('role', 'alert');
    p.textContent = `App-Start fehlgeschlagen: ${msg}`;
    c.appendChild(p);
  }
}
