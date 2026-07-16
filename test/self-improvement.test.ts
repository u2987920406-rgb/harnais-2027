import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SelfImprovementScenario, formatScenario } from '../src/scenarios/self-improvement.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';
import { NayaOSBridge } from '../src/bridge/nayaos.js';
import { NayaQABridge, type QAVerdict, type PhaseSignal } from '../src/bridge/nayaqa.js';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// NayaOS pointe vers un port mort -> toujours "hors ligne" (tests offline).
function deadNayaOS(g: KnowledgeGraph): NayaOSBridge {
  return new NayaOSBridge(g, { baseUrl: 'http://127.0.0.1:59998', timeout: 800 });
}

function signal(project: string): PhaseSignal {
  return { projectName: project, phase: 'build', timestamp: new Date().toISOString(),
    projectDir: '/tmp', changedFiles: [], retryCount: 1 };
}

// Enregistre un verdict rouge pour un projet via le vrai pont NayaQA.
async function seedRed(nayaqa: NayaQABridge, dir: string, project: string, branch: string, rule: string, action: string) {
  const v: QAVerdict = {
    verdict: 'red',
    rejection: { rejection_id: 'r', corrective_action: action, rule_ref: rule, branch, retry_count: 1 },
    branches: {},
  };
  const p = join(dir, `${project}-${branch}.json`);
  writeFileSync(p, JSON.stringify(v));
  await nayaqa.readVerdict(p, signal(project));
}

test('detectFailurePatterns: agrege les feux rouges par branche+regle cross-projet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-'));
  const g = new KnowledgeGraph();
  const nayaqa = new NayaQABridge(g);
  // 2 projets echouent sur la MEME regle security
  await seedRed(nayaqa, dir, 'projet-A', 'security', 'OWASP-A03', 'echapper les entrees');
  await seedRed(nayaqa, dir, 'projet-B', 'security', 'OWASP-A03', 'echapper les entrees');
  // 1 projet echoue sur accessibility
  await seedRed(nayaqa, dir, 'projet-A', 'accessibility', 'WCAG-1.1.1', 'ajouter alt');

  const scn = new SelfImprovementScenario(g, deadNayaOS(g), nayaqa);
  const patterns = scn.detectFailurePatterns('projet-cible');

  const sec = patterns.find(p => p.branch === 'security');
  assert.ok(sec, 'pattern security manquant');
  assert.equal(sec!.occurrences, 2);
  assert.deepEqual(sec!.projects.sort(), ['projet-A', 'projet-B']);
  // security (2x) doit passer avant accessibility (1x)
  assert.equal(patterns[0].branch, 'security');
  rmSync(dir, { recursive: true, force: true });
});

test('detectFailurePatterns: exclut le projet cible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-'));
  const g = new KnowledgeGraph();
  const nayaqa = new NayaQABridge(g);
  await seedRed(nayaqa, dir, 'projet-cible', 'security', 'OWASP-A03', 'fix');
  const scn = new SelfImprovementScenario(g, deadNayaOS(g), nayaqa);
  const patterns = scn.detectFailurePatterns('projet-cible');
  assert.equal(patterns.length, 0);
  rmSync(dir, { recursive: true, force: true });
});

test('buildAdvisory: vide si aucun pattern, formate sinon', () => {
  const g = new KnowledgeGraph();
  const scn = new SelfImprovementScenario(g, deadNayaOS(g), new NayaQABridge(g));
  assert.equal(scn.buildAdvisory('X', []), '');
  const advisory = scn.buildAdvisory('projet-Y', [
    { branch: 'security', ruleRef: 'OWASP-A03', correctiveAction: 'echapper', occurrences: 2, projects: ['A', 'B'] },
  ]);
  assert.match(advisory, /CONTEXTE ENRICHI PAR ATLAS/);
  assert.match(advisory, /security\/OWASP-A03/);
  assert.match(advisory, /2x/);
  assert.match(advisory, /Feu Vert/);
});

test('run: scenario complet offline (NayaOS down) -> observe+detecte+avertit, skip agir', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-'));
  const g = new KnowledgeGraph();
  const nayaqa = new NayaQABridge(g);
  await seedRed(nayaqa, dir, 'projet-A', 'performance', 'PERF-1', 'memoiser le calcul');
  await seedRed(nayaqa, dir, 'projet-B', 'performance', 'PERF-1', 'memoiser le calcul');

  const scn = new SelfImprovementScenario(g, deadNayaOS(g), nayaqa);
  const res = await scn.run('projet-neuf', 'construis un dashboard');

  assert.equal(res.ok, true);
  assert.equal(res.nayaosOnline, false);
  assert.equal(res.injected, false);
  assert.equal(res.patterns.length, 1);
  assert.equal(res.patterns[0].occurrences, 2);
  assert.ok(res.enrichedContext.includes('performance'));
  // etapes: observer skip, detecter done, avertir done, agir skip, apprendre done
  assert.equal(res.steps.find(s => s.name === 'detecter')!.status, 'done');
  assert.equal(res.steps.find(s => s.name === 'agir')!.status, 'skipped');
  assert.equal(res.steps.find(s => s.name === 'apprendre')!.status, 'done');
  // intervention tracee dans le graphe
  assert.ok(g.query({ labelContains: 'Atlas advisory' }).length >= 1);
  rmSync(dir, { recursive: true, force: true });
});

test('run: aucun pattern -> avertir/agir skipped mais scenario ok', async () => {
  const g = new KnowledgeGraph();
  const scn = new SelfImprovementScenario(g, deadNayaOS(g), new NayaQABridge(g));
  const res = await scn.run('projet-vierge', 'brief');
  assert.equal(res.ok, true);
  assert.equal(res.patterns.length, 0);
  assert.equal(res.enrichedContext, '');
  assert.equal(res.steps.find(s => s.name === 'avertir')!.status, 'skipped');
});

test('formatScenario: produit un rapport lisible', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-scn-'));
  const g = new KnowledgeGraph();
  const nayaqa = new NayaQABridge(g);
  await seedRed(nayaqa, dir, 'projet-A', 'security', 'OWASP-A03', 'echapper');
  await seedRed(nayaqa, dir, 'projet-B', 'security', 'OWASP-A03', 'echapper');
  const scn = new SelfImprovementScenario(g, deadNayaOS(g), nayaqa);
  const res = await scn.run('cible', 'brief');
  const report = formatScenario(res);
  assert.match(report, /SCENARIO AUTO-AMELIORATION: cible/);
  assert.match(report, /HORS LIGNE/);
  assert.match(report, /detecter/);
  rmSync(dir, { recursive: true, force: true });
});
