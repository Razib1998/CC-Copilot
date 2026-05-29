import { randomUUID, randomBytes } from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import express, { Router } from 'express';
import { normalizeInviteAccessForRedeem } from '../auth/invite-redeem-normalize.js';
import { generateInviteToken } from '../auth/invite-token.js';
import { hashPassword } from '../auth/password.js';
import { accessProfileToJson, loadAccessProfile } from '../auth/access-profile.js';
import {
  bereicheForModule,
  isKnownBereich,
  isValidGlobalRole,
  isValidModuleKey,
  normalizeRightsJson,
} from '../auth/rights-spec.js';
import { attachAccessProfile } from '../middleware/attach-access-profile.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireAuth } from '../middleware/require-auth.js';
import { maybeAttachDevProvisionAuth } from '../middleware/dev-provision-auth.js';
import {
  requireModule,
  requireRight,
  requireSuperAdmin,
  requireCockpitBenutzerSehenOrMitarbeiterAppSelfList,
  requireCockpitFirmenSehenOrMitarbeiterAppOwnFirma,
} from '../middleware/require-rights.js';
import { buildKundenStammDetailEnvelope } from '../lib/kunden-stamm-detail.js';
import {
  buildFormMetaPayload,
  kalkuliereAuftragsparameter,
  kalkuliereFusaAuftragPreisdetails,
} from '../lib/fusa-auftragsregeln.js';
import {
  parseZuYyyymmdd,
  fahrzeugPasstZuTypLabel,
  fahrzeugPasstZuDepot,
  fahrzeugDepotAnzeige,
} from '../lib/fusa-belegung-verfuegbarkeit.js';
import { pruefeFahrzeugVerfuegbarkeit } from '../lib/fusa-fahrzeug-verfuegbarkeit.js';
import { registerMesseflowPruefProxyRoutes } from './messeflow-pruef-proxy.js';
import { syncCcInternMontageTermin, syncFusaTerminAndLinkedCcIntern } from '../lib/auftrag-kalender-sync.js';
import { parseModulesCsv } from '../lib/parse-modules-csv.js';
import {
  createGenehmigteUrlaubKalenderTermine,
  deleteAllKalenderTermineForUrlaubAntrag,
} from '../lib/urlaub-kalender-termine.js';
import { createMitarbeiterRouter } from './mitarbeiter.js';
import { createChecklistenRouter } from './checklisten.js';
import { createProduktionRouter } from './produktion.js';
import { createFusaDokumenteRouter } from './fusa-dokumente.js';
import { createFusaAngebotRouter } from './fusa-angebote.js';
import { createCcInternAngeboteRouter } from './ccintern/angebote.js';
import { createProjectsRouter } from './projects.js';
import { createLogsRouter } from './logs.js';
import { createCockpitDashboardRouter } from './cockpit/dashboard.js';
import { createFusaDashboardRouter } from './fusa/dashboard.js';
import { createFusaQuartaleRouter } from './fusa/quartale.js';
import { createCcinternDashboardRouter } from './ccintern/dashboard.js';
import { createGeraeteRouter } from './geraete.js';
import { createCrmRouter } from './crm/index.js';
import { createMobileRouter } from './ccintern/mobile.js';
import { createCcInternMitarbeiterOperativRouter } from './ccintern/mitarbeiter-operativ.js';
import { createCcInternChecklistenZuordnungRouter } from './ccintern/checklisten-zuordnung.js';
import { handleAuthRefresh } from '../lib/auth-refresh-handler.js';
import { createApiV1SchaedenRouter } from './api-v1/schaeden.js';
import { createFahrzeugeRouter } from './fahrzeuge.js';
import { createAuftraegeRouter as createFusaNativeAuftraegeRouter } from './auftraege.js';
import { requireApiProjectContext } from '../middleware/require-api-project.js';
import {
  requireApiV1ProjectHeaderUnlessWhitelisted,
  PROJECT_CONTEXT_REQUIRED_MESSAGE,
} from '../middleware/api-v1-project-context.js';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { logAudit } from '../lib/audit-log.js';
import { messeflowCalderaMulter, writeUploadBufferSync, createMulterMemory } from '../lib/upload-storage.js';
import {
  writeCcInternServerDateiSync,
  resolveCcInternServerAbsolute,
  ccInternDateiUsesStableSlot,
} from '../lib/ccintern-server-files.js';

console.log('[api-v1] Modul geladen (Datei backend/src/routes/api-v1.js).');

/**
 * Optionale CC-Intern-Felder: Sollstunden/Monat (0–400), Urlaubstage/Jahr (0–365).
 * @param {Record<string, unknown>|null|undefined} body
 * @param {{ soll?: number, urlaub?: number }} target
 */
function applySollUrlaubFromBody(body, target) {
  if (!body || typeof body !== 'object') return;
  if (Object.prototype.hasOwnProperty.call(body, 'soll')) {
    const n = Math.round(Number(body.soll));
    if (!Number.isFinite(n) || n < 0 || n > 400) {
      throw Object.assign(new Error('VALIDATION_SOLL'), { code: 'VALIDATION_SOLL' });
    }
    target.soll = n;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'urlaub')) {
    const n = Math.round(Number(body.urlaub));
    if (!Number.isFinite(n) || n < 0 || n > 365) {
      throw Object.assign(new Error('VALIDATION_URLAUB'), { code: 'VALIDATION_URLAUB' });
    }
    target.urlaub = n;
  }
}

function userRowSollUrlaub(row) {
  const soll = row && row.soll != null ? Math.round(Number(row.soll)) : 160;
  const urlaub = row && row.urlaub != null ? Math.round(Number(row.urlaub)) : 28;
  return {
    soll: Number.isFinite(soll) && soll >= 0 ? Math.min(400, soll) : 160,
    urlaub: Number.isFinite(urlaub) && urlaub >= 0 ? Math.min(365, urlaub) : 28,
  };
}

/**
 * @param {import('../auth/access-profile.js').AccessProfile|null|undefined} p
 */
function canListAllUsersForApi(p) {
  return !!(p && (p.isSuperAdmin() || (p.hasModule('cockpit') && p.has('cockpit', 'benutzer', 'sehen'))));
}

/**
 * @param {import('../auth/access-profile.js').AccessProfile|null|undefined} p
 */
function canListAllFirmenForApi(p) {
  return !!(p && (p.isSuperAdmin() || (p.hasModule('cockpit') && p.has('cockpit', 'firmen', 'sehen'))));
}

/**
 * @param {unknown} raw
 * @returns {string} getrimmte Kleinbuchstaben-E-Mail oder leer bei ungültig
 */
function normalizeApiEmail(raw) {
  if (raw == null || typeof raw !== 'string') return '';
  const t = raw.trim().toLowerCase();
  if (!t || !t.includes('@')) return '';
  return t;
}

/**
 * @param {Record<string, unknown>} meta
 * @param {boolean} kannPreiseSehen
 */
function fusaFormMetaOhnePreise(meta, kannPreiseSehen) {
  if (kannPreiseSehen) return meta;
  const m = structuredClone(meta);
  for (const block of m.pakete_je_typ || []) {
    for (const p of block.pakete || []) {
      delete p.preis_monat_netto;
    }
  }
  if (m.preisgrundlagen && typeof m.preisgrundlagen === 'object') {
    m.preisgrundlagen.paket_preise_monat_netto = null;
    m.preisgrundlagen.preise_verdeckt = true;
  }
  return m;
}

