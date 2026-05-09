/**
 * Phase B1: GET /api/v1/logs — Filtern, Pagination, Rechte (Envelope).
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
let superToken = '';
let noLogsToken = '';
const superUserId = randomUUID();
const noLogsUserId = randomUUID();

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
  sqlitePath = path.join(tmpdir(), `cc-audit-logs-api-${randomUUID()}.db`);
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
    id: superUserId,
    email: `logs-super-${superUserId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Logs Super',
    globalRole: 'SUPER_ADMIN',
  });

  await store.insertUser({
    id: noLogsUserId,
    email: `logs-norights-${noLogsUserId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Logs Ohne Recht',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: noLogsUserId,
    globalRole: 'INTERN',
    modules: ['cockpit'],
    rights: {
      cockpit: {
        benutzer: { sehen: true },
      },
    },
  });

  for (let i = 0; i < 25; i += 1) {
    const modul = i % 3 === 0 ? 'cockpit' : 'fusa';
    const ts = `2026-03-${String((i % 28) + 1).padStart(2, '0')}T${String(i).padStart(2, '0')}:00:00.000Z`;
    store.insertAuditLog({
      id: randomUUID(),
      ts,
      userId: superUserId,
      modul,
      action: 'test.write',
      resourceType: 'unit',
      resourceId: `res-${i}`,
      projectId: null,
      payloadJson: JSON.stringify({ idx: i }),
    });
  }

  superToken = signAccessToken({
    sub: superUserId,
    email: `logs-super-${superUserId.slice(0, 8)}@cc-cockpit.local`,
  });
  noLogsToken = signAccessToken({
    sub: noLogsUserId,
    email: `logs-norights-${noLogsUserId.slice(0, 8)}@cc-cockpit.local`,
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

test('GET /api/v1/logs — Erfolg (Superadmin, Envelope)', async () => {
  const url = new URL('/api/v1/logs', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${superToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(body?.success, true);
  assert.ok(Array.isArray(body?.data?.items));
  assert.equal(body?.data?.page, 1);
  assert.equal(body?.data?.limit, 50);
  assert.equal(body?.data?.total, 25);
});

test('GET /api/v1/logs?modul=fusa — nur FUSA-Einträge', async () => {
  const url = new URL('/api/v1/logs?modul=fusa', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${superToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(body?.success, true);
  const items = body?.data?.items || [];
  assert.ok(items.every((row) => row && String(row.modul) === 'fusa'));
  assert.equal(items.length, body?.data?.total);
});

test('GET /api/v1/logs?page=2&limit=10 — Pagination', async () => {
  const url = new URL('/api/v1/logs?page=2&limit=10', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${superToken}` },
  });
  assert.equal(res.status, 200);
  assert.equal(body?.success, true);
  assert.equal(body?.data?.page, 2);
  assert.equal(body?.data?.limit, 10);
  assert.equal(body?.data?.total, 25);
  assert.equal(body?.data?.items?.length, 10);
});

test('GET /api/v1/logs — 403 ohne Logs-Recht', async () => {
  const url = new URL('/api/v1/logs', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${noLogsToken}` },
  });
  assert.equal(res.status, 403);
  assert.equal(body?.success, false);
  assert.equal(body?.error?.code, 'FORBIDDEN');
  assert.equal(body?.error?.message, 'Kein Zugriff auf Logs');
});
