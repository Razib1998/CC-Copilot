/**
 * Datenfix: users.company_id = mitarbeiter.firma_id (nur ccintern.ma.* mit verlinktem user_id).
 * Architektur: docs/ARCHITEKTUR_REGEL.md — eine Firmenquelle, App-Kontext über users.company_id.
 *
 * Dry-Run (Standard):
 *   cd backend && node scripts/fix-mitarbeiter-company-context.mjs
 *
 * Echter Fix (Server bei SQLite/sql.js stoppen empfohlen):
 *   cd backend && CONFIRM_FIX=YES node scripts/fix-mitarbeiter-company-context.mjs
 *
 * Ändert ausschließlich users.company_id. Keine anderen Tabellen.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import {
  backupSqliteDatabaseBeforeOpen,
  openDatabase,
} from '../src/db/database.js';

const CONFIRM = String(process.env.CONFIRM_FIX || '').trim().toUpperCase() === 'YES';
const MA_EMAIL_RE = /^ccintern\.ma\.[^@]+@cc-cockpit\.local$/i;

function isTargetMaUser(u) {
  const email = String(u.email || '').trim();
  if (!MA_EMAIL_RE.test(email)) return false;
  if (String(u.global_role || '').trim().toUpperCase() === 'SUPER_ADMIN') return false;
  return true;
}

async function loadAllMitarbeiter(store) {
  const firmen = await store.listFirmen();
  /** @type {object[]} */
  const all = [];
  for (const f of firmen) {
    const rows = await store.listMitarbeiterByFirma(f.id, { offset: 0, limit: 500 });
    for (const m of rows) all.push(m);
  }
  return all;
}

/**
 * @param {object} user
 * @param {object[]} allMaRows
 */
function linkedMitarbeiterForUser(user, allMaRows) {
  const uid = String(user.id).trim();
  return allMaRows.filter((m) => String(m.user_id || '').trim() === uid);
}

/**
 * @param {object} user
 * @param {object[]} allMaRows
 */
function buildRow(user, allMaRows) {
  const uid = String(user.id).trim();
  const companyOld =
    user.company_id != null && String(user.company_id).trim()
      ? String(user.company_id).trim()
      : '';
  const linked = linkedMitarbeiterForUser(user, allMaRows);

  if (linked.length === 0) {
    return {
      name: String(user.name || ''),
      email: String(user.email || ''),
      userId: uid,
      companyIdOld: companyOld || '(leer)',
      mitarbeiterId: '—',
      mitarbeiterFirmaId: '—',
      synchron: 'nein',
      wouldChange: 'nein',
      status: 'no_linked_mitarbeiter',
      targetFirmaId: null,
    };
  }

  if (linked.length > 1) {
    const fids = [...new Set(linked.map((m) => String(m.firma_id).trim()))];
    return {
      name: String(user.name || ''),
      email: String(user.email || ''),
      userId: uid,
      companyIdOld: companyOld || '(leer)',
      mitarbeiterId: linked.map((m) => m.id).join(', '),
      mitarbeiterFirmaId: fids.join(', '),
      synchron: 'nein',
      wouldChange: 'nein',
      status: 'ambiguous_multiple_mitarbeiter',
      targetFirmaId: null,
    };
  }

  const m = linked[0];
  const firmaId = String(m.firma_id).trim();
  const synchron = companyOld === firmaId ? 'ja' : 'nein';
  const wouldChange = synchron === 'ja' ? 'nein' : 'ja';

  return {
    name: String(user.name || ''),
    email: String(user.email || ''),
    userId: uid,
    companyIdOld: companyOld || '(leer)',
    mitarbeiterId: String(m.id),
    mitarbeiterFirmaId: firmaId,
    synchron,
    wouldChange,
    status: wouldChange === 'ja' ? 'will_update' : 'already_ok',
    targetFirmaId: firmaId,
  };
}

function printDryRunTable(rows) {
  console.log('\n=== DRY-RUN / Plan ===\n');
  console.log(
    [
      'Name'.padEnd(22),
      'E-Mail'.padEnd(52),
      'users.id'.slice(0, 8),
      'company_id alt',
      'mitarbeiter.id'.slice(0, 8),
      'firma_id',
      'synchron',
      'würde ändern',
    ].join(' | '),
  );
  console.log('-'.repeat(140));
  for (const r of rows) {
    console.log(
      [
        r.name.slice(0, 22).padEnd(22),
        r.email.slice(0, 52).padEnd(52),
        r.userId.slice(0, 36),
        String(r.companyIdOld).slice(0, 36),
        String(r.mitarbeiterId).slice(0, 36),
        String(r.mitarbeiterFirmaId).slice(0, 36),
        r.synchron.padEnd(8),
        r.wouldChange,
      ].join(' | '),
    );
  }
  console.log('-'.repeat(140));
}

function findLatestSqliteBackup(dataDir) {
  if (!fs.existsSync(dataDir)) return null;
  const names = fs.readdirSync(dataDir).filter((n) => /^cc-cockpit-backup-.+\.db$/i.test(n));
  if (!names.length) return null;
  const withStat = names.map((n) => {
    const full = path.join(dataDir, n);
    return { full, t: fs.statSync(full).mtimeMs };
  });
  withStat.sort((a, b) => b.t - a.t);
  return withStat[0]?.full || null;
}

