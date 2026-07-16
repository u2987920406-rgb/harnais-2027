import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WorkflowEngine, formatTrace, type WorkflowDef } from '../src/core/workflow.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { ToolRegistry } from '../src/tools/registry.js';
import { makeMockBridge } from './_mock.js';

function makeEngine(responder = (_p: string, _m: any) => 'reponse-agent') {
  const bridge = makeMockBridge(responder);
  const tools = new ToolRegistry();
  const graph = new KnowledgeGraph();
  return { engine: new WorkflowEngine(bridge, tools, graph), bridge, tools, graph };
}

test('run: transform simple, un seul noeud', async () => {
  const { engine } = makeEngine();
  const def: WorkflowDef = {
    id: 'wf1',
    nodes: [{ id: 'double', kind: 'transform', ref: 'x2', transform: (i: any) => (i ?? 0) * 2 }],
    edges: [],
  };
  const res = await engine.run(def, { 'double:in': 21 });
  assert.equal(res.ok, true);
  assert.equal(res.outputs['double'], 42);
});

test('run: chaine transform -> transform via edge', async () => {
  const { engine } = makeEngine();
  const def: WorkflowDef = {
    id: 'wf2',
    nodes: [
      { id: 'a', kind: 'transform', ref: 'plus1', transform: (i: any) => (i ?? 0) + 1 },
      { id: 'b', kind: 'transform', ref: 'times10', transform: (i: any) => (i as number) * 10 },
    ],
    edges: [{ from: 'a', to: 'b' }],
  };
  const res = await engine.run(def, { 'a:in': 4 });
  assert.equal(res.ok, true);
  assert.equal(res.outputs['b'], 50); // (4+1)*10
});

test('run: noeud agent appelle le bridge', async () => {
  const { engine, bridge } = makeEngine(() => 'texte-genere');
  const def: WorkflowDef = {
    id: 'wf3',
    nodes: [{ id: 'penseur', kind: 'agent', ref: 'penseur', system: 'sys', capability: 'general' }],
    edges: [],
  };
  const res = await engine.run(def, { 'penseur:in': 'reflechis' });
  assert.equal(res.ok, true);
  assert.equal(res.outputs['penseur'], 'texte-genere');
  assert.equal(bridge.calls.length, 1);
});

test('run: outil inconnu -> echec avec trace failed', async () => {
  const { engine } = makeEngine();
  const def: WorkflowDef = {
    id: 'wf4',
    nodes: [{ id: 'op', kind: 'tool', ref: 'inexistant' }],
    edges: [],
  };
  const res = await engine.run(def, {});
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /inconnu/);
  assert.equal(res.trace[0].status, 'failed');
});

test('run: cycle detecte -> throw', async () => {
  const { engine } = makeEngine();
  const def: WorkflowDef = {
    id: 'wf5',
    nodes: [
      { id: 'a', kind: 'transform', ref: 't', transform: (i: any) => i },
      { id: 'b', kind: 'transform', ref: 't', transform: (i: any) => i },
    ],
    edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }],
  };
  await assert.rejects(() => engine.run(def, {}), /cycle/);
});

test('run: maxSteps borne l execution', async () => {
  const { engine } = makeEngine();
  const nodes = Array.from({ length: 5 }, (_, i) => ({
    id: `n${i}`, kind: 'transform' as const, ref: 't', transform: (x: any) => x,
  }));
  const edges = Array.from({ length: 4 }, (_, i) => ({ from: `n${i}`, to: `n${i + 1}` }));
  const def: WorkflowDef = { id: 'wf6', nodes, edges, maxSteps: 2 };
  const res = await engine.run(def, {});
  assert.equal(res.ok, false);
  assert.match(res.error ?? '', /maxSteps/);
});

test('formatTrace: rend un texte lisible', () => {
  const txt = formatTrace([
    { id: 'a', kind: 'transform', ref: 't', status: 'done', ms: 5 },
    { id: 'b', kind: 'tool', ref: 'x', status: 'failed', ms: 2, error: 'boom' },
  ]);
  assert.match(txt, /OK a/);
  assert.match(txt, /KO b/);
  assert.match(txt, /boom/);
});
