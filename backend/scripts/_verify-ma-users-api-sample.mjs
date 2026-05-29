/**
 * API-Stichprobe für ccintern.ma.* User (read-only).
 */
import 'dotenv/config';
import { openDatabase } from '../src/db/database.js';
import { signAccessToken } from '../src/auth/jwt.js';

const API = (process.env.E2E_API_BASE || 'http://127.0.0.1:5371').replace(/\/$/, '');

const SAMPLES = [
  'ccintern.ma.4a7e6df8-be63-4329-81c8-a03d3e138ce3@cc-cockpit.local',
  'ccintern.ma.a8ec2c07-e81c-45cc-949f-ecc09dba9bb2@cc-cockpit.local',
  'ccintern.ma.f7400527-efd6-45cd-af24-fe4523d15fa1@cc-cockpit.local',
];

async function checkUser(store, email) {
  const u = await store.getUserByEmail(email);
  if (!u) return { email, error: 'user not found' };
  const token = signAccessToken({ sub: u.id, email, global_role: 'INTERN' });
  const h = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  const me = await fetch(`${API}/auth/me`, { headers: h }).then((r) => r.json());
  const cid = me?.user?.company_id != null ? String(me.user.company_id) : '';
  const pr = await fetch(`${API}/api/v1/projects`, { headers: h }).then((r) => r.json());
  const pid = pr?.data?.projects?.[0]?.id != null ? String(pr.data.projects[0].id) : '';
  const rights = await fetch(`${API}/api/v1/auth/my-rights`, {
    headers: { ...h, 'x-project-id': pid },
  }).then((r) => ({ status: r.status, body: r.json() }));
  const rightsRes = await rights.body;
  const mods = rightsRes?.data?.modules || rightsRes?.modules || [];
  const ci = rightsRes?.data?.rights?.ccintern || rightsRes?.rights?.ccintern || {};
  const maRes = await fetch(`${API}/api/v1/mitarbeiter?firma_id=${encodeURIComponent(cid)}`, {
    headers: { ...h, 'x-project-id': pid },
  });
  const maBody = await maRes.json().catch(() => ({}));
  const rows = maBody?.data?.items || [];
  const self = rows.find((m) => String(m.user_id) === String(u.id));
  return {
    email,
    name: u.name,
    me_company_id: cid,
    my_rights_status: rights.status,
    modules: mods,
    mitarbeiter_sehen: !!ci.mitarbeiter?.sehen,
    mitarbeiterapp_sehen: !!ci.mitarbeiterapp?.sehen,
    cockpit_in_rights: !!rightsRes?.data?.rights?.cockpit || !!rightsRes?.rights?.cockpit,
    fusa_in_rights: !!rightsRes?.data?.rights?.fusa || !!rightsRes?.rights?.fusa,
    mitarbeiter_api_status: maRes.status,
    mitarbeiter_count: rows.length,
    self_in_list: !!self,
    self_position: self?.position || null,
    ok:
      mods.length === 1 &&
      mods[0] === 'ccintern' &&
      !!ci.mitarbeiter?.sehen &&
      maRes.status === 200 &&
      !!self,
  };
}

const store = await openDatabase();
const results = [];
for (const em of SAMPLES) {
  results.push(await checkUser(store, em));
}
console.log(JSON.stringify(results, null, 2));
const allOk = results.every((r) => r.ok);
process.exit(allOk ? 0 : 1);
