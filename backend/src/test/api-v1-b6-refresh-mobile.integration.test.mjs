/**
 * Phase B6: Refresh-Token (`POST /api/v1/auth/refresh`) + CC-Intern Mitarbeiter-API `/api/v1/ccintern/me/*`.
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
let uploadsRoot = '';

/** @type {any} */
let store = null;
let firmaId = '';
let projectId = '';
const workerId = randomUUID();
const otherId = randomUUID();
const noMaId = randomUUID();
let ccAuftragWorker = '';
let ccAuftragOther = '';
let ccAuftragWorkflowTeam = '';
let workerEmail = '';
let workerRefresh = '';

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
  sqlitePath = path.join(tmpdir(), `cc-b6-${randomUUID()}.db`);
  uploadsRoot = path.join(tmpdir(), `cc-b6-uploads-${randomUUID()}`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  process.env.UPLOADS_ROOT = uploadsRoot;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }
  try {
    fs.mkdirSync(uploadsRoot, { recursive: true });
  } catch {
    /* ignore */
  }

  const [{ openDatabase }, { createApiV1Router }, { createAuthRouter }, { hashPassword }] = await Promise.all([
    import(toImport('../db/database.js')),
    import(toImport('../routes/api-v1.js')),
    import(toImport('../routes/auth.js')),
    import(toImport('../auth/password.js')),
  ]);

  store = await openDatabase();

  firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: `B6 Firma ${firmaId.slice(0, 6)}`,
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

  projectId = randomUUID();
  await store.insertProject({ id: projectId, name: 'B6-Projekt', kundenId: null });

  workerEmail = `b6-w-${workerId.slice(0, 8)}@cc-cockpit.local`;
  await store.insertUser({
    id: workerId,
    email: workerEmail,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'B6 Worker',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: workerId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: {
      ccintern: {
        mitarbeiterapp: { sehen: true, erstellen: true },
      },
    },
  });
  await store.updateUserCompany(workerId, firmaId);

  await store.insertUser({
    id: otherId,
    email: `b6-o-${otherId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'B6 Other',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: otherId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: {
      ccintern: {
        mitarbeiterapp: { sehen: true, erstellen: true },
      },
    },
  });
  await store.updateUserCompany(otherId, firmaId);

  await store.insertUser({
    id: noMaId,
    email: `b6-n-${noMaId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'B6 No MA',
    globalRole: 'INTERN',
  });
  store.replaceUserAccessBundle({
    userId: noMaId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: {
      ccintern: {
        kunden: { sehen: true },
      },
    },
  });
  await store.updateUserCompany(noMaId, firmaId);

  await store.insertProjectAccess({
    id: randomUUID(),
    userId: workerId,
    projectId,
    role: 'member',
    canViewPrices: false,
    canEdit: false,
    canCreateAuftraege: false,
  });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId: otherId,
    projectId,
    role: 'member',
    canViewPrices: false,
    canEdit: false,
    canCreateAuftraege: false,
  });

  ccAuftragWorker = randomUUID();
  ccAuftragOther = randomUUID();
  await store.insertCcInternAuftrag({
    id: ccAuftragWorker,
    auftragsnummer: 'AU-2026-B6-W',
    kunde: 'Kunde W',
    status: 'aktiv',
    schritt: 'prod',
    prioritaet: 'normal',
    lieferdatum: null,
    montage_datum: null,
    bemerkung: null,
    fusa_auftrag_id: null,
    quelle: 'manuell',
    erstellt_von: workerId,
    firma_id: firmaId,
  });
  await store.insertCcInternAuftrag({
    id: ccAuftragOther,
    auftragsnummer: 'AU-2026-B6-O',
    kunde: 'Kunde O',
    status: 'aktiv',
    schritt: 'prod',
    prioritaet: 'normal',
    lieferdatum: null,
    montage_datum: null,
    bemerkung: null,
    fusa_auftrag_id: null,
    quelle: 'manuell',
    erstellt_von: otherId,
    firma_id: firmaId,
  });

  await store.insertProduktionAuftrag({
    auftrag_id: ccAuftragWorker,
    schritt: 'bau',
    fortschritt: 10,
    verantwortlich: workerId,
    notiz: null,
    gestartet_am: null,
    abgeschlossen_am: null,
    firma_id: firmaId,
  });
  await store.insertProduktionAuftrag({
    auftrag_id: ccAuftragOther,
    schritt: 'bau',
    fortschritt: 20,
    verantwortlich: otherId,
    notiz: null,
    gestartet_am: null,
    abgeschlossen_am: null,
    firma_id: firmaId,
  });

  ccAuftragWorkflowTeam = randomUUID();
  const bemWorkflow = JSON.stringify({
    __ccintern_v1: 1,
    payload: {
      step: 'druck',
      schritte: {
        druck: { maIds: [workerId], status: 'in_bearbeitung' },
      },
    },
  });
  await store.insertCcInternAuftrag({
    id: ccAuftragWorkflowTeam,
    auftragsnummer: 'AU-2026-B6-WF',
    kunde: 'Kunde Workflow',
    status: 'aktiv',
    schritt: 'druck',
    prioritaet: 'normal',
    lieferdatum: null,
    montage_datum: null,
    bemerkung: bemWorkflow,
    fusa_auftrag_id: null,
    quelle: 'manuell',
    erstellt_von: workerId,
    firma_id: firmaId,
  });
  await store.insertProduktionAuftrag({
    auftrag_id: ccAuftragWorkflowTeam,
    schritt: 'druck',
    fortschritt: 50,
    verantwortlich: otherId,
    notiz: null,
    gestartet_am: null,
    abgeschlossen_am: null,
    firma_id: firmaId,
  });

  const aufgabeOther = randomUUID();
  await store.insertAufgabe({
    id: randomUUID(),
    titel: 'Nur Other',
    beschreibung: null,
    zugewiesen_an: otherId,
    auftrag_id: ccAuftragOther,
    faellig_am: null,
    status: 'offen',
    prioritaet: 'normal',
    firma_id: firmaId,
    erstellt_von: otherId,
  });
  await store.insertAufgabe({
    id: aufgabeOther,
    titel: 'Worker Task',
    beschreibung: null,
    zugewiesen_an: workerId,
    auftrag_id: ccAuftragWorker,
    faellig_am: null,
    status: 'offen',
    prioritaet: 'normal',
    firma_id: firmaId,
    erstellt_von: workerId,
  });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use('/auth', createAuthRouter(store));
  app.use('/api/v1', createApiV1Router(store));

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  serverOrigin = `http://127.0.0.1:${addr.port}`;

  const login = await httpJson('POST', new URL('/auth/login', serverOrigin).toString(), {
    jsonBody: { email: workerEmail, password: 'TestLocal!2026' },
  });
  assert.equal(login.res.status, 200, JSON.stringify(login.body));
  workerRefresh = login.body?.refresh_token;
  assert.ok(typeof workerRefresh === 'string' && workerRefresh.length > 10, 'refresh_token vom Login');
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
  try {
    if (uploadsRoot) fs.rmSync(uploadsRoot, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
});

