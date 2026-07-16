/**
 * Smoke test live d'Ollama via ModelBridge — appel reseau reel.
 * Lance: tsx test/live/ollama.smoke.ts
 * Non inclus dans `npm test` (repertoire live/, pas *.test.ts a la racine test/).
 */
import { ModelBridge } from '../../src/models/bridge.js';
import { OllamaConnector } from '../../src/models/ollama.js';

async function main() {
  const connector = new OllamaConnector();
  const alive = await connector.ping();
  console.log(`[smoke] ping Ollama: ${alive ? 'OK' : 'KO'}`);
  if (!alive) { console.error('Ollama injoignable'); process.exit(1); }

  const models = await connector.listModels();
  console.log(`[smoke] ${models.length} modeles: ${models.join(', ')}`);

  const bridge = new ModelBridge();
  console.log('[smoke] think(reasoning) -> modele local...');
  const t0 = Date.now();
  const res = await bridge.think(
    'Reponds en un seul mot: quelle est la capitale de la France ?',
    'reasoning',
    { temperature: 0.1, maxTokens: 20 }
  );
  console.log(`[smoke] reponse (${Date.now() - t0}ms): ${JSON.stringify(res.text.slice(0, 120))}`);
  console.log(`[smoke] tokens generes: ${res.tokensGenerated}`);
  console.log('[smoke] stats:', JSON.stringify(bridge.stats()));

  const ok = res.text.toLowerCase().includes('paris');
  console.log(`[smoke] contenu attendu (paris): ${ok ? 'OK' : 'INATTENDU mais appel reussi'}`);
  console.log('[smoke] === LIVE OLLAMA OK ===');
}

main().catch(e => { console.error('[smoke] ECHEC:', e); process.exit(1); });
