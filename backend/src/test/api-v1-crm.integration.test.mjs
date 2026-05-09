/**
 * Phase B5: CRM API — Pipeline, Aktivitäten, Wiedervorlage, Rechte, Envelope.
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
let firmaId = '';
let kundeId = '';
let projektId = '';
let crmToken = '';
let noCrmToken = '';
const crmUserId = randomUUID();
const noCrmUserId = randomUUID();

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
  sqlitePath = path.join(tmpdir(), `cc-crm-${randomUUID()}.db`);
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
    name: `CRM-Mandant ${firmaId.slice(0, 6)}`,
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

  kundeId = randomUUID();
  await store.insertFirma({
    id: kundeId,
    name: `CRM-Kunde ${kundeId.slice(0, 6)}`,
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
  await store.insertProject({ id: projektId, name: 'CRM-Projekt', kundenId: null });

  await store.insertUser({
    id: crmUserId,
    email: `crm-u-${crmUserId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'CRM User',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: crmUserId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: {
      ccintern: {
        crm: { sehen: true, erstellen: true, bearbeiten: true, loeschen: true },
      },
    },
  });
  await store.updateUserCompany(crmUserId, firmaId);

  await store.insertUser({
    id: noCrmUserId,
    email: `crm-no-${noCrmUserId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'CC ohne CRM',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: noCrmUserId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: {
      ccintern: {
        kunden: { sehen: true },
      },
    },
  });
  await store.updateUserCompany(noCrmUserId, firmaId);

  crmToken = signAccessToken({
    sub: crmUserId,
    email: `crm-u-${crmUserId.slice(0, 8)}@cc-cockpit.local`,
  });
  noCrmToken = signAccessToken({
    sub: noCrmUserId,
    email: `crm-no-${noCrmUserId.slice(0, 8)}@cc-cockpit.local`,
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

const hdr = () => ({
  authorization: `Bearer ${crmToken}`,
  'x-project-id': projektId,
});

test('CRM Pipeline CRUD + Sortierung', async () => {
  const base = new URL('/api/v1/crm/pipeline', serverOrigin).toString();

  const p1 = await httpJson('POST', base, {
    headers: hdr(),
    jsonBody: { name: 'Zuerst', sort_order: 100 },
  });
  assert.equal(p1.res.status, 201, JSON.stringify(p1.body));
  assert.equal(p1.body?.success, true);
  const id1 = p1.body?.data?.item?.id;
  assert.ok(id1);

  const p2 = await httpJson('POST', base, {
    headers: hdr(),
    jsonBody: { name: 'Vorne', sort_order: 1 },
  });
  assert.equal(p2.res.status, 201);
  const id2 = p2.body?.data?.item?.id;

  const list = await httpJson('GET', `${base}?firma_id=${encodeURIComponent(firmaId)}`, { headers: hdr() });
  assert.equal(list.res.status, 200);
  assert.ok(Array.isArray(list.body?.data?.items));
  assert.ok(list.body.data.items.length >= 2);
  const names = list.body.data.items.map((/** @type {{ name: string }} */ x) => x.name);
  const iVorne = list.body.data.items.findIndex((/** @type {{ id: string }} */ x) => x.id === id2);
  const iSpaet = list.body.data.items.findIndex((/** @type {{ id: string }} */ x) => x.id === id1);
  assert.ok(iVorne >= 0 && iSpaet >= 0);
  assert.ok(iVorne < iSpaet, 'sort_order: kleinere Zahl zuerst');

  const patch = await httpJson('PATCH', `${base}/${id1}`, {
    headers: hdr(),
    jsonBody: { name: 'Umbenannt', sort_order: 0 },
  });
  assert.equal(patch.res.status, 200);
  assert.equal(patch.body?.data?.item?.name, 'Umbenannt');

  const del = await httpJson('DELETE', `${base}/${id2}`, { headers: hdr() });
  assert.equal(del.res.status, 200);
  assert.equal(del.body?.success, true);
});

test('CRM Aktivitäten POST + Filter kunde_id', async () => {
  const base = new URL('/api/v1/crm/aktivitaeten', serverOrigin).toString();
  const create = await httpJson('POST', base, {
    headers: hdr(),
    jsonBody: {
      kunde_id: kundeId,
      typ: 'notiz',
      text: 'Hallo CRM',
      datum: '2026-05-01',
    },
  });
  assert.equal(create.res.status, 201, JSON.stringify(create.body));
  assert.equal(create.body?.data?.item?.typ, 'notiz');

  const listAll = await httpJson('GET', `${base}?firma_id=${encodeURIComponent(firmaId)}`, { headers: hdr() });
  assert.equal(listAll.res.status, 200);
  assert.ok(listAll.body?.data?.items?.length >= 1);

  const listF = await httpJson(
    'GET',
    `${base}?firma_id=${encodeURIComponent(firmaId)}&kunde_id=${encodeURIComponent(kundeId)}`,
    { headers: hdr() },
  );
  assert.equal(listF.res.status, 200);
  assert.ok(listF.body?.data?.items?.every((/** @type {{ kunde_id: string }} */ x) => x.kunde_id === kundeId));
});

test('CRM Wiedervorlage POST + PATCH', async () => {
  const base = new URL('/api/v1/crm/wiedervorlage', serverOrigin).toString();
  const create = await httpJson('POST', base, {
    headers: hdr(),
    jsonBody: {
      kunde_id: kundeId,
      titel: 'Nachfassen',
      datum: '2026-06-15',
      status: 'offen',
    },
  });
  assert.equal(create.res.status, 201, JSON.stringify(create.body));
  const wid = create.body?.data?.item?.id;
  assert.ok(wid);

  const patch = await httpJson('PATCH', `${base}/${wid}`, {
    headers: hdr(),
    jsonBody: { status: 'erledigt' },
  });
  assert.equal(patch.res.status, 200);
  assert.equal(patch.body?.data?.item?.status, 'erledigt');
});

test('CRM GET ohne CRM-Recht → 403', async () => {
  const url = new URL(
    `/api/v1/crm/pipeline?firma_id=${encodeURIComponent(firmaId)}`,
    serverOrigin,
  ).toString();
  const { res, body } = await httpJson('GET', url, {
    headers: {
      authorization: `Bearer ${noCrmToken}`,
      'x-project-id': projektId,
    },
  });
  assert.equal(res.status, 403);
  assert.equal(body?.success, false);
  assert.equal(body?.error?.code, 'FORBIDDEN');
  assert.equal(body?.error?.message, 'Kein Zugriff');
});
