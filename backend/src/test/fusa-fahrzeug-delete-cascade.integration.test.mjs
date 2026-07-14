import assert from 'node:assert/strict';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { after, test } from 'node:test';

let sqlitePath = '';

function clearMysqlEnvForDeterministicSqlite() {
  for (const k of ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_DATABASE', 'MYSQL_PASSWORD', 'MYSQL_PORT', 'MYSQL_SSL']) {
    delete process.env[k];
  }
}

async function openTempStore() {
  clearMysqlEnvForDeterministicSqlite();
  sqlitePath = path.join(tmpdir(), `cc-cockpit-fusa-fahrzeug-delete-${randomUUID()}.db`);
  process.env.SQLITE_DB_PATH = sqlitePath;
  fs.rmSync(sqlitePath, { force: true });
  const { openDatabase } = await import(`../db/database.js?test=${randomUUID()}`);
  return openDatabase();
}

after(() => {
  if (sqlitePath) fs.rmSync(sqlitePath, { force: true });
  delete process.env.SQLITE_DB_PATH;
});

test('deleteFahrzeugCascade deletes vehicle-owned Auftrag and Schaden, but only detaches shared Auftrag', async () => {
  const store = await openTempStore();
  const projectId = randomUUID();
  const vehicleA = randomUUID();
  const vehicleB = randomUUID();
  const singleVehicleAuftrag = randomUUID();
  const sharedAuftrag = randomUUID();
  const schadenId = randomUUID();

  await store.insertProject({ id: projectId, name: 'Cascade Test', kundenId: null });
  await store.insertFahrzeug({
    id: vehicleA,
    projectId,
    kennung: 'Bus A',
    typ: 'Bus',
    kennzeichen: null,
    status: 'aktiv',
    detailsJson: null,
  });
  await store.insertFahrzeug({
    id: vehicleB,
    projectId,
    kennung: 'Bus B',
    typ: 'Bus',
    kennzeichen: null,
    status: 'aktiv',
    detailsJson: null,
  });

  const insertedSingle = await store.insertAuftragWithFusaBelegungen({
    id: singleVehicleAuftrag,
    title: 'Nur Bus A',
    projectId,
    status: 'geplant',
    termin: '2026-07-01',
    terminEnde: '2026-07-02',
    fusaFahrzeugIds: JSON.stringify([vehicleA]),
  });
  assert.equal(insertedSingle.ok, true);

  const insertedShared = await store.insertAuftragWithFusaBelegungen({
    id: sharedAuftrag,
    title: 'Bus A und Bus B',
    projectId,
    status: 'geplant',
    termin: '2026-07-05',
    terminEnde: '2026-07-06',
    fusaFahrzeugIds: JSON.stringify([vehicleA, vehicleB]),
  });
  assert.equal(insertedShared.ok, true);

  await store.insertSchaden({
    id: schadenId,
    projectId,
    fahrzeugId: vehicleA,
    titel: 'Glas',
    beschreibung: 'Glas defekt',
    status: 'offen',
    extraJson: null,
  });

  const result = await store.deleteFahrzeugCascade(vehicleA);
  assert.equal(result.ok, true);
  assert.equal(result.deletedAuftraege, 1);
  assert.equal(result.updatedAuftraege, 1);
  assert.equal(result.deletedSchaeden, 1);

  assert.equal(await store.getFahrzeugById(vehicleA), null);
  assert.ok(await store.getFahrzeugById(vehicleB));
  assert.equal(await store.getAuftragById(singleVehicleAuftrag), null);

  const sharedAfter = await store.getAuftragById(sharedAuftrag);
  assert.ok(sharedAfter);
  assert.deepEqual(JSON.parse(sharedAfter.fusa_fahrzeug_ids), [vehicleB]);

  const schaedenAfter = await store.listSchaedenForProject(projectId);
  assert.equal(schaedenAfter.some((s) => String(s.id) === schadenId), false);

  const belegungenAfter = await store.listFusaBelegungenOverlappendMitAuftragExtra(
    projectId,
    '2026-07-05',
    '2026-07-06',
    null,
  );
  assert.deepEqual(belegungenAfter.map((b) => String(b.fahrzeug_id)), [vehicleB]);
});
