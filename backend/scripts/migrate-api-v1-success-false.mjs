/**
 * One-shot: replace legacy `return res.status(...).json({ success: false, error: '...' });`
 * with sendError(...) in api-v1.js
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(root, '..', 'src', 'routes', 'api-v1.js');
let s = fs.readFileSync(file, 'utf8');

function esc(msg) {
  return msg.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// 400 / 404 single-quoted message (no embedded ')
s = s.replace(
  /return res\.status\(400\)\.json\(\{ success: false, error: '([^']*)' \}\);/g,
  (_, msg) => `return sendError(res, 400, 'VALIDATION_ERROR', '${esc(msg)}');`,
);
s = s.replace(
  /return res\.status\(404\)\.json\(\{ success: false, error: '([^']*)' \}\);/g,
  (_, msg) => `return sendError(res, 404, 'NOT_FOUND', '${esc(msg)}');`,
);

fs.writeFileSync(file, s);
console.log('done', file);
