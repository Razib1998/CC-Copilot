/**
 * Legt CC-Werbung-Standard-Checklisten nur über die HTTP-API an (POST /api/v1/checklisten + Einträge).
 *
 * Voraussetzungen: Backend läuft, gültige Zugangsdaten.
 *
 *   set CC_LOGIN_EMAIL=...
 *   set CC_LOGIN_PASSWORD=...
 *   node scripts/provision-ccwerbung-checklisten-api.mjs
 *
 * Alternativ (Bearer aus Browser sessionStorage cc_cockpit_access_token):
 *
 *   set CC_BEARER_TOKEN=eyJ...
 *   node scripts/provision-ccwerbung-checklisten-api.mjs
 *
 * Optional: CC_API_BASE (Default http://127.0.0.1:5371), CC_PROJECT_ID (sonst erstes Projekt aus GET /projects).
 */
import process from 'node:process';
import { isApiV1ProjectContextOptionalPath } from '../src/middleware/api-v1-project-context.js';

const BASE = (process.env.CC_API_BASE || 'http://127.0.0.1:5371').replace(/\/$/, '');

const VORLAGEN = [
  {
    titel: 'Druckdatenprüfung',
    punkte: [
      'Datei vorhanden und lesbar',
      'Endformat geprüft',
      'Beschnitt / Überfüllung geprüft',
      'Auflösung ausreichend',
      'Schriften geprüft / eingebettet',
      'Farbmodus geprüft',
      'Kunde / Auftrag / Motiv korrekt',
      'Freigabe vorhanden',
    ],
  },
  {
    titel: 'Fahrzeugbeklebung',
    punkte: [
      'Fahrzeugdaten geprüft',
      'Maße / Modell geprüft',
      'Druckdaten freigegeben',
      'Folie / Laminat passend gewählt',
      'Oberfläche / Reinigung eingeplant',
      'Montage-Termin abgestimmt',
      'Vorher-Fotos erforderlich',
      'Nachher-Fotos erforderlich',
      'Endkontrolle durchgeführt',
    ],
  },
  {
    titel: 'Montage allgemein',
    punkte: [
      'Auftrag vollständig',
      'Material vorbereitet',
      'Werkzeug vorbereitet',
      'Adresse / Einsatzort geprüft',
      'Ansprechpartner bekannt',
      'Montagezeit bestätigt',
      'Fotos vor Ort machen',
      'Abschluss dokumentieren',
    ],
  },
  {
    titel: 'Schilder / Dibond',
    punkte: [
      'Materialstärke geprüft',
      'Format geprüft',
      'Druckdatei freigegeben',
      'Bohrungen / Befestigung geklärt',
      'Kanten / Zuschnitt geprüft',
      'Montageart geklärt',
      'Endkontrolle durchgeführt',
    ],
  },
  {
    titel: 'Fensterfolie / Glasdekor',
    punkte: [
      'Glasfläche gemessen',
      'Folientyp geprüft',
      'Motiv / Schnittdatei freigegeben',
      'Reinigung vorbereitet',
      'Montage-Termin abgestimmt',
      'Blasen / Kanten geprüft',
      'Fotos nach Montage',
    ],
  },
  {
    titel: 'Messewand / MesseFlow',
    punkte: [
      'Wand / Standfläche geprüft',
      'Druckmaß geprüft',
      'Datei geprüft und freigegeben',
      'Kachelung geprüft',
      'Material / Folienbreite geprüft',
      'Produktionsübergabe an Druck geprüft',
      'Montagehilfe / PDF vorhanden',
      'Abschluss dokumentiert',
    ],
  },
];

/**
 * @param {string} method
 * @param {string} pathWithQuery
 * @param {string} token
 * @param {string} projectId
 * @param {object|null} body
 */
async function apiJson(method, pathWithQuery, token, projectId, body) {
  const url = pathWithQuery.startsWith('http') ? pathWithQuery : `${BASE}${pathWithQuery.startsWith('/') ? '' : '/'}${pathWithQuery}`;
  /** @type {Record<string, string>} */
  const headers = { Accept: 'application/json', Authorization: `Bearer ${token}` };
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
  if (data && typeof data === 'object' && 'success' in data && data.success === true) {
    return /** @type {{ data?: unknown }} */ (data).data;
  }
  return data;
}

