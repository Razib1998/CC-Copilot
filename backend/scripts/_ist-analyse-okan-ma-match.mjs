/**
 * Read-only IST: Okan MA-App Zuordnung (DB + API-Simulation).
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';

const OKAN_EMAIL = 'ccintern.ma.4a7e6df8-be63-4329-81c8-a03d3e138ce3@cc-cockpit.local';
const OKAN_USER_ID = 'de3b4d92-4e55-4248-bdc7-eaa381f94e7f';

const store = await openDatabase();
const users = await store.listUsers();
const firmen = await store.listFirmen();

console.log('=== 1. USERS (Okan) ===');
const okanUsers = users.filter(
  (u) =>
    String(u.email || '').toLowerCase() === OKAN_EMAIL.toLowerCase() ||
    String(u.name || '').toLowerCase().includes('okan'),
);
console.log(JSON.stringify(okanUsers, null, 2));

console.log('\n=== 2. MITARBEITER (alle Firmen) ===');
/** @type {object[]} */
const allMa = [];
for (const f of firmen) {
  const rows = await store.listMitarbeiterByFirma(f.id, { offset: 0, limit: 500 });
  for (const m of rows) {
    const isOkan =
      String(m.position || '').toUpperCase() === 'OK' ||
      String(m.user_name || '').toLowerCase().includes('okan') ||
      String(m.user_email || '').toLowerCase().includes('4a7e6df8') ||
      String(m.user_id) === OKAN_USER_ID;
    if (isOkan) {
      allMa.push({ firma: f.name, firma_id: f.id, ...m });
    }
  }
}
console.log(JSON.stringify(allMa, null, 2));

const okan = okanUsers.find((u) => String(u.email).toLowerCase() === OKAN_EMAIL.toLowerCase());
if (okan) {
  const uid = String(okan.id);
  const cid = okan.company_id != null ? String(okan.company_id).trim() : '';
  console.log('\n=== 3. LINKAGE CHECK ===');
  for (const m of allMa) {
    console.log({
      user_id_match: String(m.user_id) === uid,
      company_id_match: cid === String(m.firma_id),
      users_company_id: cid,
      mitarbeiter_firma_id: m.firma_id,
    });
  }
  console.log('\ngetMitarbeiterByUserAndFirma(company_id):');
  if (cid) {
    const byCompany = await store.getMitarbeiterByUserAndFirma(uid, cid);
    console.log(byCompany ? 'FOUND' : 'NOT FOUND', byCompany);
  }
  for (const m of allMa) {
    const byMaFirma = await store.getMitarbeiterByUserAndFirma(uid, String(m.firma_id));
    console.log(`getMitarbeiterByUserAndFirma(${m.firma_id}):`, byMaFirma ? 'FOUND' : 'NOT FOUND');
  }
}

console.log('\n=== 4. GET /api/v1/mitarbeiter simulation (per firma_id) ===');
for (const f of firmen) {
  const rows = await store.listMitarbeiterByFirma(f.id, { offset: 0, limit: 200 });
  const okanIn = rows.filter((m) => String(m.user_id) === OKAN_USER_ID);
  if (okanIn.length || rows.length) {
    console.log(`firma_id=${f.id} (${f.name}): total=${rows.length} okan_rows=${okanIn.length}`);
    if (okanIn.length) console.log(JSON.stringify(okanIn, null, 2));
  }
}

if (okan && okan.company_id) {
  const fid = String(okan.company_id);
  const apiRows = await store.listMitarbeiterByFirma(fid, { offset: 0, limit: 200 });
  const okanInApiFirma = apiRows.filter((m) => String(m.user_id) === OKAN_USER_ID);
  console.log(`\nAPI würde mit users.company_id=${fid} laden: ${apiRows.length} Zeilen, Okan darin: ${okanInApiFirma.length}`);
}
