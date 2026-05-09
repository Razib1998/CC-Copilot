/**
 * One-shot: res.status().json({ success: false, error: ... }) → sendError(...)
 * Run from backend/: node scripts/migrate-api-v1-errors.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const target = path.join(__dirname, '..', 'src', 'routes', 'api-v1.js');

function codeFor(status) {
  const n = Number(status);
  if (n === 404) return 'NOT_FOUND';
  if (n === 403) return 'FORBIDDEN';
  if (n === 401) return 'UNAUTHORIZED';
  if (n === 409) return 'CONFLICT';
  if (n === 502 || n === 503) return 'BAD_GATEWAY';
  return 'VALIDATION_ERROR';
}

let s = fs.readFileSync(target, 'utf8');
// Match `.json({ success: false, error: <literal> });` — note single `)` closing `.json(`
const re =
  /return res\.status\((\d+)\)\.json\(\{\s*success:\s*false,\s*error:\s*((?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"))\s*\}\)\);/gs;

let count = 0;
s = s.replace(re, (_, status, errLit) => {
  count += 1;
  const code = codeFor(status);
  const inner = errLit.trim();
  if (inner.startsWith('`')) {
    return `return sendError(res, ${status}, '${code}', ${inner});`;
  }
  const msg = inner.slice(1, -1).replace(/\\'/g, "'");
  return `return sendError(res, ${status}, '${code}', '${msg.replace(/'/g, "\\'")}');`;
});

console.log('[migrate-api-v1-errors] replaced', count, 'patterns');
fs.writeFileSync(target, s);
