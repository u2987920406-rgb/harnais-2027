import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dockerRunCmd, wrapForWhitelist, escapeShell } from '../src/security/sandbox.js';
import { createTerminalTools } from '../src/tools/terminal.js';

test('dockerRunCmd: construit une commande docker avec montage /work', () => {
  const out = dockerRunCmd('ls');
  assert.ok(out.includes('docker run'), 'doit contenir "docker run"');
  assert.ok(out.includes('/work'), 'doit monter le cwd dans /work');
  assert.ok(out.includes('alpine:latest'), 'image par défaut alpine:latest');
  assert.ok(out.includes('sh -c'), 'exécute via sh -c');
  assert.ok(out.includes('--network=none'), 'confinement réseau');
  assert.ok(out.includes('--read-only'), 'FS lecture seule');
});

test('dockerRunCmd: image personnalisable', () => {
  const out = dockerRunCmd('echo hi', 'ubuntu:24.04');
  assert.ok(out.includes('ubuntu:24.04'));
  assert.ok(!out.includes('alpine'));
});

test('wrapForWhitelist: autorise une commande de l\'allowlist', () => {
  const r = wrapForWhitelist('ls -la /tmp');
  assert.equal(r.ok, true);
  assert.equal(r.cmd, 'ls -la /tmp');
});

test('wrapForWhitelist: refuse une commande hors allowlist', () => {
  const r = wrapForWhitelist('rm -rf /');
  assert.equal(r.ok, false);
  assert.match(r.reason ?? '', /allowlist/);
});

test('wrapForWhitelist: refuse sudo et binaires arbitraires', () => {
  assert.equal(wrapForWhitelist('sudo reboot').ok, false);
  assert.equal(wrapForWhitelist('nc -e /bin/sh').ok, false);
  assert.equal(wrapForWhitelist('mycustombinary --exploit').ok, false);
});

test('escapeShell: neutralise les metas caracteres', () => {
  const e = escapeShell('echo $(rm -rf /)');
  // Les expansions $(...) sont échappées par backslash => présence de '\$('
  assert.ok(e.includes('\\$('), 'le $ de $(...) doit etre echappe');
  // Le shell ne verra plus de $(...) actif car le $ est protégé.
  assert.equal(e, 'echo \\$(rm -rf /)');
  // Une commande banale reste lisible.
  assert.equal(escapeShell('ls -la'), 'ls -la');
});

test('createTerminalTools(none): expose shell_exec dangerous', () => {
  const tools = createTerminalTools('none');
  assert.equal(tools.length, 1);
  const t = tools[0];
  assert.equal(t.name, 'shell_exec');
  assert.equal(t.risk, 'dangerous');
});

test('createTerminalTools(whitelist): shell_exec refuse hors allowlist', async () => {
  const [tool] = createTerminalTools('whitelist');
  const res = await tool.execute({ command: 'rm -rf /' });
  assert.equal(res.success, false);
  assert.match(res.error ?? '', /whitelist/);
  assert.equal(res.data?.blocked, true);
});

test('createTerminalTools(whitelist): shell_exec autorise ls', async () => {
  const [tool] = createTerminalTools('whitelist');
  const res = await tool.execute({ command: 'ls' });
  // Le binaire existe, donc succès (ou échec bénin mais pas un blocage whitelist)
  assert.notEqual(res.data?.blocked, true);
});

test('createTerminalTools(docker): enveloppe la commande via docker', async () => {
  const [tool] = createTerminalTools('docker');
  // docker probablement absent en CI ; on vérifie juste que la commande
  // effective est bien encapsulée (data.command contient docker run).
  const res = await tool.execute({ command: 'echo hi' });
  assert.ok((res.data?.command ?? '').includes('docker run'));
});
