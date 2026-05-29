/**
 * Erfasst [KALENDER_FRONTEND_IST] aus Browser-Konsole (localhost:3000).
 * Voraussetzung: `npm run dev` in frontend/, Backend optional.
 */
import { chromium } from 'playwright';

const logs = [];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (msg) => {
  const t = msg.text();
  if (t.includes('[KALENDER_FRONTEND_IST]') || t.includes('[KALENDER FEED')) {
    logs.push(t);
  }
});
page.on('request', (req) => {
  const u = req.url();
  if (u.includes('/stammdaten/kalender')) {
    logs.push(`[NETWORK] ${req.method()} ${u}`);
  }
});

try {
  await page.goto('http://localhost:3000/', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => {
    const m = document.querySelector('meta[name="cc-api-base"]');
    if (m) m.setAttribute('content', 'http://localhost:5371');
  });
  const apiBase = await page.evaluate(() => {
    const m = document.querySelector('meta[name="cc-api-base"]');
    return m ? m.getAttribute('content') : null;
  });
  logs.push(`[META] cc-api-base=${apiBase}`);

  const email = page.locator('input[type="email"], input[name="email"], #login-email').first();
  if (await email.count()) {
    await email.fill('test@cc-cockpit.local');
    const pw = page.locator('input[type="password"], input[name="password"], #login-password').first();
    await pw.fill('admin2026!');
    await page.locator('button[type="submit"], button:has-text("Anmelden")').first().click();
    await page.waitForTimeout(4000);
  }

  const kalLink = page.locator('button[data-ccw-nav-key="kalender"], [data-ccw-nav-key="kalender"]').first();
  if (await kalLink.count()) {
    await kalLink.click({ timeout: 15000 });
    await page.waitForTimeout(6000);
  } else {
    logs.push('[WARN] Kalender-Nav nicht gefunden (evtl. nicht eingeloggt)');
  }
} catch (e) {
  logs.push(`[ERROR] ${e instanceof Error ? e.message : String(e)}`);
}

const bars = await page.locator('.ccw-cockpit-kal20-event, .ccw-cockpit-kal20-allday-chip, .cc-cal-ev').count();
logs.push(`[DOM] sichtbare Kalender-Balken/Chips (approx): ${bars}`);

console.log('--- kalender-frontend-ist-probe ---');
for (const line of logs) console.log(line);

await browser.close();
