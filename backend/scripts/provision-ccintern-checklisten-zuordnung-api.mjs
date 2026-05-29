/**
 * P2: CL_ZUORDNUNG.produktSchritt (auftraege-detail-view.js) → API-Tabelle ccintern_checklisten_zuordnung.
 *
 * - Legacy-IDs cl-001 … cl-006 werden wie im Frontend über Titelliste auf echte Checklisten-UUIDs gemappt
 *   (gleiche Reihenfolge wie CL_LEGACY_VORLAGE_ID_TO_TITEL + provision-ccwerbung-checklisten-api.mjs).
 * - Upsert: Kombination firma_id + produkt_id + schritt + checkliste_id — vorhandene Zeile per PATCH
 *   (sortierung, aktiv), sonst POST.
 * - Nur produktSchritt: die API verlangt schritt; CL_ZUORDNUNG.produkt (Auftrag-gesamt) bleibt bis Frontend-Umbau dort.
 *
 *   set CC_BEARER_TOKEN=eyJ...
 *   node scripts/provision-ccintern-checklisten-zuordnung-api.mjs
 *
 * Oder: node scripts/sync-cc-local-bearer.mjs (schreibt backend/.cc-local-bearer), danach:
 *
 *   node scripts/provision-ccintern-checklisten-zuordnung-api.mjs
 *
 * Oder CC_DEV_PROVISION_KEY (lokal) — gleicher Key in backend/.env und Shell.
 *
 * Optional: CC_API_BASE (Default http://127.0.0.1:5371), CC_PROJECT_ID, CC_DRY_RUN=1
 */
import process from 'node:process';
import { isApiV1ProjectContextOptionalPath } from '../src/middleware/api-v1-project-context.js';
import {
  buildProvisionAuthHeaders,
  loadBackendDotenv,
  resolveBackendRoot,
  resolveProvisionRequestAuth,
} from './lib/cc-provision-bearer.mjs';

loadBackendDotenv(resolveBackendRoot(import.meta.url));

const BASE = (process.env.CC_API_BASE || 'http://127.0.0.1:5371').replace(/\/$/, '');

/** Wie frontend/modules/ccintern/views/auftraege-detail-view.js — CL_LEGACY_VORLAGE_ID_TO_TITEL */
const CL_LEGACY_VORLAGE_ID_TO_TITEL = {
  'cl-001': ['Druckdatenprüfung'],
  'cl-002': ['Messewand / MesseFlow', 'Fahrzeugbeklebung'],
  'cl-003': ['Montage allgemein'],
  'cl-004': ['Fahrzeugbeklebung', 'Schilder / Dibond'],
  'cl-005': ['Schilder / Dibond'],
  'cl-006': ['Fensterfolie / Glasdekor', 'Montage allgemein'],
};

/**
 * CL_ZUORDNUNG.produktSchritt — Stand wie in auftraege-detail-view.js (nur dieser Block).
 * @type {Record<string, Record<string, string[]>>}
 */
