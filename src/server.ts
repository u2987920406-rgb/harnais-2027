/**
 * Serveur UI souverain pour Harnais 2027 (Atlas).
 *
 * 0 dependance npm: utilise uniquement le module http natif de Node.
 * Le but: exposer le Cortex via HTTP pour qu'une UI web (public/) le pilote.
 * Mode souverain par defaut: modeles Ollama LOCAUX, pas de cloud.
 *
 * Routes:
 *   GET  /                 -> sert public/index.html (UI)
 *   GET  /api/state        -> etat du cortex (JSON)
 *   POST /api/inject       -> body { "message": "..." } -> reponse du cortex (JSON)
 *   GET  /api/graph        -> stats du graphe de connaissance (JSON)
 *
 * Lance: npm run ui   (demarre sur http://localhost:8080)
 */

import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, extname } from 'path';
import { Cortex } from './core/cortex.js';
import { KnowledgeGraph } from './memory/knowledge-graph.js';
import { ModelBridge } from './models/bridge.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, '..', 'public');
const PORT = Number(process.env.HARNAIS_UI_PORT ?? 8080);

// --- Instancie le Cortex: hy3:free (Nous, gratuit) en modele general par defaut,
//     qwythos local en fallback pour le raisonnement/meta si le cloud rate-limite. ---
const bridge = new ModelBridge({
  generalModel: 'tencent/hy3:free',
  consolidationModel: 'tencent/hy3:free',
  reasoningModel: 'qwythos-tools:q6', // local, pour le raisonnement profond
  metaModel: 'qwythos-tools:q6',
  critiqueModel: 'qwythos-tools:q6',
  allowCloud: true, // hy3:free passe par Nous Portal (gratuit)
});
const graph = new KnowledgeGraph();
const cortex = new Cortex(bridge, graph, { tickIntervalMs: 999999 });

