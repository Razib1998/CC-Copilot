/**
 * Prüft Kunde-oben / AU-unten in MA-App-Tabs (Home, Aufgaben, Fotos).
 * Voraussetzung: Frontend :3000, Backend erreichbar (Login).
 *
 *   node scripts/mob-kunde-au-order-probe.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const BASE = (process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const EMAIL = (process.env.E2E_SUPER_ADMIN_EMAIL || 'test@cc-cockpit.local').trim();
const PASSWORD = process.env.E2E_SUPER_ADMIN_PASSWORD || 'admin2026!';

/** @param {import('playwright').Page} page */
async function loginCockpit(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForSelector('#ccw-login-email', { timeout: 30_000 });
  await page.fill('#ccw-login-email', EMAIL);
  await page.fill('#ccw-login-pass', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForSelector('#cockpit-content', { timeout: 90_000 });
  await page.waitForTimeout(1500);
}

/** @param {import('playwright').Page} page */
async function openCcInternMitarbeiterApp(page) {
  const ccTab = page.locator('.ckp-mod-btn[data-module="ccintern"]');
  await ccTab.waitFor({ state: 'visible', timeout: 30_000 });
  await ccTab.click();
  await page.waitForTimeout(1200);
  const maNav = page.locator('#cockpit-sidebar [data-nav-key="cc_mitarbeiter_app"]');
  await maNav.waitFor({ state: 'visible', timeout: 90_000 });
  await maNav.click();
  await page.waitForSelector('#mob-shell', { timeout: 90_000 });
  await page.waitForTimeout(2000);
}

/**
 * @param {import('playwright').Page} page
 * @param {string} containerSel
 * @param {string} label
 */
async function checkCardOrder(page, containerSel, label) {
  const data = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { empty: true, cards: [] };
    const selectors = [
      '.mob-aufg-card',
      '.mob-lauft-card',
      '#mob-foto-auftrag-liste > div[style*="border-radius"]',
      '#mob-alle-auftraege > div[style*="cursor:pointer"]',
    ];
    const seen = new Set();
    const cards = [];
    selectors.forEach((q) => {
      root.querySelectorAll(q).forEach((el) => {
        if (seen.has(el)) return;
        seen.add(el);
        const kundeEl = el.querySelector('div[style*="font-weight:800"]');
        const auEl = kundeEl && kundeEl.nextElementSibling;
        if (!kundeEl || !auEl) return;
        const kunde = (kundeEl.textContent || '').trim().split('\n')[0].trim();
        const au = (auEl.textContent || '').trim().split('\n')[0].trim();
        if (!kunde && !au) return;
        const topIsAu = /^AU-\d{4}-\d+/i.test(kunde);
        cards.push({ kunde, au, ok: !topIsAu && /AU-\d{4}-\d+/i.test(au) });
      });
    });
    return { empty: cards.length === 0, cards };
  }, containerSel);

  if (data.empty) {
    return { ok: true, reason: `${label}: keine Karten (leer OK)`, samples: [] };
  }
  const bad = data.cards.filter((c) => !c.ok);
  if (bad.length) {
    return { ok: false, reason: `${label}: ${bad.length} Karte(n) vertauscht`, samples: data.cards.slice(0, 8) };
  }
  return { ok: true, reason: `${label}: ${data.cards.length} Karte(n) OK`, samples: data.cards.slice(0, 8) };
}

