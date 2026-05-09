/**
 * CORS-Allowlist: keine Wildcards mit `credentials: true`.
 * Produktion: nur Origins aus `CORS_ALLOWED_ORIGINS` (kommagetrennt).
 * Entwicklung: feste Localhost-Ports + optional dieselbe Env-Liste + `CORS_DEV_EXTRA_ORIGINS`.
 */

const DEV_DEFAULT_ORIGINS = [
  'http://localhost:5370',
  'http://127.0.0.1:5370',
  'http://localhost:5371',
  'http://127.0.0.1:5371',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

/**
 * @param {string} raw
 * @returns {string[]}
 */
function parseOriginList(raw) {
  if (raw == null || String(raw).trim() === '') return [];
  return String(raw)
    .split(',')
    .map(s => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

/**
 * @returns {{ allowedOrigins: Set<string>, isProduction: boolean }}
 */
export function buildCorsAllowedOriginsSet() {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const fromEnv = parseOriginList(process.env.CORS_ALLOWED_ORIGINS);
  const extraDev = parseOriginList(process.env.CORS_DEV_EXTRA_ORIGINS);

  /** @type {Set<string>} */
  const allowed = new Set();

  if (isProduction) {
    for (const o of fromEnv) allowed.add(o);
    if (allowed.size === 0) {
      throw new Error(
        '[CORS] NODE_ENV=production: CORS_ALLOWED_ORIGINS muss mindestens eine Origin enthalten (kommagetrennt, z. B. https://app.example.com).',
      );
    }
    return { allowedOrigins: allowed, isProduction };
  }

  for (const o of DEV_DEFAULT_ORIGINS) allowed.add(o);
  for (const o of fromEnv) allowed.add(o);
  for (const o of extraDev) allowed.add(o);

  const port = Number.parseInt(process.env.PORT || '5371', 10);
  if (Number.isFinite(port)) {
    allowed.add(`http://localhost:${port}`);
    allowed.add(`http://127.0.0.1:${port}`);
  }

  return { allowedOrigins: allowed, isProduction };
}

const LOCAL_ANY_PORT = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/i;

/**
 * @param {Set<string>} allowedOrigins
 * @param {boolean} isProduction
 * @returns {(origin: string | undefined, cb: (err: Error | null, allow?: boolean | string) => void) => void}
 */
export function createCorsOriginCallback(allowedOrigins, isProduction) {
  return (origin, cb) => {
    if (!origin || String(origin).trim() === '') {
      // Kein Origin (z. B. curl, Server-zu-Server): keine CORS-Reflektion — Browser mit Credentials senden i. d. R. Origin.
      return cb(null, false);
    }
    const o = String(origin).trim().replace(/\/+$/, '');
    if (allowedOrigins.has(o)) {
      return cb(null, o);
    }
    // Dev/Test: zufällige API-Ports (z. B. Integrationstests) — nur localhost/127.0.0.1, nie in Produktion.
    if (!isProduction && LOCAL_ANY_PORT.test(o)) {
      return cb(null, o);
    }
    if (!isProduction) {
      console.warn('[CORS] Abgelehnte Origin:', o);
    }
    return cb(null, false);
  };
}
