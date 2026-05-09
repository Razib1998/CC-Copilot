/**
 * Phase B6: CC Intern Mitarbeiter-App — nur eigene Produktion/Aufgaben (`/api/v1/ccintern/me/*`).
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';
import { createMulterMemory, writeUploadBufferSync } from '../../lib/upload-storage.js';
import { requireApiProjectContext } from '../../middleware/require-api-project.js';
import {
  canonicalWorkflowStep,
  findSchrittObjektFuerSchritt,
  parseCcinternBemerkungPayload,
  serializeCcinternBemerkungFromPayload,
  userIdAssignedToSchrittObjekt,
  workflowCurrentStepFromAuftragRow,
} from '../../lib/ccintern-workflow-bemerkung.js';

const fotoMulter = createMulterMemory({ limits: { fileSize: 12 * 1024 * 1024 } });

/**
 * @param {'sehen'|'erstellen'} flag
 */
function requireMitarbeiterApp(flag) {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (p.isSuperAdmin()) {
      return next();
    }
    if (!p.hasModule('ccintern')) {
      return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff');
    }
    const right = flag === 'erstellen' ? 'erstellen' : 'sehen';
    if (!p.has('ccintern', 'mitarbeiterapp', right)) {
      return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff');
    }
    return next();
  };
}

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
function mapProduktionRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    auftrag_id: row.auftrag_id,
    schritt: row.schritt,
    fortschritt: Number(row.fortschritt) || 0,
    verantwortlich: row.verantwortlich ?? null,
    notiz: row.notiz ?? null,
    gestartet_am: row.gestartet_am ?? null,
    abgeschlossen_am: row.abgeschlossen_am ?? null,
    firma_id: row.firma_id,
  };
}

/**
 * @param {object} row
 */
