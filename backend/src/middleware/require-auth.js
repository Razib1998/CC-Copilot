import { verifyAccessToken } from '../auth/jwt.js';
import { sendError } from '../lib/api-v1-envelope.js';

function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || typeof authorizationHeader !== 'string') return null;
  const m = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : null;
}

export function requireAuth(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return sendError(res, 401, 'AUTH_REQUIRED', 'Authentifizierung erforderlich (Bearer-Token).');
  }
  try {
    const decoded = verifyAccessToken(token);
    const sub = decoded.sub;
    if (!sub) {
      return sendError(res, 401, 'INVALID_TOKEN', 'Ungültiges Token.');
    }
    req.auth = {
      userId: sub,
      email: typeof decoded.email === 'string' ? decoded.email : undefined,
    };
    return next();
  } catch {
    return sendError(res, 401, 'INVALID_TOKEN', 'Token abgelaufen oder ungültig.');
  }
}