test('POST /api/v1/auth/refresh — ungültiger Token → 401 INVALID_REFRESH_TOKEN', async () => {
  const url = new URL('/api/v1/auth/refresh', serverOrigin).toString();
  const bad = await httpJson('POST', url, {
    jsonBody: { refresh_token: 'definitely-not-a-valid-token' },
  });
  assert.equal(bad.res.status, 401);
  assert.equal(bad.body?.success, false);
  assert.equal(bad.body?.error?.code, 'INVALID_REFRESH_TOKEN');
});

test('POST /api/v1/auth/refresh — rotiert und alter Token ungültig', async () => {
  const url = new URL('/api/v1/auth/refresh', serverOrigin).toString();
  const first = await httpJson('POST', url, { jsonBody: { refresh_token: workerRefresh } });
  assert.equal(first.res.status, 200, JSON.stringify(first.body));
  assert.equal(first.body?.success, true);
  assert.ok(first.body?.data?.access_token, 'access_token');
  assert.ok(first.body?.data?.refresh_token, 'neuer refresh_token');
  assert.equal(typeof first.body?.data?.expires_in, 'number');

  const replay = await httpJson('POST', url, { jsonBody: { refresh_token: workerRefresh } });
  assert.equal(replay.res.status, 401);
  assert.equal(replay.body?.error?.code, 'INVALID_REFRESH_TOKEN');

  workerRefresh = first.body.data.refresh_token;
});

test('GET /api/v1/ccintern/me/auftraege — verantwortlich oder Workflow am Schritt', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const wTok = signAccessToken({ sub: workerId, email: workerEmail });
  const oTok = signAccessToken({ sub: otherId, email: `b6-o-${otherId.slice(0, 8)}@cc-cockpit.local` });

  const wUrl = new URL(`/api/v1/ccintern/me/auftraege?firma_id=${encodeURIComponent(firmaId)}`, serverOrigin).toString();
  const wList = await httpJson('GET', wUrl, { headers: { authorization: `Bearer ${wTok}` } });
  assert.equal(wList.res.status, 200, JSON.stringify(wList.body));
  assert.equal(wList.body?.success, true);
  const wIds = (wList.body?.data?.items || []).map((/** @type {{ auftrag_id: string }} */ x) => x.auftrag_id);
  assert.ok(wIds.includes(ccAuftragWorker));
  assert.ok(wIds.includes(ccAuftragWorkflowTeam));
  assert.ok(!wIds.includes(ccAuftragOther));

  const oUrl = new URL(`/api/v1/ccintern/me/auftraege?firma_id=${encodeURIComponent(firmaId)}`, serverOrigin).toString();
  const oList = await httpJson('GET', oUrl, { headers: { authorization: `Bearer ${oTok}` } });
  assert.equal(oList.res.status, 200);
  const oIds = (oList.body?.data?.items || []).map((/** @type {{ auftrag_id: string }} */ x) => x.auftrag_id);
  assert.ok(oIds.includes(ccAuftragOther));
  assert.ok(!oIds.includes(ccAuftragWorker));
});

