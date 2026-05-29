import { loadAccessProfile } from '../auth/access-profile.js';
import { sendError } from '../lib/api-v1-envelope.js';

/**
 * Lädt `req.accessProfile` nach `requireAuth`.
 * @param {object} store
 */
export function attachAccessProfile(store) {
  return async (req, res, next) => {
    try {
      const uid = req.auth?.userId;
      if (!uid) {
        return sendError(res, 401, 'AUTH_REQUIRED', 'Authentifizierung erforderlich.');
      }
      req.accessProfile = await loadAccessProfile(store, uid);
      return next();
    } catch (e) {
      return next(e);
    }
  };
}
