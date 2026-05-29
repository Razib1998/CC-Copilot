/**
 * Browser-Stichprobe für einen ccintern.ma.* User.
 *   node scripts/_verify-ma-user-browser.mjs <email>
 */
import 'dotenv/config';
import { chromium } from 'playwright';
import { openDatabase } from '../src/db/database.js';
import { signAccessToken } from '../src/auth/jwt.js';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/_verify-ma-user-browser.mjs <email>');
  process.exit(1);
}

const API = (process.env.E2E_API_BASE || 'http://127.0.0.1:5371').replace(/\/$/, '');
const FRONT = (process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const store = await openDatabase();
const u = await store.getUserByEmail(email);
if (!u) throw new Error('User not found: ' + email);

const token = signAccessToken({ sub: u.id, email, global_role: 'INTERN' });
const pr = await fetch(`${API}/api/v1/projects`, {
  headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
}).then((r) => r.json());
const pid = pr?.data?.projects?.[0]?.id != null ? String(pr.data.projects[0].id) : '';

const logs = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  page.on('console', (m) => {
    const t = m.text();
    if (t.includes('[MA-APP USER MATCH')) logs.push(t);
  });

  await page.goto(FRONT);
  await page.evaluate(
    ({ tok, projectId }) => {
      localStorage.setItem('cc_cockpit_access_token', tok);
      if (projectId) sessionStorage.setItem('cc_cockpit_active_project_id', projectId);
      sessionStorage.removeItem('mob_ma_id');
    },
    { tok: token, projectId: pid },
  );

  await page.goto(`${FRONT}/`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
  await page.waitForSelector('#mob-hallo, #mob-nav-home', { timeout: 120_000 });
  await page.waitForTimeout(12000);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(6000);

  const snap = await page.evaluate(() => ({
    hallo: document.getElementById('mob-hallo')?.textContent?.trim() || '',
    topbarHidden: document.querySelector('.ckp-topbar-modules')?.offsetParent === null,
    sidebarHidden: document.getElementById('cockpit-sidebar')?.offsetParent === null,
    testRow: document.getElementById('cc-mob-testrow')?.style.display,
    mobMaId: sessionStorage.getItem('mob_ma_id'),
    maLen: typeof MA_DATA !== 'undefined' && MA_DATA ? MA_DATA.length : -1,
  }));

  let aufgabenVisible = false;
  if (await page.locator('#mob-nav-aufgaben').count()) {
    await page.locator('#mob-nav-aufgaben').click();
    await page.waitForTimeout(1500);
    aufgabenVisible = await page.locator('#mob-tab-aufgaben').isVisible().catch(() => false);
  }

  const report = {
    email,
    name: u.name,
    hallo: snap.hallo,
    zuordnungFehlt: /Mitarbeiter-Zuordnung fehlt/i.test(snap.hallo),
    consoleMatch: logs.some((l) => l.includes('[MA-APP USER MATCH]') && !l.includes('FEHLT')),
    consoleFehlt: logs.some((l) => l.includes('FEHLT')),
    topbarHidden: snap.topbarHidden,
    sidebarHidden: snap.sidebarHidden,
    testBarHidden: snap.testRow === 'none',
    mobMaId: snap.mobMaId,
    maDataLen: snap.maLen,
    aufgabenVisible,
    ok:
      !/Mitarbeiter-Zuordnung fehlt/i.test(snap.hallo) &&
      snap.hallo.includes(',') &&
      logs.some((l) => l.includes('[MA-APP USER MATCH]') && !l.includes('FEHLT')) &&
      snap.topbarHidden &&
      aufgabenVisible,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok ? 0 : 1);
} finally {
  await browser.close();
}
