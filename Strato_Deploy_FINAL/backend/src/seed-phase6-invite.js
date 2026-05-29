/**
 * Phase 6 — Demo-Einladung (lokal testbar).
 *
 * Voraussetzung: test@cc-cockpit.local existiert (seed:test-user).
 *
 *   npm run seed:phase6-invite
 *
 * Legt an (idempotent):
 *   - Projekt „Phase-6 Demo“
 *   - Admin-Zugriff für test@…
 *   - Benutzer invitee@cc-cockpit.local (falls nicht vorhanden)
 *   - Ausstehende Einladung für invitee@… auf dieses Projekt
 *
 * Ausgabe: Token + Beispiel-URLs (GET /invites/:token, POST mit Login invitee).
 *
 * Produktion: Abbruch ohne ALLOW_DEV_SEEDS_IN_PRODUCTION=1; mit Freigabe ist
 * PHASE6_INVITEE_PASSWORD zwingend (kein Default-Passwort).
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth/password.js';
import { generateInviteToken } from './auth/invite-token.js';
import { defaultFlagsForRole } from './auth/project-access-rules.js';
import { openDatabase } from './db/database.js';
import { assertSeedSafeEnvironment } from './lib/seed-production-guard.js';

const ADMIN_EMAIL = (process.env.AUTH_SEED_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();
const INVITEE_EMAIL = (process.env.PHASE6_INVITEE_EMAIL || 'invitee@cc-cockpit.local').trim().toLowerCase();
const PROJECT_NAME = (process.env.PHASE6_PROJECT_NAME || 'Phase-6 Demo').trim();
const DEV_INVITEE_PASSWORD = 'TestLocal!2026';

async function main() {
  if (!process.env.JWT_SECRET?.trim()) {
    console.error('Fehler: JWT_SECRET muss gesetzt sein.');
    process.exit(1);
  }

  const { isProduction } = assertSeedSafeEnvironment('seed:phase6-invite');
  const inviteePwdEnv = process.env.PHASE6_INVITEE_PASSWORD?.trim();
  const inviteePassword = inviteePwdEnv || (!isProduction ? DEV_INVITEE_PASSWORD : '');
  if (isProduction && !inviteePassword) {
    console.error('[seed:phase6-invite] PHASE6_INVITEE_PASSWORD ist in Produktion zwingend.');
    process.exit(1);
  }

  const store = await openDatabase();
  const admin = await store.getUserByEmail(ADMIN_EMAIL);
  if (!admin) {
    console.error(`Admin-Benutzer fehlt: ${ADMIN_EMAIL}`);
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
  if (!(await store.getProjectAccessByUserAndProject(admin.id, pid))) {
    const d = defaultFlagsForRole('admin');
    await store.insertProjectAccess({
      id: randomUUID(),
      userId: admin.id,
      projectId: pid,
      role: 'admin',
      canViewPrices: d.can_view_prices,
      canEdit: d.can_edit,
      canCreateAuftraege: d.can_create_auftraege,
    });
    console.log(`Admin-Zugriff für ${ADMIN_EMAIL} auf ${pid}`);
  }

  if (!(await store.userExistsByEmail(INVITEE_EMAIL))) {
    await store.insertUser({
      id: randomUUID(),
      email: INVITEE_EMAIL,
      passwordHash: hashPassword(inviteePassword),
      name: 'Invitee Demo',
    });
    console.log(
      `Benutzer angelegt: ${INVITEE_EMAIL} / ${inviteePwdEnv ? '(wie PHASE6_INVITEE_PASSWORD)' : inviteePassword}`,
    );
  }

  const inviteeUser = await store.getUserByEmail(INVITEE_EMAIL);
  if (inviteeUser && (await store.getProjectAccessByUserAndProject(inviteeUser.id, pid))) {
    console.log(`${INVITEE_EMAIL} hat bereits Zugriff auf dieses Projekt — keine neue Einladung.`);
    process.exit(0);
  }

  let pending = await store.getPendingProjectInviteByProjectAndEmail(pid, INVITEE_EMAIL);
  if (!pending) {
    const id = randomUUID();
    const token = generateInviteToken();
    const role = 'viewer';
    const df = defaultFlagsForRole(role);
    const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();
    await store.insertProjectInvite({
      id,
      projectId: pid,
      email: INVITEE_EMAIL,
      role,
      canViewPrices: df.can_view_prices,
      canEdit: df.can_edit,
      canCreateAuftraege: df.can_create_auftraege,
      token,
      expiresAtIso: expiresAt,
      createdByUserId: admin.id,
    });
    pending = await store.getProjectInviteByToken(token);
    console.log('\nEinladung angelegt (pending).');
    console.log(`  Token (nur hier einmal vollständig): ${token}`);
    console.log(`  GET  http://localhost:5371/invites/${encodeURIComponent(token)}`);
    console.log(`  POST http://localhost:5371/invites/${encodeURIComponent(token)}/accept  (Header: Bearer … als ${INVITEE_EMAIL})`);
  } else {
    console.log('\nAusstehende Einladung existiert bereits — kein neues Token ausgegeben.');
    console.log('  (Altes Token ggf. aus DB oder neue Einladung nach Widerruf/Löschen.)');
  }
}

await main();
