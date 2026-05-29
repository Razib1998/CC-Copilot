/**
 * Datenfix: ccintern.ma.* Mitarbeiter-App-User → App-only + volles App-Rechtepaket.
 * Architektur: docs/ARCHITEKTUR_REGEL.md — Steuerung/Rechte über Cockpit (DB-Bundle).
 *
 * Dry-Run (Standard):
 *   cd backend && node scripts/fix-mitarbeiter-app-users.mjs
 *
 * Echter Fix (Server stoppen — sql.js):
 *   cd backend && CONFIRM_FIX=YES node scripts/fix-mitarbeiter-app-users.mjs
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { normalizeRightsJson } from '../src/auth/rights-spec.js';
import { loadAccessProfile } from '../src/auth/access-profile.js';
import {
  backupSqliteDatabaseBeforeOpen,
  openDatabase,
} from '../src/db/database.js';

const CONFIRM = String(process.env.CONFIRM_FIX || '').trim().toUpperCase() === 'YES';

const TARGET_MODULES = ['ccintern'];

/** @type {Record<string, Record<string, boolean>>} */
const APP_RIGHTS_RAW = {
  mitarbeiter: { sehen: true },
  mitarbeiterapp: { sehen: true, erstellen: true, bearbeiten: true },
  urlaub: { sehen: true, erstellen: true, bearbeiten: true },
  materiallager: { sehen: true, erstellen: true, bearbeiten: true },
  auftraege: { sehen: true, bearbeiten: true },
  produktion: { sehen: true, erstellen: true, bearbeiten: true },
  checklisten: { sehen: true, bearbeiten: true },
  kommunikation: { sehen: true, erstellen: true, bearbeiten: true },
};

const APP_RIGHTS_CCINTERN = Object.fromEntries(
  Object.entries(APP_RIGHTS_RAW).map(([bereich, flags]) => [bereich, normalizeRightsJson(flags)]),
);

/** Erwartetes App-Rechtepaket (Verifikation). */
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

function moduleHasAnySehen(bundle, mod) {
  const block = bundle?.rights?.[mod];
  if (!block || typeof block !== 'object') return false;
  return Object.keys(block).some((b) => block[b]?.sehen);
}

/** Wie frontend/core/access/cc-my-rights.js */
function deriveShellUiAccess(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return {
      isMitarbeiterAppOnlyShell: false,
      canSeeCockpit: false,
      canSeeFusa: false,
      canSeeCcInternDesktop: false,
      canSeeMitarbeiterApp: false,
    };
  }
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = Array.isArray(bundle.modules) ? bundle.modules : [];
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

function bundleFromProfile(profile) {
  /** @type {Record<string, Record<string, import('../src/auth/rights-spec.js').RightsFlags>>} */
  const rights = {};
  for (const [k, flags] of profile.rightsByKey.entries()) {
    const idx = k.indexOf(':');
    if (idx < 0) continue;
    const mod = k.slice(0, idx);
    const bereich = k.slice(idx + 1);
    if (!rights[mod]) rights[mod] = {};
    rights[mod][bereich] = { ...flags };
  }
  return {
    global_role: profile.globalRole,
    modules: [...profile.modules],
    rights,
  };
}

function isTargetMaUser(u) {
  const email = String(u.email || '').trim().toLowerCase();
  if (!/^ccintern\.ma\.[^@]+@cc-cockpit\.local$/.test(email)) return false;
  const gr = String(u.global_role || '').trim();
  if (gr === 'SUPER_ADMIN') return false;
  if (gr !== 'INTERN') return false;
  return true;
}

function formatProjectAccessList(rows) {
  if (!rows.length) return '(keine)';
  return rows
    .map((r) => `${r.project_id}${r.project_name ? `:${r.project_name}` : ''}`)
    .join(', ');
}

async function listProjectAccessForUser(store, userId) {
  const projects = await store.listProjects();
  const out = [];
  for (const p of projects) {
    const pa = await store.getProjectAccessByUserAndProject(userId, p.id);
    if (pa) {
      out.push({
        project_id: String(p.id),
        project_name: p.name != null ? String(p.name) : '',
        role: pa.role,
      });
    }
  }
  return out;
}

