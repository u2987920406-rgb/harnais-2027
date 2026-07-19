import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Spawner } from '../src/cognition/spawner.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { ToolRegistry, type Tool } from '../src/tools/registry.js';
import { makeMockBridge } from './_mock.js';
import type { SpawnConfig } from '../src/cognition/spawner.js';

function fakeTool(name: string): Tool {
  return {
    name,
    description: `outil ${name}`,
    risk: 'safe',
    parameters: [{ name: 'x', type: 'string', description: 'x', required: false }],
    execute: async () => ({ success: true, output: 'ok', durationMs: 0 }),
  };
}

function cfg(role: string, task: string): SpawnConfig {
  return { role, task, mode: 'general', systemPrompt: 'sys', taskPrompt: task };
}

test('scoped: le spawn ne voit que les outils autorisés', async () => {
  const bridge = makeMockBridge(() => 'resultat');
  const reg = new ToolRegistry();
  reg.register(fakeTool('web'));
  reg.register(fakeTool('filesystem'));
  reg.register(fakeTool('terminal')); // dangereux, a exclure

  const spawner = new Spawner(bridge, new KnowledgeGraph());
  spawner.setTools(reg);

  await spawner.spawn({ ...cfg('recherche', 'cherche X'), tools: ['web', 'filesystem'] });

  const system = bridge.calls[0].options.system as string;
  assert.match(system, /web/);
  assert.match(system, /filesystem/);
  assert.ok(!system.includes('terminal'), 'terminal doit être exclu du scope');
});

test('scoped: scope par défaut via setToolScope si config.tools absent', async () => {
  const bridge = makeMockBridge(() => 'ok');
  const reg = new ToolRegistry();
  reg.register(fakeTool('web'));
  reg.register(fakeTool('terminal'));

  const spawner = new Spawner(bridge, new KnowledgeGraph());
  spawner.setTools(reg);
  spawner.setToolScope(['web']); // défaut = web uniquement

  await spawner.spawn(cfg('agent', 'fais'));

  const system = bridge.calls[0].options.system as string;
  assert.match(system, /web/);
  assert.ok(!system.includes('terminal'), 'scope par défaut appliqué');
});

test('ToolRegistry.scoped: filtre correctement', () => {
  const reg = new ToolRegistry();
  reg.register(fakeTool('a'));
  reg.register(fakeTool('b'));
  reg.register(fakeTool('c'));
  const sub = reg.scoped(['a', 'c']);
  assert.deepEqual(sub.list().map(t => t.name).sort(), ['a', 'c']);
});
