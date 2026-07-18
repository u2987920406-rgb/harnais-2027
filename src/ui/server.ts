/**
 * UIServer — Serveur HTTP natif (0 dependance npm) pour piloter Atlas depuis une UI web.
 *
 * C'est la couche presentation: expose le Cortex via HTTP/JSON + SSE.
 * Le Cortex reste le proprietaire de la cognition; le serveur ne fait que
 * traduire les requetes HTTP en appels Cortex et renvoyer du JSON.
 *
 * Routes:
 *   GET  /                 -> sert public/index.html
 *   GET  /api/state        -> etat du cortex
 *   POST /api/inject       -> message utilisateur -> reponse cortex
 *   POST /api/stream       -> SSE, apercu live (hy3)
 *   GET  /api/graph        -> stats graphe
 *   GET  /api/skills       -> liste skills
 *   POST /api/skills       -> cree une skill
 *   POST /api/skills/:n/apply -> applique une skill
 *
 * Lance: npm run ui
 */

import { createServer, type Server } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { Cortex } from '../core/cortex.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { ModelBridge } from '../models/bridge.js';
import { pushToWorkingMemory } from '../core/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function sendJson(res: any, code: number, data: unknown): void {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (c: any) => { data += c; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

export class UIServer {
  private cortex: Cortex;
  private bridge: ModelBridge;
  private port: number;
  private host: string;
  private server?: Server;

  constructor(cortex: Cortex, opts: { port?: number; host?: string } = {}) {
    this.cortex = cortex;
    // Bridge local pour le stream (hy3 general). Reutilise le bridge du cortex
    // si expose; sinon en cree un leger. Le cortex possede deja le sien.
    this.bridge = (cortex as any).bridge ?? new ModelBridge({
      generalModel: 'tencent/hy3:free', consolidationModel: 'tencent/hy3:free',
      reasoningModel: 'qwythos-tools:q6', metaModel: 'qwythos-tools:q6',
      critiqueModel: 'qwythos-tools:q6', allowCloud: true,
    });
    this.port = opts.port ?? 7891;
    this.host = opts.host ?? '127.0.0.1';
  }

  get url(): string { return `http://${this.host}:${this.port}`; }

