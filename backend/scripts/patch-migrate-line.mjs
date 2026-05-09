import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, 'migrate-api-v1-errors.mjs');
const lines = fs.readFileSync(p, 'utf8').split('\n');
const head = String.raw`  /return res\.status\((\d+)\)\.json\(\{\s*success:\s*false,\s*error:\s*((?:'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"))`;
const tail = String.raw`\s*\}\)\);/gs`;
lines[24] = head + tail + ';';
fs.writeFileSync(p, lines.join('\n'));
console.log('patched line 25, tail:', tail);