test('PATCH /api/v1/ccintern/me/workflow-schritt — MA am Workflow-Schritt', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const wTok = signAccessToken({ sub: workerId, email: workerEmail });
  const base = new URL('/api/v1/ccintern/me/workflow-schritt', serverOrigin).toString();
  const url = `${base}?firma_id=${encodeURIComponent(firmaId)}`;
  const patch = await httpJson('PATCH', url, {
    headers: { authorization: `Bearer ${wTok}` },
    jsonBody: { ccintern_auftrag_id: ccAuftragWorkflowTeam, schritt: 'druck', status: 'fertig' },
  });
  assert.equal(patch.res.status, 200, JSON.stringify(patch.body));
  assert.equal(patch.body?.success, true);
  const row = await store.getCcInternAuftragById(ccAuftragWorkflowTeam, firmaId);
  assert.ok(String(row?.bemerkung || '').includes('"fertig":true'), 'Workflow-Schritt persistiert');
});

test('GET /api/v1/ccintern/me/aufgaben — nur zugewiesene Aufgaben', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const wTok = signAccessToken({ sub: workerId, email: workerEmail });
  const url = new URL(`/api/v1/ccintern/me/aufgaben?firma_id=${encodeURIComponent(firmaId)}`, serverOrigin).toString();
  const res = await httpJson('GET', url, { headers: { authorization: `Bearer ${wTok}` } });
  assert.equal(res.res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.success, true);
  const titles = (res.body?.data?.items || []).map((/** @type {{ titel: string }} */ x) => x.titel);
  assert.ok(titles.some((t) => t === 'Worker Task'));
  assert.ok(!titles.some((t) => t === 'Nur Other'));
});

test('POST /api/v1/ccintern/me/zeiten — erlaubt / Fremdauftrag 403', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const wTok = signAccessToken({ sub: workerId, email: workerEmail });
  const base = new URL('/api/v1/ccintern/me/zeiten', serverOrigin).toString();
  const ok = await httpJson('POST', base, {
    headers: { authorization: `Bearer ${wTok}` },
    jsonBody: { ccintern_auftrag_id: ccAuftragWorker, minuten: 30, notiz: 'Test' },
  });
  assert.equal(ok.res.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body?.success, true);
  assert.equal(ok.body?.data?.item?.minuten, 30);

  const forbidden = await httpJson('POST', base, {
    headers: { authorization: `Bearer ${wTok}` },
    jsonBody: { ccintern_auftrag_id: ccAuftragOther, minuten: 15 },
  });
  assert.equal(forbidden.res.status, 403);
  assert.equal(forbidden.body?.error?.code, 'FORBIDDEN');
});

