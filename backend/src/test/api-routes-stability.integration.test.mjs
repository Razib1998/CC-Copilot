/**
 * API-Stabilität: Router-Module laden + kritische GET /api/v1/* (HTTP).
 *
 * Legacy-Root-Pfade (`/auftraege`, `/fahrzeuge`, …) liefern 410 (Phase A4), Nachfolger nur `/api/v1/*`.
 * FUSA-Fahrzeuge: GET `/api/v1/fusa/fahrzeuge` (kein GET `/api/v1/fahrzeuge`).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { after, before, test } from 'node:test';
import { isApiV1ProjectContextOptionalPath } from '../middleware/api-v1-project-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, '..', 'routes');

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) delete process.env[k];
  }
}

/** @type {import('http').Server|null} */
let server = null;
/** @type {string} */
let serverOrigin = '';
/** @type {string} */
let token = '';
/** @type {string} */
let sqlitePath = '';

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
      body = { _nonJson: text.slice(0, 500) };
    }
  }
  return { res, body };
}

test('backend/src/routes: Syntax-Check (node --check)', () => {
  const files = fs
    .readdirSync(routesDir)
    .filter((f) => f.endsWith('.js'))
    .map((f) => path.join(routesDir, f));
  const nestedDashboard = [
    'cockpit/dashboard.js',
    'fusa/dashboard.js',
    'fusa/quartale.js',
    'ccintern/dashboard.js',
    'ccintern/mobile.js',
    'crm/index.js',
  ].map((f) => path.join(routesDir, f));
  assert.ok(files.length > 0, 'routes-Verzeichnis leer');
  for (const file of [...files, ...nestedDashboard]) {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  }
});

test('backend/src/routes: Module importieren (kein Load-Time ReferenceError)', async () => {
  const specs = [
    ['../routes/api-v1.js', 'createApiV1Router'],
    ['../routes/auftraege.js', 'createAuftraegeRouter'],
    ['../routes/kunden.js', 'createKundenRouter'],
    ['../routes/angebote.js', 'createAngeboteRouter'],
    ['../routes/auth.js', 'createAuthRouter'],
    ['../routes/invite-public.js', 'createInvitePublicRouter'],
    ['../routes/schaeden.js', 'createSchaedenRouter'],
    ['../routes/public-melden.js', 'createPublicMeldenRouter'],
    ['../routes/fahrzeuge.js', 'createFahrzeugeRouter'],
    ['../routes/users.js', 'createUsersRouter'],
    ['../routes/project-access.js', 'createProjectAccessRouter'],
    ['../routes/project-invites.js', 'createProjectInvitesRouter'],
    ['../routes/projects.js', 'createProjectsRouter'],
    ['../routes/mitarbeiter.js', 'createMitarbeiterRouter'],
    ['../routes/checklisten.js', 'createChecklistenRouter'],
    ['../routes/produktion.js', 'createProduktionRouter'],
    ['../routes/fusa-dokumente.js', 'createFusaDokumenteRouter'],
    ['../routes/fusa-angebote.js', 'createFusaAngebotRouter'],
    ['../routes/ccintern/angebote.js', 'createCcInternAngeboteRouter'],
    ['../routes/messeflow-pruef-proxy.js', 'registerMesseflowPruefProxyRoutes'],
    ['../routes/logs.js', 'createLogsRouter'],
    ['../routes/cockpit/dashboard.js', 'createCockpitDashboardRouter'],
    ['../routes/fusa/dashboard.js', 'createFusaDashboardRouter'],
    ['../routes/fusa/quartale.js', 'createFusaQuartaleRouter'],
    ['../routes/ccintern/dashboard.js', 'createCcinternDashboardRouter'],
    ['../routes/ccintern/mobile.js', 'createMobileRouter'],
    ['../routes/geraete.js', 'createGeraeteRouter'],
  ];
  for (const [rel, exportName] of specs) {
    const mod = await import(new URL(rel, import.meta.url).href);
    assert.equal(
      typeof mod[exportName],
      'function',
      `${rel} exportiert keine Funktion ${exportName}`,
    );
  }
});

