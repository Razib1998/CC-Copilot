/**
 * Zentrales Mapping FUSA-Werbepaket → technische Flächen-IDs.
 * Alle Konflikt- und Verfügbarkeitsprüfungen beziehen sich auf diese Datei (nicht duplizieren).
 */

/** @type {readonly ['heck', 'seite_links', 'seite_rechts', 'dach']} */
export const FUSA_WERBEFLAECHE_IDS = ['heck', 'seite_links', 'seite_rechts', 'dach'];

/** @type {Record<string, string>} */
export const FUSA_FLAECHEN_LABEL_DE = {
  heck: 'Heck',
  seite_links: 'Seite links',
  seite_rechts: 'Seite rechts',
  dach: 'Dach',
};

/**
 * @param {string} s
 */
function normPaketKey(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/**
 * Exakte Paketnamen wie in `PAKET_PREISE_MONAT_NETTO` / Wizard-Chips.
 * Wert = Liste der von diesem Paket beanspruchten Flächen-IDs.
 *
 * @type {Record<string, readonly string[]>}
 */
export const PAKET_NAME_ZU_WERBEFLAECHE = {
  'Teilgestaltung ohne Heck': ['seite_links', 'seite_rechts'],
  Teilgestaltung: ['heck', 'seite_links', 'seite_rechts'],
  'Teilgestaltung + Dachkranz': ['heck', 'seite_links', 'seite_rechts', 'dach'],
  'Teilgestaltung + Dachkranz Beschrift.': ['heck', 'seite_links', 'seite_rechts', 'dach'],
  'Teilgestaltung + Dachkranz besch.': ['heck', 'seite_links', 'seite_rechts', 'dach'],
  Ganzgestaltung: ['heck', 'seite_links', 'seite_rechts', 'dach'],
  'Ganzgestaltung + Fenster': ['heck', 'seite_links', 'seite_rechts', 'dach'],
  'Heck Vollbeschriftung': ['heck'],
  Heckfläche: ['heck'],
  'Trafficboard 2 qm': ['dach'],
  'Trafficboard 4 qm': ['dach'],
  'Trafficboard 9 qm': ['dach'],
  /** Konservativ: typische Bannerflächen ohne explizites Dach — dennoch drei Außenflächen. */
  'Traffic Banner Paket (3 Traffic Banner)': ['heck', 'seite_links', 'seite_rechts'],
};

/** @type {Map<string, readonly string[]>} */
let _normPaketZuFlaechen = null;

function mapNormPaketZuFlaechen() {
  if (_normPaketZuFlaechen) return _normPaketZuFlaechen;
  const m = new Map();
  for (const [name, fl] of Object.entries(PAKET_NAME_ZU_WERBEFLAECHE)) {
    m.set(normPaketKey(name), fl);
  }
  _normPaketZuFlaechen = m;
  return m;
}

/**
 * @param {readonly string[]} ids
 * @returns {string[]}
 */
export function sortFlaechenIds(ids) {
  const order = [...FUSA_WERBEFLAECHE_IDS];
  const rank = (x) => {
    const i = order.indexOf(x);
    return i === -1 ? 99 : i;
  };
  return [...new Set(ids)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
}

/**
 * Welche Flächen ein Paket belegt.
 * @param {string|null|undefined} paketRaw
 * @returns {{ flaechen: string[], quelle: 'mapping' | 'unbekannt' | 'leer' }}
 */
export function beruehrteFlaechenFuerPaket(paketRaw) {
  const paket = String(paketRaw || '').trim();
  if (!paket) {
    return { flaechen: [...FUSA_WERBEFLAECHE_IDS], quelle: 'leer' };
  }
  const hit = mapNormPaketZuFlaechen().get(normPaketKey(paket));
  if (hit && hit.length) {
    return { flaechen: [...hit], quelle: 'mapping' };
  }
  return { flaechen: [...FUSA_WERBEFLAECHE_IDS], quelle: 'unbekannt' };
}

/**
 * @param {string[]} ids
 */
export function flaechenLabelsDeutsch(ids) {
  return ids.map((id) => FUSA_FLAECHEN_LABEL_DE[id] || id);
}