const CL_ZUORDNUNG_PRODUKT_SCHRITT = {
  bus_voll: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006', 'cl-003'], doku: ['cl-003'] },
  bus_teil: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  bus_heck: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  bus_ssp: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  bus_traffic_board: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  bahn_voll: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006', 'cl-003'], doku: ['cl-003'] },
  bahn_teil: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  bahn_innen: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  pkw_voll: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006', 'cl-003'], doku: ['cl-003'] },
  pkw_teil: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  pkw_beschr: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  van_voll: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-006', 'cl-003'], doku: ['cl-003'] },
  van_teil: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  van_beschr: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  dibond_schild: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  forex_schild: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  acryl_schild: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  leuchtreklame: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  einzelbuchstaben: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  werbeanlage_aussen: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  banner_pvc: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'] },
  plakat: { grafik: ['cl-005'], druck: ['cl-004'] },
  rollup: { grafik: ['cl-005'], druck: ['cl-004'] },
  bauzaun: { grafik: ['cl-005'], druck: ['cl-004'] },
  grossformat: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'] },
  fenster_bekl: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-006'], doku: ['cl-003'] },
  milchglas: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  sonnenschutz: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  aufkleber_digi: { grafik: ['cl-005'], druck: ['cl-004'] },
  aufkleber_plot: { grafik: ['cl-005'], druck: ['cl-004'] },
  etiketten: { grafik: ['cl-005'], druck: ['cl-004'] },
  messestand: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  messewand: { grafik: ['cl-005'], druck: ['cl-004'], laminat: ['cl-004'], montage: ['cl-003'], doku: ['cl-003'] },
  pos_display: { grafik: ['cl-005'], druck: ['cl-004'], montage: ['cl-003'] },
  promotion: { grafik: ['cl-005'], druck: ['cl-004'] },
  freie_leistung: {},
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {unknown} s
 */
function normTitel(s) {
  return String(s == null ? '' : s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/');
}

/**
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {{ bearerToken?: string|null, devProvisionKey?: string|null }} auth
 * @param {string} projectId
 * @param {object|null} body
 */
async function apiJson(method, pathWithQuery, auth, projectId, body) {
  const url = pathWithQuery.startsWith('http')
    ? pathWithQuery
    : `${BASE}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json', ...buildProvisionAuthHeaders(auth) };
  const pathOnly = url.replace(BASE, '').split('?')[0] || pathWithQuery.split('?')[0];
  const apiPath = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  const needsProject =
    apiPath.startsWith('/api/v1') &&
    !isApiV1ProjectContextOptionalPath(apiPath) &&
    !apiPath.startsWith('/api/v1/auth/');
  if (needsProject && projectId) {
    headers['x-project-id'] = projectId;
  }
  if (body != null) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  /** @type {unknown} */
  let data = null;
  if (text.trim()) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { _raw: text.slice(0, 500) };
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && data !== null && 'error' in data
        ? JSON.stringify(data)
        : text || res.statusText;
    throw new Error(`HTTP ${res.status}: ${msg}`);
  }
  if (data && typeof data === 'object' && 'success' in data && /** @type {{ success?: unknown }} */ (data).success === true) {
    return /** @type {{ data?: unknown }} */ (data).data;
  }
  return data;
}

/**
 * @param {string} legacyId
 * @param {Map<string, string>} titelNormToChecklisteId
 * @returns {{ uuid: string; titelUsed: string } | null}
 */
function resolveLegacyToUuid(legacyId, titelNormToChecklisteId) {
  const lid = String(legacyId || '').trim();
  const titelList = CL_LEGACY_VORLAGE_ID_TO_TITEL[lid];
  const kandidaten = Array.isArray(titelList) ? titelList : titelList ? [titelList] : [];
  for (const t of kandidaten) {
    const want = normTitel(t);
    if (!want) continue;
    const uuid = titelNormToChecklisteId.get(want);
    if (uuid) return { uuid, titelUsed: String(t).trim() };
  }
  return null;
}

/**
 * @param {unknown[]} items from GET /checklisten
 * @returns {Map<string, string>}
 */
function buildTitelMap(items) {
  /** @type {Map<string, string>} */
  const m = new Map();
  for (const row of items) {
    if (!row || typeof row !== 'object') continue;
    const id = 'id' in row && row.id != null ? String(row.id).trim() : '';
    const titel = 'titel' in row && row.titel != null ? String(row.titel).trim() : '';
    if (!id || !UUID_RE.test(id) || !titel) continue;
    const key = normTitel(titel);
    if (!m.has(key)) m.set(key, id);
  }
  return m;
}

/**
 * @returns {Generator<{ produkt_id: string; schritt: string; legacyId: string; sortierung: number }>}
 */
function* iterDesiredRows() {
  for (const [produkt_id, stepMap] of Object.entries(CL_ZUORDNUNG_PRODUKT_SCHRITT)) {
    if (!stepMap || typeof stepMap !== 'object') continue;
    for (const [schritt, legacyArr] of Object.entries(stepMap)) {
      if (!Array.isArray(legacyArr)) continue;
      let sortierung = 0;
      for (const legacyId of legacyArr) {
        const lid = String(legacyId || '').trim();
        if (!lid) continue;
        yield { produkt_id, schritt, legacyId: lid, sortierung };
        sortierung += 1;
      }
    }
  }
}

async function main() {
  const dry = String(process.env.CC_DRY_RUN || '').trim() === '1';

  const auth = await resolveProvisionRequestAuth(import.meta.url);
  if (auth.bearerToken) {
    console.log('Authentifizierung: Bearer (Token / Datei / CDP).');
  } else if (auth.devProvisionKey) {
    console.log('Authentifizierung: CC_DEV_PROVISION_KEY (nur lokal, Header x-dev-provision-key).');
  }

  const me = await apiJson('GET', '/auth/me', auth, '', null);
  const user = me && typeof me === 'object' && 'user' in me ? /** @type {{ user?: { company_id?: string } }} */ (me).user : null;
  const firmaId = user?.company_id != null ? String(user.company_id).trim() : '';
  if (!firmaId) {
    console.error('Kein company_id am Benutzer.');
    process.exit(1);
  }
  console.log('firma_id:', firmaId);

  let projectId = (process.env.CC_PROJECT_ID || '').trim();
  if (!projectId) {
    const pdata = await apiJson('GET', '/api/v1/projects', auth, '', null);
    const projects =
      pdata && typeof pdata === 'object' && pdata !== null && 'projects' in pdata
        ? /** @type {{ projects?: unknown }} */ (pdata).projects
        : null;
    const list = Array.isArray(projects) ? projects : [];
    if (!list.length) {
      console.error('Keine Projekte — CC_PROJECT_ID setzen.');
      process.exit(1);
    }
    const first = list[0];
    projectId = first && typeof first === 'object' && first !== null && 'id' in first ? String(first.id).trim() : '';
    if (!projectId) {
      console.error('Projektliste ohne id.');
      process.exit(1);
    }
  }
  console.log('x-project-id:', projectId);

  const existingData = await apiJson(
    'GET',
    `/api/v1/checklisten?page=1&limit=500&firma_id=${encodeURIComponent(firmaId)}`,
    auth,
    projectId,
    null,
  );
  const items =
    existingData &&
    typeof existingData === 'object' &&
    existingData !== null &&
    'items' in existingData &&
    Array.isArray(/** @type {{ items?: unknown }} */ (existingData).items)
      ? /** @type {{ items: unknown[] }} */ (existingData).items
      : [];
  const titelMap = buildTitelMap(items);

  const desiredRows = [...iterDesiredRows()];
  const usedLegacy = new Set();
  for (const r of desiredRows) {
    if (/^cl-00[1-6]$/i.test(r.legacyId)) usedLegacy.add(r.legacyId);
  }
  /** @type {string[]} */
  const missingLegacy = [];
  for (const lid of usedLegacy) {
    if (!resolveLegacyToUuid(lid, titelMap)) missingLegacy.push(lid);
  }
  if (missingLegacy.length) {
    console.error(
      'Keine Checklisten-Vorlage für Legacy-IDs (Titel fehlen?). Bitte zuerst provision-ccwerbung-checklisten-api.mjs ausführen. Fehlend:',
      [...new Set(missingLegacy)].join(', '),
    );
    process.exit(1);
  }

  console.log('\nLegacy-ID → Checklisten-Vorlage (Namens-Match, erste passende titel):');
  for (const lid of ['cl-001', 'cl-002', 'cl-003', 'cl-004', 'cl-005', 'cl-006']) {
    const r = resolveLegacyToUuid(lid, titelMap);
    if (r) console.log(`  ${lid} → "${r.titelUsed}" → ${r.uuid}`);
    else console.log(`  ${lid} → (kein Treffer in GET /checklisten)`);
  }

  const zuData = await apiJson(
    'GET',
    `/api/v1/ccintern/checklisten-zuordnung?firma_id=${encodeURIComponent(firmaId)}`,
    auth,
    projectId,
    null,
  );
  const zuItems =
    zuData && typeof zuData === 'object' && zuData !== null && 'items' in zuData && Array.isArray(zuData.items)
      ? zuData.items
      : [];
  /** @type {Map<string, { id: string }>} */
  const keyToRow = new Map();
  for (const row of zuItems) {
    if (!row || typeof row !== 'object') continue;
    const pid = 'produkt_id' in row ? String(row.produkt_id) : '';
    const sch = 'schritt' in row ? String(row.schritt) : '';
    const cid = 'checkliste_id' in row ? String(row.checkliste_id) : '';
    const id = 'id' in row && row.id != null ? String(row.id) : '';
    if (!pid || !sch || !cid || !id) continue;
    keyToRow.set(`${pid}\t${sch}\t${cid}`, { id });
  }

  let created = 0;
  let updated = 0;

  for (const row of desiredRows) {
    const resolved = resolveLegacyToUuid(row.legacyId, titelMap);
    if (!resolved) {
      console.error('Intern: nicht auflösbar', row);
      process.exit(1);
    }
    const checkliste_id = resolved.uuid;
    const key = `${row.produkt_id}\t${row.schritt}\t${checkliste_id}`;
    const existing = keyToRow.get(key);

    const payload = {
      produkt_id: row.produkt_id,
      schritt: row.schritt,
      checkliste_id,
      sortierung: row.sortierung,
      aktiv: true,
    };

    if (dry) {
      console.log('[DRY]', existing ? 'PATCH' : 'POST', key, payload);
      continue;
    }

    if (existing) {
      await apiJson(
        'PATCH',
        `/api/v1/ccintern/checklisten-zuordnung/${encodeURIComponent(existing.id)}`,
        auth,
        projectId,
        { sortierung: row.sortierung, aktiv: true },
      );
      updated += 1;
    } else {
      const out = await apiJson('POST', '/api/v1/ccintern/checklisten-zuordnung', auth, projectId, payload);
      const item =
        out && typeof out === 'object' && out !== null && 'item' in out
          ? /** @type {{ item?: { id?: unknown } }} */ (out).item
          : null;
      const newId = item && item.id != null ? String(item.id) : '';
      if (newId) keyToRow.set(key, { id: newId });
      created += 1;
    }
  }

  const verify = await apiJson(
    'GET',
    `/api/v1/ccintern/checklisten-zuordnung?firma_id=${encodeURIComponent(firmaId)}`,
    auth,
    projectId,
    null,
  );
  const vItems =
    verify && typeof verify === 'object' && verify !== null && 'items' in verify && Array.isArray(verify.items)
      ? verify.items
      : [];

  /** @type {Map<string, number>} */
  const dupCheck = new Map();
  for (const r of vItems) {
    if (!r || typeof r !== 'object') continue;
    const pid = String(r.produkt_id || '');
    const sch = String(r.schritt || '');
    const cid = String(r.checkliste_id || '');
    const k = `${pid}\t${sch}\t${cid}`;
    dupCheck.set(k, (dupCheck.get(k) || 0) + 1);
    if (!UUID_RE.test(cid)) {
      console.error('Verifikation: checkliste_id ist keine UUID:', cid);
      process.exit(1);
    }
    if (/^cl-00[1-6]$/i.test(cid)) {
      console.error('Verifikation: Legacy-ID in DB:', cid);
      process.exit(1);
    }
  }
  const dups = [...dupCheck.entries()].filter(([, n]) => n > 1);
  if (dups.length) {
    console.error('Verifikation: Duplikate (produkt+schritt+checkliste):', dups);
    process.exit(1);
  }

  console.log('\n--- Ergebnis ---');
  console.log(`Geplante Zuordnungs-Zeilen (produktSchritt): ${desiredRows.length}`);
  console.log(dry ? '(CC_DRY_RUN=1 — keine Schreibvorgänge)' : `Neu angelegt: ${created}, aktualisiert: ${updated}`);
  console.log(`GET Zuordnungen: ${vItems.length} Zeile(n).`);
}

await main();
