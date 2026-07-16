import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, type Tool } from '../src/tools/registry.js';

function fakeTool(name: string, required = true): Tool {
  return {
    name,
    description: `outil ${name}`,
    risk: 'safe',
    parameters: [{ name: 'x', type: 'string', description: 'param x', required }],
    execute: async (p) => ({ success: true, output: `ok:${p.x}`, durationMs: 0 }),
  };
}

test('register + get + list', () => {
  const reg = new ToolRegistry();
  reg.register(fakeTool('t1'));
  assert.ok(reg.get('t1'));
  assert.equal(reg.list().length, 1);
  assert.equal(reg.get('inexistant'), undefined);
});

test('execute: outil inconnu -> echec structure', async () => {
  const reg = new ToolRegistry();
  const r = await reg.execute('nope', {});
  assert.equal(r.success, false);
  assert.match(r.error ?? '', /inconnu/);
});

test('execute: parametre requis manquant -> echec', async () => {
  const reg = new ToolRegistry();
  reg.register(fakeTool('t1', true));
  const r = await reg.execute('t1', {});
  assert.equal(r.success, false);
  assert.match(r.error ?? '', /requis manquant/);
});

test('execute: applique la valeur par defaut', async () => {
  const reg = new ToolRegistry();
  const tool: Tool = {
    name: 'withDefault', description: 'd', risk: 'safe',
    parameters: [{ name: 'x', type: 'string', description: 'x', required: false, default: 'defaut' }],
    execute: async (p) => ({ success: true, output: String(p.x), durationMs: 0 }),
  };
  reg.register(tool);
  const r = await reg.execute('withDefault', {});
  assert.equal(r.output, 'defaut');
});

test('execute: succes passe les params', async () => {
  const reg = new ToolRegistry();
  reg.register(fakeTool('t1'));
  const r = await reg.execute('t1', { x: 'hello' });
  assert.equal(r.success, true);
  assert.equal(r.output, 'ok:hello');
});

test('toPrompt: liste les outils avec risque et params', () => {
  const reg = new ToolRegistry();
  reg.register(fakeTool('t1'));
  const p = reg.toPrompt();
  assert.match(p, /\[safe\] t1/);
  assert.match(p, /x: string/);
});

test('toPrompt: vide -> message explicite', () => {
  const reg = new ToolRegistry();
  assert.match(reg.toPrompt(), /Aucun outil/);
});