test('GET /api/v1/users, auftraege, firmen, kunden, fusa/fahrzeuge — JSON 200', async (t) => {
  clearMysqlEnvForDeterministicSqlite();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }
  sqlitePath = path.join(tmpdir(), `cc-cockpit-api-stability-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const [{ openDatabase }, { signAccessToken }, { createApiV1Router }, { hashPassword }] = await Promise.all([
    import('../db/database.js'),
    import('../auth/jwt.js'),
    import('../routes/api-v1.js'),
    import('../auth/password.js'),
  ]);
  const { mountLegacyApiRemoved } = await import('../lib/legacy-api-removed.js');

  const store = await openDatabase();
  const firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: `Stability Test ${firmaId.slice(0, 8)}`,
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

  const userId = randomUUID();
  await store.insertUser({
    id: userId,
    email: `stability-${userId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('TestLocal!2026'),
    name: 'Stability',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userId, firmaId);

  const fusaProjectIdForDocs = randomUUID();
  await store.insertProject({ id: fusaProjectIdForDocs, name: 'Stability FUSA Dokumente', kundenId: null });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId,
    projectId: fusaProjectIdForDocs,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });
  const stabilityFahrzeugId = randomUUID();
  await store.insertFahrzeug({
    id: stabilityFahrzeugId,
    projectId: fusaProjectIdForDocs,
    kennung: 'STAB-SCH',
    typ: 'Transporter',
    kennzeichen: 'M-CC 1',
    status: 'aktiv',
    detailsJson: null,
  });
  const otherProjectId = randomUUID();
  await store.insertProject({ id: otherProjectId, name: 'Stability Fremdprojekt', kundenId: null });
  const otherFahrzeugId = randomUUID();
  await store.insertFahrzeug({
    id: otherFahrzeugId,
    projectId: otherProjectId,
    kennung: 'X-ISO',
    typ: 'PKW',
    kennzeichen: null,
    status: null,
    detailsJson: null,
  });
  const alienSchadenId = randomUUID();
  await store.insertSchaden({
    id: alienSchadenId,
    projectId: otherProjectId,
    fahrzeugId: otherFahrzeugId,
    titel: 'Isolation Fremd',
    beschreibung: null,
    status: 'offen',
    extraJson: null,
  });

  token = signAccessToken({ sub: userId, email: 'stability@cc-cockpit.local' });

  const app = express();
  app.use(express.json({ limit: '100kb' }));
  app.use('/api/v1', createApiV1Router(store));
  mountLegacyApiRemoved(app);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  serverOrigin = `http://127.0.0.1:${addr.port}`;

  async function apiGet(pathname) {
    const p = pathname.startsWith('/api/v1') ? pathname : `/api/v1${pathname.startsWith('/') ? '' : '/'}${pathname}`;
    const pathOnly = p.split('?')[0];
    const fullPath = pathOnly.startsWith('/api/v1') ? pathOnly : `/api/v1${pathOnly.startsWith('/') ? '' : '/'}${pathOnly}`;
    const headers = { authorization: `Bearer ${token}` };
    if (!isApiV1ProjectContextOptionalPath(fullPath)) {
      headers['x-project-id'] = fusaProjectIdForDocs;
    }
    const url = new URL(p, serverOrigin).toString();
    return httpJson('GET', url, { headers });
  }

  const cases = [
    {
      name: 'GET /api/v1/auth/my-rights (Envelope)',
      path: '/api/v1/auth/my-rights',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.equal(body?.data?.user_id, userId);
        assert.ok(body?.data?.global_role, 'data.global_role');
        assert.ok(body?.data?.rights && typeof body.data.rights === 'object', 'data.rights');
      },
    },
    {
      name: 'GET /api/v1/users',
      path: '/api/v1/users',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.users), 'body.data.users muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/auftraege',
      path: '/api/v1/auftraege',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/firmen',
      path: '/api/v1/firmen',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.firmen), 'body.data.firmen muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/kunden',
      path: '/api/v1/kunden',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.kunden), 'body.data.kunden muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/fusa/fahrzeuge (ersetzt nicht existentes GET /api/v1/fahrzeuge)',
      path: '/api/v1/fusa/fahrzeuge',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.fahrzeuge), 'body.data.fahrzeuge muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/fusa/quartale (Envelope, B4)',
      path: '/api/v1/fusa/quartale?jahr=2026',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.equal(typeof body?.data?.jahr, 'number');
        assert.ok(Array.isArray(body?.data?.quartale), 'body.data.quartale');
        assert.equal(body.data.quartale.length, 4);
      },
    },
    {
      name: 'GET /api/v1/crm/pipeline (Envelope, B5)',
      path: '/api/v1/crm/pipeline',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items');
      },
    },
    {
      name: 'GET /api/v1/fusa/dokumente',
      path: `/api/v1/fusa/dokumente?project_id=${fusaProjectIdForDocs}`,
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.dokumente), 'body.data.dokumente muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/fusa/angebote',
      path: `/api/v1/fusa/angebote?project_id=${fusaProjectIdForDocs}`,
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/mitarbeiter',
      path: `/api/v1/mitarbeiter?firma_id=${firmaId}`,
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/checklisten',
      path: `/api/v1/checklisten?firma_id=${firmaId}`,
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/produktion',
      path: `/api/v1/produktion?firma_id=${firmaId}`,
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/role-templates (Envelope)',
      path: '/api/v1/role-templates',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.templates), 'body.data.templates muss Array sein');
      },
    },
    {
      name: 'GET /api/v1/invites (Envelope)',
      path: '/api/v1/invites',
      assert: (res, body) => {
        assert.equal(res.status, 200, JSON.stringify(body));
        assert.equal(body?.success, true);
        assert.ok(Array.isArray(body?.data?.invites), 'body.data.invites muss Array sein');
      },
    },
  ];

  for (const c of cases) {
    await t.test(c.name, async () => {
      const { res, body } = await apiGet(c.path);
      c.assert(res, body);
    });
  }

  await t.test('GET users/firmen/kunden — kein Legacy-Root (A3.7)', async () => {
    for (const path of ['/api/v1/users', '/api/v1/firmen', '/api/v1/kunden']) {
      const { res, body } = await apiGet(path);
      assert.equal(res.status, 200, `${path}: ${JSON.stringify(body)}`);
      assert.equal(body?.success, true, path);
      assert.equal(body?.ok, undefined, path);
      assert.equal(body?.message, undefined, path);
      assert.equal(body?.users, undefined, path);
      assert.equal(body?.firmen, undefined, path);
      assert.equal(body?.kunden, undefined, path);
    }
  });

  await t.test('GET /api/v1/users/:id/rights (ok + data)', async () => {
    const { res, body } = await apiGet(`/api/v1/users/${encodeURIComponent(userId)}/rights`);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.data?.user_id, userId);
    assert.ok(body?.data?.rights && typeof body.data.rights === 'object', 'data.rights');
  });

  await t.test('PATCH /api/v1/users/:id (ok + data.user)', async () => {
    const url = new URL(`/api/v1/users/${encodeURIComponent(userId)}`, serverOrigin).toString();
    const { res, body } = await httpJson('PATCH', url, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: { name: 'Stability Patched' },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.data?.user?.name, 'Stability Patched');
  });

  await t.test('POST then DELETE /api/v1/users (ok + data)', async () => {
    const email = `stability-del-${randomUUID().slice(0, 8)}@cc-cockpit.local`;
    const postUrl = new URL('/api/v1/users', serverOrigin).toString();
    const { res: r1, body: b1 } = await httpJson('POST', postUrl, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: {
        email,
        name: 'Stability Delete Target',
        global_role: 'INTERN',
        company_id: firmaId,
        modules: ['cockpit'],
        rights: {},
      },
    });
    assert.equal(r1.status, 201, JSON.stringify(b1));
    assert.equal(b1?.success, true);
    const newId = b1?.data?.user?.id;
    assert.ok(newId && typeof newId === 'string', 'data.user.id');
    const delUrl = new URL(`/api/v1/users/${encodeURIComponent(newId)}`, serverOrigin).toString();
    const { res: r2, body: b2 } = await httpJson('DELETE', delUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(r2.status, 200, JSON.stringify(b2));
    assert.equal(b2?.success, true);
    assert.equal(b2?.data?.deleted, true);
    assert.equal(b2?.data?.id, newId);
  });

  await t.test('GET /api/v1/users ohne Authorization → 401', async () => {
    const url = new URL('/api/v1/users', serverOrigin).toString();
    const { res } = await httpJson('GET', url, { headers: {} });
    assert.equal(res.status, 401);
  });

  const schadenApiHeaders = {
    authorization: `Bearer ${token}`,
    'x-project-id': fusaProjectIdForDocs,
  };

  await t.test('GET /api/v1/schaeden (ok + data.schaeden)', async () => {
    const url = new URL('/api/v1/schaeden', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, { headers: schadenApiHeaders });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.schaeden), 'data.schaeden');
  });

  await t.test('GET /api/v1/schaeden ohne x-project-id → 400', async () => {
    const url = new URL('/api/v1/schaeden', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'PROJECT_CONTEXT_REQUIRED');
    assert.equal(body?.error?.message, 'Projekt-Kontext erforderlich.');
  });

  await t.test('GET /api/v1/schaeden/:id Fremdprojekt → 404 (Isolation)', async () => {
    const url = new URL(`/api/v1/schaeden/${encodeURIComponent(alienSchadenId)}`, serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, { headers: schadenApiHeaders });
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.success, false);
  });

  await t.test('POST / GET / PATCH / DELETE /api/v1/schaeden (ok + data)', async () => {
    const base = new URL('/api/v1/schaeden', serverOrigin).toString();
    const { res: r1, body: b1 } = await httpJson('POST', base, {
      headers: schadenApiHeaders,
      jsonBody: {
        fahrzeug_id: stabilityFahrzeugId,
        titel: 'Stability API Schaden',
        beschreibung: 'Text',
        status: 'offen',
      },
    });
    assert.equal(r1.status, 201, JSON.stringify(b1));
    assert.equal(b1?.success, true);
    const sid = b1?.data?.schaden?.id;
    assert.ok(sid && typeof sid === 'string', 'data.schaden.id');

    const oneUrl = new URL(`/api/v1/schaeden/${encodeURIComponent(sid)}`, serverOrigin).toString();
    const { res: r2, body: b2 } = await httpJson('GET', oneUrl, { headers: schadenApiHeaders });
    assert.equal(r2.status, 200, JSON.stringify(b2));
    assert.equal(b2?.success, true);
    assert.equal(b2?.data?.schaden?.id, sid);

    const { res: r3, body: b3 } = await httpJson('PATCH', oneUrl, {
      headers: schadenApiHeaders,
      jsonBody: { titel: 'Stability API Schaden 2' },
    });
    assert.equal(r3.status, 200, JSON.stringify(b3));
    assert.equal(b3?.success, true);
    assert.equal(b3?.data?.schaden?.titel, 'Stability API Schaden 2');

    const { res: r4, body: b4 } = await httpJson('DELETE', oneUrl, { headers: schadenApiHeaders });
    assert.equal(r4.status, 200, JSON.stringify(b4));
    assert.equal(b4?.success, true);
    assert.equal(b4?.data?.deleted, true);
    assert.equal(b4?.data?.id, sid);
  });

  await t.test('GET /api/v1/schaeden ohne Authorization → 401', async () => {
    const url = new URL('/api/v1/schaeden', serverOrigin).toString();
    const { res } = await httpJson('GET', url, {
      headers: { 'x-project-id': fusaProjectIdForDocs },
    });
    assert.equal(res.status, 401);
  });

  await t.test('GET /api/v1/firmen/:id (Envelope)', async () => {
    const { res, body } = await apiGet(`/api/v1/firmen/${encodeURIComponent(firmaId)}`);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(body?.data?.firma && typeof body.data.firma === 'object', 'body.data.firma');
    assert.ok(body?.data?.detail && typeof body.data.detail === 'object', 'body.data.detail');
  });

  await t.test('POST /api/v1/firmen (Envelope)', async () => {
    const newName = `Stability POST ${randomUUID().slice(0, 8)}`;
    const url = new URL('/api/v1/firmen', serverOrigin).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: { name: newName },
    });
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(body?.data?.firma?.id, 'body.data.firma.id');
    assert.equal(body?.data?.firma?.name, newName);
  });

  await t.test('PATCH /api/v1/firmen/:id (Envelope)', async () => {
    const url = new URL(`/api/v1/firmen/${encodeURIComponent(firmaId)}`, serverOrigin).toString();
    const { res, body } = await httpJson('PATCH', url, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: { name: 'Stability Firma PATCH' },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.equal(body?.data?.updated, true);
  });

  await t.test('GET /api/v1/ccintern/angebote (Envelope)', async () => {
    const url = new URL('/api/v1/ccintern/angebote', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-project-id': fusaProjectIdForDocs,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.angebote), 'body.data.angebote muss Array sein');
  });

  await t.test('GET /api/v1/anfragen und /ccintern/anfragen (Envelope, gleicher Router)', async () => {
    for (const p of ['/api/v1/anfragen', '/api/v1/ccintern/anfragen']) {
      const { res, body } = await apiGet(p);
      assert.equal(res.status, 200, JSON.stringify({ p, body }));
      assert.equal(body?.success, true, p);
      assert.ok(Array.isArray(body?.data?.anfragen), `${p}: body.data.anfragen`);
      assert.equal(typeof body?.data?.total, 'number', `${p}: body.data.total`);
    }
  });

  await t.test('GET /api/v1/urlaub (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/urlaub');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.urlaub), 'body.data.urlaub muss Array sein');
    assert.equal(typeof body?.data?.total, 'number', 'body.data.total');
  });

  await t.test('GET /api/v1/lager (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/lager');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.lager), 'body.data.lager muss Array sein');
    assert.equal(typeof body?.data?.total, 'number', 'body.data.total');
  });

  await t.test('GET /api/v1/fusa/termine (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/termine');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.termine), 'body.data.termine muss Array sein');
  });

  await t.test('GET /api/v1/kalender (Envelope, A3.1)', async () => {
    const { res, body } = await apiGet('/api/v1/kalender');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.termine), 'body.data.termine muss Array sein');
    assert.equal(typeof body?.data?.total, 'number', 'body.data.total');
    assert.equal(body?.ok, undefined, 'kein Legacy ok auf Root');
    assert.equal(body?.error, undefined, 'kein Legacy error auf Root');
    assert.equal(body?.message, undefined, 'kein Legacy message auf Root');
  });

  await t.test('GET /api/v1/kalender?typ=invalid (Fehler-Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/kalender?typ=invalidtyp');
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.ok(body?.error?.code, 'error.code');
    assert.equal(typeof body?.error?.message, 'string', 'error.message');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/ccintern/auftraege (Envelope, A3.2 gleicher Router wie /auftraege)', async () => {
    const { res, body } = await apiGet('/api/v1/ccintern/auftraege');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.items), 'body.data.items muss Array sein');
    assert.ok(body?.data?.pagination && typeof body.data.pagination === 'object', 'body.data.pagination');
    assert.equal(body?.ok, undefined, 'kein Legacy ok auf Root');
    assert.equal(body?.error, undefined, 'kein Legacy error auf Root');
    assert.equal(body?.message, undefined, 'kein Legacy message auf Root');
  });

  await t.test('GET /api/v1/auftraege/:id nicht gefunden (A3.2 Fehler-Envelope)', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000099';
    const { res, body } = await apiGet(`/api/v1/auftraege/${fakeId}`);
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'NOT_FOUND');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('POST /api/v1/auftraege ohne kunde (A3.2 Validierung)', async () => {
    const url = new URL('/api/v1/auftraege', serverOrigin).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-project-id': fusaProjectIdForDocs,
      },
      jsonBody: {},
    });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'VALIDATION_ERROR');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/ccintern/kunden (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/ccintern/kunden');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.kunden), 'body.data.kunden muss Array sein');
  });

  await t.test('GET /api/v1/fusa/rechnungen (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/rechnungen');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.rechnungen), 'body.data.rechnungen muss Array sein');
  });

  await t.test('GET /api/v1/fusa/auftraege (Envelope, A3.3)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/auftraege');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.auftraege), 'body.data.auftraege muss Array sein');
    assert.equal(body?.ok, undefined, 'kein Legacy ok auf Root');
    assert.equal(body?.error, undefined, 'kein Legacy error auf Root');
    assert.equal(body?.message, undefined, 'kein Legacy message auf Root');
  });

  await t.test('GET /api/v1/fusa/auftraege/form-meta (Envelope, A3.3)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/auftraege/form-meta');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(body?.data?.form_meta != null, 'body.data.form_meta');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
  });

  await t.test('POST /api/v1/fusa/auftraege/:id/freigeben — unbekannte ID (A3.3 Fehler-Envelope)', async () => {
    const url = new URL(
      '/api/v1/fusa/auftraege/00000000-0000-0000-0000-000000000099/freigeben',
      serverOrigin,
    ).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-project-id': fusaProjectIdForDocs,
      },
      jsonBody: {},
    });
    assert.equal(res.status, 404, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'NOT_FOUND');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/fusa/fahrzeuge (Envelope, A3.4)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/fahrzeuge');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.fahrzeuge), 'body.data.fahrzeuge');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /auftraege → 410 LEGACY_REMOVED (A4)', async () => {
    const url = new URL('/auftraege', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(res.status, 410, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'LEGACY_REMOVED');
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/auftraege → 200 (Nachfolger, A4)', async () => {
    const { res, body } = await apiGet('/api/v1/auftraege');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.items), 'body.data.items');
  });

  await t.test('Legacy-Root-Stichprobe → 410 LEGACY_REMOVED (A4)', async () => {
    for (const path of ['/fahrzeuge', '/users', '/kunden', '/schaeden', '/angebote', '/projects']) {
      const url = new URL(path, serverOrigin).toString();
      const { res, body } = await httpJson('GET', url, {
        headers: { authorization: `Bearer ${token}` },
      });
      assert.equal(res.status, 410, `${path}: ${JSON.stringify(body)}`);
      assert.equal(body?.error?.code, 'LEGACY_REMOVED', path);
    }
  });

  await t.test('GET /api/v1/messeflow/workspace (Envelope, A3.5)', async () => {
    const { res, body } = await apiGet('/api/v1/messeflow/workspace');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Object.prototype.hasOwnProperty.call(body?.data || {}, 'workspace'));
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('GET /api/v1/messeflow/projekte Workspace-Liste (Envelope, A3.5)', async () => {
    const { res, body } = await apiGet('/api/v1/messeflow/projekte');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.projekte));
    assert.equal(body?.ok, undefined);
  });

  await t.test('GET /api/v1/projects (Envelope, A3.6)', async () => {
    const { res, body } = await apiGet('/api/v1/projects');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.projects), 'body.data.projects muss Array sein');
    assert.equal(body?.projects, undefined, 'kein Legacy projects auf Root');
    assert.equal(body?.ok, undefined);
    assert.equal(body?.error, undefined);
    assert.equal(body?.message, undefined);
  });

  await t.test('POST /api/v1/projects ohne name — Validierung Envelope (A3.6)', async () => {
    const url = new URL('/api/v1/projects', serverOrigin).toString();
    const { res, body } = await httpJson('POST', url, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: {},
    });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.equal(body?.success, false);
    assert.equal(body?.error?.code, 'VALIDATION_ERROR');
    assert.equal(body?.message, undefined, 'kein Legacy message auf Root');
  });

  await t.test('GET /api/v1/messeflow/pruef-server/status — Envelope bei Upstream-Fehler', async () => {
    const url = new URL('/api/v1/messeflow/pruef-server/status', serverOrigin).toString();
    const { res, body } = await httpJson('GET', url, {
      headers: {
        authorization: `Bearer ${token}`,
        'x-project-id': fusaProjectIdForDocs,
      },
    });
    if (res.status === 502) {
      assert.equal(body?.success, false, JSON.stringify(body));
      assert.equal(body?.error?.code, 'BAD_GATEWAY');
      assert.equal(typeof body?.error?.message, 'string');
      assert.equal(body?.ok, undefined);
      assert.equal(body?.message, undefined);
    } else {
      assert.equal(res.status, 200);
    }
  });

  await t.test('GET /api/v1/fusa/kunden (Envelope)', async () => {
    const { res, body } = await apiGet('/api/v1/fusa/kunden');
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.kunden), 'body.data.kunden muss Array sein');
  });

  await t.test('GET /api/v1/aufgaben (Envelope)', async () => {
    const { res, body } = await apiGet(`/api/v1/aufgaben?firma_id=${firmaId}`);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body?.success, true);
    assert.ok(Array.isArray(body?.data?.aufgaben), 'body.data.aufgaben muss Array sein');
    assert.equal(typeof body?.data?.total, 'number', 'body.data.total');
  });

  await t.test('GET /api/v1/rechnungen und /ccintern/rechnungen (Envelope, gleicher Router)', async () => {
    for (const p of ['/api/v1/rechnungen', '/api/v1/ccintern/rechnungen']) {
      const { res, body } = await apiGet(`${p}?firma_id=${firmaId}`);
      assert.equal(res.status, 200, JSON.stringify({ p, body }));
      assert.equal(body?.success, true, p);
      assert.ok(Array.isArray(body?.data?.rechnungen), `${p}: body.data.rechnungen`);
      assert.equal(typeof body?.data?.total, 'number', `${p}: body.data.total`);
      assert.equal(typeof body?.data?.page, 'number', `${p}: body.data.page`);
      assert.equal(typeof body?.data?.limit, 'number', `${p}: body.data.limit`);
    }
  });

  await t.test('POST + DELETE /api/v1/role-templates (Envelope)', async () => {
    const url = new URL('/api/v1/role-templates', serverOrigin).toString();
    const { res: rPost, body: bPost } = await httpJson('POST', url, {
      headers: { authorization: `Bearer ${token}` },
      jsonBody: {
        name: 'Stability RoleTpl',
        description: '',
        modules: ['cockpit'],
        rights: { cockpit: { rollen: { sehen: true } } },
      },
    });
    assert.equal(rPost.status, 201, JSON.stringify(bPost));
    assert.equal(bPost?.success, true);
    assert.ok(bPost?.data?.template?.id, 'data.template.id');
    const tid = String(bPost.data.template.id);
    const delUrl = new URL(`/api/v1/role-templates/${encodeURIComponent(tid)}`, serverOrigin).toString();
    const { res: rDel, body: bDel } = await httpJson('DELETE', delUrl, {
      headers: { authorization: `Bearer ${token}` },
    });
    assert.equal(rDel.status, 200, JSON.stringify(bDel));
    assert.equal(bDel?.success, true);
    assert.equal(bDel?.data?.deleted, true);
    assert.equal(bDel?.data?.id, tid);
  });

  await t.test('GET /api/v1/fahrzeuge — nicht als API-v1-Route registriert (404 erwartet)', async () => {
    const { res, body } = await apiGet('/api/v1/fahrzeuge');
    assert.equal(res.status, 404, `Erwartet 404 ohne Crash, erhalten ${res.status}: ${JSON.stringify(body).slice(0, 200)}`);
  });
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
