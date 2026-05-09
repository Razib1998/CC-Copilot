/**
 * Phase B1: GET /api/v1/logs — Audit-Log lesen (Superadmin oder Cockpit mit Bereich logs/sehen).
 */

import { Router } from 'express';
import { sendError, sendSuccess } from '../lib/api-v1-envelope.js';

/**
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
function requireLogsAccess(req, res, next) {
  const p = req.accessProfile;
  if (!p) {
    return sendError(res, 500, 'INTERNAL_ERROR', 'Profil fehlt.');
  }
  if (p.isSuperAdmin()) {
    return next();
  }
  if (p.hasModule('cockpit') && p.has('cockpit', 'logs', 'sehen')) {
    return next();
  }
  return sendError(res, 403, 'FORBIDDEN', 'Kein Zugriff auf Logs');
}

/** @param {unknown} raw */
function payloadJsonToApi(raw) {
  if (raw == null || raw === '') return null;
  if (typeof raw === 'object') return raw;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    return JSON.parse(s);
  } catch {
    return raw;
  }
}

/** @param {Record<string, unknown>} row */
function mapAuditRow(row) {
  return {
    id: row.id,
    ts: row.ts,
    user_id: row.user_id,
    modul: row.modul,
    action: row.action,
    resource_type: row.resource_type,
    resource_id: row.resource_id,
    project_id: row.project_id,
    payload_json: payloadJsonToApi(row.payload_json),
  };
}

/**
 * @param {object} store
 */
export function createLogsRouter(store) {
  const router = Router();

  router.get('/', requireLogsAccess, async (req, res, next) => {
    try {
      const q = req.query || {};
      const pageRaw = q.page != null && q.page !== '' ? Number(q.page) : 1;
      const limitRaw = q.limit != null && q.limit !== '' ? Number(q.limit) : undefined;

      /** @type {{ page?: number, limit?: number, modul?: string, userId?: string, action?: string, resourceType?: string, from?: string, to?: string }} */
      const filters = {
        page: Number.isFinite(pageRaw) ? pageRaw : 1,
        limit: Number.isFinite(limitRaw) ? limitRaw : undefined,
        modul: typeof q.modul === 'string' ? q.modul : undefined,
        userId: typeof q.user_id === 'string' ? q.user_id : undefined,
        action: typeof q.action === 'string' ? q.action : undefined,
        resourceType: typeof q.resource_type === 'string' ? q.resource_type : undefined,
        from: typeof q.from === 'string' ? q.from : undefined,
        to: typeof q.to === 'string' ? q.to : undefined,
      };

      const result = await Promise.resolve(store.listAuditLogFiltered(filters));
      const items = (result.rows || []).map((r) => mapAuditRow(/** @type {Record<string, unknown>} */ (r)));
      return sendSuccess(res, 200, {
        items,
        page: result.page,
        limit: result.limit,
        total: result.total,
      });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
