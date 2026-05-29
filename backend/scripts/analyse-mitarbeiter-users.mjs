/**
 * Read-only IST: Mitarbeiter-App-Nutzer (ccintern.ma.* und/oder global_role INTERN).
 * Keine DB-Schreibzugriffe.
 *
 * Usage: node scripts/analyse-mitarbeiter-users.mjs
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');

const CCINTERN_BEREICHE_NICHT_DESKTOP = new Set([
  'mitarbeiter',
  'mitarbeiterapp',
  'urlaub',
  'produktion',
  'auftraege',
  'materiallager',
  'checklisten',
  'kalender',
  'kommunikation',
]);

/** Vollständiges App-Rechtepaket (vgl. fix-mitarbeiter-app-users.mjs). */
const FULL_APP_RIGHTS = {
  mitarbeiter: ['sehen'],
  mitarbeiterapp: ['sehen', 'erstellen', 'bearbeiten'],
  urlaub: ['sehen', 'erstellen', 'bearbeiten'],
  materiallager: ['sehen', 'erstellen', 'bearbeiten'],
  auftraege: ['sehen', 'bearbeiten'],
  produktion: ['sehen', 'erstellen', 'bearbeiten'],
  checklisten: ['sehen', 'bearbeiten'],
  kommunikation: ['sehen', 'erstellen', 'bearbeiten'],
};

