/**
 * Projekt-Isolation unter /api/v1: `requireApiProjectContext` + `getProjectAccessByUserAndProject`
 * an ausgewählten Endpunkten.
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
import { PROJECT_CONTEXT_REQUIRED_MESSAGE } from '../middleware/api-v1-project-context.js';

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
/** @type {string} */
let sqlitePath = '';
/** @type {any} */
let iso = null;

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
  sqlitePath = path.join(tmpdir(), `cc-cockpit-proj-iso-${randomUUID()}.db`);
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

  const store = await openDatabase();
  const firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: `Iso Test ${firmaId.slice(0, 8)}`,
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

  const userWithAccess = randomUUID();
  const userNoAccess = randomUUID();
  await store.insertUser({
    id: userWithAccess,
    email: `iso-ok-${userWithAccess.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Iso Ok',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userWithAccess, firmaId);
  await store.insertUser({
    id: userNoAccess,
    email: `iso-no-${userNoAccess.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Iso No',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userNoAccess, firmaId);

  const projectA = randomUUID();
  const projectB = randomUUID();
  await store.insertProject({ id: projectA, name: 'Projekt A', kundenId: null });
  await store.insertProject({ id: projectB, name: 'Projekt B', kundenId: null });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId: userWithAccess,
    projectId: projectA,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });

  const fusaAuftragId = randomUUID();
  await store.insertAuftrag({
    id: fusaAuftragId,
    title: 'Iso FUSA',
    projectId: projectA,
    status: 'aktiv',
    termin: '2026-04-10T09:00:00.000Z',
    terminEnde: '2026-04-10T17:00:00.000Z',
    fusaOriginalId: null,
    fusaKundeId: firmaId,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });

  const fusaAuftragBId = randomUUID();
  await store.insertAuftrag({
    id: fusaAuftragBId,
    title: 'Iso FUSA B',
    projectId: projectB,
    status: 'aktiv',
    termin: '2026-04-11T09:00:00.000Z',
    terminEnde: '2026-04-11T17:00:00.000Z',
    fusaOriginalId: null,
    fusaKundeId: firmaId,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });

  const fusaDocAGet = randomUUID();
  const fusaDocADelete = randomUUID();
  const fusaDocB = randomUUID();
  await store.insertFusaDokument({
    id: fusaDocAGet,
    auftrag_id: fusaAuftragId,
    fahrzeug_id: null,
    name: 'a-sehen.pdf',
    typ: 'application/pdf',
    url: 'https://cc-cockpit.local/d/a1',
    groesse: 12,
    hochgeladen_von: userWithAccess,
    project_id: projectA,
  });
  await store.insertFusaDokument({
    id: fusaDocADelete,
    auftrag_id: fusaAuftragId,
    fahrzeug_id: null,
    name: 'a-loeschen.pdf',
    typ: 'application/pdf',
    url: 'https://cc-cockpit.local/d/a2',
    groesse: 10,
    hochgeladen_von: userWithAccess,
    project_id: projectA,
  });
  await store.insertFusaDokument({
    id: fusaDocB,
    auftrag_id: fusaAuftragBId,
    fahrzeug_id: null,
    name: 'b-fremd.pdf',
    typ: 'application/pdf',
    url: 'https://cc-cockpit.local/d/b',
    groesse: 8,
    hochgeladen_von: userWithAccess,
    project_id: projectB,
  });

  const tokenOk = signAccessToken({ sub: userWithAccess, email: 'iso-ok@local' });
  const tokenNo = signAccessToken({ sub: userNoAccess, email: 'iso-no@local' });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', createApiV1Router(store));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  serverOrigin = `http://127.0.0.1:${addr.port}`;

  iso = {
    projectA,
    projectB,
    fusaAuftragId,
    fusaAuftragBId,
    fusaDocAGet,
    fusaDocADelete,
    fusaDocB,
    tokenOk,
    tokenNo,
  };
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

test('Projekt-Isolation /api/v1', async (t) => {
  const ctx = iso;
  assert.ok(ctx?.projectA);

  await t.test('GET /api/v1/kunden ohne x-project-id → 400 PROJECT_CONTEXT_REQUIRED', async () => {
    const url = new URL('/api/v1/kunden', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: { authorization: `Bearer ${ctx.tokenOk}` },
    });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'PROJECT_CONTEXT_REQUIRED');
    assert.equal(body?.error?.message, PROJECT_CONTEXT_REQUIRED_MESSAGE);
  });

  await t.test('GET /api/v1/projects ohne x-project-id → 200 (Whitelist A3.6)', async () => {
    const url = new URL('/api/v1/projects', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: { authorization: `Bearer ${ctx.tokenOk}` },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.projects));
    assert.equal(body?.projects, undefined);
  });

  await t.test('GET /api/v1/auth/my-rights ohne x-project-id → 200 (Whitelist)', async () => {
    const url = new URL('/api/v1/auth/my-rights', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: { authorization: `Bearer ${ctx.tokenOk}` },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(typeof body?.data?.user_id === 'string' && body.data.user_id.length > 0, 'data.user_id');
  });

  await t.test('GET /ccintern/angebote: ohne project_access → 403', async () => {
    const url = new URL('/api/v1/ccintern/angebote', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenNo}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 403, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'PROJECT_FORBIDDEN');
  });

  await t.test('GET /ccintern/angebote: mit project_access → 200', async () => {
    const url = new URL('/api/v1/ccintern/angebote', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.angebote));
  });

  await t.test('POST /fusa/auftraege/:id/freigeben: ohne project_access → 403', async () => {
    const url = new URL(
      `/api/v1/fusa/auftraege/${encodeURIComponent(ctx.fusaAuftragId)}/freigeben`,
      serverOrigin,
    ).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenNo}`,
        'x-project-id': ctx.projectA,
      },
      jsonBody: {},
    });
    assert.equal(res.status, 403, JSON.stringify(body));
    assert.equal(body?.error?.code, 'PROJECT_FORBIDDEN');
  });

  await t.test('GET fusa/auftraege/verfuegbare-fahrzeuge: fremdes project_id → 403', async () => {
    const u = new URL('/api/v1/fusa/auftraege/verfuegbare-fahrzeuge', serverOrigin);
    u.searchParams.set('project_id', ctx.projectA);
    u.searchParams.set('startdatum', '2026-04-01');
    u.searchParams.set('enddatum', '2026-04-30');
    u.searchParams.set('fahrzeugtyp', 'Transporter');
    u.searchParams.set('depot', 'München');
    const { res, body } = await httpJson('GET', u.toString(), {
      headers: {
        authorization: `Bearer ${ctx.tokenNo}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 403, JSON.stringify(body));
    assert.equal(body?.error?.code, 'PROJECT_FORBIDDEN');
  });

  await t.test('GET /fusa/dokumente: mit project_access (Projekt A) → 200', async () => {
    const u = new URL('/api/v1/fusa/dokumente', serverOrigin);
    u.searchParams.set('project_id', ctx.projectA);
    const { res, body } = await httpJson('GET', u.toString(), {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.dokumente));
  });

  await t.test('GET /fusa/dokumente: ohne project_access (Projekt B) → 403', async () => {
    const u = new URL('/api/v1/fusa/dokumente', serverOrigin);
    u.searchParams.set('project_id', ctx.projectB);
    const { res, body } = await httpJson('GET', u.toString(), {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectB,
      },
    });
    assert.equal(res.status, 403, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'PROJECT_FORBIDDEN');
  });

  await t.test('GET /fusa/dokumente/:id: Dokument in Fremdprojekt B → 404', async () => {
    const url = new URL(`/api/v1/fusa/dokumente/${encodeURIComponent(ctx.fusaDocB)}`, serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectB,
      },
    });
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.error?.code, 'NOT_FOUND');
  });

  await t.test('GET /fusa/dokumente/:id: eigenes Projekt A → 200', async () => {
    const url = new URL(`/api/v1/fusa/dokumente/${encodeURIComponent(ctx.fusaDocAGet)}`, serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(body?.data?.dokument, 'data.dokument');
    assert.equal(String(body?.data?.dokument?.id || ''), ctx.fusaDocAGet);
  });

  await t.test('POST /fusa/dokumente: mit project_access (Projekt A) → 201 + data.dokument', async () => {
    const url = new URL('/api/v1/fusa/dokumente', serverOrigin).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
      jsonBody: {
        project_id: ctx.projectA,
        auftrag_id: ctx.fusaAuftragId,
        name: 'envelope-test.pdf',
        typ: 'application/pdf',
        url: 'https://cc-cockpit.local/d/envelope-ok',
        groesse: 2,
      },
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(body?.data?.dokument, 'data.dokument');
    assert.equal(String(body.data.dokument.project_id || ''), ctx.projectA);
  });

  await t.test('DELETE /fusa/dokumente/:id: Fremdprojekt B → 404', async () => {
    const url = new URL(`/api/v1/fusa/dokumente/${encodeURIComponent(ctx.fusaDocB)}`, serverOrigin).toString();
    const { res, body } = await httpJson('DELETE', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectB,
      },
    });
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.error?.code, 'NOT_FOUND');
  });

  await t.test('DELETE /fusa/dokumente/:id: eigenes Projekt A → 200', async () => {
    const url = new URL(
      `/api/v1/fusa/dokumente/${encodeURIComponent(ctx.fusaDocADelete)}`,
      serverOrigin,
    ).toString();
    const { res, body } = await httpJson('DELETE', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.data?.deleted, true);
  });

  await t.test('POST /fusa/dokumente: kein project_access (Projekt B) → 403', async () => {
    const url = new URL('/api/v1/fusa/dokumente', serverOrigin).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectB,
      },
      jsonBody: {
        project_id: ctx.projectB,
        auftrag_id: ctx.fusaAuftragBId,
        name: 'n.pdf',
        typ: 'application/pdf',
        url: 'https://cc-cockpit.local/d/new',
        groesse: 1,
      },
    });
    assert.equal(res.status, 403, JSON.stringify(body));
    assert.equal(body?.error?.code, 'PROJECT_FORBIDDEN');
  });

  await t.test('GET /api/v1/projects/:id unbekannt → 404 Envelope (A3.6)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const url = new URL(`/api/v1/projects/${fakeId}`, serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'NOT_FOUND');
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/fusa/fahrzeuge: mit x-project-id → 200 Envelope (A3.4)', async () => {
    const url = new URL('/api/v1/fusa/fahrzeuge', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${ctx.tokenOk}`,
        'x-project-id': ctx.projectA,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.fahrzeuge));
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
  });
});
