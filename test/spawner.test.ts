import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spawner } from '../src/cognition/spawner.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { makeMockBridge } from './_mock.js';
import type { SpawnConfig } from '../src/cognition/spawner.js';

const SPAWN_JSON = JSON.stringify([
  { role: 'analyseur', task: 'analyser X', mode: 'reasoning', approach: 'decompose' },
  { role: 'redacteur', task: 'rediger Y', mode: 'creative', approach: 'synthese' },
]);

function cfg(role: string, task: string): SpawnConfig {
  return { role, task, mode: 'general', systemPrompt: 'sys', taskPrompt: task };
}

test('planDecomposition: parse un JSON de sous-taches', async () => {
  const bridge = makeMockBridge(() => SPAWN_JSON);
  const spawner = new Spawner(bridge, new KnowledgeGraph());
  const configs = await spawner.planDecomposition('faire un truc complexe');
  assert.equal(configs.length, 2);
  assert.equal(configs[0].role, 'analyseur');
  assert.equal(configs[1].mode, 'creative');
});

test('planDecomposition: JSON invalide -> fallback un seul process', async () => {
  const bridge = makeMockBridge(() => 'pas du json');
  const spawner = new Spawner(bridge, new KnowledgeGraph());
  const configs = await spawner.planDecomposition('tache');
  assert.equal(configs.length, 1);
  assert.equal(configs[0].mode, 'general');
});

test('spawn: succes, enregistre un noeud episode dans le graphe', async () => {
  const bridge = makeMockBridge(() => 'resultat du sous-agent');
  const graph = new KnowledgeGraph();
  const spawner = new Spawner(bridge, graph);
  const res = await spawner.spawn(cfg('worker', 'fais X'));
  assert.equal(res.success, true);
  assert.equal(res.output, 'resultat du sous-agent');
  assert.ok(graph.query({ type: 'episode' }).length >= 1);
});

test('spawnParallel: lance plusieurs process', async () => {
  const bridge = makeMockBridge(() => 'ok');
  const spawner = new Spawner(bridge, new KnowledgeGraph());
  const results = await spawner.spawnParallel([cfg('a', 't1'), cfg('b', 't2'), cfg('c', 't3')]);
  assert.equal(results.length, 3);
  assert.ok(results.every(r => r.success));
});

test('spawnPipeline: enchaine et injecte les resultats precedents', async () => {
  const bridge = makeMockBridge((prompt) => `echo:${prompt.slice(0, 10)}`);
  const spawner = new Spawner(bridge, new KnowledgeGraph());
  const results = await spawner.spawnPipeline([cfg('a', 'premier'), cfg('b', 'second')]);
  assert.equal(results.length, 2);
  assert.ok(results[1].success);
});

test('dispatch: delégation par lot avec concurrence limitée', async () => {
  const bridge = makeMockBridge((prompt) => `rep:${prompt.slice(4, 12)}`);
  const graph = new KnowledgeGraph();
  const spawner = new Spawner(bridge, graph);
  const { results, summary } = await spawner.dispatch(
    ['but un', 'but deux', 'but trois', 'but quatre', 'but cinq'],
    { concurrency: 2, context: 'test' }
  );
  // Tous les buts traités, meme avec concurrence < taille du lot
  assert.equal(results.length, 5);
  assert.ok(results.every(r => r.success));
  // Résumé présent et mentionne le taux de réussite
  assert.match(summary, /Dispatch\] 5\/5 réussis/);
  // Chaque but a enregistré un noeud episode dans le graphe
  assert.ok(graph.query({ type: 'episode' }).length >= 5);
});

test('getActiveSpawns: vide apres completion', async () => {
  const bridge = makeMockBridge(() => 'ok');
  const spawner = new Spawner(bridge, new KnowledgeGraph());
  await spawner.spawn(cfg('x', 't'));
  assert.equal(spawner.getActiveSpawns().length, 0);
});
