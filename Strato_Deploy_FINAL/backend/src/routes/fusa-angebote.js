import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

const ERLAUBTE_STATUS = new Set(['entwurf', 'gesendet', 'angenommen', 'abgelehnt']);

/**
 * @param {unknown} v
 */
function requiredTrimmed(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {unknown} raw
 * @returns {string|null|undefined} YYYY-MM-DD oder null; undefined = ungültig bei nicht-leerem Input
 */
function optionalIsoDate(raw) {
  if (raw == null || String(raw).trim() === '') return null;
  const s = String(raw).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return undefined;
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, value: string } | { ok: false, error: string }}
 */
function canonicalAngebotsJsonString(raw) {
  if (raw == null) return { ok: false, error: 'angebots_json fehlt.' };
  if (Array.isArray(raw)) return { ok: true, value: JSON.stringify(raw) };
  if (typeof raw === 'object') return { ok: true, value: JSON.stringify(raw) };
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) return { ok: false, error: 'angebots_json darf nicht leer sein.' };
    try {
      const v = JSON.parse(s);
      if (typeof v !== 'object' || v === null) {
        return { ok: false, error: 'angebots_json muss ein JSON-Objekt oder -Array sein.' };
      }
      return { ok: true, value: JSON.stringify(v) };
    } catch {
      return { ok: false, error: 'angebots_json ist kein gültiges JSON.' };
    }
  }
  return { ok: false, error: 'angebots_json muss ein Objekt, Array oder JSON-String sein.' };
}

/**
 * @param {object} row
 * @param {{ project?: object|null, kunde?: object|null }} [ctx]
 */
function mapFusaAngebot(row, ctx) {
  if (!row || typeof row !== 'object') return null;
  /** @type {unknown} */
  let parsed = null;
  try {
    parsed = JSON.parse(String(row.angebots_json ?? ''));
  } catch {
    parsed = null;
  }
  const out = {
    id: row.id,
    project_id: row.project_id,
    fusa_kunde_id: row.fusa_kunde_id,
    titel: row.titel,
    status: row.status,
    gueltig_bis: row.gueltig_bis ?? null,
    angebots_json: parsed,
    erstellt_von: row.erstellt_von ?? null,
    created_at: row.created_at,
  };
  if (ctx?.project && typeof ctx.project === 'object') {
    out.project = { id: ctx.project.id, name: ctx.project.name ?? null };
  }
  if (ctx?.kunde && typeof ctx.kunde === 'object') {
    out.kunde = { id: ctx.kunde.id, name: ctx.kunde.name ?? null };
  }
  return out;
}

/**
 * @param {object} store
 */
