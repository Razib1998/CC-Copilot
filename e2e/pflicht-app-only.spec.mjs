/**
 * Browser-E2E: App-only (Mitarbeiter-App) — Invite → Activate → Login → Tabs → Urlaub POST.
 *
 * Umgebung:
 *   E2E_API_BASE=http://localhost:5371
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000
 *   E2E_ADMIN_EMAIL=…
 *   E2E_ADMIN_PASSWORD=…
 *
 * Report: e2e-results/pflicht-network-report.json
 */
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { authHeaders, loginApi, unwrapData } from './helpers/admin-api.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const REPORT_PATH = path.join(ROOT, 'e2e-results', 'pflicht-network-report.json');

const API_BASE = (process.env.E2E_API_BASE || 'http://localhost:5371').replace(/\/$/, '');

const INVITE_RIGHTS = {
  ccintern: {
    mitarbeiter: { sehen: true },
    mitarbeiterapp: { sehen: true },
    produktion: { sehen: true },
    auftraege: { sehen: true },
    materiallager: { sehen: true },
    checklisten: { sehen: true },
    urlaub: { sehen: true, erstellen: true },
  },
};

/** POST genau /api/v1/users (Benutzer anlegen) */
function isPostApiV1UsersCreate(url, method) {
  if (method !== 'POST') return false;
  try {
    const u = new URL(url);
    return /\/api\/v1\/users\/?$/.test(u.pathname);
  } catch {
    return false;
  }
}

function filterByPath(entries, sub) {
  return entries.filter((e) => e.url && e.url.includes(sub));
}

async function fetchMyRightsBundle(request, token) {
  const res = await request.get(`${API_BASE}/api/v1/auth/my-rights`, {
    headers: { ...authHeaders(token), Accept: 'application/json' },
  });
  const body = await res.json().catch(() => ({}));
  const data = unwrapData(body);
  return { res, data };
}

