/**
 * Lokales Hilfsskript: `test@cc-cockpit.local` bekommt `fusa.auftraege.erstellen` + `bearbeiten`
 * (bestehende Rechte bleiben erhalten).
 *
 *   cd backend && node scripts/grant-fusa-auftraege-smoke-rights.mjs
 */
import 'dotenv/config';
import { normalizeRightsJson } from '../src/auth/rights-spec.js';
import { openDatabase } from '../src/db/database.js';

const EMAIL = (process.env.AUTH_SEED_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();

const store = await openDatabase();
const u = await store.getUserByEmail(EMAIL);
if (!u?.id) {
  console.error(`Kein Benutzer: ${EMAIL}`);
  process.exit(1);
}
const modules = (await store.listUserModules(u.id)).map(r => String(r.module));
const rightRows = await store.listUserRights(u.id);
/** @type {Record<string, Record<string, import('../src/auth/rights-spec.js').RightsFlags>>} */
const rights = {};
for (const r of rightRows) {
  const mod = String(r.module);
  const ber = String(r.bereich);
  if (!rights[mod]) rights[mod] = {};
  rights[mod][ber] = normalizeRightsJson(JSON.parse(String(r.rechte_json || '{}')));
}
if (!rights.fusa) rights.fusa = {};
if (!rights.fusa.auftraege) rights.fusa.auftraege = normalizeRightsJson({});
rights.fusa.auftraege = normalizeRightsJson({
  ...rights.fusa.auftraege,
  sehen: true,
  erstellen: true,
  bearbeiten: true,
});

await store.replaceUserAccessBundle({
  userId: u.id,
  globalRole: u.global_role || 'INTERN',
  modules,
  rights,
});
console.log(`OK: ${EMAIL} — fusa.auftraege sehen/erstellen/bearbeiten gesetzt.`);
