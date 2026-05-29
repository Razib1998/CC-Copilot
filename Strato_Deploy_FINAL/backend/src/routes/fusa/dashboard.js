/**
 * Phase B2: GET /api/v1/fusa/dashboard — aggregierte Kennzahlen (read-only).
 */

import { Router } from 'express';
import { sendSuccess } from '../../lib/api-v1-envelope.js';
import { cachedDashboardStats } from '../../lib/dashboard-stats-cache.js';
import { requireDashboardModule } from '../../middleware/require-dashboard-module.js';

/**
 * @param {object} store
 */
export function createFusaDashboardRouter(store) {
  const router = Router();

  router.get('/', requireDashboardModule('fusa'), async (req, res, next) => {
    try {
      const q = req.query || {};
      const projectId = typeof q.project_id === 'string' && q.project_id.trim() ? q.project_id.trim() : null;
      const cacheKey = `fusa:dashboard:v1:${projectId || 'all'}`;
      const stats = await cachedDashboardStats(cacheKey, 30_000, () =>
        store.getDashboardFusaStats({ projectId }),
      );
      return sendSuccess(res, 200, { stats });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
