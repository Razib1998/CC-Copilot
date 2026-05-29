/**
 * Phase B3: Geräte API — CRUD, Rechte, Envelope.
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
let noGeraeteToken = '';
let projektId = '';
const adminId = randomUUID();
const limitedId = randomUUID();
let firmaId = '';

async function httpJson(method, url, { headers = {}, jsonBody = null } = {}) {
  const res = await fetch(url, {
    method: String(method || 'GET').toUpperCase(),
    headers: {
      ...(jsonBody != null ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...headers,
    },
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
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
  sqlitePath = path.join(tmpdir(), `cc-geraete-${randomUUID()}.db`);
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

  firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: `Geräte-Firma ${firmaId.slice(0, 6)}`,
    kundennummer: '',
    altnummer: '',
    typ: 'kunde',
    intern_extern: 'extern',
    umsatzsteuer_id: '',
    strasse: '',
    plz: '',
    stadt: '',
    land: 'Deutschland',
    telefon: '',
    email: '',
    website: '',
    ansprechpartner_anrede: '',
    ansprechpartner_vorname: '',
    ansprechpartner_nachname: '',
    ansprechpartner_email: '',
    ansprechpartner_telefon: '',
    interne_notiz: '',
    erweiterung_json: null,
  });

  projektId = randomUUID();
  await store.insertProject({ id: projektId, name: 'Geräte-Projekt', kundenId: null });

  await store.insertUser({
    id: adminId,
    email: `ger-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Ger Admin',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(adminId, firmaId);

  await store.insertUser({
    id: limitedId,
    email: `ger-lim-${limitedId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Ohne Geräte',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: limitedId,
    globalRole: 'INTERN',
    modules: ['cockpit'],
    rights: {
      cockpit: {
        benutzer: { sehen: true },
      },
    },
  });
  await store.updateUserCompany(limitedId, firmaId);

  adminToken = signAccessToken({
    sub: adminId,
    email: `ger-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
  });
  noGeraeteToken = signAccessToken({
    sub: limitedId,
    email: `ger-lim-${limitedId.slice(0, 8)}@cc-cockpit.local`,
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

test('Geräte CRUD + Envelope', async () => {
  const base = new URL('/api/v1/geraete', serverOrigin).toString();
  const headers = {
    authorization: `Bearer ${adminToken}`,
    'x-project-id': projektId,
  };

  const createRes = await httpJson('POST', base, {
    headers,
    jsonBody: {
      typ: 'Plotter',
      seriennummer: 'SN-001',
      status: 'aktiv',
      project_id: projektId,
    },
  });
  assert.equal(createRes.res.status, 201);
  assert.equal(createRes.body?.success, true);
  assert.ok(createRes.body?.data?.item?.id);
  const gid = String(createRes.body.data.item.id);

  const listRes = await httpJson('GET', `${base}?firma_id=${encodeURIComponent(firmaId)}`, { headers });
  assert.equal(listRes.res.status, 200);
  assert.equal(listRes.body?.success, true);
  assert.ok(Array.isArray(listRes.body?.data?.items));
  assert.ok(listRes.body.data.items.some((x) => x && String(x.id) === gid));

  const getRes = await httpJson('GET', `${base}/${gid}`, {
    headers,
  });
  assert.equal(getRes.res.status, 200);
  assert.equal(getRes.body?.data?.item?.seriennummer, 'SN-001');

  const patchRes = await httpJson('PATCH', `${base}/${gid}`, {
    headers,
    jsonBody: { status: 'defekt', notiz: 'Test' },
  });
  assert.equal(patchRes.res.status, 200);
  assert.equal(patchRes.body?.data?.item?.status, 'defekt');

  const dupRes = await httpJson('POST', base, {
    headers,
    jsonBody: { typ: 'Zwei', seriennummer: 'SN-001' },
  });
  assert.equal(dupRes.res.status, 409);

  const delRes = await httpJson('DELETE', `${base}/${gid}`, { headers });
  assert.equal(delRes.res.status, 200);
  assert.equal(delRes.body?.success, true);

  const get404 = await httpJson('GET', `${base}/${gid}`, { headers });
  assert.equal(get404.res.status, 404);
});

test('Geräte GET ohne Recht → 403', async () => {
  const url = new URL(`/api/v1/geraete?firma_id=${encodeURIComponent(firmaId)}`, serverOrigin).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: {
      authorization: `Bearer ${noGeraeteToken}`,
      'x-project-id': projektId,
    },
  });
  assert.equal(res.status, 403);
  assert.equal(body?.success, false);
  assert.equal(body?.error?.code, 'FORBIDDEN');
  assert.equal(body?.error?.message, 'Kein Zugriff');
});
