/**
 * UI Server — Dashboard web pour le Cortex Harnais 2027.
 *
 * Serveur HTTP + WebSocket en Node.js natif (0 dépendance npm).
 * Sert un dashboard HTML/CSS/JS qui visualise en temps réel:
 * - L'état du cortex (mode, cycle, focus, budget)
 * - Le graphe de connaissance (canvas, force-directed)
 * - Les threads de pensée (arrière-plan)
 * - Les hypothèses actives
 * - La mémoire de travail
 * - Un chat panel pour interagir avec le cortex
 *
 * Usage:
 *   Le cortex démarre le serveur si config.ui.enabled = true
 *   Ou manuellement: import { UIServer } from './ui/server.js'
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from 'http';
import type { Socket } from 'net';
import { createHash } from 'crypto';
import { Cortex } from '../core/cortex.js';
import { stateToSummary } from '../core/state.js';
import { DASHBOARD_HTML } from './dashboard-html.js';

export interface UIServerConfig {
  port: number;
  host: string;
}

const DEFAULT_CONFIG: UIServerConfig = {
  port: 7891,
  host: '127.0.0.1',
};

export class UIServer {
  private cortex: Cortex;
  private config: UIServerConfig;
  private server: Server;
  private wsClients = new Set<{ socket: Socket; send: (data: any) => void }>();
  private running = false;
  private pushInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cortex: Cortex, config: Partial<UIServerConfig> = {}) {
    this.cortex = cortex;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.server = createServer(this.handleHTTP.bind(this));
  }

  /**
   * Démarre le serveur HTTP + WebSocket.
   */
  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.server.listen(this.config.port, this.config.host, () => {
        console.log(`[UI] Dashboard: http://${this.config.host}:${this.config.port}`);
        this.running = true;
        this.startPushLoop();
        resolve();
      });

      // Upgrade handler pour WebSocket
      this.server.on('upgrade', (req: IncomingMessage, socket: any, head: Buffer) => {
        this.handleUpgrade(req, socket, head);
      });
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.pushInterval) clearInterval(this.pushInterval);
    this.wsClients.clear();
    return new Promise((resolve) => {
      this.server.close(() => resolve());
    });
  }

  // --- HTTP ---

  private handleHTTP(req: IncomingMessage, res: ServerResponse): void {
    const url = req.url ?? '/';

    // CORS permissif (local only)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    // Routes API
    if (url === '/api/state') {
      this.sendJSON(res, this.getStateSnapshot());
      return;
    }

    if (url === '/api/graph') {
      this.sendJSON(res, this.getGraphSnapshot());
      return;
    }

    if (url === '/api/skills') {
      const skills = this.cortex.skills.list();
      this.sendJSON(res, skills);
      return;
    }

    if (url === '/api/introspect') {
      this.cortex.introspect().then(summary => {
        this.sendJSON(res, { summary });
      });
      return;
    }

    if (url === '/api/tools') {
      this.sendJSON(res, { tools: (this.cortex as any).tools?.list() ?? [] });
      return;
    }

    // Chat endpoint (POST)
    if (url === '/api/chat' && req.method === 'POST') {
      this.handleChat(req, res);
      return;
    }

    // Dashboard HTML (accepte query string pour bypass cache navigateur)
    if (url === '/' || url === '/index.html' || url.startsWith('/?')) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      });
      res.end(DASHBOARD_HTML);
      return;
    }

    res.writeHead(404);
    res.end('Not found');
  }

  private handleChat(req: IncomingMessage, res: ServerResponse): void {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', async () => {
      try {
        const { message } = JSON.parse(body);
        if (!message || typeof message !== 'string') {
          this.sendJSON(res, { error: 'message requis' }, 400);
          return;
        }
        // Injecte dans le cortex
        const response = await this.cortex.inject(message);
        this.sendJSON(res, { response });
        // Notifie les WS clients
        this.broadcast({ type: 'chat', user: message, cortex: response });
      } catch (err: any) {
        this.sendJSON(res, { error: err.message }, 500);
      }
    });
  }

  // --- WebSocket ---

  private handleUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): void {
    const key = req.headers['sec-websocket-key'] as string;
    if (!key) {
      socket.destroy();
      return;
    }

    // Handshake WebSocket RFC 6455
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(
      `HTTP/1.1 101 Switching Protocols\r\n` +
      `Upgrade: websocket\r\n` +
      `Connection: Upgrade\r\n` +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );

    // Wrapper minimal pour le client WS
    const client = this.createWSClient(socket);
    this.wsClients.add(client);

    socket.on('close', () => {
      this.wsClients.delete(client);
    });

    socket.on('data', (data: Buffer) => {
      // Parse incoming WS frame (text only, masqué par le client)
      this.handleWSMessage(client, data);
    });

    // Envoie l'état initial immediatement
    client.send(this.getStateSnapshot());
    client.send(this.getGraphSnapshot());
  }

  private createWSClient(socket: import('net').Socket): any {
    return {
      socket,
      send: (data: any) => {
        if (socket.writable) {
          const payload = typeof data === 'string' ? data : JSON.stringify(data);
          this.sendWSFrame(socket, payload);
        }
      },
    };
  }

  private sendWSFrame(socket: import('net').Socket, payload: string): void {
    const payloadBytes = Buffer.from(payload, 'utf-8');
    const mask = false; // serveur -> client: pas de masque

    let header: Buffer;
    if (payloadBytes.length < 126) {
      header = Buffer.alloc(2);
      header[0] = 0x81; // FIN + text frame
      header[1] = mask ? 0x80 | payloadBytes.length : payloadBytes.length;
    } else if (payloadBytes.length < 65536) {
      header = Buffer.alloc(4);
      header[0] = 0x81;
      header[1] = mask ? 0x80 | 126 : 126;
      header.writeUInt16BE(payloadBytes.length, 2);
    } else {
      header = Buffer.alloc(10);
      header[0] = 0x81;
      header[1] = mask ? 0x80 | 127 : 127;
      header.writeBigUInt64BE(BigInt(payloadBytes.length), 2);
    }

    socket.write(Buffer.concat([header, payloadBytes]));
  }

  private handleWSMessage(client: any, data: Buffer): void {
    // Decode minimal: on lit juste les text frames du client
    // Format: [FIN/opcode][MASK/len][mask key][payload]
    if (data.length < 6) return;
    const opcode = data[0] & 0x0f;
    if (opcode === 0x8) { // close
      this.wsClients.delete(client);
      return;
    }
    if (opcode !== 0x1) return; // text only

    const masked = (data[1] & 0x80) !== 0;
    let payloadLen = data[1] & 0x7f;
    let offset = 2;
    if (payloadLen === 126) {
      payloadLen = data.readUInt16BE(2);
      offset = 4;
    } else if (payloadLen === 127) {
      offset = 10;
    }

    if (masked) {
      const maskKey = data.subarray(offset, offset + 4);
      offset += 4;
      const payload = data.subarray(offset, offset + payloadLen);
      const decoded = Buffer.alloc(payload.length);
      for (let i = 0; i < payload.length; i++) {
        decoded[i] = payload[i] ^ maskKey[i % 4];
      }
      try {
        const msg = JSON.parse(decoded.toString('utf-8'));
        if (msg.type === 'ping') {
          client.send({ type: 'pong' });
        }
      } catch { /* ignore */ }
    }
  }

  // --- Push loop: broadcast state every 2s ---

  private startPushLoop(): void {
    this.pushInterval = setInterval(() => {
      if (this.wsClients.size === 0) return;
      // getStateSnapshot / getGraphSnapshot retournent DEJA {type, data}
      // pas de double-emballege
      this.broadcast(this.getStateSnapshot());
      this.broadcast(this.getGraphSnapshot());
    }, 2000);
  }

  private broadcast(msg: any): void {
    for (const client of Array.from(this.wsClients)) {
      client.send(msg);
    }
  }

  // --- Snapshots ---

  private getStateSnapshot(): any {
    const state = this.cortex.state;
    return {
      type: 'state',
      data: {
        mode: this.cortex.mode,
        cycles: state.cycles,
        focus: state.currentFocus,
        focusIntensity: state.focusIntensity,
        activeHypotheses: state.activeHypotheses,
        pendingQuestions: state.pendingQuestions,
        workingMemory: state.workingMemory.slice(-20),
        backgroundThreads: state.backgroundThreads,
        userTone: state.userTone,
        userEngagement: state.userEngagement,
        budgetSpent: state.budgetSpent,
        cognitiveBudget: state.cognitiveBudget,
        selfModifications: state.selfModifications,
        lastInteraction: state.lastInteraction,
        lastThought: state.lastThought,
        summary: stateToSummary(state),
      },
    };
  }

  private getGraphSnapshot(): any {
    const graph = this.cortex.graph;
    const stats = graph.stats();
    const snap = {
      type: 'graph',
      data: {
        stats,
        nodes: graph.allNodes().map((n: any) => ({ id: n.id, type: n.type, label: n.label, weight: n.weight, accessCount: n.accessCount })),
        edges: graph.allEdges().map((e: any) => ({ id: e.id, from: e.from, to: e.to, type: e.type, weight: e.weight })),
      },
    };
    return snap;
  }

  // --- Helpers ---

  private sendJSON(res: ServerResponse, data: any, status = 200): void {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(data));
  }

  get url(): string {
    return `http://${this.config.host}:${this.config.port}`;
  }
}