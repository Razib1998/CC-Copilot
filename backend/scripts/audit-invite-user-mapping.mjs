/**
 * Prüft Invite ↔ User ↔ Mitarbeiter-Zuordnung (Melanie/Celal o. ä.).
 *
 *   cd backend && node scripts/audit-invite-user-mapping.mjs
 *   cd backend && node scripts/audit-invite-user-mapping.mjs "Melanie" "Cetinkaya"
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';

const needles = process.argv.slice(2).filter(Boolean);
const defaultNeedles = ['melanie', 'neuert', 'celal', 'cetinkaya'];
const search = (needles.length ? needles : defaultNeedles).map((s) => String(s).trim().toLowerCase());

function matchesNeedle(s) {
  const t = String(s || '').toLowerCase();
  return search.some((n) => n && t.includes(n));
}

function rowHits(row) {
  const fields = [row.email, row.name, row.user_name, row.user_email, row.position, row.id, row.user_id];
  return fields.some((f) => matchesNeedle(f));
}

const store = await openDatabase();

const users = (await store.listUsers?.()) || [];
const invites = (await store.listCockpitInvites?.()) || [];

/** @type {object[]} */
let mitarbeiterRows = [];
if (typeof store.listFirmen === 'function') {
  const firmen = await store.listFirmen();
  for (const f of firmen || []) {
    const fid = f?.id != null ? String(f.id).trim() : '';
    if (!fid) continue;
    const total = (await store.countMitarbeiterByFirma?.(fid)) || 0;
    const limit = Math.min(total || 500, 500);
    if (typeof store.listMitarbeiterByFirma === 'function') {
      const chunk = await store.listMitarbeiterByFirma(fid, { offset: 0, limit });
      mitarbeiterRows = mitarbeiterRows.concat(chunk || []);
    }
  }
}

const hitUsers = users.filter(rowHits);
const hitInvites = invites.filter(rowHits);
const hitMa = mitarbeiterRows.filter(rowHits);

console.log('\n=== users (Treffer) ===');
for (const u of hitUsers) {
  console.log({
    id: u.id,
    email: u.email,
    name: u.name,
    global_role: u.global_role,
    company_id: u.company_id,
    status: u.status,
    kuerzel: u.kuerzel ?? u.position,
  });
}

console.log('\n=== cockpit_invites (Treffer) ===');
for (const i of hitInvites) {
  const linked = users.find((u) => String(u.email || '').toLowerCase() === String(i.email || '').toLowerCase());
  console.log({
    id: i.id,
    email: i.email,
    global_role: i.global_role,
    status: i.status,
    firma_id: i.firma_id,
    created_by_user_id: i.created_by_user_id,
    created_at: i.created_at,
    redeemed_at: i.redeemed_at ?? null,
    token_prefix: i.token ? String(i.token).slice(0, 8) + '…' : null,
    resolved_user_id: linked?.id ?? null,
    resolved_user_name: linked?.name ?? null,
    email_user_mismatch: linked && String(linked.name || '').toLowerCase().includes('celal')
      && String(i.email || '').toLowerCase().includes('melanie'),
  });
}

console.log('\n=== mitarbeiter (Treffer) ===');
for (const m of hitMa) {
  const u = users.find((x) => String(x.id) === String(m.user_id));
  console.log({
    id: m.id,
    user_id: m.user_id,
    firma_id: m.firma_id,
    position: m.position,
    user_email: m.user_email ?? u?.email,
    user_name: m.user_name ?? u?.name,
    user_id_points_to_celal: u && matchesNeedle('celal') && matchesNeedle('melanie') === false,
  });
}

console.log('\n=== Konsistenz-Checks ===');
for (const m of hitMa) {
  const u = users.find((x) => String(x.id) === String(m.user_id));
  if (!u) {
    console.warn('[WARN] mitarbeiter ohne users-Zeile', { mitarbeiter_id: m.id, user_id: m.user_id });
    continue;
  }
  const openInv = invites.filter(
    (i) =>
      String(i.status) === 'offen' &&
      String(i.email || '').toLowerCase() === String(u.email || '').toLowerCase(),
  );
  if (openInv.length === 0) {
    console.log('[INFO] Keine offene Invite für', { ma: m.user_name, email: u.email });
  } else {
    for (const inv of openInv) {
      console.log('[OK] Offene Invite passt zu user.email', {
        invite_id: inv.id,
        email: inv.email,
        user_id: u.id,
        user_name: u.name,
      });
    }
  }
}

const suspicious = hitInvites.filter((i) => {
  const linked = users.find((u) => String(u.email || '').toLowerCase() === String(i.email || '').toLowerCase());
  if (!linked) return false;
  const invLooksMelanie = matchesNeedle(i.email) || search.some((n) => String(i.email || '').includes(n));
  const userIsCelal =
    String(linked.name || '').toLowerCase().includes('celal') ||
    String(linked.name || '').toLowerCase().includes('cetinkaya');
  const userIsMelanie =
    String(linked.name || '').toLowerCase().includes('melanie') ||
    String(linked.name || '').toLowerCase().includes('neuert');
  return userIsCelal && !userIsMelanie;
});

if (suspicious.length) {
  console.warn('\n[PROBLEM] Invite-E-Mail führt zu User Celal (nicht Melanie):');
  console.warn(suspicious);
} else {
  console.log('\nKeine offensichtliche Invite-E-Mail → Celal-Zuordnung in den Treffern.');
}

console.log('\nFertig. Suche:', search.join(', '));
