/**
 * Browser-Verifikation: Okan Mitarbeiter-App nach Rechte-/Firmen-Fix.
 *   node scripts/_e2e-okan-ma-app-browser.mjs
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { openDatabase } from '../src/db/database.js';
import { signAccessToken } from '../src/auth/jwt.js';

const OKAN_EMAIL = 'ccintern.ma.4a7e6df8-be63-4329-81c8-a03d3e138ce3@cc-cockpit.local';
const API_BASE = (process.env.E2E_API_BASE || 'http://127.0.0.1:5371').replace(/\/$/, '');
const FRONT_BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function apiLogin(email, password) {
  const r = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await r.json().catch(() => ({}));
  const token = body?.access_token || body?.accessToken;
  return { ok: r.ok, token: token ? String(token).trim() : '' };
}

async function main() {
  const report = {
    backendUp: false,
    frontendUp: false,
    loginMethod: '',
    apiMitarbeiterStatus: 0,
    mitarbeiterCount: 0,
    okanInApi: false,
    halloText: '',
    zuordnungFehlt: false,
    consoleMatch: null,
    consoleFehlt: false,
    maDataLen: -1,
    mobMaId: null,
    aufgabenVisible: false,
    ok: false,
  };

  try {
    report.backendUp = (await fetch(`${API_BASE}/health`)).ok;
    report.frontendUp = (await fetch(FRONT_BASE)).ok;
  } catch {
    /* ignore */
  }

  const store = await openDatabase();
  const u = await store.getUserByEmail(OKAN_EMAIL);
  if (!u) throw new Error('Okan nicht in DB');

  let token = '';
  const pw = String(process.env.E2E_OKAN_PASSWORD || '').trim();
  if (pw) {
    const login = await apiLogin(OKAN_EMAIL, pw);
    if (login.ok && login.token) {
      token = login.token;
      report.loginMethod = 'POST /auth/login';
    }
  }
  if (!token) {
    token = signAccessToken({ sub: String(u.id), email: OKAN_EMAIL, global_role: 'INTERN' });
    report.loginMethod = 'signAccessToken (E2E_OKAN_PASSWORD für Form-Login setzen)';
  }

  const hAuth = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const me = await fetch(`${API_BASE}/auth/me`, { headers: hAuth }).then((r) => r.json());
  const cid = me?.user?.company_id != null ? String(me.user.company_id) : '';
  const pr = await fetch(`${API_BASE}/api/v1/projects`, { headers: hAuth }).then((r) => r.json());
  const pid = pr?.data?.projects?.[0]?.id != null ? String(pr.data.projects[0].id) : '';

  const maRes = await fetch(`${API_BASE}/api/v1/mitarbeiter?firma_id=${encodeURIComponent(cid)}`, {
    headers: { ...hAuth, 'x-project-id': pid },
  });
  report.apiMitarbeiterStatus = maRes.status;
  const maBody = await maRes.json().catch(() => ({}));
  const rows =
    maBody?.data?.items ||
    maBody?.data?.mitarbeiter ||
    maBody?.items ||
    [];
  report.mitarbeiterCount = Array.isArray(rows) ? rows.length : 0;
  report.okanInApi = rows.some((m) => String(m.user_id) === String(u.id));

  const logs = [];
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    page.on('console', (msg) => {
      const t = msg.text();
      if (t.includes('[MA-APP USER MATCH]') || t.includes('[MA_BOOT_MATCH]') || t.includes('[MA_BOOT_AUTH]')) {
        logs.push(t);
      }
    });

    await page.goto(FRONT_BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.evaluate(
      ({ tok, projectId }) => {
        localStorage.setItem('cc_cockpit_access_token', tok);
        if (projectId) sessionStorage.setItem('cc_cockpit_active_project_id', projectId);
        sessionStorage.removeItem('mob_ma_id');
      },
      { tok: token, projectId: pid },
    );

    await page.goto(`${FRONT_BASE}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await page.waitForSelector('#mob-hallo, #mob-nav-home', { timeout: 120_000 });
    await page.waitForTimeout(15000);

    const snap = await page.evaluate(() => ({
      hallo: document.getElementById('mob-hallo')?.textContent?.trim() || '',
      mobMaId: sessionStorage.getItem('mob_ma_id'),
      maDataLen: typeof MA_DATA !== 'undefined' && MA_DATA ? MA_DATA.length : -1,
    }));
    report.halloText = snap.hallo;
    report.mobMaId = snap.mobMaId;
    report.maDataLen = snap.maDataLen;
    report.zuordnungFehlt = /Mitarbeiter-Zuordnung fehlt/i.test(snap.hallo);

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(8000);

    const snap2 = await page.evaluate(() => ({
      hallo: document.getElementById('mob-hallo')?.textContent?.trim() || '',
      mobMaId: sessionStorage.getItem('mob_ma_id'),
    }));
    if (snap2.hallo) report.halloText = snap2.hallo;
    if (snap2.mobMaId) report.mobMaId = snap2.mobMaId;
    report.zuordnungFehlt = /Mitarbeiter-Zuordnung fehlt/i.test(report.halloText);

    report.consoleFehlt = logs.some((l) => l.includes('FEHLT'));
    report.consoleMatch =
      logs.find((l) => (l.includes('[MA-APP USER MATCH]') || l.includes('[MA_BOOT_MATCH]')) && !l.includes('FEHLT')) ||
      null;
    report.bootLogs = logs.filter((l) => l.includes('[MA_BOOT_'));

    if (await page.locator('#mob-nav-aufgaben').count()) {
      await page.locator('#mob-nav-aufgaben').click();
      await page.waitForTimeout(1500);
      report.aufgabenVisible = await page.locator('#mob-tab-aufgaben').isVisible().catch(() => false);
    }

    report.ok =
      report.apiMitarbeiterStatus === 200 &&
      report.okanInApi &&
      !report.zuordnungFehlt &&
      /Okan/i.test(report.halloText) &&
      !!report.consoleMatch &&
      !report.consoleFehlt &&
      report.maDataLen > 0;

    console.log(JSON.stringify(report, null, 2));
    console.log('Console:', logs);
    process.exit(report.ok ? 0 : 1);
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
