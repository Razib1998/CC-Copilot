/**
 * Zentraler Frontend-ID-Adapter:
 * API (snake_case / gemischt) -> Frontend (kanonisch)
 * Frontend (kanonisch) -> API (snake_case)
 */

/**
 * @param {Record<string, unknown>} src
 * @returns {Record<string, unknown>}
 */
export function normalizeCockpitIds(src) {
  const out = { ...src };

  const projektIdRaw = src.projektId ?? src.projectId ?? src.project_id;
  if (projektIdRaw != null && String(projektIdRaw).trim() !== '') out.projektId = String(projektIdRaw).trim();

  const firmaIdRaw = src.firmaId ?? src.companyId ?? src.company_id ?? src.firma_id;
  if (firmaIdRaw != null && String(firmaIdRaw).trim() !== '') out.firmaId = String(firmaIdRaw).trim();

  const benutzerIdRaw = src.benutzerId ?? src.userId ?? src.user_id;
  if (benutzerIdRaw != null && String(benutzerIdRaw).trim() !== '') out.benutzerId = String(benutzerIdRaw).trim();

  const rollenIdRaw = src.rollenId ?? src.roleId ?? src.role_id ?? src.rolleId;
  if (rollenIdRaw != null && String(rollenIdRaw).trim() !== '') out.rollenId = String(rollenIdRaw).trim();

  const kundeIdRaw = src.kundeId ?? src.customerId ?? src.customer_id ?? src.kunden_id;
  if (kundeIdRaw != null && String(kundeIdRaw).trim() !== '') out.kundeId = String(kundeIdRaw).trim();

  return out;
}

/**
 * @template T
 * @param {T[]} rows
 * @returns {(T & Record<string, unknown>)[]}
 */
export function normalizeCockpitIdList(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map(r => (r && typeof r === 'object' ? /** @type {any} */ (normalizeCockpitIds(/** @type {any} */ (r))) : /** @type {any} */ (r)));
}

/**
 * Erzeugt API-Payload mit snake_case aus kanonischen Frontend-IDs.
 * Nicht-ID-Felder bleiben unverändert.
 *
 * @param {Record<string, unknown>} src
 * @returns {Record<string, unknown>}
 */
export function toApiIdPayload(src) {
  const out = { ...src };
  if (Object.prototype.hasOwnProperty.call(out, 'projektId')) {
    out.project_id = out.projektId;
    delete out.projektId;
  }
  if (Object.prototype.hasOwnProperty.call(out, 'firmaId')) {
    out.firma_id = out.firmaId;
    delete out.firmaId;
  }
  if (Object.prototype.hasOwnProperty.call(out, 'benutzerId')) {
    out.user_id = out.benutzerId;
    delete out.benutzerId;
  }
  if (Object.prototype.hasOwnProperty.call(out, 'rollenId')) {
    out.role_id = out.rollenId;
    delete out.rollenId;
  }
  if (Object.prototype.hasOwnProperty.call(out, 'kundeId')) {
    out.kunden_id = out.kundeId;
    delete out.kundeId;
  }
  return out;
}
