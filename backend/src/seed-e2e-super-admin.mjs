/**
 * Legt den lokalen E2E-SUPER_ADMIN an bzw. setzt Passwort/Rolle neu.
 *
 * Nur SQLite (lokale `data/cc-cockpit.db`): bricht ab, wenn MySQL (`MYSQL_HOST` …) konfiguriert ist.
 *
 *   cd backend && npm run seed:e2e-super-admin
 *
 * Optional überschreiben:
 *   E2E_SUPER_ADMIN_EMAIL, E2E_SUPER_ADMIN_PASSWORD
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth/password.js';
import { defaultFlagsForRole } from './auth/project-access-rules.js';
import { openDatabase } from './db/database.js';

const EMAIL = (process.env.E2E_SUPER_ADMIN_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();
const PASSWORD = (process.env.E2E_SUPER_ADMIN_PASSWORD || 'admin2026!').trim();
const NAME = (process.env.E2E_SUPER_ADMIN_NAME || 'E2E Super-Admin').trim();

function mysqlConfigured() {
  const h = String(process.env.MYSQL_HOST || '').trim();
  const u = String(process.env.MYSQL_USER || '').trim();
  const d = String(process.env.MYSQL_DATABASE || '').trim();
  return Boolean(h && u && d);
}

async function main() {
  console.warn(
    '[seed-e2e-super-admin] Hinweis: laufenden Backend-Prozess stoppen, sonst kann sql.js die DB-Datei gegeneinander überschreiben.',
  );
  if (mysqlConfigured()) {
    console.error(
      '[seed-e2e-super-admin] Abbruch: MySQL ist konfiguriert. Dieses Skript ist nur für die lokale SQLite-Test-DB gedacht.',
    );
    process.exit(1);
  }
  if (!PASSWORD || PASSWORD.length < 8) {
    console.error('[seed-e2e-super-admin] Passwort fehlt oder zu kurz (min. 8 Zeichen).');
    process.exit(1);
  }

  const store = await openDatabase();
  const passwordHash = hashPassword(PASSWORD);

  let row = await store.getUserByEmail(EMAIL);
  if (!row) {
    const id = randomUUID();
    await store.insertUser({
      id,
      email: EMAIL,
      passwordHash,
      name: NAME,
      globalRole: 'SUPER_ADMIN',
    });
    row = await store.getUserByEmail(EMAIL);
    console.log(`[seed-e2e-super-admin] Benutzer angelegt: ${EMAIL}`);
  } else {
    await store.updateUserPasswordHash(row.id, passwordHash);
    await store.updateUserProfile(row.id, { global_role: 'SUPER_ADMIN', name: NAME });
    console.log(`[seed-e2e-super-admin] Passwort/Rolle aktualisiert: ${EMAIL}`);
  }

  if (!row?.id) {
    console.error('[seed-e2e-super-admin] Interner Fehler: User ohne id.');
    process.exit(1);
  }

  let companyId = '1';
  try {
    const firmaWunsch = await store.getFirmaById('1');
    if (!firmaWunsch) {
      const alle = await store.listFirmen();
      if (Array.isArray(alle) && alle[0]?.id != null) {
        companyId = String(alle[0].id).trim();
        console.warn(`[seed-e2e-super-admin] Firma id=1 fehlt — company_id → ${companyId}`);
      } else {
        companyId = null;
        console.warn('[seed-e2e-super-admin] Keine Firma im Stamm — company_id bleibt leer.');
      }
    }
  } catch (e) {
    console.warn('[seed-e2e-super-admin] Firma-Auflösung:', e?.message || e);
    companyId = null;
  }
  await store.updateUserCompany(row.id, companyId);

  try {
    let projects = await store.listProjects();
    let firstProjectId = projects[0]?.id != null ? String(projects[0].id).trim() : '';
    if (!firstProjectId) {
      await store.insertProject({ id: '1', name: 'E2E Dev Projekt', kundenId: null });
      projects = await store.listProjects();
      firstProjectId = projects[0]?.id != null ? String(projects[0].id).trim() : '';
      console.log('[seed-e2e-super-admin] Fallback-Projekt angelegt (id=1).');
    }
    if (firstProjectId) {
      const existing = await store.getProjectAccessByUserAndProject(row.id, firstProjectId);
      if (!existing) {
        const d = defaultFlagsForRole('admin');
        await store.insertProjectAccess({
          id: randomUUID(),
          userId: row.id,
          projectId: firstProjectId,
          role: 'admin',
          canViewPrices: d.can_view_prices,
          canEdit: d.can_edit,
          canCreateAuftraege: d.can_create_auftraege,
        });
        console.log(`[seed-e2e-super-admin] project_access → Projekt ${firstProjectId} (admin)`);
      }
    }
  } catch (e) {
    console.warn('[seed-e2e-super-admin] project_access optional:', e?.message || e);
  }

  console.log('[seed-e2e-super-admin] Fertig. Rolle: SUPER_ADMIN');
}

await main();
