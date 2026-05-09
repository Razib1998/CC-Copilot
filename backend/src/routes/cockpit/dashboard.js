/**
 * Phase B2: GET /api/v1/cockpit/dashboard — aggregierte Kennzahlen (read-only).
 */

import { Router } from 'express';
import { sendSuccess } from '../../lib/api-v1-envelope.js';
import { cachedDashboardStats } from '../../lib/dashboard-stats-cache.js';
import { requireDashboardModule } from '../../middleware/require-dashboard-module.js';

/**
 * @param {object} store
 */
export function createCockpitDashboardRouter(store) {
  const router = Router();

  router.get('/', requireDashboardModule('cockpit'), async (req, res, next) => {
    try {
      const stats = await cachedDashboardStats('cockpit:dashboard:v1', 30_000, () =>
        store.getDashboardCockpitStats(),
      );
      return sendSuccess(res, 200, { stats });
    } catch (e) {
      return next(e);
    }
  });

  return router;
}
