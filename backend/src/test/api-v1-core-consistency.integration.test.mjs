/**
 * End-to-End-Kernkonsistenz: FUSA-Auftrag → Freigabe → CC-Intern, Referenzen, Kalender, Idempotenz.
 *
 * Ergänzt die punktuellen Checks in `api-fusa-ccintern-bridge` um explizite Konsistenzassertionen
 * über mehrere Lese-Pfade (Detail, Liste, Kalender, DB-Hilfsabfrage).
 */
import assert from 'node:assert/strict';
import { endeMontageEineStundeNachStart } from '../lib/auftrag-kalender-sync.js';
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
let userId = '';
let projectId = '';
let fusaAuftragId = '';
let token = '';
const fusaTermin = '2026-06-15T10:00:00.000Z';
const fusaTerminEnde = '2026-06-15T18:00:00.000Z';

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

function apiV1(method, pathname, { jsonBody = null } = {}) {
  const p = String(pathname || '');
  const path = p.startsWith('/api/v1') ? p : `/api/v1${p.startsWith('/') ? '' : '/'}${p}`;
  const url = new URL(path, serverOrigin).toString();
  return httpJson(method, url, {
    headers: {
      authorization: `Bearer ${token}`,
      'x-project-id': projectId,
    },
    jsonBody,
  });
}

