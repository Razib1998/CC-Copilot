import { randomUUID } from 'node:crypto';
import { hashPassword } from '../auth/password.js';
import { defaultFlagsForRole } from '../auth/project-access-rules.js';

const TEST_EMAIL = 'test@cc-cockpit.local';
const TEST_PASSWORD = 'test1234';
/**
 * Gewünschte `users.company_id` für lokale E2E.
 * Wenn keine Firma mit dieser ID im Stamm existiert, wird die erste Firma aus `listFirmen()` genommen
 * (sonst bleibt `company_id` auf einer Fantasie-ID hängen und `resolveFirmaIdForRequest` liefert leere CC-Intern-Listen).
 */
const TEST_COMPANY_ID = '1';
const TEST_PROJECT_ID = '1';

/**
 * Legt den lokalen E2E-Testbenutzer an bzw. setzt Passwort (bcrypt), Rolle und Firma.
 * Läuft nur, wenn nicht Produktion — oder mit `ALLOW_DEV_SEEDS_IN_PRODUCTION=1`.
 * Abschalten: `DISABLE_DEV_TEST_LOGIN_SEED=1`.
 *
 * @param {object} store
 */
export async function ensureDevTestLoginUser(store) {
  const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';
  const allowProd = String(process.env.ALLOW_DEV_SEEDS_IN_PRODUCTION || '').trim() === '1';
  if (isProduction && !allowProd) return;
  if (String(process.env.DISABLE_DEV_TEST_LOGIN_SEED || '').trim() === '1') return;

  const passwordHash = hashPassword(TEST_PASSWORD);
  let row = await store.getUserByEmail(TEST_EMAIL);

  if (!row) {
    const id = randomUUID();
    await store.insertUser({
      id,
      email: TEST_EMAIL.toLowerCase(),
      passwordHash,
      name: 'E2E Test',
      globalRole: 'SUPER_ADMIN',
    });
    row = await store.getUserByEmail(TEST_EMAIL);
    console.log(`[dev-login-seed] Benutzer angelegt: ${TEST_EMAIL}`);
  } else {
    await store.updateUserPasswordHash(row.id, passwordHash);
    await store.updateUserProfile(row.id, { global_role: 'SUPER_ADMIN' });
    console.log(`[dev-login-seed] Passwort/Rolle aktualisiert: ${TEST_EMAIL}`);
  }

  if (!row?.id) return;

  let companyId = TEST_COMPANY_ID;
  try {
    const firmaWunsch = await store.getFirmaById(TEST_COMPANY_ID);
    if (!firmaWunsch) {
      const alle = await store.listFirmen();
      if (Array.isArray(alle) && alle[0]?.id != null) {
        companyId = String(alle[0].id).trim();
        console.warn(
          `[dev-login-seed] Firma id="${TEST_COMPANY_ID}" nicht im Stamm — company_id → ${companyId}`,
        );
      } else {
        companyId = null;
        console.warn('[dev-login-seed] Keine Firmen im Stamm — company_id bleibt leer.');
      }
    }
  } catch (e) {
    console.warn('[dev-login-seed] Firma-Auflösung übersprungen:', e?.message || e);
  }
  await store.updateUserCompany(row.id, companyId);

  try {
    let project = await store.getProjectById(TEST_PROJECT_ID);
    if (!project) {
      await store.insertProject({
        id: TEST_PROJECT_ID,
        name: 'Dev Projekt 1',
        kundenId: null,
      });
      project = await store.getProjectById(TEST_PROJECT_ID);
      console.log(`[dev-login-seed] Projekt angelegt: id=${TEST_PROJECT_ID}`);
    }
    if (!project) return;
    const existing = await store.getProjectAccessByUserAndProject(row.id, TEST_PROJECT_ID);
    if (existing) return;
    const d = defaultFlagsForRole('admin');
    await store.insertProjectAccess({
      id: randomUUID(),
      userId: row.id,
      projectId: TEST_PROJECT_ID,
      role: 'admin',
      canViewPrices: d.can_view_prices,
      canEdit: d.can_edit,
      canCreateAuftraege: d.can_create_auftraege,
    });
    console.log(`[dev-login-seed] project_access: ${TEST_EMAIL} → Projekt ${TEST_PROJECT_ID}`);
  } catch (e) {
    console.warn('[dev-login-seed] project_access optional fehlgeschlagen:', e?.message || e);
  }
}
