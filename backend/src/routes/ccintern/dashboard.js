/**
 * Phase B2: GET /api/v1/ccintern/dashboard — aggregierte Kennzahlen (read-only).
 */

import { Router } from 'express';
import { sendSuccess } from '../../lib/api-v1-envelope.js';
import { cachedDashboardStats } from '../../lib/dashboard-stats-cache.js';
import { requireDashboardModule } from '../../middleware/require-dashboard-module.js';

/**
 * @param {object} store
 */
export function createCcinternDashboardRouter(store) {
  const router = Router();

  router.get('/', requireDashboardModule('ccintern'), async (req, res, next) => {
    try {
      const stats = await cachedDashboardStats('ccintern:dashboard:v1', 30_000, () =>
        store.getDashboardCcinternStats(),
      );
      return sendSuccess(res, 200, { stats });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
