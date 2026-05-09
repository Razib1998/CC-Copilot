/**
 * Audit-Log: sanitize + nicht-blockierendes Insert + keine Secrets in payload_json.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, before, test } from 'node:test';

import { logAudit, sanitizeAuditPayload } from '../lib/audit-log.js';

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    if (Object.prototype.hasOwnProperty.call(process.env, k)) delete process.env[k];
  }
}

test('sanitizeAuditPayload entfernt Passwort-/Token-ähnliche Felder', () => {
  const x = sanitizeAuditPayload({
    email: 'a@b.c',
    password: 'secret',
    nested: { api_token: 'x', ok: 1 },
    authorization: 'Bearer x',
  });
  assert.equal(x.email, 'a@b.c');
  assert.ok(!Object.prototype.hasOwnProperty.call(x, 'password'));
  assert.ok(!Object.prototype.hasOwnProperty.call(x, 'authorization'));
  const n = /** @type {Record<string, unknown>} */ (x.nested);
  assert.ok(!Object.prototype.hasOwnProperty.call(n, 'api_token'));
  assert.equal(n.ok, 1);
});

test('logAudit bricht bei Store-Fehler nicht ab (kein Throw)', async () => {
  let threw = false;
  try {
    await logAudit(
      {
        insertAuditLog() {
          throw new Error('simulated db failure');
        },
      },
      {
        user: { userId: randomUUID() },
        modul: 'test',
        action: 'POST',
        resource_type: 'x',
        resource_id: 'y',
        payload: { a: 1 },
      },
    );
  } catch {
    threw = true;
  }
  assert.equal(threw, false);
});

/** @type {string} */
let sqlitePath = '';
/** @type {any} */
let storeMod = null;

before(async () => {
  clearMysqlEnvForDeterministicSqlite();
  sqlitePath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-audit-')), 'test.db');
  process.env.SQLITE_DB_PATH = sqlitePath;
  const mod = await import('../db/database.js');
  storeMod = await mod.openDatabase();
});

test('SQLite: Schreibaktion erzeugt Audit-Zeile ohne Secrets in payload_json', async () => {
  assert.ok(storeMod);
  const store = /** @type {any} */ (storeMod);
  await logAudit(store, {
    user: { userId: 'user-audit-1' },
    modul: 'test',
    action: 'POST',
    resource_type: 'widget',
    resource_id: 'w1',
    project_id: null,
    payload: { password: 'must-not-persist', token: 't', label: 'ok' },
  });
  const rows = await store.listAuditLogEntries(5);
  assert.ok(Array.isArray(rows) && rows.length >= 1);
  const last = rows[0];
  const pj = last.payload_json != null ? JSON.parse(String(last.payload_json)) : {};
  assert.ok(!Object.prototype.hasOwnProperty.call(pj, 'password'));
  assert.ok(!Object.prototype.hasOwnProperty.call(pj, 'token'));
  assert.equal(pj.label, 'ok');
});

after(() => {
  try {
    if (sqlitePath && fs.existsSync(sqlitePath)) fs.unlinkSync(sqlitePath);
  } catch {
    /* ignore */
  }
  if (sqlitePath) {
    try {
      fs.rmdirSync(path.dirname(sqlitePath));
    } catch {
      /* ignore */
    }
  }
});
