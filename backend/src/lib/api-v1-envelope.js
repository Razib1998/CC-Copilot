/**
 * Einheitliche JSON-Antworten für `/api/v1` (Phase 2).
 * Erfolg: `{ success: true, data }`
 * Fehler: `{ success: false, error: { code, message } }` (sendError).
 */

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {unknown} data
 */
export function sendSuccess(res, status, data) {
  return res.status(status).json({ success: true, data });
}

/**
 * @param {import('express').Response} res
 * @param {number} status
 * @param {string} code
 * @param {string} message
 */
export function sendError(res, status, code, message) {
  return res.status(status).json({
    success: false,
    error: { code, message },
  });
}
