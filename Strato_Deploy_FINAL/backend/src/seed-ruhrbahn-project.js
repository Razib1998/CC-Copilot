/**
 * Ruhrbahn-Demo-Projekt: Projekt + project_access + Stammdaten-Firma + FUSA-Fahrzeuge (idempotent).
 * Löscht keine Zeilen.
 *
 *   cd backend
 *   set JWT_SECRET=… (mind. 32 Zeichen, wie Server)
 *   npm run seed:test-user   (falls Testuser fehlt)
 *   npm run seed:ruhrbahn
 *
 * Optional:
 *   RUHRBAHN_PROJECT_NAME — Standard: „Standard (Demo / Ruhrbahn)“
 *   AUTH_SEED_EMAIL — welcher Benutzer project_access + Rechte bekommt (Default test@cc-cockpit.local)
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { openDatabase } from './db/database.js';
import { assertSeedSafeEnvironment } from './lib/seed-production-guard.js';
import { defaultFlagsForRole } from './auth/project-access-rules.js';

const DEFAULT_PROJECT_NAME = 'Standard (Demo / Ruhrbahn)';
/** Feste ID: mehrfaches Ausführen des Seeds ohne neue Firma. */
const RUHRBAHN_FIRMA_ID = 'f0000001-0001-4001-b001-00000000rbhb';

/** @type {readonly { kennung: string, typ: string, kennzeichen: string, status: string, depot: string }[]} */
const DEMO_FAHRZEUGE = [
  { kennung: 'RB-S-2001', typ: 'Solobus', kennzeichen: 'E-RB 2001', status: 'frei', depot: 'Essen Stadtmitte' },
  { kennung: 'RB-G-3002', typ: 'Gelenkbus', kennzeichen: 'E-RB 3002', status: 'frei', depot: 'Essen Econova-Alee' },
  { kennung: 'RB-U-4003', typ: 'U-Bahn 8 Achsen', kennzeichen: 'U-4003', status: 'frei', depot: 'Essen Schweriner Str.' },
  { kennung: 'RB-T-5004', typ: 'Stadtbahn 8 Achsen', kennzeichen: 'T-5004', status: 'frei', depot: 'Essen Rurhallee' },
  { kennung: 'RB-S-2005', typ: 'Solobus', kennzeichen: 'E-RB 2005', status: 'frei', depot: 'Mülheim Duisburgerstr.' },
];

const fusaWizardRights = {
  sehen: true,
  erstellen: true,
  bearbeiten: true,
  preiseSehen: true,
};

const cockpitBasisRights = {
  sehen: true,
};

/**
 * @param {any} store
 * @param {string} userId
 */
async function ensureFusaUndCockpitRechte(store, userId) {
  await store.ensureUserModule(userId, 'cockpit');
  await store.ensureUserModule(userId, 'fusa');
  await store.upsertUserRight(userId, 'cockpit', 'projekte', cockpitBasisRights);
  await store.upsertUserRight(userId, 'cockpit', 'firmen', cockpitBasisRights);
  await store.upsertUserRight(userId, 'fusa', 'auftraege', fusaWizardRights);
  await store.upsertUserRight(userId, 'fusa', 'fahrzeuge', fusaWizardRights);
  await store.upsertUserRight(userId, 'fusa', 'kunden', { sehen: true, bearbeiten: true });
  await store.upsertUserRight(userId, 'fusa', 'dashboard', { sehen: true });
}

/**
 * @param {any} store
 * @param {string} projectId
 * @param {string} userId
 */
async function ensureProjectAccessAdmin(store, projectId, userId) {
  const ex = await store.getProjectAccessByUserAndProject(userId, projectId);
  if (ex) return;
  const d = defaultFlagsForRole('admin');
  await store.insertProjectAccess({
    id: randomUUID(),
    userId,
    projectId,
    role: 'admin',
    canViewPrices: d.can_view_prices,
    canEdit: d.can_edit,
    canCreateAuftraege: d.can_create_auftraege,
  });
}

/**
 * @param {any} store
 */
async function ensureRuhrbahnFirma(store) {
  const existing = await store.getFirmaById(RUHRBAHN_FIRMA_ID);
  if (existing) return existing;
  return store.insertFirma({
    id: RUHRBAHN_FIRMA_ID,
    name: 'Ruhrbahn GmbH',
    kundennummer: '',
    altnummer: '',
    typ: 'kunde',
    internExtern: 'extern',
    umsatzsteuerId: '',
    strasse: 'Schildsehe 69',
    plz: '45127',
    stadt: 'Essen',
    land: 'Deutschland',
    telefon: '+49 201 826-1200',
    email: 'bergmann@ruhrbahn.de',
    website: '',
    ansprechpartnerAnrede: 'Herr',
    ansprechpartnerVorname: 'Bergmann',
    ansprechpartnerNachname: '',
    ansprechpartnerEmail: 'bergmann@ruhrbahn.de',
    ansprechpartnerTelefon: '+49 201 826-1200',
    interneNotiz: 'Seed seed:ruhrbahn — FUSA-Wizard Kunde',
    status: 'aktiv',
    erweiterungJson: null,
  });
}

