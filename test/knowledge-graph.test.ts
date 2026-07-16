import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';

function tempGraphPath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-graph-'));
  return join(dir, 'graph.json');
}

test('addNode: cree un noeud avec les valeurs par defaut', () => {
  const g = new KnowledgeGraph(tempGraphPath());
  const node = g.addNode('entity', 'Test', { foo: 'bar' }, 0.7);
  assert.equal(node.type, 'entity');
  assert.equal(node.label, 'Test');
  assert.equal(node.weight, 0.7);
  assert.equal(node.accessCount, 0);
  assert.deepEqual(g.getNode(node.id)?.id, node.id);
});

test('addEdge: relie deux noeuds existants', () => {
  const g = new KnowledgeGraph(tempGraphPath());
  const a = g.addNode('entity', 'A');
  const b = g.addNode('entity', 'B');
  const edge = g.addEdge(a.id, b.id, 'connu', 0.5);
  assert.ok(edge);
  assert.equal(edge!.from, a.id);
  assert.equal(edge!.to, b.id);
  assert.equal(g.getEdges(a.id).length, 1);
});

test('addEdge: refuse si un noeud n\'existe pas', () => {
  const g = new KnowledgeGraph(tempGraphPath());
  const a = g.addNode('entity', 'A');
  const edge = g.addEdge(a.id, 'inexistant', 'connu', 0.5);
  assert.equal(edge, null);
});

test('query: filtre par type, label et poids minimum', () => {
  const g = new KnowledgeGraph(tempGraphPath());
  g.addNode('entity', 'Alice', {}, 0.9);
  g.addNode('entity', 'Bob', {}, 0.2);
  g.addNode('concept', 'Alice-concept', {}, 0.9);

  const byType = g.query({ type: 'entity' });
  assert.equal(byType.length, 2);

  const byLabel = g.query({ labelContains: 'alice' });
  assert.equal(byLabel.length, 2); // Alice (entity) + Alice-concept

  const byWeight = g.query({ type: 'entity', minWeight: 0.5 });
  assert.equal(byWeight.length, 1);
  assert.equal(byWeight[0].label, 'Alice');
});

test('save puis load: restitue les noeuds et aretes', () => {
  const path = tempGraphPath();
  const g1 = new KnowledgeGraph(path);
  const a = g1.addNode('entity', 'Persisted', { x: 1 }, 0.6);
  const b = g1.addNode('entity', 'Other', {}, 0.4);
  g1.addEdge(a.id, b.id, 'connu', 0.5);
  g1.save();

  const g2 = new KnowledgeGraph(path);
  g2.load();
  const stats = g2.stats();
  assert.equal(stats.nodes, 2);
  assert.equal(stats.edges, 1);
  const reloaded = g2.findByTypeAndLabel('entity', 'Persisted');
  assert.ok(reloaded);
  assert.equal(reloaded!.properties.x, 1);

  rmSync(join(path, '..'), { recursive: true, force: true });
});

test('upsertNode: ne cree pas de doublon pour le meme type+label', () => {
  const g = new KnowledgeGraph(tempGraphPath());
  const first = g.upsertNode('entity', 'Unique', { a: 1 }, 0.5);
  const second = g.upsertNode('entity', 'Unique', { b: 2 }, 0.8);
  assert.equal(first.id, second.id);
  assert.equal(g.query({ type: 'entity' }).length, 1);
  assert.equal(second.properties.a, 1);
  assert.equal(second.properties.b, 2);
  assert.equal(second.weight, 0.8);
});
