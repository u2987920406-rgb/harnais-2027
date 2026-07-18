import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Governance, type GovernanceMode } from '../src/security/governance.js';

test('plan mode: shell_exec refuse (deny)', () => {
  const g = new Governance('plan', 'none', false);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'deny');
});

test('permission mode: shell_exec demande confirmation (ask)', () => {
  const g = new Governance('permission', 'none', true);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'ask');
});

test('auto mode + whitelist: commande rm refuse', () => {
  const g = new Governance('auto', 'whitelist', true);
  const d = g.decide('shell_exec', { command: 'rm -rf /' });
  assert.equal(d.action, 'deny');
});

test('auto mode + whitelist: commande ls autorise', () => {
  const g = new Governance('auto', 'whitelist', true);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'allow');
});

test('edit mode: file_write demande confirmation (ask)', () => {
  const g = new Governance('edit', 'none', true);
  const d = g.decide('file_write', { path: '/tmp/x', content: 'y' });
  assert.equal(d.action, 'ask');
});

test('edit mode: file_read autorise', () => {
  const g = new Governance('edit', 'none', true);
  const d = g.decide('file_read', { path: '/tmp/x' });
  assert.equal(d.action, 'allow');
});