async function resolveFirmaIdFromMitarbeiter(store, userId) {
  const firmen = await store.listFirmen();
  const matches = [];
  for (const f of firmen) {
    const fid = String(f.id).trim();
    const m = await store.getMitarbeiterByUserAndFirma(userId, fid);
    if (m) matches.push({ firma_id: fid, firma_name: f.name != null ? String(f.name) : '', row: m });
  }
  if (matches.length === 1) {
    return { firmaId: matches[0].firma_id, firmaName: matches[0].firma_name, ambiguous: false };
  }
  if (matches.length > 1) {
    return {
      firmaId: null,
      ambiguous: true,
      reason: `mehrere mitarbeiter-Zeilen (${matches.length} Firmen)`,
    };
  }
  return { firmaId: null, ambiguous: false, reason: 'keine mitarbeiter-Zeile' };
}

async function resolveStandardProject(store, companyId) {
  const projects = await store.listProjects();
  const standard = projects.filter((p) =>
    /^standard\s+projekt$/i.test(String(p.name || '').trim()),
  );
  if (standard.length === 1) {
    return {
      projectId: String(standard[0].id),
      projectName: String(standard[0].name || ''),
      source: 'name:Standard Projekt',
      ambiguous: false,
    };
  }
  if (standard.length > 1) {
    return { projectId: null, ambiguous: true, reason: 'mehrere Projekte „Standard Projekt“' };
  }

  if (projects.length === 1) {
    return {
      projectId: String(projects[0].id),
      projectName: String(projects[0].name || ''),
      source: 'einziges Projekt in DB',
      ambiguous: false,
    };
  }

  if (companyId) {
    const users = await store.listUsers();
    const counts = new Map();
    for (const u of users) {
      if (String(u.company_id || '').trim() !== companyId) continue;
      const uid = String(u.id);
      for (const p of projects) {
        const pa = await store.getProjectAccessByUserAndProject(uid, p.id);
        if (pa) {
          const pid = String(p.id);
          counts.set(pid, {
            count: (counts.get(pid)?.count || 0) + 1,
            name: String(p.name || ''),
          });
        }
      }
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count);
    if (ranked.length === 1) {
      return {
        projectId: ranked[0][0],
        projectName: ranked[0][1].name,
        source: 'Peer project_access (Firma)',
        ambiguous: false,
      };
    }
    if (ranked.length > 1 && ranked[0][1].count > ranked[1][1].count) {
      return {
        projectId: ranked[0][0],
        projectName: ranked[0][1].name,
        source: 'häufigstes Peer-project_access',
        ambiguous: false,
      };
    }
  }

  return {
    projectId: null,
    ambiguous: true,
    reason: 'kein Standard-/Peer-Projekt eindeutig',
  };
}

function checkFullAppRights(profile) {
  const missing = [];
  for (const [ber, flags] of Object.entries(FULL_APP_RIGHTS)) {
    for (const f of flags) {
      if (!profile.has('ccintern', ber, /** @type {keyof import('../src/auth/rights-spec.js').RightsFlags} */ (f))) {
        missing.push(`ccintern.${ber}.${f}`);
      }
    }
  }
  return missing;
}

