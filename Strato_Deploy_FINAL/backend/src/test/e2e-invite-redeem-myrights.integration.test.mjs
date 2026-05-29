/**
 * Pflicht-E2E (API-Schicht): Einladung → öffentliche Aktivierung → Login → my-rights → PATCH access → Stabilität.
 * Simuliert „Okan“-Profil: nur Modul ccintern, App-Bereiche mit sehen, kein Cockpit/FUSA-Desktop.
 *
 * Hinweis: Kein laufender Port 5371/3000 nötig — temporäre SQLite-DB + eingebetteter HTTP-Server.
 * Frontend-POST /api/v1/users: statisch durch `npm run test:pflicht-audit` (ApiAdapter/SyncAdapter).
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
import { createApiV1Router } from '../routes/api-v1.js';
import { createAuthRouter } from '../routes/auth.js';
import { createInvitePublicRouter } from '../routes/invite-public.js';
import { hashPassword } from '../auth/password.js';

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
let adminId = '';
let projectId = '';
let adminToken = '';
let inviteeEmail = '';
/** @type {string} */
let seedFirmaId = '';
const inviteePassword = 'E2E-Okan-Pflicht!2026';

/** Rechte-Paket wie Mitarbeiter-App (nur ccintern, mehrere Bereiche sehen). */
const INVITE_RIGHTS = {
  ccintern: {
    mitarbeiter: { sehen: true },
    mitarbeiterapp: { sehen: true },
    produktion: { sehen: true },
    auftraege: { sehen: true },
    materiallager: { sehen: true },
    checklisten: { sehen: true },
    urlaub: { sehen: true, schreiben: true },
  },
};

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

function apiV1(method, pathname, token, { jsonBody = null, projectHeader = null } = {}) {
  const p = String(pathname || '');
  const path = p.startsWith('/api/v1') ? p : `/api/v1${p.startsWith('/') ? '' : '/'}${p}`;
  const url = new URL(path, serverOrigin).toString();
  const h = {
    authorization: `Bearer ${token}`,
    ...(projectHeader ? { 'x-project-id': projectHeader } : {}),
  };
  return httpJson(method, url, { headers: h, jsonBody });
}

function logSection(title, obj) {
  console.log(`\n── ${title} ──\n${JSON.stringify(obj, null, 2)}`);
}

