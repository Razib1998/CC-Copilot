import assert from 'node:assert/strict';
import { endeMontageEineStundeNachStart } from '../lib/auftrag-kalender-sync.js';
import { randomUUID } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';

/**
 * API-Integrationstests (HTTP) für FUSA ↔ CC-Intern ↔ Kalender.
 *
 * Hinweis zu „PATCH“ in den Anforderungen:
 * - FUSA-Aufträge werden in diesem Backend über `PATCH /auftraege/:id` aktualisiert (nicht unter `/api/v1`).
 * - CC-Intern-Aufträge werden über `PUT /api/v1/auftraege/:id` aktualisiert (kein PATCH-Endpunkt vorhanden).
 * - Kalender wird über `PUT /api/v1/kalender/:id` aktualisiert.
 */

/** @type {import('http').Server|null} */
let server = null;
/** @type {string} */
let serverOrigin = '';
/** @type {string} */
let token = '';
/** @type {any} */
let store = null;

/** @type {string} */
let firmaId = '';
/** @type {string} */
let userId = '';
/** @type {string} */
let projectId = '';
/** @type {string} */
let fusaAuftragId = '';
/** @type {string} */
let ccinternAuftragId = '';

/** @type {string|null} */
let fusaKalenderId = null;
/** @type {string|null} */
let ccinternKalenderId = null;

/** @type {string} */
let sqlitePath = '';

function clearMysqlEnvForDeterministicSqlite() {
  // Wenn ein Entwickler-Rechner MYSQL_* gesetzt hat, würde `openDatabase()` sonst MySQL wählen.
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) {
      delete process.env[k];
    }
  }
}

async function httpJson(method, url, { headers = {}, jsonBody = null } = {}) {
  const init = {
    method: String(method || 'GET').toUpperCase(),
    headers: {
      ...(jsonBody != null ? { 'content-type': 'application/json; charset=utf-8' } : {}),
      ...headers,
    },
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  };
  const res = await fetch(url, init);
  const text = await res.text();
  /** @type {any} */
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { _nonJson: text };
    }
  }
  return { res, body };
}

async function apiV1(method, pathname, { jsonBody = null } = {}) {
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

async function auftraegeNative(method, pathname, { jsonBody = null } = {}) {
  const url = new URL(pathname, serverOrigin).toString();
  return httpJson(method, url, {
    headers: { authorization: `Bearer ${token}` },
    jsonBody,
  });
}

function summarizeFailure(label, err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.log(`${label} FAIL — ${msg}`);
}

before(async () => {
  clearMysqlEnvForDeterministicSqlite();

  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }

  sqlitePath = path.join(tmpdir(), `cc-cockpit-api-bridge-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    // ignore
  }

  const [{ openDatabase }, { signAccessToken }, { createApiV1Router }, { createAuftraegeRouter }, { requireAuth }, { attachAccessProfile }, { hashPassword }] =
    await Promise.all([
      import('../db/database.js'),
      import('../auth/jwt.js'),
      import('../routes/api-v1.js'),
      import('../routes/auftraege.js'),
      import('../middleware/require-auth.js'),
      import('../middleware/attach-access-profile.js'),
      import('../auth/password.js'),
    ]);

  store = await openDatabase();

  firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: `API-Bridge Testfirma ${firmaId.slice(0, 8)}`,
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

  userId = randomUUID();
  await store.insertUser({
    id: userId,
    email: `api-bridge-${userId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'API-Bridge Tester',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userId, firmaId);

  projectId = randomUUID();
  await store.insertProject({ id: projectId, name: 'API-Bridge Projekt', kundenId: null });
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
    title: 'API-Bridge FUSA Auftrag',
    projectId,
    status: 'aktiv',
    termin: '2026-04-10T09:00:00.000Z',
    terminEnde: '2026-04-10T17:00:00.000Z',
    fusaOriginalId: null,
    fusaKundeId: firmaId,
    fusaFahrzeugIds: null,
    fusaExtraJson: null,
  });

  token = signAccessToken({ sub: userId, email: 'api-bridge@cc-cockpit.local' });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  const apiAuthProfile = [requireAuth, attachAccessProfile(store)];
  app.use('/api/v1', createApiV1Router(store));
  app.use('/auftraege', ...apiAuthProfile, createAuftraegeRouter(store));

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
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    // ignore
  }
});