async function verifyAll(rows, store) {
  const allMa = await loadAllMitarbeiter(store);
  const users = (await store.listUsers()).filter(isTargetMaUser);
  let syncCount = 0;
  const details = [];

  for (const u of users) {
    const r = buildRow(u, allMa);
    const ok = r.synchron === 'ja' && r.status !== 'no_linked_mitarbeiter' && r.status !== 'ambiguous_multiple_mitarbeiter';
    if (ok) syncCount++;
    details.push({ email: r.email, synchron: r.synchron, status: r.status, companyId: r.companyIdOld, firmaId: r.mitarbeiterFirmaId });
  }

  return { total: users.length, syncCount, details };
}

async function main() {
  const mysqlOn = Boolean(
    String(process.env.MYSQL_HOST || '').trim() &&
      String(process.env.MYSQL_USER || '').trim() &&
      String(process.env.MYSQL_DATABASE || '').trim(),
  );

  let backupPath = null;

  if (CONFIRM) {
    console.log('CONFIRM_FIX=YES — Backup und UPDATE users.company_id werden ausgeführt.');
    if (!mysqlOn) {
      backupSqliteDatabaseBeforeOpen();
      backupPath = findLatestSqliteBackup(path.join(process.cwd(), 'data'));
    } else {
      console.warn('[Hinweis] MySQL aktiv — bitte vor dem Fix ein DB-Backup auf Server-Ebene anlegen.');
    }
  } else {
    console.log(
      'DRY-RUN (keine Schreibzugriffe). Echter Fix:\n  CONFIRM_FIX=YES node scripts/fix-mitarbeiter-company-context.mjs',
    );
  }

  if (backupPath) {
    console.log('Backup-Datei:', backupPath);
  }

  const store = await openDatabase();
  const allMaRows = await loadAllMitarbeiter(store);
  const targets = (await store.listUsers()).filter(isTargetMaUser);

  if (!targets.length) {
    console.log('Keine ccintern.ma.* User gefunden.');
    return;
  }

  const plans = targets.map((u) => buildRow(u, allMaRows));
  printDryRunTable(plans);

  const wouldChange = plans.filter((p) => p.wouldChange === 'ja' && p.targetFirmaId);
  const alreadyOk = plans.filter((p) => p.status === 'already_ok');
  const skipped = plans.filter((p) => p.wouldChange === 'nein' && p.status !== 'already_ok');

  console.log(`\nGeprüfte User: ${plans.length}`);
  console.log(`Bereits synchron: ${alreadyOk.length}`);
  console.log(`Würde geändert: ${wouldChange.length}`);
  if (skipped.length) console.log(`Übersprungen (kein/unklarer Link): ${skipped.length}`);

  const okan = plans.find((p) => p.email.toLowerCase().includes('4a7e6df8'));
  if (okan) {
    console.log('\nOkan (Vorschau):');
    console.log(
      JSON.stringify(
        {
          company_id_alt: okan.companyIdOld,
          mitarbeiter_firma_id: okan.mitarbeiterFirmaId,
          synchron: okan.synchron,
          wuerde_geaendert: okan.wouldChange,
        },
        null,
        2,
      ),
    );
  }

  if (!CONFIRM) return;

  if (!backupPath && !mysqlOn) {
    backupPath = findLatestSqliteBackup(path.join(process.cwd(), 'data'));
    if (backupPath) console.log('Backup-Datei (nach open):', backupPath);
  }

  let changed = 0;
  for (const plan of wouldChange) {
    const ok = await store.updateUserCompany(plan.userId, plan.targetFirmaId);
    if (ok) changed++;
    else console.warn(`UPDATE fehlgeschlagen: ${plan.email}`);
  }

  console.log(`\nGeänderte User: ${changed}/${wouldChange.length}`);

  const after = await verifyAll(plans, store);
  console.log('\n=== Nach Fix — Verifikation ===\n');
  console.log(`Alle ${after.total} ccintern.ma.* synchron: ${after.syncCount === after.total ? 'ja' : 'nein'} (${after.syncCount}/${after.total})`);

  for (const d of after.details) {
    console.log(`  ${d.email}: synchron=${d.synchron} status=${d.status}`);
  }

  if (okan) {
    const u = (await store.listUsers()).find((x) => x.email.toLowerCase().includes('4a7e6df8'));
    const ma = u ? linkedMitarbeiterForUser(u, await loadAllMitarbeiter(store)) : [];
    const cid = u?.company_id != null ? String(u.company_id).trim() : '';
    const fid = ma[0]?.firma_id != null ? String(ma[0].firma_id).trim() : '';
    const byApi = u && fid ? await store.getMitarbeiterByUserAndFirma(String(u.id), fid) : null;
    console.log('\nOkan nachher:');
    console.log(
      JSON.stringify(
        {
          users_company_id: cid,
          mitarbeiter_firma_id: fid,
          gleich: cid && fid && cid === fid ? 'ja' : 'nein',
          getMitarbeiterByUserAndFirma: byApi ? 'FOUND' : 'NOT FOUND',
        },
        null,
        2,
      ),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
