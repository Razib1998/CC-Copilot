/**
 * FUSA Rechnungen — zentrale Status-Normalisierung und Tab-Logik (analog `FUSA_UMZUG_FERTIG` / `RE_STATUS` + `reTabFilter`).
 */

/** @typedef {'alle'|'ueberfaellig'|'offen'|'geplant'|'bezahlt'} FusaRechnungTabFilter */

/**
 * Kanonischer Status-Schlüssel (wie alte FUSA-`state.fusa.rechnungen[].status`).
 * @typedef {'angebot'|'ueberfaellig'|'erstellt'|'versendet'|'geplant'|'bezahlt'|'unknown'} FusaRechnungStatusCanon
 */

/**
 * @param {string|undefined|null} raw
 * @returns {FusaRechnungStatusCanon}
 */
export function normalizeRechnungStatus(raw) {
  const s = raw != null ? String(raw).trim().toLowerCase() : '';
  if (!s) return 'unknown';
  const map = /** @type {Record<string, FusaRechnungStatusCanon>} */ ({
    angebot: 'angebot',
    offer: 'angebot',
    ueberfaellig: 'ueberfaellig',
    'überfällig': 'ueberfaellig',
    overdue: 'ueberfaellig',
    erstellt: 'erstellt',
    created: 'erstellt',
    draft: 'erstellt',
    versendet: 'versendet',
    sent: 'versendet',
    geplant: 'geplant',
    planned: 'geplant',
    bezahlt: 'bezahlt',
    paid: 'bezahlt',
  });
  return map[s] || 'unknown';
}

/**
 * @param {FusaRechnungStatusCanon} canon
 * @param {FusaRechnungTabFilter} tab
 * @returns {boolean}
 */
export function rechnungMatchesTab(canon, tab) {
  if (tab === 'alle') return true;
  if (tab === 'ueberfaellig') return canon === 'ueberfaellig';
  if (tab === 'offen') return canon === 'erstellt' || canon === 'versendet';
  if (tab === 'geplant') return canon === 'geplant' || canon === 'angebot';
  if (tab === 'bezahlt') return canon === 'bezahlt';
  return true;
}

/**
 * Badge-Kürzel wie alte FUSA (`bdg b{bp|br|ba|bg}`).
 * @param {FusaRechnungStatusCanon} canon
 * @returns {{ label: string, badgeSuffix: string }}
 */
export function getRechnungStatusUi(canon) {
  switch (canon) {
    case 'angebot':
      return { label: 'Angebot', badgeSuffix: 'bp' };
    case 'ueberfaellig':
      return { label: 'Überfällig', badgeSuffix: 'br' };
    case 'erstellt':
      return { label: 'Erstellt', badgeSuffix: 'ba' };
    case 'versendet':
      return { label: 'Versendet', badgeSuffix: 'ba' };
    case 'geplant':
      return { label: 'Geplant', badgeSuffix: 'bp' };
    case 'bezahlt':
      return { label: 'Bezahlt', badgeSuffix: 'bg' };
    default:
      return { label: 'Status', badgeSuffix: 'bgr' };
  }
}
