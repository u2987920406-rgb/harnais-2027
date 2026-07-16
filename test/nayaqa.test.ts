import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { NayaQABridge, type QAVerdict, type PhaseSignal } from '../src/bridge/nayaqa.js';
import { KnowledgeGraph } from '../src/memory/knowledge-graph.js';

function writeVerdict(dir: string, v: QAVerdict): string {
  const p = join(dir, 'audit-verdict.json');
  writeFileSync(p, JSON.stringify(v));
  return p;
}

const signal: PhaseSignal = {
  projectName: 'demo-app', phase: 'build', timestamp: new Date().toISOString(),
  projectDir: '/tmp/demo', changedFiles: ['a.ts'], retryCount: 0,
};

test('readVerdict: fichier absent -> null', async () => {
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  const v = await b.readVerdict(join(tmpdir(), 'nexiste-pas-verdict.json'));
  assert.equal(v, null);
});

test('readVerdict green: enregistre un noeud verdict + lie au projet', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-qa-'));
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  const path = writeVerdict(dir, { verdict: 'green', rejection: null, branches: {} });
  const v = await b.readVerdict(path, signal);
  assert.equal(v?.verdict, 'green');
  assert.ok(g.query({ labelContains: 'Verdict GREEN' }).length >= 1);
  assert.ok(g.query({ labelContains: 'Projet: demo-app' }).length >= 1);
  rmSync(dir, { recursive: true, force: true });
});

test('readVerdict red: cree un noeud branche en echec + arete a_echoue_avec', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-qa-'));
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  const path = writeVerdict(dir, {
    verdict: 'red',
    rejection: { rejection_id: 'r1', corrective_action: 'echapper les entrees', rule_ref: 'OWASP-A03', branch: 'security', retry_count: 1 },
    branches: { security: { status: 'red', summary: 'injection detectee' } },
  });
  const v = await b.readVerdict(path, signal);
  assert.equal(v?.verdict, 'red');
  assert.ok(g.query({ labelContains: 'Branche NayaQA: security' }).length >= 1);
  rmSync(dir, { recursive: true, force: true });
});

test('getWarningsForProject: remonte les feux rouges d autres projets', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-qa-'));
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  // verdict rouge sur projet A
  const pathA = writeVerdict(dir, {
    verdict: 'red',
    rejection: { rejection_id: 'r1', corrective_action: 'ajouter alt', rule_ref: 'WCAG-1.1.1', branch: 'accessibility', retry_count: 1 },
    branches: {},
  });
  await b.readVerdict(pathA, { ...signal, projectName: 'projet-A' });
  // warnings pour un AUTRE projet
  const warnings = b.getWarningsForProject('projet-B');
  assert.ok(warnings.length >= 1);
  assert.match(warnings[0], /projet-A/);
  assert.match(warnings[0], /alt/);
  rmSync(dir, { recursive: true, force: true });
});

test('buildEnrichedContext: vide si aucun warning, sinon formate', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-qa-'));
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  assert.equal(b.buildEnrichedContext('vierge', 'un brief'), '');

  const path = writeVerdict(dir, {
    verdict: 'red',
    rejection: { rejection_id: 'r2', corrective_action: 'memoiser', rule_ref: 'PERF-1', branch: 'performance', retry_count: 1 },
    branches: {},
  });
  await b.readVerdict(path, { ...signal, projectName: 'projet-X' });
  const ctx = b.buildEnrichedContext('projet-Y', 'brief');
  assert.match(ctx, /CONTEXTE ENRICHI/);
  assert.match(ctx, /projet-X/);
  rmSync(dir, { recursive: true, force: true });
});

test('readRetex: absent -> chaine vide', () => {
  const g = new KnowledgeGraph();
  const b = new NayaQABridge(g);
  assert.equal(b.readRetex(join(tmpdir(), 'nexiste-pas-workspace')), '');
});
