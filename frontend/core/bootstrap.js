/**
 * Modulneutrale App-Orchestrierung (ohne Router, ohne Datenintegration).
 * main.js startet nur initCore + diese Schicht.
 *
 * ─── Modulwechsel-Konvention (MODULE_CHANGE) ─────────────────────────────────
 *
 * Event (Auslöser für „anderes Modul in den Content-Mount“):
 *   ModuleEvents.EVENTS.MODULE_CHANGE  (= 'module:change')
 *
 * Payload-Format (verbindlich):
 *   { module: string }
 *   `module` ist die Modul-ID (z. B. 'fusa-kalender'), siehe APP_MODULE_IDS / Mapping.
 *   Keine Domänen- oder Projektdaten im Payload, solange nicht ausdrücklich anders freigegeben.
 *
 * Ablauf — Initialer Start (erster sichtbarer Modul-Mount):
 *   → erfolgt per direktem dispatchModuleMount(...), NICHT per ModuleEvents.emit.
 *   Grund: Der Event-Bus awaitet Listener nicht; ein zusätzliches emit würde den ersten
 *   Mount ggf. doppelt oder in falscher Reihenfolge triggern. Andere Listener auf
 *   MODULE_CHANGE (z. B. Logging in initCore) sehen den ersten Wechsel dadurch nicht — das ist bewusst.
 *
 * Ablauf — Späterer Modulwechsel (z. B. Sidebar, sobald angebunden):
 *   → ModuleEvents.emit(ModuleEvents.EVENTS.MODULE_CHANGE, { module: '<id>' })
 *
 * Dispatcher / Mapping:
 *   moduleId (string) → Mount-Funktion: () => Promise<void>
 *   Produktiv gibt es nur einen Content-Mount: **#cockpit-content** (`cockpit-shell.js` / main.js).
 *   Legacy `#ccw-app-content-mount` + Modul-Mounts sind nicht angebunden; siehe
 *   `mountFusaKalenderUiShellIntoAppMount` (no-op).
 *
 * Vertrag für Mount-Funktionen (Zielbild; bei Datenintegration nur nach Freigabe lockern):
 *   DARF:  UI rendern (z. B. HTML in den Mount setzen).
 *   DARF NICHT: echte Daten laden, API aufrufen, App-State verändern — bis dazu eine
 *   eigene Freigabe und Schicht (Daten-Port, CCState, …) existiert.
 *
 * Schichten:
 *   bootstrap.js  = Orchestrierung (Events, Dispatch, Startreihenfolge).
 *   modules/...   = Modul-UI und spätere Modul-Logik — getrennt von dieser Datei halten.
 *
 * PFLICHT-REGEL (Projekt): Keine Daten aus FUSA, CC Intern oder MesseFlow einbinden
 * oder State dafür verändern ohne vorherige Freigabe.
 */
import ModuleEvents from './events/module-events.js';
import { mountFusaKalenderUiShellIntoAppMount } from '../modules/fusa/ui/index.js';

export const APP_MODULE_IDS = {
  FUSA_KALENDER: 'fusa-kalender',
};

/** @type {Record<string, () => Promise<void>>} */
const moduleMountById = {
  [APP_MODULE_IDS.FUSA_KALENDER]: mountFusaKalenderUiShellIntoAppMount,
};

/**
 * @param {unknown} payload
 * @returns {string}
 */
function readModuleId(payload) {
  if (!payload || typeof payload !== 'object') return '';
  const m = /** @type {{ module?: unknown }} */ (payload).module;
  if (m == null) return '';
  const s = String(m).trim();
  return s;
}

/**
 * Dispatcher: Modul-ID → registrierte Mount-Funktion.
 * @param {string} moduleId
 */
async function dispatchModuleMount(moduleId) {
  const mountFn = moduleMountById[moduleId];
  if (typeof mountFn !== 'function') {
    console.warn('[AppOrchestration] unbekanntes Modul:', moduleId);
    return;
  }
  await mountFn();
}

/**
 * Reagiert auf `module:change` (später z. B. Sidebar). Keine Datenquellen.
 * @param {unknown} payload
 */
async function onModuleChange(payload) {
  const moduleId = readModuleId(payload);
  if (!moduleId) return;
  await dispatchModuleMount(moduleId);
}

/**
 * Registriert den Event-Pfad und lädt die Initialansicht.
 * Erster Mount läuft bewusst per direktem Dispatch (wie Dispatcher), damit
 * `emit` nicht doppelt mountet (Event-Bus awaitet Listener nicht).
 */
export async function startAppModuleOrchestration() {
  ModuleEvents.on(ModuleEvents.EVENTS.MODULE_CHANGE, (payload) => {
    void onModuleChange(payload);
  });

  // Kein Initial-Mount: App läuft ausschließlich über `main.js` → `mountCockpitShell()` → #cockpit-content.
  // `dispatchModuleMount(FUSA_KALENDER)` würde nur den deaktivierten Legacy-Hook ausführen.
}
