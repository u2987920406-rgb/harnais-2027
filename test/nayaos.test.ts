import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NayaOSBridge } from '../src/bridge/nayaos.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';

// Ces tests n'exigent PAS que NayaOS tourne. On pointe vers un port mort
// pour verifier le comportement de repli (fail-safe) du pont.
function deadBridge(graph: KnowledgeGraph): NayaOSBridge {
  return new NayaOSBridge(graph, { baseUrl: 'http://127.0.0.1:59999', timeout: 1000 });
}

test('ping: service injoignable -> false (pas de crash)', async () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  assert.equal(await b.ping(), false);
});

test('listProjects: injoignable -> tableau vide', async () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  const projects = await b.listProjects();
  assert.ok(Array.isArray(projects));
  assert.equal(projects.length, 0);
});

test('listAgents: injoignable -> tableau vide', async () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  const agents = await b.listAgents();
  assert.ok(Array.isArray(agents));
  assert.equal(agents.length, 0);
});

test('sendChat: injoignable -> resultat d erreur enregistre dans le graphe', async () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  const res = await b.sendChat('salut nayaos', 'demo');
  assert.match(res, /error/i);
  // un episode nayaos-command doit exister
  assert.ok(g.query({ labelContains: 'NayaOS chat' }).length >= 1);
});

test('getEnrichedContext: injoignable -> chaine vide (pas de projets/agents)', async () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  const ctx = await b.getEnrichedContext();
  assert.equal(ctx, '');
});

test('getConfig: expose la baseUrl configuree', () => {
  const g = new KnowledgeGraph();
  const b = deadBridge(g);
  assert.equal(b.getConfig().baseUrl, 'http://127.0.0.1:59999');
});