test('POST /api/v1/ccintern/me/foto — Upload unter ccintern-fotos/…', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const wTok = signAccessToken({ sub: workerId, email: workerEmail });
  const url = new URL('/api/v1/ccintern/me/foto', serverOrigin).toString();
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const blob = new Blob([jpeg], { type: 'image/jpeg' });
  const fd = new FormData();
  fd.append('file', blob, 'b6.jpg');
  fd.append('ccintern_auftrag_id', ccAuftragWorker);

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${wTok}`,
      'x-project-id': projectId,
    },
    body: fd,
  });
  const text = await res.text();
  /** @type {any} */
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text };
  }
  assert.equal(res.status, 201, JSON.stringify(body));
  assert.equal(body?.success, true);
  const rel = body?.data?.item?.path;
  assert.ok(typeof rel === 'string' && rel.includes('ccintern-fotos/'), rel);
  assert.ok(rel.includes(projectId), rel);
  assert.ok(rel.includes(ccAuftragWorker), rel);
});

test('Arbeitszeit-Session: start → aktiv → pause → weiter → stop', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const tok = signAccessToken({ sub: workerId, email: workerEmail });
  const headers = {
    authorization: `Bearer ${tok}`,
    'x-project-id': projectId,
  };
  const base = new URL('/api/v1/ccintern/mitarbeiter/arbeitszeit', serverOrigin).toString();

  let res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.equal(res.res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.success, true);
  assert.equal(res.body?.data?.session, null);

  res = await httpJson('POST', `${base}/start`, { headers, jsonBody: {} });
  assert.equal(res.res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.data?.session?.status, 'running');
  assert.equal(res.body?.data?.session?.user_id, workerId);

  res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.ok(res.body?.data?.session?.id);

  res = await httpJson('POST', `${base}/pause`, { headers, jsonBody: {} });
  assert.equal(res.body?.data?.session?.status, 'paused');
  assert.ok(res.body?.data?.session?.pause_started_at);

  res = await httpJson('POST', `${base}/weiter`, { headers, jsonBody: {} });
  assert.equal(res.body?.data?.session?.status, 'running');

  res = await httpJson('POST', `${base}/stop`, { headers, jsonBody: {} });
  assert.equal(res.res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.data?.session, null);
  assert.ok(res.body?.data?.anwesenheit?.id);
  assert.equal(res.body?.data?.anwesenheit?.user_id, workerId);

  res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.equal(res.body?.data?.session, null);
});

test('Auftrag-Arbeitszeit-Session: start → aktiv → stop, nur eine aktiv', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const tok = signAccessToken({ sub: workerId, email: workerEmail });
  const headers = { authorization: `Bearer ${tok}`, 'x-project-id': projectId };
  const base = new URL('/api/v1/ccintern/mitarbeiter/auftrag-arbeitszeit', serverOrigin).toString();
  const bodyStart = { auftrag_id: ccAuftragWorker, schritt_key: 'bau' };

  let res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.equal(res.res.status, 200);
  assert.equal(res.body?.data?.session, null);

  res = await httpJson('POST', `${base}/start`, { headers, jsonBody: bodyStart });
  assert.equal(res.res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body?.data?.session?.status, 'running');
  assert.equal(res.body?.data?.session?.auftrag_id, ccAuftragWorker);

  res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.equal(res.body?.data?.session?.schritt_key, 'bau');

  res = await httpJson('POST', `${base}/pause`, { headers, jsonBody: bodyStart });
  assert.equal(res.body?.data?.session?.status, 'paused');

  res = await httpJson('POST', `${base}/weiter`, { headers, jsonBody: bodyStart });
  assert.equal(res.body?.data?.session?.status, 'running');

  res = await httpJson('POST', `${base}/stop`, { headers, jsonBody: bodyStart });
  assert.equal(res.body?.data?.session?.status, 'stopped');
  assert.ok(res.body?.data?.zeitbuchung?.dauer >= 1, JSON.stringify(res.body?.data?.zeitbuchung));
  assert.equal(res.body?.data?.zeitbuchung?.maId, workerId);

  const { parseCcinternBemerkungPayload } = await import(toImport('../lib/ccintern-workflow-bemerkung.js'));
  const aufNachStop = await store.getCcInternAuftragById(ccAuftragWorker, firmaId);
  const payloadNachStop = parseCcinternBemerkungPayload(aufNachStop?.bemerkung);
  assert.ok(Array.isArray(payloadNachStop?.zeiten) && payloadNachStop.zeiten.length >= 1);
  assert.equal(payloadNachStop.zeiten[0].maId, workerId);
  assert.equal(payloadNachStop.zeiten[0].step, 'bau');

  res = await httpJson('GET', `${base}/aktiv`, { headers });
  assert.equal(res.body?.data?.session, null);

  res = await httpJson('POST', `${base}/start`, { headers, jsonBody: bodyStart });
  assert.equal(res.body?.data?.session?.status, 'running');
  const firstId = res.body?.data?.session?.id;

  res = await httpJson('POST', `${base}/start`, { headers, jsonBody: bodyStart });
  assert.equal(res.body?.data?.session?.id, firstId);

  await httpJson('POST', `${base}/stop`, { headers, jsonBody: bodyStart });
});

test('GET /api/v1/ccintern/me ohne mitarbeiterapp → 403', async () => {
  const [{ signAccessToken }] = await Promise.all([import(toImport('../auth/jwt.js'))]);
  const tok = signAccessToken({
    sub: noMaId,
    email: `b6-n-${noMaId.slice(0, 8)}@cc-cockpit.local`,
  });
  const url = new URL(`/api/v1/ccintern/me/auftraege?firma_id=${encodeURIComponent(firmaId)}`, serverOrigin).toString();
  const res = await httpJson('GET', url, { headers: { authorization: `Bearer ${tok}` } });
  assert.equal(res.res.status, 403);
  assert.equal(res.body?.error?.code, 'FORBIDDEN');
});
