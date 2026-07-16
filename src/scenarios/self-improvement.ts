/**
 * SelfImprovementScenario — La boucle d'amelioration Atlas <-> NayaOS.
 *
 * Le harnais n'execute pas les taches: il rend NayaOS plus intelligent.
 * Flux bout-en-bout:
 *
 *   1. OBSERVER  — lire l'etat NayaOS (projets, agents) + verdicts NayaQA (graphe)
 *   2. DETECTER  — identifier les patterns d'echec recurrents (feux rouges par branche)
 *   3. AVERTIR   — construire un contexte enrichi cross-projet (leçons des echecs passes)
 *   4. AGIR      — injecter l'avertissement dans NayaOS avant le prochain build
 *                  (via sendChat/mission), ou dry-run si NayaOS est hors ligne
 *   5. APPRENDRE — tracer l'intervention dans le graphe (episode)
 *
 * Le tout est trace: chaque etape retourne un statut. Fail-safe si NayaOS est down.
 */

import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { NayaOSBridge } from '../bridge/nayaos.js';
import { NayaQABridge } from '../bridge/nayaqa.js';

export interface FailurePattern {
  branch: string;          // branche NayaQA en echec (security, accessibility, ...)
  ruleRef: string;         // regle violee (OWASP-A03, WCAG-1.1.1, ...)
  correctiveAction: string; // action corrective recommandee
  occurrences: number;     // combien de projets ont eu ce feu rouge
  projects: string[];      // quels projets
}

export interface ScenarioStep {
  name: 'observer' | 'detecter' | 'avertir' | 'agir' | 'apprendre';
  status: 'done' | 'skipped' | 'failed';
  detail: string;
}

export interface ScenarioResult {
  ok: boolean;
  targetProject: string;
  nayaosOnline: boolean;
  patterns: FailurePattern[];
  enrichedContext: string;
  injected: boolean;       // l'avertissement a-t-il ete envoye a NayaOS ?
  steps: ScenarioStep[];
}

export interface ScenarioOptions {
  /** Si true, ne commande jamais NayaOS meme s'il est en ligne (mode observation). */
  dryRun?: boolean;
  /** Nombre max de patterns a remonter. */
  maxPatterns?: number;
}

export class SelfImprovementScenario {
  private graph: KnowledgeGraph;
  private nayaos: NayaOSBridge;
  private nayaqa: NayaQABridge;

  constructor(graph: KnowledgeGraph, nayaos: NayaOSBridge, nayaqa: NayaQABridge) {
    this.graph = graph;
    this.nayaos = nayaos;
    this.nayaqa = nayaqa;
  }

  /**
   * Detecte les patterns d'echec recurrents dans le graphe.
   * Regroupe les verdicts rouges par branche NayaQA et compte les occurrences.
   * Exclut le projet cible (on ne s'avertit pas de ses propres echecs).
   */
  detectFailurePatterns(excludeProject?: string, maxPatterns = 5): FailurePattern[] {
    const redVerdicts = this.graph.query({ labelContains: 'Verdict RED' });
    // cle: branche+regle -> pattern agrege
    const byKey = new Map<string, FailurePattern>();

    for (const v of redVerdicts) {
      const project = v.properties.projectName as string | undefined;
      if (!project || project === excludeProject) continue;

      // trouve les noeuds "Branche NayaQA:" relies a ce verdict
      const neighbors = this.graph.getNeighbors(v.id);
      for (const b of neighbors) {
        if (b.type !== 'concept' || !b.label.startsWith('Branche NayaQA:')) continue;
        const branch = (b.properties.type === 'nayaqa-branch')
          ? b.label.replace('Branche NayaQA: ', '')
          : b.label;
        const ruleRef = String(b.properties.ruleRef ?? 'N/A');
        const correctiveAction = String(b.properties.correctiveAction ?? '');
        const key = `${branch}::${ruleRef}`;

        const existing = byKey.get(key);
        if (existing) {
          existing.occurrences++;
          if (!existing.projects.includes(project)) existing.projects.push(project);
        } else {
          byKey.set(key, {
            branch, ruleRef, correctiveAction,
            occurrences: 1, projects: [project],
          });
        }
      }
    }

    // trie par occurrences decroissantes (les patterns les plus frequents d'abord)
    return Array.from(byKey.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, maxPatterns);
  }

