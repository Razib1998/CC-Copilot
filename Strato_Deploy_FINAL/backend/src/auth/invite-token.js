import { randomBytes } from 'node:crypto';

/** Kryptografisch sicher, URL-sicher, eindeutig (DB UNIQUE). */
export function generateInviteToken() {
  return randomBytes(32).toString('base64url');
}