async function main() {
  const consoleErrors = [];
  const results = [];

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => {
    consoleErrors.push(String(err.message || err));
  });

  try {
    await loginCockpit(page);
    await openCcInternMitarbeiterApp(page);

    await page.evaluate(() => {
      const me = window.CURRENT_USER_ID || 'test-ma';
      window.MOB_MA_ID = me;
      window.AUFTRAEGE = window.AUFTRAEGE || [];
      if (!window.AUFTRAEGE.some((a) => a && a.auftragsnummer === 'AU-2026-002')) {
        window.AUFTRAEGE.push({
          id: 'probe-au-002',
          ccApiId: '00000000-0000-4000-8000-000000000002',
          auftragsnummer: 'AU-2026-002',
          kunde: 'TEST FIRMA',
          kundenname: 'TEST FIRMA',
          fz: 'B-CC 99',
          step: 'grafik',
          schritte: { grafik: { status: 'offen', maId: me, maIds: [me] } },
          zeiten: [],
          kommentare: [],
          archiv: false,
        });
      }
      window.INTERN_AUFGABEN = window.INTERN_AUFGABEN || [];
      const gid = 'probe-task-1';
      if (!window.INTERN_AUFGABEN.some((g) => g && g.id === gid)) {
        window.INTERN_AUFGABEN.push({
          id: gid,
          auftragId: 'probe-au-002',
          kunde: 'TEST FIRMA',
          fz: 'B-CC 99',
          schritt: 'grafik',
          status: 'offen',
          datum: new Date().toISOString().split('T')[0],
          maId: me,
          maIds: [me],
          checkliste: [],
        });
      }
      if (typeof window.mobRenderHome === 'function') window.mobRenderHome();
    });
    await page.waitForTimeout(500);

    results.push(await checkCardOrder(page, '#mob-auftraege', 'Home'));

    await page.locator('#mob-nav-aufgaben').click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      if (typeof window.mobRenderAlle === 'function') window.mobRenderAlle();
    });
    await page.waitForTimeout(400);
    results.push(await checkCardOrder(page, '#mob-tab-aufgaben', 'Aufgaben'));

    await page.locator('#mob-nav-fotos').click();
    await page.waitForTimeout(800);
    await page.evaluate(() => {
      if (typeof window.mobRenderFotos === 'function') window.mobRenderFotos();
    });
    await page.waitForTimeout(1500);
    results.push(await checkCardOrder(page, '#mob-tab-fotos', 'Fotos'));

    const textProbe = await page.evaluate(() => {
      const pick = (sel) => {
        const root = document.querySelector(sel);
        if (!root) return null;
        const k = root.querySelector('div[style*="font-weight:800"]');
        const a = k && k.nextElementSibling;
        return k && a
          ? { kunde: (k.textContent || '').trim(), au: (a.textContent || '').trim() }
          : null;
      };
      return {
        home: pick('#mob-auftraege .mob-aufg-card'),
        aufgaben: pick('#mob-alle-auftraege > div[style*="cursor:pointer"]'),
        fotos: pick('#mob-foto-auftrag-liste > div[style*="border-radius"]'),
        hasUndefined: [].some.call(
          document.querySelectorAll('#mob-shell *'),
          () => false,
        ),
      };
    });

    const undefinedHits = consoleErrors.filter(
      (t) => /undefined/i.test(t) && /kunde|auftrag|AU-/i.test(t),
    );
    const textOk =
      textProbe &&
      ['home', 'aufgaben', 'fotos'].every((k) => {
        const row = textProbe[k];
        if (!row) return false;
        return (
          row.kunde.includes('TEST FIRMA') &&
          row.au.includes('AU-2026-002') &&
          !/^AU-/.test(row.kunde.split('·')[0].trim())
        );
      });

    const report = {
      ok: results.every((r) => r.ok) && undefinedHits.length === 0 && textOk,
      base: BASE,
      email: EMAIL,
      results,
      textProbe,
      consoleErrorCount: consoleErrors.length,
      consoleErrorsSample: consoleErrors.slice(0, 15),
      undefinedKundeAu: undefinedHits,
    };

    const outPath = path.join(ROOT, 'e2e-results', 'mob-kunde-au-order-probe.json');
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

    let shotPath = '';
    if (!report.ok) {
      shotPath = path.join(ROOT, 'e2e-results', 'mob-kunde-au-order-probe.png');
      await page.screenshot({ path: shotPath, fullPage: true });
      report.screenshot = shotPath;
      fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
    }

    console.log(JSON.stringify(report, null, 2));
    process.exit(report.ok ? 0 : 1);
  } catch (e) {
    const errPath = path.join(ROOT, 'e2e-results', 'mob-kunde-au-order-probe-error.png');
    fs.mkdirSync(path.dirname(errPath), { recursive: true });
    await page.screenshot({ path: errPath, fullPage: true }).catch(() => {});
    console.error('[mob-kunde-au-order-probe] FEHLER:', e instanceof Error ? e.message : e);
    console.error('Screenshot:', errPath);
    process.exit(2);
  } finally {
    await browser.close();
  }
}

main();
