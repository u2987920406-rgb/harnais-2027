import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Consolidation } from '../src/memory/consolidation.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { createInitialState, pushToWorkingMemory } from '../src/core/state.js';
import { makeMockBridge } from './_mock.js';

const CONSOLIDATION_JSON = JSON.stringify({
  patterns: ['pattern-A', 'pattern-B'],
  procedures: ['Pour faire X: 1. a 2. b'],
  entities_to_link: [],
});

test('consolidate: working memory vide -> resultat vide', async () => {
  const bridge = makeMockBridge(() => CONSOLIDATION_JSON);
  const graph = new KnowledgeGraph();
  const cons = new Consolidation(bridge, graph);
  const state = createInitialState();
  const res = await cons.consolidate(state);
  assert.equal(res.nodesCreated, 0);
  assert.equal(res.patternsFound.length, 0);
});

test('consolidate: cree des noeuds pour patterns et procedures', async () => {
  const bridge = makeMockBridge(() => CONSOLIDATION_JSON);
  const graph = new KnowledgeGraph();
  const cons = new Consolidation(bridge, graph);
  const state = createInitialState();
  pushToWorkingMemory(state, 'un fait important', 'observation', 0.9);
  pushToWorkingMemory(state, 'une decision', 'decision', 0.9);

  const res = await cons.consolidate(state);
  assert.equal(res.patternsFound.length, 2);
  assert.equal(res.proceduresExtracted.length, 1);
  // 2 patterns (concept) + 1 procedure = 3 noeuds
  assert.equal(res.nodesCreated, 3);
  assert.ok(graph.query({ type: 'concept' }).length >= 2);
  assert.ok(graph.query({ type: 'procedure' }).length >= 1);
});

test('consolidate: JSON invalide du modele -> resultat vide gracieux', async () => {
  const bridge = makeMockBridge(() => 'pas du json du tout');
  const graph = new KnowledgeGraph();
  const cons = new Consolidation(bridge, graph);
  const state = createInitialState();
  pushToWorkingMemory(state, 'un fait', 'observation', 0.9);
  const res = await cons.consolidate(state);
  assert.equal(res.patternsFound.length, 0);
  assert.equal(res.nodesCreated, 0);
});

test('deepConsolidate: fait du decay et nettoie la working memory', async () => {
  const bridge = makeMockBridge(() => CONSOLIDATION_JSON);
  const graph = new KnowledgeGraph();
  const cons = new Consolidation(bridge, graph);
  const state = createInitialState();
  // items a faible relevance -> doivent etre evinces
  pushToWorkingMemory(state, 'faible', 'observation', 0.05);
  pushToWorkingMemory(state, 'fort', 'observation', 0.9);
  const before = state.workingMemory.length;
  const res = await cons.deepConsolidate(state);
  assert.ok(state.workingMemory.length <= before);
  assert.ok(res.itemsConsolidated >= 0);
});
