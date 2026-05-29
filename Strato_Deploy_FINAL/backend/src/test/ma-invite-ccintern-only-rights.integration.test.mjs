/**
 * Regression: ccintern-only Invite ohne Rechte-JSON darf nach Redeem nicht leer landen.
 * Simuliert UI-Fix ensureMitarbeiterAppRightsOnSubmit + POST/Redeem/my-rights.
 */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';
import { hashPassword } from '../auth/password.js';
import { generateInviteToken } from '../auth/invite-token.js';
import { normalizeInviteAccessForRedeem } from '../auth/invite-redeem-normalize.js';
import { accessProfileToJson, loadAccessProfile } from '../auth/access-profile.js';
import { normalizeRightsJson } from '../auth/rights-spec.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const toImport = (rel) => pathToFileURL(path.join(__dirname, rel)).href;

const MITARBEITER_APP_INVITE_RIGHTS = {
  ccintern: {
    mitarbeiter: normalizeRightsJson({ sehen: true }),
    mitarbeiterapp: normalizeRightsJson({ sehen: true, erstellen: true, bearbeiten: true }),
    urlaub: normalizeRightsJson({ sehen: true, erstellen: true, bearbeiten: true }),
    materiallager: normalizeRightsJson({ sehen: true, erstellen: true, bearbeiten: true }),
    auftraege: normalizeRightsJson({ sehen: true, bearbeiten: true }),
    produktion: normalizeRightsJson({ sehen: true, erstellen: true, bearbeiten: true }),
    checklisten: normalizeRightsJson({ sehen: true, bearbeiten: true }),
    kommunikation: normalizeRightsJson({ sehen: true, erstellen: true, bearbeiten: true }),
  },
};

function ensureMitarbeiterAppRightsOnSubmit(modules, rights) {
  if (modules.length !== 1 || modules[0] !== 'ccintern') return rights;
  const ci = rights?.ccintern;
  if (ci && typeof ci === 'object' && !Array.isArray(ci)) {
    for (const b of Object.keys(ci)) {
      const row = ci[b];
      if (row && typeof row === 'object' && Object.keys(row).some((k) => row[k])) return rights;
    }
  }
  return { ...MITARBEITER_APP_INVITE_RIGHTS };
}

function deriveShellUiAccess(bundle) {
  const CCINTERN_BEREICHE_NICHT_DESKTOP = new Set([
    'mitarbeiter',
    'mitarbeiterapp',
    'urlaub',
    'produktion',
    'auftraege',
    'materiallager',
    'checklisten',
    'kalender',
    'kommunikation',
  ]);
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = bundle.modules || [];
  const moduleHasAnySehen = (mod) => {
    const block = bundle.rights?.[mod];
    if (!block) return false;
    return Object.keys(block).some((b) => block[b]?.sehen);
  };
  const canSeeCockpit = isSa || (mods.includes('cockpit') && moduleHasAnySehen('cockpit'));
  const canSeeFusa = isSa || (mods.includes('fusa') && moduleHasAnySehen('fusa'));
  const hasCcinternMod = isSa || mods.includes('ccintern');
  const canSeeMitarbeiterApp =
    isSa || (hasCcinternMod && bundle.rights?.ccintern?.mitarbeiterapp?.sehen);
  let canSeeCcInternDesktop = false;
  if (isSa) canSeeCcInternDesktop = true;
  else if (hasCcinternMod && bundle.rights?.ccintern) {
    for (const bereich of Object.keys(bundle.rights.ccintern)) {
      if (CCINTERN_BEREICHE_NICHT_DESKTOP.has(bereich)) continue;
      if (bundle.rights.ccintern[bereich]?.sehen) {
        canSeeCcInternDesktop = true;
        break;
      }
    }
  }
  const isMitarbeiterAppOnlyShell =
    !isSa &&
    canSeeMitarbeiterApp &&
    !canSeeCcInternDesktop &&
    !canSeeCockpit &&
    !canSeeFusa;
  return { isMitarbeiterAppOnlyShell, canSeeFusa, canSeeCockpit, canSeeMitarbeiterApp };
}

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASSWORD', 'MYSQL_DATABASE', 'MYSQL_PORT']) {
    delete process.env[k];
  }
}

/** @type {import('../db/database.js').Awaited<ReturnType<import('../db/database.js').openDatabase>>} */
let store;
let sqlitePath = '';

