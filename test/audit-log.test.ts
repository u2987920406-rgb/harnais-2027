import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AuditLog } from '../src/security/audit-log.js';
import { readFileSync, existsSync, rmSync, writeFileSync } from 'fs';

const PATH = 'data/test-audit.jsonl';

function fresh(): AuditLog {
  try { rmSync(PATH); } catch { /* ignore */ }
  return new AuditLog({ persistPath: PATH, secret: 'test-secret' });
}

test('AuditLog: record chaine les entrees (hash lie prevHash)', () => {
  const log = fresh();
  const e1 = log.record('shell_exec', { command: 'ls' }, 'allow', 'auto');
  const e2 = log.record('shell_exec', { command: 'pwd' }, 'ask-approved', 'permission');
  assert.equal(e1.seq, 1);
  assert.equal(e2.seq, 2);
  assert.equal(e1.prevHash, 'GENESIS');
  assert.equal(e2.prevHash, e1.hash);
  assert.ok(e1.hash.length === 64); // sha256
  assert.ok(e1.signature.length === 64); // hmac
});

test('AuditLog: verifyChain OK sur journal intact', () => {
  const log = fresh();
  log.record('shell_exec', { command: 'ls' }, 'allow', 'auto');
  log.record('file_write', { path: 'a.txt' }, 'ask-approved', 'edit');
  const v = log.verifyChain();
  assert.equal(v.ok, true);
  assert.equal(v.brokenAt, undefined);
});

test('AuditLog: verifyChain DETECTE une alteration', () => {
  const log = fresh();
  log.record('shell_exec', { command: 'ls' }, 'allow', 'auto');
  log.record('file_write', { path: 'a.txt' }, 'ask-approved', 'edit');
  // on altère une ligne du fichier (simule une modification malveillante)
  const raw = readFileSync(PATH, 'utf-8');
  const lines = raw.split('\n');
  const bad = JSON.parse(lines[0]);
  bad.tool = 'FORMAT_DISK'; // altération
  lines[0] = JSON.stringify(bad);
  writeFileSync(PATH, lines.join('\n'));
  const v = log.verifyChain();
  assert.equal(v.ok, false);
  assert.equal(v.brokenAt, 1);
});

test('AuditLog: replay reconstruit la chaine après reload', () => {
  const log = fresh();
  log.record('shell_exec', { command: 'ls' }, 'allow', 'auto');
  log.record('shell_exec', { command: 'pwd' }, 'deny', 'plan');
  const count1 = log.count;
  // nouveau log qui rejoue le fichier
  const log2 = new AuditLog({ persistPath: PATH, secret: 'test-secret' });
  assert.equal(log2.count, count1);
  assert.equal(log2.verifyChain().ok, true);
});
