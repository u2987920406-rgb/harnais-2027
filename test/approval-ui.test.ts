import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Cortex } from '../src/core/cortex.js';
import { UIApprovalChannel } from '../src/ui/server.js';

// Test du canal d'approbation UI + exposure de setGovernanceMode.
// Le canal UIApprovalChannel est Telegram-ready: meme contrat ask/resolve.

test('UIApprovalChannel: ask() suspend jusqu\'a resolve()', async () => {
  const channel = new UIApprovalChannel();
  // On simule un appel du Cortex (mode permission) sans resoudre tout de suite.
  const pending = channel.ask('shell_exec', { command: 'ls' }, 'validation requise');
  assert.equal(channel.pendingForUI().length, 1);

  const first = channel.pendingForUI()[0];
  assert.equal(first.tool, 'shell_exec');
  assert.equal(first.reason, 'validation requise');

  // La promise ne doit pas etre resolue avant resolve().
  let settled = false;
  pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'la promise ne doit pas se resoudre avant resolve()');

  // On valide -> la promise se resout a true.
  channel.resolve(first.id, true);
  const result = await pending;
  assert.equal(result, true);
  assert.equal(channel.pendingForUI().length, 0);
});

test('UIApprovalChannel: resolve(false) refuse l\'action', async () => {
  const channel = new UIApprovalChannel();
  const pending = channel.ask('file_write', { path: '/tmp/x' }, 'edition');
  const id = channel.pendingForUI()[0].id;
  channel.resolve(id, false);
  assert.equal(await pending, false);
});

test('Cortex + canal: setGovernanceMode bascule et le canal valide', async () => {
  // Cortex reel (sans args) cree ses propres bridges.
  const cortex = new Cortex();
  cortex.setGovernanceMode('permission');
  assert.equal(cortex.governanceMode, 'permission');

  // On branche un canal UI et on verifie ask()/resolve() de bout en bout.
  const channel = new UIApprovalChannel();
  cortex.approvalChannel = channel;

  const pending = channel.ask('shell_exec', {}, 'x');
  const id = channel.pendingForUI()[0].id;
  channel.resolve(id, true);
  assert.equal(await pending, true);
});

test('UIServer branche un UIApprovalChannel sur le Cortex', async () => {
  const cortex = new Cortex();
  // Import dynamique pour éviter le cycle au top-level si besoin.
  const { UIServer } = await import('../src/ui/server.js');
  const server = new UIServer(cortex);
  // Le canal d'approbation du cortex doit etre le UIApprovalChannel du serveur.
  assert.ok(cortex.approvalChannel instanceof UIApprovalChannel);
  server.stop();
});
