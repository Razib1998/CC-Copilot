import {
  renderKundenStammFromStoreHtml,
  attachKundenStammFromStoreHandlers,
} from '../../../shared/ui/kunden-stamm-from-store-view.js';

/**
 * @returns {Promise<string>}
 */
export async function renderFusaKundenViewHtml() {
  return renderKundenStammFromStoreHtml({
    dataRootRo: 'fusa-kunden-bridge',
    kundenDetailVariant: 'fusa',
    hintText:
      'Eine zentrale Datenbasis (firmen). Detail: GET /api/v1/stammdaten/kunden/:id — Stammdaten + Lesepanel; FUSA-Zusatz (Segment/Hinweis) in Maske.',
    statusMsgDataAttr: 'data-ccw-fusa-kunden-msg',
  });
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachFusaKundenHandlers(mount, onReload) {
  attachKundenStammFromStoreHandlers(mount, onReload, {
    dataRootRo: 'fusa-kunden-bridge',
    showFusaFields: true,
    showCcinternFields: false,
    kundenDetailVariant: 'fusa',
    statusMsgDataAttr: 'data-ccw-fusa-kunden-msg',
    savedToastText: 'Gespeichert.',
  });
}
