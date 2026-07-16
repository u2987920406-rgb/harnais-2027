import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createFilesystemTools } from '../src/tools/filesystem.js';
import { ToolRegistry } from '../src/tools/registry.js';

function reg(): ToolRegistry {
  const r = new ToolRegistry();
  for (const t of createFilesystemTools()) r.register(t);
  return r;
}

test('createFilesystemTools: expose read/write/list/search', () => {
  const tools = createFilesystemTools();
  const names = tools.map(t => t.name);
  assert.deepEqual(names.sort(), ['file_list', 'file_read', 'file_search', 'file_write']);
});

test('file_write puis file_read: aller-retour', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-fs-'));
  const path = join(dir, 'note.txt');
  const r = reg();

  const w = await r.execute('file_write', { path, content: 'bonjour' });
  assert.equal(w.success, true);
  assert.ok(existsSync(path));

  const rd = await r.execute('file_read', { path });
  assert.equal(rd.success, true);
  assert.equal(rd.output, 'bonjour');
  assert.equal(rd.data.lines, 1);

  rmSync(dir, { recursive: true, force: true });
});

test('file_read: fichier absent -> echec', async () => {
  const r = reg();
  const rd = await r.execute('file_read', { path: join(tmpdir(), 'nexiste-pas-xyz-123.txt') });
  assert.equal(rd.success, false);
  assert.match(rd.error ?? '', /introuvable/);
});

test('file_list: liste le repertoire', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-fs-'));
  writeFileSync(join(dir, 'a.txt'), 'x');
  writeFileSync(join(dir, 'b.txt'), 'yy');
  const r = reg();
  const l = await r.execute('file_list', { path: dir });
  assert.equal(l.success, true);
  assert.equal(l.data.count, 2);
  assert.match(l.output, /a\.txt/);
  rmSync(dir, { recursive: true, force: true });
});

test('file_search: trouve par pattern', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-fs-'));
  writeFileSync(join(dir, 'config.json'), '{}');
  writeFileSync(join(dir, 'readme.md'), '#');
  const r = reg();
  const s = await r.execute('file_search', { path: dir, pattern: '\\.json$' });
  assert.equal(s.success, true);
  assert.equal(s.data.count, 1);
  assert.match(s.output, /config\.json/);
  rmSync(dir, { recursive: true, force: true });
});
