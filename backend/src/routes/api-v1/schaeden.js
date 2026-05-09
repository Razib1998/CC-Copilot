import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError } from '../../lib/api-v1-envelope.js';
import { chainMiddleware } from '../../middleware/project-access.js';
import { requireModule, requireRight } from '../../middleware/require-rights.js';
import {
  extractExtraFromBody,
  mapSchadenPublic,
  normalizeSchadenStatus,
} from '../schaeden.js';

/**
 * `/api/v1/schaeden` — Projekt strikt über `requireApiProjectContext` (Parent) + Header `x-project-id`.
 * Erfolg: `{ success: true, data }` (Liste: `data.schaeden`, Einzel/Create/Update: `data.schaden`, Delete: `data.deleted` + `data.id`).
 * Fehler: unverändert `sendError` → `{ success: false, error: { code, message } }`.
 *
 * Hinweis: Legacy-UI nutzt weiter `GET|POST|PATCH /schaeden` (ohne `/api/v1`); fachliche Logik liegt in `routes/schaeden.js`.
 *
 * @param {object} store
 */
export function createApiV1SchaedenRouter(store) {
  const router = Router();

  const schSehen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'sehen'));
  const schErstellen = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'erstellen'));
  const schBearbeiten = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'bearbeiten'));

  function projectId(req) {
    return String(req.apiProjectId || '').trim();
  }

  router.get('/', schSehen, async (req, res) => {
    try {
      const pid = projectId(req);
      const rows = await store.listSchaedenForProject(pid);
      const schaeden = rows.map((r) => mapSchadenPublic(r)).filter(Boolean);
      return res.status(200).json({ success: true, data: { schaeden } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id', schSehen, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      }
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      return res.status(200).json({ success: true, data: { schaden: mapSchadenPublic(row) } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.post('/', schErstellen, async (req, res) => {
    try {
      const pid = projectId(req);
      const bodyPid =
        req.body?.project_id != null && String(req.body.project_id).trim() !== ''
          ? String(req.body.project_id).trim()
          : null;
      if (bodyPid != null && bodyPid !== pid) {
        return sendError(res, 400, 'PROJECT_MISMATCH', 'Body project_id muss mit x-project-id übereinstimmen.');
      }

      const project = await store.getProjectById(pid);
      if (!project) {
        return sendError(res, 404, 'PROJECT_NOT_FOUND', 'Projekt wurde nicht gefunden.');
      }

      const rawFz = req.body?.fahrzeug_id;
      if (rawFz == null || rawFz === '' || typeof rawFz !== 'string' || !rawFz.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "fahrzeug_id" ist erforderlich.');
      }
      const fahrzeugId = rawFz.trim();
      const fz = await store.getFahrzeugById(fahrzeugId);
      if (!fz) {
        return sendError(res, 404, 'NOT_FOUND', 'Fahrzeug nicht gefunden.');
      }
      if (String(fz.project_id) !== pid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Fahrzeug gehört nicht zu diesem Projekt.');
      }

      const titelRaw = req.body?.titel;
      if (typeof titelRaw !== 'string' || !titelRaw.trim()) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "titel" ist erforderlich.');
      }

      const beschreibungRaw = req.body?.beschreibung;
      let beschreibung = null;
      if (beschreibungRaw != null && beschreibungRaw !== '') {
        if (typeof beschreibungRaw !== 'string') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "beschreibung" muss Text sein.');
        }
        beschreibung = beschreibungRaw.trim() || null;
      }

      const statusNorm = normalizeSchadenStatus(req.body?.status);
      if (statusNorm == null) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Feld "status" muss offen, in_bearbeitung oder erledigt sein.',
        );
      }

      const extraFields = extractExtraFromBody(req.body || {});
      const extraJson = extraFields ? JSON.stringify(extraFields) : null;

      const id = randomUUID();
      try {
        await store.insertSchaden({
          id,
          projectId: pid,
          fahrzeugId,
          titel: titelRaw.trim(),
          beschreibung,
          status: statusNorm,
          extraJson,
        });
      } catch {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Schaden konnte nicht angelegt werden.');
      }
      const created = await store.getSchadenById(id);
      return res.status(201).json({ success: true, data: { schaden: mapSchadenPublic(created) } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  /** @returns {Promise<void>} */
  async function applySchadenPatch(req, res) {
    const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
    if (!sid) {
      return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
    }
    const row = await store.getSchadenById(sid);
    if (!row || String(row.project_id) !== projectId(req)) {
      return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
    }
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'titel')) {
      patch.titel = req.body.titel;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'beschreibung')) {
      patch.beschreibung = req.body.beschreibung;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      const sn = normalizeSchadenStatus(req.body.status);
      if (sn == null) {
        return sendError(
          res,
          400,
          'VALIDATION_ERROR',
          'Feld "status" muss offen, in_bearbeitung oder erledigt sein.',
        );
      }
      patch.status = sn;
    }
    const extraFields = extractExtraFromBody(req.body || {});
    if (extraFields !== null) {
      patch.extra = extraFields;
    }

    if (Object.keys(patch).length === 0) {
      return sendError(
        res,
        400,
        'VALIDATION_ERROR',
        'Mindestens ein Feld: titel, beschreibung, status oder erlaubte Extra-Felder.',
      );
    }

    const updated = await store.updateSchaden(sid, patch);
    if (!updated) {
      return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
    }
    if (typeof updated === 'object' && updated.error) {
      const msg =
        updated.error === 'INVALID_TITEL'
          ? 'Feld "titel" ungültig.'
          : updated.error === 'INVALID_BESCHREIBUNG'
            ? 'Feld "beschreibung" ungültig.'
            : updated.error === 'INVALID_STATUS'
              ? 'Feld "status" ungültig.'
              : 'Validierung fehlgeschlagen.';
      return sendError(res, 400, 'VALIDATION_ERROR', msg);
    }
    return res.status(200).json({ success: true, data: { schaden: mapSchadenPublic(updated) } });
  }

  router.put('/:id', schBearbeiten, async (req, res) => {
    try {
      await applySchadenPatch(req, res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.patch('/:id', schBearbeiten, async (req, res) => {
    try {
      await applySchadenPatch(req, res);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.delete('/:id', schBearbeiten, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      }
      const ok = await store.deleteSchadenByProject(sid, projectId(req));
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      return res.status(200).json({ success: true, data: { deleted: true, id: sid } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  return router;
}
