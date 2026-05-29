/**
 * Diagnose: Nutzer mit isMitarbeiterAppOnlyShell (wie frontend/core/access/cc-my-rights.js).
 * Read-only bis auf optionale Urlaub-Probe (nur wenn Server /health OK + JWT_SECRET + DIAG_URLAUB_PROBE=1).
 *
 * Usage (backend-Verzeichnis):
 *   node scripts/diag-mitarbeiter-app-only-report.mjs
 *
 * Env:
 *   DIAG_API_BASE — Default http://127.0.0.1:5371
 *   JWT_SECRET — für echtes POST /api/v1/urlaub (sonst Spalte „HTTP“ = n/a)
 *   DIAG_URLAUB_PROBE=1 — ein Testantrag pro Nutzer (bemerkung „diag-ma-app-only-probe“)
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';
import { signAccessToken } from '../src/auth/jwt.js';

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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseRightsJson(s) {
  if (!s) return {};
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}

function moduleHasAnySehen(bundle, mod) {
  const block = bundle.rights?.[mod];
  if (!block) return false;
  return Object.keys(block).some((b) => block[b]?.sehen);
}

function buildRightsFromRows(rightsRows) {
  const rights = {};
  for (const r of rightsRows) {
    if (!rights[r.module]) rights[r.module] = {};
    rights[r.module][r.bereich] = parseRightsJson(r.rechte_json);
  }
  return rights;
}

/** Entspricht deriveShellUiAccess in frontend/core/access/cc-my-rights.js */
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

function hasFlag(rightsRows, mod, ber, f) {
  const r = rightsRows.find((x) => x.module === mod && x.bereich === ber);
  const o = r ? parseRightsJson(r.rechte_json) : {};
  return !!o[f];
}

async function projectAccessCount(store, uid) {
  const projects = await store.listProjects();
  let n = 0;
  for (const p of projects) {
    const row = await store.getProjectAccessByUserAndProject(uid, p.id);
    if (row) n++;
  }
  return n;
}

async function firstProjectIdForUser(store, uid) {
  const projects = await store.listProjects();
  for (const p of projects) {
    const row = await store.getProjectAccessByUserAndProject(uid, p.id);
    if (row) return String(p.id);
  }
  return '';
}

