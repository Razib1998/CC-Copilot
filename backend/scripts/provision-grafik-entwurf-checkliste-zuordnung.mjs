/**
 * Standard-Workflow-Checklisten: Vorlagen (checklisten + checklisten_eintraege) und
 * ccintern_checklisten_zuordnung pro Schritt — nur per HTTP-API.
 *
 * produkt_id: aus bestehenden aktiven Zuordnungen (Schritte grafik/druck, … wie bisher).
 * Optional: CC_PRODUKT_ID, wenn noch keine Zuordnungen existieren.
 *
 *   node scripts/sync-cc-local-bearer.mjs
 *   node scripts/provision-grafik-entwurf-checkliste-zuordnung.mjs
 *
 * Optional: CC_API_BASE, CC_PROJECT_ID, CC_DRY_RUN=1
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

/** API-Schritt `doku` (nicht „dokumentation“); Titel „Dokumentation“. */
const STANDARD_CHECKLISTEN = [
  {
    schritt: 'grafik',
    titel: 'Grafik / Entwurf',
    punkte: [
      'Kundendaten / Auftrag geprüft',
      'Maße / Format geprüft',
      'Motiv / Layout erstellt',
      'Logo / Schriften geprüft',
      'Farben / CI geprüft',
      'Rechtschreibung geprüft',
      'Kunde / Auftrag / Motiv korrekt',
      'Entwurf intern geprüft',
      'Layout zur Freigabe bereit',
    ],
  },
  {
    schritt: 'druck',
    titel: 'Druck / Plot',
    punkte: [
      'Datei vorhanden und lesbar',
      'Endformat geprüft',
      'Beschnitt / Überfüllung geprüft',
      'Auflösung ausreichend',
      'Schriften geprüft / eingebettet',
      'Farbmodus geprüft',
      'Kunde / Auftrag / Motiv korrekt',
      'Freigabe vorhanden',
      'Workflow Grafik: Freigabe für Druck / Produktion liegt vor',
      'Workflow: nächster Schritt im Auftrag ist abgesprochen',
    ],
  },
  {
    schritt: 'laminat',
    titel: 'Laminat / Schnitt',
    punkte: [
      'Material geprüft',
      'Laminat korrekt gewählt',
      'Kaschierung sauber durchgeführt',
      'Schnittdaten geprüft',
      'Konturschnitt geprüft',
      'Kanten sauber',
      'Bahnen korrekt',
      'Material ohne Schäden',
      'Workflow Montage vorbereitet',
    ],
  },
  {
    schritt: 'montage',
    titel: 'Montage',
    punkte: [
      'Montageort geprüft',
      'Werkzeug vollständig',
      'Material vollständig',
      'Fahrzeug / Fläche gereinigt',
      'Montage durchgeführt',
      'Kanten geprüft',
      'Fotos erstellt',
      'Kunde informiert',
      'Workflow Dokumentation vorbereitet',
    ],
  },
  {
    schritt: 'doku',
    titel: 'Dokumentation',
    punkte: [
      'Montagefotos vorhanden',
      'Auftrag dokumentiert',
      'Kunde bestätigt',
      'Dateien hochgeladen',
      'Status geprüft',
      'Interne Prüfung durchgeführt',
      'Projekt vollständig',
      'Abschluss dokumentiert',
    ],
  },
];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {{ bearerToken?: string|null, devProvisionKey?: string|null }} auth
 * @param {string} projectId
 * @param {object|null} body
 */
