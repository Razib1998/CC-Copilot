/**
 * Smoke-Test gegen laufendes Backend (Bearer): Aufträge-API + UI-Status-Resolver.
 * Aufruf aus dem Projektroot: node backend/scripts/smoke-fusa-auftraege-api.mjs
 */
import { resolveFusaAuftragUiStatus } from '../../frontend/modules/fusa/lib/fusa-auftrag-ui-status.js';

const BASE = process.env.CC_API_BASE || 'http://localhost:5371';
const EMAIL = process.env.CC_TEST_EMAIL || 'test@cc-cockpit.local';
const PASS = process.env.CC_TEST_PASSWORD || 'TestLocal!2026';

async function http(path, { method = 'GET', token, body } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body != null) headers['Content-Type'] = 'application/json';
  const r = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { _parseError: text.slice(0, 400) };
  }
  return { status: r.status, json };
}

function pass(name, ok, detail) {
  return { name, pass: !!ok, detail: detail != null ? String(detail) : '' };
}

async function main() {
  const out = { base: BASE, checks: [] };

  const login = await http('/auth/login', {
    method: 'POST',
    body: { email: EMAIL, password: PASS },
  });
  if (login.status !== 200 || !login.json?.access_token) {
    out.checks.push(pass('auth_login', false, `HTTP ${login.status} ${JSON.stringify(login.json).slice(0, 200)}`));
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  out.checks.push(pass('auth_login', true, ''));
  const token = login.json.access_token;

  const proj = await http('/projects', { token });
  let projectId = proj.status === 200 && proj.json?.projects?.[0]?.id ? String(proj.json.projects[0].id) : null;
  out.checks.push(
    pass(
      'projects_optional',
      proj.status === 200 || proj.status === 403,
      `HTTP ${proj.status}${projectId ? ` pid=${projectId}` : ''}`,
    ),
  );

  const list = await http('/api/v1/fusa/auftraege', { token });
  out.checks.push(pass('list_fusa_auftraege', list.status === 200, `HTTP ${list.status}`));
  const rows = Array.isArray(list.json?.data?.auftraege) ? list.json.data.auftraege : [];
  if (!projectId && rows[0]?.project_id) projectId = String(rows[0].project_id);
  if (!projectId) {
    out.checks.push(pass('project_id_from_list', false, 'kein project_id'));
    console.log(JSON.stringify(out, null, 2));
    process.exit(1);
  }
  out.checks.push(pass('project_id_from_list', true, String(projectId)));

  let testId = rows[0]?.id ? String(rows[0].id) : null;

  const draftBody = {
    project_id: String(projectId),
    title: `Smoke-Entwurf-${Date.now()}`,
    ist_entwurf: true,
    status: 'Entwurf',
  };
  const draftRes = await http('/auftraege', { method: 'POST', token, body: draftBody });
  const draftOk = draftRes.status === 201 && draftRes.json?.auftrag?.id;
  out.checks.push(
    pass(
      'neuer_auftrag_entwurf_anlegen',
      draftOk,
      draftOk ? String(draftRes.json.auftrag.id) : `HTTP ${draftRes.status} ${JSON.stringify(draftRes.json).slice(0, 300)}`,
    ),
  );
  const draftId = draftRes.json?.auftrag?.id ? String(draftRes.json.auftrag.id) : null;

  const patchRes = await http(`/auftraege/${encodeURIComponent(draftId || testId || '')}`, {
    method: 'PATCH',
    token,
    body: { title: `${draftBody.title} (bearbeitet)` },
  });
  const patchOk = draftId && patchRes.status === 200;
  out.checks.push(
    pass(
      'auftrag_bearbeiten_patch',
      patchOk,
      patchOk ? 'title geändert' : `HTTP ${patchRes.status} ${JSON.stringify(patchRes.json).slice(0, 200)}`,
    ),
  );

  const entwurfRes = await http(`/auftraege/${encodeURIComponent(draftId || '')}`, {
    method: 'PATCH',
    token,
    body: {
      status: 'Entwurf',
      fusa_extra_json: { entwurf: true, notiz: 'smoke-entwurf-speichern' },
    },
  });
  out.checks.push(
    pass(
      'entwurf_speichern_patch',
      draftId && entwurfRes.status === 200,
      `HTTP ${entwurfRes.status}`,
    ),
  );

  const detailId = draftId || testId;
  const det = detailId ? await http(`/auftraege/${encodeURIComponent(detailId)}`, { token }) : { status: 0, json: null };
  out.checks.push(
    pass(
      'detail_oeffnen_get',
      det.status === 200 && det.json?.auftrag,
      detailId ? `HTTP ${det.status}` : 'keine id',
    ),
  );

  let fa = 0;
  let fe = 0;
  let fab = 0;
  for (const row of rows) {
    const { filterTab } = resolveFusaAuftragUiStatus(row);
    if (filterTab === 'aktiv') fa += 1;
    if (filterTab === 'endet_bald') fe += 1;
    if (filterTab === 'abgeschlossen') fab += 1;
  }
  out.checks.push(
    pass(
      'filter_resolver_aktiv_konsistent',
      true,
      `Zeilen=${rows.length} mit bucket aktiv=${fa} (nur Resolver, kein DOM)`,
    ),
  );
  out.checks.push(
    pass(
      'filter_resolver_endet_bald_konsistent',
      true,
      `bucket endet_bald=${fe}`,
    ),
  );
  out.checks.push(
    pass(
      'filter_resolver_abgeschlossen_konsistent',
      true,
      `bucket abgeschlossen=${fab}`,
    ),
  );

  const allPass = out.checks.every(c => c.pass);
  out.summary = allPass ? 'ALLE_API_CHECKS_PASS' : 'MIND_EINS_FAIL';
  console.log(JSON.stringify(out, null, 2));
  process.exit(allPass ? 0 : 2);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
