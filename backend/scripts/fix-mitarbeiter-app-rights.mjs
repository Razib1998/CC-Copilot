/**
 * Datenfix: ccintern.mitarbeiter.sehen für Mitarbeiter-App-User (Stamm lesen / MA_DATA).
 * Ergänzt nur fehlendes Leserecht — bestehende Rechte bleiben erhalten (merge per Bereich).
 *
 * Dry-Run:
 *   cd backend && node scripts/fix-mitarbeiter-app-rights.mjs
 *
 * Echter Fix:
 *   cd backend && CONFIRM_FIX=YES node scripts/fix-mitarbeiter-app-rights.mjs
 */
import 'dotenv/config';
import { loadAccessProfile } from '../src/auth/access-profile.js';
import {
  mergeRightsOr,
  normalizeRightsJson,
} from '../src/auth/rights-spec.js';
import {
  backupSqliteDatabaseBeforeOpen,
  openDatabase,
} from '../src/db/database.js';

const CONFIRM = String(process.env.CONFIRM_FIX || '').trim().toUpperCase() === 'YES';
const MA_EMAIL_RE = /^ccintern\.ma\.[^@]+@cc-cockpit\.local$/i;

/** Nur Lesen — kein erstellen/bearbeiten. */
const MITARBEITER_STAMM_READ = normalizeRightsJson({ sehen: true });

function isTargetMaAppUser(u, profile) {
  const email = String(u.email || '').trim();
  if (!MA_EMAIL_RE.test(email)) return false;
  if (String(u.global_role || '').trim().toUpperCase() === 'SUPER_ADMIN') return false;
  if (!profile.hasModule('ccintern')) return false;
  if (!profile.has('ccintern', 'mitarbeiterapp', 'sehen')) return false;
  return true;
}

/**
 * @param {import('../src/auth/access-profile.js').AccessProfile} profile
 */
function currentMitarbeiterFlags(profile) {
  const k = 'ccintern:mitarbeiter';
  return profile.rightsByKey.get(k) || normalizeRightsJson({});
}

function printRow(r) {
  console.log(
    [
      r.name.slice(0, 20).padEnd(20),
      r.email.slice(0, 48).padEnd(48),
      r.hadSehen ? 'ja' : 'nein',
      r.wouldChange ? 'ja' : 'nein',
    ].join(' | '),
  );
}

async function main() {
  const mysqlOn = Boolean(
    String(process.env.MYSQL_HOST || '').trim() &&
      String(process.env.MYSQL_USER || '').trim() &&
      String(process.env.MYSQL_DATABASE || '').trim(),
  );

  if (CONFIRM) {
    console.log('CONFIRM_FIX=YES — Backup und upsert ccintern.mitarbeiter (nur sehen).');
    if (!mysqlOn) backupSqliteDatabaseBeforeOpen();
    else console.warn('[Hinweis] MySQL — bitte Server-Backup anlegen.');
  } else {
    console.log(
      'DRY-RUN. Echter Fix:\n  CONFIRM_FIX=YES node scripts/fix-mitarbeiter-app-rights.mjs',
    );
  }

  const store = await openDatabase();
  const users = (await store.listUsers()).filter((u) =>
    MA_EMAIL_RE.test(String(u.email || '').trim()),
  );

  /** @type {Array<{ userId: string, name: string, email: string, hadSehen: boolean, wouldChange: boolean, merged: import('../src/auth/rights-spec.js').RightsFlags }>} */
  const plans = [];

  for (const u of users) {
    const uid = String(u.id).trim();
    const profile = await loadAccessProfile(store, uid);
    if (!isTargetMaAppUser(u, profile)) continue;
    const cur = currentMitarbeiterFlags(profile);
    const hadSehen = profile.has('ccintern', 'mitarbeiter', 'sehen');
    const merged = mergeRightsOr(cur, MITARBEITER_STAMM_READ);
    const wouldChange = !hadSehen;
    plans.push({
      userId: uid,
      name: String(u.name || ''),
      email: String(u.email || ''),
      hadSehen,
      wouldChange,
      merged,
    });
  }

  console.log(`\n=== ${CONFIRM ? 'FIX' : 'DRY-RUN'} ===\n`);
  console.log('Name                 | E-Mail                                           | mitarbeiter.sehen vorher | würde ändern');
  console.log('-'.repeat(110));
  for (const p of plans) printRow(p);

  console.log(`\nGeprüfte MA-App-User: ${plans.length}`);
  console.log(`Bereits mitarbeiter.sehen: ${plans.filter((p) => p.hadSehen).length}`);
  console.log(`Würde ergänzen: ${plans.filter((p) => p.wouldChange).length}`);

  if (!CONFIRM) return;

  let changed = 0;
  for (const p of plans) {
    if (!p.wouldChange) continue;
    await store.upsertUserRight(p.userId, 'ccintern', 'mitarbeiter', p.merged);
    changed++;
  }

  console.log(`\nGeänderte User: ${changed}`);

  console.log('\n=== Verifikation ===\n');
  let allOk = true;
  for (const p of plans) {
    const profile = await loadAccessProfile(store, p.userId);
    const ok = profile.has('ccintern', 'mitarbeiter', 'sehen');
    if (!ok) allOk = false;
    console.log(`${p.email}: mitarbeiter.sehen=${ok ? 'ja' : 'NEIN'}`);
  }
  if (!allOk) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