function mapAufgabeRow(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    titel: row.titel,
    beschreibung: row.beschreibung ?? null,
    zugewiesen_an: row.zugewiesen_an ?? null,
    auftrag_id: row.auftrag_id ?? null,
    faellig_am: row.faellig_am ?? null,
    status: row.status,
    prioritaet: row.prioritaet,
    firma_id: row.firma_id,
    erstellt_am: row.erstellt_am,
    aktualisiert_am: row.aktualisiert_am,
    zugewiesen_name: row.zugewiesen_name ?? null,
  };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createMobileRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createMobileRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();
  const maSehen = requireMitarbeiterApp('sehen');
  const maSchreiben = requireMitarbeiterApp('erstellen');

  router.get('/auftraege', maSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const uid = requiredTrimmed(req.auth?.userId);
      if (!uid) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const rows =
        typeof store.listProduktionAuftraegeForMitarbeiterApp === 'function'
          ? await store.listProduktionAuftraegeForMitarbeiterApp(firmaId, uid)
          : await store.listProduktionAuftraegeByFirma(firmaId, {
              offset: 0,
              limit: 500,
              verantwortlich: uid,
            });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapProduktionRow(r)).filter(Boolean),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/aufgaben', maSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const uid = requiredTrimmed(req.auth?.userId);
      if (!uid) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const rows = await store.listAufgabenForAssignedUser(firmaId, uid);
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapAufgabeRow(r)).filter(Boolean),
      });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/zeiten', maSchreiben, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const uid = requiredTrimmed(req.auth?.userId);
      const ccAuftragId = requiredTrimmed(req.body?.ccintern_auftrag_id);
      if (!ccAuftragId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „ccintern_auftrag_id“ ist erforderlich.');
      }
      const auftrag = await store.getCcInternAuftragById(ccAuftragId, firmaId);
      if (!auftrag) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Auftrag nicht gefunden.');
      }
      const may = await store.userMayReportZeitForCcAuftrag(firmaId, uid, ccAuftragId);
      if (!may) {
        return sendError(res, 403, 'FORBIDDEN', 'Keine Berechtigung für diesen Auftrag.');
      }
      const minuten = Math.round(Number(req.body?.minuten));
      if (!Number.isFinite(minuten) || minuten <= 0 || minuten > 24 * 60) {
        return sendError(res, 400, 'VALIDATION_ERROR', '„minuten“ muss zwischen 1 und 1440 liegen.');
      }
      const notiz = req.body?.notiz != null && String(req.body.notiz).trim() ? String(req.body.notiz).trim() : null;
      const id = randomUUID();
      const row = await store.insertCcinternMitarbeiterZeit({
        id,
        userId: uid,
        firmaId,
        ccinternAuftragId: ccAuftragId,
        minuten,
        notiz,
      });
      return sendSuccess(res, 201, { item: row });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('ungültige Daten')) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Zeiterfassung.');
      }
      return next(e);
    }
  });

  router.post(
    '/foto',
    maSchreiben,
    requireApiProjectContext(store),
    fotoMulter.single('file'),
    async (req, res, next) => {
      try {
        const firmaId = await resolveFirmaIdForRequest(req);
        if (!firmaId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
        }
        const uid = requiredTrimmed(req.auth?.userId);
        const ccAuftragId = requiredTrimmed(req.body?.ccintern_auftrag_id);
        if (!ccAuftragId) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „ccintern_auftrag_id“ ist erforderlich.');
        }
        const buf = req.file?.buffer;
        if (!buf || !Buffer.isBuffer(buf) || buf.length === 0) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Datei „file“ fehlt oder ist leer.');
        }
        const auftrag = await store.getCcInternAuftragById(ccAuftragId, firmaId);
        if (!auftrag) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Auftrag nicht gefunden.');
        }
        const may = await store.userMayReportZeitForCcAuftrag(firmaId, uid, ccAuftragId);
        if (!may) {
          return sendError(res, 403, 'FORBIDDEN', 'Keine Berechtigung für diesen Auftrag.');
        }
        const projectId = req.apiProjectId;
        const { relativePath } = writeUploadBufferSync({
          moduleKey: 'ccintern-fotos',
          projectId,
          resourceKey: ccAuftragId,
          buffer: buf,
          originalName: req.file?.originalname || 'foto.jpg',
        });
        return sendSuccess(res, 201, {
          item: {
            path: relativePath,
            ccintern_auftrag_id: ccAuftragId,
            project_id: projectId,
          },
        });
      } catch (e) {
        return next(e);
      }
    },
  );

  /**
   * Workflow-Schritt im Auftrag (bemerkung-JSON) setzen — nur zugewiesener MA, nur am aktuellen Pool-Schritt.
   * Body: { ccintern_auftrag_id, schritt, status?: 'fertig'|'in_bearbeitung'|'offen' }
   */
  router.patch('/workflow-schritt', maSchreiben, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const uid = requiredTrimmed(req.auth?.userId);
      if (!uid) {
        return sendError(res, 401, 'UNAUTHORIZED', 'Authentifizierung erforderlich.');
      }
      const ccId = requiredTrimmed(req.body?.ccintern_auftrag_id);
      if (!ccId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „ccintern_auftrag_id“ ist erforderlich.');
      }
      const schrittReq = requiredTrimmed(req.body?.schritt);
      if (!schrittReq) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „schritt“ ist erforderlich.');
      }
      const statusRaw = requiredTrimmed(req.body?.status) || 'fertig';
      const ns =
        statusRaw === 'in_arbeit' || statusRaw === 'in_bearbeitung'
          ? 'in_bearbeitung'
          : statusRaw === 'offen'
            ? 'offen'
            : statusRaw === 'fertig' || statusRaw === 'erledigt' || statusRaw === 'abgeschlossen'
              ? 'fertig'
              : '';
      if (!ns) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger „status“ (offen|in_bearbeitung|fertig).');
      }

      const row = await store.getCcInternAuftragById(ccId, firmaId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Auftrag nicht gefunden.');
      }
      const may = await store.userMayReportZeitForCcAuftrag(firmaId, uid, ccId);
      if (!may) {
        return sendError(res, 403, 'FORBIDDEN', 'Keine Berechtigung für diesen Auftrag.');
      }

      const current = workflowCurrentStepFromAuftragRow(row.bemerkung, row.schritt);
      if (canonicalWorkflowStep(current) !== canonicalWorkflowStep(schrittReq)) {
        return sendError(res, 403, 'FORBIDDEN', 'Nur der aktuelle Produktionsschritt kann geändert werden.');
      }

      const payload = parseCcinternBemerkungPayload(row.bemerkung);
      if (!payload || !payload.schritte || typeof payload.schritte !== 'object') {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Auftrag hat keinen Workflow (bemerkung).');
      }
      const schritte = /** @type {Record<string, Record<string, unknown>>} */ (payload.schritte);
      const sch = findSchrittObjektFuerSchritt(schritte, schrittReq);
      if (!sch) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Schritt nicht im Workflow gefunden.');
      }
      if (!userIdAssignedToSchrittObjekt(sch, uid)) {
        return sendError(res, 403, 'FORBIDDEN', 'Sie sind diesem Schritt nicht zugewiesen.');
      }

      if (ns === 'fertig') {
        sch.status = 'abgeschlossen';
        sch.fertig = true;
        sch.erledigtVonMaId = uid;
        sch.erledigtAm = new Date().toISOString();
      } else if (ns === 'in_bearbeitung') {
        sch.status = 'in_bearbeitung';
        sch.fertig = false;
        delete sch.erledigtAm;
        delete sch.erledigtVonMaId;
        delete sch.erledigtVonName;
      } else {
        sch.status = 'offen';
        sch.fertig = false;
        delete sch.erledigtAm;
        delete sch.erledigtVonMaId;
        delete sch.erledigtVonName;
      }

      const bemerkung = serializeCcinternBemerkungFromPayload(payload);
      const updated = await store.updateCcInternAuftrag(ccId, firmaId, { bemerkung });
      return sendSuccess(res, 200, { auftrag: updated });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
