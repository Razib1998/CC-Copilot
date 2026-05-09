import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';
import { chainMiddleware } from '../../middleware/project-access.js';
import { requireModule } from '../../middleware/require-rights.js';

/**
 * @param {unknown} value
 * @returns {string|null}
 */
function requiredString(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  return s || null;
}

/**
 * @param {unknown} value
 * @returns {string|null|undefined}
 */
function optionalString(value) {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s || null;
}

/**
 * @param {unknown} value
 * @returns {number|undefined}
 */
function parseIntegerAmount(value) {
  if (value == null || value === '') return 0;
  const n = Number.parseInt(String(value), 10);
  return Number.isInteger(n) ? n : undefined;
}

/**
 * @param {unknown} value
 * @returns {string|null|undefined}
 */
function parseIdLike(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string') return undefined;
  const s = value.trim();
  return s || null;
}

/**
 * Parent: `requireApiProjectContext` setzt `req.apiProjectId` (Header + `project_access`).
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
function getProjectIdForHandler(req) {
  const a = /** @type {any} */ (req).apiProjectId;
  if (typeof a === 'string' && a.trim() !== '') return a.trim();
  const raw = req.header('x-project-id');
  if (typeof raw === 'string' && raw.trim() !== '') return raw.trim();
  return null;
}

/**
 * @param {object} row
 */
function mapAngebot(row) {
  return {
    id: String(row.id),
    project_id: String(row.project_id),
    kunde_id: row.kunde_id != null ? String(row.kunde_id) : null,
    titel: row.titel,
    beschreibung: row.beschreibung ?? null,
    betrag_cent: Number(row.betrag_cent ?? 0),
    status: row.status ?? 'offen',
    origin: 'ccintern',
    erstellt_von: row.erstellt_von != null ? String(row.erstellt_von) : null,
    created_at: row.created_at ?? null,
    updated_at: row.updated_at ?? null,
    deleted_at: row.deleted_at ?? null,
  };
}

/**
 * @param {object} store
 */
export function createCcInternAngeboteRouter(store) {
  const router = Router();
  const ccinternAccess = chainMiddleware(requireModule('ccintern'));

  router.get('/', ccinternAccess, async (req, res) => {
    try {
      const projectId = getProjectIdForHandler(req);
      if (!projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Header "x-project-id" ist erforderlich.');
      }
      const rows = await store.listCcInternAngeboteByProject(projectId);
      return sendSuccess(res, 200, { angebote: rows.map(mapAngebot) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', ccinternAccess, async (req, res) => {
    try {
      const projectId = getProjectIdForHandler(req);
      if (!projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Header "x-project-id" ist erforderlich.');
      }
      const id = requiredString(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Angebots-ID.');
      }
      const row = await store.getCcInternAngebotById(id, projectId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');
      }
      return sendSuccess(res, 200, { angebot: mapAngebot(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', ccinternAccess, async (req, res) => {
    try {
      const projectId = getProjectIdForHandler(req);
      if (!projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Header "x-project-id" ist erforderlich.');
      }
      const titel = requiredString(req.body?.titel);
      if (!titel) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      }
      const beschreibung = optionalString(req.body?.beschreibung);
      if (beschreibung === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "beschreibung" muss Text sein.');
      }
      const kundeId = parseIdLike(req.body?.kunde_id);
      if (kundeId === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kunde_id" muss String sein.');
      }
      const betragCent = parseIntegerAmount(req.body?.betrag_cent);
      if (betragCent === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "betrag_cent" muss Integer sein.');
      }
      const status = optionalString(req.body?.status) ?? 'offen';
      if (status == null) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "status" darf nicht leer sein.');
      }

      const id = randomUUID();
      await store.insertCcInternAngebot({
        id,
        project_id: projectId,
        kunde_id: kundeId,
        titel,
        beschreibung,
        betrag_cent: betragCent,
        status,
        origin: 'ccintern',
        erstellt_von: req.auth.userId,
      });
      const created = await store.getCcInternAngebotById(id, projectId);
      return sendSuccess(res, 201, { angebot: mapAngebot(created) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.put('/:id', ccinternAccess, async (req, res) => {
    try {
      const projectId = getProjectIdForHandler(req);
      if (!projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Header "x-project-id" ist erforderlich.');
      }
      const id = requiredString(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Angebots-ID.');
      }

      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'kunde_id')) {
        const kundeId = parseIdLike(req.body?.kunde_id);
        if (kundeId === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "kunde_id" muss String sein.');
        }
        patch.kunde_id = kundeId;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titel')) {
        const titel = requiredString(req.body?.titel);
        if (!titel) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
        }
        patch.titel = titel;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'beschreibung')) {
        const beschreibung = optionalString(req.body?.beschreibung);
        if (beschreibung === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "beschreibung" muss Text sein.');
        }
        patch.beschreibung = beschreibung;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'betrag_cent')) {
        const betragCent = parseIntegerAmount(req.body?.betrag_cent);
        if (betragCent === undefined) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "betrag_cent" muss Integer sein.');
        }
        patch.betrag_cent = betragCent;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        const status = optionalString(req.body?.status);
        if (status == null) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "status" darf nicht leer sein.');
        }
        patch.status = status;
      }

      if (Object.keys(patch).length === 0) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine änderbaren Felder übergeben.');
      }

      // origin bleibt fest auf "ccintern"; incoming origin/project_id werden ignoriert.
      const updated = await store.updateCcInternAngebot(id, projectId, patch);
      if (!updated) {
        return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');
      }
      return sendSuccess(res, 200, { angebot: mapAngebot(updated) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', ccinternAccess, async (req, res) => {
    try {
      const projectId = getProjectIdForHandler(req);
      if (!projectId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Header "x-project-id" ist erforderlich.');
      }
      const id = requiredString(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Angebots-ID.');
      }
      const ok = await store.softDeleteCcInternAngebot(id, projectId);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Angebot nicht gefunden.');
      }
      return sendSuccess(res, 200, { deleted: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
