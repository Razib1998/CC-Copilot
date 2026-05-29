/**
 * Schreibt sessionStorage cc_cockpit_access_token nach backend/.cc-local-bearer
 * (für provision-ccwerbung-checklisten-api.mjs und provision-ccintern-checklisten-zuordnung-api.mjs).
 *
 * Ohne manuelles Kopieren des JWT in die Shell.
 *
 *   cd backend
 *   npm install
 *   npx playwright install chromium
 *   node scripts/sync-cc-local-bearer.mjs
 *
 * Ablauf:
 * 1) Wenn CC_CHROME_DEBUG_URL gesetzt: Token aus bestehendem Chrome per CDP lesen.
 * 2) Sonst: Chromium-Fenster öffnen → CC_COCKPIT_URL laden → im UI anmelden → Token wird gepollt.
 *
 * Env:
 *   CC_CHROME_DEBUG_URL — z. B. http://127.0.0.1:9222 (Chrome mit --remote-debugging-port=9222)
 *   CC_COCKPIT_URL      — Default http://127.0.0.1:5370
 *   CC_PLAYWRIGHT_CHANNEL — optional "chrome" (installiertes Chrome nutzen)
 */
import fs from 'node:fs';
import path from 'node:path';
import { resolveBackendRoot, readBearerFromChromeCdp } from './lib/cc-provision-bearer.mjs';

const backendRoot = resolveBackendRoot(import.meta.url);
const OUT = path.join(backendRoot, '.cc-local-bearer');
const COCKPIT_URL = (process.env.CC_COCKPIT_URL || 'http://127.0.0.1:5370').replace(/\/$/, '');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function readFromHeadedPlaywright() {
  const { chromium } = await import('playwright');
  const channel = (process.env.CC_PLAYWRIGHT_CHANNEL || '').trim() || undefined;
  const browser = await chromium.launch({
    headless: false,
    ...(channel ? { channel } : {}),
  });
  try {
    const page = await browser.newPage();
    await page.goto(COCKPIT_URL, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const tok = await page.evaluate(() => {
        try {
          return sessionStorage.getItem('cc_cockpit_access_token');
        } catch {
          return null;
        }
      });
      if (tok && typeof tok === 'string' && tok.trim().length > 40) return tok.trim();
      await sleep(500);
    }
  } finally {
    await browser.close();
  }
  return '';
}

async function main() {
  let token = '';
  const cdpUrl = (process.env.CC_CHROME_DEBUG_URL || process.env.CC_CHROME_CDP_URL || '').trim();
  if (cdpUrl) {
    token = await readBearerFromChromeCdp(cdpUrl);
    if (token) console.log('Token über Chrome CDP gelesen.');
  }
  if (!token) {
    console.log('Öffne Browser für', COCKPIT_URL, '— bitte anmelden (bis zu 120 s).');
    token = await readFromHeadedPlaywright();
  }
  if (!token) {
    console.error('Kein cc_cockpit_access_token in sessionStorage gefunden.');
    process.exit(1);
  }
  fs.writeFileSync(OUT, `${token}\n`, 'utf8');
  console.log('Geschrieben:', OUT);
}

await main();
