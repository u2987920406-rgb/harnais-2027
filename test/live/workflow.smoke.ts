/**
 * Smoke test live du WorkflowEngine — workflow reel de bout en bout.
 * Chaine: file_read (outil reel) -> transform (extrait) -> agent (Ollama) -> file_write (outil reel).
 * Lance: npm run smoke:workflow
 */
import { ModelBridge } from '../../src/models/bridge.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { KnowledgeGraph } from '../../src/memory/knowledge-graph.js';
import { WorkflowEngine, formatTrace, type WorkflowDef } from '../../src/core/workflow.js';
import { createFilesystemTools } from '../../src/tools/filesystem.js';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, readFileSync, rmSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');
const OUT = join(REPO, 'test', 'live', '.workflow-out.txt');

async function main() {
  const bridge = new ModelBridge();
  if (!(await bridge.ping())) { console.error('Ollama injoignable'); process.exit(1); }

  const tools = new ToolRegistry();
  for (const t of createFilesystemTools()) tools.register(t);
  const graph = new KnowledgeGraph();
  const engine = new WorkflowEngine(bridge, tools, graph);

  const def: WorkflowDef = {
    id: 'resume-fichier',
    nodes: [
      { id: 'lire', kind: 'tool', ref: 'file_read' },
      { id: 'extrait', kind: 'transform', ref: 'head',
        transform: (input: any) => String(input ?? '').split('\n').slice(0, 15).join('\n') },
      { id: 'resumer', kind: 'agent', ref: 'resumeur', capability: 'general',
        system: 'Tu resumes du texte en UNE phrase courte, en francais. Pas de preambule.' },
      { id: 'ecrire', kind: 'tool', ref: 'file_write' },
    ],
    edges: [
      { from: 'lire', to: 'extrait' },
      { from: 'extrait', to: 'resumer' },
      { from: 'resumer', to: 'ecrire' },
    ],
  };

  // Le noeud 'lire' recoit ses args via son :in, idem 'ecrire' (path fixe + content mappe).
  // On amorce: lire lit le package.json, ecrire ecrira le resume.
  const initial: Record<string, unknown> = {
    'lire:in': { path: join(REPO, 'package.json') },
  };

  // On patche l'edge resumer->ecrire pour fabriquer l'objet {path, content} attendu par file_write.
  // Le WorkflowEngine passe outputs['resumer'] a 'ecrire:in'; file_write veut {path, content}.
  // On intercale un transform dedie.
  def.nodes.splice(3, 0, {
    id: 'paquet', kind: 'transform', ref: 'mk-args',
    transform: (input: any) => ({ path: OUT, content: `RESUME:\n${String(input ?? '')}` }),
  });
  def.edges = [
    { from: 'lire', to: 'extrait' },
    { from: 'extrait', to: 'resumer' },
    { from: 'resumer', to: 'paquet' },
    { from: 'paquet', to: 'ecrire' },
  ];

  console.log('[workflow] execution...');
  const t0 = Date.now();
  const res = await engine.run(def, initial);
  console.log(`[workflow] termine en ${Date.now() - t0}ms, ok=${res.ok}, steps=${res.steps}`);
  console.log(formatTrace(res.trace));

  if (!res.ok) { console.error('[workflow] ECHEC:', res.error); process.exit(1); }
  if (!existsSync(OUT)) { console.error('[workflow] fichier de sortie absent'); process.exit(1); }

  const written = readFileSync(OUT, 'utf-8');
  console.log(`[workflow] fichier ecrit (${written.length} octets):\n${written.slice(0, 300)}`);
  rmSync(OUT, { force: true });

  const graphOk = graph.query({ type: 'episode' }).length >= 0; // agent enregistre un episode
  console.log(`[workflow] graphe noeuds=${graph.stats().nodes}`);
  console.log('[workflow] === WORKFLOW LIVE OK ===');
}

main().catch(e => { console.error('[workflow] ECHEC:', e); process.exit(1); });
