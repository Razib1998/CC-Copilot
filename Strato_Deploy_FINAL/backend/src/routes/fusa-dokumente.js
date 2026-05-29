import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';
import { logAudit } from '../lib/audit-log.js';
import { chainMiddleware } from '../middleware/project-access.js';
import { requireModule, requireRight } from '../middleware/require-rights.js';

/**
 * @param {unknown} v
 */
function requiredTrimmed(v) {
  if (v == null) return '';
  return String(v).trim();
}

/**
 * @param {object} row
 */
function mapFusaDokument(row) {
  if (!row || typeof row !== 'object') return null;
  const g = Number(row.groesse);
  return {
    id: row.id,
    auftrag_id: row.auftrag_id,
    fahrzeug_id: row.fahrzeug_id ?? null,
    name: row.name,
    typ: row.typ,
    url: row.url,
    groesse: Number.isFinite(g) ? g : 0,
    hochgeladen_von: row.hochgeladen_von ?? null,
    created_at: row.created_at,
    project_id: row.project_id,
  };
}

/**
 * Wenn der Auftrag eine fusa_fahrzeug_ids-Liste hat, muss das Fahrzeug darin vorkommen.
 * @param {object|null|undefined} auftrag
 * @param {string} fahrzeugId
 */
function fahrzeugPasstZuAuftragFahrzeugliste(auftrag, fahrzeugId) {
  if (!auftrag || !fahrzeugId) return true;
  try {
    const raw = auftrag.fusa_fahrzeug_ids;
    if (raw == null || String(raw).trim() === '' || String(raw).trim() === '[]') return true;
    const a = JSON.parse(String(raw));
    if (!Array.isArray(a) || a.length === 0) return true;
    const ids = a.map((x) => String(x || '').trim()).filter(Boolean);
    return ids.includes(String(fahrzeugId).trim());
  } catch {
    return true;
  }
}

/**
 * @param {object} store
 * @param {{ projectId: string|null, auftragId: string|null, fahrzeugId: string|null }} q
 * @returns {Promise<{ ok: true, accessProjectId: string } | { ok: false, status: number, error: string }>}
 */
async function validateFusaDokumenteListQuery(store, q) {
  const { projectId, auftragId, fahrzeugId } = q;
  if (!projectId && !auftragId && !fahrzeugId) {
    return {
      ok: false,
      status: 400,
      error: 'Mindestens eines der Query-Parameter project_id, auftrag_id oder fahrzeug_id ist erforderlich.',
    };
  }
  /** @type {string|null} */
  let accessProjectId = projectId ? String(projectId).trim() : null;
  if (projectId) {
    const p = await store.getProjectById(projectId);
    if (!p) return { ok: false, status: 400, error: 'project_id unbekannt.' };
  }
  /** @type {object|null} */
  let auftrag = null;
  if (auftragId) {
    auftrag = await store.getAuftragById(auftragId);
    if (!auftrag) return { ok: false, status: 400, error: 'auftrag_id unbekannt.' };
    if (projectId && String(auftrag.project_id || '').trim() !== String(projectId).trim()) {
      return { ok: false, status: 400, error: 'auftrag_id passt nicht zu project_id.' };
    }
    if (!accessProjectId) {
      const ap = String(auftrag.project_id || '').trim();
      accessProjectId = ap || null;
    }
  }
  if (fahrzeugId) {
    const fz = await store.getFahrzeugById(fahrzeugId);
    if (!fz) return { ok: false, status: 400, error: 'fahrzeug_id unbekannt.' };
    if (projectId && String(fz.project_id || '').trim() !== String(projectId).trim()) {
      return { ok: false, status: 400, error: 'fahrzeug_id passt nicht zu project_id.' };
    }
    if (auftragId && auftrag && String(fz.project_id || '').trim() !== String(auftrag.project_id || '').trim()) {
      return { ok: false, status: 400, error: 'fahrzeug_id passt nicht zum Auftrag (Projekt mismatch).' };
    }
    if (!accessProjectId) {
      const ap = String(fz.project_id || '').trim();
      accessProjectId = ap || null;
    }
  }
  if (!accessProjectId) {
    return {
      ok: false,
      status: 400,
      error: 'Projektkontext für die Anfrage konnte nicht ermittelt werden.',
    };
  }
  return { ok: true, accessProjectId };
}

/**
 * @param {object} store
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {string} projectId
 * @returns {Promise<import('express').Response | null>} `res` body bei 401/403, sonst `null` wenn erlaubt
 */
async function requireUserProjectAccessForFusaDokumente(store, req, res, projectId) {
  const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
  if (!uid) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
  }
  const pid = String(projectId || '').trim();
  if (!pid) {
    return sendError(res, 400, 'VALIDATION_ERROR', 'Projektkontext fehlt.');
  }
  const acc = await store.getProjectAccessByUserAndProject(uid, pid);
  if (!acc) {
    return sendError(res, 403, 'PROJECT_FORBIDDEN', 'Kein Zugriff auf dieses Projekt.');
  }
  return null;
}

/**
 * Zeile nur für Nutzer mit `project_access` auf `row.project_id` — sonst 404.
 * @returns {Promise<import('express').Response | null>} Response gesendet, oder `null` wenn erlaubt
 */
async function requireAccessToFusaDokumentProject(store, req, res, row) {
  const pid = String(row?.project_id || '').trim();
  if (!pid) {
    return sendError(res, 404, 'NOT_FOUND', 'Dokument nicht gefunden.');
  }
  const uid = typeof req.auth?.userId === 'string' ? req.auth.userId.trim() : '';
  if (!uid) {
    return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
  }
  const acc = await store.getProjectAccessByUserAndProject(uid, pid);
  if (!acc) {
    return sendError(res, 404, 'NOT_FOUND', 'Dokument nicht gefunden.');
  }
  return null;
}

