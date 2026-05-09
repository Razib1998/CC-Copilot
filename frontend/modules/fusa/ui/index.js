/**
 * FUSA UI — Bundle-Einstieg (Legacy-Hook nur für `core/bootstrap.js`).
 *
 * **Produktiver UI-Mount (verbindlich):** ausschließlich `cockpit-shell.js` → `#cockpit-content`
 * (`main.js` → `mountCockpitShell()`). Modul FUSA inkl. Aufträge (`fusa_auftraege`) und Kalender
 * (`fusa_kalender`) werden dort gerendert — kein zweiter Content-Mount, keine parallele Aufträge-UI.
 *
 * Die frühere Implementierung von `mountFusaKalenderUiShellIntoAppMount` (Kalender + API-Snapshots
 * in `#ccw-app-content-mount`) ist deaktiviert, um Doppel-Renderings und Schatten-UI zu vermeiden.
 * Produktive Aufträge-UI: {@link renderFusaAuftraegeViewHtml} in `fusa-auftraege-view.js`.
 */

/**
 * @deprecated Deaktiviert — nutze `mountCockpitShell` / `#cockpit-content`.
 * Bleibt als no-op exportiert, damit `core/bootstrap.js` ohne Anpassung importierbar bleibt.
 */
export async function mountFusaKalenderUiShellIntoAppMount() {
  if (typeof document === 'undefined') return;
  if (typeof console !== 'undefined' && console.warn) {
    console.warn(
      '[FUSA UI] mountFusaKalenderUiShellIntoAppMount ist deaktiviert. UI nur über cockpit-shell → #cockpit-content (z. B. fusa_auftraege, fusa_kalender).',
    );
  }
}
