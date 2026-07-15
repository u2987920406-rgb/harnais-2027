/**
 * NayaQA Bridge — Pont entre le harnais et NayaQA.
 *
 * Le harnais LIT les verdicts de NayaQA et les connecte dans son graphe.
 * Il LIT aussi le Retex (memoire des erreurs passees).
 * Il peut ENRICHIR le Retex avec des patterns cross-projet.
 *
 * Les 7 branches de NayaQA (pas les 3 visages simplifies d'Atlas):
 * - security (OWASP: secrets, XSS, injection, CORS, path traversal)
 * - architecture (monolithe, separation, duplication, code mort)
 * - accessibility (WCAG 2.2: labels, alt, hierarchy, clavier)
 * - performance (Web Vitals: keys, useEffect, memo, images)
 * - tests (couverture logique non triviale)
 * - design-system (conseil: tokens, coherence)
 *
 * Les 3 visages d'observation (non bloquants):
 * - design-eye (contraste, tokens, conformite brief)
 * - flux-eye (ecrans fantomes, surfaces inatteignables)
 * - suite-eye (cross-app, gated)
 *
 * Le verdict: green (tout passe) ou red (branche bloquante echoue)
 * avec rejection (corrective_action + rule_ref).
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';

export interface QAVerdict {
  verdict: 'green' | 'red';
  rejection: Rejection | null;
  branches: Record<string, { status: string; summary: string }>;
}

export interface Rejection {
  rejection_id: string;
  corrective_action: string;
  rule_ref: string;
  branch: string;
  retry_count: number;
}

export interface PhaseSignal {
  projectName: string;
  phase: string;
  timestamp: string;
  projectDir: string;
  changedFiles: string[];
  retryCount: number;
}

export class NayaQABridge {
  private graph: KnowledgeGraph;
  private nayaqaWorkspace: string;

  constructor(graph: KnowledgeGraph, nayaqaWorkspace?: string) {
    this.graph = graph;
    this.nayaqaWorkspace = nayaqaWorkspace ?? '';
  }

  /**
   * Lit un verdict NayaQA depuis un fichier audit-verdict.json.
   * L'enregistre dans le graphe et retourne le verdict.
   */
  async readVerdict(verdictPath: string, signal?: PhaseSignal): Promise<QAVerdict | null> {
    if (!existsSync(verdictPath)) return null;

    try {
      const raw = readFileSync(verdictPath, 'utf-8');
      const verdict: QAVerdict = JSON.parse(raw);

      // Enregistre dans le graphe
      const label = `Verdict ${verdict.verdict.toUpperCase()} — ${signal?.projectName ?? 'projet'}`;
      const node = this.graph.addNode('episode', label, {
        type: 'nayaqa-verdict',
        verdict: verdict.verdict,
        projectName: signal?.projectName,
        phase: signal?.phase,
        branch: verdict.rejection?.branch,
        correctiveAction: verdict.rejection?.corrective_action,
        ruleRef: verdict.rejection?.rule_ref,
        timestamp: Date.now(),
      }, verdict.verdict === 'red' ? 0.9 : 0.6);

      // Connecte au projet dans le graphe
      if (signal?.projectName) {
        const projectNode = this.graph.upsertNode('entity', `Projet: ${signal.projectName}`, {
          type: 'nayaos-project',
          phase: signal.phase,
        }, 0.8);
        this.graph.addEdge(projectNode.id, node.id, 'connu', 0.8);

        // Si rouge: cree un noeud pour la branche en echec
        if (verdict.verdict === 'red' && verdict.rejection) {
          const branchNode = this.graph.upsertNode('concept', `Branche NayaQA: ${verdict.rejection.branch}`, {
            type: 'nayaqa-branch',
            ruleRef: verdict.rejection.rule_ref,
            correctiveAction: verdict.rejection.corrective_action,
          }, 0.7);
          this.graph.addEdge(node.id, branchNode.id, 'a_echoue_avec', 0.9);
        }
      }

      console.log(`[NayaQA] Verdict ${verdict.verdict} lu et enregistre dans le graphe`);
      return verdict;
    } catch (err) {
      console.error('[NayaQA] Erreur lecture verdict:', err);
      return null;
    }
  }

  /**
   * Lit le Retex de NayaQA (memoire des erreurs passees).
   */
  readRetex(workspace: string): string {
    const retexPath = join(workspace, 'retex.json');
    if (!existsSync(retexPath)) return '';
    try {
      return readFileSync(retexPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * Cherche dans le graphe les verdicts rouges sur des projets similaires.
   * Retourne un contexte d'avertissement pour injecter avant un build.
   */
  getWarningsForProject(projectName: string): string[] {
    const warnings: string[] = [];
    const verdicts = this.graph.query({ labelContains: 'Verdict RED' });

    for (const v of verdicts) {
      if (v.properties.projectName === projectName) continue; // meme projet, pas un warning
      const branches = this.graph.getNeighbors(v.id);
      for (const b of branches) {
        if (b.type === 'concept' && b.label.startsWith('Branche NayaQA:')) {
          warnings.push(
            `Projet similaire (${v.properties.projectName}) a eu un Feu Rouge sur ${b.label}: ${b.properties.correctiveAction}`
          );
        }
      }
    }

    return warnings.slice(0, 5); // max 5 warnings
  }

  /**
   * Genere un contexte enrichi pour NayaOS avant un build.
   * Inclut les warnings cross-projet et le Retex.
   */
  buildEnrichedContext(projectName: string, brief: string): string {
    const warnings = this.getWarningsForProject(projectName);
    if (warnings.length === 0) return '';

    return [
      `CONTEXTE ENRICHI PAR LE HARNAIS (cross-projet):`,
      `Projets similaires ont eu ces problemes NayaQA:`,
      ...warnings.map(w => `  ATTENTION: ${w}`),
      `Evite ces erreurs pour le projet ${projectName}.`,
    ].join('\n');
  }
}