test.describe('Stufe 2 — App-only Browser E2E', () => {
  test('Health, Invite-Flow, UI App-only, Tabs, Urlaub POST, kein POST /users', async ({ page, request }) => {
    test.skip(!process.env.E2E_ADMIN_PASSWORD, 'E2E_ADMIN_PASSWORD setzen (Admin für Einladung + Projekt-Zugriff).');

    const adminEmail = (process.env.E2E_ADMIN_EMAIL || 'info@cc-werbung.de').trim();
    const adminPassword = String(process.env.E2E_ADMIN_PASSWORD || '').trim();

    /** @type {{ url: string, method: string, status: number|null }[]} */
    const networkEntries = [];

    page.on('response', (response) => {
      const req = response.request();
      networkEntries.push({
        url: response.url(),
        method: req.method(),
        status: response.status(),
      });
    });

    // 1) Backend health
    const health = await request.get(`${API_BASE}/health`);
    expect(health.ok(), 'GET /health').toBeTruthy();

    // 2) Frontend erreichbar
    const frontUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000';
    const front = await request.get(frontUrl.replace(/\/$/, ''));
    expect(front.ok(), `Frontend ${frontUrl}`).toBeTruthy();

    // Admin-Login (API)
    const { res: admLogin, body: admBody, token: adminToken } = await loginApi(request, API_BASE, adminEmail, adminPassword);
    expect(admLogin.ok(), `Admin-Login: ${JSON.stringify(admBody)}`).toBeTruthy();
    expect(adminToken, 'Admin access_token').toBeTruthy();

    const hAuth = { ...authHeaders(adminToken), Accept: 'application/json' };

    const prRes = await request.get(`${API_BASE}/api/v1/projects`, { headers: hAuth });
    expect(prRes.ok(), 'GET /api/v1/projects').toBeTruthy();
    const prBody = unwrapData(await prRes.json());
    const projectId = prBody?.projects?.[0]?.id;
    expect(projectId, 'Mindestens ein Projekt in der DB').toBeTruthy();

    const frRes = await request.get(`${API_BASE}/api/v1/firmen`, { headers: hAuth });
    expect(frRes.ok(), 'GET /api/v1/firmen').toBeTruthy();
    const frBody = unwrapData(await frRes.json());
    const firmaId = frBody?.firmen?.[0]?.id;
    expect(firmaId, 'Mindestens eine Firma').toBeTruthy();

    const inviteEmail = `e2e-apponly-${Date.now()}@cc-cockpit-e2e.local`;
    const invitePassword = `E2E-App!${Date.now().toString(36)}x9`;

    const invRes = await request.post(`${API_BASE}/api/v1/invites`, {
      headers: hAuth,
      data: {
        email: inviteEmail,
        global_role: 'INTERN',
        modules: ['ccintern'],
        firma_id: firmaId,
        rights: INVITE_RIGHTS,
      },
    });
    const invJson = await invRes.json().catch(() => ({}));
    expect(invRes.ok(), `POST /invites ${JSON.stringify(invJson)}`).toBeTruthy();
    const inviteToken = unwrapData(invJson)?.invite?.token;
    expect(inviteToken, 'Invite-Token').toBeTruthy();

    await page.context().clearCookies();
    await page.goto('about:blank');
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        /* ignore */
      }
    });

    await page.goto(`/?token=${encodeURIComponent(inviteToken)}`, { waitUntil: 'domcontentloaded' });

    await expect(page.getByRole('heading', { name: /Einladung aktivieren/i })).toBeVisible({ timeout: 60_000 });

    await page.locator('#ccw-inv-pass').fill(invitePassword);
    await page.locator('#ccw-inv-pass2').fill(invitePassword);

    const [activateResp] = await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === 'POST' &&
          r.url().includes('/invites/') &&
          r.url().includes('/activate'),
        { timeout: 60_000 },
      ),
      page.getByRole('button', { name: /Konto aktivieren/i }).click(),
    ]);

    expect(activateResp.ok(), `Activate HTTP ${activateResp.status()}`).toBeTruthy();
    const actBody = await activateResp.json().catch(() => ({}));
    const newUserId = actBody.user?.id != null ? String(actBody.user.id).trim() : '';
    expect(newUserId.length > 10, 'user.id aus Activate').toBeTruthy();

    const accRes = await request.post(`${API_BASE}/api/v1/projects/${encodeURIComponent(projectId)}/access`, {
      headers: hAuth,
      data: { user_id: newUserId, role: 'editor' },
    });
    if (!accRes.ok()) {
      const t = await accRes.text();
      expect(accRes.ok(), `Projekt-Zugriff: ${accRes.status()} ${t}`).toBeTruthy();
    }

    await expect(page.getByRole('heading', { name: /Anmelden/i })).toBeVisible({ timeout: 60_000 });
    await page.locator('#ccw-login-email').fill(inviteEmail);
    await page.locator('#ccw-login-pass').fill(invitePassword);

    await Promise.all([
      page.waitForResponse(
        (r) => r.request().method() === 'POST' && r.url().includes('/auth/login') && r.status() === 200,
        { timeout: 60_000 },
      ),
      page.getByRole('button', { name: /^Anmelden$/i }).click(),
    ]);

    await expect(page.locator('#mob-nav-home')).toBeVisible({ timeout: 120_000 });

    await expect(page.locator('.ckp-topbar-modules'), 'Modul-Topbar aus (App-only)').toBeHidden();
    await expect(page.locator('#cockpit-sidebar'), 'Sidebar aus (kein Desktop)').toBeHidden();
    await expect(page.locator('.ckp-mod-btn.mod--cockpit'), 'Kein sichtbares Cockpit-Modul').toBeHidden();
    await expect(page.locator('.ckp-mod-btn.mod--fusa'), 'Kein sichtbares FUSA-Modul').toBeHidden();

    const postUsers = networkEntries.filter((e) => isPostApiV1UsersCreate(e.url, e.method));
    expect(postUsers, 'Kein POST /api/v1/users').toEqual([]);

    const tokenForRights = await page.evaluate(() => localStorage.getItem('cc_cockpit_access_token'));
    expect(tokenForRights).toBeTruthy();

    const { deriveShellUiAccess } = await import(pathToFileURL(path.join(ROOT, 'frontend', 'core', 'access', 'cc-my-rights.js')).href);

    const my1 = await fetchMyRightsBundle(request, tokenForRights);
    expect(my1.res.ok(), 'GET my-rights').toBeTruthy();
    const ui1 = deriveShellUiAccess(my1.data);
    expect(ui1.isMitarbeiterAppOnlyShell, 'isMitarbeiterAppOnlyShell').toBe(true);
    expect(ui1.canSeeCockpit).toBe(false);
    expect(ui1.canSeeFusa).toBe(false);
    expect(ui1.canSeeCcInternDesktop).toBe(false);

    // Aufgaben
    await page.locator('#mob-nav-aufgaben').click();
    await expect(page.locator('#mob-tab-aufgaben')).toBeVisible();
    await expect(page.locator('#mob-alle-auftraege')).toBeVisible();

    // Fotos
    await page.locator('#mob-nav-fotos').click();
    await expect(page.locator('#mob-tab-fotos')).toBeVisible();

    // Lager
    await page.locator('#mob-nav-lager').click();
    await expect(page.locator('#mob-tab-lager')).toBeVisible();

    // Urlaub + API-POST
    await page.locator('#mob-nav-urlaub').click();
    await expect(page.locator('#mob-tab-urlaub')).toBeVisible();
    await page.locator('#mob-url-typ').selectOption({ label: 'Urlaub' });

    const von = '2026-06-02';
    const bis = '2026-06-04';
    await page.locator('#mob-url-von').fill(von);
    await page.locator('#mob-url-bis').fill(bis);

    const [urlaubResp] = await Promise.all([
      page.waitForResponse(
        (r) => {
          if (r.request().method() !== 'POST') return false;
          try {
            const u = new URL(r.url());
            return u.pathname === '/api/v1/urlaub' || u.pathname.endsWith('/api/v1/urlaub');
          } catch {
            return false;
          }
        },
        { timeout: 60_000 },
      ),
      page.locator('#mob-url-send-btn').click(),
    ]);

    expect(urlaubResp.status(), `Urlaub POST Status (kein 403, erwartet 200/201)`).not.toBe(403);
    expect(urlaubResp.ok(), `Urlaub POST 2xx`).toBeTruthy();
    expect([200, 201].includes(urlaubResp.status()), `Urlaub POST Status ${urlaubResp.status()}`).toBeTruthy();
    const urlaubJson = await urlaubResp.json().catch(() => ({}));
    expect(urlaubJson.success === true || urlaubJson.ok === true || urlaubJson.data != null, 'Urlaub-Antwort').toBeTruthy();

    const urlaubPost403 = networkEntries.filter(
      (e) => e.method === 'POST' && e.url.includes('/api/v1/urlaub') && e.status === 403,
    );
    expect(urlaubPost403, 'Kein POST /api/v1/urlaub mit 403').toEqual([]);

    // Harte Navigation ohne ?token=… — reload() würde die Invite-URL erneut laden (falscher Screen).
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#mob-nav-home')).toBeVisible({ timeout: 120_000 });

    const token2 = await page.evaluate(() => localStorage.getItem('cc_cockpit_access_token'));
    expect(token2).toBe(tokenForRights);

    const my2 = await fetchMyRightsBundle(request, token2);
    expect(my2.res.ok()).toBeTruthy();
    const ui2 = deriveShellUiAccess(my2.data);
    expect(ui2.isMitarbeiterAppOnlyShell).toBe(true);
    expect(my2.data?.modules?.includes('ccintern')).toBe(true);

    const postUsersAfter = networkEntries.filter((e) => isPostApiV1UsersCreate(e.url, e.method));
    expect(postUsersAfter, 'Nach Reload: kein POST /api/v1/users').toEqual([]);

    // Report schreiben
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    const forbidden403 = networkEntries.filter((e) => e.status === 403);
    const usersCalls = networkEntries.filter((e) => e.url.includes('/api/v1/users'));
    const urlaubCalls = networkEntries.filter((e) => e.url.includes('/urlaub'));
    const auftraegeCalls = filterByPath(networkEntries, '/ccintern/auftraege');

    const report = {
      generatedAt: new Date().toISOString(),
      summary: {
        totalRequests: networkEntries.length,
        count403: forbidden403.length,
        postApiV1UsersCreate: networkEntries.filter((e) => isPostApiV1UsersCreate(e.url, e.method)),
        urlaubPostStatus: urlaubResp.status(),
        isMitarbeiterAppOnlyShell: ui2.isMitarbeiterAppOnlyShell,
      },
      forbidden403,
      usersRelated: usersCalls,
      urlaubRelated: urlaubCalls,
      ccinternAuftraegeRelated: auftraegeCalls,
      allRequests: networkEntries,
      myRights: { afterLogin: my1.data, afterReload: my2.data },
      deriveShellUiAccess: { afterLogin: ui1, afterReload: ui2 },
    };
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');

    // Kurz-Konsole für CI/Agent
    console.log('\n── PFlicht-E2E Report (Auszug) ──');
    console.log(JSON.stringify(report.summary, null, 2));
    console.log(`Vollständiger Report: ${REPORT_PATH}`);
  });
});
