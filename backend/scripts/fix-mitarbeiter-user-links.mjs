/**
 * Datenfix: ccintern.ma.* User ↔ mitarbeiter-Stamm (user_id + users.company_id = mitarbeiter.firma_id).
 * Architektur: docs/ARCHITEKTUR_REGEL.md — eine Firmen-/Stammdatenquelle, Verknüpfung über mitarbeiter.user_id.
 *
 * Dry-Run (Standard):
 *   cd backend && node scripts/fix-mitarbeiter-user-links.mjs
 *
 * Echter Fix (Server stoppen bei SQLite/sql.js):
 *   cd backend && CONFIRM_FIX=YES node scripts/fix-mitarbeiter-user-links.mjs
 */
import 'dotenv/config';
import {
  backupSqliteDatabaseBeforeOpen,
  openDatabase,
} from '../src/db/database.js';

const CONFIRM = String(process.env.CONFIRM_FIX || '').trim().toUpperCase() === 'YES';

const MA_EMAIL_RE = /^ccintern\.ma\.[^@]+@cc-cockpit\.local$/i;

function norm(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function normName(s) {
  return norm(s).replace(/\s+/g, ' ');
}

function isTargetMaUser(u) {
  const email = norm(u.email);
  if (!MA_EMAIL_RE.test(email)) return false;
  if (String(u.global_role || '').trim().toUpperCase() === 'SUPER_ADMIN') return false;
  return true;
}

/** @param {object} user */
function kuerzelFromUser(user) {
  if (user.kuerzel != null && String(user.kuerzel).trim()) {
    return String(user.kuerzel).trim().toUpperCase();
  }
  return '';
}

/**
 * @param {object} user
 * @param {object[]} allMaRows
 */
function findMitarbeiterRowsForUser(user, allMaRows) {
  const uid = String(user.id).trim();
  return allMaRows.filter((m) => String(m.user_id).trim() === uid);
}

/**
 * @param {object} user
 * @param {object[]} candidates — ohne user_id oder mit falscher Zuordnung
 */
function findMitarbeiterByHeuristics(user, candidates) {
  const uid = String(user.id).trim();
  const name = normName(user.name);
  const email = norm(user.email);
  const kFromUser = kuerzelFromUser(user);
  const hits = [];

  for (const m of candidates) {
    if (String(m.user_id).trim() === uid) continue;
    const mName = normName(m.user_name);
    const mPos = m.position != null ? String(m.position).trim().toUpperCase() : '';
    const mEmail = norm(m.user_email);

    if (name && mName && name === mName) {
      hits.push({ row: m, via: 'name' });
      continue;
    }
    if (kFromUser && mPos && kFromUser === mPos) {
      hits.push({ row: m, via: 'position' });
      continue;
    }
    if (email && mEmail && email === mEmail) {
      hits.push({ row: m, via: 'email' });
      continue;
    }
    if (name && mName && (mName.includes(name) || name.includes(mName))) {
      hits.push({ row: m, via: 'name_partial' });
    }
  }

  const uniq = new Map();
  for (const h of hits) {
    uniq.set(String(h.row.id), h);
  }
  return [...uniq.values()];
}

async function loadAllMitarbeiter(store) {
  const firmen = await store.listFirmen();
  /** @type {object[]} */
  const all = [];
  for (const f of firmen) {
    const rows = await store.listMitarbeiterByFirma(f.id, { offset: 0, limit: 500 });
    for (const m of rows) all.push(m);
  }
  return { firmen, all };
}

/**
 * @param {import('../src/db/database.js').ReturnType<typeof openDatabase> extends Promise<infer S> ? S : never} store
 * @param {object} user
 * @param {object[]} allMaRows
 * @param {Map<string, { id: string, name: string }>} firmaById
 */
async function buildPlan(store, user, allMaRows, firmaById) {
  const uid = String(user.id).trim();
  const companyBefore =
    user.company_id != null && String(user.company_id).trim()
      ? String(user.company_id).trim()
      : null;

  let rows = findMitarbeiterRowsForUser(user, allMaRows);
  let linkAction = 'already_linked';
  let matchVia = 'user_id';
  /** @type {object|null} */
  let targetRow = rows.length === 1 ? rows[0] : rows.length > 0 ? rows[0] : null;

  if (rows.length === 0) {
    const maUsers = (await store.listUsers()).filter(isTargetMaUser);
    const maUserIds = new Set(maUsers.map((u) => String(u.id)));
    const candidates = allMaRows.filter((m) => !maUserIds.has(String(m.user_id).trim()));
    const heur = findMitarbeiterByHeuristics(user, candidates.length ? candidates : allMaRows);
    if (heur.length === 1) {
      targetRow = heur[0].row;
      matchVia = heur[0].via;
      linkAction = 'set_user_id';
      rows = [targetRow];
    } else if (heur.length > 1) {
      return {
        userId: uid,
        name: String(user.name || ''),
        email: String(user.email || ''),
        status: 'ambiguous_heuristic',
        matchVia,
        mitarbeiterId: null,
        mitarbeiterFirmaId: null,
        mitarbeiterFirmaName: null,
        position: null,
        companyBefore: companyBefore || '(leer)',
        companyAfter: companyBefore || '(leer)',
        wouldSetUserId: false,
        wouldSetCompanyId: false,
        notes: `mehrere Treffer: ${heur.map((h) => `${h.row.id}(${h.via})`).join(', ')}`,
      };
    } else {
      return {
        userId: uid,
        name: String(user.name || ''),
        email: String(user.email || ''),
        status: 'no_mitarbeiter',
        matchVia: '',
        mitarbeiterId: null,
        mitarbeiterFirmaId: null,
        mitarbeiterFirmaName: null,
        position: null,
        companyBefore: companyBefore || '(leer)',
        companyAfter: companyBefore || '(leer)',
        wouldSetUserId: false,
        wouldSetCompanyId: false,
        notes: 'keine mitarbeiter-Zeile per user_id oder Heuristik',
      };
    }
  } else if (rows.length > 1) {
    return {
      userId: uid,
      name: String(user.name || ''),
      email: String(user.email || ''),
      status: 'ambiguous_rows',
      matchVia: 'user_id',
      mitarbeiterId: rows.map((r) => r.id).join(', '),
      mitarbeiterFirmaId: rows.map((r) => r.firma_id).join(', '),
      mitarbeiterFirmaName: rows
        .map((r) => firmaById.get(String(r.firma_id))?.name || r.firma_id)
        .join(', '),
      position: rows.map((r) => r.position).join(', '),
      companyBefore: companyBefore || '(leer)',
      companyAfter: companyBefore || '(leer)',
      wouldSetUserId: false,
      wouldSetCompanyId: false,
      notes: `${rows.length} mitarbeiter-Zeilen für denselben user_id`,
    };
  }

  const firmaId = String(targetRow.firma_id).trim();
  const firmaName = firmaById.get(firmaId)?.name || firmaId;
  const companyAfter = firmaId;
  const userIdOnRow = String(targetRow.user_id).trim();
  const wouldSetUserId = linkAction === 'set_user_id' || userIdOnRow !== uid;
  const wouldSetCompanyId = companyBefore !== companyAfter;

  let status = 'ok';
  if (wouldSetUserId) status = 'will_link_user_id';
  else if (wouldSetCompanyId) status = 'will_align_company_id';
  else status = 'already_ok';

  return {
    userId: uid,
    name: String(user.name || ''),
    email: String(user.email || ''),
    status,
    matchVia,
    mitarbeiterId: String(targetRow.id),
    mitarbeiterFirmaId: firmaId,
    mitarbeiterFirmaName: firmaName,
    position: targetRow.position != null ? String(targetRow.position) : '',
    userIdOnRowBefore: userIdOnRow,
    companyBefore: companyBefore || '(leer)',
    companyAfter,
    wouldSetUserId,
    wouldSetCompanyId,
    targetRow,
    notes: '',
  };
}

function printReport(plans, mode) {
  console.log(`\n=== ${mode} ===\n`);
  const linked = plans.filter((p) => p.status === 'already_ok' || p.wouldSetUserId || p.wouldSetCompanyId);
  const failed = plans.filter(
    (p) => p.status === 'no_mitarbeiter' || p.status === 'ambiguous_rows' || p.status === 'ambiguous_heuristic',
  );

  console.log(`ccintern.ma.* User: ${plans.length}`);
  console.log(`verbunden / wird gefixt: ${linked.length}`);
  console.log(`nicht verbunden: ${failed.length}\n`);

  for (const p of plans) {
    console.log('─'.repeat(72));
    console.log(`User:           ${p.name} <${p.email}>`);
    console.log(`users.id:       ${p.userId}`);
    console.log(`Status:         ${p.status}`);
    if (p.mitarbeiterId) {
      console.log(`mitarbeiter.id: ${p.mitarbeiterId}`);
      console.log(`position:       ${p.position || '—'}`);
      console.log(`firma_id:       ${p.mitarbeiterFirmaId} (${p.mitarbeiterFirmaName})`);
    }
    if (p.matchVia) console.log(`Match:          ${p.matchVia}`);
    if (p.wouldSetUserId) {
      console.log(`→ user_id:      ${p.userIdOnRowBefore || '—'} → ${p.userId}`);
    }
    console.log(`company_id alt: ${p.companyBefore}`);
    console.log(`company_id neu: ${p.companyAfter}`);
    if (p.notes) console.log(`Hinweis:        ${p.notes}`);
  }
  console.log('─'.repeat(72));

  if (failed.length) {
    console.log('\nNicht verbunden:');
    for (const p of failed) {
      console.log(`  - ${p.email}: ${p.status} ${p.notes || ''}`);
    }
  }
}

async function applyPlan(store, plan) {
  if (!plan.targetRow || plan.status === 'no_mitarbeiter' || plan.status.startsWith('ambiguous')) {
    return false;
  }
  const fid = String(plan.mitarbeiterFirmaId).trim();
  const mid = String(plan.mitarbeiterId).trim();
  if (plan.wouldSetUserId) {
    await store.updateMitarbeiter(mid, fid, { user_id: plan.userId });
  }
  if (plan.wouldSetCompanyId && plan.companyAfter && plan.companyAfter !== '(leer)') {
    await store.updateUserCompany(plan.userId, plan.companyAfter);
  }
  return true;
}

async function verifyLinkage(store, userId, firmaId) {
  const m = await store.getMitarbeiterByUserAndFirma(userId, firmaId);
  const users = await store.listUsers();
  const u = users.find((x) => String(x.id) === userId);
  const companyOk = u && String(u.company_id || '').trim() === String(firmaId).trim();
  return { mitarbeiter: m, companyOk };
}

async function main() {
  const mysqlOn = Boolean(
    String(process.env.MYSQL_HOST || '').trim() &&
      String(process.env.MYSQL_USER || '').trim() &&
      String(process.env.MYSQL_DATABASE || '').trim(),
  );

  if (CONFIRM) {
    console.log('CONFIRM_FIX=YES — Backup und Stammdaten-Fix werden ausgeführt.');
    if (!mysqlOn) {
      backupSqliteDatabaseBeforeOpen();
    } else {
      console.warn('[Hinweis] MySQL aktiv — bitte vor dem Fix ein DB-Backup auf Server-Ebene anlegen.');
    }
  } else {
    console.log(
      'DRY-RUN (keine Schreibzugriffe). Echter Fix:\n  CONFIRM_FIX=YES node scripts/fix-mitarbeiter-user-links.mjs',
    );
  }

  const store = await openDatabase();
  const { firmen, all: allMaRows } = await loadAllMitarbeiter(store);
  const firmaById = new Map(firmen.map((f) => [String(f.id), { id: String(f.id), name: String(f.name || '') }]));

  const targets = (await store.listUsers()).filter(isTargetMaUser);
  if (!targets.length) {
    console.log('Keine ccintern.ma.* User gefunden.');
    return;
  }

  const plans = [];
  for (const u of targets) {
    plans.push(await buildPlan(store, u, allMaRows, firmaById));
  }

  printReport(plans, CONFIRM ? 'FIX — Änderungen' : 'DRY-RUN');

  if (!CONFIRM) {
    const okan = plans.find((p) => norm(p.email).includes('4a7e6df8'));
    if (okan) {
      console.log('\nOkan (Vorschau):');
      console.log(
        JSON.stringify(
          {
            status: okan.status,
            wouldSetCompanyId: okan.wouldSetCompanyId,
            companyBefore: okan.companyBefore,
            companyAfter: okan.companyAfter,
            mitarbeiterId: okan.mitarbeiterId,
            position: okan.position,
          },
          null,
          2,
        ),
      );
    }
    return;
  }

  let changed = 0;
  for (const plan of plans) {
    if (await applyPlan(store, plan)) changed++;
  }

  console.log('\n=== Nach Fix — Verifikation ===\n');
  for (const plan of plans) {
    if (!plan.mitarbeiterFirmaId || plan.status.startsWith('ambiguous') || plan.status === 'no_mitarbeiter') {
      console.log(`${plan.email}: SKIP (${plan.status})`);
      continue;
    }
    const v = await verifyLinkage(store, plan.userId, plan.mitarbeiterFirmaId);
    const ok = v.mitarbeiter && v.companyOk;
    console.log(`${plan.email}`);
    console.log(`  getMitarbeiterByUserAndFirma: ${v.mitarbeiter ? 'ja' : 'nein'}`);
    console.log(`  users.company_id = firma_id:  ${v.companyOk ? 'ja' : 'nein'}`);
    if (v.mitarbeiter) {
      console.log(`  mitarbeiter.user_id: ${v.mitarbeiter.user_id}`);
      console.log(`  position: ${v.mitarbeiter.position}`);
    }
    console.log(ok ? '  OK' : '  PRÜFEN');
  }

  console.log(`\nGeänderte Datensätze: ${changed}/${plans.length}`);
  console.log('Optional: node scripts/analyse-mitarbeiter-users.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
