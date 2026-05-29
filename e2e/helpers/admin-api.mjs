/**
 * Server-seitige Hilfen für Playwright (ohne Browser).
 */

/** @param {string} apiBase */
export function authHeaders(/** @type {string} */ token) {
  return { Authorization: `Bearer ${token}` };
}

/**
 * @param {import('@playwright/test').APIRequestContext} request
 * @param {string} apiBase
 * @param {string} email
 * @param {string} password
 */
export async function loginApi(request, apiBase, email, password) {
  const res = await request.post(`${apiBase.replace(/\/$/, '')}/auth/login`, {
    data: { email, password },
    headers: { Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  return { res, body, token: body.access_token };
}

/**
 * @param {any} body
 */
export function unwrapData(body) {
  if (body && typeof body === 'object' && body.success === true && body.data != null) return body.data;
  return body;
}
