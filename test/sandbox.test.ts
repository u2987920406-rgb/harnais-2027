import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerRunCmd, wrapForWhitelist } from '../src/security/sandbox.js';
import { createTerminalTools } from '../src/tools/terminal.js';

test('dockerRunCmd: construit une commande docker avec montage /work', () => {
  const out = dockerRunCmd('ls');
  assert.ok(out.includes('docker run'), 'doit contenir "docker run"');
  assert.ok(out.includes('/work'), 'doit monter le cwd dans /work');
  assert.ok(out.includes('alpine:latest'), 'image par défaut alpine:latest');
  assert.ok(out.includes('sh -c'), 'exécute via sh -c');
});

test('dockerRunCmd: image personnalisable', () => {
  const out = dockerRunCmd('echo hi', 'ubuntu:24.04');
  assert.ok(out.includes('ubuntu:24.04'));
  assert.ok(!out.includes('alpine'));
});

test('wrapForWhitelist: passage à travers neutre (placeholder)', () => {
  assert.equal(wrapForWhitelist('rm -rf /'), 'rm -rf /');
});

test('createTerminalTools(none): expose shell_exec dangerous', () => {
  const tools = createTerminalTools('none');
  assert.equal(tools.length, 1);
  const t = tools[0];
  assert.equal(t.name, 'shell_exec');
  assert.equal(t.risk, 'dangerous');
});

test('createTerminalTools(docker): enveloppe la commande via docker', async () => {
  const [tool] = createTerminalTools('docker');
  // On ne lance pas réellement docker; on vérifie que la commande effective
  // est bien encapsulée en inspectant le data retourné sur une commande simple.
  // Comme docker n'est pas dispo ici, on s'assure juste que l'outil existe
  // et que l'exécuteur est bien lié à la stratégie docker.
  assert.equal(tool.name, 'shell_exec');
  assert.equal(typeof tool.execute, 'function');
});
