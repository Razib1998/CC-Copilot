/**
 * Zentrale Typ-/Badge-Zuordnung für FUSA Dokumente (an alter FUSA `DOK_TYP_BDG` aus `constants.js`).
 */

/** @type {readonly string[]} */
export const FUSA_DOKUMENT_TYP_OPTIONS = [
  'Layout',
  'Freigabe',
  'Montagefoto',
  'Rechnung',
  'Schadensfoto',
  'Vertrag',
  'Sonstiges',
];

/** Alte Semantik: Typ → Badge-Klasse ohne `b`-Präfix (wird als `b${bdg}` gerendert). */
const TYP_TO_BDG = /** @type {Record<string, string>} */ ({
  Layout: 'bp',
  Freigabe: 'bg',
  Montagefoto: 'bb',
  Rechnung: 'ba',
  Schadensfoto: 'br',
  Vertrag: 'bp',
  Sonstiges: 'bgr',
});

/**
 * @param {unknown} raw
 */
export function normalizeDokumentTyp(raw) {
  const s = String(raw ?? '')
    .trim()
    .toLowerCase();
  if (!s) return 'Sonstiges';
  for (const k of FUSA_DOKUMENT_TYP_OPTIONS) {
    if (k.toLowerCase() === s) return k;
  }
  return 'Sonstiges';
}

/**
 * @param {unknown} typ
 */
export function dokumentTypBadgeClass(typ) {
  const k = normalizeDokumentTyp(typ);
  return TYP_TO_BDG[k] || 'bgr';
}
