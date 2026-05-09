/**
 * Zentraler Abruf Kunden-/Firmen-Detail (GET /api/v1/stammdaten/kunden/:id — eine Quelle für alle Module).
 */
import { apiFetch, formatApiErrorForUi } from '../../../core/auth/cc-auth-session.js';
import { API_ROUTES } from '../../../core/api/api-routes.js';

/**
 * @param {string} kundeId firmen.id
 * @returns {Promise<{ kunde: object|null, detail: object|null, error: string|null }>}
 */
export async function fetchKundenStammDetail(kundeId) {
  const id = kundeId != null ? String(kundeId).trim() : '';
  if (!id) return { kunde: null, detail: null, error: 'Ungültige Kunden-ID.' };
  try {
    const data = await apiFetch(`${API_ROUTES.stammdaten.kunden}/${encodeURIComponent(id)}`);
    const kunde = data && typeof data.kunde === 'object' ? data.kunde : null;
    const detail = data && typeof data.detail === 'object' ? data.detail : null;
    return { kunde, detail, error: null };
  } catch (e) {
    return { kunde: null, detail: null, error: formatApiErrorForUi(e) };
  }
}
