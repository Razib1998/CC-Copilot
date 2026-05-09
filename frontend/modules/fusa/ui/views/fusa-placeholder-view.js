/**
 * Platzhalter für noch nicht angebundene FUSA-Bereiche (Phase 11).
 */
import { esc } from '../../fusa-ui-shared.js';

/**
 * @param {string} title
 * @param {string[]} bullets
 * @returns {string}
 */
export function renderFusaPlaceholderViewHtml(title, bullets) {
  const t = title != null ? String(title) : 'Bereich';
  const items = Array.isArray(bullets)
    ? bullets.map(b => `<li>${esc(String(b))}</li>`).join('')
    : '';
  return `<div class="fusa-ph ckp-mock-note" data-ccw-ro="fusa-placeholder">
  <p class="fusa-ph__title"><strong>${esc(t)}</strong> — folgt.</p>
  ${items ? `<ul class="fusa-ph__list">${items}</ul>` : ''}
</div>`;
}
