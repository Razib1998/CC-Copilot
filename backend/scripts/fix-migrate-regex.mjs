import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, 'migrate-api-v1-errors.mjs');
let t = fs.readFileSync(p, 'utf8');
const bad = '*"))\\s*\\}\\)\\);/gs';
const good = '*"))\\s*\\}\\)\\);/gs';
if (!t.includes(bad)) {
  console.log('bad pattern not found');
  console.log(t.split('\n')[24]?.slice(-50));
} else {
  t = t.split(bad).join(good);
  fs.writeFileSync(p, t);
  console.log('fixed migrate regex closing');
}
