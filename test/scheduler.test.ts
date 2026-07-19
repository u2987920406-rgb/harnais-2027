import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/core/scheduler.js';
import { Spawner } from '../src/cognition/spawner.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { makeMockBridge } from './_mock.js';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function freshScheduler(): { s: Scheduler; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-sched-'));
  const s = new Scheduler(join(dir, 'scheduler.json'));
  return { s, dir };
}

test('addJob: cree un job et le persiste en JSON', () => {
  const { s, dir } = freshScheduler();
  const id = s.addJob('rapport-matinal', { kind: 'daily', atHour: 9 }, 'resume du jour');
  const job = s.get(id)!;
  assert.ok(job, 'job present');
  assert.equal(job.name, 'rapport-matinal');
  assert.equal(job.enabled, true);
  assert.equal(job.runCount, 0);
  // Relit depuis un nouveau scheduler (meme fichier) -> persistance OK
  const reloaded = new Scheduler(join(dir, 'scheduler.json'));
  assert.equal(reloaded.list().length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('dueJobs: un job jamais execute est du immediatement', () => {
  const { s, dir } = freshScheduler();
  s.addJob('toutes-30', { kind: 'every', minutes: 30 }, 'verif');
  assert.equal(s.dueJobs().length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('dueJobs: respecte l intervalle every (pas du avant echeance)', () => {
  const { s, dir } = freshScheduler();
  const id = s.addJob('toutes-30', { kind: 'every', minutes: 30 }, 'verif');
  // simule un run il y a 5 min
  const job = s.get(id)!;
  job.lastRun = Date.now() - 5 * 60_000;
  assert.equal(s.dueJobs().length, 0, 'pas encore dû');
  // simule un run il y a 35 min -> dû
  job.lastRun = Date.now() - 35 * 60_000;
  assert.equal(s.dueJobs().length, 1, 'dû apres echeance');
  rmSync(dir, { recursive: true, force: true });
});

test('run: execute via le spawner et incremente runCount', async () => {
  const { s, dir } = freshScheduler();
  const bridge = makeMockBridge(() => 'rapport du jour OK');
  s.setRuntime(new Spawner(bridge, new KnowledgeGraph()), new KnowledgeGraph());
  const id = s.addJob('rapport', { kind: 'daily', atHour: 8 }, 'fais un resume');
  const out = await s.run(s.get(id)!);
  assert.match(out, /rapport du jour OK/);
  assert.equal(s.get(id)!.runCount, 1);
  assert.ok(s.get(id)!.lastRun !== null);
  rmSync(dir, { recursive: true, force: true });
});

test('removeJob / enableJob: gestion du cycle de vie', () => {
  const { s, dir } = freshScheduler();
  const id = s.addJob('x', { kind: 'every', minutes: 10 }, 't');
  assert.ok(s.removeJob(id));
  assert.equal(s.get(id), undefined);
  const id2 = s.addJob('y', { kind: 'every', minutes: 10 }, 't');
  s.enableJob(id2, false);
  assert.equal(s.get(id2)!.enabled, false);
  rmSync(dir, { recursive: true, force: true });
});
