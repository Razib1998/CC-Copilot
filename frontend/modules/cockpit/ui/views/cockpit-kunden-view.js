/**
 * Cockpit — Kunden-Stammdaten (Liste wie Firmen; Maske aus Listenzeile, POST/PATCH /api/v1/firmen).
 */
import {
  renderKundenStammFromStoreHtml,
  attachKundenStammFromStoreHandlers,
} from '../../../shared/ui/kunden-stamm-from-store-view.js';

/**
 * @returns {Promise<string>}
 */
export async function renderCockpitKundenViewHtml() {
  return renderKundenStammFromStoreHtml({
    dataRootRo: 'cockpit-kunden',
    rootExtraClass: 'ckp-kunden',
    kundenDetailVariant: 'cockpit',
    hintText: 'Zentrale Detail-Ladung: GET /api/v1/stammdaten/kunden/:id (Lesepanel + Maske). Optional: GET /firmen/:id liefert dieselbe detail-Struktur.',
    statusMsgDataAttr: null,
  });
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachCockpitKundenHandlers(mount, onReload) {
  if (typeof document === 'undefined' || !mount) return;
  attachKundenStammFromStoreHandlers(mount, onReload, {
    dataRootRo: 'cockpit-kunden',
    showFusaFields: false,
    showCcinternFields: true,
    kundenDetailVariant: 'cockpit',
    statusMsgDataAttr: null,
    savedToastText: null,
  });
}