  /** Demarre le serveur (le Cortex doit deja etre init()). */
  start(): void {
    this.server = createServer(async (req: any, res: any) => {
      const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
      const path = url.pathname;
      try {
        // --- Skills: lister ---
        if (path === '/api/skills' && req.method === 'GET') {
          return sendJson(res, 200, this.cortex.skills.list().map(s => ({
            name: s.name, description: s.description, tags: s.tags ?? [], mode: s.mode ?? 'soft', body: s.body.slice(0, 400),
          })));
        }
        // --- Skills: creer ---
        if (path === '/api/skills' && req.method === 'POST') {
          const raw = await readBody(req);
          let body: any = {};
          try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'JSON invalide' }); }
          const { name, description, content, tags, mode } = body;
          if (!name || !description || !content) return sendJson(res, 400, { error: 'champs name/description/content requis' });
          const safeMode = mode === 'strict' ? 'strict' : 'soft';
          try {
            const filePath = this.cortex.skills.addSkill(name, description, content, Array.isArray(tags) ? tags : [], safeMode);
            const count = this.cortex.skills.reload();
            return sendJson(res, 201, { ok: true, file: filePath, mode: safeMode, totalSkills: count });
          } catch (e: any) { return sendJson(res, 500, { error: e?.message ?? 'echec creation skill' }); }
        }
        // --- Skills: appliquer ---
        if (path.startsWith('/api/skills/') && path.endsWith('/apply') && req.method === 'POST') {
          const name = decodeURIComponent(path.split('/')[3]);
          const skill = this.cortex.skills.get(name);
          if (!skill) return sendJson(res, 404, { error: 'skill inconnue' });
          pushToWorkingMemory(this.cortex.state, `SKILL APPLIQUEE: ${skill.name}\n${skill.body}`, 'action', 1.0);
          return sendJson(res, 200, { ok: true, applied: skill.name, description: skill.description });
        }
        // --- Etat ---
        if (path === '/api/state' && req.method === 'GET') {
          const s = this.cortex.state;
          return sendJson(res, 200, {
            cycles: s.cycles, mode: this.cortex.mode,
            userTone: s.userTone, userEngagement: s.userEngagement,
            workingMemorySize: s.workingMemory.length,
            activeHypotheses: s.activeHypotheses.length,
            backgroundThreads: s.backgroundThreads.length,
            budgetSpent: s.budgetSpent, lastInteraction: s.lastInteraction,
            workingMemory: s.workingMemory.slice(-10).map(w => ({ type: w.type, content: w.content.slice(0, 200) })),
            graph: this.cortex.graph.stats(),
          });
        }
        // --- Inject ---
        if (path === '/api/inject' && req.method === 'POST') {
          const raw = await readBody(req);
          let message = '';
          try { message = JSON.parse(raw).message ?? ''; } catch { message = raw; }
          if (!message.trim()) return sendJson(res, 400, { error: 'message vide' });
          const INJECT_TIMEOUT_MS = 180_000;
          const timeout = new Promise<string>((_, reject) =>
            setTimeout(() => reject(new Error('delai modele depasse')), INJECT_TIMEOUT_MS));
          try {
            const response = await Promise.race([this.cortex.inject(message), timeout]);
            return sendJson(res, 200, { response, state: { cycles: this.cortex.state.cycles } });
          } catch (e: any) { return sendJson(res, 503, { error: e?.message ?? 'echec inject' }); }
        }
        // --- Stream SSE ---
        if (path === '/api/stream' && req.method === 'POST') {
          const raw = await readBody(req);
          let message = '';
          try { message = JSON.parse(raw).message ?? ''; } catch { message = raw; }
          if (!message.trim()) return sendJson(res, 400, { error: 'message vide' });
          res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
          res.write(`event: meta\ndata: ${JSON.stringify({ mode: this.cortex.mode, model: 'hy3:free' })}\n\n`);
          const ctx = this.cortex.graph.toContext(10);
          const prompt = `[Contexte graphe]\n${ctx}\n\n[Message utilisateur]\n${message}\n\nReponds en francais.`;
          try {
            for await (const token of this.bridge.thinkStream(prompt, 'general')) {
              res.write(`data: ${JSON.stringify(token)}\n\n`);
            }
            res.write('event: done\ndata: {}\n\n');
          } catch (e: any) {
            res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message ?? 'echec stream' })}\n\n`);
          }
          return res.end();
        }
        // --- Graphe ---
        if (path === '/api/graph' && req.method === 'GET') {
          return sendJson(res, 200, this.cortex.graph.stats());
        }
        // --- Static UI ---
        if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
          const filePath = join(PUBLIC_DIR, 'index.html');
          if (!existsSync(filePath)) return sendJson(res, 404, { error: 'UI non trouvee' });
          res.writeHead(200, { 'Content-Type': MIME['.html'] });
          return res.end(readFileSync(filePath));
        }
        if (req.method === 'GET' && path.startsWith('/public/')) {
          const filePath = join(PUBLIC_DIR, path.replace('/public/', ''));
          if (!existsSync(filePath)) { res.writeHead(404); return res.end('404'); }
          res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] ?? 'application/octet-stream' });
          return res.end(readFileSync(filePath));
        }
        res.writeHead(404); res.end('404');
      } catch (err: any) {
        sendJson(res, 500, { error: err?.message ?? 'erreur serveur' });
      }
    });

    this.server.listen(this.port, () => {
      console.log(`[UI] Atlas sur http://localhost:${this.port} | hy3:free (général) + qwythos (raisonnement)`);
    });
  }

  stop(): void { this.server?.close(); }
}
