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
 *   POST /api/mode         -> change le mode de gouvernance (auto/plan/permission/edit)
 *   GET  /api/pending      -> demandes d'approbation en attente (mode permission/edit)
 *   POST /api/approve/:id  -> valide/refuse une demande d'approbation
 *
 * Lance: npm run ui
 */

import { createServer, type Server } from 'http';
import { readFileSync, existsSync } from 'fs';
import { dirname, join, extname } from 'path';
import { fileURLToPath } from 'url';
import { Cortex, type ApprovalChannel } from '../core/cortex.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { ModelBridge } from '../models/bridge.js';
import { pushToWorkingMemory } from '../core/state.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', '..', 'public');

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

/**
 * Canal d'approbation pour l'UI (et Telegram-ready).
 *
 * En mode permission/edit, le Cortex appelle `ask()` pour chaque action
 * sensible. Cette classe cree une Promise par demande et la garde en suspens
 * dans une Map. Quand l'utilisateur valide (via la route /api/approve/:id),
 * on appelle `resolve(id, ok)` qui debloque la Promise du Cortex.
 *
 * La liste `pendingForUI()` est consommee par GET /api/pending pour afficher
 * les demandes dans le dashboard — et pourra etre reutilisee telle quelle par
 * un futur canal Telegram (meme contrat: ask/resolve).
 */
export class UIApprovalChannel implements ApprovalChannel {
  /** Demande en attente: id -> resolve + metadonnees. */
  private pending = new Map<string, { tool: string; reason: string; resolve: (ok: boolean) => void }>();
  private seq = 0;

  /** Appele par le Cortex (mode permission/edit). Suspend le Cortex jusqu'a resolve(). */
  ask(_tool: string, _params: Record<string, any>, _reason: string): Promise<boolean> {
    const id = `ui${++this.seq}`;
    return new Promise<boolean>((resolve) => {
      this.pending.set(id, { tool: _tool, reason: _reason, resolve });
    });
  }

  /** Debloque une demande (clic UI ou message Telegram). */
  resolve(id: string, ok: boolean): void {
    const entry = this.pending.get(id);
    if (entry) {
      this.pending.delete(id);
      entry.resolve(ok);
    }
  }

  /** Liste les demandes en attente pour affichage UI (id + outil + raison). */
  pendingForUI(): { id: string; tool: string; reason: string }[] {
    return Array.from(this.pending.entries()).map(([id, a]) => ({
      id, tool: a.tool, reason: a.reason,
    }));
  }
}

export class UIServer {
  private cortex: Cortex;
  private bridge: ModelBridge;
  private port: number;
  private host: string;
  private server?: Server;
  /** Canal d'approbation UI (Telegram-ready) branche sur le Cortex. */
  private uiChannel: UIApprovalChannel;

  constructor(cortex: Cortex, opts: { port?: number; host?: string } = {}) {
    this.cortex = cortex;
    // Canal d'approbation: branche un UIApprovalChannel sur le Cortex pour que
    // les actions sensibles (mode permission/edit) attendent la validation UI.
    this.uiChannel = new UIApprovalChannel();
    this.cortex.approvalChannel = this.uiChannel;
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
            // BUG FIX : on passe par cortex.inject() (boucle tool-calling +
            // gouvernance + verification), PAS thinkStream direct — sinon les
            // outils (browser_navigate etc.) ne sont jamais declenches.
            const response = await this.cortex.inject(message);
            // Stream progressif : on decoupe la reponse finale en tokens
            // (approx par mots) pour l'effet d'ecriture en temps reel.
            const tokens = response.match(/\S+\s*/g) ?? [response];
            for (const t of tokens) {
              res.write(`data: ${JSON.stringify(t)}\n\n`);
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
        // --- Mode de gouvernance: change a chaud ---
        if (path === '/api/mode' && req.method === 'POST') {
          const raw = await readBody(req);
          let body: any = {};
          try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'JSON invalide' }); }
          const mode = body.mode;
          const validModes = ['auto', 'plan', 'permission', 'edit'];
          if (!validModes.includes(mode)) return sendJson(res, 400, { error: 'mode invalide (auto/plan/permission/edit)' });
          this.cortex.setGovernanceMode(mode, body.sandbox, body.allowDangerous);
          return sendJson(res, 200, { ok: true, mode: this.cortex.governanceMode });
        }
        // --- Approbations en attente (mode permission/edit) ---
        if (path === '/api/pending' && req.method === 'GET') {
          return sendJson(res, 200, this.uiChannel.pendingForUI());
        }
        // --- Resoudre une approbation (valider/refuser) ---
        if (path.startsWith('/api/approve/') && req.method === 'POST') {
          const id = decodeURIComponent(path.replace('/api/approve/', ''));
          const raw = await readBody(req);
          let ok = true;
          try { ok = Boolean(JSON.parse(raw).ok); } catch { /* defaut: true */ }
          this.uiChannel.resolve(id, ok);
          return sendJson(res, 200, { ok: true });
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