test('API-Bridge Checks (1–8)', async (t) => {
  const results = [];

  // 1) FUSA-Auftrag freigeben -> CC-Intern-Auftrag wird erzeugt
  await t.test('1) POST /api/v1/fusa/auftraege/:id/freigeben erzeugt CC-Intern-Auftrag', async () => {
    try {
      const { res, body } = await apiV1('post', `/fusa/auftraege/${encodeURIComponent(fusaAuftragId)}/freigeben`, {
        jsonBody: {},
      });
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      assert.equal(body?.success, true);
      assert.equal(body?.ok, undefined, 'kein Legacy ok auf Root');
      assert.equal(body?.error, undefined, 'kein Legacy error auf Root');
      assert.equal(body?.message, undefined, 'kein Legacy message auf Root');
      assert.equal(body?.data?.status, 'created');
      assert.ok(body?.data?.ccintern_auftrag_id, 'data.ccintern_auftrag_id fehlt');
      ccinternAuftragId = String(body.data.ccintern_auftrag_id);
      results.push(['1', 'PASS']);
    } catch (e) {
      results.push(['1', 'FAIL']);
      summarizeFailure('[1]', e);
      throw e;
    }
  });

  // 2) fusa_auftrag_id wird korrekt gesetzt
  await t.test('2) CC-Intern-Auftrag hat korrektes fusa_auftrag_id', async () => {
    try {
      assert.ok(ccinternAuftragId, 'ccintern_auftrag_id nicht gesetzt (Abhängigkeit: Test 1)');
      const { res, body } = await apiV1('get', `/auftraege/${encodeURIComponent(ccinternAuftragId)}`);
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      assert.equal(body?.success, true);
      assert.equal(body?.data?.auftrag?.fusa_auftrag_id, fusaAuftragId);
      results.push(['2', 'PASS']);
    } catch (e) {
      results.push(['2', 'FAIL']);
      summarizeFailure('[2]', e);
      throw e;
    }
  });

  // 3+4) Kalender-Einträge
  await t.test('3–4) Kalender: FUSA-Beklebung + CC-Intern-Montage existieren', async () => {
    try {
      const { res, body } = await apiV1('get', `/kalender?page=1&limit=200`);
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      assert.equal(body?.success, true);
      const rows = Array.isArray(body?.data?.termine) ? body.data.termine : [];

      const fusaRow = rows.find(
        (r) =>
          r?.quelle === 'fusa' &&
          r?.typ === 'beklebung' &&
          String(r?.fusa_auftrag_id || '') === fusaAuftragId &&
          String(r?.firma_id || '') === firmaId,
      );
      assert.ok(fusaRow, 'FUSA-Beklebungstermin (quelle=fusa, typ=beklebung) nicht gefunden');
      fusaKalenderId = String(fusaRow.id);

      const ccRow = rows.find(
        (r) =>
          r?.quelle === 'ccintern' &&
          r?.typ === 'montage' &&
          String(r?.auftrag_id || '') === ccinternAuftragId &&
          String(r?.firma_id || '') === firmaId,
      );
      assert.ok(ccRow, 'CC-Intern-Montage (quelle=ccintern, typ=montage) nicht gefunden');
      ccinternKalenderId = String(ccRow.id);

      results.push(['3', 'PASS']);
      results.push(['4', 'PASS']);
    } catch (e) {
      results.push(['3', 'FAIL']);
      results.push(['4', 'FAIL']);
      summarizeFailure('[3–4]', e);
      throw e;
    }
  });

  // 5) FUSA-Termin aktualisiert Kalendereintrag (native PATCH /auftraege)
  await t.test('5) PATCH /auftraege/:id aktualisiert FUSA-Kalendereintrag', async () => {
    try {
      assert.ok(fusaKalenderId, 'fusaKalenderId fehlt (Abhängigkeit: Test 3–4)');
      const nextStart = '2026-04-11T08:15:00.000Z';
      const nextEnd = '2026-04-11T16:45:00.000Z';
      const { res, body } = await auftraegeNative('PATCH', `/auftraege/${encodeURIComponent(fusaAuftragId)}`, {
        jsonBody: { termin: nextStart, termin_ende: nextEnd },
      });
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);

      const cur = await store.getKalenderTerminById(fusaKalenderId, firmaId);
      assert.ok(cur);
      assert.equal(String(cur.start), nextStart);
      assert.equal(String(cur.ende || ''), nextEnd);
      results.push(['5', 'PASS']);
    } catch (e) {
      results.push(['5', 'FAIL']);
      summarizeFailure('[5]', e);
      throw e;
    }
  });

  // 6) CC-Intern-Montage aktualisiert Kalendereintrag (PUT /api/v1/auftraege/:id)
  await t.test('6) PUT /api/v1/auftraege/:id aktualisiert Montage-Kalendereintrag', async () => {
    try {
      assert.ok(ccinternKalenderId, 'ccinternKalenderId fehlt (Abhängigkeit: Test 3–4)');
      assert.ok(ccinternAuftragId, 'ccinternAuftragId fehlt (Abhängigkeit: Test 1)');

      const row = await store.getCcInternAuftragById(ccinternAuftragId, firmaId);
      assert.ok(row);

      const nextMontage = '2026-05-02T07:30:00.000Z';
      const nextLiefer = '2026-05-02T15:00:00.000Z';

      const { res, body } = await apiV1('put', `/auftraege/${encodeURIComponent(ccinternAuftragId)}`, {
        jsonBody: {
          kunde: String(row.kunde),
          status: row.status ?? null,
          schritt: row.schritt ?? null,
          prioritaet: row.prioritaet ?? null,
          lieferdatum: nextLiefer,
          montage_datum: nextMontage,
          bemerkung: row.bemerkung ?? null,
          fusa_auftrag_id: fusaAuftragId,
          quelle: 'fusa',
        },
      });
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      assert.equal(body?.success, true);

      const cur = await store.getKalenderTerminById(ccinternKalenderId, firmaId);
      assert.ok(cur);
      assert.equal(String(cur.start), nextMontage);
      assert.equal(String(cur.ende || ''), endeMontageEineStundeNachStart(nextMontage), 'CC-Montage: ende = start + 1h (nicht lieferdatum)');
      results.push(['6', 'PASS']);
    } catch (e) {
      results.push(['6', 'FAIL']);
      summarizeFailure('[6]', e);
      throw e;
    }
  });

  // 7) CC-Intern-Auftrag enthält keine Fahrzeugfelder (API-Shape)
  await t.test('7) GET /api/v1/auftraege/:id enthält keine Fahrzeug-Felder', async () => {
    try {
      assert.ok(ccinternAuftragId, 'ccinternAuftragId fehlt (Abhängigkeit: Test 1)');
      const { res, body } = await apiV1('get', `/auftraege/${encodeURIComponent(ccinternAuftragId)}`);
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      const data = body?.data && typeof body.data === 'object' ? body.data : {};
      const auftrag = data?.auftrag && typeof data.auftrag === 'object' ? data.auftrag : {};
      const forbiddenKeys = [
        'fusa_fahrzeug_ids',
        'fahrzeug_ids',
        'fahrzeuge',
        'fahrzeug_id',
        'fahrzeugId',
      ];
      for (const k of forbiddenKeys) {
        assert.equal(Object.prototype.hasOwnProperty.call(auftrag, k), false, `unexpected key present: ${k}`);
      }
      results.push(['7', 'PASS']);
    } catch (e) {
      results.push(['7', 'FAIL']);
      summarizeFailure('[7]', e);
      throw e;
    }
  });

  // 8) Kundenbezug bleibt korrekt
  await t.test('8) Kundenbezug: firma_id / fusa_kunde_id konsistent', async () => {
    try {
      const fusa = await store.getAuftragById(fusaAuftragId);
      assert.ok(fusa);
      assert.equal(String(fusa.fusa_kunde_id || ''), firmaId);

      const cc = await store.getCcInternAuftragById(ccinternAuftragId, firmaId);
      assert.ok(cc);
      assert.equal(String(cc.firma_id || ''), firmaId);

      const { res, body } = await apiV1('get', `/auftraege/${encodeURIComponent(ccinternAuftragId)}`);
      assert.equal(res.status, 200, `unexpected status: ${res.status} ${JSON.stringify(body)}`);
      assert.equal(String(body?.data?.auftrag?.firma_id || ''), firmaId);
      assert.equal(String(body?.data?.auftrag?.fusa_auftrag_id || ''), fusaAuftragId);

      results.push(['8', 'PASS']);
    } catch (e) {
      results.push(['8', 'FAIL']);
      summarizeFailure('[8]', e);
      throw e;
    }
  });

  // Kurzüberblick PASS/FAIL pro Punkt (auch wenn einzelne Subtests fehlschlagen, ist die Liste hilfreich)
  console.log('\nAPI-Bridge Integration — Ergebnisliste:');
  for (const id of ['1', '2', '3', '4', '5', '6', '7', '8']) {
    const hit = results.find((x) => x[0] === id);
    console.log(`[${id}] ${hit ? hit[1] : 'SKIP'}`);
  }
  console.log(
    '\nTeilabdeckung / Abweichungen von der Begrifflichkeit „PATCH“:\n' +
      '- FUSA-Termin-Update: `PATCH /auftraege/:id` (native Route, wie im Server gebunden).\n' +
      '- CC-Intern-Montage-Update: `PUT /api/v1/auftraege/:id` (PATCH-Endpunkt existiert hier nicht).\n' +
      '- Kalender-Update (falls separat gewünscht): `PUT /api/v1/kalender/:id` (hier indirekt über Auftrags-Updates getestet).\n',
  );
});