function parseRightsJson(s) {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function rightsBlock(rightsRows, mod, ber) {
  const r = rightsRows.find((x) => x.module === mod && x.bereich === ber);
  if (!r) return null;
  return parseRightsJson(r.rechte_json);
}

function hasFlag(rightsRows, mod, ber, f) {
  const o = rightsBlock(rightsRows, mod, ber);
  return o ? !!o[f] : false;
}

function buildRightsFromRows(rightsRows) {
  const rights = {};
  for (const r of rightsRows) {
    if (!rights[r.module]) rights[r.module] = {};
    rights[r.module][r.bereich] = parseRightsJson(r.rechte_json);
  }
  return rights;
}

function moduleHasAnySehen(bundle, mod) {
  const block = bundle.rights?.[mod];
  if (!block) return false;
  return Object.keys(block).some((b) => block[b]?.sehen);
}

/** Spiegel frontend/core/access/cc-my-rights.js deriveShellUiAccess */
function deriveShellUiAccess(bundle) {
  if (!bundle) {
    return {
      isMitarbeiterAppOnlyShell: false,
      canSeeCockpit: false,
      canSeeFusa: false,
      canSeeCcInternDesktop: false,
      canSeeMitarbeiterApp: false,
    };
  }
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = bundle.modules || [];
  const canSeeCockpit = isSa || (mods.includes('cockpit') && moduleHasAnySehen(bundle, 'cockpit'));
  const canSeeFusa = isSa || (mods.includes('fusa') && moduleHasAnySehen(bundle, 'fusa'));
  const hasCcinternMod = isSa || mods.includes('ccintern');
  const canSeeMitarbeiterApp =
    isSa || (hasCcinternMod && bundle.rights?.ccintern?.mitarbeiterapp?.sehen);
  let canSeeCcInternDesktop = false;
  if (isSa) canSeeCcInternDesktop = true;
  else if (hasCcinternMod && bundle.rights?.ccintern) {
    for (const bereich of Object.keys(bundle.rights.ccintern)) {
      if (CCINTERN_BEREICHE_NICHT_DESKTOP.has(bereich)) continue;
      if (bundle.rights.ccintern[bereich]?.sehen) {
        canSeeCcInternDesktop = true;
        break;
      }
    }
  }
  const isMitarbeiterAppOnlyShell =
    !isSa &&
    canSeeMitarbeiterApp &&
    !canSeeCcInternDesktop &&
    !canSeeCockpit &&
    !canSeeFusa;
  return {
    isMitarbeiterAppOnlyShell,
    canSeeCockpit,
    canSeeFusa,
    canSeeCcInternDesktop,
    canSeeMitarbeiterApp,
  };
}

function checkFullAppRights(rightsRows) {
  const missing = [];
  for (const [ber, flags] of Object.entries(FULL_APP_RIGHTS)) {
    for (const f of flags) {
      if (!hasFlag(rightsRows, 'ccintern', ber, f)) {
        missing.push(`ccintern.${ber}.${f}`);
      }
    }
  }
  return missing;
}

function ccinternRightsSummary(rightsRows) {
  return rightsRows
    .filter((r) => r.module === 'ccintern')
    .map((r) => {
      const o = parseRightsJson(r.rechte_json);
      const on = Object.keys(o).filter((k) => o[k]);
      return `${r.bereich}:{${on.join(',')}}`;
    })
    .join(' | ');
}

async function runSqlite() {
  const { default: initSqlJs } = await import('sql.js');
  const dbPath = process.env.SQLITE_DB_PATH || path.join(backendRoot, 'data', 'cc-cockpit.db');
  if (!fs.existsSync(dbPath)) {
    console.error('DB fehlt:', dbPath);
    process.exit(1);
  }
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(dbPath));
  const q = (sql, params = []) => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
  };

  const users = q(
    `SELECT u.id, u.email, u.name, u.global_role, u.company_id, u.status,
            m.position AS kuerzel, m.id AS mitarbeiter_row_id
     FROM users u
     LEFT JOIN mitarbeiter m ON m.user_id = u.id
     WHERE lower(u.email) LIKE 'ccintern.ma.%@cc-cockpit.local'
        OR u.global_role = 'INTERN'
     ORDER BY u.email`,
  );

  const firmen = q('SELECT id, name FROM firmen');
  const firmaSet = new Set(firmen.map((f) => String(f.id)));
  const firmaName = Object.fromEntries(firmen.map((f) => [String(f.id), String(f.name || '')]));

  const paCounts = q('SELECT user_id, COUNT(*) AS c FROM project_access GROUP BY user_id');
  const paMap = Object.fromEntries(paCounts.map((r) => [String(r.user_id), Number(r.c)]));

  const paDetail = q(
    `SELECT pa.user_id, pa.project_id, p.name AS project_name
     FROM project_access pa
     LEFT JOIN projects p ON p.id = pa.project_id`,
  );
  const paByUser = {};
  for (const row of paDetail) {
    const uid = String(row.user_id);
    if (!paByUser[uid]) paByUser[uid] = [];
    paByUser[uid].push({
      project_id: String(row.project_id),
      project_name: row.project_name != null ? String(row.project_name) : '',
    });
  }

  const results = [];
  for (const u of users) {
    const uid = String(u.id);
    const mods = q('SELECT module FROM user_modules WHERE user_id = ?', [uid]).map((r) =>
      String(r.module),
    );
    const rightsRows = q(
      'SELECT module, bereich, rechte_json FROM user_rights WHERE user_id = ?',
      [uid],
    );
    const rights = buildRightsFromRows(rightsRows);
    const bundle = {
      global_role: String(u.global_role || 'INTERN'),
      modules: mods,
      rights,
    };
    const ui = deriveShellUiAccess(bundle);
    const missingRights = checkFullAppRights(rightsRows);
    const cid = u.company_id != null ? String(u.company_id).trim() : '';
    const ctxMissing = [];
    if (!cid) ctxMissing.push('company_id fehlt');
    else if (!firmaSet.has(cid)) ctxMissing.push('Firma-ID unbekannt');
    const pa = paMap[uid] || 0;
    if (pa === 0) ctxMissing.push('kein project_access');
    const kuerzel = u.kuerzel != null ? String(u.kuerzel).trim() : '';
    if (!kuerzel) ctxMissing.push('kein mitarbeiter.kuerzel/position');
    if (!u.mitarbeiter_row_id) ctxMissing.push('keine mitarbeiter-Zeile');
    const mfid =
      u.mitarbeiter_firma_id != null ? String(u.mitarbeiter_firma_id).trim() : '';
    const companySync = !!(cid && mfid && cid === mfid);
    if (u.mitarbeiter_row_id && mfid && !companySync) {
      ctxMissing.push('company_id ≠ mitarbeiter.firma_id');
    }
    if (String(u.status || '') !== 'aktiv') ctxMissing.push(`status=${u.status}`);

    let risk = 'niedrig';
    if (!ui.isMitarbeiterAppOnlyShell) {
      risk = 'hoch (sieht Desktop/Cockpit/FUSA)';
    } else if (missingRights.length) {
      risk = 'mittel (App-only aber Rechte lückenhaft)';
    } else if (ctxMissing.length) {
      risk = 'mittel (Kontext fehlt)';
    }

    results.push({
      email: String(u.email),
      name: String(u.name || ''),
      id: uid,
      global_role: String(u.global_role),
      company_id: cid || null,
      firma: cid && firmaName[cid] ? firmaName[cid] : null,
      modules: mods,
      ccintern_bereiche: ccinternRightsSummary(rightsRows) || '(keine)',
      mitarbeiter_sehen: hasFlag(rightsRows, 'ccintern', 'mitarbeiter', 'sehen'),
      mitarbeiterapp_sehen: hasFlag(rightsRows, 'ccintern', 'mitarbeiterapp', 'sehen'),
      mitarbeiter_user_id_linked: !!u.mitarbeiter_row_id,
      company_id_sync: companySync,
      mitarbeiterapp_erstellen: hasFlag(rightsRows, 'ccintern', 'mitarbeiterapp', 'erstellen'),
      urlaub_sehen: hasFlag(rightsRows, 'ccintern', 'urlaub', 'sehen'),
      urlaub_erstellen: hasFlag(rightsRows, 'ccintern', 'urlaub', 'erstellen'),
      materiallager_sehen: hasFlag(rightsRows, 'ccintern', 'materiallager', 'sehen'),
      materiallager_erstellen: hasFlag(rightsRows, 'ccintern', 'materiallager', 'erstellen'),
      materiallager_bearbeiten: hasFlag(rightsRows, 'ccintern', 'materiallager', 'bearbeiten'),
      auftraege_sehen: hasFlag(rightsRows, 'ccintern', 'auftraege', 'sehen'),
      auftraege_bearbeiten: hasFlag(rightsRows, 'ccintern', 'auftraege', 'bearbeiten'),
      produktion_sehen: hasFlag(rightsRows, 'ccintern', 'produktion', 'sehen'),
      produktion_erstellen: hasFlag(rightsRows, 'ccintern', 'produktion', 'erstellen'),
      produktion_bearbeiten: hasFlag(rightsRows, 'ccintern', 'produktion', 'bearbeiten'),
      checklisten_sehen: hasFlag(rightsRows, 'ccintern', 'checklisten', 'sehen'),
      checklisten_bearbeiten: hasFlag(rightsRows, 'ccintern', 'checklisten', 'bearbeiten'),
      app_only: ui.isMitarbeiterAppOnlyShell,
      sees_cockpit: ui.canSeeCockpit,
      sees_fusa: ui.canSeeFusa,
      sees_cc_desktop: ui.canSeeCcInternDesktop,
      lands_ma_app: ui.isMitarbeiterAppOnlyShell || (ui.canSeeMitarbeiterApp && !ui.canSeeCcInternDesktop),
      app_rights_ok: missingRights.length === 0,
      missing_rights: missingRights,
      missing_ctx: ctxMissing,
      project_access: paByUser[uid] || [],
      project_access_count: pa,
      kuerzel: kuerzel || null,
      risk,
    });
  }

  db.close();
  return { dbPath, count: results.length, results };
}

