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

function clearMysqlEnv() {
  for (const key of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    delete process.env[key];
  }
}

let server;
let origin = '';
let sqlitePath = '';
let store;
let firmaId = '';
let projectId = '';
let adminId = '';
let workerId = '';
let adminToken = '';
let workerToken = '';

async function request(token, method, pathname, body) {
  const response = await fetch(new URL(pathname, origin), {
    method,
    headers: {
      accept: 'application/json',
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'x-project-id': projectId,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : null,
  };
}

function parsePayload(bemerkung) {
  return JSON.parse(String(bemerkung || '{}')).payload;
}

before(async () => {
  clearMysqlEnv();
  process.env.JWT_SECRET ||= 'checklisten-flow-test-secret-32-characters!!';
  sqlitePath = path.join(tmpdir(), `cc-checklisten-flow-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  fs.rmSync(sqlitePath, { force: true });

  const [{ openDatabase }, { createApiV1Router }, { signAccessToken }, { hashPassword }] = await Promise.all([
    import(toImport('../db/database.js')),
    import(toImport('../routes/api-v1.js')),
    import(toImport('../auth/jwt.js')),
    import(toImport('../auth/password.js')),
  ]);

  store = await openDatabase();
  firmaId = randomUUID();
  projectId = randomUUID();
  adminId = randomUUID();
  workerId = randomUUID();

  await store.insertFirma({
    id: firmaId,
    name: 'Checklisten E2E Firma',
    kundennummer: '',
    altnummer: '',
    typ: 'kunde',
    intern_extern: 'intern',
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
  await store.insertProject({ id: projectId, name: 'Checklisten E2E Projekt', kundenId: null });

  await store.insertUser({
    id: adminId,
    email: 'checklisten-admin@example.test',
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Checklist Admin',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(adminId, firmaId);
  await store.insertProjectAccess({
    id: randomUUID(),
    userId: adminId,
    projectId,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });

  await store.insertUser({
    id: workerId,
    email: 'checklisten-worker@example.test',
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Checklist Worker',
    globalRole: 'INTERN',
  });
  await store.updateUserCompany(workerId, firmaId);
  store.replaceUserAccessBundle({
    userId: workerId,
    globalRole: 'INTERN',
    modules: ['ccintern'],
    rights: { ccintern: { mitarbeiterapp: { sehen: true, erstellen: true } } },
  });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId: workerId,
    projectId,
    role: 'member',
    canViewPrices: false,
    canEdit: false,
    canCreateAuftraege: false,
  });

  adminToken = signAccessToken({ sub: adminId, email: 'checklisten-admin@example.test' });
  workerToken = signAccessToken({ sub: workerId, email: 'checklisten-worker@example.test' });

  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use('/api/v1', createApiV1Router(store));
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  origin = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve) => server?.close(resolve));
  fs.rmSync(sqlitePath, { force: true });
});

test('complete checklist flow and current staff limitations', async (t) => {
  const productId = 'e2e-pkw-teilfolierung';
  let checklistId = '';
  let orderId = '';

  await t.test('admin creates a server template and two points', async () => {
    const created = await request(adminToken, 'POST', '/api/v1/checklisten', {
      titel: 'E2E Montage Teilfolierung',
      firma_id: firmaId,
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    checklistId = String(created.body?.data?.id || '');
    assert.match(checklistId, /^[0-9a-f-]{36}$/i);

    for (const text of ['Oberfläche reinigen', 'Abschlussfoto hochladen']) {
      const point = await request(adminToken, 'POST', `/api/v1/checklisten/${checklistId}/eintraege`, {
        text,
        erledigt: false,
        firma_id: firmaId,
      });
      assert.equal(point.status, 201, JSON.stringify(point.body));
    }
    const detail = await request(adminToken, 'GET', `/api/v1/checklisten/${checklistId}?firma_id=${firmaId}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.deepEqual(detail.body.data.eintraege.map((x) => x.text), [
      'Oberfläche reinigen',
      'Abschlussfoto hochladen',
    ]);
  });

  await t.test('admin assigns the template to product × Montage', async () => {
    const assigned = await request(adminToken, 'POST', '/api/v1/ccintern/checklisten-zuordnung', {
      produkt_id: productId,
      schritt: 'montage',
      checkliste_id: checklistId,
      aktiv: true,
      sortierung: 0,
      firma_id: firmaId,
    });
    assert.equal(assigned.status, 201, JSON.stringify(assigned.body));

    const list = await request(
      adminToken,
      'GET',
      `/api/v1/ccintern/checklisten-zuordnung?produkt_id=${productId}&firma_id=${firmaId}`,
    );
    assert.equal(list.status, 200, JSON.stringify(list.body));
    assert.equal(list.body.data.items.length, 1);
    assert.equal(list.body.data.items[0].schritt, 'montage');
  });

  await t.test('new order is initially created without copied checklist', async () => {
    const payload = {
      produktId: productId,
      step: 'montage',
      schritte: {
        montage: {
          dauer: 4,
          status: 'in_bearbeitung',
          maId: workerId,
          maIds: [workerId],
          checkliste: [],
        },
      },
    };
    const created = await request(adminToken, 'POST', '/api/v1/ccintern/auftraege', {
      kunde: 'E2E Testkunde',
      status: 'aktiv',
      schritt: 'montage',
      prioritaet: 'normal',
      quelle: 'manuell',
      bemerkung: JSON.stringify({ __ccintern_v1: 1, payload }),
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    orderId = String(created.body.data.auftrag.id);
    assert.deepEqual(parsePayload(created.body.data.auftrag.bemerkung).schritte.montage.checkliste, []);
  });

  await t.test('frontend-style post-create copy resolves assignment and persists snapshot', async () => {
    const mappings = await request(
      adminToken,
      'GET',
      `/api/v1/ccintern/checklisten-zuordnung?produkt_id=${productId}&firma_id=${firmaId}`,
    );
    const activeForMontage = mappings.body.data.items.filter((row) => row.aktiv && row.schritt === 'montage');
    assert.equal(activeForMontage.length, 1);

    const template = await request(
      adminToken,
      'GET',
      `/api/v1/checklisten/${activeForMontage[0].checkliste_id}?firma_id=${firmaId}`,
    );
    const copied = template.body.data.eintraege.map((entry) => ({
      text: entry.text,
      kat: 'pflicht',
      hinweis: '',
      quelle: template.body.data.titel,
      erledigt: false,
      'löschbar': false,
    }));

    const order = await request(adminToken, 'GET', `/api/v1/ccintern/auftraege/${orderId}`);
    const payload = parsePayload(order.body.data.auftrag.bemerkung);
    payload.schritte.montage.checkliste = copied;
    payload.checklisten = copied;
    const saved = await request(adminToken, 'PATCH', `/api/v1/ccintern/auftraege/${orderId}`, {
      bemerkung: JSON.stringify({ __ccintern_v1: 1, payload }),
    });
    assert.equal(saved.status, 200, JSON.stringify(saved.body));
    assert.equal(parsePayload(saved.body.data.auftrag.bemerkung).schritte.montage.checkliste.length, 2);
  });

  await t.test('admin sends the prepared order to production', async () => {
    const result = await request(
      adminToken,
      'POST',
      `/api/v1/ccintern/auftraege/${orderId}/an-produktion`,
      {},
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.body.data.produktion_auftrag, 'production assignment must be created');
  });

  await t.test('assigned worker sees the order', async () => {
    const result = await request(
      workerToken,
      'GET',
      `/api/v1/ccintern/me/auftraege?firma_id=${firmaId}`,
    );
    assert.equal(result.status, 200, JSON.stringify(result.body));
    assert.ok(result.body.data.items.some((row) => String(row.auftrag_id) === orderId));
  });

  await t.test('current normal staff cannot persist a checkbox using the mobile UI save route', async () => {
    const row = await store.getCcInternAuftragById(orderId, firmaId);
    const payload = parsePayload(row.bemerkung);
    payload.schritte.montage.checkliste[0].erledigt = true;
    const denied = await request(workerToken, 'PATCH', `/api/v1/ccintern/auftraege/${orderId}`, {
      bemerkung: JSON.stringify({ __ccintern_v1: 1, payload }),
    });
    assert.equal(denied.status, 403, JSON.stringify(denied.body));
  });

  await t.test('current server allows finishing the step with every required point still open', async () => {
    const finished = await request(workerToken, 'PATCH', '/api/v1/ccintern/me/workflow-schritt', {
      ccintern_auftrag_id: orderId,
      schritt: 'montage',
      status: 'fertig',
      firma_id: firmaId,
    });
    assert.equal(finished.status, 200, JSON.stringify(finished.body));
    const persisted = parsePayload(finished.body.data.auftrag.bemerkung);
    assert.equal(persisted.schritte.montage.fertig, true);
    assert.equal(persisted.schritte.montage.checkliste.every((item) => item.erledigt === false), true);
  });
});
