/**
 * MCPBridge — Client MCP (Model Context Protocol) minimal, transport stdio,
 * JSON-RPC 2.0 newline-delimited. 0 dépendance npm (child_process + readline).
 *
 * Consomme un serveur MCP externe et expose ses outils dans le ToolRegistry
 * du cortex — exactement comme Hermes charge des serveurs MCP. Le cortex peut
 * ainsi s'étendre à n'importe quel outil MCP (NayaOS, NayaQA, filesystem
 * distants, navigateur, etc.) SANS coder de pont HTTP spécifique.
 *
 * Protocole implémenté (sous-ensemble): initialize, notifications/initialized,
 * tools/list, tools/call.
 */

import { spawn, type ChildProcess } from 'child_process';
import { createInterface, type Interface } from 'readline';
import type { Tool, RiskLevel } from './registry.js';

export interface MCPConfig {
  command: string;                 // ex: 'node', 'npx', 'python'
  args?: string[];
  name?: string;                   // nom logique (préfixe des outils)
  env?: Record<string, string>;    // variables d'env additionnelles
}

interface JsonRpcReq {
  jsonrpc: '2.0';
  id?: number;
  method: string;
  params?: any;
}

interface JsonRpcResp {
  jsonrpc: '2.0';
  id?: number;
  result?: any;
  error?: { code: number; message: string };
}

interface PendingPromise {
  resolve: (v: any) => void;
  reject: (e: any) => void;
}

export class MCPBridge {
  private config: MCPConfig;
  private name: string;
  private child: ChildProcess | null = null;
  private rl: Interface | null = null;
  private reqId = 0;
  private pending = new Map<number, PendingPromise>();
  private connected = false;
  private onError: ((e: Error) => void) | null = null;

  constructor(config: MCPConfig) {
    this.config = config;
    this.name = config.name ?? 'mcp';
  }

  /** Démarre le serveur et effectue la poignée de main MCP. */
  async connect(): Promise<void> {
    if (this.connected) return;

    this.child = spawn(this.config.command, this.config.args ?? [], {
      env: { ...process.env, ...(this.config.env ?? {}) },
      stdio: ['pipe', 'pipe', 'inherit'],
    });

    this.child.on('error', (err) => {
      this.failAll(err);
      if (this.onError) this.onError(err);
    });

    this.rl = createInterface({ input: this.child.stdout! });
    this.rl.on('line', (line) => this.handleLine(line));

    // 1) initialize
    await this.request('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'harnais-cortex', version: '0.1.0' },
    });

    // 2) notification initialized (pas de réponse attendue)
    this.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

    this.connected = true;
  }

  /** Liste les outils déclarés par le serveur. */
  async listTools(): Promise<any[]> {
    const res = await this.request('tools/list', {});
    return res.tools ?? [];
  }

  /** Appelle un outil MCP et renvoie le résultat brut. */
  async callTool(name: string, args: Record<string, any>): Promise<any> {
    if (!this.connected) throw new Error('MCPBridge non connecté — appelle connect() d\'abord');
    return this.request('tools/call', { name, arguments: args });
  }

  /**
   * Convertit les outils MCP en outils cortex (ToolRegistry).
   * Le nom est préfixé pour éviter les collisions: `mcp_<serveur>_<outil>`.
   */
  async toTools(): Promise<Tool[]> {
    const mcpTools = await this.listTools();
    return mcpTools.map((t) => ({
      name: `mcp_${this.name}_${t.name}`,
      description: `[MCP ${this.name}] ${t.description ?? t.name}`,
      risk: 'moderate' as RiskLevel,
      parameters: schemaToParams(t.inputSchema),
      execute: async (params: Record<string, any>) => {
        try {
          const r = await this.callTool(t.name, params);
          const text = (r?.content ?? [])
            .map((c: any) => (typeof c === 'string' ? c : c.text ?? ''))
            .join('\n');
          return { success: !r?.isError, output: text, durationMs: 0 };
        } catch (err: any) {
          return { success: false, output: '', error: err.message, durationMs: 0 };
        }
      },
    }));
  }

  /** Ferme la connexion (tue le processus serveur). */
  disconnect(): void {
    if (this.rl) { this.rl.close(); this.rl = null; }
    if (this.child) { this.child.kill(); this.child = null; }
    this.connected = false;
  }

  // --- JSON-RPC 2.0 (stdio, newline-delimited) ---

  private send(msg: JsonRpcReq): void {
    if (!this.child) throw new Error('MCPBridge: processus non démarré');
    this.child.stdin!.write(JSON.stringify(msg) + '\n');
  }

  private request(method: string, params: any): Promise<any> {
    const id = ++this.reqId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: '2.0', id, method, params });
    });
  }

  private handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcResp;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return; // ligne non-JSON (log serveur sur stdout ?) — ignorée
    }
    // Notification (pas d'id) : ignorée (ex: notifications/progress)
    if (msg.id === undefined) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(`MCP ${msg.error.code}: ${msg.error.message}`));
    else entry.resolve(msg.result);
  }

  private failAll(err: Error): void {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }
}

/** Convertit un JSON Schema (sous-ensemble) en ToolParameter[]. */
function schemaToParams(schema: any): Tool['parameters'] {
  const props = schema?.properties ?? {};
  const required: string[] = schema?.required ?? [];
  const out: Tool['parameters'] = [];
  for (const [key, val] of Object.entries<any>(props)) {
    const type = val?.type;
    if (type !== 'string' && type !== 'number' && type !== 'boolean') continue;
    out.push({
      name: key,
      type,
      description: val?.description ?? key,
      required: required.includes(key),
    });
  }
  return out;
}
