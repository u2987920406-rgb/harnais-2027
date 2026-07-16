/**
 * Smoke test live du scenario d'auto-amelioration Atlas <-> NayaOS.
 *
 * Demontre la boucle bout-en-bout avec des verdicts NayaQA simules:
 *  - injecte 2 verdicts rouges (2 projets, meme faille security) dans le graphe
 *  - lance le scenario sur un projet neuf
 *  - detecte le pattern, construit l'avertissement
 *  - si NayaOS (port 3001) est EN LIGNE: injecte reellement l'avertissement
 *    si HORS LIGNE: dry-run, affiche ce qui serait envoye
 *
 * Lance: npm run smoke:scenario
 */
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KnowledgeGraph } from '../../src/memory/knowledge-graph.js';
import { NayaOSBridge } from '../../src/bridge/nayaos.js';
import { NayaQABridge, type QAVerdict, type PhaseSignal } from '../../src/bridge/nayaqa.js';
import { SelfImprovementScenario, formatScenario } from '../../src/scenarios/self-improvement.js';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-live-'));
  const graph = new KnowledgeGraph(join(dir, 'graph.json'));
  const nayaos = new NayaOSBridge(graph); // NAYAOS_URL ou localhost:3001
  const nayaqa = new NayaQABridge(graph);

  // --- Seed: 2 projets ont echoue sur la meme faille security ---
  const sig = (p: string): PhaseSignal => ({
    projectName: p, phase: 'build', timestamp: new Date().toISOString(),
    projectDir: '/tmp', changedFiles: [], retryCount: 1,
  });
  const seed = async (project: string) => {
    const v: QAVerdict = {
      verdict: 'red',
      rejection: {
        rejection_id: 'r', branch: 'security', rule_ref: 'OWASP-A03',
        corrective_action: 'echapper/valider toutes les entrees utilisateur (injection)',
        retry_count: 1,
      },
      branches: {},
    };
    const path = join(dir, `${project}.json`);
    writeFileSync(path, JSON.stringify(v));
    await nayaqa.readVerdict(path, sig(project));
  };
  await seed('boutique-en-ligne');
  await seed('portail-client');
  console.log('[scenario] 2 verdicts rouges simules injectes dans le graphe.');

  // --- Detecte si NayaOS est en ligne ---
  const online = await nayaos.ping();
  console.log(`[scenario] NayaOS (${nayaos.getConfig().baseUrl}): ${online ? 'EN LIGNE' : 'HORS LIGNE'}`);

  // --- Lance le scenario ---
  // dryRun force a true si NayaOS hors ligne (pas de commande possible de toute facon).
  const scn = new SelfImprovementScenario(graph, nayaos, nayaqa);
  const result = await scn.run('nouveau-site-vitrine', 'Construis un site vitrine avec formulaire de contact', {
    dryRun: !online, // si en ligne, on injecte pour de vrai
  });

  console.log('\n' + formatScenario(result) + '\n');

  // --- Assertions ---
  const patternOk = result.patterns.length === 1 && result.patterns[0].occurrences === 2;
  const contextOk = result.enrichedContext.includes('security') && result.enrichedContext.includes('OWASP-A03');
  const tracedOk = graph.query({ labelContains: 'Atlas advisory' }).length >= 1;

  if (!patternOk) { console.error('[scenario] ECHEC: pattern non detecte correctement'); process.exit(1); }
  if (!contextOk) { console.error('[scenario] ECHEC: avertissement mal construit'); process.exit(1); }
  if (!tracedOk) { console.error('[scenario] ECHEC: intervention non tracee'); process.exit(1); }

  if (online && result.injected) {
    console.log('[scenario] Avertissement REELLEMENT injecte dans NayaOS avant le build.');
  } else if (online && !result.injected) {
    console.log('[scenario] NayaOS en ligne mais injection non confirmee (voir dry-run/erreur ci-dessus).');
  } else {
    console.log('[scenario] Mode dry-run: avertissement pret, sera injecte quand NayaOS sera lance.');
  }

  rmSync(dir, { recursive: true, force: true });
  console.log('[scenario] === SCENARIO AUTO-AMELIORATION OK ===');
}

main().catch(e => { console.error('[scenario] ECHEC:', e); process.exit(1); });