/**
 * @param {object} store
 */
export function createFusaDokumenteRouter(store) {
  const router = Router();

  const docSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'dokumente', 'sehen'));
  /** Geschäftlich „hochladen“ — technisch Recht-Flag `upload` (RightsFlags). */
  const docHochladen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'dokumente', 'upload'));
  const docLoeschen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'dokumente', 'loeschen'));

  function parsePagination(pageRaw, limitRaw) {
    const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
  }

  router.get('/', docSehen, async (req, res, next) => {
    try {
      const projectId = requiredTrimmed(req.query?.project_id) || null;
      const auftragId = requiredTrimmed(req.query?.auftrag_id) || null;
      const fahrzeugId = requiredTrimmed(req.query?.fahrzeug_id) || null;
      const v = await validateFusaDokumenteListQuery(store, { projectId, auftragId, fahrzeugId });
      if (!v.ok) return sendError(res, v.status, 'VALIDATION_ERROR', v.error);
      const denied = await requireUserProjectAccessForFusaDokumente(store, req, res, v.accessProjectId);
      if (denied) return denied;

      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countFusaDokumente({ projectId, auftragId, fahrzeugId });
      const rows = await store.listFusaDokumente({ projectId, auftragId, fahrzeugId, offset, limit });
      return sendSuccess(res, 200, {
        dokumente: rows.map((r) => mapFusaDokument(r)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', docHochladen, async (req, res, next) => {
    try {
      const projectId = requiredTrimmed(req.body?.project_id);
      if (!projectId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "project_id" ist erforderlich.');
      const proj = await store.getProjectById(projectId);
      if (!proj) return sendError(res, 400, 'VALIDATION_ERROR', 'project_id unbekannt.');
      const postDenied = await requireUserProjectAccessForFusaDokumente(store, req, res, projectId);
      if (postDenied) return postDenied;

      const auftragId = requiredTrimmed(req.body?.auftrag_id);
      if (!auftragId) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "auftrag_id" ist erforderlich.');
      const auftrag = await store.getAuftragById(auftragId);
      if (!auftrag) return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id unbekannt.');
      if (String(auftrag.project_id || '').trim() !== projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'auftrag_id gehört nicht zu project_id.');
      }

      let fahrzeugId = null;
      if (req.body?.fahrzeug_id != null && String(req.body.fahrzeug_id).trim() !== '') {
        fahrzeugId = requiredTrimmed(req.body.fahrzeug_id);
        const fz = await store.getFahrzeugById(fahrzeugId);
        if (!fz) return sendError(res, 400, 'VALIDATION_ERROR', 'fahrzeug_id unbekannt.');
        if (String(fz.project_id || '').trim() !== projectId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'fahrzeug_id passt nicht zu project_id.');
        }
        if (!fahrzeugPasstZuAuftragFahrzeugliste(auftrag, fahrzeugId)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'fahrzeug_id ist laut Auftrag nicht zugeordnet.');
        }
      }

      const name = requiredTrimmed(req.body?.name);
      if (!name) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "name" ist erforderlich.');
      const typ = requiredTrimmed(req.body?.typ);
      if (!typ) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "typ" ist erforderlich.');
      const url = requiredTrimmed(req.body?.url);
      if (!url) return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "url" ist erforderlich.');

      const g = Number(req.body?.groesse);
      if (!Number.isFinite(g) || g < 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "groesse" muss eine Zahl >= 0 sein.');
      }

      const uid = req.auth?.userId != null ? String(req.auth.userId).trim() : '';
      if (!uid) return sendError(res, 401, 'UNAUTHORIZED', 'Nicht angemeldet.');
      if (!(await store.getUserById(uid))) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer für hochgeladen_von nicht gefunden.');
      }

      const id = randomUUID();
      const created = await store.insertFusaDokument({
        id,
        auftrag_id: auftragId,
        fahrzeug_id: fahrzeugId,
        name,
        typ,
        url,
        groesse: g,
        hochgeladen_von: uid,
        project_id: projectId,
      });
      await logAudit(store, {
        user: req.auth,
        modul: 'fusa',
        action: 'POST',
        resource_type: 'fusa_dokument',
        resource_id: id,
        project_id: projectId,
        payload: { name, typ, auftrag_id: auftragId },
      });
      return sendSuccess(res, 201, { dokument: mapFusaDokument(created) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', docSehen, async (req, res, next) => {
    try {
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const row = await store.getFusaDokumentById(id);
      if (!row) return sendError(res, 404, 'NOT_FOUND', 'Dokument nicht gefunden.');
      const getDenied = await requireAccessToFusaDokumentProject(store, req, res, row);
      if (getDenied) return getDenied;
      return sendSuccess(res, 200, { dokument: mapFusaDokument(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', docLoeschen, async (req, res, next) => {
    try {
      const id = requiredTrimmed(req.params.id);
      if (!id) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      const cur = await store.getFusaDokumentById(id);
      if (!cur) return sendError(res, 404, 'NOT_FOUND', 'Dokument nicht gefunden.');
      const delDenied = await requireAccessToFusaDokumentProject(store, req, res, cur);
      if (delDenied) return delDenied;
      await store.deleteFusaDokument(id);
      await logAudit(store, {
        user: req.auth,
        modul: 'fusa',
        action: 'DELETE',
        resource_type: 'fusa_dokument',
        resource_id: id,
        project_id: String(cur.project_id || '').trim() || null,
        payload: null,
      });
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
