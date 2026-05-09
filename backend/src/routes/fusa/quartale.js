/**
 * Phase B4: GET /api/v1/fusa/quartale — Quartalsaggregation aus `fusa_rechnungen` (read-only).
 */

import { Router } from 'express';
import { sendSuccess } from '../../lib/api-v1-envelope.js';
import { requireDashboardModule } from '../../middleware/require-dashboard-module.js';

/**
 * @param {object} store
 */
export function createFusaQuartaleRouter(store) {
  const router = Router();

  router.get('/', requireDashboardModule('fusa'), async (req, res, next) => {
    try {
      const q = req.query || {};
      const projectId =
        typeof q.project_id === 'string' && q.project_id.trim() ? q.project_id.trim() : null;
      let jahr;
      if (q.jahr != null && String(q.jahr).trim() !== '') {
        const n = Number(q.jahr);
        jahr = Number.isFinite(n) ? n : undefined;
      }
      const payload = await store.aggregateFusaQuartale({ jahr, projectId });
      return sendSuccess(res, 200, payload);
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