export function createFusaAngebotRouter(store) {
  const router = Router();

  const angSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'angebote', 'sehen'));
  const angErstellen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'angebote', 'erstellen'));
  const angBearbeiten = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'angebote', 'bearbeiten'));

  function parsePagination(pageRaw, limitRaw) {
    const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  /**
   * @param {object} store
   * @param {{ projectId: string|null, fusaKundeId: string|null, status: string|null }} q
   */
  async function validateFusaAngeboteListQuery(store, q) {
    const { projectId, fusaKundeId, status } = q;
    if (!projectId && !fusaKundeId && !status) {
      return {
        ok: false,
        status: 400,
        error: 'Mindestens eines der Query-Parameter project_id, fusa_kunde_id oder status ist erforderlich.',
      };
    }
    if (status && !ERLAUBTE_STATUS.has(status)) {
      return { ok: false, status: 400, error: 'Ungültiger status (entwurf|gesendet|angenommen|abgelehnt).' };
    }
    if (projectId) {
      const p = await store.getProjectById(projectId);
      if (!p) return { ok: false, status: 400, error: 'project_id unbekannt.' };
    }
    if (fusaKundeId) {
      const f = await store.getFirmaById(fusaKundeId);
      if (!f) return { ok: false, status: 400, error: 'fusa_kunde_id unbekannt (Firma).' };
    }
    return { ok: true };
  }

  router.get('/', angSehen, async (req, res, next) => {
    try {
      const projectId = requiredTrimmed(req.query?.project_id) || null;
      const fusaKundeId = requiredTrimmed(req.query?.fusa_kunde_id) || null;
      const status = requiredTrimmed(req.query?.status) || null;
      const v = await validateFusaAngeboteListQuery(store, { projectId, fusaKundeId, status });
      if (!v.ok) return sendError(res, v.status, 'VALIDATION_ERROR', v.error);

      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countFusaAngebote({ projectId, fusaKundeId, status });
      const rows = await store.listFusaAngebote({ projectId, fusaKundeId, status, offset, limit });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapFusaAngebot(r)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', angErstellen, async (req, res, next) => {
    try {
      const projectId = requiredTrimmed(req.body?.project_id);
      if (!projectId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "project_id" ist erforderlich.');
      const proj = await store.getProjectById(projectId);
      if (!proj) return sendError(res, 400, 'VALIDATION_ERROR', 'project_id unbekannt.');

      const fusaKundeId = requiredTrimmed(req.body?.fusa_kunde_id);
      if (!fusaKundeId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "fusa_kunde_id" ist erforderlich.');
      const firma = await store.getFirmaById(fusaKundeId);
      if (!firma) return sendError(res, 400, 'VALIDATION_ERROR', 'fusa_kunde_id unbekannt (Firma).');

      const titel = requiredTrimmed(req.body?.titel);
      if (!titel) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');

      let status = requiredTrimmed(req.body?.status) || 'entwurf';
      if (!ERLAUBTE_STATUS.has(status)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status (entwurf|gesendet|angenommen|abgelehnt).');
      }

      let gueltig_bis = null;
      if (Object.prototype.hasOwnProperty.call(req.body, 'gueltig_bis')) {
        const g = optionalIsoDate(req.body?.gueltig_bis);
        if (g === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "gueltig_bis" muss leer oder YYYY-MM-DD sein.');
        }
        gueltig_bis = g;
      }

      const aj = canonicalAngebotsJsonString(req.body?.angebots_json);
      if (!aj.ok) return sendError(res, 400, 'VALIDATION_ERROR', aj.error);

      const uid = req.auth?.userId != null ? String(req.auth.userId).trim() : '';
      if (!uid) return sendError(res, 401, 'UNAUTHORIZED', 'Nicht angemeldet.');
      if (!(await store.getUserById(uid))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer für erstellt_von nicht gefunden.');
      }

      const id = randomUUID();
      const created = await store.insertFusaAngebot({
        id,
        project_id: projectId,
        fusa_kunde_id: fusaKundeId,
        titel,
        status,
        gueltig_bis,
        angebots_json: aj.value,
        erstellt_von: uid,
      });
      return sendSuccess(res, 201, mapFusaAngebot(created));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', angSehen, async (req, res, next) => {
    try {
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const row = await store.getFusaAngebotById(id);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');
      const proj = await store.getProjectById(row.project_id);
      const kunde = await store.getFirmaById(row.fusa_kunde_id);
      return sendSuccess(res, 200, mapFusaAngebot(row, { project: proj, kunde: kunde }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch('/:id', angBearbeiten, async (req, res, next) => {
    try {
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const cur = await store.getFusaAngebotById(id);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');

      /** @type {Record<string, unknown>} */
      const patch = {};

      if (Object.prototype.hasOwnProperty.call(req.body, 'project_id')) {
        const pid = requiredTrimmed(req.body?.project_id);
        if (!pid) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "project_id" darf nicht leer sein.');
        const p = await store.getProjectById(pid);
        if (!p) return sendError(res, 400, 'VALIDATION_ERROR', 'project_id unbekannt.');
        patch.project_id = pid;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'fusa_kunde_id')) {
        const kid = requiredTrimmed(req.body?.fusa_kunde_id);
        if (!kid) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "fusa_kunde_id" darf nicht leer sein.');
        const f = await store.getFirmaById(kid);
        if (!f) return sendError(res, 400, 'VALIDATION_ERROR', 'fusa_kunde_id unbekannt (Firma).');
        patch.fusa_kunde_id = kid;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'titel')) {
        const t = requiredTrimmed(req.body?.titel);
        if (!t) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" darf nicht leer sein.');
        patch.titel = t;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'status')) {
        const st = requiredTrimmed(req.body?.status);
        if (!ERLAUBTE_STATUS.has(st)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger status (entwurf|gesendet|angenommen|abgelehnt).');
        }
        patch.status = st;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'gueltig_bis')) {
        const g = optionalIsoDate(req.body?.gueltig_bis);
        if (g === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "gueltig_bis" muss leer oder YYYY-MM-DD sein.');
        }
        patch.gueltig_bis = g;
      }
      if (Object.prototype.hasOwnProperty.call(req.body, 'angebots_json')) {
        const aj = canonicalAngebotsJsonString(req.body?.angebots_json);
        if (!aj.ok) return sendError(res, 400, 'VALIDATION_ERROR', aj.error);
        patch.angebots_json = aj.value;
      }

      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine gültigen Felder zum Aktualisieren.');
      }

      const updated = await store.updateFusaAngebot(id, patch);
      return sendSuccess(res, 200, mapFusaAngebot(updated));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', angBearbeiten, async (req, res, next) => {
    try {
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const cur = await store.getFusaAngebotById(id);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');
      await store.deleteFusaAngebot(id);
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