/** @param {unknown} v */
function fusaRechnungExtraJsonToString(v) {
  if (v == null) return null;
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * @param {unknown} curJson
 * @param {unknown} patchObj
 */
function mergeFusaRechnungExtraJson(curJson, patchObj) {
  let o = {};
  try {
    const s = curJson == null ? '' : String(curJson).trim();
    if (s) o = JSON.parse(s);
  } catch {
    o = {};
  }
  if (!patchObj || typeof patchObj !== 'object' || Array.isArray(patchObj)) return JSON.stringify(o);
  return JSON.stringify({ ...o, .../** @type {Record<string, unknown>} */ (patchObj) });
}

/** @param {unknown} json */
function safeJsonArray(json) {
  if (json == null) return [];
  try {
    const a = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** @param {unknown} json */
function safeJsonObject(json) {
  if (json == null) return {};
  try {
    const o = typeof json === 'string' ? JSON.parse(json) : json;
    return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
  } catch {
    return {};
  }
}

/**
 * Fahrzeugliste für Wizard: Typ/Depot-Filter + Flächenstatus aus fusa_belegungen.
 *
 * @param {any} store
 * @param {{
 *   projectId: string,
 *   startdatum: string,
 *   enddatum: string,
 *   fahrzeugtyp: string,
 *   depot: string,
 *   paketGlobal: string,
 *   paketProFahrzeug: Record<string, string> | null,
 *   excludeAuftragId?: string|null,
 * }} p
 */
async function buildVerfuegbareFahrzeugeMitFlaechen(store, p) {
  const excl =
    p.excludeAuftragId != null && String(p.excludeAuftragId).trim() !== ''
      ? String(p.excludeAuftragId).trim()
      : null;
  const fahrzeugeRows = await store.listFahrzeugeForProject(p.projectId);
  const overlapRows = await store.listFusaBelegungenOverlappendMitAuftragExtra(
    p.projectId,
    p.startdatum,
    p.enddatum,
    excl,
  );
  const schaedenAll = await store.listSchaedenForProject(p.projectId);
  /** @type {Map<string, Record<string, unknown>[]>} */
  const schByFz = new Map();
  for (const s of schaedenAll) {
    const sid = s && s.fahrzeug_id != null ? String(s.fahrzeug_id).trim() : '';
    if (!sid) continue;
    if (!schByFz.has(sid)) schByFz.set(sid, []);
    schByFz.get(sid).push(s);
  }
  const paketMap =
    p.paketProFahrzeug && typeof p.paketProFahrzeug === 'object' && !Array.isArray(p.paketProFahrzeug)
      ? p.paketProFahrzeug
      : null;

  /** @type {Array<Record<string, unknown>>} */
  const fahrzeuge = [];
  const depotNorm = String(p.depot || '').trim();
  if (!depotNorm) {
    return {
      project_id: p.projectId,
      zeitraum: { startdatum: p.startdatum, enddatum: p.enddatum },
      fahrzeugtyp: p.fahrzeugtyp,
      depot: null,
      paket: p.paketGlobal || null,
      paket_pro_fahrzeug: paketMap,
      fahrzeuge: [],
      hinweise: [
        'Parameter `depot` ist erforderlich — ohne Depot werden keine Fahrzeuge zurückgegeben.',
        '`buchbar` bündelt Restlaufzeit, Eigenwerbung, Ausfall/Schäden und Flächen (Parameter `paket` / `paket_pro_fahrzeug`).',
        'Feld `erlaubt` entspricht `buchbar` (Kompatibilität).',
        'Bestehende Belegungen: Flächen aus `fusa_belegungen` + Paket im Auftrag; fehlendes Paket konservativ.',
        'Optional `exclude_auftrag_id` (GET-Query oder POST-Body): eigene Belegung dieses Auftrags wird bei der Prüfung ignoriert (Bearbeiten).',
      ],
    };
  }

  for (const row of fahrzeugeRows) {
    if (!fahrzeugPasstZuTypLabel(row, p.fahrzeugtyp)) continue;
    if (!fahrzeugPasstZuDepot(row, depotNorm)) continue;
    const fid = row.id != null ? String(row.id) : '';
    if (!fid) continue;

    const fromMap = paketMap && paketMap[fid] != null ? String(paketMap[fid]).trim() : '';
    const effPaket = fromMap || String(p.paketGlobal || '').trim();

    const v = pruefeFahrzeugVerfuegbarkeit(row, effPaket, { startdatum: p.startdatum, enddatum: p.enddatum }, {
      overlapRows,
      schaedenRows: schByFz.get(fid) || [],
      excludeAuftragId: excl,
    });

    /** @type {Record<string, unknown>} */
    const entry = {
      id: fid,
      kennung: row.kennung ?? null,
      typ: row.typ ?? null,
      depot: fahrzeugDepotAnzeige(/** @type {Record<string, unknown>} */ (row)),
      kennzeichen: row.kennzeichen ?? null,
      status: row.status ?? null,
      buchbar: v.buchbar,
      sperrgrund_code: v.sperrgrund_code,
      sperrgrund_text: v.sperrgrund_text || null,
      fahrzeug_aktiv_bis: v.fahrzeug_aktiv_bis ?? null,
      eigenwerbung_aktiv: v.eigenwerbung_aktiv,
      ausfall_aktiv: v.ausfall_aktiv,
      konfliktflaechen: v.konfliktflaechen,
      belegte_flaechen: v.belegte_flaechen,
      freie_flaechen: v.freie_flaechen,
      flaechen_pruefung_unsicher: v.flaechen_pruefung_unsicher,
      erlaubt: v.buchbar,
      konflikt_hinweis: !v.buchbar && v.sperrgrund_text ? v.sperrgrund_text : null,
    };
    if (!effPaket && v.buchbar) {
      entry.erlaubt = null;
      entry.konflikt_hinweis = v.flaechen_pruefung_unsicher
        ? 'Paket noch nicht gewählt — im Zeitraum liegen Belegungen ohne ermittelbares Paket vor.'
        : null;
    }
    if (Array.isArray(/** @type {any} */ (v).flaechen_hinweise) && /** @type {any} */ (v).flaechen_hinweise.length) {
      entry.flaechen_hinweise = /** @type {any} */ (v).flaechen_hinweise;
    }
    fahrzeuge.push(entry);
  }

  /** @type {string[]} */
  const hinweise = [
    '`buchbar` bündelt Restlaufzeit, Eigenwerbung, Ausfall/Schäden und Flächen (Parameter `paket` / `paket_pro_fahrzeug`).',
    'Feld `erlaubt` entspricht `buchbar` (Kompatibilität).',
    'Bestehende Belegungen: Flächen aus `fusa_belegungen` + Paket im Auftrag; fehlendes Paket konservativ.',
    'Optional `exclude_auftrag_id` (GET-Query oder POST-Body): eigene Belegung dieses Auftrags wird bei der Prüfung ignoriert (Bearbeiten).',
  ];

  return {
    project_id: p.projectId,
    zeitraum: { startdatum: p.startdatum, enddatum: p.enddatum },
    fahrzeugtyp: p.fahrzeugtyp,
    depot: depotNorm,
    paket: p.paketGlobal || null,
    paket_pro_fahrzeug: paketMap,
    fahrzeuge,
    hinweise,
  };
}

/**
 * @param {string} param
 */
function requireSuperAdminOrSelf(param) {
  return (req, res, next) => {
    const raw = req.params[param];
    const id = typeof raw === 'string' ? raw.trim() : '';
    if (!id) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
    }
    if (req.auth.userId === id) return next();
    if (req.accessProfile?.isSuperAdmin()) return next();
    return sendError(
      res,
      403,
      'FORBIDDEN',
      'Keine Berechtigung, Rechte dieses Benutzers einzusehen.',
    );
  };
}

/**
 * @param {Record<string, Record<string, unknown>>} expanded
 * @param {unknown} patchRights
 */
function mergeRightsPatch(expanded, patchRights) {
  const out = {};
  for (const k of Object.keys(expanded)) {
    out[k] = { ...expanded[k] };
  }
  if (!patchRights || typeof patchRights !== 'object') return out;
  for (const modRaw of Object.keys(patchRights)) {
    const mod = typeof modRaw === 'string' ? modRaw.trim().toLowerCase() : '';
    if (!isValidModuleKey(mod)) continue;
    const be = /** @type {Record<string, unknown>} */ (patchRights)[modRaw];
    if (!be || typeof be !== 'object') continue;
    if (!out[mod]) out[mod] = {};
    for (const bRaw of Object.keys(be)) {
      let b = typeof bRaw === 'string' ? bRaw.trim() : '';
      if (!b) continue;
      const blo = b.toLowerCase();
      const prefix = `${mod}_`;
      if (blo.startsWith(prefix)) b = blo.slice(prefix.length);
      else if (mod === 'ccintern' && blo.startsWith('ccintern_')) b = blo.slice('ccintern_'.length);
      else b = blo;
      if (!isKnownBereich(mod, b)) continue;
      out[mod][b] = normalizeRightsJson(/** @type {Record<string, unknown>} */ (be)[bRaw]);
    }
  }
  return out;
}

/**
 * @param {string[]} modules
 * @param {Record<string, Record<string, import('../auth/rights-spec.js').RightsFlags>>} sourceRights
 */
function expandRightsForModuleList(modules, sourceRights) {
  /** @type {Record<string, Record<string, ReturnType<typeof normalizeRightsJson>>>} */
  const out = {};
  for (const m of modules) {
    if (!isValidModuleKey(m)) continue;
    const prev = sourceRights[m] || {};
    out[m] = {};
    for (const b of bereicheForModule(m)) {
      out[m][b] = normalizeRightsJson(prev[b] || {});
    }
  }
  return out;
}

/**
 * @param {unknown} rawPage
 * @param {unknown} rawLimit
 */
function parsePagination(rawPage, rawLimit) {
  const page0 = Number.parseInt(String(rawPage ?? '1'), 10);
  const limit0 = Number.parseInt(String(rawLimit ?? '50'), 10);
  const page = Number.isFinite(page0) && page0 > 0 ? page0 : 1;
  const limit = Number.isFinite(limit0) && limit0 > 0 ? Math.min(limit0, 200) : 50;
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * @param {unknown} v
 */
function nullableTrimmed(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/**
 * @param {unknown} v
 */
function requiredTrimmed(v) {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
}

/**
 * `company_id` (snake) hat Vorrang vor `companyId` (camel), wenn beide gesetzt sind.
 * @param {unknown} body
 * @returns {{ present: boolean, value: string|null }}
 *   `present: false` → Firma nicht anfassen; `present: true` + `value: null` → explizit leeren.
 */
function parseCompanyIdFromBody(body) {
  if (!body || typeof body !== 'object') return { present: false, value: null };
  const hasSnake = Object.prototype.hasOwnProperty.call(body, 'company_id');
  const hasCamel = Object.prototype.hasOwnProperty.call(body, 'companyId');
  if (!hasSnake && !hasCamel) return { present: false, value: null };
  const raw = hasSnake ? /** @type {{ company_id?: unknown }} */ (body).company_id : /** @type {{ companyId?: unknown }} */ (body).companyId;
  if (raw == null) return { present: true, value: null };
  const t = String(raw).trim();
  return { present: true, value: t || null };
}

/**
 * @param {unknown} v
 */
function optionalIsoLike(v) {
  if (v == null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return undefined;
  return s;
}

/**
 * @param {unknown} bemerkungRaw
 * @returns {string|null}
 */
function extractMontageDatumFromBemerkungPayload(bemerkungRaw) {
  if (bemerkungRaw == null) return null;
  const raw = String(bemerkungRaw).trim();
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const payload = parsed.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
    const cand = optionalIsoLike(payload.montageDatum);
    return cand === undefined ? null : cand;
  } catch {
    return null;
  }
}

/**
 * Führende Quelle ist DB-Spalte montage_datum. Erlaubt snake_case, camelCase und Alt-Payload-Fallback aus bemerkung.
 * @param {Record<string, unknown>|null|undefined} body
 * @returns {{ value: string|null, invalid: boolean }}
 */
function resolveCcInternMontageDatumInput(body) {
  const b = body && typeof body === 'object' ? body : {};
  const hasSnake = Object.prototype.hasOwnProperty.call(b, 'montage_datum');
  const hasCamel = Object.prototype.hasOwnProperty.call(b, 'montageDatum');
  const rawDirect = hasSnake ? b.montage_datum : hasCamel ? b.montageDatum : undefined;
  const parsedDirect = optionalIsoLike(rawDirect);
  if (
    rawDirect != null
    && String(rawDirect).trim() !== ''
    && parsedDirect === undefined
  ) {
    return { value: null, invalid: true };
  }
  if (parsedDirect !== null && parsedDirect !== undefined) {
    return { value: parsedDirect, invalid: false };
  }
  const fromPayload = extractMontageDatumFromBemerkungPayload(b.bemerkung);
  if (fromPayload) return { value: fromPayload, invalid: false };
  if (parsedDirect === null) return { value: null, invalid: false };
  return { value: null, invalid: false };
}

/**
 * @param {any} row
 */
function mapCcInternAuftrag(row) {
  return {
    id: row.id,
    auftragsnummer: row.auftragsnummer,
    kunde: row.kunde,
    status: row.status ?? null,
    schritt: row.schritt ?? null,
    prioritaet: row.prioritaet ?? null,
    lieferdatum: row.lieferdatum ?? null,
    montage_datum: row.montage_datum ?? null,
    bemerkung: row.bemerkung ?? null,
    fusa_auftrag_id: row.fusa_auftrag_id ?? null,
    quelle: row.quelle ?? 'manuell',
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
    erstellt_von: row.erstellt_von ?? null,
    firma_id: row.firma_id ?? null,
  };
}

/**
 * @param {any} row
 */
function mapCcInternAuftragKommentar(row) {
  return {
    id: row.id,
    auftrag_id: row.auftrag_id,
    text: row.text,
    autor_id: row.autor_id ?? null,
    erstellt_am: row.erstellt_am,
  };
}

const CCINTERN_DATEI_TYP_SET = new Set([
  'layout_grafik',
  'druckdatei',
  'kundenfreigabe',
  'montagefoto',
  'entwurf',
  'vorher',
  'nachher',
]);

const CCINTERN_DATEI_MAX_BYTES = 15 * 1024 * 1024;

const ccinternDateiUploadMulter = createMulterMemory({
  limits: { fileSize: CCINTERN_DATEI_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase().trim();
    if (mt === 'image/jpeg' || mt === 'image/png' || mt === 'application/pdf') return cb(null, true);
    const err = new Error('UNSUPPORTED_MEDIA_TYPE');
    return cb(err, false);
  },
});

/**
 * @param {unknown} raw
 */
function normalizeCcInternDateiTyp(raw) {
  const t = String(raw || '')
    .trim()
    .toLowerCase();
  return CCINTERN_DATEI_TYP_SET.has(t) ? t : '';
}

/**
 * @param {any} row
 * @param {string} [auftragIdCanon]
 */
function mapCcInternAuftragDatei(row, auftragIdCanon) {
  const aid = String(auftragIdCanon || row.auftrag_id || '').trim();
  const id = String(row.id || '').trim();
  const base = `/api/v1/ccintern/auftraege/${encodeURIComponent(aid)}/dateien/${encodeURIComponent(id)}/content`;
  return {
    id: row.id,
    project_id: row.project_id ?? null,
    auftrag_id: row.auftrag_id,
    kunde_id: row.kunde_id ?? null,
    typ: row.typ,
    bereich: row.bereich ?? null,
    phase: row.phase ?? null,
    position: row.position ?? null,
    filename: row.filename,
    originalname: row.originalname,
    mimetype: row.mimetype,
    size: Number(row.size ?? 0),
    server_path: row.server_path,
    public_url: base,
    uploaded_by: row.uploaded_by ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at ?? null,
  };
}

/**
 * @param {any} row
 */
function mapKalenderTermin(row) {
  let mitarbeiterIds = [];
  try {
    const a = JSON.parse(String(row?.mitarbeiter_ids ?? '[]'));
    if (Array.isArray(a)) {
      mitarbeiterIds = a.map((x) => String(x || '').trim()).filter(Boolean);
    }
  } catch {
    mitarbeiterIds = [];
  }
  return {
    id: row.id,
    titel: row.titel,
    start: row.start,
    ende: row.ende ?? null,
    ganztag: Number(row.ganztag) === 1 || row.ganztag === true,
    typ: row.typ ?? 'allgemein',
    quelle: row.quelle ?? 'manuell',
    mitarbeiter_ids: mitarbeiterIds,
    auftrag_id: row.auftrag_id ?? null,
    fusa_auftrag_id: row.fusa_auftrag_id ?? null,
    farbe: row.farbe ?? null,
    notiz: row.notiz ?? null,
    firma_id: row.firma_id ?? null,
    erstellt_von: row.erstellt_von ?? null,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

/**
 * @param {unknown} raw
 * @returns {Record<string, unknown>|null}
 */
function parseCcInternBemerkungPayload(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s.startsWith('{"__ccintern_v1"')) return null;
  try {
    const o = JSON.parse(s);
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
    if (o.__ccintern_v1 !== 1) return null;
    const p = o.payload;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return null;
    return /** @type {Record<string, unknown>} */ (p);
  } catch {
    return null;
  }
}

/**
 * @param {Record<string, unknown>|null} payload
 * @returns {{ mitarbeiter: string[]; verantwortlich: string|null; fahrzeug: string|null; standort: string|null }}
 */
function deriveCcInternDetailFieldsFromPayload(payload) {
  /** @type {string[]} */
  const mitarbeiter = [];
  let verantwortlich = null;
  let fahrzeug = null;
  let standort = null;
  if (!payload) {
    return { mitarbeiter, verantwortlich, fahrzeug, standort };
  }
  const stepsRaw = payload.schritte;
  if (stepsRaw && typeof stepsRaw === 'object' && !Array.isArray(stepsRaw)) {
    const steps = /** @type {Record<string, unknown>} */ (stepsRaw);
    const mRaw = steps.montage;
    if (mRaw && typeof mRaw === 'object' && !Array.isArray(mRaw)) {
      const m = /** @type {Record<string, unknown>} */ (mRaw);
      const verantwortlicherName =
        m.verantwortlicherName != null ? String(m.verantwortlicherName).trim() : '';
      const wer = m.wer != null ? String(m.wer).trim() : '';
      verantwortlich = verantwortlicherName || wer || null;
      if (verantwortlich) mitarbeiter.push(verantwortlich);
    }
  }
  const teamRaw = payload.mitarbeiter;
  if (Array.isArray(teamRaw)) {
    for (const x of teamRaw) {
      const s = x != null ? String(x).trim() : '';
      if (s) mitarbeiter.push(s);
    }
  }
  const fzDirect = payload.fahrzeug != null ? String(payload.fahrzeug).trim() : '';
  const fzName = payload.fahrzeugName != null ? String(payload.fahrzeugName).trim() : '';
  const kennzeichen = payload.kennzeichen != null ? String(payload.kennzeichen).trim() : '';
  fahrzeug = fzDirect || fzName || kennzeichen || null;
  const standortDirect = payload.standort != null ? String(payload.standort).trim() : '';
  const depot = payload.depot != null ? String(payload.depot).trim() : '';
  const ort = payload.ort != null ? String(payload.ort).trim() : '';
  standort = standortDirect || depot || ort || null;
  const mitarbeiterUnique = [...new Set(mitarbeiter.map((x) => String(x).trim()).filter(Boolean))];
  return { mitarbeiter: mitarbeiterUnique, verantwortlich, fahrzeug, standort };
}

/**
 * Kalender-Read: CC-Intern-Montage um Status/Referenz aus dem führenden Auftrag ergänzen (keine zweite Datenquelle).
 * @param {object} store
 * @param {any} row — Rohzeile kalender_termine
 */
async function mapKalenderTerminWithCcInternAuftragContext(store, row) {
  const base = mapKalenderTermin(row);
  const quelle = String(base.quelle || '');
  const typ = String(base.typ || '');
  const auftragId = base.auftrag_id != null ? String(base.auftrag_id).trim() : '';
  const firmaId = base.firma_id != null ? String(base.firma_id).trim() : '';
  if (quelle !== 'ccintern' || typ !== 'montage' || !auftragId || !firmaId) {
    return { ...base, referenz_id: base.auftrag_id ?? null, status: null };
  }
  try {
    const a = await store.getCcInternAuftragById(auftragId, firmaId);
    if (!a) {
      return {
        ...base,
        referenz_id: auftragId,
        status: null,
        project_id: 'auftraege-kalender',
      };
    }
    const payload = parseCcInternBemerkungPayload(a.bemerkung);
    const ext = deriveCcInternDetailFieldsFromPayload(payload);
    const kunde = a.kunde != null && String(a.kunde).trim() !== '' ? String(a.kunde).trim() : null;
    const mitarbeiterNamen = ext.mitarbeiter.length ? ext.mitarbeiter : [];
    return {
      ...base,
      referenz_id: auftragId,
      status: a.status ?? null,
      auftragsnummer: a.auftragsnummer ?? null,
      project_id: 'auftraege-kalender',
      kunde,
      kundenname: kunde,
      firma: kunde,
      mitarbeiter: mitarbeiterNamen.length ? mitarbeiterNamen.join(', ') : null,
      mitarbeiterName: mitarbeiterNamen.length ? mitarbeiterNamen.join(', ') : null,
      mitarbeiter_namen: mitarbeiterNamen,
      verantwortlich: ext.verantwortlich,
      verantwortlicher: ext.verantwortlich,
      verantwortlicherName: ext.verantwortlich,
      fahrzeug: ext.fahrzeug,
      fahrzeugName: ext.fahrzeug,
      kennzeichen: ext.fahrzeug,
      standort: ext.standort,
      depot: ext.standort,
      ort: ext.standort,
    };
  } catch {
    return {
      ...base,
      referenz_id: auftragId,
      status: null,
      project_id: 'auftraege-kalender',
    };
  }
}

/**
 * @param {any} row
 */
function mapUrlaub(row) {
  /** @type {string[]} */
  let kalenderTerminIds = [];
  const rawIds = row.kalender_termin_ids != null ? String(row.kalender_termin_ids).trim() : '';
  if (rawIds) {
    try {
      const j = JSON.parse(rawIds);
      if (Array.isArray(j)) kalenderTerminIds = j.map((x) => String(x || '').trim()).filter(Boolean);
    } catch {
      kalenderTerminIds = [];
    }
  }
  if (kalenderTerminIds.length === 0 && row.kalender_termin_id != null && String(row.kalender_termin_id).trim() !== '') {
    kalenderTerminIds = [String(row.kalender_termin_id).trim()];
  }
  return {
    id: row.id,
    mitarbeiter_id: row.mitarbeiter_id,
    mitarbeiter_name: row.mitarbeiter_name ?? null,
    von: row.von,
    bis: row.bis,
    tage: Number(row.tage),
    typ: row.typ,
    status: row.status,
    bemerkung: row.bemerkung ?? null,
    entschieden_von: row.entschieden_von ?? null,
    entschieden_am: row.entschieden_am ?? null,
    kalender_termin_id: row.kalender_termin_id ?? null,
    kalender_termin_ids: kalenderTerminIds,
    firma_id: row.firma_id,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

/**
 * @param {any} row
 */
function mapLagerMaterial(row) {
  return {
    id: row.id,
    name: row.name,
    kategorie: row.kategorie ?? null,
    menge: Number(row.menge || 0),
    einheit: row.einheit,
    mindestbestand: Number(row.mindestbestand || 0),
    artikelnummer: row.artikelnummer != null && String(row.artikelnummer).trim() !== '' ? String(row.artikelnummer).trim() : null,
    lagerort: row.lagerort ?? null,
    firma_id: row.firma_id,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

/**
 * @param {any} row
 */
function mapLagerBuchung(row) {
  return {
    id: row.id,
    material_id: row.material_id,
    menge: Number(row.menge || 0),
    typ: row.typ,
    mitarbeiter_id: row.mitarbeiter_id ?? null,
    auftrag_id: row.auftrag_id ?? null,
    bemerkung: row.bemerkung ?? null,
    erstellt_am: row.erstellt_am,
  };
}

/**
 * @param {any} row
 */
function mapAnfrage(row) {
  return {
    id: row.id,
    anfragen_nr: row.anfragen_nr,
    kunde_id: row.kunde_id ?? null,
    kunde_name: row.kunde_name ?? null,
    betreff: row.betreff,
    beschreibung: row.beschreibung ?? null,
    status: row.status,
    zugewiesen_an: row.zugewiesen_an ?? null,
    zugewiesen_name: row.zugewiesen_name ?? null,
    antwort_bis: row.antwort_bis ?? null,
    firma_id: row.firma_id,
    erstellt_von: row.erstellt_von ?? null,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

/**
 * @param {any} row
 */
function mapAufgabe(row) {
  return {
    id: row.id,
    titel: row.titel,
    beschreibung: row.beschreibung ?? null,
    zugewiesen_an: row.zugewiesen_an ?? null,
    zugewiesen_name: row.zugewiesen_name ?? null,
    auftrag_id: row.auftrag_id ?? null,
    faellig_am: row.faellig_am ?? null,
    status: row.status,
    prioritaet: row.prioritaet,
    firma_id: row.firma_id,
    erstellt_von: row.erstellt_von ?? null,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

const CCINTERN_RECH_META_SEP = '\n\n__CCINTERN_RECH_V1__';

/**
 * @param {string|null|undefined} bemerkung
 * @returns {{ clean: string|null, meta: Record<string, unknown> }}
 */
function parseCcInternRechnungBemerkung(bemerkung) {
  const raw = bemerkung != null ? String(bemerkung) : '';
  const idx = raw.indexOf(CCINTERN_RECH_META_SEP);
  if (idx === -1) {
    const t = raw.trim();
    return { clean: t || null, meta: {} };
  }
  const clean = raw.slice(0, idx).trimEnd();
  let meta = {};
  try {
    const parsed = JSON.parse(raw.slice(idx + CCINTERN_RECH_META_SEP.length));
    if (parsed && typeof parsed === 'object') meta = /** @type {Record<string, unknown>} */ (parsed);
  } catch {
    meta = {};
  }
  return { clean: clean || null, meta };
}

/**
 * @param {string|null|undefined} cleanBemerkung
 * @param {Record<string, unknown>} body
 */
function buildCcInternRechnungBemerkungForStore(cleanBemerkung, body) {
  /** @type {Record<string, unknown>} */
  const meta = {};
  const aid = nullableTrimmed(body?.angebot_id);
  if (aid) meta.angebot_id = aid;
  const betreff = nullableTrimmed(body?.betreff);
  if (betreff) meta.betreff = betreff;
  const datum = nullableTrimmed(body?.datum);
  if (datum) meta.datum = datum;
  if (Array.isArray(body?.positionen)) meta.positionen = body.positionen;
  if (body?.netto != null && String(body.netto).trim() !== '') {
    const n = Number(body.netto);
    if (!Number.isNaN(n)) meta.netto = n;
  }
  if (body?.brutto != null && String(body.brutto).trim() !== '') {
    const b = Number(body.brutto);
    if (!Number.isNaN(b)) meta.brutto = b;
  }
  if (Object.keys(meta).length === 0) {
    const c = cleanBemerkung != null ? String(cleanBemerkung).trim() : '';
    return c || null;
  }
  const base = cleanBemerkung != null ? String(cleanBemerkung).trimEnd() : '';
  return (base ? base + CCINTERN_RECH_META_SEP : CCINTERN_RECH_META_SEP) + JSON.stringify(meta);
}

/**
 * @param {any} row
 */
function mapRechnung(row) {
  const { clean: bemerkungClean, meta } = parseCcInternRechnungBemerkung(row.bemerkung);
  return {
    id: row.id,
    rechnungsnummer: row.rechnungsnummer,
    auftrag_id: row.auftrag_id,
    auftragsnummer: row.auftragsnummer ?? null,
    kunde: row.kunde ?? null,
    status: row.status,
    faellig_am: row.faellig_am ?? null,
    bezahlt_am: row.bezahlt_am ?? null,
    bemerkung: bemerkungClean,
    firma_id: row.firma_id,
    erstellt_von: row.erstellt_von ?? null,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
    angebot_id: meta.angebot_id != null ? String(meta.angebot_id) : row.angebot_id != null ? String(row.angebot_id) : null,
    betreff: meta.betreff != null ? String(meta.betreff) : null,
    datum: meta.datum != null ? String(meta.datum) : null,
    positionen: Array.isArray(meta.positionen) ? meta.positionen : null,
    netto: meta.netto != null && !Number.isNaN(Number(meta.netto)) ? Number(meta.netto) : null,
    brutto: meta.brutto != null && !Number.isNaN(Number(meta.brutto)) ? Number(meta.brutto) : null,
  };
}

/**
 * @param {any} row
 */
function mapMesseflowDatei(row) {
  let meta = null;
  if (row.meta_json != null && String(row.meta_json).trim() !== '') {
    try {
      meta = JSON.parse(String(row.meta_json));
    } catch {
      meta = null;
    }
  }
  return {
    id: row.id,
    wand_id: row.wand_id,
    name: row.name,
    pfad: row.pfad ?? null,
    mime_type: row.mime_type ?? null,
    groesse: row.groesse != null ? Number(row.groesse) : null,
    status: row.status ?? null,
    bemerkung: row.bemerkung ?? null,
    meta: meta,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
  };
}

/**
 * @param {any} row
 * @param {any[]} dateien
 */
function mapMesseflowWand(row, dateien) {
  return {
    id: row.id,
    projekt_id: row.projekt_id,
    name: row.name,
    breite: row.breite != null ? Number(row.breite) : null,
    hoehe: row.hoehe != null ? Number(row.hoehe) : null,
    einheit: row.einheit ?? null,
    material: row.material ?? null,
    status: row.status ?? null,
    bemerkung: row.bemerkung ?? null,
    sort_index: Number(row.sort_index || 0),
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
    dateien,
  };
}

/**
 * @param {any} row
 * @param {any[]} waende
 */
function mapMesseflowProjekt(row, waende) {
  return {
    id: row.id,
    name: row.name,
    kunde: row.kunde ?? null,
    agentur_id: row.agentur_id ?? null,
    agentur_name: row.agentur_name ?? null,
    lieferdatum: row.lieferdatum ?? null,
    status: row.status,
    messe: row.messe ?? null,
    stand: row.stand ?? null,
    prioritaet: row.prioritaet ?? null,
    bemerkung: row.bemerkung ?? null,
    firma_id: row.firma_id,
    erstellt_von: row.erstellt_von ?? null,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am ?? row.erstellt_am,
    waende,
  };
}

/**
 * @param {object} store
 */
export function createApiV1Router(store) {
  const router = Router();

  /**
   * Öffentlicher Link zur Einladungsaktivierung (`GET/POST /invites/:token` auf dem App-Server, nicht unter `/api/v1`).
   * Ohne gesetzte Basis-URL: relativer Pfad (Frontend kann mit eigener Origin kombinieren).
   *
   * Lokal: Wenn der Browser `Origin`/`Referer` von localhost (o. 127.0.0.1) sendet, diese Basis nutzen
   * (Vite-Port z. B. 3001), damit Einladungslinks nicht an Production-Env hängen bleiben.
   */
  function invitePublicBaseFromRequest(req) {
    if (!req || typeof req.get !== 'function') return '';
    const tryUrl = (raw) => {
      if (raw == null || String(raw).trim() === '') return '';
      try {
        const u = new URL(String(raw).trim());
        const h = u.hostname.toLowerCase();
        if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') {
          return u.origin.replace(/\/+$/, '');
        }
      } catch {
        /* ignore */
      }
      return '';
    };
    const fromOrigin = tryUrl(req.get('origin'));
    if (fromOrigin) return fromOrigin;
    return tryUrl(req.get('referer'));
  }

  function buildInviteUrl(token, req) {
    const safeToken = encodeURIComponent(String(token || '').trim());
    if (!safeToken) return '/invites/';
    const localBase = invitePublicBaseFromRequest(req);
    const base = localBase
      ? localBase
      : String(
            process.env.COCKPIT_PUBLIC_URL ||
              process.env.FRONTEND_URL ||
              process.env.PUBLIC_APP_BASE_URL ||
              process.env.APP_BASE_URL ||
              '',
          )
            .trim()
            .replace(/\/+$/, '');
    return base ? `${base}/?cc_invite=${safeToken}` : `/?cc_invite=${safeToken}`;
  }

  router.post(
    '/auth/refresh',
    express.json({ limit: '64kb' }),
    async (req, res, next) => {
      try {
        await handleAuthRefresh(store, req, res);
      } catch (e) {
        next(e);
      }
    },
  );

  const apiAuthProfile = [maybeAttachDevProvisionAuth(store), requireAuth, attachAccessProfile(store)];

  router.use(...apiAuthProfile, requireApiV1ProjectHeaderUnlessWhitelisted());

  registerMesseflowPruefProxyRoutes(router, apiAuthProfile);

  router.use('/logs', ...apiAuthProfile, createLogsRouter(store));

  router.use('/cockpit/dashboard', ...apiAuthProfile, createCockpitDashboardRouter(store));
  router.use('/fusa/dashboard', ...apiAuthProfile, createFusaDashboardRouter(store));
  router.use('/fusa/quartale', ...apiAuthProfile, createFusaQuartaleRouter(store));
  router.use('/ccintern/dashboard', ...apiAuthProfile, createCcinternDashboardRouter(store));

  const rollenSehen = chainMiddleware(requireModule('cockpit'), requireRight('cockpit', 'rollen', 'sehen'));
  const rollenBearbeiten = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'rollen', 'bearbeiten'),
  );
  const benutzerErstellen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'benutzer', 'erstellen'),
  );
  const firmenErstellen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'firmen', 'erstellen'),
  );
  const einladungenSehen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'einladungen', 'sehen'),
  );
  const einladungenErstellen = chainMiddleware(
    requireModule('cockpit'),
    requireRight('cockpit', 'einladungen', 'erstellen'),
  );
  const fusaKundenSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'kunden', 'sehen'));
  const fusaKundenBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'kunden', 'bearbeiten'),
  );
  const fusaAuftraegeSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'auftraege', 'sehen'));
  const fusaAuftraegeBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'auftraege', 'bearbeiten'),
  );
  const fusaFahrzeugeSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'fahrzeuge', 'sehen'));
  /** Verfügbarkeitsliste: gleicher fachlicher Bedarf wie Wizard (Auftrag anlegen/bearbeiten), plus reine Fahrzeug-Sicht. */
  const fusaVerfuegbareFahrzeugeListe = (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (!p.hasModule('fusa')) {
      return sendError(res, 403, 'MODULE_FORBIDDEN', 'Kein Zugriff auf Modul „fusa".');
    }
    if (
      p.has('fusa', 'auftraege', 'sehen') ||
      p.has('fusa', 'auftraege', 'erstellen') ||
      p.has('fusa', 'auftraege', 'bearbeiten') ||
      p.has('fusa', 'fahrzeuge', 'sehen')
    ) {
      return next();
    }
    return sendError(res, 403, 'RIGHT_FORBIDDEN', 'Unzureichende Berechtigung.');
  };
  const fusaRechnungenSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'rechnungen', 'sehen'));
  const fusaRechnungenBearbeiten = chainMiddleware(
    requireModule('fusa'),
    requireRight('fusa', 'rechnungen', 'bearbeiten'),
  );
  const fusaTermineSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'kalender', 'sehen'));
  const ccinternKundenSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'kunden', 'sehen'),
  );
  const ccinternKundenBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'kunden', 'bearbeiten'),
  );
  const ccinternAuftraegeSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'auftraege', 'sehen'),
  );
  const ccinternAuftraegeErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'auftraege', 'erstellen'),
  );
  const ccinternAuftraegeBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'auftraege', 'bearbeiten'),
  );
  const ccinternKalenderSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'kalender', 'sehen'),
  );
  const ccinternKalenderErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'kalender', 'erstellen'),
  );
  const ccinternKalenderBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'kalender', 'bearbeiten'),
  );
  const ccinternUrlaubSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'urlaub', 'sehen'),
  );
  const ccinternUrlaubErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'urlaub', 'erstellen'),
  );
  const ccinternUrlaubBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'urlaub', 'bearbeiten'),
  );
  const ccinternLagerSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'materiallager', 'sehen'),
  );
  const ccinternLagerErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'materiallager', 'erstellen'),
  );
  const ccinternLagerBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'materiallager', 'bearbeiten'),
  );
  const ccinternAnfragenSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'schnell_anfragen', 'sehen'),
  );
  const ccinternAnfragenErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'schnell_anfragen', 'erstellen'),
  );
  const ccinternAnfragenBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'schnell_anfragen', 'bearbeiten'),
  );
  const ccinternAufgabenSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'mitarbeiter', 'sehen'),
  );
  const ccinternAufgabenErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'mitarbeiter', 'erstellen'),
  );
  const ccinternAufgabenBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'mitarbeiter', 'bearbeiten'),
  );
  const ccinternRechnungenSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'rechnungen', 'sehen'),
  );
  const ccinternRechnungenErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'rechnungen', 'erstellen'),
  );
  const ccinternRechnungenBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'rechnungen', 'bearbeiten'),
  );
  const ccinternMesseflowSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'messeflow', 'sehen'),
  );
  const ccinternMesseflowErstellen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'messeflow', 'erstellen'),
  );
  const ccinternMesseflowBearbeiten = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'messeflow', 'bearbeiten'),
  );
  const messeflowWorkspaceSehen = chainMiddleware(
    requireModule('ccintern'),
    requireRight('ccintern', 'messeflow', 'sehen'),
  );
  const messeflowWorkspaceSchreiben = chainMiddleware(requireModule('ccintern'), (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (
      p.has('ccintern', 'messeflow', 'upload')
      || p.has('ccintern', 'messeflow', 'bearbeiten')
      || p.has('ccintern', 'messeflow', 'erstellen')
    ) {
      return next();
    }
    return sendError(res, 403, 'FORBIDDEN', 'Keine Berechtigung, den MesseFlow-Arbeitsbereich zu speichern.');
  });
  const kundeStammLesen = chainMiddleware(
    maybeAttachDevProvisionAuth(store),
    requireAuth,
    attachAccessProfile(store),
    (req, res, next) => {
      const p = req.accessProfile;
      if (!p) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
      }
      if (p.has('cockpit', 'firmen', 'sehen')) return next();
      if (p.has('fusa', 'kunden', 'sehen')) return next();
      if (p.has('ccintern', 'kunden', 'sehen')) return next();
      return sendError(res, 403, 'FORBIDDEN', 'Keine Berechtigung, Kunden-Stammdaten zu lesen.');
    },
  );

  /** @param {unknown} v */
  function jsonDbScalar(v) {
    if (v == null) return null;
    if (typeof v === 'bigint') return String(v);
    return v;
  }

  /**
   * Zeile aus {@link store.listFirmen} → gleiche JSON-Form wie GET /api/v1/firmen.
   * @param {object} r
   */
  function mapFirmaRowToFirmenApiJson(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      id: jsonDbScalar(r.id),
      name: r.name,
      kundennummer: jsonDbScalar(r.kundennummer),
      altnummer: r.altnummer ?? null,
      typ: r.typ ?? null,
      intern_extern: r.intern_extern ?? null,
      umsatzsteuer_id: r.umsatzsteuer_id ?? null,
      strasse: r.strasse ?? null,
      plz: r.plz ?? null,
      stadt: r.stadt ?? null,
      land: r.land ?? null,
      telefon: r.telefon ?? null,
      email: r.email ?? null,
      website: r.website ?? null,
      ansprechpartner_anrede: r.ansprechpartner_anrede ?? null,
      ansprechpartner_vorname: r.ansprechpartner_vorname ?? null,
      ansprechpartner_nachname: r.ansprechpartner_nachname ?? null,
      ansprechpartner_email: r.ansprechpartner_email ?? null,
      ansprechpartner_telefon: r.ansprechpartner_telefon ?? null,
      interne_notiz: r.interne_notiz ?? null,
      status: r.status ?? null,
      created_at: r.created_at,
    };
  }

  /**
   * @param {object} r
   */
  function parseErweiterungJsonFromRow(r) {
    if (!r || r.erweiterung_json == null || String(r.erweiterung_json).trim() === '') return {};
    try {
      const o = JSON.parse(String(r.erweiterung_json));
      return o && typeof o === 'object' ? o : {};
    } catch {
      return {};
    }
  }

  /**
   * @param {object} r
   */
  function mapFirmaRowToKundeJson(r) {
    if (!r || typeof r !== 'object') return null;
    const ex = parseErweiterungJsonFromRow(r);
    const weitere = Array.isArray(ex.weitere_ansprechpartner) ? ex.weitere_ansprechpartner : [];
    const ejRaw = r.erweiterung_json != null && String(r.erweiterung_json).trim() !== '' ? String(r.erweiterung_json).trim() : null;
    return {
      id: jsonDbScalar(r.id),
      name: r.name ?? null,
      kundennummer: jsonDbScalar(r.kundennummer),
      altnummer: r.altnummer ?? null,
      typ: r.typ ?? null,
      intern_extern: r.intern_extern ?? null,
      umsatzsteuer_id: r.umsatzsteuer_id ?? null,
      strasse: r.strasse ?? null,
      plz: r.plz ?? null,
      stadt: r.stadt ?? null,
      bundesland: ex.bundesland != null ? String(ex.bundesland) : null,
      land: r.land ?? null,
      telefon: r.telefon ?? null,
      fax: ex.fax != null ? String(ex.fax) : null,
      email: r.email ?? null,
      website: r.website ?? null,
      ansprechpartner_anrede: r.ansprechpartner_anrede ?? null,
      ansprechpartner_vorname: r.ansprechpartner_vorname ?? null,
      ansprechpartner_nachname: r.ansprechpartner_nachname ?? null,
      haupt_position: ex.haupt_position != null ? String(ex.haupt_position) : null,
      haupt_abteilung: ex.haupt_abteilung != null ? String(ex.haupt_abteilung) : null,
      ansprechpartner_email: r.ansprechpartner_email ?? null,
      ansprechpartner_telefon: r.ansprechpartner_telefon ?? null,
      weitere_ansprechpartner: weitere,
      interne_notiz: r.interne_notiz ?? null,
      status: r.status ?? null,
      created_at: r.created_at ?? null,
      fusa_segment: r.fusa_segment != null ? String(r.fusa_segment) : null,
      fusa_hinweis: r.fusa_hinweis != null ? String(r.fusa_hinweis) : null,
      ccintern_crm_status: r.ccintern_crm_status != null ? String(r.ccintern_crm_status) : null,
      ccintern_betreuer: r.ccintern_betreuer != null ? String(r.ccintern_betreuer) : null,
      ccintern_extra_updated_at:
        r.ccintern_extra_updated_at != null ? String(r.ccintern_extra_updated_at) : null,
      erweiterung_json: ejRaw,
    };
  }

  /**
   * Sichtbarkeit: gleiche Datenbasis, modulabhängige Freigabe (keine Interna ohne Cockpit-Firmenrecht).
   * @param {import('../auth/access-profile.js').AccessProfile|null|undefined} profile
   * @param {ReturnType<typeof mapFirmaRowToKundeJson>} kunde
   * @param {ReturnType<typeof buildKundenStammDetailEnvelope>} detail
   */
  function redactKundenStammForAccessProfile(profile, kunde, detail) {
    const p = profile;
    if (!p || !kunde || !detail) {
      return { kunde, detail };
    }
    const cockpitFirmen = p.has('cockpit', 'firmen', 'sehen');
    const fusaKunden = p.has('fusa', 'kunden', 'sehen');
    const ccinternKunden = p.has('ccintern', 'kunden', 'sehen');
    /** @type {typeof kunde} */
    const k = { ...kunde };
    /** @type {typeof detail} */
    const d = {
      ...detail,
      stamm: { ...detail.stamm },
      erweiterung_zusatz: { ...detail.erweiterung_zusatz },
      fusa_extra: { ...detail.fusa_extra },
      ccintern_extra: { ...detail.ccintern_extra },
      aktivitaeten: Array.isArray(detail.aktivitaeten) ? [...detail.aktivitaeten] : [],
    };
    if (!cockpitFirmen) {
      k.interne_notiz = null;
    }
    if (!cockpitFirmen && !fusaKunden) {
      k.fusa_segment = null;
      k.fusa_hinweis = null;
      d.fusa_extra = { segment: null, hinweis: null };
    }
    if (!cockpitFirmen && !ccinternKunden) {
      k.ccintern_crm_status = null;
      k.ccintern_betreuer = null;
      k.ccintern_extra_updated_at = null;
      d.ccintern_extra = { crm_status: null, betreuer: null, updated_at: null };
    }
    return { kunde: k, detail: d };
  }

  /**
   * @param {object} body
   * @param {object} existingEx
   */
  function mergeErweiterungFromBody(body, existingEx) {
    const ex = { ...existingEx };
    const pick = (key, bodyKey = key) => {
      if (!Object.prototype.hasOwnProperty.call(body || {}, bodyKey)) return;
      const raw = /** @type {any} */ (body)[bodyKey];
      if (raw == null || (typeof raw === 'string' && raw.trim() === '')) {
        delete ex[key];
        return;
      }
      ex[key] = typeof raw === 'string' ? raw.trim() : raw;
    };
    pick('fax', 'fax');
    pick('bundesland', 'bundesland');
    pick('haupt_position', 'haupt_position');
    pick('haupt_abteilung', 'haupt_abteilung');
    if (Object.prototype.hasOwnProperty.call(body || {}, 'weitere_ansprechpartner')) {
      const arr = /** @type {unknown} */ (body).weitere_ansprechpartner;
      if (Array.isArray(arr)) {
        ex.weitere_ansprechpartner = arr.filter(x => x && typeof x === 'object');
      } else {
        delete ex.weitere_ansprechpartner;
      }
    }
    for (const k of Object.keys(ex)) {
      const v = /** @type {any} */ (ex)[k];
      if (v == null || v === '') delete ex[k];
      else if (Array.isArray(v) && v.length === 0) delete ex[k];
      else if (typeof v === 'string' && v.trim() === '') delete ex[k];
    }
    return Object.keys(ex).length > 0 ? JSON.stringify(ex) : null;
  }

  router.get('/auth/my-rights', ...apiAuthProfile, async (req, res, next) => {
    try {
      const ap = accessProfileToJson(req.accessProfile);
      return sendSuccess(res, 200, {
        user_id: req.auth.userId,
        global_role: ap.global_role,
        modules: ap.modules,
        rights: ap.rights,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/users', ...apiAuthProfile, requireCockpitBenutzerSehenOrMitarbeiterAppSelfList(), async (req, res, next) => {
    try {
      const p = req.accessProfile;
      /** @type {Awaited<ReturnType<typeof store.listUsers>>} */
      let rows;
      if (canListAllUsersForApi(p)) {
        rows = await store.listUsers();
      } else {
        const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
        const one = uid ? await store.getUserById(uid) : null;
        rows = one ? [one] : [];
      }
      const users = rows.map((u) => {
        const { soll, urlaub } = userRowSollUrlaub(u);
        return {
          id: u.id,
          email: u.email,
          name: u.name ?? null,
          kuerzel: String(u.kuerzel || '').trim().toUpperCase(),
          global_role: u.global_role ?? 'INTERN',
          companyId: u.company_id ?? null,
          modules: parseModulesCsv(u.modules_csv),
          soll,
          urlaub,
          created_at: u.created_at,
        };
      });
      return sendSuccess(res, 200, { users });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/users', ...apiAuthProfile, benutzerErstellen, async (req, res, next) => {
    try {
      const emailRaw = req.body?.email;
      const nameRaw = req.body?.name;
      if (typeof emailRaw !== 'string' || !normalizeApiEmail(emailRaw)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „email“ ist erforderlich.');
      }
      const email = normalizeApiEmail(emailRaw);
      if (await store.userExistsByEmail(email)) {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Ein Benutzer mit dieser E-Mail existiert bereits.',
        );
      }
      if (!Array.isArray(req.body?.modules)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein Array sein.');
      }
      if (!req.body?.rights || typeof req.body.rights !== 'object') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „rights“ muss ein Objekt sein.');
      }
      const gr = isValidGlobalRole(req.body?.global_role) ? req.body.global_role : 'INTERN';
      if (gr === 'SUPER_ADMIN' && !req.accessProfile?.isSuperAdmin()) {
        return sendError(
          res,
          403,
          'FORBIDDEN',
          'Nur SUPER_ADMIN kann Benutzer mit Rolle SUPER_ADMIN anlegen.',
        );
      }
      const coPost = parseCompanyIdFromBody(req.body);
      /** @type {string|null} */
      let companyIdToSet = null;
      if (gr === 'INTERN' || gr === 'EXTERN' || gr === 'MITARBEITER') {
        if (!coPost.present || !coPost.value) {
          return sendError(
            res,
            400,
            'COMPANY_REQUIRED',
            'Für Rolle INTERN, EXTERN oder MITARBEITER ist company_id erforderlich.',
          );
        }
        const firmaOk = await store.getFirmaById(coPost.value);
        if (!firmaOk) {
          return sendError(res, 400, 'INVALID_COMPANY', 'Firma nicht gefunden.');
        }
        companyIdToSet = coPost.value;
      } else if (gr === 'SUPER_ADMIN') {
        if (coPost.present && coPost.value) {
          const firmaOk = await store.getFirmaById(coPost.value);
          if (!firmaOk) {
            return sendError(res, 400, 'INVALID_COMPANY', 'Firma nicht gefunden.');
          }
          companyIdToSet = coPost.value;
        }
      }
      const modules = req.body.modules.filter((m) => isValidModuleKey(m));
      if (modules.length === 0) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Mindestens ein gültiges Modul (cockpit, fusa, ccintern) ist erforderlich.',
        );
      }
      const base = expandRightsForModuleList(modules, {});
      const merged = mergeRightsPatch(base, req.body.rights);
      const rights = expandRightsForModuleList(modules, merged);
      const id = randomUUID();
      const tempSecret = randomBytes(32).toString('base64url');
      const name =
        typeof nameRaw === 'string' && nameRaw.trim() !== '' ? nameRaw.trim() : null;
      const insertOpts = { id, email, passwordHash: hashPassword(tempSecret), name, globalRole: gr };
      try {
        applySollUrlaubFromBody(req.body, insertOpts);
      } catch (e) {
        if (/** @type {{ code?: string }} */ (e).code === 'VALIDATION_SOLL') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'soll muss eine Zahl zwischen 0 und 400 sein.');
        }
        if (/** @type {{ code?: string }} */ (e).code === 'VALIDATION_URLAUB') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'urlaub muss eine Zahl zwischen 0 und 365 sein.');
        }
        throw e;
      }
      await store.insertUser(insertOpts);
      await store.replaceUserAccessBundle({ userId: id, globalRole: gr, modules, rights });
      if (companyIdToSet != null && String(companyIdToSet).trim() !== '') {
        await store.updateUserCompany(id, companyIdToSet);
      } else if (gr === 'SUPER_ADMIN' && coPost.present && !coPost.value) {
        await store.updateUserCompany(id, null);
      }
      const createdRow = await store.getUserById(id);
      const su = userRowSollUrlaub(createdRow);
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'user',
        resource_id: id,
        project_id: null,
        payload: { email, company_id: coPost.present ? coPost.value : undefined },
      });
      return sendSuccess(res, 201, {
        user: {
          id,
          email,
          name,
          global_role: gr,
          companyId: createdRow.company_id ?? null,
          modules,
          soll: su.soll,
          urlaub: su.urlaub,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/users/:id', ...apiAuthProfile, benutzerErstellen, async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(id);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const co = parseCompanyIdFromBody(req.body || {});
      const intendedCompany = co.present
        ? co.value && String(co.value).trim()
          ? String(co.value).trim()
          : null
        : existing.company_id != null && String(existing.company_id).trim() !== ''
          ? String(existing.company_id).trim()
          : null;
      const effRole =
        Object.prototype.hasOwnProperty.call(req.body || {}, 'global_role') &&
        isValidGlobalRole(req.body?.global_role)
          ? String(req.body.global_role).trim()
          : String(existing.global_role || 'INTERN').trim();
      if (co.present && intendedCompany) {
        const firmaRow = await store.getFirmaById(intendedCompany);
        if (!firmaRow) {
          return sendError(res, 400, 'INVALID_COMPANY', 'Firma nicht gefunden.');
        }
      }
      if ((effRole === 'INTERN' || effRole === 'EXTERN' || effRole === 'MITARBEITER') && !intendedCompany) {
        return sendError(
          res,
          400,
          'COMPANY_REQUIRED',
          'Für Rolle INTERN, EXTERN oder MITARBEITER ist eine gültige company_id erforderlich.',
        );
      }
      /** @type {{ name?: string|null, global_role?: string, status?: string, soll?: number, urlaub?: number }} */
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) {
        const raw = req.body.name;
        patch.name = raw == null || String(raw).trim() === '' ? null : String(raw).trim();
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'global_role')) {
        const g = req.body.global_role;
        if (isValidGlobalRole(g)) {
          if (g === 'SUPER_ADMIN' && !req.accessProfile?.isSuperAdmin()) {
            return sendError(
              res,
              403,
              'FORBIDDEN',
              'Nur SUPER_ADMIN kann die Rolle SUPER_ADMIN setzen.',
            );
          }
          patch.global_role = g;
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        patch.status = req.body.status === 'deaktiviert' ? 'deaktiviert' : 'aktiv';
      }
      try {
        applySollUrlaubFromBody(req.body, patch);
      } catch (e) {
        if (/** @type {{ code?: string }} */ (e).code === 'VALIDATION_SOLL') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'soll muss eine Zahl zwischen 0 und 400 sein.');
        }
        if (/** @type {{ code?: string }} */ (e).code === 'VALIDATION_URLAUB') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'urlaub muss eine Zahl zwischen 0 und 365 sein.');
        }
        throw e;
      }
      if (Object.keys(patch).length === 0 && !co.present) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }
      let updated;
      if (Object.keys(patch).length > 0) {
        updated = await store.updateUserProfile(id, patch);
        if (!updated) {
          return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
        }
      } else {
        updated = existing;
      }
      if (co.present) {
        const cid = co.value && String(co.value).trim() ? String(co.value).trim() : null;
        await store.updateUserCompany(id, cid);
      }
      updated = await store.getUserById(id);
      if (!updated) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const modRows = await store.listUserModules(id);
      const modules = modRows.map((m) => /** @type {{ module: string }} */ (m).module);
      const su = userRowSollUrlaub(updated);
      const auditKeys = [...Object.keys(patch)];
      if (co.present) auditKeys.push('company_id');
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'PATCH',
        resource_type: 'user',
        resource_id: id,
        project_id: null,
        payload: { keys: auditKeys },
      });
      return sendSuccess(res, 200, {
        user: {
          id: updated.id,
          email: updated.email,
          name: updated.name ?? null,
          global_role: updated.global_role ?? 'INTERN',
          companyId: updated.company_id ?? null,
          modules,
          soll: su.soll,
          urlaub: su.urlaub,
          created_at: updated.created_at,
        },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/users/:id', ...apiAuthProfile, benutzerErstellen, async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      if (id === req.auth.userId) {
        return sendError(res, 403, 'FORBIDDEN', 'Das eigene Konto kann nicht gelöscht werden.');
      }
      const existing = await store.getUserById(id);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const ok = await store.deleteUserById(id);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'DELETE',
        resource_type: 'user',
        resource_id: id,
        project_id: null,
        payload: null,
      });
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      return next(e);
    }
  });

  /** Vorher nur unter entfernten Root-`/users/*`-Routen; Kanon: `/api/v1/users/...`. */
  router.patch('/users/:id/access', ...apiAuthProfile, requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const gr = req.body?.global_role;
      if (!isValidGlobalRole(gr)) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Feld „global_role“ muss SUPER_ADMIN, INTERN, EXTERN oder MITARBEITER sein.',
        );
      }
      if (!Array.isArray(req.body?.modules)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein Array sein.');
      }
      if (!req.body?.rights || typeof req.body.rights !== 'object') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „rights“ muss ein Objekt sein.');
      }
      /** @type {string[]} */
      const modules = [];
      const seenMod = new Set();
      for (const m of req.body.modules) {
        if (typeof m !== 'string') continue;
        const x = m.trim().toLowerCase();
        if (!isValidModuleKey(x)) continue;
        if (seenMod.has(x)) continue;
        seenMod.add(x);
        modules.push(x);
      }
      if (modules.length === 0) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Mindestens ein gültiges Modul (cockpit, fusa, ccintern) ist erforderlich — leere Zuweisung wird abgelehnt.',
        );
      }
      const { rights: rightsPartial } = normalizeInviteAccessForRedeem([], req.body.rights);
      const rights = expandRightsForModuleList(modules, rightsPartial);
      await store.replaceUserAccessBundle({
        userId: uid,
        globalRole: gr,
        modules,
        rights,
      });
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'PATCH',
        resource_type: 'user_access',
        resource_id: uid,
        project_id: null,
        payload: { global_role: gr, modules_count: modules.length },
      });
      return sendSuccess(res, 200, {});
    } catch (e) {
      return next(e);
    }
  });

  router.post('/users/:id/lock-toggle', ...apiAuthProfile, requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const now = String(existing.status || 'aktiv').toLowerCase();
      const nextStatus = now === 'deaktiviert' ? 'aktiv' : 'deaktiviert';
      await store.updateUserStatus(uid, nextStatus);
      return sendSuccess(res, 200, { status: nextStatus });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/users/:id/reset-password', ...apiAuthProfile, requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const existing = await store.getUserById(uid);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const tempPassword = `CC-${randomBytes(6).toString('base64url')}`;
      const passwordHash = hashPassword(tempPassword);
      await store.updateUserPasswordHash(uid, passwordHash);
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'user_password_reset',
        resource_id: uid,
        project_id: null,
        payload: { issued_temporary_password: true },
      });
      return sendSuccess(res, 200, { temporary_password: tempPassword });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/firmen', ...apiAuthProfile, requireCockpitFirmenSehenOrMitarbeiterAppOwnFirma(), async (req, res) => {
    try {
      const p = req.accessProfile;
      /** @type {Awaited<ReturnType<typeof store.listFirmen>>} */
      let rows;
      if (canListAllFirmenForApi(p)) {
        rows = await store.listFirmen();
      } else {
        const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
        const urow = uid ? await store.getUserById(uid) : null;
        const cid = urow?.company_id != null ? String(urow.company_id).trim() : '';
        if (!cid) {
          rows = [];
        } else {
          const f = await store.getFirmaById(cid);
          rows = f ? [f] : [];
        }
      }
      const firmen = rows.map((r) => mapFirmaRowToFirmenApiJson(r)).filter(Boolean);
      return sendSuccess(res, 200, { firmen });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/firmen/:id', ...apiAuthProfile, requireCockpitFirmenSehenOrMitarbeiterAppOwnFirma(), async (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Firmen-ID.');
      }
      const p = req.accessProfile;
      if (!canListAllFirmenForApi(p)) {
        const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
        const urow = uid ? await store.getUserById(uid) : null;
        const cid = urow?.company_id != null ? String(urow.company_id).trim() : '';
        if (!cid || cid !== id) {
          return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff auf diese Firma.');
        }
      }
      let row = await store.getFirmaKundeStammById(id);
      if (!row) {
        const basic = await store.getFirmaById(id);
        if (basic) {
          row = { ...basic, fusa_segment: null, fusa_hinweis: null };
        }
      }
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
      }
      const firma = mapFirmaRowToKundeJson(row);
      if (!firma) {
        return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
      }
      const detailRaw = buildKundenStammDetailEnvelope(row);
      const { detail } = redactKundenStammForAccessProfile(req.accessProfile, firma, detailRaw);
      return sendSuccess(res, 200, { firma, detail });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/firmen', ...apiAuthProfile, firmenErstellen, async (req, res) => {
    try {
      const nameRaw = req.body?.name;
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const id = randomUUID();
      const typ = typeof req.body?.typ === 'string' ? req.body.typ.trim() : '';
      const internExtern =
        typeof req.body?.intern_extern === 'string' ? req.body.intern_extern.trim() : '';
      const altnummer = typeof req.body?.altnummer === 'string' ? req.body.altnummer.trim() : '';
      const umsatzsteuerId =
        typeof req.body?.umsatzsteuer_id === 'string' ? req.body.umsatzsteuer_id.trim() : '';
      const strasse = typeof req.body?.strasse === 'string' ? req.body.strasse.trim() : '';
      const plz = typeof req.body?.plz === 'string' ? req.body.plz.trim() : '';
      const stadt = typeof req.body?.stadt === 'string' ? req.body.stadt.trim() : '';
      const land = typeof req.body?.land === 'string' ? req.body.land.trim() : 'Deutschland';
      const telefon = typeof req.body?.telefon === 'string' ? req.body.telefon.trim() : '';
      const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
      const website = typeof req.body?.website === 'string' ? req.body.website.trim() : '';
      const anrede =
        typeof req.body?.ansprechpartner_anrede === 'string'
          ? req.body.ansprechpartner_anrede.trim()
          : '';
      const vorname =
        typeof req.body?.ansprechpartner_vorname === 'string'
          ? req.body.ansprechpartner_vorname.trim()
          : '';
      const nachname =
        typeof req.body?.ansprechpartner_nachname === 'string'
          ? req.body.ansprechpartner_nachname.trim()
          : '';
      const ansprechpartnerEmail =
        typeof req.body?.ansprechpartner_email === 'string'
          ? req.body.ansprechpartner_email.trim()
          : '';
      const ansprechpartnerTelefon =
        typeof req.body?.ansprechpartner_telefon === 'string'
          ? req.body.ansprechpartner_telefon.trim()
          : '';
      const interneNotiz =
        typeof req.body?.interne_notiz === 'string' ? req.body.interne_notiz.trim() : '';
      const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
      const erweiterungJson = mergeErweiterungFromBody(req.body || {}, {});
      await store.insertFirma({
        id,
        name,
        kundennummer: null,
        altnummer: altnummer || null,
        typ: typ || null,
        internExtern: internExtern || null,
        umsatzsteuerId: umsatzsteuerId || null,
        strasse: strasse || null,
        plz: plz || null,
        stadt: stadt || null,
        land: land || 'Deutschland',
        telefon: telefon || null,
        email: email || null,
        website: website || null,
        ansprechpartnerAnrede: anrede || null,
        ansprechpartnerVorname: vorname || null,
        ansprechpartnerNachname: nachname || null,
        ansprechpartnerEmail: ansprechpartnerEmail || null,
        ansprechpartnerTelefon: ansprechpartnerTelefon || null,
        interneNotiz: interneNotiz || null,
        status: status || null,
        erweiterungJson,
      });
      const seg =
        req.body?.fusa_segment != null && String(req.body.fusa_segment).trim() !== ''
          ? String(req.body.fusa_segment).trim()
          : null;
      const hin =
        req.body?.fusa_hinweis != null && String(req.body.fusa_hinweis).trim() !== ''
          ? String(req.body.fusa_hinweis).trim()
          : null;
      if (seg != null || hin != null) {
        await store.upsertFusaKundenExtra(id, { segment: seg, hinweis: hin });
      }
      await store.assignSystemKundennummerIfMissing(id);
      const fresh = await store.getFirmaById(id);
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'firma',
        resource_id: id,
        project_id: null,
        payload: { name: name || null },
      });
      return sendSuccess(res, 201, {
        firma: {
          id,
          name,
          kundennummer: fresh ? jsonDbScalar(fresh.kundennummer) : null,
          altnummer: altnummer || null,
          typ: typ || null,
          intern_extern: internExtern || null,
          umsatzsteuer_id: umsatzsteuerId || null,
          strasse: strasse || null,
          plz: plz || null,
          stadt: stadt || null,
          land: land || 'Deutschland',
          telefon: telefon || null,
          email: email || null,
          website: website || null,
          ansprechpartner_anrede: anrede || null,
          ansprechpartner_vorname: vorname || null,
          ansprechpartner_nachname: nachname || null,
          ansprechpartner_email: ansprechpartnerEmail || null,
          ansprechpartner_telefon: ansprechpartnerTelefon || null,
          interne_notiz: interneNotiz || null,
          status: status || null,
        },
      });
    } catch (e) {
      console.error('[POST /api/v1/firmen]', e instanceof Error ? e.stack || e.message : e);
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch('/firmen/:id', ...apiAuthProfile, firmenErstellen, async (req, res) => {
    try {
      const kid = String(req.params.id || '').trim();
      if (!kid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Firmen-ID.');
      }
      const row0 = await store.getFirmaById(kid);
      if (!row0) {
        return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
      }
      const existingEx = parseErweiterungJsonFromRow(row0);
      const patchFirma = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) patchFirma.name = req.body.name;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'altnummer'))
        patchFirma.altnummer = req.body.altnummer;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'typ')) patchFirma.typ = req.body.typ;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'intern_extern'))
        patchFirma.intern_extern = req.body.intern_extern;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'umsatzsteuer_id'))
        patchFirma.umsatzsteuer_id = req.body.umsatzsteuer_id;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'strasse'))
        patchFirma.strasse = req.body.strasse;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'plz')) patchFirma.plz = req.body.plz;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'stadt'))
        patchFirma.stadt = req.body.stadt;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'land')) patchFirma.land = req.body.land;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'telefon'))
        patchFirma.telefon = req.body.telefon;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email'))
        patchFirma.email = req.body.email;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'website'))
        patchFirma.website = req.body.website;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_anrede'))
        patchFirma.ansprechpartner_anrede = req.body.ansprechpartner_anrede;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_vorname'))
        patchFirma.ansprechpartner_vorname = req.body.ansprechpartner_vorname;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_nachname'))
        patchFirma.ansprechpartner_nachname = req.body.ansprechpartner_nachname;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_email'))
        patchFirma.ansprechpartner_email = req.body.ansprechpartner_email;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_telefon'))
        patchFirma.ansprechpartner_telefon = req.body.ansprechpartner_telefon;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'interne_notiz'))
        patchFirma.interne_notiz = req.body.interne_notiz;
      const extKeys = ['fax', 'bundesland', 'haupt_position', 'haupt_abteilung', 'weitere_ansprechpartner'];
      const touchesExt = extKeys.some((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
      if (touchesExt) {
        patchFirma.erweiterung_json = mergeErweiterungFromBody(req.body || {}, existingEx);
      }
      if (Object.keys(patchFirma).length > 0) {
        await store.updateFirmaById(kid, patchFirma);
      }
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'fusa_segment') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'fusa_hinweis')
      ) {
        await store.upsertFusaKundenExtra(kid, {
          segment: req.body?.fusa_segment,
          hinweis: req.body?.fusa_hinweis,
        });
      }
      await store.assignSystemKundennummerIfMissing(kid);
      await logAudit(store, {
        user: req.auth,
        modul: 'cockpit',
        action: 'PATCH',
        resource_type: 'firma',
        resource_id: kid,
        project_id: null,
        payload: { keys: Object.keys(patchFirma) },
      });
      return sendSuccess(res, 200, { updated: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  /**
   * `/api/v1/kunden` und `/api/v1/stammdaten/kunden`: liest/schreibt **firmen** (kein Zugriff auf die Legacy-Tabelle `kunden`).
   *
   * LEGACY — nur Markierung, keine Migration: Die Tabelle **kunden** ist das alte Projekt-Kundenmodell (Store: `listKunden`, `getKundeById`, `insertKunde`, `updateKunde` in `database.js` / `mysql-store.js`, Router `routes/kunden.js`). Neue fachliche Entwicklung an **firmen** bzw. `/api/v1/firmen` oder diesen Stammdaten-Endpunkten ausrichten, nicht an die Legacy-Tabelle. **projects.kunden_id** bleibt bis zu einer separaten Migration unverändert.
   *
   * @param {object} storeArg
   */
  function createKundenRouter(storeArg) {
    const kundenR = Router();
    kundenR.get('/', kundeStammLesen, async (req, res, next) => {
      try {
        const rows = await storeArg.listFirmen();
        const kunden = rows.map((r) => mapFirmaRowToKundeJson(r)).filter(Boolean);
        return sendSuccess(res, 200, { kunden });
      } catch (e) {
        return next(e);
      }
    });

    kundenR.get('/:kundeId', kundeStammLesen, async (req, res, next) => {
      try {
        const kid = typeof req.params.kundeId === 'string' ? req.params.kundeId.trim() : '';
        if (!kid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Kunden-ID.');
        }
        const row = await storeArg.getFirmaKundeStammById(kid);
        if (!row) {
          return sendError(res, 404, 'NOT_FOUND', 'Kunde nicht gefunden.');
        }
        const kundeRaw = mapFirmaRowToKundeJson(row);
        const detailRaw = buildKundenStammDetailEnvelope(row);
        const { kunde, detail } = redactKundenStammForAccessProfile(req.accessProfile, kundeRaw, detailRaw);
        return sendSuccess(res, 200, { kunde, detail });
      } catch (e) {
        return next(e);
      }
    });

    kundenR.post('/', firmenErstellen, async (req, res, next) => {
    try {
      const nameRaw = req.body?.name;
      const name = typeof nameRaw === 'string' ? nameRaw.trim() : '';
      const emailAllg =
        typeof req.body?.email === 'string' ? String(req.body.email).trim() : '';
      const id = randomUUID();
      const typ = typeof req.body?.typ === 'string' ? req.body.typ.trim() : '';
      const internExtern =
        typeof req.body?.intern_extern === 'string' ? req.body.intern_extern.trim() : '';
      const altnummer = typeof req.body?.altnummer === 'string' ? req.body.altnummer.trim() : '';
      const umsatzsteuerId =
        typeof req.body?.umsatzsteuer_id === 'string' ? req.body.umsatzsteuer_id.trim() : '';
      const strasse = typeof req.body?.strasse === 'string' ? req.body.strasse.trim() : '';
      const plz = typeof req.body?.plz === 'string' ? req.body.plz.trim() : '';
      const stadt = typeof req.body?.stadt === 'string' ? req.body.stadt.trim() : '';
      const land = typeof req.body?.land === 'string' ? req.body.land.trim() : 'Deutschland';
      const telefon = typeof req.body?.telefon === 'string' ? req.body.telefon.trim() : '';
      const website = typeof req.body?.website === 'string' ? req.body.website.trim() : '';
      const anrede =
        typeof req.body?.ansprechpartner_anrede === 'string'
          ? req.body.ansprechpartner_anrede.trim()
          : '';
      const vorname =
        typeof req.body?.ansprechpartner_vorname === 'string'
          ? req.body.ansprechpartner_vorname.trim()
          : '';
      const nachname =
        typeof req.body?.ansprechpartner_nachname === 'string'
          ? req.body.ansprechpartner_nachname.trim()
          : '';
      const ansprechpartnerEmail =
        typeof req.body?.ansprechpartner_email === 'string'
          ? req.body.ansprechpartner_email.trim()
          : '';
      const ansprechpartnerTelefon =
        typeof req.body?.ansprechpartner_telefon === 'string'
          ? req.body.ansprechpartner_telefon.trim()
          : '';
      const interneNotiz =
        typeof req.body?.interne_notiz === 'string' ? req.body.interne_notiz.trim() : '';
      const status = typeof req.body?.status === 'string' ? req.body.status.trim() : '';
      const erweiterungJson = mergeErweiterungFromBody(req.body || {}, {});
      await storeArg.insertFirma({
        id,
        name,
        kundennummer: null,
        altnummer: altnummer || null,
        typ: typ || null,
        internExtern: internExtern || null,
        umsatzsteuerId: umsatzsteuerId || null,
        strasse: strasse || null,
        plz: plz || null,
        stadt: stadt || null,
        land: land || 'Deutschland',
        telefon: telefon || null,
        email: emailAllg || null,
        website: website || null,
        ansprechpartnerAnrede: anrede || null,
        ansprechpartnerVorname: vorname || null,
        ansprechpartnerNachname: nachname || null,
        ansprechpartnerEmail: ansprechpartnerEmail || null,
        ansprechpartnerTelefon: ansprechpartnerTelefon || null,
        interneNotiz: interneNotiz || null,
        status: status || null,
        erweiterungJson,
      });
      const seg =
        req.body?.fusa_segment != null && String(req.body.fusa_segment).trim() !== ''
          ? String(req.body.fusa_segment).trim()
          : null;
      const hin =
        req.body?.fusa_hinweis != null && String(req.body.fusa_hinweis).trim() !== ''
          ? String(req.body.fusa_hinweis).trim()
          : null;
      if (seg != null || hin != null) {
        await storeArg.upsertFusaKundenExtra(id, { segment: seg, hinweis: hin });
      }
      await storeArg.assignSystemKundennummerIfMissing(id);
      const fresh = await storeArg.getFirmaKundeStammById(id);
      await logAudit(storeArg, {
        user: req.auth,
        modul: 'cockpit',
        action: 'POST',
        resource_type: 'kunde',
        resource_id: id,
        project_id: null,
        payload: { name: name || null },
      });
      return sendSuccess(res, 201, { kunde: mapFirmaRowToKundeJson(fresh) });
    } catch (e) {
      return next(e);
    }
  });

    kundenR.patch('/:kundeId', firmenErstellen, async (req, res, next) => {
    try {
      const kid = typeof req.params.kundeId === 'string' ? req.params.kundeId.trim() : '';
      if (!kid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Kunden-ID.');
      }
      const row0 = await storeArg.getFirmaById(kid);
      if (!row0) {
        return sendError(res, 404, 'NOT_FOUND', 'Kunde nicht gefunden.');
      }
      const existingEx = parseErweiterungJsonFromRow(row0);
      const patchFirma = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'name')) patchFirma.name = req.body.name;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'altnummer'))
        patchFirma.altnummer = req.body.altnummer;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'typ')) patchFirma.typ = req.body.typ;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'intern_extern'))
        patchFirma.intern_extern = req.body.intern_extern;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'umsatzsteuer_id'))
        patchFirma.umsatzsteuer_id = req.body.umsatzsteuer_id;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'strasse'))
        patchFirma.strasse = req.body.strasse;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'plz')) patchFirma.plz = req.body.plz;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'stadt'))
        patchFirma.stadt = req.body.stadt;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'land')) patchFirma.land = req.body.land;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'telefon'))
        patchFirma.telefon = req.body.telefon;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'email'))
        patchFirma.email = req.body.email;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'website'))
        patchFirma.website = req.body.website;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_anrede'))
        patchFirma.ansprechpartner_anrede = req.body.ansprechpartner_anrede;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_vorname'))
        patchFirma.ansprechpartner_vorname = req.body.ansprechpartner_vorname;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_nachname'))
        patchFirma.ansprechpartner_nachname = req.body.ansprechpartner_nachname;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_email'))
        patchFirma.ansprechpartner_email = req.body.ansprechpartner_email;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'ansprechpartner_telefon'))
        patchFirma.ansprechpartner_telefon = req.body.ansprechpartner_telefon;
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'interne_notiz'))
        patchFirma.interne_notiz = req.body.interne_notiz;
      const extKeys = ['fax', 'bundesland', 'haupt_position', 'haupt_abteilung', 'weitere_ansprechpartner'];
      const touchesExt = extKeys.some((k) => Object.prototype.hasOwnProperty.call(req.body || {}, k));
      if (touchesExt) {
        patchFirma.erweiterung_json = mergeErweiterungFromBody(req.body || {}, existingEx);
      }
      if (Object.keys(patchFirma).length > 0) {
        await storeArg.updateFirmaById(kid, patchFirma);
      }
      if (
        Object.prototype.hasOwnProperty.call(req.body || {}, 'fusa_segment') ||
        Object.prototype.hasOwnProperty.call(req.body || {}, 'fusa_hinweis')
      ) {
        await storeArg.upsertFusaKundenExtra(kid, {
          segment: req.body?.fusa_segment,
          hinweis: req.body?.fusa_hinweis,
        });
      }
      await storeArg.assignSystemKundennummerIfMissing(kid);
      const fresh = await storeArg.getFirmaKundeStammById(kid);
      await logAudit(storeArg, {
        user: req.auth,
        modul: 'cockpit',
        action: 'PATCH',
        resource_type: 'kunde',
        resource_id: kid,
        project_id: null,
        payload: { keys: Object.keys(patchFirma) },
      });
      return sendSuccess(res, 200, { kunde: mapFirmaRowToKundeJson(fresh) });
    } catch (e) {
      return next(e);
    }
  });

    return kundenR;
  }

  const kundenRouter = createKundenRouter(store);
  /** `/api/v1/kunden` — siehe `createKundenRouter` (firmen, nicht Legacy-Tabelle `kunden`). */
  router.use('/kunden', ...apiAuthProfile, kundenRouter);
  // DEPRECATED - Nachfolger: /api/v1/stammdaten/kunden
  router.use('/stammdaten/kunden', ...apiAuthProfile, kundenRouter);

  router.get('/fusa/kunden', ...apiAuthProfile, fusaKundenSehen, async (req, res) => {
    try {
      const firmenRows = await store.listFirmen();
      const extraRows = await store.listFusaKundenExtraAll();
      const extraById = new Map(
        extraRows
          .filter((x) => x && x.firma_id != null && String(x.firma_id).trim() !== '')
          .map((x) => [String(x.firma_id).trim(), x]),
      );
      const kunden = firmenRows
        .map((r) => {
          const base = mapFirmaRowToFirmenApiJson(r);
          if (!base) return null;
          const fid = String(r.id).trim();
          const x = extraById.get(fid) || null;
          return {
            ...base,
            firma_id: r.id,
            firma_name: r.name ?? null,
            fusa_hinweis: x != null && x.hinweis != null ? x.hinweis : null,
            fusa_segment: x != null && x.segment != null ? x.segment : null,
            fusa_updated_at: x != null && x.fusa_updated_at != null ? x.fusa_updated_at : null,
          };
        })
        .filter(Boolean);
      return sendSuccess(res, 200, { kunden });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  /** Statische Unterpfade vor GET `/fusa/auftraege` (Listen-Endpunkt), damit nichts davor „abfängt“. */
  router.get('/fusa/auftraege/form-meta', ...apiAuthProfile, fusaAuftraegeSehen, async (req, res) => {
    try {
      const kannPreiseSehen = req.accessProfile?.canViewPricesAnywhere() ?? false;
      const meta = buildFormMetaPayload();
      return sendSuccess(res, 200, { form_meta: fusaFormMetaOhnePreise(meta, kannPreiseSehen) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/fusa/auftraege/kalkulation', ...apiAuthProfile, fusaAuftraegeSehen, async (req, res) => {
    try {
      const body = req.body && typeof req.body === 'object' ? req.body : {};
      const kannPreiseSehen = req.accessProfile?.canViewPricesAnywhere() ?? false;
      const raw = kalkuliereAuftragsparameter({
        startdatum: body.startdatum,
        laufzeit_monate: body.laufzeit_monate,
        fahrzeugtyp: body.fahrzeugtyp,
        paket: body.paket,
        fahrzeuganzahl: body.fahrzeuganzahl,
      });
      const detail = kalkuliereFusaAuftragPreisdetails(body);
      const kalkulation = {
        enddatum: detail.enddatum ?? raw.enddatum,
        preis_monat: kannPreiseSehen ? detail.preis_monat ?? raw.preis_monat : null,
        gesamtpreis: kannPreiseSehen ? detail.gesamtpreis ?? raw.gesamtpreis : null,
        erlaubte_konfiguration: raw.erlaubte_konfiguration,
        partner_modelle: detail.partner_modelle,
        positionen: kannPreiseSehen ? detail.positionen : null,
        summen: kannPreiseSehen ? detail.summen : null,
      };
      if (!kannPreiseSehen) {
        kalkulation.preise_verdeckt = true;
      }
      return sendSuccess(res, 200, { kalkulation });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get(
    '/fusa/auftraege/verfuegbare-fahrzeuge',
    ...apiAuthProfile,
    fusaVerfuegbareFahrzeugeListe,
    async (req, res) => {
      try {
        const projectId = String(req.query.project_id || '').trim();
        const startdatum = String(req.query.startdatum || '').trim();
        const enddatum = String(req.query.enddatum || '').trim();
        const fahrzeugtyp = String(req.query.fahrzeugtyp || '').trim();
        const depot = String(req.query.depot || '').trim();
        const paket = req.query.paket != null ? String(req.query.paket).trim() : '';
        const excludeAuftragId =
          req.query.exclude_auftrag_id != null ? String(req.query.exclude_auftrag_id).trim() : '';

        if (!projectId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter project_id fehlt.');
        }
        if (!startdatum || !enddatum) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter startdatum und enddatum sind erforderlich (YYYY-MM-DD).');
        }
        if (!fahrzeugtyp) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter fahrzeugtyp fehlt.');
        }
        if (!depot) {
          return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            'Parameter depot ist erforderlich (keine Fahrzeugliste ohne Depotfilter).',
          );
        }

        const project = await store.getProjectById(projectId);
        if (!project) {
          return sendError(res, 404, 'NOT_FOUND', 'Projekt wurde nicht gefunden.');
        }
        const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
        if (!uid) {
          return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
        }
        const projectAccess = await store.getProjectAccessByUserAndProject(uid, projectId);
        if (!projectAccess) {
          return sendError(res, 403, 'PROJECT_FORBIDDEN', 'Kein Zugriff auf dieses Projekt.');
        }

        const qStart = parseZuYyyymmdd(startdatum);
        const qEnd = parseZuYyyymmdd(enddatum);
        if (qStart == null || qEnd == null || qStart > qEnd) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Zeitraum (erwartet YYYY-MM-DD, Start ≤ Ende).');
        }

        const payload = await buildVerfuegbareFahrzeugeMitFlaechen(store, {
          projectId,
          startdatum,
          enddatum,
          fahrzeugtyp,
          depot,
          paketGlobal: paket,
          paketProFahrzeug: null,
          excludeAuftragId: excludeAuftragId || null,
        });
        return sendSuccess(res, 200, payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  router.post(
    '/fusa/auftraege/verfuegbare-fahrzeuge',
    ...apiAuthProfile,
    fusaVerfuegbareFahrzeugeListe,
    async (req, res) => {
      try {
        const b = req.body && typeof req.body === 'object' ? req.body : {};
        const projectId = String(b.project_id || '').trim();
        const startdatum = String(b.startdatum || '').trim();
        const enddatum = String(b.enddatum || '').trim();
        const fahrzeugtyp = String(b.fahrzeugtyp || '').trim();
        const depot = String(b.depot || '').trim();
        const paket = b.paket != null ? String(b.paket).trim() : '';
        const paketPro =
          b.paket_pro_fahrzeug && typeof b.paket_pro_fahrzeug === 'object' && !Array.isArray(b.paket_pro_fahrzeug)
            ? /** @type {Record<string, string>} */ (b.paket_pro_fahrzeug)
            : null;
        const excludeAuftragId =
          b.exclude_auftrag_id != null ? String(b.exclude_auftrag_id).trim() : '';

        if (!projectId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter project_id fehlt.');
        }
        if (!startdatum || !enddatum) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter startdatum und enddatum sind erforderlich (YYYY-MM-DD).');
        }
        if (!fahrzeugtyp) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Parameter fahrzeugtyp fehlt.');
        }
        if (!depot) {
          return sendError(
            res,
            400,
            'VALIDATION_ERROR',
            'Parameter depot ist erforderlich (keine Fahrzeugliste ohne Depotfilter).',
          );
        }

        const project = await store.getProjectById(projectId);
        if (!project) {
          return sendError(res, 404, 'NOT_FOUND', 'Projekt wurde nicht gefunden.');
        }
        const uidPost = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
        if (!uidPost) {
          return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
        }
        const projectAccessPost = await store.getProjectAccessByUserAndProject(uidPost, projectId);
        if (!projectAccessPost) {
          return sendError(res, 403, 'PROJECT_FORBIDDEN', 'Kein Zugriff auf dieses Projekt.');
        }

        const qStart = parseZuYyyymmdd(startdatum);
        const qEnd = parseZuYyyymmdd(enddatum);
        if (qStart == null || qEnd == null || qStart > qEnd) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Zeitraum (erwartet YYYY-MM-DD, Start ≤ Ende).');
        }

        /** Nur String-Werte in paket_pro_fahrzeug */
        /** @type {Record<string, string>|null} */
        let paketProNorm = null;
        if (paketPro) {
          paketProNorm = {};
          for (const [k, v] of Object.entries(paketPro)) {
            const kk = String(k || '').trim();
            const vv = v != null ? String(v).trim() : '';
            if (kk && vv) paketProNorm[kk] = vv;
          }
          if (Object.keys(paketProNorm).length === 0) paketProNorm = null;
        }

        const payload = await buildVerfuegbareFahrzeugeMitFlaechen(store, {
          projectId,
          startdatum,
          enddatum,
          fahrzeugtyp,
          depot,
          paketGlobal: paket,
          paketProFahrzeug: paketProNorm,
          excludeAuftragId: excludeAuftragId || null,
        });
        return sendSuccess(res, 200, payload);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  console.log('[api-v1] FUSA verfügbare-fahrzeuge Route aktiv (GET + POST).');

  router.get('/fusa/auftraege', ...apiAuthProfile, fusaAuftraegeSehen, async (req, res) => {
    try {
      const auftraege = await store.listFusaApiAuftraege();
      return sendSuccess(res, 200, { auftraege });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/fusa/auftraege/:id/freigeben', ...apiAuthProfile, fusaAuftraegeBearbeiten, async (req, res) => {
    try {
      const fusaAuftragId = requiredTrimmed(req.params.id);
      if (!fusaAuftragId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige FUSA-Auftrags-ID.');
      }
      const fusaAuftrag = await store.getAuftragById(fusaAuftragId);
      if (!fusaAuftrag) {
        return sendError(res, 404, 'NOT_FOUND', 'FUSA-Auftrag nicht gefunden.');
      }
      const auftragProjectId = fusaAuftrag.project_id != null ? String(fusaAuftrag.project_id).trim() : '';
      if (!auftragProjectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'FUSA-Auftrag ist keinem Projekt zugeordnet; Freigabe nicht möglich.');
      }
      const freigebenUid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
      if (!freigebenUid) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const freigebenAccess = await store.getProjectAccessByUserAndProject(freigebenUid, auftragProjectId);
      if (!freigebenAccess) {
        return sendError(res, 403, 'PROJECT_FORBIDDEN', 'Kein Zugriff auf das Projekt dieses FUSA-Auftrags.');
      }
      const firmaId = requiredTrimmed(fusaAuftrag.fusa_kunde_id);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'FUSA-Auftrag hat keinen verknüpfbaren Kunden (fusa_kunde_id).');
      }

      let linked = await store.getCcInternAuftragByFusaAuftragId(fusaAuftragId, firmaId);
      let created = false;
      if (!linked) {
        const year = new Date().getFullYear();
        const last = await store.getLastCcInternAuftragsnummerForYear(year);
        const m = String(last?.auftragsnummer || '').match(new RegExp(`^AU-${year}-(\\d{3})$`));
        const nextNr = (m ? Number.parseInt(m[1], 10) : 0) + 1;
        const auftragsnummer = `AU-${year}-${String(nextNr).padStart(3, '0')}`;
        const id = randomUUID();
        const kunde =
          requiredTrimmed(fusaAuftrag.kunde_name)
          || requiredTrimmed(fusaAuftrag.title)
          || `FUSA ${String(fusaAuftragId).slice(0, 8)}`;
        await store.insertCcInternAuftrag({
          id,
          auftragsnummer,
          kunde,
          status: nullableTrimmed(fusaAuftrag.status),
          schritt: null,
          prioritaet: null,
          lieferdatum: nullableTrimmed(fusaAuftrag.termin_ende),
          montage_datum: nullableTrimmed(fusaAuftrag.termin),
          bemerkung: `Freigegeben aus FUSA-Auftrag ${fusaAuftragId}`,
          fusa_auftrag_id: fusaAuftragId,
          quelle: 'fusa',
          erstellt_von: req.auth.userId,
          firma_id: firmaId,
        });
        linked = await store.getCcInternAuftragById(id, firmaId);
        created = true;
      }

      await syncFusaTerminAndLinkedCcIntern({
        store,
        fusaAuftrag,
        linkedCcInternAuftrag: linked || null,
        actorUserId: req.auth.userId,
      });

      await logAudit(store, {
        user: req.auth,
        modul: 'fusa',
        action: 'POST',
        resource_type: 'fusa_auftrag_freigabe',
        resource_id: fusaAuftragId,
        project_id: auftragProjectId,
        payload: { ccintern_status: created ? 'created' : 'linked', ccintern_auftrag_id: linked?.id ?? null },
      });
      return sendSuccess(res, 200, {
        status: created ? 'created' : 'linked',
        fusa_auftrag_id: fusaAuftragId,
        ccintern_auftrag_id: linked?.id ?? null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  /**
   * FUSA-Aufträge CRUD (POST/PATCH/GET/:id/DELETE) — Logik aus `routes/auftraege.js`.
   * GET `/fusa/auftraege` (Liste) bleibt oben mit `listFusaApiAuftraege` + Envelope.
   * `POST …/:id/freigeben` bleibt explizit (vor diesem Mount).
   */
  router.use(
    '/fusa/auftraege',
    ...apiAuthProfile,
    createFusaNativeAuftraegeRouter(store, { useApiV1Envelope: true }),
  );

  router.get('/fusa/fahrzeuge', ...apiAuthProfile, fusaFahrzeugeSehen, async (req, res) => {
    try {
      const fahrzeuge = await store.listFusaApiFahrzeuge();
      return sendSuccess(res, 200, { fahrzeuge });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  // Vollständige FUSA-Fahrzeug-API (POST/GET by id/PATCH) unter V1.
  // GET "/" bleibt oben explizit für die bestehende Listenantwort.
  router.use('/fusa/fahrzeuge', ...apiAuthProfile, createFahrzeugeRouter(store));

  router.use('/fusa/dokumente', ...apiAuthProfile, createFusaDokumenteRouter(store));

  /**
   * LEGACY: Tabelle **angebote** ist das alte Projekt-Angebotsmodell (`routes/angebote.js`, Store `listAngeboteForUser` …). Neue Entwicklung nutzt **fusa_angebote** oder **ccintern_angebote**. Nicht für neue Features verwenden.
   * Alter Root-Pfad `/angebote` (ohne `/api/v1`) → HTTP 410 (`mountLegacyApiRemoved` in `server.js`, `legacy-api-removed.js`).
   */
  router.use('/fusa/angebote', ...apiAuthProfile, createFusaAngebotRouter(store));

  router.use(
    '/schaeden',
    ...apiAuthProfile,
    requireApiProjectContext(store),
    createApiV1SchaedenRouter(store),
  );

  router.get('/fusa/rechnungen', ...apiAuthProfile, fusaRechnungenSehen, async (req, res) => {
    try {
      const rechnungen = await store.listFusaApiRechnungen();
      return sendSuccess(res, 200, { rechnungen });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/fusa/rechnungen', ...apiAuthProfile, fusaRechnungenBearbeiten, async (req, res) => {
    try {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const row = {
        id: b.id != null && String(b.id).trim() ? String(b.id).trim() : undefined,
        original_id: b.original_id != null ? String(b.original_id).trim() || null : null,
        auftrag_id: b.auftrag_id != null ? String(b.auftrag_id).trim() || null : null,
        kunde_id: b.kunde_id != null ? String(b.kunde_id).trim() || null : null,
        von: b.von != null ? String(b.von).trim() || null : null,
        bis: b.bis != null ? String(b.bis).trim() || null : null,
        netto: b.netto,
        mwst: b.mwst,
        brutto: b.brutto,
        faellig_am: b.faellig_am != null ? String(b.faellig_am).trim() || null : null,
        status: b.status != null ? String(b.status).trim() || 'erstellt' : 'erstellt',
        quartal: b.quartal != null ? String(b.quartal).trim() || null : null,
        notiz: b.notiz != null ? String(b.notiz) : null,
        extra_json: fusaRechnungExtraJsonToString(b.extra_json),
        bezahlt_am: b.bezahlt_am != null ? String(b.bezahlt_am).trim() || null : null,
        rechnungsdatum: b.rechnungsdatum != null ? String(b.rechnungsdatum).trim() || null : null,
      };
      const st = String(row.status || '').toLowerCase();
      if (st === 'bezahlt' && !row.bezahlt_am) {
        row.bezahlt_am = new Date().toISOString().slice(0, 10);
      }
      const created = await store.insertFusaRechnungRow(row);
      return sendSuccess(res, 201, { rechnung: created });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch('/fusa/rechnungen/:rechnungId', ...apiAuthProfile, fusaRechnungenBearbeiten, async (req, res) => {
    try {
      const rid = String(req.params.rechnungId || '').trim();
      if (!rid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'rechnungId fehlt.');
      }
      const cur = await store.getFusaRechnungById(rid);
      if (!cur) {
        return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
      }
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(b, 'original_id')) {
        patch.original_id = b.original_id != null ? String(b.original_id).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'auftrag_id')) {
        patch.auftrag_id = b.auftrag_id != null ? String(b.auftrag_id).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'kunde_id')) {
        patch.kunde_id = b.kunde_id != null ? String(b.kunde_id).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'von')) patch.von = b.von != null ? String(b.von).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'bis')) patch.bis = b.bis != null ? String(b.bis).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'netto')) patch.netto = b.netto;
      if (Object.prototype.hasOwnProperty.call(b, 'mwst')) patch.mwst = b.mwst;
      if (Object.prototype.hasOwnProperty.call(b, 'brutto')) patch.brutto = b.brutto;
      if (Object.prototype.hasOwnProperty.call(b, 'faellig_am')) {
        patch.faellig_am = b.faellig_am != null ? String(b.faellig_am).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'status')) {
        patch.status = b.status != null ? String(b.status).trim() : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'quartal')) {
        patch.quartal = b.quartal != null ? String(b.quartal).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'notiz')) patch.notiz = b.notiz != null ? String(b.notiz) : null;
      if (Object.prototype.hasOwnProperty.call(b, 'extra_json')) {
        patch.extra_json = fusaRechnungExtraJsonToString(b.extra_json);
      }
      if (Object.prototype.hasOwnProperty.call(b, 'extra_json_patch') && b.extra_json_patch && typeof b.extra_json_patch === 'object') {
        patch.extra_json = mergeFusaRechnungExtraJson(cur.extra_json, b.extra_json_patch);
      }
      if (Object.prototype.hasOwnProperty.call(b, 'bezahlt_am')) {
        patch.bezahlt_am = b.bezahlt_am != null ? String(b.bezahlt_am).trim() || null : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'rechnungsdatum')) {
        patch.rechnungsdatum = b.rechnungsdatum != null ? String(b.rechnungsdatum).trim() || null : null;
      }
      const nextStatus = patch.status != null ? String(patch.status).toLowerCase() : String(cur.status || '').toLowerCase();
      if (nextStatus === 'bezahlt' && patch.bezahlt_am === undefined && !cur.bezahlt_am) {
        patch.bezahlt_am = new Date().toISOString().slice(0, 10);
      }
      const updated = await store.updateFusaRechnungById(rid, patch);
      return sendSuccess(res, 200, { rechnung: updated });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post(
    '/fusa/rechnungen/:rechnungId/promote-from-angebot',
    ...apiAuthProfile,
    fusaRechnungenBearbeiten,
    async (req, res) => {
      try {
        const rid = String(req.params.rechnungId || '').trim();
        if (!rid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'rechnungId fehlt.');
        }
        const existing = await store.getFusaRechnungById(rid);
        if (!existing) {
          return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
        }
        const b = req.body && typeof req.body === 'object' ? req.body : {};
        const neueOriginal = b.neue_original_id != null ? String(b.neue_original_id).trim() || null : null;
        const patch = { status: 'rechnung' };
        if (neueOriginal) patch.original_id = neueOriginal;
        const updated = await store.updateFusaRechnungById(rid, patch);
        return sendSuccess(res, 200, { rechnung: updated });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  /**
   * FUSA-Terminliste aus `fusa_termine` (Store).
   * Hinweis: Die Tabelle `fusa_termine` existiert aktuell nur im **MySQL-Store** (Anlage in `mysql-store.js`).
   * Unter **SQLite** gibt `listFusaApiTermine()` bewusst `[]` zurück (fehlende Tabelle wird abgefangen).
   * Aktive, gemeinsame Terminquelle im Cockpit: **`kalender_termine`** — diese Route nicht als alleinige SQLite-FUSA-Terminquelle missverstehen.
   */
  router.get('/fusa/termine', ...apiAuthProfile, fusaTermineSehen, async (req, res) => {
    try {
      const termine = await store.listFusaApiTermine();
      return sendSuccess(res, 200, { termine });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch(
    '/fusa/kunden/:firmaId',
    ...apiAuthProfile,
    fusaKundenBearbeiten,
    async (req, res) => {
      try {
        const firmaId = String(req.params.firmaId || '').trim();
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Firmen-ID.');
        }
        const ok = await store.upsertFusaKundenExtra(firmaId, {
          hinweis: req.body?.hinweis,
          segment: req.body?.segment,
        });
        if (!ok) {
          return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
        }
        return sendSuccess(res, 200, { updated: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  async function resolveFirmaIdForRequest(req) {
    const me = await store.getUserById(req.auth.userId);
    const fromUser = me?.company_id != null ? String(me.company_id).trim() : '';
    if (fromUser) return fromUser;

    const gr = String(me?.global_role || '').trim();
    /** EXTERN ohne company_id: kein Zugriff auf stillen Firmen-Fallback — Aufrufer liefern 400. */
    if (gr === 'EXTERN') {
      return null;
    }

    const canPickFirma = req.accessProfile?.isSuperAdmin() === true || gr === 'INTERN';

    if (canPickFirma) {
      /** Query zuerst (GET-Listen), dann Body (POST/PUT). */
      const fromQuery = requiredTrimmed(req.query?.firma_id);
      if (fromQuery) return fromQuery;
      const fromBody = requiredTrimmed(req.body?.firma_id);
      if (fromBody) return fromBody;

      /**
       * Legacy-Fallback: erste Firma bzw. Name „CC Werbung“ — nur temporär, bis Clients/User-Stammdaten
       * `company_id` bzw. `firma_id` zuverlässig mitschicken. Entfernen, sobald Migration abgeschlossen.
       */
      const firmen = await store.listFirmen();
      if (Array.isArray(firmen) && firmen.length > 0) {
        const exact = firmen.find((f) => String(f?.name || '').trim().toLowerCase() === 'cc werbung');
        const pick = exact && exact.id != null ? exact : firmen[0];
        if (pick && pick.id != null) {
          const fid = String(pick.id).trim();
          if (fid) {
            console.warn(
              '[api-v1] resolveFirmaIdForRequest: Legacy-Fallback auf Firmenliste (User ohne company_id)',
              { userId: req.auth?.userId, global_role: gr, picked_firma_id: fid },
            );
            return fid;
          }
        }
      }
    }
    return null;
  }

  router.use(
    '/mitarbeiter',
    ...apiAuthProfile,
    createMitarbeiterRouter(store, { resolveFirmaIdForRequest }),
  );

  router.use(
    '/checklisten',
    ...apiAuthProfile,
    createChecklistenRouter(store, { resolveFirmaIdForRequest }),
  );

  router.use(
    '/produktion',
    ...apiAuthProfile,
    createProduktionRouter(store, { resolveFirmaIdForRequest }),
  );

  router.use('/geraete', ...apiAuthProfile, createGeraeteRouter(store, { resolveFirmaIdForRequest }));

  router.use('/crm', ...apiAuthProfile, createCrmRouter(store, { resolveFirmaIdForRequest }));

  router.use(
    '/ccintern/me',
    ...apiAuthProfile,
    createMobileRouter(store, { resolveFirmaIdForRequest }),
  );

  router.use(
    '/ccintern/mitarbeiter',
    ...apiAuthProfile,
    createCcInternMitarbeiterOperativRouter(store, { resolveFirmaIdForRequest }),
  );

  router.use(
    '/ccintern/checklisten-zuordnung',
    ...apiAuthProfile,
    createCcInternChecklistenZuordnungRouter(store, { resolveFirmaIdForRequest }),
  );

  /**
   * @param {unknown} raw
   * @returns {boolean|undefined}
   */
  function parseBoolStrict(raw) {
    if (raw === true || raw === false) return raw;
    const s = String(raw ?? '').trim().toLowerCase();
    if (s === 'true' || s === '1' || s === 'ja') return true;
    if (s === 'false' || s === '0' || s === 'nein') return false;
    return undefined;
  }

  /**
   * @param {unknown} raw
   * @returns {string[]|undefined}
   */
  function parseMitarbeiterIds(raw) {
    if (raw == null || raw === '') return [];
    if (!Array.isArray(raw)) return undefined;
    const out = raw.map((x) => String(x || '').trim()).filter(Boolean);
    return [...new Set(out)];
  }

  const erlaubteKalenderTypen = new Set(['allgemein', 'beklebung', 'montage', 'intern', 'urlaub', 'fusa', 'sonstig']);
  const erlaubteKalenderQuellen = new Set(['manuell', 'fusa', 'ccintern']);
  const erlaubteUrlaubTypen = new Set(['urlaub', 'krank', 'sonstig']);
  const erlaubteUrlaubStatus = new Set(['offen', 'genehmigt', 'abgelehnt']);
  const erlaubteLagerBuchungsTypen = new Set(['entnahme', 'zugang', 'korrektur']);
  const erlaubteAnfrageStatus = new Set(['offen', 'in_bearbeitung', 'erledigt', 'abgelehnt']);
  const erlaubteAufgabeStatus = new Set(['offen', 'in_bearbeitung', 'erledigt', 'abgelehnt']);
  const erlaubteAufgabePrioritaet = new Set(['niedrig', 'normal', 'hoch', 'kritisch']);
  const erlaubteRechnungsStatus = new Set([
    'offen',
    'in_pruefung',
    'freigegeben',
    'gesendet',
    'teilbezahlt',
    'bezahlt',
    'storniert',
  ]);
  const erlaubteMesseflowProjektStatus = new Set([
    'neu',
    'in_planung',
    'in_produktion',
    'in_montage',
    'abgeschlossen',
    'storniert',
  ]);

  /**
   * @param {string} projektId
   * @param {string} firmaId
   */
  async function loadMesseflowProjektDetail(projektId, firmaId) {
    const projekt = await store.getMesseflowProjektById(projektId, firmaId);
    if (!projekt) return null;
    const waendeRows = await store.listMesseflowWaendeByProjekt(projektId);
    const dateienByWand = new Map();
    for (const wand of waendeRows) {
      const list = await store.listMesseflowDateienByWand(wand.id);
      dateienByWand.set(String(wand.id), list.map(mapMesseflowDatei));
    }
    const waende = waendeRows.map((wand) => mapMesseflowWand(wand, dateienByWand.get(String(wand.id)) || []));
    return mapMesseflowProjekt(projekt, waende);
  }

  /**
   * @param {string} von
   * @param {string} bis
   */
  function berechneUrlaubTage(von, bis) {
    const dVon = new Date(von);
    const dBis = new Date(bis);
    if (Number.isNaN(dVon.getTime()) || Number.isNaN(dBis.getTime())) return null;
    const start = Date.UTC(dVon.getFullYear(), dVon.getMonth(), dVon.getDate());
    const end = Date.UTC(dBis.getFullYear(), dBis.getMonth(), dBis.getDate());
    if (end < start) return null;
    return ((end - start) / 86400000) + 1;
  }

  function createKalenderRouter(storeArg) {
    const kalenderR = Router();
    kalenderR.get('/', ccinternKalenderSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const typ = nullableTrimmed(req.query?.typ);
      const von = nullableTrimmed(req.query?.von);
      const bis = nullableTrimmed(req.query?.bis);
      if (typ && !erlaubteKalenderTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Typ. Erlaubt: montage, intern, urlaub, fusa, sonstig.');
      }
      const total = await storeArg.countKalenderTermineByFirma(firmaId, { typ, von, bis });
      const rows = await storeArg.listKalenderTermineByFirma(firmaId, { offset, limit, typ, von, bis });
      const data = await Promise.all(rows.map((row) => mapKalenderTerminWithCcInternAuftragContext(storeArg, row)));
      return sendSuccess(res, 200, { termine: data, total });
    } catch (e) {
      return next(e);
    }
  });

    kalenderR.post('/', ccinternKalenderErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      const start = optionalIsoLike(req.body?.start);
      if (!start) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "start" ist erforderlich und muss ein Datum sein.');
      const ende = optionalIsoLike(req.body?.ende);
      if (req.body?.ende != null && String(req.body?.ende).trim() !== '' && ende === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "ende" ist kein gültiges Datum.');
      }
      const ganztag = parseBoolStrict(req.body?.ganztag);
      if (ganztag === undefined && req.body?.ganztag !== undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "ganztag" muss bool sein.');
      }
      const typ = nullableTrimmed(req.body?.typ) || 'allgemein';
      if (!erlaubteKalenderTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Typ.');
      }
      const quelle = nullableTrimmed(req.body?.quelle) || 'manuell';
      if (!erlaubteKalenderQuellen.has(quelle)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Quelle (manuell|fusa|ccintern).');
      }
      const mitarbeiterIds = parseMitarbeiterIds(req.body?.mitarbeiter_ids);
      if (mitarbeiterIds === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mitarbeiter_ids" muss ein Array sein.');
      }
      const auftragId = nullableTrimmed(req.body?.auftrag_id);
      if (auftragId) {
        const a = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!a) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig oder gehört zu einer anderen Firma.');
      }
      const fusaAuftragId = nullableTrimmed(req.body?.fusa_auftrag_id);
      if (fusaAuftragId) {
        const fusaAuftrag = await storeArg.getAuftragById(fusaAuftragId);
        if (!fusaAuftrag) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'fusa_auftrag_id ist ungültig.');
        }
      }

      const row = await storeArg.insertKalenderTermin({
        id: randomUUID(),
        titel,
        start,
        ende: ende ?? null,
        ganztag: Boolean(ganztag),
        typ,
        quelle,
        mitarbeiter_ids: JSON.stringify(mitarbeiterIds),
        auftrag_id: auftragId ?? null,
        fusa_auftrag_id: fusaAuftragId ?? null,
        farbe: nullableTrimmed(req.body?.farbe),
        notiz: nullableTrimmed(req.body?.notiz),
        firma_id: firmaId,
        erstellt_von: req.auth.userId,
      });
      return sendSuccess(res, 201, {
        termin: await mapKalenderTerminWithCcInternAuftragContext(storeArg, row),
      });
    } catch (e) {
      return next(e);
    }
  });

    kalenderR.put('/:id', ccinternKalenderBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Termin-ID.');
      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      const start = optionalIsoLike(req.body?.start);
      if (!start) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "start" ist erforderlich und muss ein Datum sein.');
      const ende = optionalIsoLike(req.body?.ende);
      if (req.body?.ende != null && String(req.body?.ende).trim() !== '' && ende === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "ende" ist kein gültiges Datum.');
      }
      const ganztag = parseBoolStrict(req.body?.ganztag);
      if (ganztag === undefined && req.body?.ganztag !== undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "ganztag" muss bool sein.');
      }
      const typ = nullableTrimmed(req.body?.typ) || 'allgemein';
      if (!erlaubteKalenderTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Typ.');
      }
      const quelle = nullableTrimmed(req.body?.quelle) || 'manuell';
      if (!erlaubteKalenderQuellen.has(quelle)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Quelle (manuell|fusa|ccintern).');
      }
      const mitarbeiterIds = parseMitarbeiterIds(req.body?.mitarbeiter_ids);
      if (mitarbeiterIds === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mitarbeiter_ids" muss ein Array sein.');
      }
      const auftragId = nullableTrimmed(req.body?.auftrag_id);
      if (auftragId) {
        const a = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!a) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig oder gehört zu einer anderen Firma.');
      }
      const fusaAuftragId = nullableTrimmed(req.body?.fusa_auftrag_id);
      if (fusaAuftragId) {
        const fusaAuftrag = await storeArg.getAuftragById(fusaAuftragId);
        if (!fusaAuftrag) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'fusa_auftrag_id ist ungültig.');
        }
      }
      const row = await storeArg.updateKalenderTermin(id, firmaId, {
        titel,
        start,
        ende: ende ?? null,
        ganztag: Boolean(ganztag),
        typ,
        quelle,
        mitarbeiter_ids: JSON.stringify(mitarbeiterIds),
        auftrag_id: auftragId ?? null,
        fusa_auftrag_id: fusaAuftragId ?? null,
        farbe: nullableTrimmed(req.body?.farbe),
        notiz: nullableTrimmed(req.body?.notiz),
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Termin nicht gefunden.');
      return sendSuccess(res, 200, {
        termin: await mapKalenderTerminWithCcInternAuftragContext(storeArg, row),
      });
    } catch (e) {
      return next(e);
    }
  });

    kalenderR.delete('/:id', ccinternKalenderBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Termin-ID.');
      const ok = await storeArg.deleteKalenderTermin(id, firmaId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Termin nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      return next(e);
    }
  });

    return kalenderR;
  }

  const kalenderRouter = createKalenderRouter(store);
  router.use('/kalender', ...apiAuthProfile, kalenderRouter);
  // DEPRECATED - Nachfolger: /api/v1/stammdaten/kalender
  router.use('/stammdaten/kalender', ...apiAuthProfile, kalenderRouter);

  router.get('/urlaub', ...apiAuthProfile, ccinternUrlaubSehen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const status = nullableTrimmed(req.query?.status);
      const typ = nullableTrimmed(req.query?.typ);
      const von = nullableTrimmed(req.query?.von);
      const bis = nullableTrimmed(req.query?.bis);
      if (status && !erlaubteUrlaubStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status (offen/genehmigt/abgelehnt).');
      }
      if (typ && !erlaubteUrlaubTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger typ (urlaub/krank/sonstig).');
      }
      const total = await store.countUrlaubByFirma(firmaId, { status, typ, von, bis });
      const rows = await store.listUrlaubByFirma(firmaId, { offset, limit, status, typ, von, bis });
      return sendSuccess(res, 200, {
        urlaub: rows.map(mapUrlaub),
        total,
        page,
        limit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/urlaub', ...apiAuthProfile, ccinternUrlaubErstellen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const mitarbeiterId = requiredTrimmed(req.body?.mitarbeiter_id);
      if (!mitarbeiterId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mitarbeiter_id" ist erforderlich.');
      if (!(await store.getUserById(mitarbeiterId))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Mitarbeiter nicht gefunden.');
      }
      const von = optionalIsoLike(req.body?.von);
      const bis = optionalIsoLike(req.body?.bis);
      if (!von || !bis) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Felder "von" und "bis" sind erforderlich (gültige Datumswerte).');
      }
      const tage = berechneUrlaubTage(von, bis);
      if (tage == null) return sendError(res, 400, 'VALIDATION_ERROR', '"bis" muss >= "von" sein.');
      const typ = nullableTrimmed(req.body?.typ) || 'urlaub';
      if (!erlaubteUrlaubTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger typ (urlaub/krank/sonstig).');
      }
      const status = nullableTrimmed(req.body?.status) || 'offen';
      if (!erlaubteUrlaubStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status (offen/genehmigt/abgelehnt).');
      }
      const nowIso = new Date().toISOString();
      const antragId = randomUUID();
      const bemerkung = nullableTrimmed(req.body?.bemerkung);
      let kalenderTerminId = null;
      /** @type {string|null} */
      let kalenderTerminIdsJson = null;
      if (status === 'genehmigt') {
        const created = await createGenehmigteUrlaubKalenderTermine(store, {
          firmaId,
          mitarbeiterId,
          von,
          bis,
          bemerkung,
          erstelltVon: req.auth.userId,
          mitarbeiterName: null,
        });
        kalenderTerminId = created.kalender_termin_id;
        kalenderTerminIdsJson = created.kalender_termin_ids;
      }
      const row = await store.insertUrlaubAntrag({
        id: antragId,
        mitarbeiter_id: mitarbeiterId,
        von,
        bis,
        tage,
        typ,
        status,
        bemerkung,
        entschieden_von: status === 'genehmigt' || status === 'abgelehnt' ? req.auth.userId : null,
        entschieden_am: status === 'genehmigt' || status === 'abgelehnt' ? nowIso : null,
        kalender_termin_id: kalenderTerminId,
        kalender_termin_ids: kalenderTerminIdsJson,
        firma_id: firmaId,
      });
      return sendSuccess(res, 201, { urlaub: mapUrlaub(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/urlaub/:id', ...apiAuthProfile, ccinternUrlaubBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Urlaub-ID.');
      const cur = await store.getUrlaubById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Urlaubsantrag nicht gefunden.');

      const mitarbeiterId = requiredTrimmed(req.body?.mitarbeiter_id);
      if (!mitarbeiterId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mitarbeiter_id" ist erforderlich.');
      if (!(await store.getUserById(mitarbeiterId))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Mitarbeiter nicht gefunden.');
      }
      const von = optionalIsoLike(req.body?.von);
      const bis = optionalIsoLike(req.body?.bis);
      if (!von || !bis) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Felder "von" und "bis" sind erforderlich (gültige Datumswerte).');
      }
      const tage = berechneUrlaubTage(von, bis);
      if (tage == null) return sendError(res, 400, 'VALIDATION_ERROR', '"bis" muss >= "von" sein.');
      const typ = nullableTrimmed(req.body?.typ) || 'urlaub';
      if (!erlaubteUrlaubTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger typ (urlaub/krank/sonstig).');
      }
      const status = nullableTrimmed(req.body?.status) || 'offen';
      if (!erlaubteUrlaubStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status (offen/genehmigt/abgelehnt).');
      }
      const bemerkung = nullableTrimmed(req.body?.bemerkung);
      await deleteAllKalenderTermineForUrlaubAntrag(store, firmaId, cur);
      let kalenderTerminId = null;
      /** @type {string|null} */
      let kalenderTerminIdsJson = null;
      if (status === 'genehmigt') {
        const created = await createGenehmigteUrlaubKalenderTermine(store, {
          firmaId,
          mitarbeiterId,
          von,
          bis,
          bemerkung,
          erstelltVon: req.auth.userId,
          mitarbeiterName: null,
        });
        kalenderTerminId = created.kalender_termin_id;
        kalenderTerminIdsJson = created.kalender_termin_ids;
      }
      const nowIso = new Date().toISOString();
      const row = await store.updateUrlaubAntrag(id, firmaId, {
        mitarbeiter_id: mitarbeiterId,
        von,
        bis,
        tage,
        typ,
        status,
        bemerkung,
        entschieden_von: status === 'genehmigt' || status === 'abgelehnt' ? req.auth.userId : null,
        entschieden_am: status === 'genehmigt' || status === 'abgelehnt' ? nowIso : null,
        kalender_termin_id: kalenderTerminId,
        kalender_termin_ids: kalenderTerminIdsJson,
      });
      return sendSuccess(res, 200, { urlaub: mapUrlaub(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/urlaub/:id', ...apiAuthProfile, ccinternUrlaubBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Urlaub-ID.');
      const cur = await store.getUrlaubById(id, firmaId);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Urlaubsantrag nicht gefunden.');
      await deleteAllKalenderTermineForUrlaubAntrag(store, firmaId, cur);
      await store.deleteUrlaubAntrag(id, firmaId);
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/lager', ...apiAuthProfile, ccinternLagerSehen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const kategorie = nullableTrimmed(req.query?.kategorie);
      const total = await store.countLagerMaterialByFirma(firmaId, { kategorie });
      const rows = await store.listLagerMaterialByFirma(firmaId, { offset, limit, kategorie });
      return sendSuccess(res, 200, {
        lager: rows.map(mapLagerMaterial),
        total,
        page,
        limit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/lager', ...apiAuthProfile, ccinternLagerErstellen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const einheit = requiredTrimmed(req.body?.einheit);
      if (!einheit) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "einheit" ist erforderlich.');
      const menge = Number(req.body?.menge ?? 0);
      if (!Number.isFinite(menge) || menge < 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "menge" ist ungültig.');
      const mindestbestand = Number(req.body?.mindestbestand ?? 0);
      if (!Number.isFinite(mindestbestand) || mindestbestand < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mindestbestand" ist ungültig.');
      }
      const row = await store.insertLagerMaterial({
        id: randomUUID(),
        name,
        kategorie: nullableTrimmed(req.body?.kategorie),
        menge,
        einheit,
        mindestbestand,
        artikelnummer: nullableTrimmed(req.body?.artikelnummer),
        lagerort: nullableTrimmed(req.body?.lagerort),
        firma_id: firmaId,
      });
      return sendSuccess(res, 201, { material: mapLagerMaterial(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/lager/:id', ...apiAuthProfile, ccinternLagerBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Material-ID.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const einheit = requiredTrimmed(req.body?.einheit);
      if (!einheit) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "einheit" ist erforderlich.');
      const menge = Number(req.body?.menge ?? 0);
      if (!Number.isFinite(menge) || menge < 0) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "menge" ist ungültig.');
      const mindestbestand = Number(req.body?.mindestbestand ?? 0);
      if (!Number.isFinite(mindestbestand) || mindestbestand < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "mindestbestand" ist ungültig.');
      }
      const row = await store.updateLagerMaterial(id, firmaId, {
        name,
        kategorie: nullableTrimmed(req.body?.kategorie),
        menge,
        einheit,
        mindestbestand,
        artikelnummer: nullableTrimmed(req.body?.artikelnummer),
        lagerort: nullableTrimmed(req.body?.lagerort),
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Material nicht gefunden.');
      return sendSuccess(res, 200, { material: mapLagerMaterial(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/lager/:id', ...apiAuthProfile, ccinternLagerBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Material-ID.');
      const ok = await store.deleteLagerMaterial(id, firmaId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Material nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/lager/:id/buchungen', ...apiAuthProfile, ccinternLagerBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const materialId = requiredTrimmed(req.params.id);
      if (!materialId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Material-ID.');
      const typ = requiredTrimmed(req.body?.typ);
      if (!typ || !erlaubteLagerBuchungsTypen.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "typ" muss entnahme/zugang/korrektur sein.');
      }
      const menge = Number(req.body?.menge);
      if (!Number.isFinite(menge) || menge <= 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "menge" muss > 0 sein.');
      }
      const auftragId = nullableTrimmed(req.body?.auftrag_id);
      if (auftragId) {
        const a = await store.getCcInternAuftragById(auftragId, firmaId);
        if (!a) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig oder gehört zu einer anderen Firma.');
        }
      }
      const result = await store.insertLagerBuchungAndAdjust(materialId, firmaId, {
        id: randomUUID(),
        menge,
        typ,
        mitarbeiter_id: nullableTrimmed(req.body?.mitarbeiter_id),
        auftrag_id: auftragId ?? null,
        bemerkung: nullableTrimmed(req.body?.bemerkung),
      });
      if (result?.error === 'MATERIAL_NOT_FOUND') {
        return sendError(res, 404, 'NOT_FOUND', 'Material nicht gefunden.');
      }
      if (result?.error === 'NEGATIVE_STOCK') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Bestand darf nicht negativ werden.');
      }
      if (result?.error) {
        return sendError(res, 400, 'VALIDATION_ERROR', `Buchung fehlgeschlagen (${result.error}).`);
      }
      const material = mapLagerMaterial(result.material);
      const buchung = mapLagerBuchung(result.buchung);
      const warnung =
        material.menge < material.mindestbestand
          ? `Mindestbestand unterschritten (${material.menge} < ${material.mindestbestand}).`
          : null;
      return sendSuccess(res, 201, { material, buchung, warnung });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/lager/:id/buchungen', ...apiAuthProfile, ccinternLagerSehen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const materialId = requiredTrimmed(req.params.id);
      if (!materialId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Material-ID.');
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countLagerBuchungenByMaterial(materialId, firmaId);
      const rows = await store.listLagerBuchungenByMaterial(materialId, firmaId, { offset, limit });
      return sendSuccess(res, 200, {
        buchungen: rows.map(mapLagerBuchung),
        total,
        page,
        limit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  /**
   * CC Intern — Schnellanfragen (ein Router, zwei Mounts: legacy + Zielpfad).
   * @returns {import('express').Router}
   */
  function createAnfragenRouter() {
    const anfragenR = Router();
    anfragenR.get('/', ccinternAnfragenSehen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
        const status = nullableTrimmed(req.query?.status);
        if (status && !erlaubteAnfrageStatus.has(status)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        }
        const total = await store.countCcInternAnfragenByFirma(firmaId, { status });
        const rows = await store.listCcInternAnfragenByFirma(firmaId, { offset, limit, status });
        return sendSuccess(res, 200, {
          anfragen: rows.map(mapAnfrage),
          total,
          page,
          limit,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    anfragenR.get('/:id', ccinternAnfragenSehen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Anfrage-ID.');
        const row = await store.getCcInternAnfrageById(id, firmaId);
        if (!row) {
          return sendError(res, 404, 'NOT_FOUND', 'Anfrage nicht gefunden.');
        }
        if (row.deleted_at != null && String(row.deleted_at).trim() !== '') {
          return sendError(res, 404, 'NOT_FOUND', 'Anfrage nicht gefunden.');
        }
        return sendSuccess(res, 200, { anfrage: mapAnfrage(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    anfragenR.post('/', ccinternAnfragenErstellen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const betreff = requiredTrimmed(req.body?.betreff);
        if (!betreff) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "betreff" ist erforderlich.');
        const status = nullableTrimmed(req.body?.status) || 'offen';
        if (!erlaubteAnfrageStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        const kundeId = nullableTrimmed(req.body?.kunde_id);
        if (kundeId) {
          const k = await store.getFirmaById(kundeId);
          if (!k) return sendError(res, 400, 'VALIDATION_ERROR', 'kunde_id ist ungültig.');
        }
        const zugewiesenAn = nullableTrimmed(req.body?.zugewiesen_an);
        if (zugewiesenAn && !(await store.getUserById(zugewiesenAn))) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'zugewiesen_an ist ungültig.');
        }
        const antwortBis = optionalIsoLike(req.body?.antwort_bis);
        if (req.body?.antwort_bis != null && String(req.body?.antwort_bis).trim() !== '' && antwortBis === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'antwort_bis ist kein gültiges Datum.');
        }

        const year = new Date().getFullYear();
        const last = await store.getLastCcInternAnfragenNrForYear(year);
        const m = String(last?.anfragen_nr || '').match(new RegExp(`^ANF-${year}-(\\d{3})$`));
        const nextNr = (m ? Number.parseInt(m[1], 10) : 0) + 1;
        const anfragenNr = `ANF-${year}-${String(nextNr).padStart(3, '0')}`;

        const row = await store.insertCcInternAnfrage({
          id: randomUUID(),
          anfragen_nr: anfragenNr,
          kunde_id: kundeId ?? null,
          betreff,
          beschreibung: nullableTrimmed(req.body?.beschreibung),
          status,
          zugewiesen_an: zugewiesenAn ?? null,
          antwort_bis: antwortBis ?? null,
          firma_id: firmaId,
          erstellt_von: req.auth.userId,
        });
        return sendSuccess(res, 201, { anfrage: mapAnfrage(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    anfragenR.put('/:id', ccinternAnfragenBearbeiten, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Anfrage-ID.');
        const betreff = requiredTrimmed(req.body?.betreff);
        if (!betreff) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "betreff" ist erforderlich.');
        const status = nullableTrimmed(req.body?.status) || 'offen';
        if (!erlaubteAnfrageStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        const kundeId = nullableTrimmed(req.body?.kunde_id);
        if (kundeId) {
          const k = await store.getFirmaById(kundeId);
          if (!k) return sendError(res, 400, 'VALIDATION_ERROR', 'kunde_id ist ungültig.');
        }
        const zugewiesenAn = nullableTrimmed(req.body?.zugewiesen_an);
        if (zugewiesenAn && !(await store.getUserById(zugewiesenAn))) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'zugewiesen_an ist ungültig.');
        }
        const antwortBis = optionalIsoLike(req.body?.antwort_bis);
        if (req.body?.antwort_bis != null && String(req.body?.antwort_bis).trim() !== '' && antwortBis === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'antwort_bis ist kein gültiges Datum.');
        }
        const row = await store.updateCcInternAnfrage(id, firmaId, {
          kunde_id: kundeId ?? null,
          betreff,
          beschreibung: nullableTrimmed(req.body?.beschreibung),
          status,
          zugewiesen_an: zugewiesenAn ?? null,
          antwort_bis: antwortBis ?? null,
        });
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Anfrage nicht gefunden.');
        return sendSuccess(res, 200, { anfrage: mapAnfrage(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    anfragenR.delete('/:id', ccinternAnfragenBearbeiten, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Anfrage-ID.');
        const ok = await store.deleteCcInternAnfrage(id, firmaId);
        if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Anfrage nicht gefunden.');
        return sendSuccess(res, 200, { deleted: true, id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    return anfragenR;
  }

  const anfragenRouter = createAnfragenRouter();
  // DEPRECATED — wird in Phase 2 entfernt; Nachfolger: /api/v1/ccintern/anfragen
  router.use('/anfragen', ...apiAuthProfile, anfragenRouter);
  router.use('/ccintern/anfragen', ...apiAuthProfile, anfragenRouter);

  router.get('/aufgaben', ...apiAuthProfile, ccinternAufgabenSehen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const status = nullableTrimmed(req.query?.status);
      if (status && !erlaubteAufgabeStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      }
      const total = await store.countAufgabenByFirma(firmaId, { status });
      const rows = await store.listAufgabenByFirma(firmaId, { offset, limit, status });
      return sendSuccess(res, 200, {
        aufgaben: rows.map(mapAufgabe),
        total,
        page,
        limit,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/aufgaben', ...apiAuthProfile, ccinternAufgabenErstellen, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      const zugewiesenAn = nullableTrimmed(req.body?.zugewiesen_an);
      if (zugewiesenAn && !(await store.getUserById(zugewiesenAn))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'zugewiesen_an ist ungültig.');
      }
      const auftragId = nullableTrimmed(req.body?.auftrag_id);
      if (auftragId) {
        const auftrag = await store.getCcInternAuftragById(auftragId, firmaId);
        if (!auftrag) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig.');
      }
      const faelligAm = optionalIsoLike(req.body?.faellig_am);
      if (req.body?.faellig_am != null && String(req.body?.faellig_am).trim() !== '' && faelligAm === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'faellig_am ist kein gültiges Datum.');
      }
      const status = nullableTrimmed(req.body?.status) || 'offen';
      if (!erlaubteAufgabeStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      const prioritaet = nullableTrimmed(req.body?.prioritaet) || 'normal';
      if (!erlaubteAufgabePrioritaet.has(prioritaet)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige prioritaet.');

      const row = await store.insertAufgabe({
        id: randomUUID(),
        titel,
        beschreibung: nullableTrimmed(req.body?.beschreibung),
        zugewiesen_an: zugewiesenAn ?? null,
        auftrag_id: auftragId ?? null,
        faellig_am: faelligAm ?? null,
        status,
        prioritaet,
        firma_id: firmaId,
        erstellt_von: req.auth.userId,
      });
      return sendSuccess(res, 201, { aufgabe: mapAufgabe(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/aufgaben/:id', ...apiAuthProfile, ccinternAufgabenBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Aufgaben-ID.');
      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      const zugewiesenAn = nullableTrimmed(req.body?.zugewiesen_an);
      if (zugewiesenAn && !(await store.getUserById(zugewiesenAn))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'zugewiesen_an ist ungültig.');
      }
      const auftragId = nullableTrimmed(req.body?.auftrag_id);
      if (auftragId) {
        const auftrag = await store.getCcInternAuftragById(auftragId, firmaId);
        if (!auftrag) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig.');
      }
      const faelligAm = optionalIsoLike(req.body?.faellig_am);
      if (req.body?.faellig_am != null && String(req.body?.faellig_am).trim() !== '' && faelligAm === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'faellig_am ist kein gültiges Datum.');
      }
      const status = nullableTrimmed(req.body?.status) || 'offen';
      if (!erlaubteAufgabeStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      const prioritaet = nullableTrimmed(req.body?.prioritaet) || 'normal';
      if (!erlaubteAufgabePrioritaet.has(prioritaet)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige prioritaet.');

      const row = await store.updateAufgabe(id, firmaId, {
        titel,
        beschreibung: nullableTrimmed(req.body?.beschreibung),
        zugewiesen_an: zugewiesenAn ?? null,
        auftrag_id: auftragId ?? null,
        faellig_am: faelligAm ?? null,
        status,
        prioritaet,
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Aufgabe nicht gefunden.');
      return sendSuccess(res, 200, { aufgabe: mapAufgabe(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/aufgaben/:id', ...apiAuthProfile, ccinternAufgabenBearbeiten, async (req, res) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Aufgaben-ID.');
      const ok = await store.deleteAufgabe(id, firmaId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Aufgabe nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  function createRechnungenRouter(storeArg) {
    const rechnungenR = Router();
    rechnungenR.get('/', ccinternRechnungenSehen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
        const status = nullableTrimmed(req.query?.status);
        if (status && !erlaubteRechnungsStatus.has(status)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        }
        const total = await storeArg.countCcInternRechnungenByFirma(firmaId, { status });
        const rows = await storeArg.listCcInternRechnungenByFirma(firmaId, { offset, limit, status });
        return sendSuccess(res, 200, {
          rechnungen: rows.map(mapRechnung),
          total,
          page,
          limit,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    rechnungenR.get('/:id', ccinternRechnungenSehen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Rechnungs-ID.');
        const row = await storeArg.getCcInternRechnungById(id, firmaId);
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
        return sendSuccess(res, 200, { rechnung: mapRechnung(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    rechnungenR.post('/', ccinternRechnungenErstellen, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.body?.auftrag_id);
        if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "auftrag_id" ist erforderlich.');
        const auftrag = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!auftrag) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig.');
        const status = nullableTrimmed(req.body?.status) || 'offen';
        if (!erlaubteRechnungsStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        const faelligAm = optionalIsoLike(req.body?.faellig_am);
        if (req.body?.faellig_am != null && String(req.body?.faellig_am).trim() !== '' && faelligAm === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'faellig_am ist kein gültiges Datum.');
        }
        const bezahltAm = optionalIsoLike(req.body?.bezahlt_am);
        if (req.body?.bezahlt_am != null && String(req.body?.bezahlt_am).trim() !== '' && bezahltAm === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'bezahlt_am ist kein gültiges Datum.');
        }

        const year = new Date().getFullYear();
        const last = await storeArg.getLastCcInternRechnungsnummerForYear(year);
        const m = String(last?.rechnungsnummer || '').match(new RegExp(`^RE-${year}-(\\d{3})$`));
        const nextNr = (m ? Number.parseInt(m[1], 10) : 0) + 1;
        const rechnungsnummer = `RE-${year}-${String(nextNr).padStart(3, '0')}`;
        const bemerkungStored = buildCcInternRechnungBemerkungForStore(nullableTrimmed(req.body?.bemerkung), req.body || {});
        const row = await storeArg.insertCcInternRechnung({
          id: randomUUID(),
          rechnungsnummer,
          auftrag_id: auftragId,
          status,
          faellig_am: faelligAm ?? null,
          bezahlt_am: bezahltAm ?? null,
          bemerkung: bemerkungStored,
          firma_id: firmaId,
          erstellt_von: req.auth.userId,
        });
        return sendSuccess(res, 201, { rechnung: mapRechnung(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    rechnungenR.put('/:id', ccinternRechnungenBearbeiten, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Rechnungs-ID.');
        const auftragId = requiredTrimmed(req.body?.auftrag_id);
        if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "auftrag_id" ist erforderlich.');
        const auftrag = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!auftrag) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id ist ungültig.');
        const status = nullableTrimmed(req.body?.status) || 'offen';
        if (!erlaubteRechnungsStatus.has(status)) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
        const faelligAm = optionalIsoLike(req.body?.faellig_am);
        if (req.body?.faellig_am != null && String(req.body?.faellig_am).trim() !== '' && faelligAm === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'faellig_am ist kein gültiges Datum.');
        }
        const bezahltAm = optionalIsoLike(req.body?.bezahlt_am);
        if (req.body?.bezahlt_am != null && String(req.body?.bezahlt_am).trim() !== '' && bezahltAm === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'bezahlt_am ist kein gültiges Datum.');
        }
        const existingRow = await storeArg.getCcInternRechnungById(id, firmaId);
        if (!existingRow) return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
        const prev = parseCcInternRechnungBemerkung(existingRow.bemerkung);
        /** @type {Record<string, unknown>} */
        const overlay = Object.assign({}, prev.meta);
        const b = req.body || {};
        if (Object.prototype.hasOwnProperty.call(b, 'angebot_id')) {
          const v = nullableTrimmed(b.angebot_id);
          if (v) overlay.angebot_id = v;
          else delete overlay.angebot_id;
        }
        if (Object.prototype.hasOwnProperty.call(b, 'betreff')) {
          const v = nullableTrimmed(b.betreff);
          if (v) overlay.betreff = v;
          else delete overlay.betreff;
        }
        if (Object.prototype.hasOwnProperty.call(b, 'datum')) {
          const v = nullableTrimmed(b.datum);
          if (v) overlay.datum = v;
          else delete overlay.datum;
        }
        if (Object.prototype.hasOwnProperty.call(b, 'positionen')) {
          if (Array.isArray(b.positionen)) overlay.positionen = b.positionen;
          else delete overlay.positionen;
        }
        if (Object.prototype.hasOwnProperty.call(b, 'netto')) {
          if (b.netto != null && String(b.netto).trim() !== '') {
            const n = Number(b.netto);
            if (!Number.isNaN(n)) overlay.netto = n;
            else delete overlay.netto;
          } else delete overlay.netto;
        }
        if (Object.prototype.hasOwnProperty.call(b, 'brutto')) {
          if (b.brutto != null && String(b.brutto).trim() !== '') {
            const br = Number(b.brutto);
            if (!Number.isNaN(br)) overlay.brutto = br;
            else delete overlay.brutto;
          } else delete overlay.brutto;
        }
        const cleanIn = Object.prototype.hasOwnProperty.call(b, 'bemerkung')
          ? nullableTrimmed(b.bemerkung)
          : prev.clean;
        const bemerkungStored = buildCcInternRechnungBemerkungForStore(cleanIn, overlay);
        const row = await storeArg.updateCcInternRechnung(id, firmaId, {
          auftrag_id: auftragId,
          status,
          faellig_am: faelligAm ?? null,
          bezahlt_am: bezahltAm ?? null,
          bemerkung: bemerkungStored,
        });
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
        return sendSuccess(res, 200, { rechnung: mapRechnung(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    rechnungenR.delete('/:id', ccinternRechnungenBearbeiten, async (req, res) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Rechnungs-ID.');
        const ok = await storeArg.deleteCcInternRechnung(id, firmaId);
        if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Rechnung nicht gefunden.');
        return sendSuccess(res, 200, { deleted: true, id });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    });

    return rechnungenR;
  }

  const rechnungenRouter = createRechnungenRouter(store);
  router.use('/rechnungen', ...apiAuthProfile, rechnungenRouter);
  // DEPRECATED — Nachfolger: /api/v1/ccintern/rechnungen
  router.use('/ccintern/rechnungen', ...apiAuthProfile, rechnungenRouter);

  // ─── MesseFlow Workspace ──────────────────────────────────────
  router.get('/messeflow/workspace', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const row = await store.getMesseflowWorkspace();
      if (!row) return sendSuccess(res, 200, { workspace: null });
      let payload = null;
      try { payload = JSON.parse(row.payload_json); } catch { payload = null; }
      return sendSuccess(res, 200, { workspace: { payload, updated_at: row.updated_at } });
    } catch (e) { return next(e); }
  });

  router.put('/messeflow/workspace', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const payloadJson = b.payload != null ? (typeof b.payload === 'string' ? b.payload : JSON.stringify(b.payload)) : '{}';
      const row = await store.upsertMesseflowWorkspace({ payloadJson });
      let payload = null;
      try { payload = JSON.parse(row.payload_json); } catch { payload = null; }
      await logAudit(store, {
        user: req.auth,
        modul: 'messeflow',
        action: 'PUT',
        resource_type: 'messeflow_workspace',
        resource_id: 'default',
        project_id: null,
        payload: { size: typeof payloadJson === 'string' ? payloadJson.length : null },
      });
      return sendSuccess(res, 200, { workspace: { payload, updated_at: row.updated_at } });
    } catch (e) { return next(e); }
  });

  router.get('/messeflow/projekte', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const projekte = await store.listMfProjekte();
      return sendSuccess(res, 200, { projekte });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const row = await store.insertMfProjekt({
        id: b.id != null ? String(b.id).trim() || null : null,
        name: b.name != null ? String(b.name).trim() : '',
        status: b.status != null ? String(b.status).trim() || 'aktiv' : 'aktiv',
        verantwortlicher: b.verantwortlicher != null ? String(b.verantwortlicher).trim() || null : null,
        messe_name: b.messe_name != null ? String(b.messe_name).trim() || null : null,
        messe_datum_von: b.messe_datum_von != null ? String(b.messe_datum_von).trim() || null : null,
        messe_datum_bis: b.messe_datum_bis != null ? String(b.messe_datum_bis).trim() || null : null,
        ort: b.ort != null ? String(b.ort).trim() || null : null,
        notizen: b.notizen != null ? String(b.notizen) : null,
        extra_json: b.extra_json != null
          ? (typeof b.extra_json === 'string' ? b.extra_json : JSON.stringify(b.extra_json))
          : null,
      });
      await logAudit(store, {
        user: req.auth,
        modul: 'messeflow',
        action: 'POST',
        resource_type: 'mf_projekt',
        resource_id: row?.id ?? null,
        project_id: null,
        payload: { name: row?.name ?? null },
      });
      return sendSuccess(res, 201, { projekt: row });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte/:projektId', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      if (!projektId) return sendError(res, 400, 'BAD_REQUEST', 'projektId fehlt.');
      const projekt = await store.getMfProjektById(projektId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return sendSuccess(res, 200, { projekt });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/messeflow/projekte/:projektId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      if (!projektId) return sendError(res, 400, 'BAD_REQUEST', 'projektId fehlt.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(b, 'name')) patch.name = b.name != null ? String(b.name).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'status')) patch.status = b.status != null ? String(b.status).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'verantwortlicher')) patch.verantwortlicher = b.verantwortlicher != null ? String(b.verantwortlicher).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'messe_name')) patch.messe_name = b.messe_name != null ? String(b.messe_name).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'messe_datum_von')) patch.messe_datum_von = b.messe_datum_von != null ? String(b.messe_datum_von).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'messe_datum_bis')) patch.messe_datum_bis = b.messe_datum_bis != null ? String(b.messe_datum_bis).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'ort')) patch.ort = b.ort != null ? String(b.ort).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'notizen')) patch.notizen = b.notizen != null ? String(b.notizen) : null;
      if (Object.prototype.hasOwnProperty.call(b, 'extra_json')) {
        patch.extra_json = b.extra_json != null
          ? (typeof b.extra_json === 'string' ? b.extra_json : JSON.stringify(b.extra_json))
          : null;
      }
      const projekt = await store.updateMfProjektById(projektId, patch);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return sendSuccess(res, 200, { projekt });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/projekte/:projektId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      if (!projektId) return sendError(res, 400, 'BAD_REQUEST', 'projektId fehlt.');
      const ok = await store.deleteMfProjektById(projektId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte/:projektId/users', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      const users = await store.listMfProjektUsers(projektId);
      return sendSuccess(res, 200, { users });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte/:projektId/users', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      const userId = req.body?.user_id != null ? String(req.body.user_id).trim() : '';
      if (!projektId || !userId) return sendError(res, 400, 'BAD_REQUEST', 'projektId/user_id fehlen.');
      const user = await store.upsertMfProjektUser(projektId, userId, req.body?.rolle ?? 'mitarbeiter');
      return sendSuccess(res, 201, { user });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/projekte/:projektId/users/:userId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      const userId = String(req.params.userId || '').trim();
      const ok = await store.deleteMfProjektUser(projektId, userId);
      return sendSuccess(res, 200, { deleted: Boolean(ok) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte/:projektId/aufgaben', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      const aufgaben = await store.listMfAufgaben(projektId);
      return sendSuccess(res, 200, { aufgaben });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte/:projektId/aufgaben', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      if (!projektId) return sendError(res, 400, 'BAD_REQUEST', 'projektId fehlt.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const aufgabe = await store.insertMfAufgabe({
        id: b.id != null ? String(b.id).trim() || null : null,
        projekt_id: projektId,
        titel: b.titel != null ? String(b.titel).trim() : '',
        beschreibung: b.beschreibung != null ? String(b.beschreibung) : null,
        status: b.status != null ? String(b.status).trim() || 'offen' : 'offen',
        prioritaet: b.prioritaet != null ? String(b.prioritaet).trim() || 'normal' : 'normal',
        faellig_am: b.faellig_am != null ? String(b.faellig_am).trim() || null : null,
        zugewiesen_an: b.zugewiesen_an != null ? String(b.zugewiesen_an).trim() || null : null,
        extra_json: b.extra_json != null
          ? (typeof b.extra_json === 'string' ? b.extra_json : JSON.stringify(b.extra_json))
          : null,
      });
      return sendSuccess(res, 201, { aufgabe });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/messeflow/aufgaben/:aufgabeId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const aufgabeId = String(req.params.aufgabeId || '').trim();
      if (!aufgabeId) return sendError(res, 400, 'BAD_REQUEST', 'aufgabeId fehlt.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(b, 'titel')) patch.titel = b.titel != null ? String(b.titel).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'beschreibung')) patch.beschreibung = b.beschreibung != null ? String(b.beschreibung) : null;
      if (Object.prototype.hasOwnProperty.call(b, 'status')) patch.status = b.status != null ? String(b.status).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'prioritaet')) patch.prioritaet = b.prioritaet != null ? String(b.prioritaet).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'faellig_am')) patch.faellig_am = b.faellig_am != null ? String(b.faellig_am).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'zugewiesen_an')) patch.zugewiesen_an = b.zugewiesen_an != null ? String(b.zugewiesen_an).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'extra_json')) patch.extra_json = b.extra_json != null ? (typeof b.extra_json === 'string' ? b.extra_json : JSON.stringify(b.extra_json)) : null;
      const aufgabe = await store.updateMfAufgabeById(aufgabeId, patch);
      if (!aufgabe) return sendError(res, 404, 'NOT_FOUND', 'Aufgabe nicht gefunden.');
      return sendSuccess(res, 200, { aufgabe });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/aufgaben/:aufgabeId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const aufgabeId = String(req.params.aufgabeId || '').trim();
      const ok = await store.deleteMfAufgabeById(aufgabeId);
      return sendSuccess(res, 200, { deleted: Boolean(ok) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte/:projektId/dokumente', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      const dokumente = await store.listMfDokumente(projektId);
      return sendSuccess(res, 200, { dokumente });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte/:projektId/dokumente', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const projektId = String(req.params.projektId || '').trim();
      if (!projektId) return sendError(res, 400, 'BAD_REQUEST', 'projektId fehlt.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const dokument = await store.insertMfDokument({
        id: b.id != null ? String(b.id).trim() || null : null,
        projekt_id: projektId,
        name: b.name != null ? String(b.name).trim() : '',
        typ: b.typ != null ? String(b.typ).trim() || null : null,
        url: b.url != null ? String(b.url).trim() || null : null,
        pruef_status: b.pruef_status != null ? String(b.pruef_status).trim() || 'ausstehend' : 'ausstehend',
        pruef_ergebnis_json: b.pruef_ergebnis_json != null
          ? (typeof b.pruef_ergebnis_json === 'string' ? b.pruef_ergebnis_json : JSON.stringify(b.pruef_ergebnis_json))
          : null,
        uploaded_by: b.uploaded_by != null ? String(b.uploaded_by).trim() || null : req.auth.userId,
      });
      return sendSuccess(res, 201, { dokument });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/messeflow/dokumente/:dokumentId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const dokumentId = String(req.params.dokumentId || '').trim();
      if (!dokumentId) return sendError(res, 400, 'BAD_REQUEST', 'dokumentId fehlt.');
      const b = req.body && typeof req.body === 'object' ? req.body : {};
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(b, 'name')) patch.name = b.name != null ? String(b.name).trim() : '';
      if (Object.prototype.hasOwnProperty.call(b, 'typ')) patch.typ = b.typ != null ? String(b.typ).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'url')) patch.url = b.url != null ? String(b.url).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'pruef_status')) patch.pruef_status = b.pruef_status != null ? String(b.pruef_status).trim() || null : null;
      if (Object.prototype.hasOwnProperty.call(b, 'pruef_ergebnis_json')) {
        patch.pruef_ergebnis_json = b.pruef_ergebnis_json != null
          ? (typeof b.pruef_ergebnis_json === 'string' ? b.pruef_ergebnis_json : JSON.stringify(b.pruef_ergebnis_json))
          : null;
      }
      if (Object.prototype.hasOwnProperty.call(b, 'uploaded_by')) patch.uploaded_by = b.uploaded_by != null ? String(b.uploaded_by).trim() || null : null;
      const dokument = await store.updateMfDokumentById(dokumentId, patch);
      if (!dokument) return sendError(res, 404, 'NOT_FOUND', 'Dokument nicht gefunden.');
      return sendSuccess(res, 200, { dokument });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/dokumente/:dokumentId', ...apiAuthProfile, messeflowWorkspaceSchreiben, async (req, res, next) => {
    try {
      const dokumentId = String(req.params.dokumentId || '').trim();
      const ok = await store.deleteMfDokumentById(dokumentId);
      return sendSuccess(res, 200, { deleted: Boolean(ok) });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte', ...apiAuthProfile, ccinternMesseflowSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const { limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const status = nullableTrimmed(req.query?.status);
      if (status && !erlaubteMesseflowProjektStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      }
      const total = await store.countMesseflowProjekteByFirma(firmaId, { status });
      const rows = await store.listMesseflowProjekteByFirma(firmaId, { offset, limit, status });
      const data = [];
      for (const row of rows) {
        const detail = await loadMesseflowProjektDetail(row.id, firmaId);
        if (detail) data.push(detail);
      }
      return sendSuccess(res, 200, { projekte: data, total });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte', ...apiAuthProfile, ccinternMesseflowErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const status = nullableTrimmed(req.body?.status) || 'neu';
      if (!erlaubteMesseflowProjektStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      }
      const lieferdatum = optionalIsoLike(req.body?.lieferdatum);
      if (req.body?.lieferdatum != null && String(req.body?.lieferdatum).trim() !== '' && lieferdatum === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'lieferdatum ist kein gültiges Datum.');
      }
      const agenturId = nullableTrimmed(req.body?.agentur_id);
      if (agenturId) {
        const agentur = await store.getFirmaById(agenturId);
        if (!agentur) return sendError(res, 400, 'VALIDATION_ERROR', 'agentur_id ist ungültig.');
      }
      const row = await store.insertMesseflowProjekt({
        id: randomUUID(),
        name,
        kunde: nullableTrimmed(req.body?.kunde),
        agentur_id: agenturId ?? null,
        lieferdatum: lieferdatum ?? null,
        status,
        messe: nullableTrimmed(req.body?.messe),
        stand: nullableTrimmed(req.body?.stand),
        prioritaet: nullableTrimmed(req.body?.prioritaet),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
        firma_id: firmaId,
        erstellt_von: req.auth.userId,
      });
      const data = await loadMesseflowProjektDetail(row.id, firmaId);
      return sendSuccess(res, 201, { projekt: data });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/messeflow/projekte/:id', ...apiAuthProfile, ccinternMesseflowSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      if (!projektId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Projekt-ID.');
      const data = await loadMesseflowProjektDetail(projektId, firmaId);
      if (!data) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return sendSuccess(res, 200, { projekt: data });
    } catch (e) {
      return next(e);
    }
  });

  router.put('/messeflow/projekte/:id', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      if (!projektId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Projekt-ID.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const status = nullableTrimmed(req.body?.status) || 'neu';
      if (!erlaubteMesseflowProjektStatus.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status.');
      }
      const lieferdatum = optionalIsoLike(req.body?.lieferdatum);
      if (req.body?.lieferdatum != null && String(req.body?.lieferdatum).trim() !== '' && lieferdatum === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'lieferdatum ist kein gültiges Datum.');
      }
      const agenturId = nullableTrimmed(req.body?.agentur_id);
      if (agenturId) {
        const agentur = await store.getFirmaById(agenturId);
        if (!agentur) return sendError(res, 400, 'VALIDATION_ERROR', 'agentur_id ist ungültig.');
      }
      const row = await store.updateMesseflowProjekt(projektId, firmaId, {
        name,
        kunde: nullableTrimmed(req.body?.kunde),
        agentur_id: agenturId ?? null,
        lieferdatum: lieferdatum ?? null,
        status,
        messe: nullableTrimmed(req.body?.messe),
        stand: nullableTrimmed(req.body?.stand),
        prioritaet: nullableTrimmed(req.body?.prioritaet),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const data = await loadMesseflowProjektDetail(row.id, firmaId);
      return sendSuccess(res, 200, { projekt: data });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/projekte/:id', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      if (!projektId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Projekt-ID.');
      const ok = await store.deleteMesseflowProjekt(projektId, firmaId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true, id: projektId });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte/:id/waende', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      if (!projektId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Projekt-ID.');
      const projekt = await store.getMesseflowProjektById(projektId, firmaId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const row = await store.insertMesseflowWand({
        id: randomUUID(),
        projekt_id: projektId,
        name,
        breite: req.body?.breite != null && String(req.body?.breite).trim() !== '' ? Number(req.body?.breite) : null,
        hoehe: req.body?.hoehe != null && String(req.body?.hoehe).trim() !== '' ? Number(req.body?.hoehe) : null,
        einheit: nullableTrimmed(req.body?.einheit),
        material: nullableTrimmed(req.body?.material),
        status: nullableTrimmed(req.body?.status),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
        sort_index: req.body?.sort_index,
      });
      const data = mapMesseflowWand(row, []);
      return sendSuccess(res, 201, { wand: data });
    } catch (e) {
      return next(e);
    }
  });

  router.put('/messeflow/projekte/:id/waende/:wandId', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      const wandId = requiredTrimmed(req.params.wandId);
      if (!projektId || !wandId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige IDs.');
      const projekt = await store.getMesseflowProjektById(projektId, firmaId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const row = await store.updateMesseflowWand(wandId, projektId, {
        name,
        breite: req.body?.breite != null && String(req.body?.breite).trim() !== '' ? Number(req.body?.breite) : null,
        hoehe: req.body?.hoehe != null && String(req.body?.hoehe).trim() !== '' ? Number(req.body?.hoehe) : null,
        einheit: nullableTrimmed(req.body?.einheit),
        material: nullableTrimmed(req.body?.material),
        status: nullableTrimmed(req.body?.status),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
        sort_index: req.body?.sort_index,
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Wand nicht gefunden.');
      const dateien = (await store.listMesseflowDateienByWand(wandId)).map(mapMesseflowDatei);
      return sendSuccess(res, 200, { wand: mapMesseflowWand(row, dateien) });
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/messeflow/projekte/:id/waende/:wandId', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      const wandId = requiredTrimmed(req.params.wandId);
      if (!projektId || !wandId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige IDs.');
      const projekt = await store.getMesseflowProjektById(projektId, firmaId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const ok = await store.deleteMesseflowWand(wandId, projektId);
      if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Wand nicht gefunden.');
      return sendSuccess(res, 200, { deleted: true, id: wandId });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/messeflow/projekte/:id/waende/:wandId/dateien', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      const wandId = requiredTrimmed(req.params.wandId);
      if (!projektId || !wandId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige IDs.');
      const projekt = await store.getMesseflowProjektById(projektId, firmaId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const wand = await store.getMesseflowWandById(wandId, projektId);
      if (!wand) return sendError(res, 404, 'NOT_FOUND', 'Wand nicht gefunden.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const row = await store.insertMesseflowDatei({
        id: randomUUID(),
        wand_id: wandId,
        name,
        pfad: nullableTrimmed(req.body?.pfad),
        mime_type: nullableTrimmed(req.body?.mime_type),
        groesse: req.body?.groesse != null && String(req.body?.groesse).trim() !== '' ? Number(req.body?.groesse) : null,
        status: nullableTrimmed(req.body?.status),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
        meta_json: req.body?.meta != null ? JSON.stringify(req.body.meta) : null,
      });
      return sendSuccess(res, 201, { datei: mapMesseflowDatei(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.put('/messeflow/projekte/:id/waende/:wandId/dateien/:dateiId', ...apiAuthProfile, ccinternMesseflowBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      const projektId = requiredTrimmed(req.params.id);
      const wandId = requiredTrimmed(req.params.wandId);
      const dateiId = requiredTrimmed(req.params.dateiId);
      if (!projektId || !wandId || !dateiId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige IDs.');
      const projekt = await store.getMesseflowProjektById(projektId, firmaId);
      if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
      const wand = await store.getMesseflowWandById(wandId, projektId);
      if (!wand) return sendError(res, 404, 'NOT_FOUND', 'Wand nicht gefunden.');
      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const row = await store.updateMesseflowDatei(dateiId, wandId, {
        name,
        pfad: nullableTrimmed(req.body?.pfad),
        mime_type: nullableTrimmed(req.body?.mime_type),
        groesse: req.body?.groesse != null && String(req.body?.groesse).trim() !== '' ? Number(req.body?.groesse) : null,
        status: nullableTrimmed(req.body?.status),
        bemerkung: nullableTrimmed(req.body?.bemerkung),
        meta_json: req.body?.meta != null ? JSON.stringify(req.body.meta) : null,
      });
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
      return sendSuccess(res, 200, { datei: mapMesseflowDatei(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.post(
    '/messeflow/projekte/:projektId/waende/:wandId/an-caldera-senden',
    ...apiAuthProfile,
    ccinternMesseflowBearbeiten,
    (req, res, next) => {
      messeflowCalderaMulter.single('datei')(req, res, (err) => {
        if (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return sendError(res, 400, 'VALIDATION_ERROR', `Upload: ${msg}`);
        }
        return next();
      });
    },
    async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const projektId = requiredTrimmed(req.params.projektId);
        const wandId = requiredTrimmed(req.params.wandId);
        if (!projektId || !wandId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige IDs.');
        const projekt = await store.getMesseflowProjektById(projektId, firmaId);
        if (!projekt) return sendError(res, 404, 'NOT_FOUND', 'Projekt nicht gefunden.');
        const wand = await store.getMesseflowWandById(wandId, projektId);
        if (!wand) return sendError(res, 404, 'NOT_FOUND', 'Wand nicht gefunden.');
        const rawPid = req.get('x-project-id');
        const cockpitProjectId = typeof rawPid === 'string' ? rawPid.trim() : '';
        if (!cockpitProjectId) {
          return sendError(res, 400, 'PROJECT_CONTEXT_REQUIRED', PROJECT_CONTEXT_REQUIRED_MESSAGE);
        }
        if (!req.file || !req.file.buffer) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Keine Datei (multipart-Feld „datei“).');
        }
        const rawName = req.file.originalname || 'upload.bin';
        let serverPath;
        try {
          const w = writeUploadBufferSync({
            moduleKey: 'messeflow-waende',
            projectId: cockpitProjectId,
            resourceKey: 'wand',
            buffer: req.file.buffer,
            originalName: rawName,
          });
          serverPath = w.absolutePath;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return sendError(res, 500, 'INTERNAL_ERROR', `Upload-Speicherung fehlgeschlagen: ${msg}`);
        }
        const fileName = path.basename(serverPath);
        const calderaRoot = (process.env.MESSEFLOW_CALDERA_HOTFOLDER || '').trim();
        if (!calderaRoot) {
          return sendError(
            res,
            503,
            'SERVICE_UNAVAILABLE',
            `Caldera-Ziel nicht konfiguriert (MESSEFLOW_CALDERA_HOTFOLDER). Serverpfad: ${serverPath}`,
          );
        }
        try {
          await fs.access(calderaRoot);
        } catch {
          return sendError(
            res,
            502,
            'BAD_GATEWAY',
            `Caldera-Pfad nicht erreichbar oder ungültig: ${calderaRoot}. Serverpfad: ${serverPath}`,
          );
        }
        const calderaDest = path.join(calderaRoot, fileName);
        try {
          await fs.copyFile(serverPath, calderaDest);
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return sendError(
            res,
            502,
            'BAD_GATEWAY',
            `Caldera-Kopie fehlgeschlagen: ${msg} (Serverpfad: ${serverPath}, Ziel: ${calderaRoot})`,
          );
        }
        return sendSuccess(res, 200, {
          serverPfad: serverPath,
          calderaPfad: calderaDest,
          statusDatei: 'Wird gedruckt',
        });
      } catch (e) {
        return next(e);
      }
    },
  );

  function createAuftraegeRouter(storeArg) {
    const auftraegeR = Router();
    auftraegeR.get('/', ccinternAuftraegeSehen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
        const total = await storeArg.countCcInternAuftraegeByFirma(firmaId);
        const rows = await storeArg.listCcInternAuftraegeByFirma(firmaId, { offset, limit });
        return sendSuccess(res, 200, {
          items: rows.map(mapCcInternAuftrag),
          pagination: { page, limit, total },
        });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.post('/', ccinternAuftraegeErstellen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const kunde = requiredTrimmed(req.body?.kunde);
        if (!kunde) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kunde" ist erforderlich.');
        }
        const lieferdatum = optionalIsoLike(req.body?.lieferdatum);
        if (req.body?.lieferdatum != null && String(req.body?.lieferdatum).trim() !== '' && lieferdatum === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "lieferdatum" ist kein gültiges Datum.');
        }
        const montageDatumIn = resolveCcInternMontageDatumInput(req.body);
        if (montageDatumIn.invalid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "montage_datum" ist kein gültiges Datum.');
        }
        const montageDatum = montageDatumIn.value;
        const quelle = nullableTrimmed(req.body?.quelle) || 'manuell';
        if (!new Set(['manuell', 'fusa']).has(quelle)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Quelle (manuell|fusa).');
        }

        const year = new Date().getFullYear();
        const last = await storeArg.getLastCcInternAuftragsnummerForYear(year);
        const m = String(last?.auftragsnummer || '').match(new RegExp(`^AU-${year}-(\\d{3})$`));
        const nextNr = (m ? Number.parseInt(m[1], 10) : 0) + 1;
        const auftragsnummer = `AU-${year}-${String(nextNr).padStart(3, '0')}`;

        const id = randomUUID();
        await storeArg.insertCcInternAuftrag({
          id,
          auftragsnummer,
          kunde,
          status: nullableTrimmed(req.body?.status),
          schritt: nullableTrimmed(req.body?.schritt),
          prioritaet: nullableTrimmed(req.body?.prioritaet),
          lieferdatum,
          montage_datum: montageDatum,
          bemerkung: nullableTrimmed(req.body?.bemerkung),
          fusa_auftrag_id: nullableTrimmed(req.body?.fusa_auftrag_id),
          quelle,
          erstellt_von: req.auth.userId,
          firma_id: firmaId,
        });
        await storeArg.ensureProduktionRowForCcInternAuftrag(id, firmaId);
        const row = await storeArg.getCcInternAuftragById(id, firmaId);
        await syncCcInternMontageTermin({
          store: storeArg,
          ccinternAuftrag: row,
          actorUserId: req.auth.userId,
        });
        await logAudit(storeArg, {
          user: req.auth,
          modul: 'ccintern',
          action: 'POST',
          resource_type: 'ccintern_auftrag',
          resource_id: id,
          project_id: null,
          payload: { auftragsnummer },
        });
        return sendSuccess(res, 201, { auftrag: mapCcInternAuftrag(row) });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.post('/:id/kommentare', ccinternAuftraegeBearbeiten, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.params.id);
        if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const existing = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        const text = requiredTrimmed(req.body?.text);
        if (!text) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "text" ist erforderlich.');
        const row = await storeArg.insertCcInternAuftragKommentar({
          id: randomUUID(),
          auftrag_id: auftragId,
          text,
          autor_id: req.auth.userId,
        });
        return sendSuccess(res, 201, { kommentar: mapCcInternAuftragKommentar(row) });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.get('/:id/kommentare', ccinternAuftraegeSehen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.params.id);
        if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const existing = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        const rows = await storeArg.listCcInternAuftragKommentare(auftragId, firmaId);
        return sendSuccess(res, 200, { kommentare: rows.map(mapCcInternAuftragKommentar) });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.get('/:id/dateien', ccinternAuftraegeSehen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.params.id);
        if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const existing = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        const rows = await storeArg.listCcInternAuftragDateien(auftragId, firmaId);
        return sendSuccess(res, 200, {
          dateien: rows.map((r) => mapCcInternAuftragDatei(r, auftragId)),
        });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.get('/:id/dateien/:dateiId/content', ccinternAuftraegeSehen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.params.id);
        const dateiId = requiredTrimmed(req.params.dateiId);
        if (!auftragId || !dateiId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags- oder Datei-ID.');
        }
        const row = await storeArg.getCcInternAuftragDateiByIdForFirma(dateiId, firmaId);
        if (!row || String(row.auftrag_id).trim() !== auftragId) {
          return sendError(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
        }
        const abs = resolveCcInternServerAbsolute(String(row.server_path || ''));
        if (!abs) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Speicherpfad.');
        try {
          await fs.access(abs);
        } catch {
          return sendError(res, 404, 'NOT_FOUND', 'Datei nicht mehr auf dem Server vorhanden.');
        }
        const mime = String(row.mimetype || 'application/octet-stream').trim();
        res.setHeader('Content-Type', mime);
        res.setHeader(
          'Content-Disposition',
          `inline; filename*=UTF-8''${encodeURIComponent(String(row.originalname || row.filename || 'file'))}`,
        );
        const stream = fsSync.createReadStream(abs);
        stream.on('error', () => {
          try {
            if (!res.headersSent) sendError(res, 500, 'INTERNAL_ERROR', 'Lesefehler.');
          } catch {
            /* ignore */
          }
        });
        stream.pipe(res);
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.post(
      '/:id/dateien/upload',
      ccinternAuftraegeBearbeiten,
      (req, res, next) => {
        ccinternDateiUploadMulter.single('file')(req, res, (err) => {
          if (!err) return next();
          const msg = err instanceof Error ? err.message : String(err);
          if (msg.includes('UNSUPPORTED_MEDIA_TYPE')) {
            return sendError(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Nur JPEG, PNG oder PDF.');
          }
          if (/** @type {{ code?: string }} */ (err).code === 'LIMIT_FILE_SIZE') {
            return sendError(res, 413, 'PAYLOAD_TOO_LARGE', 'Datei zu groß (max. 15 MB).');
          }
          return next(err);
        });
      },
      async (req, res, next) => {
        try {
          const firmaId = await resolveFirmaIdForRequest(req);
          if (!firmaId) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
          }
          const auftragId = requiredTrimmed(req.params.id);
          if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
          const auftrag = await storeArg.getCcInternAuftragById(auftragId, firmaId);
          if (!auftrag) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
          const buf = req.file?.buffer;
          if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Multipart-Feld „file“ fehlt oder ist leer.');
          }
          const typ = normalizeCcInternDateiTyp(req.body?.typ);
          if (!typ) {
            return sendError(
              res,
              400,
              'VALIDATION_ERROR',
              'Feld „typ“ ist ungültig (layout_grafik|druckdatei|kundenfreigabe|montagefoto|entwurf|vorher|nachher).',
            );
          }
          const bereichRaw = nullableTrimmed(req.body?.bereich);
          const bereich = bereichRaw || typ;
          const phase = nullableTrimmed(req.body?.phase) || null;
          const position = nullableTrimmed(req.body?.position) || null;
          const mime = String(req.file.mimetype || '').toLowerCase().trim();
          const projectHeader = nullableTrimmed(req.headers['x-project-id']);
          const auftragLabel = String(auftrag.auftragsnummer || auftrag.id || '').trim();
          const kundeDisp = String(auftrag.kunde || 'UNBEKANNT').trim();
          const origName = String(req.file.originalname || 'upload.bin');

          let existing = null;
          if (
            typeof storeArg.findCcInternAuftragDateiBySlot === 'function' &&
            ccInternDateiUsesStableSlot(typ, phase, position)
          ) {
            existing = await storeArg.findCcInternAuftragDateiBySlot(auftragId, firmaId, typ, phase, position);
          }
          const dateiId = existing?.id || randomUUID();
          const publicUrl = `/api/v1/ccintern/auftraege/${encodeURIComponent(auftragId)}/dateien/${encodeURIComponent(dateiId)}/content`;

          const { serverPath, storedFilename, absolutePath } = writeCcInternServerDateiSync({
            kundeDisplay: kundeDisp,
            auftragLabel,
            typ,
            phase,
            position,
            mimetype: mime,
            buffer: buf,
            originalName: origName,
          });

          if (existing) {
            const oldAbs = resolveCcInternServerAbsolute(String(existing.server_path || ''));
            if (oldAbs && oldAbs !== absolutePath) {
              try {
                await fs.unlink(oldAbs);
              } catch {
                /* ignore */
              }
            }
          }

          const rowPatch = {
            filename: storedFilename,
            originalname: origName,
            mimetype: mime,
            size: buf.length,
            server_path: serverPath.replace(/\\/g, '/'),
            public_url: publicUrl,
            uploaded_by: req.auth?.userId ?? null,
          };

          let saved;
          if (existing && typeof storeArg.updateCcInternAuftragDatei === 'function') {
            saved = await storeArg.updateCcInternAuftragDatei(existing.id, firmaId, rowPatch);
          } else {
            const rowIn = {
              id: dateiId,
              project_id: projectHeader || null,
              auftrag_id: auftragId,
              kunde_id: null,
              typ,
              bereich,
              phase,
              position,
              filename: storedFilename,
              originalname: origName,
              mimetype: mime,
              size: buf.length,
              server_path: serverPath.replace(/\\/g, '/'),
              public_url: publicUrl,
              uploaded_by: req.auth?.userId ?? null,
            };
            saved = await storeArg.insertCcInternAuftragDatei(rowIn);
          }

          await logAudit(storeArg, {
            user: req.auth,
            modul: 'ccintern',
            action: existing ? 'PUT' : 'POST',
            resource_type: 'ccintern_auftrag_datei',
            resource_id: dateiId,
            project_id: projectHeader || null,
            payload: { auftrag_id: auftragId, typ, phase, position, ersetzt: !!existing },
          });
          return sendSuccess(res, existing ? 200 : 201, {
            success: true,
            path: absolutePath,
            datei: mapCcInternAuftragDatei(saved || { id: dateiId, auftrag_id: auftragId, ...rowPatch, typ, bereich, phase, position }, auftragId),
          });
        } catch (e) {
          return next(e);
        }
      },
    );

    auftraegeR.delete('/:id/dateien/:dateiId', ccinternAuftraegeBearbeiten, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const auftragId = requiredTrimmed(req.params.id);
        const dateiId = requiredTrimmed(req.params.dateiId);
        if (!auftragId || !dateiId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags- oder Datei-ID.');
        }
        const existing = await storeArg.getCcInternAuftragById(auftragId, firmaId);
        if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        const row = await storeArg.getCcInternAuftragDateiByIdForFirma(dateiId, firmaId);
        if (!row || String(row.auftrag_id).trim() !== auftragId) {
          return sendError(res, 404, 'NOT_FOUND', 'Datei nicht gefunden.');
        }
        const abs = resolveCcInternServerAbsolute(String(row.server_path || ''));
        await storeArg.deleteCcInternAuftragDatei(dateiId, firmaId);
        if (abs) {
          try {
            await fs.unlink(abs);
          } catch {
            /* optional */
          }
        }
        await logAudit(storeArg, {
          user: req.auth,
          modul: 'ccintern',
          action: 'DELETE',
          resource_type: 'ccintern_auftrag_datei',
          resource_id: dateiId,
          project_id: nullableTrimmed(req.headers['x-project-id']) || null,
          payload: { auftrag_id: auftragId },
        });
        return sendSuccess(res, 200, { deleted: true, id: dateiId });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.get('/:id', ccinternAuftraegeSehen, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const row = await storeArg.getCcInternAuftragById(id, firmaId);
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        return sendSuccess(res, 200, { auftrag: mapCcInternAuftrag(row) });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.put('/:id', ccinternAuftraegeBearbeiten, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const kunde = requiredTrimmed(req.body?.kunde);
        if (!kunde) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kunde" ist erforderlich.');
        }
        const lieferdatum = optionalIsoLike(req.body?.lieferdatum);
        if (req.body?.lieferdatum != null && String(req.body?.lieferdatum).trim() !== '' && lieferdatum === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "lieferdatum" ist kein gültiges Datum.');
        }
        const montageDatumIn = resolveCcInternMontageDatumInput(req.body);
        if (montageDatumIn.invalid) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "montage_datum" ist kein gültiges Datum.');
        }
        const montageDatum = montageDatumIn.value;
        const quelle = nullableTrimmed(req.body?.quelle) || 'manuell';
        if (!new Set(['manuell', 'fusa']).has(quelle)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Quelle (manuell|fusa).');
        }
        const row = await storeArg.updateCcInternAuftrag(id, firmaId, {
          kunde,
          status: nullableTrimmed(req.body?.status),
          schritt: nullableTrimmed(req.body?.schritt),
          prioritaet: nullableTrimmed(req.body?.prioritaet),
          lieferdatum,
          montage_datum: montageDatum,
          bemerkung: nullableTrimmed(req.body?.bemerkung),
          fusa_auftrag_id: nullableTrimmed(req.body?.fusa_auftrag_id),
          quelle,
        });
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        await syncCcInternMontageTermin({
          store: storeArg,
          ccinternAuftrag: row,
          actorUserId: req.auth.userId,
        });
        await logAudit(storeArg, {
          user: req.auth,
          modul: 'ccintern',
          action: 'PUT',
          resource_type: 'ccintern_auftrag',
          resource_id: id,
          project_id: null,
          payload: { kunde_set: true },
        });
        return sendSuccess(res, 200, { auftrag: mapCcInternAuftrag(row) });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.delete('/:id', ccinternAuftraegeBearbeiten, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const row = await storeArg.getCcInternAuftragById(id, firmaId);
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        /** Kalender zuerst löschen solange `auftrag_id` in kalender_termine noch auflösbar ist (FK SET NULL beim Löschen). */
        await syncCcInternMontageTermin({
          store: storeArg,
          ccinternAuftrag: { ...row, montage_datum: null },
          actorUserId: req.auth.userId,
        });
        const ok = await storeArg.deleteCcInternAuftrag(id, firmaId);
        if (!ok) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        await logAudit(storeArg, {
          user: req.auth,
          modul: 'ccintern',
          action: 'DELETE',
          resource_type: 'ccintern_auftrag',
          resource_id: id,
          project_id: null,
          payload: null,
        });
        return sendSuccess(res, 200, { deleted: true, id });
      } catch (e) {
        return next(e);
      }
    });

    auftraegeR.patch('/:id', ccinternAuftraegeBearbeiten, async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const id = requiredTrimmed(req.params.id);
        if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Auftrags-ID.');
        const existing = await storeArg.getCcInternAuftragById(id, firmaId);
        if (!existing) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');

        const patch = {};
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'kunde')) {
          const kunde = requiredTrimmed(req.body?.kunde);
          if (!kunde) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kunde" darf nicht leer sein.');
          patch.kunde = kunde;
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'status')) {
          patch.status = nullableTrimmed(req.body?.status);
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'schritt')) {
          patch.schritt = nullableTrimmed(req.body?.schritt);
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'prioritaet')) {
          patch.prioritaet = nullableTrimmed(req.body?.prioritaet);
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'lieferdatum')) {
          const lieferdatum = optionalIsoLike(req.body?.lieferdatum);
          if (req.body?.lieferdatum != null && String(req.body?.lieferdatum).trim() !== '' && lieferdatum === undefined) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "lieferdatum" ist kein gültiges Datum.');
          }
          patch.lieferdatum = lieferdatum;
        }
        if (
          Object.prototype.hasOwnProperty.call(req.body ?? {}, 'montage_datum')
          || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'montageDatum')
          || Object.prototype.hasOwnProperty.call(req.body ?? {}, 'bemerkung')
        ) {
          const montageDatumIn = resolveCcInternMontageDatumInput(req.body);
          if (montageDatumIn.invalid) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "montage_datum" ist kein gültiges Datum.');
          }
          patch.montage_datum = montageDatumIn.value;
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'bemerkung')) {
          patch.bemerkung = nullableTrimmed(req.body?.bemerkung);
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'fusa_auftrag_id')) {
          patch.fusa_auftrag_id = nullableTrimmed(req.body?.fusa_auftrag_id);
        }
        if (Object.prototype.hasOwnProperty.call(req.body ?? {}, 'quelle')) {
          const quelle = nullableTrimmed(req.body?.quelle);
          if (quelle != null && !new Set(['manuell', 'fusa']).has(quelle)) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Quelle (manuell|fusa).');
          }
          patch.quelle = quelle || 'manuell';
        }

        if (Object.keys(patch).length === 0) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Mindestens ein Feld für PATCH ist erforderlich.');
        }

        const row = await storeArg.updateCcInternAuftrag(id, firmaId, patch);
        if (!row) return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
        await syncCcInternMontageTermin({
          store: storeArg,
          ccinternAuftrag: row,
          actorUserId: req.auth.userId,
        });
        await logAudit(storeArg, {
          user: req.auth,
          modul: 'ccintern',
          action: 'PATCH',
          resource_type: 'ccintern_auftrag',
          resource_id: id,
          project_id: null,
          payload: { keys: Object.keys(patch) },
        });
        return sendSuccess(res, 200, { auftrag: mapCcInternAuftrag(row) });
      } catch (e) {
        return next(e);
      }
    });

    return auftraegeR;
  }

  const auftraegeRouter = createAuftraegeRouter(store);
  router.use('/auftraege', ...apiAuthProfile, auftraegeRouter);
  // DEPRECATED - Nachfolger: /api/v1/ccintern/auftraege
  router.use('/ccintern/auftraege', ...apiAuthProfile, auftraegeRouter);

  router.use('/projects', ...apiAuthProfile, createProjectsRouter(store));

  router.get('/ccintern/messeflow-workspace', ...apiAuthProfile, messeflowWorkspaceSehen, async (req, res, next) => {
    try {
      const row = await store.getMesseflowWorkspace();
      if (!row || row.payload_json == null || String(row.payload_json).trim() === '') {
        return res.status(200).json({ success: true, data: { projects: [], notifs: [], auditLog: [] } });
      }
      let parsed;
      try {
        parsed = JSON.parse(String(row.payload_json));
      } catch {
        return sendError(
          res,
          500,
          'CORRUPT_DATA',
          'Gespeicherter MesseFlow-Arbeitsbereich ist kein gültiges JSON.',
        );
      }
      if (!parsed || typeof parsed !== 'object') {
        return res.status(200).json({ success: true, data: { projects: [], notifs: [], auditLog: [] } });
      }
      return res.status(200).json({ success: true, data: parsed });
    } catch (e) {
      return next(e);
    }
  });

  router.put(
    '/ccintern/messeflow-workspace',
    express.json({ limit: '50mb' }),
    ...apiAuthProfile,
    messeflowWorkspaceSchreiben,
    async (req, res, next) => {
      try {
        const payload = {
          projects: Array.isArray(req.body?.projects) ? req.body.projects : [],
          notifs: Array.isArray(req.body?.notifs) ? req.body.notifs : [],
          auditLog: Array.isArray(req.body?.auditLog) ? req.body.auditLog : [],
        };
        const row = await store.upsertMesseflowWorkspace({ payloadJson: payload });
        return res.status(200).json({ success: true, data: { updated_at: row?.updated_at ?? null } });
      } catch (e) {
        return next(e);
      }
    },
  );

  /** `ccintern_angebote` — siehe LEGACY-Hinweis bei Mount `/fusa/angebote` (Tabelle `angebote` ist Legacy). */
  router.use(
    '/ccintern/angebote',
    ...apiAuthProfile,
    requireApiProjectContext(store),
    createCcInternAngeboteRouter(store),
  );

  router.get('/ccintern/kunden', ...apiAuthProfile, ccinternKundenSehen, async (req, res) => {
    try {
      const firmenRows = await store.listFirmen();
      const extraRows = await store.listCcInternKundenExtraAll();
      const extraById = new Map(
        extraRows
          .filter((x) => x && x.firma_id != null && String(x.firma_id).trim() !== '')
          .map((x) => [String(x.firma_id).trim(), x]),
      );
      const kunden = firmenRows
        .map((r) => {
          const base = mapFirmaRowToFirmenApiJson(r);
          if (!base) return null;
          const fid = String(r.id).trim();
          const x = extraById.get(fid) || null;
          return {
            ...base,
            firma_id: r.id,
            firma_name: r.name ?? null,
            ccintern_crm_status: x != null && x.crm_status != null ? x.crm_status : null,
            ccintern_betreuer: x != null && x.betreuer != null ? x.betreuer : null,
            ccintern_updated_at: x != null && x.ccintern_updated_at != null ? x.ccintern_updated_at : null,
          };
        })
        .filter(Boolean);
      return sendSuccess(res, 200, { kunden });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch(
    '/ccintern/kunden/:firmaId',
    ...apiAuthProfile,
    ccinternKundenBearbeiten,
    async (req, res) => {
      try {
        const firmaId = String(req.params.firmaId || '').trim();
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Firmen-ID.');
        }
        const ok = await store.upsertCcInternKundenExtra(firmaId, {
          crm_status: req.body?.crm_status,
          betreuer: req.body?.betreuer,
        });
        if (!ok) {
          return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
        }
        return sendSuccess(res, 200, { revoked: true });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  router.get('/invites', ...apiAuthProfile, einladungenSehen, async (req, res, next) => {
    try {
      const rows = await store.listCockpitInvites();
      const invites = rows.map((r) => ({
        id: r.id,
        email: r.email,
        global_role: r.global_role,
        modules: safeJsonArray(r.modules_json),
        areas: safeJsonArray(r.areas_json),
        rights: safeJsonObject(r.rights_json),
        firma_id: r.firma_id ?? null,
        firma_name: r.firma_name ?? null,
        firma_kundennummer: r.firma_kundennummer ?? null,
        token: r.token,
        status: r.status,
        expires_at: r.expires_at,
        redeemed_at: r.redeemed_at ?? null,
        created_at: r.created_at,
        invite_url: buildInviteUrl(r.token, req),
        kind: 'cockpit',
      }));
      return sendSuccess(res, 200, { invites });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/invites', ...apiAuthProfile, einladungenErstellen, async (req, res, next) => {
    try {
      const emailRaw = req.body?.email;
      if (typeof emailRaw !== 'string' || !normalizeApiEmail(emailRaw)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „email“ ist erforderlich.');
      }
      const email = normalizeApiEmail(emailRaw);
      if (!isValidGlobalRole(req.body?.global_role)) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Feld „global_role“ muss SUPER_ADMIN, INTERN, EXTERN oder MITARBEITER sein.',
        );
      }
      const gr = req.body.global_role;
      if (gr === 'SUPER_ADMIN' && !req.accessProfile?.isSuperAdmin()) {
        return sendError(
          res,
          403,
          'FORBIDDEN',
          'Nur SUPER_ADMIN kann Einladungen mit Rolle SUPER_ADMIN erstellen.',
        );
      }
      if (!Array.isArray(req.body?.modules)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein nicht leeres Array sein.');
      }
      /** @type {string[]} */
      const modules = [];
      const seenInv = new Set();
      for (const m of req.body.modules) {
        if (typeof m !== 'string') continue;
        const x = m.trim().toLowerCase();
        if (!isValidModuleKey(x)) continue;
        if (seenInv.has(x)) continue;
        seenInv.add(x);
        modules.push(x);
      }
      if (modules.length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Mindestens ein gültiges Modul ist erforderlich.');
      }
      const pending = await store.getPendingCockpitInviteByEmail(email);
      if (pending) {
        return sendError(
          res,
          409,
          'CONFLICT',
          'Für diese E-Mail existiert bereits eine offene Einladung.',
        );
      }
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);
      const expiresAtIso = expiresAt.toISOString();
      const areas = Array.isArray(req.body?.areas)
        ? req.body.areas
            .filter((x) => typeof x === 'string' && x.trim() !== '')
            .map((x) => String(x).trim())
        : [];
      const firmaIdRaw = typeof req.body?.firma_id === 'string' ? req.body.firma_id.trim() : '';
      const firmaId = firmaIdRaw || null;
      if (firmaId) {
        const fRows = await store.listFirmen();
        const fExists = Array.isArray(fRows) && fRows.some((f) => String(f.id || '') === firmaId);
        if (!fExists) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Firma nicht gefunden.');
        }
      }
      const rightsRaw = req.body?.rights && typeof req.body.rights === 'object' ? req.body.rights : {};
      const storedAccess = normalizeInviteAccessForRedeem(modules, rightsRaw);
      const id = randomUUID();
      const token = generateInviteToken();
      await store.insertCockpitInvite({
        id,
        email,
        globalRole: gr,
        modulesJson: JSON.stringify(storedAccess.modules),
        areasJson: JSON.stringify(areas),
        rightsJson: JSON.stringify(storedAccess.rights),
        firmaId,
        token,
        expiresAtIso,
        createdByUserId: req.auth.userId,
      });
      return sendSuccess(res, 201, {
        invite: {
          id,
          email,
          global_role: gr,
          modules: storedAccess.modules,
          areas,
          rights: storedAccess.rights,
          firma_id: firmaId,
          token,
          invite_url: buildInviteUrl(token, req),
          status: 'offen',
          expires_at: expiresAtIso,
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/invites/:id/revoke', ...apiAuthProfile, einladungenErstellen, async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Einladungs-ID.');
      }
      const ok = await store.revokeCockpitInvite(id);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Einladung nicht gefunden.');
      }
      return sendSuccess(res, 200, { revoked: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/users/:id/rights', ...apiAuthProfile, requireSuperAdminOrSelf('id'), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      const row = await store.getUserById(uid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      const profile = await loadAccessProfile(store, uid);
      const ap = accessProfileToJson(profile);
      return sendSuccess(res, 200, {
        user_id: uid,
        global_role: ap.global_role,
        modules: ap.modules,
        rights: ap.rights,
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/users/:id/modules', ...apiAuthProfile, requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const row = await store.getUserById(uid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      if (!Array.isArray(req.body?.modules)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein Array sein.');
      }
      const modules = req.body.modules.filter((m) => isValidModuleKey(m));
      const gr = isValidGlobalRole(row.global_role) ? row.global_role : 'INTERN';
      const profile = await loadAccessProfile(store, uid);
      const expanded = accessProfileToJson(profile).rights;
      const rights = expandRightsForModuleList(modules, expanded);
      await store.replaceUserAccessBundle({ userId: uid, globalRole: gr, modules, rights });
      return sendSuccess(res, 200, {});
    } catch (e) {
      return next(e);
    }
  });

  router.post('/users/:id/rights', ...apiAuthProfile, requireSuperAdmin(), async (req, res, next) => {
    try {
      const uid = String(req.params.id || '').trim();
      if (!uid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Benutzer-ID.');
      }
      const row = await store.getUserById(uid);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Benutzer nicht gefunden.');
      }
      if (!req.body?.rights || typeof req.body.rights !== 'object') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „rights“ muss ein Objekt sein.');
      }
      const gr = isValidGlobalRole(row.global_role) ? row.global_role : 'INTERN';
      const modRows = await store.listUserModules(uid);
      const modules = modRows.map((r) => r.module).filter((m) => isValidModuleKey(m));
      const profile = await loadAccessProfile(store, uid);
      const expanded = accessProfileToJson(profile).rights;
      const merged = mergeRightsPatch(expanded, req.body.rights);
      const rights = expandRightsForModuleList(modules, merged);
      await store.replaceUserAccessBundle({ userId: uid, globalRole: gr, modules, rights });
      return sendSuccess(res, 200, {});
    } catch (e) {
      return next(e);
    }
  });

  router.get('/role-templates', ...apiAuthProfile, rollenSehen, async (req, res, next) => {
    try {
      const rows = await store.listRoleTemplates();
      const templates = rows.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description ?? '',
        modules: safeJsonArray(r.modules_json),
        rights: safeJsonObject(r.rights_json),
        created_at: r.created_at,
      }));
      return sendSuccess(res, 200, { templates });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post(
    '/role-templates',
    express.json({ limit: '256kb' }),
    ...apiAuthProfile,
    rollenBearbeiten,
    async (req, res, next) => {
      try {
        const name = String(req.body?.name ?? '').trim();
        if (!name) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „name“ ist erforderlich.');
        }
        const description = req.body?.description != null ? String(req.body.description) : '';
        if (!Array.isArray(req.body?.modules)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „modules“ muss ein Array sein.');
        }
        const modules = req.body.modules.filter((m) => isValidModuleKey(m));
        let rights = {};
        if (req.body?.rights != null) {
          if (typeof req.body.rights !== 'object' || Array.isArray(req.body.rights)) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „rights“ muss ein Objekt sein.');
          }
          rights = /** @type {Record<string, unknown>} */ (req.body.rights);
        }
        const id = randomUUID();
        await store.insertRoleTemplate({ id, name, description, modules, rights });
        const row = await store.getRoleTemplateById(id);
        if (!row) {
          return sendError(res, 500, 'INTERNAL_ERROR', 'Vorlage nach dem Anlegen nicht auffindbar.');
        }
        const template = {
          id: row.id,
          name: row.name,
          description: row.description ?? '',
          modules: safeJsonArray(row.modules_json),
          rights: safeJsonObject(row.rights_json),
          created_at: row.created_at,
        };
        return sendSuccess(res, 201, { template });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return sendError(res, 500, 'INTERNAL_ERROR', msg);
      }
    },
  );

  router.delete('/role-templates/:id', ...apiAuthProfile, rollenBearbeiten, async (req, res, next) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Vorlagen-ID.');
      }
      const existing = await store.getRoleTemplateById(id);
      if (!existing) {
        return sendError(res, 404, 'NOT_FOUND', 'Rollen-Vorlage nicht gefunden.');
      }
      await store.deleteRoleTemplate(id);
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}