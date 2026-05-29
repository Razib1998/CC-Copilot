import { defineConfig } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Stufe 2 — Browser-E2E (App-only / „Okan“).
 *
 * Voraussetzungen:
 * - Backend: http://localhost:5371 (health)
 * - Frontend: http://localhost:3000 (Vite)
 * - E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD (Super-Admin oder Benutzer mit Recht Einladungen anlegen)
 */
export default defineConfig({
  testDir: path.join(__dirname, 'e2e'),
  fullyParallel: false,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 90_000 },
  reporter: [
    ['list'],
    ['json', { outputFile: path.join(__dirname, 'e2e-results', 'playwright-json-report.json') }],
  ],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    viewport: { width: 1280, height: 900 },
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
