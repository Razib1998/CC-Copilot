/**
 * Replace `return res.status(N).json({ error: 'CODE', message: 'MSG' });` with sendError.
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

s = s.replace(
  /return res\.status\((\d+)\)\.json\(\{\s*error:\s*'([^']+)',\s*message:\s*'([^']*)'\s*\}\);/g,
  (_, status, code, msg) => `return sendError(res, ${status}, '${code}', '${esc(msg)}');`,
);

fs.writeFileSync(file, s);
console.log('done', file);