async function buildPlan(store, user) {
  const uid = String(user.id).trim();
  const modsBefore = (await store.listUserModules(uid)).map((r) => String(r.module));
  const paBefore = await listProjectAccessForUser(store, uid);
  const companyBefore =
    user.company_id != null && String(user.company_id).trim()
      ? String(user.company_id).trim()
      : null;

  let companyNew = companyBefore;
  let companyNote = '';
  if (!companyNew) {
    const firma = await resolveFirmaIdFromMitarbeiter(store, uid);
    if (firma.firmaId) {
      companyNew = firma.firmaId;
      companyNote = `aus mitarbeiter.firma_id (${firma.firmaName || firma.firmaId})`;
    } else if (firma.ambiguous) {
      companyNote = firma.reason || 'Firma nicht eindeutig';
    } else {
      companyNote = firma.reason || 'keine Firma ermittelbar';
    }
  }

  const projectRes = await resolveStandardProject(store, companyNew);
  let paNew = [...paBefore];
  let projectNote = '';
  if (projectRes.projectId) {
    const has = paBefore.some((p) => p.project_id === projectRes.projectId);
    if (!has) {
      paNew = [
        ...paBefore,
        {
          project_id: projectRes.projectId,
          project_name: projectRes.projectName,
          role: 'mitarbeiter',
          _wouldInsert: true,
        },
      ];
      projectNote = `neu: ${projectRes.projectName} (${projectRes.source})`;
    } else {
      projectNote = 'bereits vorhanden';
    }
  } else {
    projectNote = projectRes.reason || 'Projekt nicht ermittelbar';
  }

  const gr = String(user.global_role || '').trim() === 'EXTERN' ? 'EXTERN' : 'INTERN';

  const bundleAfter = {
    global_role: gr,
    modules: TARGET_MODULES,
    rights: { ccintern: { ...APP_RIGHTS_CCINTERN } },
  };
  const uiAfter = deriveShellUiAccess(bundleAfter);

  const zuordnungFehlt =
    !companyNew ||
    companyNote.includes('nicht eindeutig') ||
    companyNote.includes('mehrere') ||
    (!projectRes.projectId && paBefore.length === 0);

  return {
    userId: uid,
    name: String(user.name || ''),
    email: String(user.email || ''),
    globalRole: gr,
    modsBefore,
    modsAfter: TARGET_MODULES,
    companyBefore: companyBefore || '(leer)',
    companyNew: companyNew || '(leer)',
    companyNote,
    paBefore,
    paAfter: paNew,
    projectNote,
    projectIdToGrant: projectRes.projectId,
    zuordnungFehlt,
    wouldAppOnly: uiAfter.isMitarbeiterAppOnlyShell,
    wouldUi: uiAfter,
    needsAccessBundle: true,
    needsCompany: companyNew && companyNew !== companyBefore,
    needsProjectAccess:
      projectRes.projectId &&
      !paBefore.some((p) => p.project_id === projectRes.projectId),
  };
}

function printDryRunReport(plans, modeLabel) {
  console.log(`\n=== ${modeLabel} ===\n`);
  console.log(`Ziel-User: ${plans.length}\n`);
  for (const p of plans) {
    console.log('─'.repeat(72));
    console.log(`Name:              ${p.name}`);
    console.log(`E-Mail:            ${p.email}`);
    console.log(`user_id:           ${p.userId}`);
    console.log(`alte modules:      ${p.modsBefore.join(', ') || '(keine)'}`);
    console.log(`neue modules:      ${p.modsAfter.join(', ')}`);
    console.log(`company_id alt:    ${p.companyBefore}`);
    console.log(`company_id neu:    ${p.companyNew}${p.companyNote ? ` (${p.companyNote})` : ''}`);
    console.log(`project_access alt: ${formatProjectAccessList(p.paBefore)}`);
    console.log(
      `project_access neu: ${formatProjectAccessList(p.paAfter)}${p.projectNote ? ` — ${p.projectNote}` : ''}`,
    );
    console.log(`fehlende Zuordnung: ${p.zuordnungFehlt ? 'ja' : 'nein'}`);
    console.log(`würde app_only:    ${p.wouldAppOnly ? 'ja' : 'nein'}`);
    if (!p.wouldAppOnly) {
      console.log(
        `  Shell-Vorschau: cockpit=${p.wouldUi.canSeeCockpit} fusa=${p.wouldUi.canSeeFusa} ccDesktop=${p.wouldUi.canSeeCcInternDesktop} maApp=${p.wouldUi.canSeeMitarbeiterApp}`,
      );
    }
  }
  console.log('─'.repeat(72));
}

async function verifyUser(store, userId) {
  const profile = await loadAccessProfile(store, userId);
  const bundle = bundleFromProfile(profile);
  const ui = deriveShellUiAccess(bundle);
  const missing = checkFullAppRights(profile);
  return { ui, missing, modules: bundle.modules };
}