before(async () => {
  clearMysqlEnvForDeterministicSqlite();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }
  sqlitePath = path.join(tmpdir(), `cc-cockpit-core-consistency-${randomUUID()}.db`);
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
    name: `Kernkonsistenz ${firmaId.slice(0, 8)}`,
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
    ansprechpartner_vorname: 'Test',
    ansprechpartner_nachname: 'Kunde',
    ansprechpartner_email: '',
    ansprechpartner_telefon: '',
    interne_notiz: '',
    erweiterung_json: null,
  });

  userId = randomUUID();
  await store.insertUser({
    id: userId,
    email: `core-coherence-${userId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Kernkonsistenz',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userId, firmaId);

  projectId = randomUUID();
  await store.insertProject({ id: projectId, name: 'Kernkonsistenz Projekt', kundenId: null });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId,
    projectId,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });

  fusaAuftragId = randomUUID();
  await store.insertAuftrag({
    id: fusaAuftragId,
    title: 'Kernkonsistenz FUSA',
    projectId,
    status: 'aktiv',
    termin: fusaTermin,
    terminEnde: fusaTerminEnde,
    fusaOriginalId: null,
    fusaKundeId: firmaId,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });

  token = signAccessToken({ sub: userId, email: 'core@cc-cockpit.local' });

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

test('Kernkonsistenz FUSA → Bridge → CC Intern (E2E)', async (t) => {
  let ccId = '';

  await t.test('A: GET /fusa/auftraege enthält den FUSA-Auftrag mit passenden Referenzen', async () => {
    const { res, body } = await apiV1('get', '/fusa/auftraege');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
    const list = body?.data?.auftraege;
    assert.ok(Array.isArray(list), 'data.auftraege muss Array sein');
    const row = list.find((r) => r && String(r.id) === fusaAuftragId);
    assert.ok(row, 'FUSA-Auftrag muss in der API-Liste vorkommen');
    assert.equal(String(row.project_id || ''), projectId, 'FUSA-Liste: project_id muss dem angelegten Projekt entsprechen');
    assert.equal(String(row.fusa_kunde_id || ''), firmaId, 'FUSA-Liste: fusa_kunde_id = Firmen-Stamm');
  });

  await t.test('B: Freigabe erzeugt CC-Intern-Auftrag; Referenzen in DB + API', async () => {
    const { res, body } = await apiV1('post', `/fusa/auftraege/${encodeURIComponent(fusaAuftragId)}/freigeben`, {
      jsonBody: {},
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
    assert.equal(body?.data?.status, 'created');
    assert.ok(body?.data?.ccintern_auftrag_id, 'ccintern_auftrag_id');
    assert.equal(String(body.data.fusa_auftrag_id || ''), fusaAuftragId);
    ccId = String(body.data.ccintern_auftrag_id);

    const fromDb = await store.getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId);
    assert.ok(fromDb, 'Eindeutiger CC-Intern-Datensatz pro (fusa_auftrag_id, firma) in DB');
    assert.equal(String(fromDb.id), ccId, 'DB getByFusaAuftragId muss API-ID entsprechen');
    assert.equal(String(fromDb.fusa_auftrag_id || ''), fusaAuftragId);
    assert.equal(String(fromDb.firma_id || ''), firmaId);
    assert.equal(String(fromDb.quelle || ''), 'fusa');
  });

  await t.test('C: Read-after-write — GET Detail und Liste; Termine konsistent mit FUSA', async () => {
    assert.ok(ccId);
    const d1 = await apiV1('get', `/auftraege/${encodeURIComponent(ccId)}`);
    assert.equal(d1.res.status, 200, JSON.stringify(d1.body));
    const auf = d1.body?.data?.auftrag;
    assert.ok(auf, 'data.auftrag');
    assert.equal(auf.fusa_auftrag_id, fusaAuftragId);
    assert.equal(String(auf.firma_id || ''), firmaId);
    assert.equal(auf.quelle, 'fusa');
    assert.equal(auf.montage_datum, fusaTermin, 'sync: Montage-Start = FUSA-termin (nach insert+sync)');
    assert.equal(auf.lieferdatum, fusaTerminEnde, 'sync: Lieferdatum = FUSA-termin_ende');

    const d2 = await apiV1('get', '/auftraege?page=1&limit=50');
    assert.equal(d2.res.status, 200, JSON.stringify(d2.body));
    const items = d2.body?.data?.items;
    assert.ok(Array.isArray(items), 'Listen-Envelope data.items');
    const found = items.find((x) => x && String(x.id) === ccId);
    assert.ok(found, 'Eintrag muss in GET-Liste erscheinen');
    assert.equal(found.fusa_auftrag_id, fusaAuftragId, 'Listen-Mapping: gleiche fusa_auftrag_id wie GET Detail');
    assert.equal(String(found.firma_id || ''), firmaId);
  });

  await t.test('D: Kalender — FUSA-Beklebung + CC-Montage passen zu Auftrags-API (keine zweite Wahrheit)', async () => {
    assert.ok(ccId);
    const d1 = await apiV1('get', `/auftraege/${encodeURIComponent(ccId)}`);
    const auf = d1.body?.data?.auftrag;
    assert.ok(auf);

    const { res, body } = await apiV1('get', '/kalender?page=1&limit=200');
    assert.equal(res.status, 200, JSON.stringify(body));
    const rows = Array.isArray(body?.data?.termine) ? body.data.termine : [];

    const fusaRow = rows.find(
      (r) =>
        r &&
        r.quelle === 'fusa' &&
        r.typ === 'beklebung' &&
        String(r.fusa_auftrag_id || '') === fusaAuftragId &&
        String(r.firma_id || '') === firmaId,
    );
    assert.ok(fusaRow, 'Kalender: FUSA-Beklebung zur Auftrags-ID');
    assert.equal(fusaRow.start, fusaTermin);
    assert.equal(fusaRow.ende, fusaTerminEnde);

    const ccRow = rows.find(
      (r) =>
        r &&
        r.quelle === 'ccintern' &&
        r.typ === 'montage' &&
        String(r.auftrag_id || '') === ccId &&
        String(r.firma_id || '') === firmaId,
    );
    assert.ok(ccRow, 'Kalender: CC-Intern-Montage zum verknüpften Auftrag');
    assert.equal(ccRow.start, auf.montage_datum, 'Kalender Montage-Start = CC-Auftrag montage_datum');
    assert.equal(
      ccRow.ende,
      endeMontageEineStundeNachStart(String(auf.montage_datum || '')),
      'Kalender Montage-Ende = Start + 1h',
    );
  });

  await t.test('E: Wiederholte Freigabe — idempotent: linked, gleiche cc-intern-ID', async () => {
    const { res, body } = await apiV1('post', `/fusa/auftraege/${encodeURIComponent(fusaAuftragId)}/freigeben`, {
      jsonBody: {},
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.data?.status, 'linked');
    assert.equal(String(body.data.ccintern_auftrag_id || ''), ccId, 'Zweite Freigabe: keine zweite cc-intern ID');

    const fromDb = await store.getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId);
    assert.ok(fromDb);
    assert.equal(String(fromDb.id), ccId, 'Idempotenz: DB weiterhin genau ein CC-Auftrag');
  });

  await t.test('F: FUSA- und CC-Welten vermischen die IDs nicht (Referenz trennt Herkunft)', async () => {
    assert.notEqual(fusaAuftragId, ccId, 'FUSA-Auftrags-UUID und CC-Intern-UUID müssen unterschiedlich sein');
    const fusa = await store.getAuftragById(fusaAuftragId);
    assert.equal(String(fusa.fusa_kunde_id || ''), String((await store.getCcInternAuftragById(ccId, firmaId)).firma_id));
  });

  await t.test('G: GET /kunden Stamm — Envelope ohne Legacy-Root (A3.7)', async () => {
    const { res, body } = await apiV1('get', '/kunden');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.kunden));
    assert.equal(body?.kunden, undefined);
    assert.equal(body?.ok, undefined);
    assert.equal(body?.message, undefined);
  });
});