before(async () => {
  clearMysqlEnvForDeterministicSqlite();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }
  sqlitePath = path.join(tmpdir(), `cc-cockpit-e2e-invite-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const { openDatabase } = await import(toImport('../db/database.js'));
  store = await openDatabase();

  seedFirmaId = randomUUID();
  await store.insertFirma({
    id: seedFirmaId,
    name: 'E2E Firma',
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
    ansprechpartner_vorname: 'E2E',
    ansprechpartner_nachname: 'Admin',
    ansprechpartner_email: '',
    ansprechpartner_telefon: '',
    interne_notiz: '',
    erweiterung_json: null,
  });

  adminId = randomUUID();
  await store.insertUser({
    id: adminId,
    email: `e2e-admin-${adminId.slice(0, 8)}@cc-cockpit.local`,
    passwordHash: hashPassword('AdminE2E!2026'),
    name: 'E2E Super-Admin',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(adminId, seedFirmaId);

  projectId = randomUUID();
  await store.insertProject({ id: projectId, name: 'E2E Projekt', kundenId: null });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId: adminId,
    projectId,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });

  const app = express();
  app.use(express.json({ limit: '200kb' }));
  app.use('/api/v1', createApiV1Router(store));
  app.use('/auth', createAuthRouter(store));
  app.use('/invites', createInvitePublicRouter(store));

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  serverOrigin = `http://127.0.0.1:${addr.port}`;

  const login = await httpJson('post', `${serverOrigin}/auth/login`, {
    jsonBody: { email: `e2e-admin-${adminId.slice(0, 8)}@cc-cockpit.local`, password: 'AdminE2E!2026' },
  });
  assert.equal(login.res.status, 200, JSON.stringify(login.body));
  adminToken = login.body.access_token;
  assert.ok(typeof adminToken === 'string' && adminToken.length > 10);

  inviteeEmail = `okan-e2e-${randomUUID().slice(0, 8)}@cc-cockpit.local`;
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

test('E2E: Invite → Activate → my-rights → DB → PATCH → erneut my-rights (App-only-Paket)', async (t) => {
  /** @type {string} */
  let token = '';
  /** @type {string} */
  let inviteeUserId = '';

  const { deriveShellUiAccess, debugExplainShellUiAccess } = await import(
    pathToFileURL(path.join(__dirname, '../../../frontend/core/access/cc-my-rights.js')).href,
  );

  await t.test('Schritt 1: POST /api/v1/invites (modules + rights_json)', async () => {
    const { res, body } = await apiV1(
      'post',
      '/invites',
      adminToken,
      {
        jsonBody: {
          email: inviteeEmail,
          global_role: 'INTERN',
          modules: ['ccintern'],
          rights: INVITE_RIGHTS,
          firma_id: seedFirmaId,
        },
      },
    );
    assert.equal(res.status, 201, JSON.stringify(body));
    assert.equal(body.success, true);
    token = body.data?.invite?.token;
    assert.ok(token && typeof token === 'string');
    const storedMods = body.data?.invite?.modules;
    assert.ok(Array.isArray(storedMods) && storedMods.includes('ccintern'));
    logSection('invite response (Auszug)', {
      modules: body.data?.invite?.modules,
      rightsKeys: body.data?.invite?.rights ? Object.keys(body.data.invite.rights) : [],
    });
  });

  await t.test('Schritt 2: GET /invites/:token (öffentlich)', async () => {
    const { res, body } = await httpJson('get', `${serverOrigin}/invites/${encodeURIComponent(token)}`);
    assert.equal(res.status, 200);
    assert.ok(body.invite);
    assert.deepEqual(body.invite.modules, ['ccintern']);
    assert.equal(body.invite.rights?.ccintern?.mitarbeiterapp?.sehen, true);
  });

  await t.test('Schritt 3: POST /invites/:token/activate', async () => {
    const { res, body } = await httpJson('post', `${serverOrigin}/invites/${encodeURIComponent(token)}/activate`, {
      jsonBody: { password: inviteePassword, password_confirm: inviteePassword },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.ok, true);
    inviteeUserId = String(body.user?.id || '').trim();
    assert.ok(inviteeUserId.length > 0);

    const row = await store.getCockpitInviteByToken(token);
    assert.ok(row);
    assert.equal(String(row.status), 'eingeloest');

    const modRows = await store.listUserModules(inviteeUserId);
    const mods = modRows.map((r) => r.module);
    assert.deepEqual(mods, ['ccintern']);
    const rightsRows = await store.listUserRights(inviteeUserId);
    assert.ok(rightsRows.length >= 6, 'user_rights Zeilen erwartet');
    logSection('user_modules nach Redeem', mods);
    logSection('user_rights nach Redeem (Kurz)', rightsRows.map((r) => `${r.module}.${r.bereich}`));

    await store.insertProjectAccess({
      id: randomUUID(),
      userId: inviteeUserId,
      projectId,
      role: 'mitarbeiter',
      canViewPrices: false,
      canEdit: true,
      canCreateAuftraege: false,
    });
  });

  /** @param {string} accessTok */
  async function fetchMyRightsBundle(accessTok) {
    const { res, body } = await apiV1('get', '/auth/my-rights', accessTok);
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
    return body.data;
  }

  await t.test('Schritt 4: Login Invitee + GET /api/v1/auth/my-rights + deriveShellUiAccess', async () => {
    const login = await httpJson('post', `${serverOrigin}/auth/login`, {
      jsonBody: { email: inviteeEmail, password: inviteePassword },
    });
    assert.equal(login.res.status, 200);
    const accessTok = login.body.access_token;
    const bundle = await fetchMyRightsBundle(accessTok);
    logSection('GET /api/v1/auth/my-rights (vollständig)', bundle);

    const ui = deriveShellUiAccess(bundle);
    logSection('deriveShellUiAccess', ui);
    logSection('debugExplainShellUiAccess', debugExplainShellUiAccess(bundle));
    assert.equal(ui.isMitarbeiterAppOnlyShell, true);
    assert.equal(ui.canSeeMitarbeiterApp, true);
    assert.equal(ui.canSeeCcInternDesktop, false);
    assert.equal(ui.canSeeCockpit, false);
    assert.equal(ui.canSeeFusa, false);

    assert.ok(bundle.modules?.includes('ccintern'));
    assert.equal(bundle.rights?.ccintern?.auftraege?.sehen, true);
    assert.equal(bundle.rights?.ccintern?.materiallager?.sehen, true);
    assert.equal(bundle.rights?.ccintern?.urlaub?.sehen, true);

    const aufList = await apiV1('get', '/ccintern/auftraege?page=1&limit=5', accessTok, {
      projectHeader: projectId,
    });
    assert.equal(aufList.res.status, 200, JSON.stringify(aufList.body));
    assert.equal(aufList.body.success, true);
    assert.ok(Array.isArray(aufList.body.data?.items), 'ccintern/auftraege liefert data.items (kein Fallback-Array)');

    const urlaubGet = await apiV1('get', '/urlaub', accessTok, { projectHeader: projectId });
    assert.equal(urlaubGet.res.status, 200, JSON.stringify(urlaubGet.body));
    assert.equal(urlaubGet.body.success, true);

    const maGet = await apiV1('get', '/ccintern/mitarbeiter/status', accessTok, { projectHeader: projectId });
    assert.equal(maGet.res.status, 200, JSON.stringify(maGet.body));
    assert.equal(maGet.body.success, true);
    assert.ok(Array.isArray(maGet.body.data?.status));
    logSection('API-Sanity (Invitee, x-project-id)', {
      auftraegeStatus: aufList.res.status,
      urlaubStatus: urlaubGet.res.status,
      mitarbeiterStatus: maGet.res.status,
    });
  });

  await t.test('Schritt 5: PATCH /api/v1/users/:id/access (gleiche Rechte) — Idempotenz', async () => {
    const { res, body } = await apiV1('patch', `/users/${encodeURIComponent(inviteeUserId)}/access`, adminToken, {
      jsonBody: {
        global_role: 'INTERN',
        modules: ['ccintern'],
        rights: INVITE_RIGHTS,
      },
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(body.success, true);
  });

  await t.test('Schritt 6: erneut Login + my-rights unverändert (Reload-Simulation)', async () => {
    const login = await httpJson('post', `${serverOrigin}/auth/login`, {
      jsonBody: { email: inviteeEmail, password: inviteePassword },
    });
    assert.equal(login.res.status, 200);
    const bundle = await fetchMyRightsBundle(login.body.access_token);
    assert.ok(bundle.modules?.includes('ccintern'));
    assert.equal(bundle.rights?.ccintern?.produktion?.sehen, true);
    const ui = deriveShellUiAccess(bundle);
    assert.equal(ui.isMitarbeiterAppOnlyShell, true);
    logSection('my-rights nach PATCH (Auszug)', {
      modules: bundle.modules,
      ccinternBereiche: bundle.rights?.ccintern ? Object.keys(bundle.rights.ccintern) : [],
      deriveShellUiAccess: ui,
    });
  });

  await t.test('Negativ: POST /api/v1/users als Invitee → 403 (kein Benutzer anlegen)', async () => {
    const login = await httpJson('post', `${serverOrigin}/auth/login`, {
      jsonBody: { email: inviteeEmail, password: inviteePassword },
    });
    assert.equal(login.res.status, 200);
    const tok = login.body.access_token;
    const { res, body } = await apiV1(
      'post',
      '/users',
      tok,
      {
        jsonBody: {
          email: 'should-not-exist@cc-cockpit.local',
          name: 'X',
          modules: ['ccintern'],
          global_role: 'INTERN',
        },
      },
    );
    assert.equal(res.status, 403, JSON.stringify(body));
  });
});
