/**
 * Einmalig: Benutzer „Okan Kayaaslan“ auf CC-Intern Mitarbeiter-App only setzen.
 * Nutzt store.replaceUserAccessBundle (gleiche Logik wie PATCH /users/:id/access).
 *
 * Server bitte stoppen (sql.js schreibt cc-cockpit.db).
 *
 *   cd backend && node scripts/set-okan-mitarbeiter-app-only.mjs
 */
import 'dotenv/config';
import { normalizeRightsJson } from '../src/auth/rights-spec.js';
import { openDatabase } from '../src/db/database.js';
import { loadAccessProfile, accessProfileToJson } from '../src/auth/access-profile.js';

function moduleHasAnySehen(bundle, mod) {
  if (!bundle?.rights || typeof bundle.rights !== 'object') return false;
  const block = bundle.rights[mod];
  if (!block || typeof block !== 'object') return false;
  for (const k of Object.keys(block)) {
    const row = block[k];
    if (row && typeof row === 'object' && row.sehen) return true;
  }
  return false;
}

/** Wie `frontend/core/access/cc-my-rights.js` — App-/API-Bereiche ohne CC-Intern-Desktop-Shell */
const CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR = new Set([
  'mitarbeiterapp',
  'urlaub',
  'produktion',
  'auftraege',
  'materiallager',
  'checklisten',
  'kalender',
]);

function deriveShellUiAccess(bundle) {
  if (!bundle || typeof bundle !== 'object') {
    return {
      canSeeMitarbeiterApp: false,
      canSeeCcInternDesktop: false,
      canSeeCockpit: false,
      canSeeFusa: false,
      isMitarbeiterAppOnlyShell: false,
    };
  }
  const isSa = bundle.global_role === 'SUPER_ADMIN';
  const mods = Array.isArray(bundle.modules) ? bundle.modules : [];
  const canSeeCockpit = isSa || (mods.includes('cockpit') && moduleHasAnySehen(bundle, 'cockpit'));
  const canSeeFusa = isSa || (mods.includes('fusa') && moduleHasAnySehen(bundle, 'fusa'));
  const hasCcinternMod = isSa || mods.includes('ccintern');
  const myRight = (b, mod, bereich, flag) => {
    if (!b?.rights?.[mod]?.[bereich]) return false;
    if (isSa) return true;
    return Boolean(b.rights[mod][bereich][flag]);
  };
  const canSeeMitarbeiterApp =
    isSa || (hasCcinternMod && myRight(bundle, 'ccintern', 'mitarbeiterapp', 'sehen'));
  let canSeeCcInternDesktop = false;
  if (isSa) canSeeCcInternDesktop = true;
  else if (hasCcinternMod && bundle.rights?.ccintern && typeof bundle.rights.ccintern === 'object') {
    for (const bereich of Object.keys(bundle.rights.ccintern)) {
      if (CCINTERN_BEREICHE_NICHT_DESKTOP_SICHTBAR.has(bereich)) continue;
      const row = bundle.rights.ccintern[bereich];
      if (row && typeof row === 'object' && row.sehen) {
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
    canSeeMitarbeiterApp,
    canSeeCcInternDesktop,
    canSeeCockpit,
    canSeeFusa,
    isMitarbeiterAppOnlyShell,
  };
}

const store = await openDatabase();

const rows = await store.listUsers();
const candidates = rows.filter((u) => {
  const name = String(u.name || '').toLowerCase();
  const email = String(u.email || '').toLowerCase();
  return (
    name.includes('okan') ||
    name.includes('kayaaslan') ||
    email.includes('okan') ||
    email.includes('kayaaslan') ||
    email.startsWith('ccintern.ma.') ||
    email.includes('ccintern.ma.')
  );
});

if (candidates.length === 0) {
  console.error('Kein Benutzer mit Okan/Kayaaslan in name/email gefunden.');
  process.exit(1);
}

let user = candidates.find(
  (u) => String(u.name || '').toLowerCase().includes('okan') && String(u.name || '').toLowerCase().includes('kayaaslan'),
);
if (!user) user = candidates[0];

const uid = String(user.id).trim();
console.log('Gefunden:', {
  user_id: uid,
  email: user.email,
  name: user.name,
  global_role: user.global_role,
  company_id: user.company_id ?? null,
  modules_csv: user.modules_csv ?? '',
});

const modsBefore = await store.listUserModules(uid);
const rightsBefore = await store.listUserRights(uid);
console.log(
  'Vorher modules:',
  modsBefore.map((r) => r.module),
);
console.log(
  'Vorher ccintern rights:',
  rightsBefore.filter((r) => r.module === 'ccintern').map((r) => ({ bereich: r.bereich, json: r.rechte_json })),
);

if (String(user.global_role || '').trim() === 'SUPER_ADMIN') {
  console.error('ABBRUCH: Benutzer ist SUPER_ADMIN — für App-only zuerst Rolle im Cockpit anpassen.');
  process.exit(1);
}

const gr = String(user.global_role || '').trim() === 'EXTERN' ? 'EXTERN' : 'INTERN';

if ((gr === 'INTERN' || gr === 'EXTERN') && !(user.company_id != null && String(user.company_id).trim())) {
  const firmen = await store.listFirmen();
  const first = Array.isArray(firmen) && firmen[0] && firmen[0].id != null ? String(firmen[0].id).trim() : '';
  if (!first) {
    console.error('ABBRUCH: Keine Firma in DB — company_id für INTERN nicht setzbar.');
    process.exit(1);
  }
  console.warn('Hinweis: company_id war leer — setze auf erste Firma:', first);
  await store.updateUserCompany(uid, first);
}

const mitarbeiterappFlags = normalizeRightsJson({ sehen: true, erstellen: true });
const urlaubFlags = normalizeRightsJson({ sehen: true, erstellen: true });

await store.replaceUserAccessBundle({
  userId: uid,
  globalRole: gr,
  modules: ['ccintern'],
  rights: {
    ccintern: {
      mitarbeiterapp: mitarbeiterappFlags,
      urlaub: urlaubFlags,
    },
  },
});

const profile = await loadAccessProfile(store, uid);
const bundle = accessProfileToJson(profile);
const ui = deriveShellUiAccess({
  global_role: bundle.global_role,
  modules: bundle.modules,
  rights: bundle.rights,
});

console.log('Nachher GET /auth/my-rights (Profil):', JSON.stringify(bundle, null, 2));
console.log('deriveShellUiAccess (UI):', ui);

const ok =
  ui.canSeeMitarbeiterApp === true &&
  ui.canSeeCcInternDesktop === false &&
  ui.canSeeCockpit === false &&
  ui.canSeeFusa === false &&
  ui.isMitarbeiterAppOnlyShell === true;

if (!ok) {
  console.error('Erwartung nicht erfüllt — bitte Ausgabe prüfen.');
  process.exit(1);
}
console.log('OK: App-only-Zustand bestätigt.');