// Initialise (charge graphe + skills, verifie Ollama). Pas de boucle auto.
await cortex.init();

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
    req.on('data', (chunk: any) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

const server = createServer(async (req: any, res: any) => {
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`);
  const path = url.pathname;

  try {
    // --- API: lister les skills ---
    if (path === '/api/skills' && req.method === 'GET') {
      return sendJson(res, 200, cortex.skills.list().map(s => ({
        name: s.name, description: s.description, tags: s.tags ?? [], mode: s.mode ?? 'soft', body: s.body.slice(0, 400),
      })));
    }

    // --- API: creer une skill (ecrit le .skill.md + recharge le registry) ---
    if (path === '/api/skills' && req.method === 'POST') {
      const raw = await readBody(req);
      let body: any = {};
      try { body = JSON.parse(raw); } catch { return sendJson(res, 400, { error: 'JSON invalide' }); }
      const { name, description, content, tags, mode } = body;
      if (!name || !description || !content) {
        return sendJson(res, 400, { error: 'champs name/description/content requis' });
      }
      const safeMode = mode === 'strict' ? 'strict' : 'soft';
      try {
        const filePath = cortex.skills.addSkill(name, description, content, Array.isArray(tags) ? tags : [], safeMode);
        const count = cortex.skills.reload();
        return sendJson(res, 201, { ok: true, file: filePath, mode: safeMode, totalSkills: count });
      } catch (e: any) {
        return sendJson(res, 500, { error: e?.message ?? 'echec creation skill' });
      }
    }

    // --- API: appliquer une skill (pousse son corps dans le contexte du cortex) ---
    if (path.startsWith('/api/skills/') && path.endsWith('/apply') && req.method === 'POST') {
      const name = decodeURIComponent(path.split('/')[3]);
      const skill = cortex.skills.get(name);
      if (!skill) return sendJson(res, 404, { error: 'skill inconnue' });
      // Pousse le corps de la skill dans la memoire de travail => incluse au prochain inject.
      const { pushToWorkingMemory } = await import('./core/state.js');
      pushToWorkingMemory(cortex.state, `SKILL APPLIQUEE: ${skill.name}\n${skill.body}`, 'action', 1.0);
      return sendJson(res, 200, { ok: true, applied: skill.name, description: skill.description });
    }
    if (path === '/api/state' && req.method === 'GET') {
      const s = cortex.state;
      return sendJson(res, 200, {
        cycles: s.cycles,
        mode: cortex.mode,
        userTone: s.userTone,
        userEngagement: s.userEngagement,
        workingMemorySize: s.workingMemory.length,
        activeHypotheses: s.activeHypotheses.length,
        backgroundThreads: s.backgroundThreads.length,
        budgetSpent: s.budgetSpent,
        lastInteraction: s.lastInteraction,
        // extrait lisible de la memoire de travail (10 derniers)
        workingMemory: s.workingMemory.slice(-10).map(w => ({
          type: w.type, content: w.content.slice(0, 200),
        })),
        graph: cortex.graph.stats(),
      });
    }

    // --- API: injecter un message utilisateur ---
    if (path === '/api/inject' && req.method === 'POST') {
      const raw = await readBody(req);
      let message = '';
      try { message = JSON.parse(raw).message ?? ''; } catch { message = raw; }
      if (!message.trim()) return sendJson(res, 400, { error: 'message vide' });

      // Garde anti-blocage: si un appel modele traine, on ne laisse pas le
      // client attendre indefiniment. Le cortex reste disponible pour les
      // autres routes (etat, graphe) qui ne sollicitent pas le modele.
      const INJECT_TIMEOUT_MS = 180_000;
      const timeout = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error('delai modele depasse (qwythos local lent)')), INJECT_TIMEOUT_MS)
      );
      try {
        const response = await Promise.race([cortex.inject(message), timeout]);
        return sendJson(res, 200, { response, state: { cycles: cortex.state.cycles } });
      } catch (injectErr: any) {
        // On ne casse pas le serveur: on renvoie une erreur claire au client.
        return sendJson(res, 503, { error: injectErr?.message ?? 'echec inject', degradable: true });
      }
    }

    // --- API: stream SSE (apercu live du raisonnement via hy3, sans tool-calling) ---
    // Complement a /api/inject: affiche les tokens au fil de l'eau pour la fluidite.
    if (path === '/api/stream' && req.method === 'POST') {
      const raw = await readBody(req);
      let message = '';
      try { message = JSON.parse(raw).message ?? ''; } catch { message = raw; }
      if (!message.trim()) return sendJson(res, 400, { error: 'message vide' });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`event: meta\ndata: ${JSON.stringify({ mode: cortex.mode, model: 'hy3:free' })}\n\n`);

      const ctx = cortex.graph.toContext(10);
      const prompt = `[Contexte graphe]\n${ctx}\n\n[Message utilisateur]\n${message}\n\nReponds en francais.`;
      try {
        for await (const token of bridge.thinkStream(prompt, 'general')) {
          res.write(`data: ${JSON.stringify(token)}\n\n`);
        }
        res.write('event: done\ndata: {}\n\n');
      } catch (e: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ error: e?.message ?? 'echec stream' })}\n\n`);
      }
      return res.end();
    }
    if (path === '/api/graph' && req.method === 'GET') {
      return sendJson(res, 200, cortex.graph.stats());
    }

    // --- Static: sert l'UI ---
    if (req.method === 'GET' && (path === '/' || path === '/index.html')) {
      const filePath = join(PUBLIC_DIR, 'index.html');
      if (!existsSync(filePath)) return sendJson(res, 404, { error: 'UI non trouvee' });
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      return res.end(readFileSync(filePath));
    }
    if (req.method === 'GET' && path.startsWith('/public/')) {
      const filePath = join(PUBLIC_DIR, path.replace('/public/', ''));
      if (!existsSync(filePath)) { res.writeHead(404); return res.end('404'); }
      const ext = extname(filePath);
      res.writeHead(200, { 'Content-Type': MIME[ext] ?? 'application/octet-stream' });
      return res.end(readFileSync(filePath));
    }

    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404');
  } catch (err: any) {
    sendJson(res, 500, { error: err?.message ?? 'erreur serveur' });
  }
});

server.listen(PORT, () => {
  console.log(`[UI] Harnais 2027 (Atlas) sur http://localhost:${PORT}`);
  console.log(`[UI] Modele general: hy3:free (Nous Portal, gratuit) | raisonnement: qwythos local`);
});
