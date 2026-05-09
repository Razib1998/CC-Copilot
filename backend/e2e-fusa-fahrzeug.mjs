/**
 * End-to-end: POST /fahrzeuge mit vollem details-Payload, dann GET + DB + Filter-Simulation.
 * Voraussetzung: JWT_SECRET gesetzt; optional PORT (default 5399).
 *
 *   cd backend
 *   set JWT_SECRET=... (mind. 32 Zeichen)
 *   npm run seed:test-user
 *   npm run seed:phase5-access
 *   node e2e-fusa-fahrzeug.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = __dirname;
const dbPath = path.join(backendRoot, 'data', 'cc-cockpit.db');

const JWT_SECRET = process.env.JWT_SECRET || '';
const PORT = String(process.env.PORT || '5399');
const BASE = `http://127.0.0.1:${PORT}`;

function toLower(x) {
  return String(x == null ? '' : x).toLowerCase();
}

function normalizeStatus(raw) {
  const s = raw == null ? '' : String(raw).trim().toLowerCase();
  if (s === 'belegt' || s === 'in_nutzung' || s === 'aktiv') return 'belegt';
  if (s === 'endet' || s === 'endet_bald') return 'endet';
  if (s === 'schaden' || s === 'defekt') return 'schaden';
  if (s === 'geplant' || s === 'in_planung') return 'geplant';
  if (s === 'frei' || s === 'verfuegbar' || s === 'verfügbar') return 'frei';
  return s || 'frei';
}

/** Spiegelt mapFahrzeugToViewModel (Filter-relevant) */
function vmFromApiRow(row) {
  const statusNorm = normalizeStatus(row.status);
  const statusGroup =
    statusNorm === 'belegt' || statusNorm === 'endet'
      ? 'belegt'
      : statusNorm === 'schaden'
        ? 'schaden'
        : 'frei';
  const typ = row.typ != null ? String(row.typ) : '';
  const subtyp =
    row.subtyp != null && String(row.subtyp).trim() !== ''
      ? String(row.subtyp)
      : row.modell != null && String(row.modell).trim() !== ''
        ? String(row.modell)
        : '';
  const standort = row.standort != null ? String(row.standort) : '';
  const depot = row.depot != null && String(row.depot).trim() !== '' ? String(row.depot) : standort;
  const betreiber = row.betreiber != null ? String(row.betreiber) : '';
  const typKategorie = row.typ_kategorie != null ? String(row.typ_kategorie) : '';
  const antriebStr = row.antrieb != null ? String(row.antrieb) : '';
  const herstellerStr = row.hersteller != null ? String(row.hersteller) : '';
  const modellStr = row.modell != null ? String(row.modell) : '';
  const wagennummerStr = row.wagennummer != null ? String(row.wagennummer) : '';
  const erstzulassungStr = row.erstzulassung != null ? String(row.erstzulassung) : '';
  const notizStr = row.notiz != null ? String(row.notiz) : '';
  const zustaendigStr = row.zustaendig_cc != null ? String(row.zustaendig_cc) : '';
  const werbeflaechenStr = Array.isArray(row.werbeflaechen)
    ? row.werbeflaechen
        .map((x) => String(x))
        .join(' ')
        .trim()
    : '';
  const typeSearch = toLower(`${typ} ${subtyp} ${typKategorie} ${antriebStr} ${herstellerStr} ${modellStr}`.trim());
  const searchText = toLower(
    `${row.kennung ?? ''} ${typ} ${subtyp} ${depot} ${betreiber} ${row.kennzeichen ?? ''} ${row.linie ?? ''} ${row.linien ?? ''} ${wagennummerStr} ${typKategorie} ${antriebStr} ${herstellerStr} ${modellStr} ${erstzulassungStr} ${notizStr} ${zustaendigStr} ${werbeflaechenStr}`,
  );
  const locationSearch = toLower(depot);
  return { typeSearch, searchText, locationSearch, statusGroup, statusNorm };
}

function filterMatches(vm, { q, typeTokens, locTokens, activeTab }) {
  const tabMatch = activeTab === 'alle' ? true : vm.statusGroup === activeTab;
  const typeMatch = typeTokens.length === 0 ? true : typeTokens.some((t) => vm.typeSearch.includes(t.toLowerCase()));
  const locMatch = locTokens.length === 0 ? true : locTokens.some((t) => vm.locationSearch.includes(t.toLowerCase()));
  const searchMatch = !q || vm.searchText.includes(q);
  return tabMatch && typeMatch && locMatch && searchMatch;
}

