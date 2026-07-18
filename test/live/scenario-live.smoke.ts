/**
 * Smoke test du SCENARIO en mode LIVE reel (pont NayaOS simule).
 *
 * Comme NayaOS n'est pas demarre sur la machine, on leve un FAUX serveur
 * NayaOS sur le port 3001 qui repond aux routes utilisees par le pont
 * (GET /api/projects, POST /api/chat). Ca prouve que:
 *   1. le pont NayaOS parle bien le bon contrat d'API
 *   2. le scenario injecte reellement l'avertissement (pas seulement dry-run)
 *   3. l'injection est tracee dans le graphe
 *
 * Lance: npm run smoke:scenario-live
 */
import { createServer } from 'http';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { KnowledgeGraph } from '../../src/memory/knowledge-graph.js';
import { NayaOSBridge } from '../../src/bridge/nayaos.js';
import { NayaQABridge, type QAVerdict, type PhaseSignal } from '../../src/bridge/nayaqa.js';
import { SelfImprovementScenario, formatScenario } from '../../src/scenarios/self-improvement.js';

// --- Faux serveur NayaOS sur 3001 ---
const fakeNayaOS = createServer((req: any, res: any) => {
  if (req.method === 'GET' && req.url === '/api/projects') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ projects: [{ name: 'demo-app', status: 'building' }] }));
  }
  if (req.method === 'POST' && req.url === '/api/chat') {
    let body = '';
    req.on('data', (c: any) => (body += c));
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, received: JSON.parse(body).prompt?.slice(0, 60) }));
    });
    return;
  }
  res.writeHead(404); res.end('404');
});

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-live-'));
  await new Promise<void>(r => fakeNayaOS.listen(3001, r));
  console.log('[scenario-live] Faux NayaOS sur :3001');

  const graph = new KnowledgeGraph(join(dir, 'graph.json'));
  const nayaos = new NayaOSBridge(graph, { baseUrl: 'http://localhost:3001', timeout: 3000 });
  const nayaqa = new NayaQABridge(graph);

  // ping doit etre OK maintenant
  const online = await nayaos.ping();
  console.log(`[scenario-live] NayaOS online=${online}`);
  if (!online) { console.error('[scenario-live] ECHEC ping'); process.exit(1); }

  // seed: 2 projets ont echoue sur security
  const sig = (p: string): PhaseSignal => ({ projectName: p, phase: 'build', timestamp: new Date().toISOString(), projectDir: '/tmp', changedFiles: [], retryCount: 1 });
  const seedRed = async (proj: string) => {
    const v: QAVerdict = { verdict: 'red', rejection: { rejection_id: 'r', branch: 'security', rule_ref: 'OWASP-A03', corrective_action: 'echapper les entrees', retry_count: 1 }, branches: {} };
    const fp = join(dir, `${proj}.json`);
    (await import('fs')).writeFileSync(fp, JSON.stringify(v));
    await nayaqa.readVerdict(fp, sig(proj));
  };
  await seedRed('projet-A');
  await seedRed('projet-B');

  const scn = new SelfImprovementScenario(graph, nayaos, nayaqa);
  const result = await scn.run('nouveau-site', 'Construis un site', { dryRun: false });

  console.log('\n' + formatScenario(result) + '\n');

  const ok = result.injected && result.nayaosOnline && result.patterns.length === 1;
  if (!ok) { console.error('[scenario-live] ECHEC: injection non confirmee', JSON.stringify({ injected: result.injected, online: result.nayaosOnline })); process.exit(1); }

  fakeNayaOS.close();
  rmSync(dir, { recursive: true, force: true });
  console.log('[scenario-live] === SCENARIO LIVE REEL OK (injection NayaOS confirmee) ===');
}

main().catch(e => { console.error('[scenario-live] ECHEC:', e); process.exit(1); });
