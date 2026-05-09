/**
 * Gemeinsame Auflösung der Ziel-`firma_id` für Lager-Seed und Realign-Skripte.
 *
 * Reihenfolge:
 * 1. `SEED_LAGER_FIRMA_ID` (UUID), wenn in `firmen` vorhanden
 * 2. `users.company_id` des Nutzers mit E-Mail `AUTH_SEED_EMAIL` (Default: `test@cc-cockpit.local`)
 * 3. Erster Nutzer aus `listUsers()` mit gesetztem `company_id`
 * 4. Firma „CC Werbung“ (case-insensitive), sonst erste Firma
 *
 * @param {Awaited<ReturnType<import('../../src/db/database.js').openDatabase>>} store
 * @returns {Promise<string>}
 */
export async function resolveFirmaIdForLagerSeed(store) {
  const env = String(process.env.SEED_LAGER_FIRMA_ID || '').trim();
  if (env) {
    const f = await store.getFirmaById(env);
    if (f && f.id) return String(f.id).trim();
    console.error('[lager-seed] SEED_LAGER_FIRMA_ID gesetzt, aber Firma nicht gefunden:', env);
    process.exit(1);
  }

  const users = await store.listUsers();
  const seedEmail = String(process.env.AUTH_SEED_EMAIL || 'test@cc-cockpit.local').trim().toLowerCase();
  const authSeedUser = users.find((u) => String(u.email || '').trim().toLowerCase() === seedEmail);
  if (authSeedUser && authSeedUser.company_id != null && String(authSeedUser.company_id).trim() !== '') {
    return String(authSeedUser.company_id).trim();
  }

  const firstWithCompany = users.find(
    (u) => u && u.company_id != null && String(u.company_id).trim() !== '',
  );
  if (firstWithCompany && firstWithCompany.company_id) {
    return String(firstWithCompany.company_id).trim();
  }

  const firmen = await store.listFirmen();
  if (!firmen || firmen.length === 0) {
    console.error('[lager-seed] Keine Firma in `firmen` — zuerst Stammdaten anlegen.');
    process.exit(1);
  }
  const exact = firmen.find((x) => String(x.name || '').trim().toLowerCase() === 'cc werbung');
  const pick = exact || firmen[0];
  return String(pick.id).trim();
}
