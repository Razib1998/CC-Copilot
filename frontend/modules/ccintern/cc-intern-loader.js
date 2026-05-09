/**
 * Lädt CC-Intern-Legacy als klassische (non-ESM) Skripte in fester Reihenfolge.
 * URLs relativ zu diesem Modul (`import.meta.url`) — keine feste API-URL.
 */
let _ccInternScriptsLoaded = false;
let _ccInternCssInjected = false;

/** @returns {string} */
function scriptHref(relativePath) {
  return new URL(relativePath, import.meta.url).href;
}

export function ensureCcInternCssInjected() {
  if (_ccInternCssInjected || typeof document === 'undefined') return;
  if (document.querySelector('link[data-ccw-ccintern-css]')) {
    _ccInternCssInjected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = scriptHref('cc-intern.css');
  link.setAttribute('data-ccw-ccintern-css', '1');
  document.head.appendChild(link);
  _ccInternCssInjected = true;
}

/**
 * @returns {Promise<void>}
 */
export async function loadCcInternScripts() {
  if (_ccInternScriptsLoaded || typeof document === 'undefined') return;
  ensureCcInternCssInjected();

  const paths = [
    'core/LocalStorageAdapter.js',
    'core/ApiAdapter.js',
    'core/SyncAdapter.js',
    'services/CCInternDataService.js',
    'data/ccintern-default-seeds.js',
    'views/cc-intern-boot.js',
    'views/lager-view.js',
    'views/urlaub-view.js',
    'views/angebote-view.js',
    'views/anfragen-view.js',
    'views/rechnungen-view.js',
    'views/rechnungen-ledger.js',
    'views/auftraege-view.js',
    'views/auftraege-detail-view.js',
    // VOR mitarbeiter-view.js: renderMitarbeiter() braucht mobSynchronisiereInternAufgabenMitWorkflow
    'views/mitarbeiter-app-mob-inline.js',
    'views/mitarbeiter-view.js',
    'views/mitarbeiter-app-view.js',
    'views/produktion-view.js',
    'module/auftraege/detail.js',
    'module/auftraege/dateien.js',
    'module/auftraege/checklisten.js',
    'module/auftraege/kommunikation.js',
    'module/schnell-anfragen/index.js',
    'module/angebote/index.js',
    'module/crm/index.js',
    'module/checklisten/index.js',
    'module/rechnungen/index.js',
    'module/dashboard/index.js',
    'views/dashboard-view.js',
    'module/mitarbeiter/index.js',
    'module/produktion/index.js',
    'module/materiallager/index.js',
    'module/urlaub/index.js',
    'module/mitarbeiter-app/index.js',
    'module/benutzer/index.js',
    'cc-intern-templates.js',
    'cc-intern-main.js',
  ];

  for (const rel of paths) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = scriptHref(rel);
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`CC Intern Skript fehlt: ${rel}`));
      document.head.appendChild(s);
    });
  }

  _ccInternScriptsLoaded = true;
}
