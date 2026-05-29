/**
 * Optionaler Testbenutzer für lokale Auth-Tests (Phase 2).
 *
 * Ausführen (im Ordner backend):
 *   npm install
 *   set JWT_SECRET=ein-langes-geheimnis-min-32-zeichen
 *   npm run seed:test-user
 *
 * Standard-Zugangsdaten (nur lokal, wenn Umgebungsvariablen nicht gesetzt):
 *   E-Mail:    test@cc-cockpit.local
 *   Passwort:  test1234 (gleicher Default wie Server-Seed `ensureDevTestLoginUser`)
 *
 * Überschreiben via Umgebung:
 *   AUTH_SEED_EMAIL, AUTH_SEED_PASSWORD, AUTH_SEED_NAME
 *
 * Produktion: Skript bricht ab (siehe src/lib/seed-production-guard.js), es sei denn
 * ALLOW_DEV_SEEDS_IN_PRODUCTION=1 — dann ist AUTH_SEED_PASSWORD zwingend.
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { hashPassword } from './auth/password.js';
import { openDatabase } from './db/database.js';
import { assertSeedSafeEnvironment } from './lib/seed-production-guard.js';

const DEFAULT_EMAIL = 'test@cc-cockpit.local';
const DEFAULT_PASSWORD = 'test1234';
const DEFAULT_NAME = 'Testbenutzer';

async function main() {
  try {
    if (!process.env.JWT_SECRET?.trim()) {
      console.error(
        'Fehler: JWT_SECRET muss gesetzt sein (gleicher Wert wie beim Server-Start).',
      );
      process.exit(1);
    }

    const { isProduction, allowProdSeed } = assertSeedSafeEnvironment('seed:test-user');
    const envPwd = process.env.AUTH_SEED_PASSWORD?.trim();
    if (isProduction && allowProdSeed && !envPwd) {
      console.error('[seed:test-user] In Produktion ist AUTH_SEED_PASSWORD zwingend (kein Default).');
      process.exit(1);
    }

    const email = (process.env.AUTH_SEED_EMAIL || DEFAULT_EMAIL).trim();
    const password = envPwd || DEFAULT_PASSWORD;
    const name = (process.env.AUTH_SEED_NAME || DEFAULT_NAME).trim();

    const store = await openDatabase();
    if (await store.userExistsByEmail(email)) {
      console.log(`Benutzer existiert bereits: ${email}`);
      process.exit(0);
    }

    const id = randomUUID();
    const passwordHash = hashPassword(password);
    await store.insertUser({
      id,
      email: email.toLowerCase(),
      passwordHash,
      name,
    });

    console.log('Testbenutzer angelegt.');
    console.log(`  E-Mail:    ${email}`);
    console.log(
      `  Passwort:  ${password === DEFAULT_PASSWORD ? DEFAULT_PASSWORD : '(wie AUTH_SEED_PASSWORD)'}`,
    );
    console.log(`  Name:      ${name}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

await main();
