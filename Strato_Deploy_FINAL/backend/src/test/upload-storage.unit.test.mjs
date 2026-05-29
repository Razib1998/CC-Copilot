/**
 * Phase A6: einheitliche Upload-Pfade + sichere Dateinamen.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import {
  getUploadsRoot,
  joinUploadRelative,
  resolveUploadAbsolute,
  safeStoredFilename,
  sanitizePathSegment,
  writeUploadBufferSync,
} from '../lib/upload-storage.js';

let prevUploadsRoot = '';

before(() => {
  prevUploadsRoot = process.env.UPLOADS_ROOT || '';
  process.env.UPLOADS_ROOT = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'cc-upload-')), 'up');
});

after(() => {
  if (prevUploadsRoot) process.env.UPLOADS_ROOT = prevUploadsRoot;
  else delete process.env.UPLOADS_ROOT;
});

test('joinUploadRelative: Schema uploads/modul/project/resource/datei', () => {
  const rel = joinUploadRelative('messeflow-waende', 'proj-1', 'wand', 'x.pdf');
  assert.match(rel, /^messeflow-waende\/proj-1\/wand\/.+\.pdf$/);
});

test('sanitizePathSegment blockiert path traversal', () => {
  assert.equal(sanitizePathSegment('..'), 'x');
  assert.ok(!String(sanitizePathSegment('abc')).includes('..'));
});

test('safeStoredFilename: zwei Aufrufe → unterschiedliche Namen', () => {
  const a = safeStoredFilename('foo.png');
  const b = safeStoredFilename('foo.png');
  assert.notEqual(a, b);
  assert.ok(a.endsWith('.png'));
});

test('writeUploadBufferSync + resolveUploadAbsolute', () => {
  const buf = Buffer.from('x');
  const { relativePath, absolutePath } = writeUploadBufferSync({
    moduleKey: 'schaeden-fotos',
    projectId: 'p1',
    resourceKey: 'schaden',
    buffer: buf,
    originalName: 'test.jpg',
  });
  assert.ok(fs.existsSync(absolutePath));
  const abs2 = resolveUploadAbsolute(relativePath);
  assert.equal(path.resolve(abs2 || ''), path.resolve(absolutePath));
  const root = path.resolve(getUploadsRoot());
  assert.ok(String(absolutePath).startsWith(root));
});

test('resolveUploadAbsolute lehnt Escape ab', () => {
  assert.equal(resolveUploadAbsolute('../../../etc/passwd'), null);
});