async function sleep(ms) {
  await new Promise((r) => setTimeout(r, ms));
}

async function waitHealth() {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${BASE}/health`);
      if (r.ok) return;
    } catch {
      /* ignore */
    }
    await sleep(200);
  }
  throw new Error('Server health timeout');
}

async function main() {
  if (!JWT_SECRET.trim() || JWT_SECRET.trim().length < 32) {
    console.error('JWT_SECRET fehlt oder ist kürzer als 32 Zeichen.');
    process.exit(1);
  }

  const env = { ...process.env, JWT_SECRET, PORT };
  const proc = spawn('node', ['src/server.js'], { cwd: backendRoot, env, stdio: 'ignore' });
  let createdId = null;
  try {
    await waitHealth();

    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@cc-cockpit.local', password: 'TestLocal!2026' }),
    });
    if (!loginRes.ok) {
      const t = await loginRes.text();
      throw new Error(`Login failed ${loginRes.status}: ${t}`);
    }
    const loginJson = await loginRes.json();
    const token = loginJson.access_token;
    if (!token) throw new Error('No access_token');

    const projRes = await fetch(`${BASE}/projects`, { headers: { Authorization: `Bearer ${token}` } });
    if (!projRes.ok) throw new Error(`GET /projects ${projRes.status}`);
    const projJson = await projRes.json();
    const projects = Array.isArray(projJson.projects) ? projJson.projects : [];
    const project = projects[0];
    if (!project?.id) throw new Error('Kein Projekt — seed:phase5-access ausführen.');

    const kennung = 'TEST BUS 4711';
    const body = {
      project_id: project.id,
      kennung,
      typ: 'Mercedes-Benz (Citaro) Citaro Test',
      kennzeichen: 'E-CC 4711',
      status: 'frei',
      details: {
        wagennummer: 'INT-4711',
        typ_kategorie: 'Gelenkbus',
        hersteller: 'Mercedes-Benz (Citaro)',
        modell: 'Citaro Test',
        antrieb: 'Hybrid',
        baujahr: '2022',
        erstzulassung: '2022-05-01',
        ausmusterung_geplant: '2034',
        betreiber: 'Ruhrbahn Essen',
        depot: 'Essen Stadtmitte',
        linien: '102 / 104',
        notiz: 'TEST-NOTIZ-4711',
        zustaendig_cc: 'Elvan (Büro)',
        werbeflaechen: ['Seitenwand links', 'Heckfläche', 'Dachfläche (Traffic Board)'],
        eigenwerbung: true,
      },
    };

    const postRes = await fetch(`${BASE}/fahrzeuge`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const postText = await postRes.text();
    if (!postRes.ok) throw new Error(`POST /fahrzeuge ${postRes.status}: ${postText}`);
    const postJson = JSON.parse(postText);
    const fz = postJson.fahrzeug;
    createdId = fz?.id || null;

    const getRes = await fetch(`${BASE}/fahrzeuge/${encodeURIComponent(createdId)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const getJson = getRes.ok ? await getRes.json() : null;

    const out = {
      requestBodyKeys: Object.keys(body),
      detailsKeysSent: Object.keys(body.details),
      postStatus: postRes.status,
      responseFahrzeug: fz,
      getFahrzeug: getJson?.fahrzeug,
      filterVm: fz ? vmFromApiRow(fz) : null,
    };

    proc.kill('SIGTERM');
    await sleep(800);

    let dbDetails = null;
    if (fs.existsSync(dbPath)) {
      const SQL = await initSqlJs();
      const buf = fs.readFileSync(dbPath);
      const db = new SQL.Database(buf);
      const stmt = db.prepare('SELECT kennung, details_json FROM fahrzeuge WHERE kennung = ? LIMIT 1');
      stmt.bind([kennung]);
      if (stmt.step()) {
        const r = stmt.getAsObject();
        dbDetails = { kennung: r.kennung, details_json: r.details_json };
      }
      stmt.free();
      db.close();
    }

    const fzRow = out.responseFahrzeug;
    const expected = [
      { key: 'kennung', form: true, inTop: true },
      { key: 'kennzeichen', form: true, inTop: true },
      { key: 'typ', form: true, inTop: true },
      { key: 'status', form: true, inTop: true },
      { key: 'wagennummer', form: true, inDetails: true },
      { key: 'typ_kategorie', form: true, inDetails: true },
      { key: 'hersteller', form: true, inDetails: true },
      { key: 'modell', form: true, inDetails: true },
      { key: 'antrieb', form: true, inDetails: true },
      { key: 'baujahr', form: true, inDetails: true },
      { key: 'erstzulassung', form: true, inDetails: true },
      { key: 'ausmusterung_geplant', form: true, inDetails: true },
      { key: 'betreiber', form: true, inDetails: true },
      { key: 'depot', form: true, inDetails: true },
      { key: 'linien', form: true, inDetails: true },
      { key: 'notiz', form: true, inDetails: true },
      { key: 'zustaendig_cc', form: true, inDetails: true },
      { key: 'werbeflaechen', form: true, inDetails: true },
      { key: 'eigenwerbung', form: true, inDetails: true },
    ];

    let detailsParsed = {};
    try {
      if (dbDetails?.details_json) detailsParsed = JSON.parse(String(dbDetails.details_json));
    } catch {
      detailsParsed = {};
    }

    function inResponseKey(fz, key) {
      if (!fz) return false;
      if (key === 'modell') return !!(fz.subtyp && String(fz.subtyp).trim());
      if (!Object.prototype.hasOwnProperty.call(fz, key)) return false;
      const v = fz[key];
      if (v == null) return false;
      if (typeof v === 'boolean') return true;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.trim() !== '';
      return true;
    }
    function inDbDetails(key) {
      if (!Object.prototype.hasOwnProperty.call(detailsParsed, key)) return false;
      const v = detailsParsed[key];
      if (v == null) return false;
      if (typeof v === 'boolean') return true;
      if (Array.isArray(v)) return v.length > 0;
      if (typeof v === 'string') return v.trim() !== '';
      return true;
    }

    const rows = expected.map((e) => {
      const inRequest =
        e.inTop === true
          ? body[e.key] !== undefined
          : e.inDetails === true
            ? body.details[e.key] !== undefined
            : false;
      const inResponse = inResponseKey(fzRow, e.key);
      const inDb =
        e.inTop === true
          ? '—'
          : e.key === 'modell'
            ? inDbDetails('modell')
            : inDbDetails(e.key);
      return { feld: e.key, imRequest: inRequest, inApiResponse: inResponse, inDetailsJson: inDb };
    });

    const vm = fzRow ? vmFromApiRow(fzRow) : null;
    const searchTests = [
      { q: 'test bus 4711', label: 'Kennung' },
      { q: 'e-cc 4711', label: 'Kennzeichen' },
      { q: 'int-4711', label: 'Wagennummer' },
      { q: 'mercedes', label: 'Hersteller' },
      { q: 'citaro test', label: 'Modell' },
      { q: 'hybrid', label: 'Antrieb' },
      { q: 'essen stadtmitte', label: 'Depot' },
      { q: 'test-notiz-4711', label: 'Notiz' },
      { q: 'elvan', label: 'Zuständig CC' },
    ];

    const searchResults = vm
      ? searchTests.map((t) => ({
          test: t.label,
          q: t.q,
          sollTreffer: true,
          findet: vm.searchText.includes(t.q),
        }))
      : [];

    const typeTokens = ['gelenkbus'];
    const locTokens = ['essen stadtmitte'];
    const combo = vm
      ? filterMatches(vm, { q: '', typeTokens, locTokens, activeTab: 'frei' })
      : false;

    console.log(JSON.stringify({ rows, detailsParsedFromDb: detailsParsed, searchResults, filterTypGelenkbus: vm ? filterMatches(vm, { q: '', typeTokens: ['gelenkbus'], locTokens: [], activeTab: 'alle' }) : null, filterLocStadtmitte: vm ? filterMatches(vm, { q: '', typeTokens: [], locTokens: ['essen stadtmitte'], activeTab: 'alle' }) : null, comboFreiTypLoc: combo, vm }, null, 2));
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    try {
      proc.kill('SIGKILL');
    } catch {
      /* ignore */
    }
  }
}

await main();
