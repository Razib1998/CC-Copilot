/**
 * Phase B4: GET /api/v1/fusa/quartale — Quartale, Jahr- und Projektfilter, Rechte, Envelope.
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
let cockpitOnlyToken = '';
const adminId = randomUUID();
const fusaOnlyId = randomUUID();
const cockpitOnlyId = randomUUID();

let projectIdA = '';
let projectIdB = '';
let auftragIdA = '';
let auftragIdB = '';

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
  sqlitePath = path.join(tmpdir(), `cc-fusa-quartale-${randomUUID()}.db`);
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
    email: `qu-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Quartale Admin',
    globalRole: 'SUPER_ADMIN',
  });

  await store.insertUser({
    id: fusaOnlyId,
    email: `qu-fusa-${fusaOnlyId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Quartale Nur FUSA',
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

  await store.insertUser({
    id: cockpitOnlyId,
    email: `qu-cp-${cockpitOnlyId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Quartale Nur Cockpit',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: cockpitOnlyId,
    globalRole: 'INTERN',
    modules: ['cockpit'],
    rights: {
      cockpit: {
        benutzer: { sehen: true },
      },
    },
  });

  adminToken = signAccessToken({
    sub: adminId,
    email: `qu-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
  });
  fusaOnlyToken = signAccessToken({
    sub: fusaOnlyId,
    email: `qu-fusa-${fusaOnlyId.slice(0, 8)}@cc-cockpit.local`,
  });
  cockpitOnlyToken = signAccessToken({
    sub: cockpitOnlyId,
    email: `qu-cp-${cockpitOnlyId.slice(0, 8)}@cc-cockpit.local`,
  });

  projectIdA = randomUUID();
  projectIdB = randomUUID();
  await store.insertProject({ id: projectIdA, name: 'Quartale Projekt A', kundenId: null });
  await store.insertProject({ id: projectIdB, name: 'Quartale Projekt B', kundenId: null });

  auftragIdA = randomUUID();
  auftragIdB = randomUUID();
  await store.insertAuftrag({
    id: auftragIdA,
    title: 'QA',
    projectId: projectIdA,
    status: 'aktiv',
    termin: null,
    terminEnde: null,
    fusaOriginalId: null,
    fusaKundeId: null,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });
  await store.insertAuftrag({
    id: auftragIdB,
    title: 'QB',
    projectId: projectIdB,
    status: 'aktiv',
    termin: null,
    terminEnde: null,
    fusaOriginalId: null,
    fusaKundeId: null,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });

  await store.insertFusaRechnungRow({
    id: randomUUID(),
    auftrag_id: auftragIdA,
    rechnungsdatum: '2026-02-15',
    brutto: 1000,
    netto: null,
    von: null,
    bis: null,
  });
  await store.insertFusaRechnungRow({
    id: randomUUID(),
    auftrag_id: auftragIdB,
    rechnungsdatum: '2026-05-10',
    brutto: 2000,
    netto: null,
    von: null,
    bis: null,
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

function envelopeQuartale(body) {
  assert.equal(body?.success, true);
  assert.ok(typeof body?.data?.jahr === 'number');
  assert.ok(Array.isArray(body?.data?.quartale));
  assert.equal(body.data.quartale.length, 4);
  const labels = body.data.quartale.map((/** @type {{ quartal: string }} */ q) => q.quartal);
  assert.deepEqual(labels, ['Q1', 'Q2', 'Q3', 'Q4']);
  for (const q of body.data.quartale) {
    assert.ok(typeof q.auftraege === 'number');
    assert.ok(typeof q.umsatz === 'number');
    assert.ok(typeof q.durchschnitt === 'number');
  }
}

test('GET /api/v1/fusa/quartale — Superadmin: vier Quartale, Zahlen aus Rechnungen 2026', async () => {
  const url = new URL('/api/v1/fusa/quartale?jahr=2026', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${adminToken}` },
  });
  assert.equal(res.status, 200, JSON.stringify(body));
  envelopeQuartale(body);
  assert.equal(body.data.jahr, 2026);
  const q1 = body.data.quartale.find((/** @type {{ quartal: string }} */ x) => x.quartal === 'Q1');
  const q2 = body.data.quartale.find((/** @type {{ quartal: string }} */ x) => x.quartal === 'Q2');
  assert.ok(q1 && q1.auftraege >= 1 && q1.umsatz >= 1000);
  assert.ok(q2 && q2.auftraege >= 1 && q2.umsatz >= 2000);
});

test('GET /api/v1/fusa/quartale — Jahr 2025 ohne Daten: überall 0', async () => {
  const url = new URL('/api/v1/fusa/quartale?jahr=2025', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${fusaOnlyToken}` },
  });
  assert.equal(res.status, 200);
  envelopeQuartale(body);
  assert.equal(body.data.jahr, 2025);
  for (const q of body.data.quartale) {
    assert.equal(q.auftraege, 0);
    assert.equal(q.umsatz, 0);
    assert.equal(q.durchschnitt, 0);
  }
});

test('GET /api/v1/fusa/quartale — Filter project_id: nur Projekt A', async () => {
  const url = new URL(
    `/api/v1/fusa/quartale?jahr=2026&project_id=${encodeURIComponent(projectIdA)}`,
    serverOrigin,
  ).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${fusaOnlyToken}` },
  });
  assert.equal(res.status, 200);
  envelopeQuartale(body);
  const q1 = body.data.quartale.find((/** @type {{ quartal: string }} */ x) => x.quartal === 'Q1');
  const q2 = body.data.quartale.find((/** @type {{ quartal: string }} */ x) => x.quartal === 'Q2');
  assert.ok(q1 && q1.umsatz >= 1000 && q1.auftraege >= 1);
  assert.ok(q2 && q2.umsatz === 0 && q2.auftraege === 0);
});

test('GET /api/v1/fusa/quartale — 403 ohne FUSA-Modul', async () => {
  const url = new URL('/api/v1/fusa/quartale', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${cockpitOnlyToken}` },
  });
  assert.equal(res.status, 403);
  assert.equal(body?.success, false);
  assert.equal(body?.error?.code, 'FORBIDDEN');
  assert.equal(body?.error?.message, 'Kein Zugriff');
});

test('GET /api/v1/fusa/quartale — nur FUSA: OK', async () => {
  const url = new URL('/api/v1/fusa/quartale?jahr=2026', serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: { authorization: `Bearer ${fusaOnlyToken}` },
  });
  assert.equal(res.status, 200);
  envelopeQuartale(body);
});
