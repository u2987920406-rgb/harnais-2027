import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProcessRegistry } from '../src/tools/process-registry.js';

/** Petite attente utilitaire. */
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

test('ProcessRegistry: start capture la sortie et exit code', async () => {
  const reg = new ProcessRegistry();
  const p = reg.start('node', { args: ['-e', "console.log('hello'); process.exit(0)"] });
  assert.equal(p.status, 'running');
  assert.ok(p.pid, 'a un pid');

  // attend la fin
  for (let i = 0; i < 40; i++) {
    const cur = reg.get(p.id);
    if (cur && cur.status === 'exited') break;
    await sleep(50);
  }
  const done = reg.get(p.id)!;
  assert.equal(done.status, 'exited');
  assert.equal(done.exitCode, 0);

  const log = reg.log(p.id)!;
  assert.ok(log.some((l) => l.includes('hello')), 'sortie capturée');
});

test('ProcessRegistry: poll renvoie seulement les nouvelles lignes', async () => {
  const reg = new ProcessRegistry();
  const p = reg.start('node', { args: ['-e', "console.log('a'); console.log('b'); process.exit(0)"] });
  for (let i = 0; i < 40; i++) {
    if (reg.get(p.id)!.status === 'exited') break;
    await sleep(50);
  }
  const first = reg.poll(p.id)!;
  assert.ok(first.newOutput.length >= 2, 'a+b');
  const second = reg.poll(p.id)!;
  assert.equal(second.newOutput.length, 0, 'plus rien de neuf après lecture');
});

test('ProcessRegistry: list + prune nettoie les terminés', async () => {
  const reg = new ProcessRegistry();
  const p = reg.start('node', { args: ['-e', 'process.exit(0)'] });
  for (let i = 0; i < 40; i++) {
    if (reg.get(p.id)!.status === 'exited') break;
    await sleep(50);
  }
  assert.equal(reg.list().length, 1);
  const pruned = reg.prune();
  assert.equal(pruned, 1);
  assert.equal(reg.list().length, 0);
});

test('ProcessRegistry: kill arrête un process vivant', async () => {
  const reg = new ProcessRegistry();
  // process long (attend 10s)
  const p = reg.start('node', { args: ['-e', 'setTimeout(()=>{}, 10000)'] });
  await sleep(100);
  const killed = reg.kill(p.id);
  assert.equal(killed, true);
  for (let i = 0; i < 40; i++) {
    if (reg.get(p.id)!.status !== 'running') break;
    await sleep(50);
  }
  assert.notEqual(reg.get(p.id)!.status, 'running');
  reg.killAll();
});
