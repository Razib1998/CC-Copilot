/* Erwartung in der Konsole (Hart-Reload, Cache leeren), um zu prüfen, ob wirklich diese `main.js` bedient wird: [MAIN TEST] */
console.log('[MAIN TEST] aktuelle main.js geladen');
/**
 * CC Cockpit — App-Einstieg (Modul).
 * Kette: index.html → initCore() → UI-Shell (Sidebar + Views, Anweisung 37).
 */
import { initCore } from './core/init.js';
import { mountCockpitShell } from './cockpit-shell.js';

const THEME_STORAGE_KEY = 'ccw-theme';

function getSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getStoredTheme() {
  try {
    const v = window.localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function applyTheme(theme, explicit) {
  const next = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  document.documentElement.style.colorScheme = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', next === 'dark' ? '#0f172a' : '#1a56db');
  const btn = document.getElementById('ccw-theme-toggle');
  if (btn) {
    const isDark = next === 'dark';
    btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    btn.setAttribute('aria-label', isDark ? 'Helle Darstellung aktivieren' : 'Dunkle Darstellung aktivieren');
    btn.setAttribute('title', explicit ? (isDark ? 'Dunkle Darstellung' : 'Helle Darstellung') : 'Systemdarstellung');
  }
}

function initThemeToggle() {
  if (typeof window === 'undefined') return;
  const systemQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  applyTheme(getStoredTheme() || getSystemTheme(), !!getStoredTheme());

  const btn = document.getElementById('ccw-theme-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = current === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      } catch {
        /* best effort */
      }
      applyTheme(next, true);
    });
  }

  if (systemQuery) {
    systemQuery.addEventListener('change', () => {
      if (!getStoredTheme()) applyTheme(getSystemTheme(), false);
    });
  }
}

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
initThemeToggle();
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
