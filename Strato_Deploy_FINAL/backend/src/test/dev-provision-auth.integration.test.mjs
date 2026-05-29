/**
 * DEV-ONLY: x-dev-provision-key — nur non-production + Loopback (siehe middleware/dev-provision-auth.js).
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { hashPassword } from '../auth/password.js';

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) delete process.env[k];
  }
}

async function httpJson(method, url, headers = {}) {
  const res = await fetch(url, {
    method,
    headers: { Accept: 'application/json', ...headers },
  });
  const text = await res.text();
  /** @type {unknown} */
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

async function seedMinimalStore(store, firmaId, userId, projectId) {
  await store.insertFirma({
    id: firmaId,
    name: 'Dev Prov Firma',
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
  await store.insertUser({
    id: userId,
    email: `devprov-${userId.slice(0, 6)}@cc-cockpit.local`,
    passwordHash: hashPassword('x'),
    name: 'Dev Prov',
    globalRole: 'SUPER_ADMIN',
  });
  await store.updateUserCompany(userId, firmaId);
  await store.insertProject({ id: projectId, name: 'Dev Prov Proj', kundenId: null });
  await store.insertProjectAccess({
    id: randomUUID(),
    userId,
    projectId,
    role: 'admin',
    canViewPrices: true,
    canEdit: true,
    canCreateAuftraege: true,
  });
}

test('dev-provision-auth: gültiger Header ohne Bearer → API 200 (non-production)', async () => {
  clearMysqlEnvForDeterministicSqlite();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevJwt = process.env.JWT_SECRET;
  const prevSqlite = process.env.SQLITE_DB_PATH;
  const prevKey = process.env.CC_DEV_PROVISION_KEY;

  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = prevJwt?.trim() || 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  const sqlitePath = path.join(tmpdir(), `cc-dev-prov-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  process.env.CC_DEV_PROVISION_KEY = 'test-dev-provision-key-ok';

  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const [{ openDatabase }, { createApiV1Router }] = await Promise.all([
    import('../db/database.js'),
    import('../routes/api-v1.js'),
  ]);
  const { mountLegacyApiRemoved } = await import('../lib/legacy-api-removed.js');

  const store = await openDatabase();
  const firmaId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  await seedMinimalStore(store, firmaId, userId, projectId);

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', createApiV1Router(store));
  mountLegacyApiRemoved(app);

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const origin = `http://127.0.0.1:${addr.port}`;

  try {
    const pathList = `/api/v1/checklisten?firma_id=${encodeURIComponent(firmaId)}`;
    const { res: rOk, body: bOk } = await httpJson('GET', new URL(pathList, origin).toString(), {
      'x-dev-provision-key': 'test-dev-provision-key-ok',
      'x-project-id': projectId,
    });
    assert.equal(rOk.status, 200, JSON.stringify(bOk));

    const { res: rBad } = await httpJson('GET', new URL(pathList, origin).toString(), {
      'x-dev-provision-key': 'wrong-key-xxxxxxxx',
      'x-project-id': projectId,
    });
    assert.equal(rBad.status, 401);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    await store.persist?.();
    try {
      fs.rmSync(sqlitePath, { force: true });
    } catch {
      /* ignore */
    }
    process.env.NODE_ENV = prevNodeEnv;
    if (prevKey !== undefined) process.env.CC_DEV_PROVISION_KEY = prevKey;
    else delete process.env.CC_DEV_PROVISION_KEY;
    if (prevSqlite !== undefined) process.env.SQLITE_DB_PATH = prevSqlite;
    else delete process.env.SQLITE_DB_PATH;
  }
});

test('dev-provision-auth: GET /auth/me mit Header (non-production)', async () => {
  clearMysqlEnvForDeterministicSqlite();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevJwt = process.env.JWT_SECRET;
  const prevSqlite = process.env.SQLITE_DB_PATH;
  const prevKey = process.env.CC_DEV_PROVISION_KEY;

  process.env.NODE_ENV = 'development';
  process.env.JWT_SECRET = prevJwt?.trim() || 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  const sqlitePath = path.join(tmpdir(), `cc-dev-prov-authme-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  process.env.CC_DEV_PROVISION_KEY = 'auth-me-dev-provision-key!!';

  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const { openDatabase } = await import('../db/database.js');
  const { createAuthRouter } = await import('../routes/auth.js');

  const store = await openDatabase();
  const firmaId = randomUUID();
  const userId = randomUUID();
  await seedMinimalStore(store, firmaId, userId, randomUUID());

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/auth', createAuthRouter(store));

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const origin = `http://127.0.0.1:${addr.port}`;

  try {
    const { res, body } = await httpJson('GET', new URL('/auth/me', origin).toString(), {
      'x-dev-provision-key': 'auth-me-dev-provision-key!!',
    });
    assert.equal(res.status, 200, JSON.stringify(body));
    assert.equal(/** @type {{ user?: { id?: string } }} */ (body).user?.id, userId);
  } finally {
    await new Promise((resolve) => server.close(() => resolve()));
    await store.persist?.();
    try {
      fs.rmSync(sqlitePath, { force: true });
    } catch {
      /* ignore */
    }
    process.env.NODE_ENV = prevNodeEnv;
    if (prevKey !== undefined) process.env.CC_DEV_PROVISION_KEY = prevKey;
    else delete process.env.CC_DEV_PROVISION_KEY;
    if (prevSqlite !== undefined) process.env.SQLITE_DB_PATH = prevSqlite;
    else delete process.env.SQLITE_DB_PATH;
  }
});
test('dev-provision-auth: Production → Header ignoriert (401 ohne Bearer)', async () => {
  clearMysqlEnvForDeterministicSqlite();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevJwt = process.env.JWT_SECRET;
  const prevSqlite = process.env.SQLITE_DB_PATH;
  const prevKey = process.env.CC_DEV_PROVISION_KEY;

  process.env.NODE_ENV = 'production';
  process.env.JWT_SECRET = prevJwt?.trim() || 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  const sqlitePath = path.join(tmpdir(), `cc-dev-prov-prod-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  process.env.CC_DEV_PROVISION_KEY = 'prod-should-not-work-xx';

  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }

  const [{ openDatabase }, { createApiV1Router }] = await Promise.all([
    import('../db/database.js'),
    import('../routes/api-v1.js'),
  ]);
  const { mountLegacyApiRemoved } = await import('../lib/legacy-api-removed.js');

  const store = await openDatabase();
  const firmaId = randomUUID();
  const userId = randomUUID();
  const projectId = randomUUID();
  await seedMinimalStore(store, firmaId, userId, projectId);

  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', createApiV1Router(store));
  mountLegacyApiRemoved(app);

  const srv = http.createServer(app);
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const addr = srv.address();
  assert.ok(addr && typeof addr === 'object');
  const o = `http://127.0.0.1:${addr.port}`;
  const pathList = `/api/v1/checklisten?firma_id=${encodeURIComponent(firmaId)}`;

  try {
    const { res } = await httpJson('GET', new URL(pathList, o).toString(), {
      'x-dev-provision-key': 'prod-should-not-work-xx',
      'x-project-id': projectId,
    });
    assert.equal(res.status, 401);
  } finally {
    await new Promise((resolve) => srv.close(() => resolve()));
    await store.persist?.();
    try {
      fs.rmSync(sqlitePath, { force: true });
    } catch {
      /* ignore */
    }
    process.env.NODE_ENV = prevNodeEnv;
    if (prevKey !== undefined) process.env.CC_DEV_PROVISION_KEY = prevKey;
    else delete process.env.CC_DEV_PROVISION_KEY;
    if (prevSqlite !== undefined) process.env.SQLITE_DB_PATH = prevSqlite;
    else delete process.env.SQLITE_DB_PATH;
  }
});