function printReport(data) {
  console.log('=== Mitarbeiter-User IST (read-only) ===\n');
  console.log('DB:', data.dbPath);
  console.log('Treffer (ccintern.ma.* ODER global_role=INTERN):', data.count);
  console.log('');

  const w = [28, 8, 12, 40, 35, 28];
  const pad = (s, n) => String(s).slice(0, n).padEnd(n);
  console.log(
    [
      pad('User', w[0]),
      pad('App-only', w[1]),
      pad('Rechte OK', w[2]),
      pad('Fehlende Rechte', w[3]),
      pad('Fehlender Kontext', w[4]),
      pad('Risiko', w[5]),
    ].join(' '),
  );
  console.log('-'.repeat(w.reduce((a, b) => a + b, 0) + w.length));

  for (const r of data.results) {
    const user = `${r.email}`;
    const missR = r.missing_rights.length ? r.missing_rights.join(', ') : '—';
    const missC = r.missing_ctx.length ? r.missing_ctx.join('; ') : '—';
    console.log(
      [
        pad(user, w[0]),
        pad(r.app_only ? 'ja' : 'nein', w[1]),
        pad(r.app_rights_ok ? 'ja' : 'nein', w[2]),
        pad(missR, w[3]),
        pad(missC, w[4]),
        pad(r.risk, w[5]),
      ].join(' '),
    );
  }

  console.log('\n--- Detail ---\n');
  for (const r of data.results) {
    console.log(JSON.stringify(r, null, 2));
    console.log('---');
  }
}

const data = await runSqlite();
printReport(data);