async function applyFix(store, plan) {
  const uid = plan.userId;
  if (plan.needsCompany && plan.companyNew && plan.companyNew !== '(leer)') {
    await store.updateUserCompany(uid, plan.companyNew);
  }
  await store.replaceUserAccessBundle({
    userId: uid,
    globalRole: plan.globalRole,
    modules: plan.modsAfter,
    rights: { ccintern: APP_RIGHTS_CCINTERN },
  });
  if (plan.needsProjectAccess && plan.projectIdToGrant) {
    await store.insertProjectAccess({
      id: randomUUID(),
      userId: uid,
      projectId: plan.projectIdToGrant,
      role: 'mitarbeiter',
      canViewPrices: false,
      canEdit: true,
      canCreateAuftraege: false,
    });
  }
}

async function main() {
  const mysqlOn = Boolean(
    String(process.env.MYSQL_HOST || '').trim() &&
      String(process.env.MYSQL_USER || '').trim() &&
      String(process.env.MYSQL_DATABASE || '').trim(),
  );

  if (CONFIRM) {
    console.log('CONFIRM_FIX=YES — Backup und Datenänderungen werden ausgeführt.');
    if (!mysqlOn) {
      backupSqliteDatabaseBeforeOpen();
    } else {
      console.warn(
        '[Hinweis] MySQL aktiv — bitte vor dem Fix ein DB-Backup auf Server-Ebene anlegen.',
      );
    }
  } else {
    console.log('DRY-RUN (keine Schreibzugriffe). Echter Fix: CONFIRM_FIX=YES node scripts/fix-mitarbeiter-app-users.mjs');
  }

  const store = await openDatabase();
  const allUsers = await store.listUsers();
  const targets = allUsers.filter(isTargetMaUser);

  if (targets.length === 0) {
    console.log('Keine Ziel-User (ccintern.ma.* + INTERN, ohne SUPER_ADMIN).');
    return;
  }

  const plans = [];
  for (const u of targets) {
    plans.push(await buildPlan(store, u));
  }

  printDryRunReport(plans, CONFIRM ? 'FIX — geplante Änderungen' : 'DRY-RUN');

  if (!CONFIRM) {
    const wouldOk = plans.filter((p) => p.wouldAppOnly).length;
    console.log(`\nZusammenfassung: ${wouldOk}/${plans.length} würden nach Fix app_only=true haben.`);
    console.log('Zum Anwenden: CONFIRM_FIX=YES node scripts/fix-mitarbeiter-app-users.mjs');
    return;
  }

  const changed = [];
  for (const plan of plans) {
    await applyFix(store, plan);
    changed.push(plan);
  }

  console.log('\n=== Nach Fix — Verifikation ===\n');
  let allOk = true;
  for (const plan of changed) {
    const v = await verifyUser(store, plan.userId);
    const ok =
      v.ui.isMitarbeiterAppOnlyShell &&
      !v.ui.canSeeFusa &&
      !v.ui.canSeeCockpit &&
      v.missing.length === 0;
    if (!ok) allOk = false;
    console.log(`${plan.email}`);
    console.log(
      `  app_only=${v.ui.isMitarbeiterAppOnlyShell} cockpit=${v.ui.canSeeCockpit} fusa=${v.ui.canSeeFusa} modules=${v.modules.join(',')}`,
    );
    if (v.missing.length) console.log(`  fehlende Rechte: ${v.missing.join(', ')}`);
    console.log(ok ? '  OK' : '  PRÜFEN');
  }

  console.log(`\nGeänderte User: ${changed.length}`);
  for (const p of changed) {
    console.log(`  - ${p.name} <${p.email}> (${p.userId})`);
  }

  if (!allOk) {
    console.error('\nNicht alle User bestehen die Verifikation — bitte Ausgabe prüfen.');
    process.exit(1);
  }

  console.log('\nAlle Ziel-User verifiziert. Optional: node scripts/analyse-mitarbeiter-users.mjs');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
