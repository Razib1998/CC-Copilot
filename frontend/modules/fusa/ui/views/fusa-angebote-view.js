import {
  renderCockpitAngeboteViewHtml,
  attachCockpitAngeboteHandlers,
} from '../../../cockpit/ui/views/cockpit-angebote-view.js';

/**
 * FUSA-Wrapper: nutzt bestehende Angebote-Logik unverändert.
 * Keine neue Fachlogik, nur saubere Modulgrenze.
 *
 * Später (nicht in diesem Schritt): Angebotsentitäten mit **firmaId** an den zentralen
 * Kundenstamm koppeln; Anzeige/Auswahl über `modules/shared/lib/firma-kunden-referenz.js`.
 * Bis dahin keine halbe UI-Migration hier.
 */
export async function renderFusaAngeboteViewHtml() {
  return renderCockpitAngeboteViewHtml();
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaAngeboteHandlers(mount, onReload) {
  return attachCockpitAngeboteHandlers(mount, onReload);
}
