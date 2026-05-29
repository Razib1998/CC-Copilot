/**
 * Read-only: Simuliert MA_DATA-Merge für Okan (Logik wie ccintern-cockpit-api.js).
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';

const OKAN_USER_ID = 'de3b4d92-4e55-4248-bdc7-eaa381f94e7f';
const OKAN_EMAIL = 'ccintern.ma.4a7e6df8-be63-4329-81c8-a03d3e138ce3@cc-cockpit.local';

function mapApiUsersToMaData(apiUsers) {
  return apiUsers.map((u, idx) => {
    const sid = String(u.id);
    const kuerzel = u.kuerzel != null ? String(u.kuerzel).trim().toUpperCase() : '';
    return {
      id: u.id,
      maId: sid,
      n: u.name || sid,
      k: kuerzel || '',
      email: u.email || '',
    };
  });
}

function merge(items, apiUsers) {
  const base = mapApiUsersToMaData(apiUsers);
  const byId = {};
  base.forEach((m) => {
    if (m?.maId != null) byId[String(m.maId)] = m;
  });
  for (const row of items) {
    const uid = row.user_id != null && String(row.user_id).trim() ? String(row.user_id) : String(row.id);
    const s = {
      id: row.user_id || row.id,
      mitarbeiter_id: row.id,
      maId: uid,
      k: row.position,
      n: row.user_name,
      email: row.user_email,
    };
    const b = byId[String(s.maId)];
    if (!b) {
      base.push(s);
      byId[String(s.maId)] = s;
    } else {
      if (s.mitarbeiter_id) b.mitarbeiter_id = s.mitarbeiter_id;
      if (s.k) b.k = s.k;
    }
  }
  return base.filter((m) => {
    const mid = m.mitarbeiter_id != null ? String(m.mitarbeiter_id).trim() : '';
    if (mid) return true;
    return m.k != null && String(m.k).trim() !== '';
  });
}

const store = await openDatabase();
const usersRes = await store.listUsers();
const apiUsers = usersRes
  .filter((u) => String(u.modules_csv || '').includes('ccintern') || !u.modules_csv)
  .map((u) => ({
    id: u.id,
    email: u.email,
    name: u.name,
    kuerzel: u.kuerzel || '',
  }));

const okan = usersRes.find((u) => String(u.email).toLowerCase() === OKAN_EMAIL);
const fidWrong = okan?.company_id ? String(okan.company_id) : '';
const fidRight = 'b0864024-7a4e-460a-9f1a-e98035ffa58a';

async function run(firmaId, label) {
  const rows = await store.listMitarbeiterByFirma(firmaId, { offset: 0, limit: 200 });
  const maData = merge(rows, apiUsers);
  const okanRow = maData.find((m) => String(m.maId) === OKAN_USER_ID || String(m.id) === OKAN_USER_ID);
  const baseOnly = mapApiUsersToMaData(apiUsers).find((m) => String(m.maId) === OKAN_USER_ID);
  console.log(`\n=== ${label} (firma_id=${firmaId}) ===`);
  console.log({
    stamm_api_rows: rows.length,
    MA_DATA_length: maData.length,
    okan_in_MA_DATA: !!okanRow,
    okan_has_mitarbeiter_id: okanRow?.mitarbeiter_id || null,
    okan_k: okanRow?.k || null,
    okan_id: okanRow?.id || null,
    okan_maId: okanRow?.maId || null,
    okan_user_id_field: okanRow?.user_id || '(nicht gesetzt — nur id/maId)',
    base_before_merge_k: baseOnly?.k || null,
  });
}

await run(fidWrong, 'GET /mitarbeiter?firma_id=users.company_id');
await run(fidRight, 'GET /mitarbeiter?firma_id=mitarbeiter.firma');

console.log('\n=== mobResolve Simulation (MA_DATA lookup) ===');
const maDataWrong = merge(await store.listMitarbeiterByFirma(fidWrong, { limit: 200 }), apiUsers);
const uid = OKAN_USER_ID;
let matched = maDataWrong.find((m) => String(m.id) === uid || String(m.user_id) === uid);
console.log('Match in MA_DATA (wrong firma merge):', matched ? 'YES' : 'NO', matched || null);
