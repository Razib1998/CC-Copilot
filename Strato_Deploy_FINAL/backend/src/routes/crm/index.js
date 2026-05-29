/**
 * Phase B5: CC Intern CRM — Pipeline, Aktivitäten, Wiedervorlage (`/api/v1/crm/*`).
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../../lib/api-v1-envelope.js';

/** @type {Set<string>} */
const AKT_TYPEN = new Set(['notiz', 'anruf', 'email', 'termin']);
/** @type {Set<string>} */
const WV_STATUS = new Set(['offen', 'erledigt']);

/**
 * @param {'sehen'|'erstellen'|'bearbeiten'|'loeschen'} flag
 */
function requireCcinternCrm(flag) {
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
    if (!p.has('ccintern', 'crm', flag)) {
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
function mapPipeline(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    firma_id: row.firma_id,
    name: row.name,
    sort_order: row.sort_order != null ? Number(row.sort_order) : 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {object} row
 */
function mapAktivitaet(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    firma_id: row.firma_id,
    kunde_id: row.kunde_id,
    typ: row.typ,
    text: row.text ?? '',
    user_id: row.user_id ?? null,
    datum: row.datum,
    created_at: row.created_at,
  };
}

/**
 * @param {object} row
 */
function mapWiedervorlage(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    firma_id: row.firma_id,
    kunde_id: row.kunde_id,
    titel: row.titel ?? '',
    datum: row.datum,
    status: row.status ?? 'offen',
    user_id: row.user_id ?? null,
    created_at: row.created_at,
  };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createCrmRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createCrmRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  const crmSehen = requireCcinternCrm('sehen');
  const crmErstellen = requireCcinternCrm('erstellen');
  const crmBearbeiten = requireCcinternCrm('bearbeiten');
  const crmLoeschen = requireCcinternCrm('loeschen');

  router.get('/pipeline', crmSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const rows = await store.listCrmPipelineStagesByFirma(firmaId);
      return sendSuccess(res, 200, { items: rows.map((r) => mapPipeline(r)).filter(Boolean) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/pipeline', crmErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const firma = await store.getFirmaById(firmaId);
      if (!firma) {
        return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
      }
      const name = requiredTrimmed(req.body?.name);
      if (!name) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „name“ ist erforderlich.');
      }
      let sortOrder = 0;
      if (req.body?.sort_order != null && String(req.body.sort_order).trim() !== '') {
        const n = Number(req.body.sort_order);
        if (!Number.isFinite(n)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige sort_order.');
        }
        sortOrder = Math.round(n);
      }
      const id = randomUUID();
      const row = await store.insertCrmPipelineStage({ id, firmaId, name, sortOrder });
      if (!row) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Pipeline-Stage konnte nicht angelegt werden.');
      }
      return sendSuccess(res, 201, { item: mapPipeline(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/pipeline/:id', crmBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      }
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (req.body?.name !== undefined) {
        const name = requiredTrimmed(req.body.name);
        if (!name) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „name“ darf nicht leer sein.');
        }
        patch.name = name;
      }
      if (req.body?.sort_order !== undefined) {
        const n = Number(req.body.sort_order);
        if (!Number.isFinite(n)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige sort_order.');
        }
        patch.sort_order = Math.round(n);
      }
      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine Änderungen übermittelt.');
      }
      try {
        const row = await store.updateCrmPipelineStage(id, firmaId, patch);
        if (!row) {
          return sendError(res, 404, 'NOT_FOUND', 'Pipeline-Stage nicht gefunden.');
        }
        return sendSuccess(res, 200, { item: mapPipeline(row) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'VALIDATION_NAME') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „name“ darf nicht leer sein.');
        }
        throw err;
      }
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/pipeline/:id', crmLoeschen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      }
      const ok = await store.deleteCrmPipelineStage(id, firmaId);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Pipeline-Stage nicht gefunden.');
      }
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/aktivitaeten', crmSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const kundeId =
        typeof req.query?.kunde_id === 'string' && req.query.kunde_id.trim() ? req.query.kunde_id.trim() : null;
      const rows = await store.listCrmAktivitaetenByFirma(firmaId, { kundeId: kundeId || undefined });
      return sendSuccess(res, 200, { items: rows.map((r) => mapAktivitaet(r)).filter(Boolean) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/aktivitaeten', crmErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const kundeId = requiredTrimmed(req.body?.kunde_id);
      if (!kundeId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „kunde_id“ ist erforderlich.');
      }
      const kunde = await store.getFirmaById(kundeId);
      if (!kunde) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Kunde nicht gefunden.');
      }
      const typ = requiredTrimmed(req.body?.typ).toLowerCase();
      if (!typ || !AKT_TYPEN.has(typ)) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger „typ“ (notiz, anruf, email, termin).');
      }
      let datum = requiredTrimmed(req.body?.datum);
      if (!datum) {
        const d = new Date();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        datum = `${d.getFullYear()}-${mm}-${dd}`;
      }
      let userId = null;
      if (req.body?.user_id != null && String(req.body.user_id).trim() !== '') {
        userId = String(req.body.user_id).trim();
        const u = await store.getUserById(userId);
        if (!u) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
        }
      }
      const id = randomUUID();
      const row = await store.insertCrmAktivitaet({
        id,
        firmaId,
        kundeId,
        typ,
        text: req.body?.text != null ? String(req.body.text) : '',
        datum,
        userId,
      });
      if (!row) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Aktivität konnte nicht angelegt werden.');
      }
      return sendSuccess(res, 201, { item: mapAktivitaet(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Pflichtfelder')) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Pflichtfelder fehlen.');
      }
      return next(e);
    }
  });

  router.get('/wiedervorlage', crmSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const kundeId =
        typeof req.query?.kunde_id === 'string' && req.query.kunde_id.trim() ? req.query.kunde_id.trim() : null;
      const rows = await store.listCrmWiedervorlageByFirma(firmaId, { kundeId: kundeId || undefined });
      return sendSuccess(res, 200, { items: rows.map((r) => mapWiedervorlage(r)).filter(Boolean) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/wiedervorlage', crmErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const kundeId = requiredTrimmed(req.body?.kunde_id);
      if (!kundeId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „kunde_id“ ist erforderlich.');
      }
      const kunde = await store.getFirmaById(kundeId);
      if (!kunde) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Kunde nicht gefunden.');
      }
      const datum = requiredTrimmed(req.body?.datum);
      if (!datum) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „datum“ ist erforderlich.');
      }
      const titel = req.body?.titel != null ? String(req.body.titel) : '';
      let status = 'offen';
      if (req.body?.status != null && String(req.body.status).trim() !== '') {
        status = String(req.body.status).trim().toLowerCase();
        if (!WV_STATUS.has(status)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger „status“ (offen, erledigt).');
        }
      }
      let userId = null;
      if (req.body?.user_id != null && String(req.body.user_id).trim() !== '') {
        userId = String(req.body.user_id).trim();
        const u = await store.getUserById(userId);
        if (!u) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
        }
      }
      const id = randomUUID();
      const row = await store.insertCrmWiedervorlage({
        id,
        firmaId,
        kundeId,
        titel,
        datum,
        status,
        userId,
      });
      if (!row) {
        return sendError(res, 500, 'INTERNAL_ERROR', 'Wiedervorlage konnte nicht angelegt werden.');
      }
      return sendSuccess(res, 201, { item: mapWiedervorlage(row) });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('Pflichtfelder')) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Pflichtfelder fehlen.');
      }
      return next(e);
    }
  });

  router.patch('/wiedervorlage/:id', crmBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige ID.');
      }
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (req.body?.titel !== undefined) {
        patch.titel = req.body.titel != null ? String(req.body.titel) : '';
      }
      if (req.body?.datum !== undefined) {
        patch.datum = requiredTrimmed(req.body.datum);
        if (!patch.datum) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „datum“ darf nicht leer sein.');
        }
      }
      if (req.body?.status !== undefined) {
        const st = String(req.body.status).trim().toLowerCase();
        if (!WV_STATUS.has(st)) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger „status“ (offen, erledigt).');
        }
        patch.status = st;
      }
      if (req.body?.user_id !== undefined) {
        if (req.body.user_id == null || String(req.body.user_id).trim() === '') {
          patch.user_id = null;
        } else {
          const uid = String(req.body.user_id).trim();
          const u = await store.getUserById(uid);
          if (!u) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
          }
          patch.user_id = uid;
        }
      }
      if (!Object.keys(patch).length) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Keine Änderungen übermittelt.');
      }
      try {
        const row = await store.updateCrmWiedervorlage(id, firmaId, patch);
        if (!row) {
          return sendError(res, 404, 'NOT_FOUND', 'Wiedervorlage nicht gefunden.');
        }
        return sendSuccess(res, 200, { item: mapWiedervorlage(row) });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg === 'VALIDATION_DATUM') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „datum“ darf nicht leer sein.');
        }
        throw err;
      }
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