test.before(async () => {
  clearMysqlEnvForDeterministicSqlite();
  if (!process.env.JWT_SECRET?.trim()) {
    process.env.JWT_SECRET = 'test-jwt-secret-mindestens-32-zeichen-lang!!';
  }
  sqlitePath = path.join(tmpdir(), `cc-ma-invite-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  try {
    fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }
  const { openDatabase } = await import(toImport('../db/database.js'));
  store = await openDatabase();
  const firmaId = randomUUID();
  await store.insertFirma({
    id: firmaId,
    name: 'Test Firma',
    kundennummer: '',
    altnummer: '',
    typ: 'kunde',
    intern_extern: 'extern',
    umsatzsteuer_id: '',
    strasse: '',
    plz: '',
    ort: '',
    land: '',
    telefon: '',
    email: '',
    web: '',
    notiz: '',
  });
});

test.after(() => {
  try {
    if (sqlitePath) fs.rmSync(sqlitePath, { force: true });
  } catch {
    /* ignore */
  }
});

test('ccintern-only + leeres rights → UI-Helfer liefert App-Paket; Redeem → my-rights App-only', async () => {
  const email = `ma-empty-rights-${randomUUID().slice(0, 8)}@cc-cockpit.local`;
  const password = 'Test-MA-Invite!2026';
  const firmaRows = await store.listFirmen();
  const firmaId = String(firmaRows[0].id);

  const modules = ['ccintern'];
  const rightsUi = {};
  const rightsForInvite = ensureMitarbeiterAppRightsOnSubmit(modules, rightsUi);
  assert.ok(rightsForInvite.ccintern?.mitarbeiterapp?.sehen, 'UI-Helfer setzt mitarbeiterapp.sehen');
  assert.ok(rightsForInvite.ccintern?.mitarbeiter?.sehen, 'UI-Helfer setzt mitarbeiter.sehen (Stamm lesen)');

  const storedAccess = normalizeInviteAccessForRedeem(modules, rightsForInvite);
  const inviteId = randomUUID();
  const token = generateInviteToken();
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await store.insertCockpitInvite({
    id: inviteId,
    email,
    globalRole: 'INTERN',
    modulesJson: JSON.stringify(storedAccess.modules),
    areasJson: JSON.stringify([]),
    rightsJson: JSON.stringify(storedAccess.rights),
    firmaId,
    token,
    expiresAtIso: exp.toISOString(),
    createdByUserId: null,
  });

  const row = await store.getCockpitInviteByToken(token);
  assert.equal(row.rights_json, JSON.stringify(storedAccess.rights));

  const redeem = await store.redeemCockpitInviteAtomic(token, await hashPassword(password));
  assert.equal(redeem.ok, true);

  const uid = String(redeem.user.id);
  const modRows = await store.listUserModules(uid);
  assert.deepEqual(
    modRows.map((r) => r.module),
    ['ccintern'],
  );
  const rightRows = await store.listUserRights(uid);
  const maRow = rightRows.find((r) => r.module === 'ccintern' && r.bereich === 'mitarbeiterapp');
  assert.ok(maRow, 'mitarbeiterapp user_rights Zeile');
  const flags = JSON.parse(maRow.rechte_json);
  assert.equal(flags.sehen, true);

  const profile = await loadAccessProfile(store, uid);
  const bundle = accessProfileToJson(profile);
  const ui = deriveShellUiAccess(bundle);

  assert.deepEqual(bundle.modules, ['ccintern']);
  assert.equal(bundle.rights?.ccintern?.mitarbeiterapp?.sehen, true);
  assert.equal(bundle.rights?.ccintern?.mitarbeiter?.sehen, true);
  assert.equal(profile.has('ccintern', 'mitarbeiter', 'sehen'), true);
  assert.equal(ui.isMitarbeiterAppOnlyShell, true);
  assert.equal(ui.canSeeFusa, false);
  assert.equal(ui.canSeeCockpit, false);
  assert.equal(ui.canSeeMitarbeiterApp, true);
});

test('Regression: ccintern-only Invite mit rights_json {} zerstört App-Zugang (IST-Bug)', async () => {
  const email = `ma-bug-empty-${randomUUID().slice(0, 8)}@cc-cockpit.local`;
  const password = 'Test-MA-Bug!2026';
  const firmaRows = await store.listFirmen();
  const firmaId = String(firmaRows[0].id);

  const inviteId = randomUUID();
  const token = generateInviteToken();
  const exp = new Date();
  exp.setFullYear(exp.getFullYear() + 1);
  await store.insertCockpitInvite({
    id: inviteId,
    email,
    globalRole: 'INTERN',
    modulesJson: JSON.stringify(['ccintern']),
    areasJson: JSON.stringify([]),
    rightsJson: '{}',
    firmaId,
    token,
    expiresAtIso: exp.toISOString(),
    createdByUserId: null,
  });

  const redeem = await store.redeemCockpitInviteAtomic(token, await hashPassword(password));
  assert.equal(redeem.ok, true);
  const uid = String(redeem.user.id);
  const rightRows = await store.listUserRights(uid);
  assert.equal(rightRows.length, 0, 'leeres Invite-Rechtepaket → keine user_rights');

  const bundle = accessProfileToJson(await loadAccessProfile(store, uid));
  const ui = deriveShellUiAccess(bundle);
  assert.equal(bundle.modules?.includes('ccintern'), true);
  assert.equal(bundle.rights?.ccintern?.mitarbeiterapp?.sehen, false);
  assert.equal(ui.canSeeMitarbeiterApp, false);
  assert.equal(ui.isMitarbeiterAppOnlyShell, false);
});
