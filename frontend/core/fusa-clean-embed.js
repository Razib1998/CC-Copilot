/**
 * Einbettung der Original-FUSA-App aus FUSA_CLEAN (DEV).
 *
 * iframe-src MUSS absolut auf das Backend zeigen (typ. Port 5371), nie relativ
 * zum Cockpit-Frontend (5370) — sonst "Cannot GET /fusa-clean/index.html".
 */
import { getApiBaseUrl } from './auth/cc-auth-session.js';

/**
 * Basis-URL für /fusa-clean (Backend-Static).
 * @returns {string}
 */
export function getFusaCleanBaseUrl() {
  const meta =
    typeof document !== 'undefined' ? document.querySelector('meta[name="fusa-clean-base"]') : null;
  if (meta && meta.content) return meta.content;

  // WICHTIG: nutzt Backend-URL (5371)
  return getApiBaseUrl() + '/fusa-clean';
}

/**
 * Vollständige FUSA-UI (inkl. Original-Formulare) im Cockpit-Content.
 * @returns {string}
 */
export function renderFusaCleanIframeEmbedHtml() {
  const src = getFusaCleanBaseUrl() + '/index.html';
  const srcAttr = src.replace(/"/g, '&quot;');
  return `<div class="fusa-clean-embed" data-fusa-clean-embed="1">
  <p class="ckp-mock-note" style="margin:0 0 10px;">Original-FUSA (FUSA_CLEAN DEV) — lokale Bedienung wie in der Standalone-App.</p>
  <iframe class="fusa-clean-embed__frame" title="FUSA" src="${srcAttr}" style="width:100%;min-height:min(88vh,920px);height:88vh;border:0;border-radius:8px;background:#f0f4f8;"></iframe>
</div>`;
}