async function apiJson(method, pathWithQuery, auth, projectId, body) {
  const url = pathWithQuery.startsWith('http') ? pathWithQuery : `${BASE}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
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
 * @param {unknown} row
 */
function zuRowAktiv(row) {
  if (!row || typeof row !== 'object') return false;
  const a = /** @type {{ aktiv?: unknown }} */ (row).aktiv;
  if (a === true || a === 1) return true;
  if (String(a).trim() === '1') return true;
  return false;
}

/**
 * @param {unknown[]} items GET …/checklisten-zuordnung → data.items
 */
function resolveProduktIdFromZuordnungen(items) {
  const fromEnv = String(process.env.CC_PRODUKT_ID || '').trim();
  if (fromEnv) return fromEnv;

  const rows = Array.isArray(items) ? items : [];
  const active = rows.filter(zuRowAktiv);
  const grafikDruck = active.filter((r) => {
    const s = r && typeof r === 'object' && 'schritt' in r ? String(/** @type {{ schritt?: unknown }} */ (r).schritt || '').trim() : '';
    return s === 'grafik' || s === 'druck';
  });
  /** @type {Map<string, number>} */
  const bag = new Map();
  for (const r of grafikDruck) {
    if (!r || typeof r !== 'object') continue;
    const p = 'produkt_id' in r ? String(/** @type {{ produkt_id?: unknown }} */ (r).produkt_id || '').trim() : '';
    if (!p) continue;
    bag.set(p, (bag.get(p) || 0) + 1);
  }
  if (bag.size) {
    let best = '';
    let bestN = -1;
    for (const [p, n] of bag.entries()) {
      if (n > bestN || (n === bestN && p < best)) {
        best = p;
        bestN = n;
      }
    }
    return best;
  }
  for (const r of active) {
    const s = r && typeof r === 'object' && 'schritt' in r ? String(/** @type {{ schritt?: unknown }} */ (r).schritt || '').trim() : '';
    if (s !== 'grafik') continue;
    const p = r && typeof r === 'object' && 'produkt_id' in r ? String(/** @type {{ produkt_id?: unknown }} */ (r).produkt_id || '').trim() : '';
    if (p) return p;
  }
  for (const r of active) {
    if (!r || typeof r !== 'object') continue;
    const p = 'produkt_id' in r ? String(/** @type {{ produkt_id?: unknown }} */ (r).produkt_id || '').trim() : '';
    if (p) return p;
  }
  return '';
}

/**
 * @param {unknown[]} listItems
 * @param {string} titel
 */
function findChecklisteIdByTitel(listItems, titel) {
  const want = String(titel || '').trim();
  const hit = listItems.find((row) => row && typeof row === 'object' && String(row.titel || '').trim() === want);
  if (hit && typeof hit === 'object' && hit !== null && 'id' in hit && String(hit.id || '').trim()) {
    const id = String(hit.id).trim();
    return UUID_RE.test(id) ? id : '';
  }
  return '';
}

async function main() {
  const dry = String(process.env.CC_DRY_RUN || '').trim() === '1';

  const auth = await resolveProvisionRequestAuth(import.meta.url);
  const me = await apiJson('GET', '/auth/me', auth, '', null);
  const user = me && typeof me === 'object' && 'user' in me ? /** @type {{ user?: { company_id?: string } }} */ (me).user : null;
  const firmaId = user?.company_id != null ? String(user.company_id).trim() : '';
  if (!firmaId) {
    console.error('Kein company_id am Benutzer.');
    process.exit(1);
  }

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

  const produktId = resolveProduktIdFromZuordnungen(zuItems);
  if (!produktId) {
    console.error(
      'Keine produkt_id ableitbar (keine aktiven Zuordnungen). Bitte eine Zuordnung anlegen oder CC_PRODUKT_ID setzen.',
    );
    process.exit(1);
  }

  const listData = await apiJson(
    'GET',
    `/api/v1/checklisten?page=1&limit=500&firma_id=${encodeURIComponent(firmaId)}`,
    auth,
    projectId,
    null,
  );
  /** @type {{ id?: unknown; titel?: string }[]} */
  let listItems =
    listData && typeof listData === 'object' && listData !== null && 'items' in listData && Array.isArray(listData.items)
      ? /** @type {{ id?: unknown; titel?: string }[]} */ (listData.items).slice()
      : [];

  if (dry) {
    console.log('\n--- Ergebnis (dry) ---');
    console.log('produkt_id:', produktId);
    for (const def of STANDARD_CHECKLISTEN) {
      const cid = findChecklisteIdByTitel(listItems, def.titel);
      console.log('[DRY]', def.schritt, def.titel, cid || '(neue Vorlage per POST)');
    }
    return;
  }

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

  /** @type {{ schritt: string; titel: string; checklisteId: string; punkte: number; vorlageNeu: boolean }[]} */
  const report = [];

  for (const def of STANDARD_CHECKLISTEN) {
    const schritt = String(def.schritt || '').trim();
    const titel = String(def.titel || '').trim();
    const punkte = Array.isArray(def.punkte) ? def.punkte : [];
    if (!schritt || !titel) {
      console.error('Ungültiger STANDARD_CHECKLISTEN-Eintrag:', def);
      process.exit(1);
    }

    let checklisteId = findChecklisteIdByTitel(listItems, titel);
    let vorlageNeu = false;
    if (!checklisteId) {
      const created = await apiJson('POST', '/api/v1/checklisten', auth, projectId, {
        titel,
        firma_id: firmaId,
      });
      checklisteId =
        created && typeof created === 'object' && created !== null && 'id' in created
          ? String(/** @type {{ id?: unknown }} */ (created).id).trim()
          : '';
      if (!checklisteId || !UUID_RE.test(checklisteId)) {
        console.error('POST checkliste ohne gültige id:', titel, created);
        process.exit(1);
      }
      listItems.push({ id: checklisteId, titel });
      vorlageNeu = true;
    }

    const detail = await apiJson(
      'GET',
      `/api/v1/checklisten/${encodeURIComponent(checklisteId)}?firma_id=${encodeURIComponent(firmaId)}`,
      auth,
      projectId,
      null,
    );
    const existingEin =
      detail &&
      typeof detail === 'object' &&
      detail !== null &&
      'eintraege' in detail &&
      Array.isArray(/** @type {{ eintraege?: unknown }} */ (detail).eintraege)
        ? /** @type {{ eintraege: { text?: string }[] }} */ (detail).eintraege
        : [];
    const existingTexts = new Set(existingEin.map((e) => String(e?.text || '').trim()).filter(Boolean));
    for (let i = 0; i < punkte.length; i++) {
      const t = String(punkte[i]).trim();
      if (!t || existingTexts.has(t)) continue;
      await apiJson(
        'POST',
        `/api/v1/checklisten/${encodeURIComponent(checklisteId)}/eintraege`,
        auth,
        projectId,
        { text: t, erledigt: false, firma_id: firmaId },
      );
      existingTexts.add(t);
    }

    console.log('[CL-STANDARD-VORLAGE]', {
      schritt,
      titel,
      checklisteId,
    });

    const zuKey = `${produktId}\t${schritt}\t${checklisteId}`;
    const existingZu = keyToRow.get(zuKey);
    if (existingZu && UUID_RE.test(existingZu.id)) {
      await apiJson(
        'PATCH',
        `/api/v1/ccintern/checklisten-zuordnung/${encodeURIComponent(existingZu.id)}`,
        auth,
        projectId,
        { sortierung: 1, aktiv: true },
      );
    } else {
      const out = await apiJson('POST', '/api/v1/ccintern/checklisten-zuordnung', auth, projectId, {
        produkt_id: produktId,
        schritt,
        checkliste_id: checklisteId,
        sortierung: 1,
        aktiv: true,
      });
      const item =
        out && typeof out === 'object' && out !== null && 'item' in out ? /** @type {{ item?: { id?: unknown } }} */ (out).item : null;
      const newZid = item && item.id != null ? String(item.id).trim() : '';
      if (newZid && UUID_RE.test(newZid)) {
        keyToRow.set(zuKey, { id: newZid });
      }
    }

    console.log('[CL-STANDARD-ZUORDNUNG]', {
      produktId,
      schritt,
      checklisteId,
    });

    const detailEnd = await apiJson(
      'GET',
      `/api/v1/checklisten/${encodeURIComponent(checklisteId)}?firma_id=${encodeURIComponent(firmaId)}`,
      auth,
      projectId,
      null,
    );
    const nEin =
      detailEnd &&
      typeof detailEnd === 'object' &&
      detailEnd !== null &&
      'eintraege' in detailEnd &&
      Array.isArray(/** @type {{ eintraege?: unknown }} */ (detailEnd).eintraege)
        ? /** @type {{ eintraege: unknown[] }} */ (detailEnd).eintraege.length
        : punkte.length;

    report.push({ schritt, titel, checklisteId, punkte: nEin, vorlageNeu });
  }

  console.log('\n--- Ergebnis ---');
  console.log('produkt_id:', produktId);
  for (const r of report) {
    console.log(
      `- ${r.schritt} | ${r.titel} | checkliste_id=${r.checklisteId} | Punkte=${r.punkte} | neu=${r.vorlageNeu}`,
    );
  }
}

await main();
