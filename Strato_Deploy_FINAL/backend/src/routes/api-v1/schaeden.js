import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError } from '../../lib/api-v1-envelope.js';
import { chainMiddleware } from '../../middleware/project-access.js';
import { requireModule, requireRight } from '../../middleware/require-rights.js';
import { createMulterMemory, resolveUploadAbsolute, writeUploadBufferSync } from '../../lib/upload-storage.js';
import { createAndSendRepairAppointmentEmail } from '../../lib/repair-appointment-email.js';
import {
  extractExtraFromBody,
  mapSchadenPublic,
  normalizeSchadenStatus,
} from '../schaeden.js';

const fotoUpload = createMulterMemory({
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mt = String(file.mimetype || '').toLowerCase().trim();
    if (/^image\/(jpeg|jpg|png|webp|gif|heic|heif)$/i.test(mt)) return cb(null, true);
    return cb(new Error('Nur Bilddateien sind erlaubt.'));
  },
});

/**
 * @param {string} p
 */
function mimeFromRelativePath(p) {
  const low = p.toLowerCase();
  if (low.endsWith('.png')) return 'image/png';
  if (low.endsWith('.webp')) return 'image/webp';
  if (low.endsWith('.gif')) return 'image/gif';
  if (low.endsWith('.heic')) return 'image/heic';
  if (low.endsWith('.heif')) return 'image/heif';
  return 'image/jpeg';
}

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
  const schUpload = chainMiddleware(requireModule('fusa'), requireRight('fusa', 'schaeden', 'upload'));

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

  router.patch('/:id/werkstatt', schBearbeiten, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      }
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      const wsRaw = typeof req.body?.werkstatt_status === 'string' ? req.body.werkstatt_status.trim() : '';
      if (!['offen', 'in_arbeit', 'fertig'].includes(wsRaw)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld "werkstatt_status" muss offen, in_arbeit oder fertig sein.');
      }
      const userId = req.auth?.userId || 'system';
      let updated = null;
      if (typeof store.updateSchadenWerkstatt === 'function') {
        updated = await store.updateSchadenWerkstatt(sid, wsRaw, userId);
      }
      if (!updated || updated.error) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Werkstattstatus konnte nicht gespeichert werden.');
      }
      if (wsRaw === 'fertig') {
        updated = await store.updateSchaden(sid, {
          status: 'erledigt',
          extra: {
            reparatur_phase: 'reparatur_abgeschlossen',
            repair_completed_at: new Date().toISOString(),
            repair_completed_by: userId,
          },
        });
      } else if (wsRaw === 'in_arbeit') {
        updated = await store.updateSchaden(sid, {
          status: 'in_bearbeitung',
          extra: {
            reparatur_phase: 'in_reparatur',
            repair_started_at: new Date().toISOString(),
            repair_started_by: userId,
          },
        });
      }
      const fresh = await store.getSchadenById(sid);
      const publicSchaden = mapSchadenPublic(fresh || updated);
      if (typeof store.insertSchadenHistory === 'function' && publicSchaden) {
        await store.insertSchadenHistory({
          schadenId: publicSchaden.id,
          eventType: wsRaw === 'fertig' ? 'admin_repair_completed' : wsRaw === 'in_arbeit' ? 'admin_repair_started' : 'admin_workshop_status_changed',
          createdByType: 'admin',
          event: { werkstatt_status: wsRaw, at: new Date().toISOString() },
        });
      }
      return res.status(200).json({ success: true, data: { schaden: publicSchaden } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id/fotos', schSehen, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      }
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      const fotosRows = await store.listSchadenFotos(sid);
      const fotos = fotosRows.map((r) => ({
        id: r.id,
        created_at: r.created_at,
        url: `/api/v1/schaeden/${encodeURIComponent(sid)}/fotos/${encodeURIComponent(String(r.id))}/file`,
      }));
      return res.status(200).json({ success: true, data: { fotos } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  function multerSchadenFoto(req, res, next) {
    fotoUpload.fields([
      { name: 'foto', maxCount: 1 },
      { name: 'file', maxCount: 1 },
    ])(req, res, (err) => {
      if (err) {
        return sendError(res, 400, 'VALIDATION_ERROR', err instanceof Error ? err.message : 'Upload ungültig.');
      }
      next();
    });
  }

  router.post('/:id/fotos', schUpload, multerSchadenFoto, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      }
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      const files =
        req.files && typeof req.files === 'object'
          ? /** @type {Record<string, { buffer?: Buffer, originalname?: string }[]|undefined>} */ (req.files)
          : {};
      const f = (files.foto && files.foto[0]) || (files.file && files.file[0]);
      if (!f || !f.buffer || !Buffer.isBuffer(f.buffer)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Datei erforderlich (multipart-Feld "foto" oder "file", Bilddatei).');
      }

      let rel;
      try {
        const written = writeUploadBufferSync({
          moduleKey: 'schaeden-fotos',
          projectId: projectId(req),
          resourceKey: 'schaden',
          buffer: f.buffer,
          originalName: f.originalname || 'foto.jpg',
        });
        rel = written.relativePath;
      } catch {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Foto konnte nicht gespeichert werden.');
      }

      const id = randomUUID();
      try {
        await store.insertSchadenFoto({ id, schadenId: sid, filePath: rel });
      } catch {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Foto konnte nicht gespeichert werden.');
      }
      const saved = await store.getSchadenFotoById(id);
      return res.status(201).json({
        success: true,
        data: {
          foto: {
            id,
            created_at: saved && saved.created_at != null ? String(saved.created_at) : new Date().toISOString(),
            url: `/api/v1/schaeden/${encodeURIComponent(sid)}/fotos/${encodeURIComponent(id)}/file`,
          },
        },
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

  router.get('/:id/fotos/:fotoId/file', schSehen, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      const fid = typeof req.params.fotoId === 'string' ? req.params.fotoId.trim() : '';
      if (!sid || !fid) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Parameter.');
      }
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      const foto = await store.getSchadenFotoById(fid);
      if (!foto || String(foto.schaden_id) !== sid) {
        return sendError(res, 404, 'NOT_FOUND', 'Foto nicht gefunden.');
      }
      const abs = resolveUploadAbsolute(String(foto.file_path || ''));
      if (!abs || !fs.existsSync(abs)) {
        return sendError(res, 404, 'NOT_FOUND', 'Datei fehlt.');
      }
      res.setHeader('Content-Type', mimeFromRelativePath(String(foto.file_path || '')));
      return res.sendFile(abs);
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
    const publicSchaden = mapSchadenPublic(updated);
    let repairEmail = null;
    const shouldSendRepairEmail =
      req.method === 'PATCH' &&
      req.body &&
      typeof req.body === 'object' &&
      Object.prototype.hasOwnProperty.call(req.body, 'terminanfrage') &&
      req.body.terminanfrage &&
      req.body.reparatur_phase === 'termin_gesendet';
    if (shouldSendRepairEmail && publicSchaden) {
      repairEmail = await createAndSendRepairAppointmentEmail({
        store,
        req,
        schaden: publicSchaden,
        terminanfrage: publicSchaden.terminanfrage,
      });
    } else if (
      publicSchaden &&
      typeof store.insertSchadenHistory === 'function' &&
      req.body &&
      typeof req.body === 'object' &&
      Object.prototype.hasOwnProperty.call(req.body, 'reparatur_phase')
    ) {
      const phase = String(req.body.reparatur_phase || '').trim();
      const eventType =
        phase === 'termin_bestaetigt'
          ? 'admin_appointment_confirmed'
          : phase === 'geplant' && Object.prototype.hasOwnProperty.call(req.body, 'terminanfrage')
            ? 'admin_appointment_cancelled'
            : phase === 'in_reparatur'
              ? 'admin_repair_started'
              : '';
      if (eventType) {
        await store.insertSchadenHistory({
          schadenId: publicSchaden.id,
          eventType,
          createdByType: 'admin',
          event: { phase, at: new Date().toISOString() },
        });
      }
    }
    return res.status(200).json({ success: true, data: { schaden: publicSchaden, repairEmail } });
  }

  router.get('/:id/history', schSehen, async (req, res) => {
    try {
      const sid = typeof req.params.id === 'string' ? req.params.id.trim() : '';
      if (!sid) return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Schaden-ID.');
      const row = await store.getSchadenById(sid);
      if (!row || String(row.project_id) !== projectId(req)) {
        return sendError(res, 404, 'NOT_FOUND', 'Schaden nicht gefunden.');
      }
      const rows = typeof store.listSchadenHistory === 'function' ? await store.listSchadenHistory(sid) : [];
      const history = rows.map((r) => {
        let event = null;
        if (r.event_json && typeof r.event_json === 'object') {
          event = r.event_json;
        } else {
          try {
            event = r.event_json ? JSON.parse(String(r.event_json)) : null;
          } catch {
            event = null;
          }
        }
        return {
          id: r.id,
          schaden_id: r.schaden_id,
          event_type: r.event_type,
          event,
          created_by_type: r.created_by_type,
          created_at: r.created_at,
        };
      });
      return res.status(200).json({ success: true, data: { history } });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return sendError(res, 500, 'INTERNAL_ERROR', msg);
    }
  });

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
