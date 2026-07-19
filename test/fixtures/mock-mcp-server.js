/**
 * Mock MCP server (stdio, JSON-RPC 2.0) pour les tests du MCPBridge.
 * Expose DEUX outils : `ping` (echo) et `add` (somme). Démarrable via
 * `node test/fixtures/mock-mcp-server.js`. Répond initialize / tools/list
 * / tools/call et ignore notifications/initialized.
 */
import { createInterface } from 'readline';

const rl = createInterface({ input: process.stdin });

function respond(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let msg;
  try { msg = JSON.parse(trimmed); } catch { return; }

  if (msg.id === undefined) return; // notification: pas de réponse

  if (msg.method === 'initialize') {
    respond({
      jsonrpc: '2.0', id: msg.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'mock-mcp', version: '0.0.1' },
      },
    });
  } else if (msg.method === 'tools/list') {
    respond({
      jsonrpc: '2.0', id: msg.id,
      result: {
        tools: [
          {
            name: 'ping', description: 'renvoie echo',
            inputSchema: { type: 'object', properties: { msg: { type: 'string' } }, required: ['msg'] },
          },
          {
            name: 'add', description: 'somme a+b',
            inputSchema: { type: 'object', properties: { a: { type: 'number' }, b: { type: 'number' } }, required: ['a', 'b'] },
          },
        ],
      },
    });
  } else if (msg.method === 'tools/call') {
    const name = msg.params ? msg.params.name : undefined;
    const args = msg.params ? msg.params.arguments : undefined;
    let content = '';
    if (name === 'ping') content = 'pong:' + (args ? args.msg : '');
    else if (name === 'add') content = String((args ? args.a : 0) + (args ? args.b : 0));
    respond({
      jsonrpc: '2.0', id: msg.id,
      result: { content: [{ type: 'text', text: content }] },
    });
  } else {
    respond({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'method not found' } });
  }
});

process.stdin.on('end', () => process.exit(0));
