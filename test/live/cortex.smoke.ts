/**
 * Smoke test live du Cortex — boucle cognitive reelle avec Ollama.
 * - init() (ping Ollama, charge graphe+skills)
 * - inject() une question simple -> reponse live
 * - idleThought() une pensee de fond
 * - introspect()
 * Etat/graphe ecrits dans un repertoire temporaire dedie (pas de pollution).
 * Lance: npm run smoke:cortex
 */
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Cortex } from '../../src/core/cortex.js';
import { KnowledgeGraph } from '../../src/memory/knowledge-graph.js';
import { ModelBridge } from '../../src/models/bridge.js';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-cortex-live-'));
  // On force le modele 'general' vers le local (qwythos) pour ne pas dependre
  // du cloud (GLM cloud est parfois rate-limite 429). Souverain, 100% local.
  const bridge = new ModelBridge({
    generalModel: 'qwythos-tools:q6',
    consolidationModel: 'qwythos-tools:q6',
    allowCloud: false,
  });
  const graph = new KnowledgeGraph(join(dir, 'graph.json'));
  const cortex = new Cortex(bridge, graph, {
    statePath: join(dir, 'state.json'),
    tickIntervalMs: 999999, // pas de boucle auto pendant le smoke
  });

  await cortex.init();
  if (!(await bridge.ping())) { console.error('Ollama injoignable'); process.exit(1); }

  console.log('[cortex-live] inject une question simple...');
  const t0 = Date.now();
  const res = await cortex.inject('En une phrase: quel est ton role ?');
  console.log(`[cortex-live] reponse (${Date.now() - t0}ms): ${res.slice(0, 300)}`);
  if (!res || res.length < 3) { console.error('[cortex-live] reponse vide'); process.exit(1); }

  console.log('[cortex-live] pensee de fond (idleThought)...');
  const t1 = Date.now();
  await cortex.idleThought();
  console.log(`[cortex-live] idleThought termine en ${Date.now() - t1}ms`);

  console.log('[cortex-live] introspection:');
  console.log(await cortex.introspect());

  const stats = cortex.graph.stats();
  console.log(`[cortex-live] graphe: ${stats.nodes} noeuds, ${stats.edges} aretes`);
  if (stats.nodes < 2) { console.error('[cortex-live] graphe trop pauvre'); process.exit(1); }

  rmSync(dir, { recursive: true, force: true });
  console.log('[cortex-live] === CORTEX LIVE OK ===');
}

main().catch(e => { console.error('[cortex-live] ECHEC:', e); process.exit(1); });