async function main() {
  let token = (process.env.CC_BEARER_TOKEN || '').trim();
  if (!token) {
    const email = (process.env.CC_LOGIN_EMAIL || '').trim();
    const password = (process.env.CC_LOGIN_PASSWORD || '').trim();
    if (!email || !password) {
      console.error(
        'Bitte CC_BEARER_TOKEN setzen oder CC_LOGIN_EMAIL + CC_LOGIN_PASSWORD (oder interaktiv einloggen und Token aus sessionStorage cc_cockpit_access_token).',
      );
      process.exit(1);
    }
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginBody = await loginRes.json();
    if (!loginRes.ok || !loginBody.access_token) {
      console.error('Login fehlgeschlagen:', loginRes.status, loginBody);
      process.exit(1);
    }
    token = loginBody.access_token;
    console.log('Login OK:', loginBody.user?.email || email);
  } else {
    console.log('Nutze CC_BEARER_TOKEN');
  }

  const me = await apiJson('GET', '/auth/me', token, '', null);
  const user = me && typeof me === 'object' && 'user' in me ? /** @type {{ user?: { company_id?: string } }} */ (me).user : null;
  const firmaId = user?.company_id != null ? String(user.company_id).trim() : '';
  if (!firmaId) {
    console.error('Kein company_id am Benutzer — firma_id für Checklisten nicht auflösbar.');
    process.exit(1);
  }
  console.log('firma_id:', firmaId);

  let projectId = (process.env.CC_PROJECT_ID || '').trim();
  if (!projectId) {
    const pdata = await apiJson('GET', '/api/v1/projects', token, '', null);
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

  /** @type {{ titel: string; punkte: number; status: string }[]} */
  const report = [];

  for (const v of VORLAGEN) {
    const existingData = await apiJson(
      'GET',
      `/api/v1/checklisten?page=1&limit=200&firma_id=${encodeURIComponent(firmaId)}`,
      token,
      projectId,
      null,
    );
    const items =
      existingData &&
      typeof existingData === 'object' &&
      existingData !== null &&
      'items' in existingData &&
      Array.isArray(/** @type {{ items?: unknown }} */ (existingData).items)
        ? /** @type {{ items: { titel?: string }[] }} */ (existingData).items
        : [];
    const hit = items.find((row) => String(row?.titel || '').trim() === v.titel);
    let checklisteId = hit && typeof hit.id === 'string' ? hit.id : hit && hit.id != null ? String(hit.id) : '';

    if (!checklisteId) {
      const created = await apiJson('POST', '/api/v1/checklisten', token, projectId, {
        titel: v.titel,
        firma_id: firmaId,
      });
      checklisteId =
        created && typeof created === 'object' && created !== null && 'id' in created
          ? String(/** @type {{ id?: unknown }} */ (created).id)
          : '';
      if (!checklisteId) {
        console.error('POST checklist ohne id:', created);
        process.exit(1);
      }
      console.log('Angelegt:', v.titel, checklisteId);
    } else {
      console.log('Vorhanden, überspringe Kopf:', v.titel, checklisteId);
    }

    const detail = await apiJson(
      'GET',
      `/api/v1/checklisten/${encodeURIComponent(checklisteId)}?firma_id=${encodeURIComponent(firmaId)}`,
      token,
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

    const existingTexts = new Set(
      existingEin.map((e) => String(e?.text || '').trim()).filter(Boolean),
    );
    let added = 0;
    for (const text of v.punkte) {
      const t = String(text).trim();
      if (!t) continue;
      if (existingTexts.has(t)) continue;
      await apiJson(
        'POST',
        `/api/v1/checklisten/${encodeURIComponent(checklisteId)}/eintraege`,
        token,
        projectId,
        { text: t, erledigt: false, firma_id: firmaId },
      );
      existingTexts.add(t);
      added++;
    }
    report.push({
      titel: v.titel,
      punkte: existingTexts.size,
      status: added ? `+${added} neue Einträge` : 'alle Punkte schon vorhanden',
    });
  }

  const verify = await apiJson(
    'GET',
    `/api/v1/checklisten?page=1&limit=50&firma_id=${encodeURIComponent(firmaId)}`,
    token,
    projectId,
    null,
  );
  const verItems =
    verify && typeof verify === 'object' && verify !== null && 'items' in verify
      ? /** @type {{ items?: unknown }} */ (verify).items
      : [];
  const n = Array.isArray(verItems) ? verItems.length : 0;

  console.log('\n--- Ergebnis ---');
  for (const r of report) {
    console.log(`${r.titel}: ${r.punkte} Prüfpunkte (${r.status})`);
  }
  console.log(`\nGET /api/v1/checklisten: ${n} Vorlage(n) in der Liste.`);

  for (const v of VORLAGEN) {
    const row = Array.isArray(verItems)
      ? verItems.find((x) => x && String(x.titel || '').trim() === v.titel)
      : null;
    if (!row || !row.id) {
      console.warn('WARN: Vorlage nicht in Liste:', v.titel);
      continue;
    }
    const d = await apiJson(
      'GET',
      `/api/v1/checklisten/${encodeURIComponent(String(row.id))}?firma_id=${encodeURIComponent(firmaId)}`,
      token,
      projectId,
      null,
    );
    const ein =
      d && typeof d === 'object' && d !== null && 'eintraege' in d && Array.isArray(d.eintraege)
        ? d.eintraege.length
        : 0;
    console.log(` Verifikation ${v.titel}: ${ein} Einträge`);
  }
}

await main();
