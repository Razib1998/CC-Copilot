/**
 * CC Intern — Mittelbereich: Rechte aus GET /auth/my-rights (`ccintern`-Bereiche).
 * Sidebar/Shell bleiben außerhalb; nur von cockpit-shell als `content` eingebunden.
 *
 * **Referenz (1:1-Umzug, verbindlich):** `migration/CC Inter End/` (z. B. `DEV/index.html` + JS/CSS) und Paket `migration/CCinter_COCKPIT_UMZUG/`.
 * Cockpit liefert nur den Inhaltsbereich; CC Intern rendert ausschließlich in `data-ccw-ccintern-container`
 * (siehe `cc-intern-cockpit-bridge.js` — kein zweites Mount, kein blockierendes Overlay).
 */

import { formatApiErrorForUi } from '../../../core/auth/cc-auth-session.js';
import { loadMyRights, myRight } from '../../../core/access/cc-my-rights.js';
import { renderModuleUsersReadonlyHtml } from '../../shared/ui/module-users-readonly-view.js';
import { renderModuleRoleTemplatesReadonlyHtml } from '../../shared/ui/module-role-templates-readonly-view.js';
import {
  renderKundenStammFromStoreHtml,
  attachKundenStammFromStoreHandlers,
} from '../../shared/ui/kunden-stamm-from-store-view.js';
import { renderCcwCockpitKalenderViewHtml } from '../../cockpit/ui/views/cockpit-kalender-view.js';
import { runCcInternLegacyMount } from '../cc-intern-cockpit-bridge.js';
import { runMesseflowCockpitMount } from '../../messeflow/messeflow-cockpit-mount.js';

function esc(s) {
  if (s == null || s === '') return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Sidebar-`activeView` → Slug wie in backend/src/auth/rights-spec.js (CCINTERN_BEREICHE).
 *
 * Kunden-Stamm: `cc_kunden` nutzt bereits den zentralen Store (shared Kunden-Stamm-View).
 * Folgende Bereiche bleiben vorerst Platzhalter — für spätere Anbindung ist vorgesehen:
 * - **cc_auftraege** / Aufträge: Auftragsdaten mit **firmaId** (kein eigener Kundenbestand).
 * - **cc_angebote** / Angebote: Angebote mit **firmaId**.
 * - **cc_crm** / CRM: CRM-Einträge / Aktivitäten mit **firmaId**.
 * Gemeinsame Hilfen: `modules/shared/lib/firma-kunden-referenz.js`.
 */
const CC_INTERN_VIEW_TO_BEREICH = /** @type {Record<string, string>} */ ({
  cc_dashboard: 'dashboard',
  cc_schnellanfragen: 'schnell_anfragen',
  cc_angebote: 'angebote',
  cc_auftraege: 'auftraege',
  cc_kunden: 'kunden',
  cc_crm: 'crm',
  cc_messeflow: 'messeflow',
  cc_produktion: 'produktion',
  cc_materiallager: 'materiallager',
  cc_checklisten: 'checklisten',
  cc_kalender: 'kalender',
  cc_mitarbeiter: 'mitarbeiter',
  cc_urlaub: 'urlaub',
  cc_mitarbeiter_app: 'mitarbeiterapp',
  cc_rechnungen: 'rechnungen',
  cc_benutzer: 'benutzer_ro',
  cc_rollen: 'rollen_ro',
});

/**
 * @param {string} activeViewKey
 * @param {string} navLabel
 * @returns {Promise<string>}
 */
export async function renderCcInternActiveViewHtml(activeViewKey, navLabel) {
  const key = activeViewKey != null ? String(activeViewKey) : '';
  const bereich = CC_INTERN_VIEW_TO_BEREICH[key];
  if (!bereich) {
    return `<div data-ccw-ro="ccintern-unknown" class="ckp-mock-note" role="alert">Unbekannte CC-Intern-Ansicht: <code>${esc(key)}</code>.</div>`;
  }

  let myRights = null;
  let rightsLoadErr = '';
  try {
    myRights = await loadMyRights();
  } catch (e) {
    rightsLoadErr = formatApiErrorForUi(e);
  }
  if (rightsLoadErr) {
    return `<div data-ccw-ro="ccintern-rights-error" class="ckp-api-error" role="alert">${esc(rightsLoadErr)}</div>`;
  }

  const canSehen = myRight(myRights, 'ccintern', bereich, 'sehen');
  if (!canSehen) {
    return `<div data-ccw-ro="ccintern-no-access" class="ckp-mock-note" role="status">Kein Zugriff auf diesen Bereich. Erforderlich: <code>ccintern.${esc(bereich)}.sehen</code> (<code>GET /auth/my-rights</code>).</div>`;
  }

  if (key === 'cc_benutzer') {
    return renderModuleUsersReadonlyHtml({
      title: 'Benutzer',
      moduleKey: 'ccintern',
    });
  }
  if (key === 'cc_rollen') {
    return renderModuleRoleTemplatesReadonlyHtml({ title: 'Rollen-Vorlagen' });
  }
  if (key === 'cc_kunden') {
    return renderKundenStammFromStoreHtml({
      dataRootRo: 'ccintern-kunden-bridge',
      kundenDetailVariant: 'ccintern',
      hintText:
        'Eine zentrale Datenbasis (firmen). Detail: GET /api/v1/stammdaten/kunden/:id — Stammdaten + CC-Intern-Zusatz (ccintern_kunden_extra) in Lesepanel und Maske.',
      statusMsgDataAttr: 'data-ccw-ccintern-kunden-msg',
    });
  }
  if (key === 'cc_kalender') {
    return renderCcwCockpitKalenderViewHtml(null);
  }
  if (key === 'cc_messeflow') {
    return `<div data-ccw-ro="ccintern-messeflow-host" data-ccintern-bereich="${esc(bereich)}" data-ccintern-view-key="${esc(key)}">
  <div data-ccw-messeflow-container class="ccw-messeflow-container"></div>
</div>`;
  }

  return `<div data-ccw-ro="ccintern-legacy-host" data-ccintern-bereich="${esc(bereich)}" data-ccintern-view-key="${esc(key)}">
  <div data-ccw-ccintern-container class="ccw-ccintern-container" style="min-height:120px;"></div>
</div>`;
}

/**
 * @param {ParentNode|null|undefined} mount
 * @param {() => void|Promise<void>} onReload
 */
export function attachCcInternActiveViewHandlers(mount, onReload) {
  if (!(mount instanceof HTMLElement)) return;
  attachKundenStammFromStoreHandlers(mount, onReload, {
    dataRootRo: 'ccintern-kunden-bridge',
    showFusaFields: false,
    showCcinternFields: true,
    kundenDetailVariant: 'ccintern',
    statusMsgDataAttr: 'data-ccw-ccintern-kunden-msg',
    savedToastText: 'Gespeichert.',
  });

  const messeflowHost = mount.querySelector('[data-ccw-ro="ccintern-messeflow-host"]');
  if (messeflowHost instanceof HTMLElement) {
    const slot = messeflowHost.querySelector('[data-ccw-messeflow-container]');
    if (slot instanceof HTMLElement) {
      void runMesseflowCockpitMount(slot);
    }
  }

  const legacyHost = mount.querySelector('[data-ccw-ro="ccintern-legacy-host"]');
  if (legacyHost instanceof HTMLElement) {
    const vk = legacyHost.getAttribute('data-ccintern-view-key') || '';
    void runCcInternLegacyMount(legacyHost, { viewKey: vk });
  }
}