async function tryHealth(apiBase) {
  try {
    const ac = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined;
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/health`, ac ? { signal: ac } : {});
    return res.ok;
  } catch {
    return false;
  }
}

async function tryPostUrlaub(apiBase, store, userRow, projectId) {
  const u = await store.getUserById(userRow.id);
  if (!u) return { status: 0, err: 'no user' };
  const token = signAccessToken({
    sub: String(u.id),
    email: String(u.email || ''),
    global_role: String(u.global_role || 'INTERN'),
  });
  const von = '2030-01-06';
  const bis = '2030-01-07';
  try {
    const ac = typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined;
    const res = await fetch(`${apiBase.replace(/\/$/, '')}/api/v1/urlaub`, {
      method: 'POST',
      ...(ac ? { signal: ac } : {}),
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'x-project-id': projectId,
      },
      body: JSON.stringify({
        mitarbeiter_id: String(u.id),
        von,
        bis,
        typ: 'urlaub',
        status: 'offen',
        bemerkung: 'diag-ma-app-only-probe',
      }),
    });
    return { status: res.status };
  } catch (e) {
    return { status: 0, err: e instanceof Error ? e.message : String(e) };
  }
}

async function main() {
  const store = await openDatabase();
  const apiBase = String(process.env.DIAG_API_BASE || 'http://127.0.0.1:5371').trim();
  const allowProbe = String(process.env.DIAG_URLAUB_PROBE || '').trim() === '1';
  let jwtOk = false;
  try {
    const secret = process.env.JWT_SECRET;
    jwtOk = !!(secret && String(secret).trim());
  } catch {
    jwtOk = false;
  }
  const serverUp = jwtOk ? await tryHealth(apiBase) : false;

  const all = await store.listUsers();
  const appOnlyUsers = [];

  for (const row of all) {
    const uid = String(row.id);
    const mods = (await store.listUserModules(uid)).map((r) => String(r.module));
    const rightsRows = await store.listUserRights(uid);
    const rights = buildRightsFromRows(rightsRows);
    const bundle = {
      global_role: String(row.global_role || 'INTERN'),
      modules: mods,
      rights,
    };
    const ui = deriveShellUiAccess(bundle);
    if (!ui.isMitarbeiterAppOnlyShell) continue;

    const uuidOk = UUID_RE.test(uid);
    const kuerzelRaw = row.kuerzel != null ? String(row.kuerzel).trim() : '';
    const kuerzelOk = kuerzelRaw.length > 0;
    const cid = row.company_id != null ? String(row.company_id).trim() : '';
    const companyOk = cid.length > 0;
    const pa = await projectAccessCount(store, uid);
    const paOk = pa > 0;

    const urlaubRightsOk =
      hasFlag(rightsRows, 'ccintern', 'urlaub', 'sehen') &&
      hasFlag(rightsRows, 'ccintern', 'urlaub', 'erstellen');
    const maAppOk = hasFlag(rightsRows, 'ccintern', 'mitarbeiterapp', 'sehen');
    const aufOk =
      hasFlag(rightsRows, 'ccintern', 'auftraege', 'sehen') ||
      hasFlag(rightsRows, 'ccintern', 'auftraege', 'bearbeiten');

    let auftragRows = [];
    if (companyOk && typeof store.listProduktionAuftraegeForMitarbeiterApp === 'function') {
      auftragRows = await store.listProduktionAuftraegeForMitarbeiterApp(cid, uid);
    }

    let urlaubHttp = 'n/a';
    let urlaubNote = '';
    if (!jwtOk) {
      urlaubNote = 'JWT_SECRET fehlt';
    } else if (!serverUp) {
      urlaubNote = `API nicht erreichbar (${apiBase}/health)`;
    } else if (!allowProbe) {
      urlaubNote = 'DIAG_URLAUB_PROBE nicht gesetzt (kein POST)';
    } else {
      const pid = await firstProjectIdForUser(store, uid);
      if (!pid) {
        urlaubHttp = '—';
        urlaubNote = 'kein project_access → kein x-project-id';
      } else {
        const r = await tryPostUrlaub(apiBase, store, row, pid);
        urlaubHttp = r.status ? String(r.status) : `fail ${r.err || ''}`;
      }
    }

    const urlaubStaticOk =
      urlaubRightsOk && companyOk && paOk && String(row.status || 'aktiv') === 'aktiv';

    const aufgabenApiReady = maAppOk && aufOk && companyOk && paOk;
    const aufgabenCount = auftragRows.length;

    appOnlyUsers.push({
      id: uid,
      name: row.name != null ? String(row.name) : '',
      email: row.email != null ? String(row.email) : '',
      global_role: String(row.global_role || ''),
      uuid_ok: uuidOk,
      kuerzel_ok: kuerzelOk,
      kuerzel: kuerzelRaw || null,
      urlaub_static_ok: urlaubStaticOk,
      urlaub_http: urlaubHttp,
      urlaub_note: urlaubNote,
      aufgaben_ready: aufgabenApiReady,
      aufgaben_db_rows: aufgabenCount,
      company_ok: companyOk,
      project_access_n: pa,
      status: String(row.status || ''),
    });
  }

  appOnlyUsers.sort((a, b) => a.email.localeCompare(b.email));

  console.log('=== Mitarbeiter-App-only (deriveShellUiAccess) ===\n');
  console.log(`Treffer App-only-Shell: ${appOnlyUsers.length}`);
  console.log(
    'Schema-Hinweis: Es gibt keine Spalte users.rolle — Rolle = global_role (typ. INTERN). Kürzel = mitarbeiter.position (JOIN in listUsers).\n',
  );
  console.log(
    'Referenz-SQL (MySQL-angepasst): SELECT u.id, u.name, u.email, m.position AS kuerzel, u.global_role AS rolle FROM users u LEFT JOIN mitarbeiter m ON m.user_id = u.id WHERE u.global_role = \'MITARBEITER\' OR m.user_id IS NOT NULL;\n',
  );

  const line = (a, b, c, d, e, f, g) =>
    [a, b, c, d, e, f, g].map((x, i) => String(x).padEnd([36, 28, 8, 8, 14, 18, 40][i])).join(' ');
  console.log(line('id', 'email', 'UUID', 'Kürzel', 'Urlaub(stat)', 'Urlaub HTTP', 'Aufgaben(DB)'));
  console.log('-'.repeat(132));

  for (const u of appOnlyUsers) {
    console.log(
      line(
        u.id,
        u.email.slice(0, 26),
        u.uuid_ok ? '✓' : '✗',
        u.kuerzel_ok ? '✓' : '✗',
        u.urlaub_static_ok ? '✓' : '✗',
        allowProbe && serverUp && jwtOk ? (u.urlaub_http === '201' ? '✓ 201' : `✗ ${u.urlaub_http}`) : 'n/a',
        u.aufgaben_ready
          ? u.aufgaben_db_rows > 0
            ? `✓ (${u.aufgaben_db_rows})`
            : `⚠ 0 (pool leer)`
          : '✗',
      ),
    );
  }

  console.log('\n--- Details / Lücken ---\n');
  for (const u of appOnlyUsers) {
    const gaps = [];
    if (!u.uuid_ok) gaps.push('id keine UUID');
    if (!u.kuerzel_ok) gaps.push('kein mitarbeiter.position (Kürzel)');
    if (!u.company_ok) gaps.push('company_id fehlt');
    if (u.project_access_n === 0) gaps.push('kein project_access');
    if (!u.urlaub_static_ok) gaps.push('Urlaub-Rechte oder Kontext');
    if (!u.aufgaben_ready) gaps.push('mitarbeiterapp/auftraege oder Kontext');
    else if (u.aufgaben_db_rows === 0) gaps.push('keine Produktions-/Workflow-Zuweisung in DB');
    console.log(`${u.email} (${u.name})`);
    console.log(`  uuid:${u.uuid_ok ? '✓' : '✗'} kuerzel:${u.kuerzel_ok ? '✓' : '✗'} urlaub_static:${u.urlaub_static_ok ? '✓' : '✗'} urlaub_http:${allowProbe ? u.urlaub_http : 'n/a'} — ${u.urlaub_note}`);
    console.log(`  aufgaben:${u.aufgaben_ready ? (u.aufgaben_db_rows > 0 ? '✓' : '⚠ 0') : '✗'}  ${gaps.length ? 'Lücken: ' + gaps.join('; ') : 'ok'}`);
    console.log('');
  }

  if (appOnlyUsers.length !== 10) {
    console.log(
      `Hinweis: Erwartung „10 Nutzer“ — gefunden ${appOnlyUsers.length} mit isMitarbeiterAppOnlyShell. Prüfen, ob alle MA-Accounts app-only gebündelt sind oder ob die DB abweicht.\n`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
