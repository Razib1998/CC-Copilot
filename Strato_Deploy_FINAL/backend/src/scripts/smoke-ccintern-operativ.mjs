/**
 * Smoke: CC Intern Mitarbeiter-Status, Anwesenheit, Urlaub (gegen laufendes Backend).
 * Nutzung: node src/scripts/smoke-ccintern-operativ.mjs
 * Env: BASE_URL (default http://localhost:5371), LOGIN_EMAIL, LOGIN_PASSWORD
 */
const BASE = (process.env.BASE_URL || 'http://localhost:5371').replace(/\/$/, '');

async function httpJson(method, path, { token = '', jsonBody = null, projectId = null } = {}) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (projectId) headers['x-project-id'] = String(projectId).trim();
  if (jsonBody != null) headers['Content-Type'] = 'application/json; charset=utf-8';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: jsonBody != null ? JSON.stringify(jsonBody) : undefined,
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text?.slice(0, 400) };
  }
  return { res, body };
}

function unwrap(body) {
  if (body && typeof body === 'object' && body.success === true) return body.data;
  return body;
}

const email = process.env.LOGIN_EMAIL || 'test@cc-cockpit.local';
const password = process.env.LOGIN_PASSWORD || 'test1234';

const { res: lr, body: loginBody } = await httpJson('POST', '/auth/login', {
  jsonBody: { email, password },
});
if (!lr.ok) {
  console.error('Login fehlgeschlagen', lr.status, loginBody);
  process.exit(1);
}
const token = loginBody?.access_token;
if (!token) {
  console.error('Kein access_token', loginBody);
  process.exit(1);
}

const { res: ur, body: usersBody } = await httpJson('GET', '/api/v1/users', { token });
if (!ur.ok) {
  console.error('GET /users fehlgeschlagen', ur.status, usersBody);
  process.exit(1);
}
const ud = unwrap(usersBody);
const users = Array.isArray(ud?.users) ? ud.users : [];
const ilayda = users.find((u) => /ilayda/i.test(String(u.name || '')));
const target = ilayda || users.find((u) => u.global_role !== 'SUPER_ADMIN') || users[0];
if (!target?.id) {
  console.error('Kein Ziel-Benutzer in /users');
  process.exit(1);
}
console.log('Ziel-Benutzer:', target.name || target.email, target.id);

const { res: pr, body: projBody } = await httpJson('GET', '/api/v1/projects', { token });
const projData = unwrap(projBody);
const projects = Array.isArray(projData?.projects) ? projData.projects : [];
const projectId = projects[0]?.id || process.env.SMOKE_PROJECT_ID || '';
if (!projectId) {
  console.warn('Kein Projekt aus GET /projects — Aufrufe ohne x-project-id (kann 400 liefern).');
}
console.log('x-project-id:', projectId || '(keines)');

const today = new Date().toISOString().slice(0, 10);

// 1) Quick-Status Urlaub
let r = await httpJson('POST', '/api/v1/ccintern/mitarbeiter/status', {
  token,
  projectId,
  jsonBody: { user_id: target.id, status: 'urlaub', datum: today },
});
if (!r.res.ok) {
  console.error('POST status', r.res.status, r.body);
  process.exit(1);
}
console.log('POST status ok:', unwrap(r.body)?.status?.status);

r = await httpJson(
  'GET',
  `/api/v1/ccintern/mitarbeiter/status?datum_von=${encodeURIComponent(today)}&datum_bis=${encodeURIComponent(today)}`,
  { token, projectId },
);
if (!r.res.ok) {
  console.error('GET status', r.res.status, r.body);
  process.exit(1);
}
const stRows = unwrap(r.body)?.status || [];
const mine = stRows.filter((s) => String(s.user_id) === String(target.id) && s.datum === today);
console.log('GET status Einträge heute für Ziel:', mine.length, mine.map((x) => x.status).join(','));

// 2) Anwesenheit
r = await httpJson('POST', '/api/v1/ccintern/mitarbeiter/anwesenheit', {
  token,
  projectId,
  jsonBody: {
    user_id: target.id,
    datum: today,
    start: '08:00',
    ende: '08:45',
    pause_minuten: 0,
    dauer_minuten: 45,
    typ: 'anwesenheit',
  },
});
if (!r.res.ok) {
  console.error('POST anwesenheit', r.res.status, r.body);
  process.exit(1);
}
const anwId = unwrap(r.body)?.anwesenheit?.id;
console.log('POST anwesenheit ok, id:', anwId);

r = await httpJson(
  'GET',
  `/api/v1/ccintern/mitarbeiter/anwesenheit?user_id=${encodeURIComponent(target.id)}&datum_von=${encodeURIComponent(today)}&datum_bis=${encodeURIComponent(today)}`,
  { token, projectId },
);
if (!r.res.ok) {
  console.error('GET anwesenheit', r.res.status, r.body);
  process.exit(1);
}
const anw = unwrap(r.body)?.anwesenheit || [];
console.log('GET anwesenheit heute (Anzahl):', anw.length);

// 3) Urlaub Antrag + Genehmigen + neuer Antrag + Ablehnen
const von = today;
const bis = today;
r = await httpJson('POST', '/api/v1/urlaub', {
  token,
  projectId,
  jsonBody: {
    mitarbeiter_id: target.id,
    von,
    bis,
    typ: 'krank',
    status: 'offen',
    bemerkung: 'Smoke-Test Krank',
  },
});
if (!r.res.ok) {
  console.error('POST urlaub', r.res.status, r.body);
  process.exit(1);
}
const urlId = unwrap(r.body)?.urlaub?.id;
console.log('POST urlaub (offen) id:', urlId);

if (urlId) {
  r = await httpJson('PUT', `/api/v1/urlaub/${encodeURIComponent(urlId)}`, {
    token,
    projectId,
    jsonBody: {
      mitarbeiter_id: target.id,
      von,
      bis,
      typ: 'krank',
      status: 'genehmigt',
      bemerkung: 'Smoke-Test Krank — genehmigt',
    },
  });
  if (!r.res.ok) {
    console.error('PUT urlaub genehmigt', r.res.status, r.body);
    process.exit(1);
  }
  console.log('PUT urlaub genehmigt ok');
}

const d2 = new Date();
d2.setDate(d2.getDate() + 2);
const bis2 = d2.toISOString().slice(0, 10);
r = await httpJson('POST', '/api/v1/urlaub', {
  token,
  projectId,
  jsonBody: {
    mitarbeiter_id: target.id,
    von: today,
    bis: bis2,
    typ: 'urlaub',
    status: 'offen',
    bemerkung: 'Smoke-Test Urlaub',
  },
});
if (!r.res.ok) {
  console.error('POST urlaub2', r.res.status, r.body);
  process.exit(1);
}
const urlId2 = unwrap(r.body)?.urlaub?.id;
console.log('POST urlaub2 (offen) id:', urlId2);

if (urlId2) {
  r = await httpJson('PUT', `/api/v1/urlaub/${encodeURIComponent(urlId2)}`, {
    token,
    projectId,
    jsonBody: {
      mitarbeiter_id: target.id,
      von: today,
      bis: bis2,
      typ: 'urlaub',
      status: 'abgelehnt',
      bemerkung: 'Smoke-Test Urlaub — abgelehnt',
    },
  });
  if (!r.res.ok) {
    console.error('PUT urlaub abgelehnt', r.res.status, r.body);
    process.exit(1);
  }
  console.log('PUT urlaub abgelehnt ok');
}

console.log('\nSmoke OK (API). Browser: gleiche Backend-URL, CC Intern, manuell Ilayda prüfen wenn gewünscht).');