/**
 * @param {any} store
 * @param {string} projectId
 */
async function ensureDemoFahrzeuge(store, projectId) {
  const rows = await store.listFahrzeugeForProject(projectId);
  const n = Array.isArray(rows) ? rows.length : 0;
  const need = Math.max(0, 5 - n);
  if (need === 0) {
    console.log(`Fahrzeuge: bereits ${n} im Projekt — keine neuen angelegt.`);
    return;
  }
  const existingKennung = new Set(
    (Array.isArray(rows) ? rows : [])
      .map((r) => (r && r.kennung != null ? String(r.kennung).trim().toLowerCase() : ''))
      .filter(Boolean),
  );
  let added = 0;
  for (const spec of DEMO_FAHRZEUGE) {
    if (n + added >= 5) break;
    if (existingKennung.has(spec.kennung.trim().toLowerCase())) continue;
    const id = randomUUID();
    const detailsJson = JSON.stringify({
      betreiber: 'Ruhrbahn Essen',
      depot: spec.depot,
      standort: spec.depot,
    });
    await store.insertFahrzeug({
      id,
      projectId,
      kennung: spec.kennung,
      typ: spec.typ,
      kennzeichen: spec.kennzeichen,
      status: spec.status,
      detailsJson,
    });
    existingKennung.add(spec.kennung.trim().toLowerCase());
    added += 1;
  }
  console.log(`Fahrzeuge: ${added} Test-Fahrzeuge angelegt (Ziel mindestens 5, vorher ${n}).`);
}

async function main() {
  if (!process.env.JWT_SECRET?.trim()) {
    console.error('Fehler: JWT_SECRET muss gesetzt sein (wie beim Server).');
    process.exit(1);
  }

  assertSeedSafeEnvironment('seed:ruhrbahn');

  const projectName = (process.env.RUHRBAHN_PROJECT_NAME || DEFAULT_PROJECT_NAME).trim();
  const email = (process.env.AUTH_SEED_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();

  const store = await openDatabase();
  const allProjects = await store.listProjects();
  const byName = Array.isArray(allProjects)
    ? allProjects.find((p) => p && String(p.name || '').trim() === projectName)
    : null;
  const byRuhr = Array.isArray(allProjects)
    ? allProjects.find((p) => p && /ruhrbahn/i.test(String(p.name || '')))
    : null;

  let project = byName || byRuhr;
  if (!project) {
    const id = randomUUID();
    await store.insertProject({ id, name: projectName, kundenId: null });
    project = await store.getProjectById(id);
    console.log(`Projekt neu angelegt: „${projectName}“ (${id})`);
  } else {
    console.log(`Projekt gefunden: „${project.name}“ (${project.id})`);
  }

  if (!project?.id) {
    console.error('Interner Fehler: Projekt nicht auflösbar.');
    process.exit(1);
  }
  const projectId = String(project.id);

  const user = await store.getUserByEmail(email);
  if (!user?.id) {
    console.error(`Benutzer nicht gefunden: ${email} — zuerst npm run seed:test-user ausführen.`);
    process.exit(1);
  }
  const uid = String(user.id);
  const role = user.global_role != null ? String(user.global_role) : 'INTERN';

  await ensureProjectAccessAdmin(store, projectId, uid);
  console.log(`project_access: ${email} → Projekt ${projectId}`);

  if (role !== 'SUPER_ADMIN') {
    await ensureFusaUndCockpitRechte(store, uid);
    console.log(`Rechte ergänzt (cockpit/fusa) für ${email} (kein SUPER_ADMIN).`);
  } else {
    console.log(`Benutzer ist SUPER_ADMIN — user_rights unverändert.`);
  }

  const allUsers = await store.listUsers();
  if (Array.isArray(allUsers)) {
    for (const u of allUsers) {
      if (!u || u.id == null) continue;
      if (String(u.global_role) !== 'SUPER_ADMIN') continue;
      const sid = String(u.id);
      if (sid === uid) continue;
      await ensureProjectAccessAdmin(store, projectId, sid);
    }
    if (allUsers.some((u) => u && String(u.global_role) === 'SUPER_ADMIN' && String(u.id) !== uid)) {
      console.log('project_access: weitere SUPER_ADMIN-Benutzer → Projekt (falls noch fehlend).');
    }
  }

  await ensureRuhrbahnFirma(store);
  console.log(`Firma „Ruhrbahn GmbH“: id ${RUHRBAHN_FIRMA_ID}`);

  await ensureDemoFahrzeuge(store, projectId);

  console.log('\nNächste Schritte (API prüfen):');
  console.log(`  GET /api/v1/projects  → Projekt „${project.name}“`);
  console.log(`  GET /api/v1/fusa/fahrzeuge (x-project-id: ${projectId})`);
  console.log('  GET /api/v1/fusa/auftraege/form-meta — Stammdaten aus Backend-Regeln (nicht leer).');
}

await main();
