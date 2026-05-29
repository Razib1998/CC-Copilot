/**
 * Lokal: offene Cockpit-Einladung für Okans Test-Mail widerrufen und neue
 * reine Mitarbeiter-App-Einladung anlegen (nur ccintern + mitarbeiterapp).
 *
 * Speicher: Tabelle `cockpit_invites`, offen = status `offen`
 * (siehe getPendingCockpitInviteByEmail in database.js).
 *
 * Server stoppen (sql.js schreibt cc-cockpit.db).
 *
 *   cd backend && node scripts/reset-okan-mitarbeiter-app-invite-local.mjs
 */
import { randomUUID } from 'node:crypto';
import 'dotenv/config';
import { generateInviteToken } from '../src/auth/invite-token.js';
import { normalizeRightsJson } from '../src/auth/rights-spec.js';
import { openDatabase } from '../src/db/database.js';

const EMAIL = 'ccintern.ma.4a7e6df8-be63-4329-81c8-a03d3e138ce3@cc-cockpit.local'.toLowerCase();
/** Z. B. `CC_INVITE_FRONTEND_ORIGIN=http://localhost:3000` — muss zum laufenden Vite-Port passen. */
const LOCAL_INVITE_BASE = String(process.env.CC_INVITE_FRONTEND_ORIGIN || 'http://localhost:3000')
  .trim()
  .replace(/\/+$/, '');

const store = await openDatabase();

const pending = await store.getPendingCockpitInviteByEmail(EMAIL);
if (pending) {
  console.log('Offene Einladung gefunden:', {
    id: pending.id,
    email: pending.email,
    status: pending.status,
    token: pending.token?.slice(0, 12) + '…',
  });
  const ok = await store.revokeCockpitInvite(pending.id);
  console.log(ok ? 'Widerrufen (status → widerrufen).' : 'Widerrufen fehlgeschlagen.');
} else {
  console.log('Keine offene Einladung (status=offen) für diese E-Mail.');
}

const firmen = await store.listFirmen();
const firmaId =
  Array.isArray(firmen) && firmen[0] && firmen[0].id != null ? String(firmen[0].id).trim() : null;
if (!firmaId) {
  console.error('Keine Firma in DB — firma_id für Einladung erforderlich.');
  process.exit(1);
}

const id = randomUUID();
const token = generateInviteToken();
const expiresAt = new Date();
expiresAt.setFullYear(expiresAt.getFullYear() + 1);

const rights = {
  ccintern: {
    mitarbeiter: normalizeRightsJson({ sehen: true }),
    mitarbeiterapp: normalizeRightsJson({ sehen: true, erstellen: true }),
    urlaub: normalizeRightsJson({ sehen: true, erstellen: true }),
  },
};

await store.insertCockpitInvite({
  id,
  email: EMAIL,
  globalRole: 'INTERN',
  modulesJson: JSON.stringify(['ccintern']),
  areasJson: JSON.stringify([]),
  rightsJson: JSON.stringify(rights),
  firmaId,
  token,
  expiresAtIso: expiresAt.toISOString(),
  createdByUserId: null,
});

const inviteUrl = `${LOCAL_INVITE_BASE.replace(/\/+$/, '')}/?cc_invite=${encodeURIComponent(token)}`;
console.log('Neue Einladung angelegt:', {
  id,
  email: EMAIL,
  global_role: 'INTERN',
  modules: ['ccintern'],
  rights: rights,
  firma_id: firmaId,
  invite_url: inviteUrl,
});
