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

// --- Instancie le Cortex en mode souverain (Ollama local) ---
// generalModel force sur qwythos local pour ne jamais appeler le cloud.
const bridge = new ModelBridge({
  generalModel: process.env.HARNAIS_GENERAL_MODEL ?? 'qwythos-tools:q6',
  consolidationModel: process.env.HARNAIS_GENERAL_MODEL ?? 'qwythos-tools:q6',
  allowCloud: false, // souverain: aucun appel cloud
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
    // --- API: etat du cortex ---
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

    // --- API: stats du graphe ---
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
  console.log(`[UI] Mode souverain: ${bridge.stats()?.generalModel ?? 'qwythos local'} (cloud desactive)`);
});