  /**
   * Construit un avertissement lisible pour NayaOS a partir des patterns.
   */
  buildAdvisory(targetProject: string, patterns: FailurePattern[]): string {
    if (patterns.length === 0) return '';
    const lines = [
      `CONTEXTE ENRICHI PAR ATLAS (harnais cognitif) pour le projet "${targetProject}":`,
      `Des projets similaires ont deja echoue sur ces points NayaQA. Evite-les DES LE DEPART:`,
    ];
    for (const p of patterns) {
      const projs = p.projects.join(', ');
      lines.push(
        `  [${p.branch}/${p.ruleRef}] vu ${p.occurrences}x (${projs}) => ${p.correctiveAction}`
      );
    }
    lines.push(`Applique ces correctifs preventivement. Objectif: Feu Vert du premier coup.`);
    return lines.join('\n');
  }

  /**
   * Execute le scenario complet: observer -> detecter -> avertir -> agir -> apprendre.
   */
  async run(targetProject: string, brief: string, options: ScenarioOptions = {}): Promise<ScenarioResult> {
    const steps: ScenarioStep[] = [];
    const maxPatterns = options.maxPatterns ?? 5;

    // --- 1. OBSERVER ---
    const nayaosOnline = await this.nayaos.ping();
    if (nayaosOnline) {
      await this.nayaos.listProjects();
      await this.nayaos.listAgents();
      steps.push({ name: 'observer', status: 'done', detail: 'NayaOS en ligne: projets+agents lus dans le graphe' });
    } else {
      steps.push({ name: 'observer', status: 'skipped', detail: 'NayaOS hors ligne: observation limitee au graphe local' });
    }

    // --- 2. DETECTER ---
    const patterns = this.detectFailurePatterns(targetProject, maxPatterns);
    steps.push({
      name: 'detecter',
      status: patterns.length > 0 ? 'done' : 'skipped',
      detail: patterns.length > 0
        ? `${patterns.length} pattern(s) d'echec detecte(s): ${patterns.map(p => p.branch).join(', ')}`
        : 'aucun pattern d\'echec recurrent dans le graphe',
    });

    // --- 3. AVERTIR ---
    const enrichedContext = this.buildAdvisory(targetProject, patterns);
    steps.push({
      name: 'avertir',
      status: enrichedContext ? 'done' : 'skipped',
      detail: enrichedContext ? `avertissement construit (${enrichedContext.length} car.)` : 'rien a signaler',
    });

    // --- 4. AGIR ---
    let injected = false;
    if (enrichedContext && nayaosOnline && !options.dryRun) {
      const prompt = `${enrichedContext}\n\n---\nBRIEF DU BUILD:\n${brief}`;
      const res = await this.nayaos.sendChat(prompt, targetProject);
      injected = !/error/i.test(res);
      steps.push({
        name: 'agir',
        status: injected ? 'done' : 'failed',
        detail: injected ? 'avertissement injecte dans NayaOS avant le build' : `echec injection: ${res.slice(0, 100)}`,
      });
    } else {
      const reason = !enrichedContext ? 'rien a injecter'
        : options.dryRun ? 'dry-run (injection desactivee)'
        : 'NayaOS hors ligne';
      steps.push({ name: 'agir', status: 'skipped', detail: reason });
    }

    // --- 5. APPRENDRE ---
    this.graph.addNode('episode', `Atlas advisory -> ${targetProject}`, {
      type: 'atlas-intervention',
      targetProject,
      patternsCount: patterns.length,
      injected,
      nayaosOnline,
      timestamp: Date.now(),
    }, 0.7);
    steps.push({ name: 'apprendre', status: 'done', detail: 'intervention tracee dans le graphe' });

    return {
      ok: true,
      targetProject,
      nayaosOnline,
      patterns,
      enrichedContext,
      injected,
      steps,
    };
  }
}

/**
 * Formate un ScenarioResult en rapport lisible.
 */
export function formatScenario(r: ScenarioResult): string {
  const lines = [
    `=== SCENARIO AUTO-AMELIORATION: ${r.targetProject} ===`,
    `NayaOS: ${r.nayaosOnline ? 'EN LIGNE' : 'HORS LIGNE'} | Injecte: ${r.injected ? 'OUI' : 'NON'}`,
    `Patterns detectes: ${r.patterns.length}`,
    ...r.steps.map(s => `  ${s.status === 'done' ? 'OK' : s.status === 'failed' ? 'KO' : 'SKIP'} ${s.name} — ${s.detail}`),
  ];
  if (r.enrichedContext) {
    lines.push('--- AVERTISSEMENT ---', r.enrichedContext);
  }
  return lines.join('\n');
}
