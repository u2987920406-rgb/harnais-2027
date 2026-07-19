import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MCPBridge } from '../src/tools/mcp.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER = join(__dirname, 'fixtures', 'mock-mcp-server.js');

test('MCPBridge: connect + listTools voit les outils du serveur', async () => {
  const bridge = new MCPBridge({ command: 'node', args: [SERVER], name: 'mock' });
  await bridge.connect();
  try {
    const tools = await bridge.listTools();
    assert.equal(tools.length, 2, 'ping + add');
    assert.ok(tools.some((t) => t.name === 'ping'));
    assert.ok(tools.some((t) => t.name === 'add'));
  } finally {
    bridge.disconnect();
  }
});

test('MCPBridge: callTool add(2,3) => 5', async () => {
  const bridge = new MCPBridge({ command: 'node', args: [SERVER], name: 'mock' });
  await bridge.connect();
  try {
    const r = await bridge.callTool('add', { a: 2, b: 3 });
    const text = (r?.content ?? []).map((c) => c.text ?? '').join('');
    assert.equal(text, '5');
  } finally {
    bridge.disconnect();
  }
});

test('MCPBridge: toTools expose des Tool cortex préfixés et exécutables', async () => {
  const bridge = new MCPBridge({ command: 'node', args: [SERVER], name: 'mock' });
  await bridge.connect();
  try {
    const tools = await bridge.toTools();
    assert.equal(tools.length, 2);
    const ping = tools.find((t) => t.name === 'mcp_mock_ping')!;
    assert.ok(ping, 'outil préfixé présent');
    const res = await ping.execute({ msg: 'hi' });
    assert.equal(res.success, true);
    assert.match(res.output, /pong:hi/);
  } finally {
    bridge.disconnect();
  }
});
