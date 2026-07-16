import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Cortex } from '../src/core/cortex.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { makeMockBridge } from './_mock.js';
import type { WorkflowDef } from '../src/core/workflow.js';

function makeCortex(responder = (_p: string, _m: any) => 'reponse finale du cortex') {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-cortex-'));
  const bridge = makeMockBridge(responder);
  const graph = new KnowledgeGraph(join(dir, 'graph.json'));
  const cortex = new Cortex(bridge, graph, {
    statePath: join(dir, 'state.json'),
    tickIntervalMs: 999999,
  });
  return { cortex, bridge, graph, dir };
}

test('constructor: expose graph et skills, charge les skills', () => {
  const { cortex, dir } = makeCortex();
  assert.ok(cortex.graph instanceof KnowledgeGraph);
  assert.ok(cortex.skills.list().length >= 30);
  rmSync(dir, { recursive: true, force: true });
});

test('inject: reponse simple (sans outil) revient telle quelle', async () => {
  const { cortex, dir } = makeCortex(() => 'Bonjour Raf, voici ma reponse.');
  const res = await cortex.inject('Salut');
  assert.equal(res, 'Bonjour Raf, voici ma reponse.');
  rmSync(dir, { recursive: true, force: true });
});

test('inject: enregistre input+output dans la working memory', async () => {
  const { cortex, dir } = makeCortex(() => 'ok');
  await cortex.inject('une question');
  const wm = cortex.state.workingMemory;
  assert.ok(wm.some(w => w.type === 'user_input' && w.content === 'une question'));
  assert.ok(wm.some(w => w.type === 'model_output'));
  rmSync(dir, { recursive: true, force: true });
});

test('inject: cree des noeuds episode dans le graphe', async () => {
  const { cortex, dir } = makeCortex(() => 'ok');
  const before = cortex.graph.stats().nodes;
  await cortex.inject('test graphe');
  assert.ok(cortex.graph.stats().nodes > before);
  assert.ok(cortex.graph.query({ type: 'episode' }).length >= 2);
  rmSync(dir, { recursive: true, force: true });
});

test('inject: appel d outil (file via TOOL/PARAMS) est execute puis reponse finale', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-cortex-'));
  const target = join(dir, 'out.txt');
  const bridge = makeMockBridge((prompt: string) => {
    // Le prompt de tool-calling contient les instructions "TOOL:"; on y injecte l'appel.
    // Apres execution, le prompt de round 2 contient "Resultat de".
    if (prompt.includes('Resultat de')) return 'Fichier ecrit avec succes.';
    if (prompt.startsWith('ecris un fichier')) {
      return `TOOL: file_write\nPARAMS: {"path": ${JSON.stringify(target)}, "content": "export const x = 1;"}`;
    }
    return 'neutral'; // analyzeTone et autres
  });
  const graph = new KnowledgeGraph(join(dir, 'graph.json'));
  const cortex = new Cortex(bridge, graph, { statePath: join(dir, 'state.json'), tickIntervalMs: 999999 });
  const res = await cortex.inject('ecris un fichier');
  assert.match(res, /succes/);
  // un noeud Action doit exister
  assert.ok(graph.query({ labelContains: 'Action' }).length >= 1);
  rmSync(dir, { recursive: true, force: true });
});

test('runWorkflow: pipeline transform simple', async () => {
  const { cortex, dir } = makeCortex();
  const def: WorkflowDef = {
    id: 'wf-cortex',
    nodes: [{ id: 'inc', kind: 'transform', ref: 'inc', transform: (i: any) => (i ?? 0) + 100 }],
    edges: [],
  };
  const out = await cortex.runWorkflow(def, { 'inc:in': 5 });
  assert.equal(out, '105');
  rmSync(dir, { recursive: true, force: true });
});

test('introspect: retourne un rapport lisible', async () => {
  const { cortex, dir } = makeCortex();
  const report = await cortex.introspect();
  assert.match(report, /INTROSPECTION CORTEX/);
  assert.match(report, /Graphe/);
  rmSync(dir, { recursive: true, force: true });
});
