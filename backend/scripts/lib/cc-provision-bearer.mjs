/**
 * Lokale Dev-Hilfe für Provision-Skripte: Bearer für /auth/me und /api/v1/*.
 *
 * Reihenfolge:
 * 1) process.env.CC_BEARER_TOKEN (nach optionalem dotenv aus backend/.env + .env.local)
 * 2) Datei backend/.cc-local-bearer (eine Zeile, JWT; # Kommentare erlaubt)
 *    oder Pfad in CC_LOCAL_BEARER_FILE (absolut oder relativ zum Backend-Root)
 * 3) Optional: Chrome mit Remote-Debugging — CC_CHROME_DEBUG_URL (z. B. http://127.0.0.1:9222),
 *    sessionStorage cc_cockpit_access_token auf einer Cockpit-Seite auslesen (kein neues Fenster)
 *
 * Kein CC_LOGIN_EMAIL / Passwort — stattdessen:
 *   node scripts/sync-cc-local-bearer.mjs
 * oder Token-Datei / CC_BEARER_TOKEN / Chrome-CDP.
 *
 * Optional lokal (NODE_ENV ≠ production, gleicher Key in backend/.env):
 *   CC_DEV_PROVISION_KEY=…  → Header x-dev-provision-key (siehe middleware/dev-provision-auth.js)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as dotenvConfig } from 'dotenv';

/**
 * @param {string} importMetaUrl import.meta.url des aufrufenden Skripts (…/backend/scripts/*.mjs)
 */
export function resolveBackendRoot(importMetaUrl) {
  const scriptDir = path.dirname(fileURLToPath(importMetaUrl));
  return path.resolve(scriptDir, '..');
}

/**
 * @param {string} backendRoot
 */
export function loadBackendDotenv(backendRoot) {
  dotenvConfig({ path: path.join(backendRoot, '.env') });
  dotenvConfig({ path: path.join(backendRoot, '.env.local'), override: true });
}

/**
 * @param {string} backendRoot
 */
export function readLocalBearerFile(backendRoot) {
  const custom = (process.env.CC_LOCAL_BEARER_FILE || '').trim();
  const filePath = custom
    ? path.isAbsolute(custom)
      ? custom
      : path.join(backendRoot, custom)
    : path.join(backendRoot, '.cc-local-bearer');
  if (!fs.existsSync(filePath)) return '';
  const raw = fs.readFileSync(filePath, 'utf8');
  const line = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.length > 0 && !l.startsWith('#'));
  return line || '';
}

/**
 * Chrome/Chromium mit Remote-Debugging (z. B. --remote-debugging-port=9222), bestehende Tabs:
 * liest sessionStorage cc_cockpit_access_token (gleicher Schlüssel wie Cockpit-Frontend).
 *
 * @param {string} debugUrl z. B. http://127.0.0.1:9222
 * @returns {Promise<string>}
 */
export async function readBearerFromChromeCdp(debugUrl) {
  const base = debugUrl.replace(/\/$/, '');
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), 800);
    const r = await fetch(`${base}/json/version`, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return '';
  } catch {
    return '';
  }
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.connectOverCDP(base);
    try {
      for (const context of browser.contexts()) {
        for (const page of context.pages()) {
          try {
            const tok = await page.evaluate(() => {
              try {
                return sessionStorage.getItem('cc_cockpit_access_token');
              } catch {
                return null;
              }
            });
            if (tok && typeof tok === 'string' && tok.trim().length > 40) return tok.trim();
          } catch {
            /* Tab nicht zugänglich */
          }
        }
      }
    } finally {
      await browser.close();
    }
  } catch {
    return '';
  }
  return '';
}

/**
 * @param {{ bearerToken?: string|null, devProvisionKey?: string|null }} auth
 * @returns {Record<string, string>}
 */
export function buildProvisionAuthHeaders(auth) {
  /** @type {Record<string, string>} */
  const h = {};
  if (auth?.bearerToken) {
    h.Authorization = `Bearer ${auth.bearerToken}`;
  }
  if (auth?.devProvisionKey) {
    h['x-dev-provision-key'] = auth.devProvisionKey;
  }
  return h;
}

function scriptSideDevProvisionKey() {
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production') {
    return '';
  }
  const k = String(process.env.CC_DEV_PROVISION_KEY || '').trim();
  return k.length >= 8 ? k : '';
}

/**
 * Bearer und/oder Dev-Provision-Key für lokale Scripts.
 *
 * @param {string} importMetaUrl
 * @param {{ tryCdp?: boolean }} [opts]
 * @returns {Promise<{ bearerToken: string|null, devProvisionKey: string|null }>}
 */
export async function resolveProvisionRequestAuth(importMetaUrl, opts = {}) {
  const backendRoot = resolveBackendRoot(importMetaUrl);
  loadBackendDotenv(backendRoot);

  const devKey = scriptSideDevProvisionKey();

  let bearer = (process.env.CC_BEARER_TOKEN || '').trim();
  if (bearer) {
    return { bearerToken: bearer, devProvisionKey: null };
  }

  bearer = readLocalBearerFile(backendRoot).trim();
  if (bearer) {
    return { bearerToken: bearer, devProvisionKey: null };
  }

  const tryCdp = opts.tryCdp !== false;
  const debugUrl = (process.env.CC_CHROME_DEBUG_URL || process.env.CC_CHROME_CDP_URL || '').trim();
  if (tryCdp && debugUrl) {
    bearer = (await readBearerFromChromeCdp(debugUrl)).trim();
    if (bearer) {
      console.log('Nutze Bearer aus Chrome CDP (sessionStorage cc_cockpit_access_token).');
      return { bearerToken: bearer, devProvisionKey: null };
    }
  }

  if (devKey) {
    return { bearerToken: null, devProvisionKey: devKey };
  }

  console.error(
    [
      'Keine Authentifizierung: weder Bearer (CC_BEARER_TOKEN / .cc-local-bearer / CDP), noch CC_DEV_PROVISION_KEY (≥8 Zeichen, non-production).',
      '',
      'Optionen:',
      '  • CC_DEV_PROVISION_KEY in backend/.env (nur lokal) + gleicher Wert in der Shell, dann ohne JWT.',
      '  • node scripts/sync-cc-local-bearer.mjs',
      '  • CC_BEARER_TOKEN in .env / .env.local',
      '  • Chrome mit --remote-debugging-port=9222 + CC_CHROME_DEBUG_URL=…',
    ].join('\n'),
  );
  process.exit(1);
}

/**
 * @param {string} importMetaUrl import.meta.url des Provision-Skripts
 * @param {{ tryCdp?: boolean }} [opts] tryCdp: default true wenn CC_CHROME_DEBUG_URL gesetzt
 * @returns {Promise<string>}
 */
export async function resolveCcProvisionBearer(importMetaUrl, opts = {}) {
  const a = await resolveProvisionRequestAuth(importMetaUrl, opts);
  if (a.bearerToken) return a.bearerToken;
  if (a.devProvisionKey) {
    console.error('resolveCcProvisionBearer: nur Dev-Key — bitte resolveProvisionRequestAuth + buildProvisionAuthHeaders nutzen.');
    process.exit(1);
  }
  process.exit(1);
}
