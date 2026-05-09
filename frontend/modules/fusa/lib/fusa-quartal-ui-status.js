/**
 * FUSA Quartalsabrechnung — zentrale Status-/Kartenlogik (analog `export.js` / `pColors` in alter FUSA).
 * Nutzt dieselbe Status-Normalisierung wie Rechnungen.
 */
import { normalizeRechnungStatus } from './fusa-rechnung-ui-status.js';

export { normalizeRechnungStatus as normalizeQuartalRechnungStatus };

/**
 * @param {string} canon — {@link normalizeRechnungStatus}
 * @returns {{ bg: string; border: string; col: string; bdg: string; lbl: string }}
 */
export function quartalPeriodCardStyle(canon) {
  switch (canon) {
    case 'ueberfaellig':
      return { bg: 'var(--fq-red-l)', border: '#FFCDD2', col: 'var(--fq-red)', bdg: 'br', lbl: 'Überfällig' };
    case 'erstellt':
      return { bg: 'var(--fq-amber-l)', border: '#FFD180', col: 'var(--fq-amber)', bdg: 'ba', lbl: 'Erstellt' };
    case 'versendet':
      return { bg: 'var(--fq-amber-l)', border: '#FFD180', col: 'var(--fq-amber)', bdg: 'ba', lbl: 'Versendet' };
    case 'geplant':
    case 'angebot':
      return { bg: 'var(--fq-blue-l)', border: '#BBDEFB', col: 'var(--fq-blue)', bdg: 'bb', lbl: canon === 'angebot' ? 'Angebot' : 'Geplant' };
    case 'bezahlt':
      return { bg: 'var(--fq-green-l)', border: '#C8E6C9', col: 'var(--fq-green)', bdg: 'bg', lbl: 'Bezahlt' };
    default:
      return {
        bg: 'var(--fq-gray-l)',
        border: '#e2e8f0',
        col: 'var(--fq-gray)',
        bdg: 'bgr',
        lbl: 'Unbekannt',
      };
  }
}

/**
 * @param {string} exportQuartalOpt — "", "Q1", … "Q4"
 * @param {string} zeileQuartalLabel — z. B. "Q2 2026"
 * @returns {boolean}
 */
export function exportQuartalMatchesFilter(exportQuartalOpt, zeileQuartalLabel) {
  const f = exportQuartalOpt != null ? String(exportQuartalOpt).trim().toUpperCase() : '';
  if (!f) return true;
  const lab = zeileQuartalLabel != null ? String(zeileQuartalLabel).toUpperCase() : '';
  return lab.startsWith(f);
}
