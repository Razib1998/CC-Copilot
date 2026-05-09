/**
 * Phase 5 — Demo-Daten: Projekt + projektbezogene Zugriffe (lokal testbar).
 *
 * Voraussetzung: Testbenutzer aus seed:test-user (oder AUTH_SEED_EMAIL).
 *
 *   npm run seed:test-user
 *   npm run seed:phase5-access
 *
 * Legt an (idempotent, wenn schon vorhanden wird übersprungen):
 *   - Projekt „Phase-5 Demo“
 *   - Benutzer test@cc-cockpit.local → admin auf diesem Projekt (alle Flags)
 *   - Optional: zweiter Benutzer viewer@cc-cockpit.local / TestLocal!2026 → viewer ohne Preise
 *
 * Umgebung:
 *   JWT_SECRET (wie beim Server)
 *   PHASE5_SECOND_USER=1 — zweiten Benutzer anlegen + viewer-Zugriff
 *   PHASE5_SECOND_PASSWORD — in Produktion zwingend, wenn PHASE5_SECOND_USER=1
 *
 * Produktion: Abbruch ohne ALLOW_DEV_SEEDS_IN_PRODUCTION=1 (siehe seed-production-guard.js).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth/password.js';
import { defaultFlagsForRole } from './auth/project-access-rules.js';
import { openDatabase } from './db/database.js';
import { assertSeedSafeEnvironment } from './lib/seed-production-guard.js';

const PRIMARY_EMAIL = (process.env.AUTH_SEED_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();
const PROJECT_NAME = (process.env.PHASE5_PROJECT_NAME || 'Phase-5 Demo').trim();
const SECOND_EMAIL = 'viewer@cc-cockpit.local';
const SECOND_NAME = 'Viewer Demo';
const DEV_FALLBACK_SECOND_PASSWORD = 'TestLocal!2026';

async function main() {
  if (!process.env.JWT_SECRET?.trim()) {
    console.error('Fehler: JWT_SECRET muss gesetzt sein.');
    process.exit(1);
  }

  const { isProduction } = assertSeedSafeEnvironment('seed:phase5-access');
  const secondPwdEnv = process.env.PHASE5_SECOND_PASSWORD?.trim();
  if (isProduction && process.env.PHASE5_SECOND_USER === '1' && !secondPwdEnv) {
    console.error(
      '[seed:phase5-access] PHASE5_SECOND_PASSWORD ist in Produktion zwingend, wenn PHASE5_SECOND_USER=1.',
    );
    process.exit(1);
  }
  const SECOND_PASSWORD = secondPwdEnv || DEV_FALLBACK_SECOND_PASSWORD;

  const store = await openDatabase();
  const primary = await store.getUserByEmail(PRIMARY_EMAIL);
  if (!primary) {
    console.error(`Benutzer fehlt: ${PRIMARY_EMAIL} — zuerst npm run seed:test-user ausführen.`);
    process.exit(1);
  }

  const allProjects = await store.listProjects();
  let project = allProjects.find((p) => p.name === PROJECT_NAME);
  if (!project) {
    const pid = randomUUID();
    await store.insertProject({ id: pid, name: PROJECT_NAME });
    project = await store.getProjectById(pid);
    console.log(`Projekt angelegt: ${PROJECT_NAME} (${project.id})`);
  } else {
    console.log(`Projekt existiert: ${PROJECT_NAME} (${project.id})`);
  }

  const pid = project.id;
  if (!(await store.getProjectAccessByUserAndProject(primary.id, pid))) {
    const d = defaultFlagsForRole('admin');
    await store.insertProjectAccess({
      id: randomUUID(),
      userId: primary.id,
      projectId: pid,
      role: 'admin',
      canViewPrices: d.can_view_prices,
      canEdit: d.can_edit,
      canCreateAuftraege: d.can_create_auftraege,
    });
    console.log(`Admin-Zugriff: ${PRIMARY_EMAIL} → Projekt ${pid}`);
  } else {
    console.log(`Admin-Zugriff existiert bereits für ${PRIMARY_EMAIL}.`);
  }

  if (process.env.PHASE5_SECOND_USER === '1') {
    if (!(await store.userExistsByEmail(SECOND_EMAIL))) {
      await store.insertUser({
        id: randomUUID(),
        email: SECOND_EMAIL,
        passwordHash: hashPassword(SECOND_PASSWORD),
        name: SECOND_NAME,
      });
      console.log(`Zweiter Benutzer angelegt: ${SECOND_EMAIL} / ${SECOND_PASSWORD}`);
    }
    const viewer = await store.getUserByEmail(SECOND_EMAIL);
    if (viewer && !(await store.getProjectAccessByUserAndProject(viewer.id, pid))) {
      const d = defaultFlagsForRole('viewer');
      await store.insertProjectAccess({
        id: randomUUID(),
        userId: viewer.id,
        projectId: pid,
        role: 'viewer',
        canViewPrices: d.can_view_prices,
        canEdit: d.can_edit,
        canCreateAuftraege: d.can_create_auftraege,
      });
      console.log(`Viewer-Zugriff: ${SECOND_EMAIL} → Projekt ${pid}`);
    }
  }

  console.log('\nManuell testen (Beispiel):');
  console.log(`  Projekt-ID: ${pid}`);
  console.log('  Login Primary → GET /projects/' + pid + '/access');
  console.log('  Login Primary → GET /projects/' + pid + '/my-access');
}

await main();
