/**
 * Phase B2: Dashboard-Endpunkte — Envelope, stats, Rechte, keine Passwort-Lecks.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toImport = (rel) => pathToFileURL(path.join(__dirname, rel)).href;

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) delete process.env[k];
  }
}

/** @type {import('http').Server|null} */
let server = null;
let serverOrigin = '';
let sqlitePath = '';

/** @type {any} */
let store = null;
let adminToken = '';
let fusaOnlyToken = '';
const adminId = randomUUID();
const fusaOnlyId = randomUUID();

async function httpJson(method, url, { headers = {} } = {}) {
  const res = await fetch(url, {
    method: String(method || 'GET').toUpperCase(),
    headers,
  });
  const text = await res.text();
  /** @type {any} */
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 200) };
    }
  }
  return { res, body };
}

before(async () => {
  clearMysqlEnvForDeterministicSqlite();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }
  sqlitePath = path.join(tmpdir(), `cc-dash-api-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const [{ openDatabase }, { signAccessToken }, { createApiV1Router }, { hashPassword }] = await Promise.all([
    import(toImport('../db/database.js')),
    import(toImport('../auth/jwt.js')),
    import(toImport('../routes/api-v1.js')),
    import(toImport('../auth/password.js')),
  ]);

  store = await openDatabase();

  await store.insertUser({
    id: adminId,
    email: `dash-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Dash Admin',
    globalRole: 'SUPER_ADMIN',
  });

  await store.insertUser({
    id: fusaOnlyId,
    email: `dash-fusa-${fusaOnlyId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Dash Nur FUSA',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: fusaOnlyId,
    globalRole: 'INTERN',
    modules: ['fusa'],
    rights: {
      fusa: {
        auftraege: { sehen: true },
      },
    },
  });

  adminToken = signAccessToken({
    sub: adminId,
    email: `dash-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
  });
  fusaOnlyToken = signAccessToken({
    sub: fusaOnlyId,
    email: `dash-fusa-${fusaOnlyId.slice(0, 8)}@cc-cockpit.local`,
  });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', createApiV1Router(store));

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  serverOrigin = `http://127.0.0.1:${addr.port}`;
});

after(async () => {
  await new Promise((resolve) => {
    if (!server) return resolve();
    server.close(() => resolve());
  });
  try {
    if (sqlitePath) fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }
});

function statsShape(body) {
  assert.equal(body?.success, true);
  assert.ok(body?.data?.stats && typeof body.data.stats === 'object');
  const raw = JSON.stringify(body);
  assert.ok(!raw.toLowerCase().includes('password'));
  assert.ok(!raw.includes('password_hash'));
}

test('GET /api/v1/*/dashboard — Superadmin: drei Endpoints, stats', async () => {
  for (const p of ['/cockpit/dashboard', '/fusa/dashboard', '/ccintern/dashboard']) {
    const url = new URL(`/api/v1${p}`, serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    statsShape(body);
  }
});

test('GET /api/v1/cockpit/dashboard — 403 ohne Cockpit-Modul', async () => {
  const url = new URL('/api/v1/cockpit/dashboard', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${fusaOnlyToken}` },
  });
  assert.equal(res.status, 403);
  assert.equal(body?.success, false);
  assert.equal(body?.error?.code, 'FORBIDDEN');
  assert.equal(body?.error?.message, 'Kein Zugriff');
});

test('GET /api/v1/fusa/dashboard — nur FUSA: OK', async () => {
  const url = new URL('/api/v1/fusa/dashboard', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${fusaOnlyToken}` },
  });
  assert.equal(res.status, 200);
  statsShape(body);
});
