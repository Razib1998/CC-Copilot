/**
 * Lädt MesseFlow als klassische Skripte (Reihenfolge wie Migration index.html).
 * URLs relativ zu diesem Modul — keine feste API-Domain.
 */
let _messeflowScriptsLoaded = false;
let _messeflowCssInjected = false;

/** @param {string} relativePath */
function scriptHref(relativePath) {
  return new URL(relativePath, import.meta.url).href;
}

export function ensureMesseflowCssInjected() {
  if (_messeflowCssInjected || typeof document === 'undefined') return;
  if (document.querySelector('link[data-ccw-messeflow-css]')) {
    _messeflowCssInjected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = scriptHref('./messeflow.css');
  link.setAttribute('data-ccw-messeflow-css', '1');
  document.head.appendChild(link);
  _messeflowCssInjected = true;
}

/**
 * @returns {Promise<void>}
 */
export async function loadMesseflowScripts() {
  if (_messeflowScriptsLoaded || typeof document === 'undefined') return;
  ensureMesseflowCssInjected();

  const paths = [
    './logic/messeflow-config.js',
    './logic/messeflow-pruefserver-service.js',
    './logic/messeflow-state.js',
    './logic/messeflow-data-port.js',
    './logic/messeflow-import.js',
    './components/messeflow-components.js',
    './ui/messeflow-dashboard-view.js',
    './ui/messeflow-detail-view.js',
    './ui/messeflow-main-view.js',
  ];

  for (const rel of paths) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = scriptHref(rel);
      s.async = false;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`MesseFlow Skript fehlt: ${rel}`));
      document.head.appendChild(s);
    });
  }

  _messeflowScriptsLoaded = true;
}
