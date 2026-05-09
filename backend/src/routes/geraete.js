/**
 * Phase B3: Cockpit Geräte — CRUD unter `/api/v1/geraete`.
 */

import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';

/** @type {Set<string>} */
const STATUS_ERLAUBT = new Set(['aktiv', 'defekt', 'in_wartung']);

/**
 * @param {'sehen'|'erstellen'|'bearbeiten'|'loeschen'} flag
 */
function requireCockpitGeraet(flag) {
  return (req, res, next) => {
    const p = req.accessProfile;
    if (!p) {
      return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
    }
    if (p.isSuperAdmin()) {
      return next();
    }
    if (!p.hasModule('cockpit')) {
      return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff');
    }
    if (!p.has('cockpit', 'geraete', flag)) {
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
 * @param {unknown} raw
 */
function normalizeStatus(raw) {
  const s = raw == null || String(raw).trim() === '' ? 'aktiv' : String(raw).trim().toLowerCase().replace(/\s+/g, '_');
  if (!STATUS_ERLAUBT.has(s)) return undefined;
  return s;
}

/**
 * @param {object} row
 */
function mapGeraet(row) {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row.id,
    firma_id: row.firma_id,
    project_id: row.project_id ?? null,
    typ: row.typ,
    seriennummer: row.seriennummer ?? null,
    zugewiesen_an_user_id: row.zugewiesen_an_user_id ?? null,
    status: row.status ?? 'aktiv',
    notiz: row.notiz ?? null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * @param {unknown} pageRaw
 * @param {unknown} limitRaw
 */
function parsePagination(pageRaw, limitRaw) {
  const page = Math.max(1, parseInt(String(pageRaw || '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(limitRaw || '50'), 10) || 50));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

/**
 * @param {object} store
 * @param {{ resolveFirmaIdForRequest: (req: import('express').Request) => Promise<string|null> }} opts
 */
export function createGeraeteRouter(store, opts) {
  const resolveFirmaIdForRequest = opts?.resolveFirmaIdForRequest;
  if (typeof resolveFirmaIdForRequest !== 'function') {
    throw new Error('createGeraeteRouter: opts.resolveFirmaIdForRequest fehlt');
  }

  const router = Router();

  const geSehen = requireCockpitGeraet('sehen');
  const geErstellen = requireCockpitGeraet('erstellen');
  const geBearbeiten = requireCockpitGeraet('bearbeiten');
  const geLoeschen = requireCockpitGeraet('loeschen');

  router.get('/', geSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const projectId =
        typeof req.query?.project_id === 'string' && req.query.project_id.trim()
          ? req.query.project_id.trim()
          : null;
      const { page, limit, offset } = parsePagination(req.query?.page, req.query?.limit);
      const total = await store.countGeraeteByFirma(firmaId, { projectId });
      const rows = await store.listGeraeteByFirma(firmaId, { offset, limit, projectId });
      return sendSuccess(res, 200, {
        items: rows.map((r) => mapGeraet(r)).filter(Boolean),
        pagination: { page, limit, total },
      });
    } catch (e) {
      return next(e);
    }
  });

  router.get('/:id', geSehen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Geräte-ID.');
      }
      const row = await store.getGeraetById(id, firmaId);
      if (!row) {
        return sendError(res, 404, 'NOT_FOUND', 'Gerät nicht gefunden.');
      }
      return sendSuccess(res, 200, { item: mapGeraet(row) });
    } catch (e) {
      return next(e);
    }
  });

  router.post('/', geErstellen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const firma = await store.getFirmaById(firmaId);
      if (!firma) {
        return sendError(res, 404, 'NOT_FOUND', 'Firma nicht gefunden.');
      }
      const typ = requiredTrimmed(req.body?.typ);
      if (!typ) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „typ“ ist erforderlich.');
      }
      const st = normalizeStatus(req.body?.status);
      if (req.body?.status != null && req.body?.status !== '' && st === undefined) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Status.');
      }
      let projectId = null;
      if (req.body?.project_id != null && String(req.body.project_id).trim() !== '') {
        projectId = String(req.body.project_id).trim();
        const pr = await store.getProjectById(projectId);
        if (!pr) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Projekt nicht gefunden.');
        }
      }
      let zuUid = null;
      if (req.body?.zugewiesen_an_user_id != null && String(req.body.zugewiesen_an_user_id).trim() !== '') {
        zuUid = String(req.body.zugewiesen_an_user_id).trim();
        const u = await store.getUserById(zuUid);
        if (!u) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
        }
      }
      const id = randomUUID();
      try {
        const row = await store.insertGeraet({
          id,
          firmaId,
          projectId,
          typ,
          seriennummer: req.body?.seriennummer,
          zugewiesenAnUserId: zuUid,
          status: st ?? 'aktiv',
          notiz: req.body?.notiz != null ? req.body.notiz : null,
        });
        if (!row) {
          return sendError(res, 500, 'INTERNAL_ERROR', 'Gerät konnte nicht angelegt werden.');
        }
        return sendSuccess(res, 201, { item: mapGeraet(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'SERIENNUMMER_CONFLICT') {
          return sendError(res, 409, 'CONFLICT', 'Seriennummer bereits vergeben.');
        }
        throw e;
      }
    } catch (e) {
      return next(e);
    }
  });

  router.patch('/:id', geBearbeiten, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Geräte-ID.');
      }
      const cur = await store.getGeraetById(id, firmaId);
      if (!cur) {
        return sendError(res, 404, 'NOT_FOUND', 'Gerät nicht gefunden.');
      }
      /** @type {Record<string, unknown>} */
      const patch = {};
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'typ')) {
        const t = requiredTrimmed(req.body?.typ);
        if (!t) {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „typ“ darf nicht leer sein.');
        }
        patch.typ = t;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'project_id')) {
        const pid = req.body?.project_id;
        if (pid == null || String(pid).trim() === '') {
          patch.project_id = null;
        } else {
          const pr = await store.getProjectById(String(pid).trim());
          if (!pr) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Projekt nicht gefunden.');
          }
          patch.project_id = String(pid).trim();
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'seriennummer')) {
        patch.seriennummer = req.body?.seriennummer;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'zugewiesen_an_user_id')) {
        const z = req.body?.zugewiesen_an_user_id;
        if (z == null || String(z).trim() === '') {
          patch.zugewiesen_an_user_id = null;
        } else {
          const u = await store.getUserById(String(z).trim());
          if (!u) {
            return sendError(res, 400, 'VALIDATION_ERROR', 'Benutzer nicht gefunden.');
          }
          patch.zugewiesen_an_user_id = String(z).trim();
        }
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
        const st = normalizeStatus(req.body?.status);
        if (st === undefined && req.body?.status != null && String(req.body.status).trim() !== '') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültiger Status.');
        }
        if (st !== undefined) patch.status = st;
      }
      if (Object.prototype.hasOwnProperty.call(req.body || {}, 'notiz')) {
        patch.notiz = req.body?.notiz;
      }
      if (!Object.keys(patch).length) {
        return sendSuccess(res, 200, { item: mapGeraet(cur) });
      }
      try {
        const row = await store.updateGeraet(id, firmaId, patch);
        if (!row) {
          return sendError(res, 404, 'NOT_FOUND', 'Gerät nicht gefunden.');
        }
        return sendSuccess(res, 200, { item: mapGeraet(row) });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'SERIENNUMMER_CONFLICT') {
          return sendError(res, 409, 'CONFLICT', 'Seriennummer bereits vergeben.');
        }
        if (msg === 'VALIDATION_TYP') {
          return sendError(res, 400, 'VALIDATION_ERROR', 'Feld „typ“ darf nicht leer sein.');
        }
        throw e;
      }
    } catch (e) {
      return next(e);
    }
  });

  router.delete('/:id', geLoeschen, async (req, res, next) => {
    try {
      const firmaId = await resolveFirmaIdForRequest(req);
      if (!firmaId) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'firma_id fehlt (oder User ohne company_id).');
      }
      const id = requiredTrimmed(req.params.id);
      if (!id) {
        return sendError(res, 400, 'VALIDATION_ERROR', 'Ungültige Geräte-ID.');
      }
      const ok = await store.deleteGeraet(id, firmaId);
      if (!ok) {
        return sendError(res, 404, 'NOT_FOUND', 'Gerät nicht gefunden.');
      }
      return sendSuccess(res, 200, { deleted: true, id });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
