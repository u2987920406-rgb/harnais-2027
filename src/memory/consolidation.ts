/**
 * Consolidation — Le cycle de sommeil du cortex.
 *
 * Comme ton cerveau pendant le sommeil:
 * 1. Revise les expériences récentes
 * 2. En extrait des patterns
 * 3. Les intègre dans le modèle du monde (graphe)
 * 4. Optimise les procédures
 * 5. OUBIE ce qui n'est plus pertinent
 *
 * L'oubli est une fonctionnalité, pas un bug.
 * Une mémoire qui ne fait pas de place devient du bruit.
 */

import { ModelBridge } from '../models/bridge.js';
import { KnowledgeGraph } from './knowledge-graph.js';
import { CortexState, WorkingMemoryItem } from '../core/state.js';

export interface ConsolidationResult {
  patternsFound: string[];
  nodesCreated: number;
  nodesRemoved: number;
  edgesCreated: number;
  proceduresExtracted: string[];
  itemsConsolidated: number;
}

export class Consolidation {
  private bridge: ModelBridge;
  private graph: KnowledgeGraph;

  constructor(bridge: ModelBridge, graph: KnowledgeGraph) {
    this.bridge = bridge;
    this.graph = graph;
  }

  /**
   * Consolidation légère — tourne en mode idle.
   * Prend les items récents de la working memory et les structure dans le graphe.
   */
  async consolidate(state: CortexState): Promise<ConsolidationResult> {
    console.log('[Consolidation] Légère...');

    const recentItems = state.workingMemory
      .filter(wm => wm.relevance > 0.5)
      .slice(-20);

    if (recentItems.length === 0) {
      return this.emptyResult();
    }

    // Demande au modèle d'extraire des patterns
    const itemsText = recentItems.map(wm =>
      `[${wm.type}] ${wm.content}`
    ).join('\n');

    const prompt = `Tu es le module de consolidation d'un système cognitif.
Analyse ces expériences récentes et extrais des patterns.

Expériences:
${itemsText}

Réponds en JSON:
{
  "patterns": ["pattern 1", "pattern 2"],
  "procedures": ["procédure extraite 1"],
  "entities_to_link": [["entité A", "relation", "entité B"]]
}

Sois concis. Maximum 3 patterns, 2 procédures.`;

    try {
      const response = await this.bridge.think(prompt, 'consolidation', {
        temperature: 0.3,
        maxTokens: 512,
      });

      const parsed = this.parseConsolidation(response.text);
      let nodesCreated = 0;
      let edgesCreated = 0;

      // Crée des nœuds pour les patterns
      for (const pattern of parsed.patterns) {
        this.graph.addNode('concept', pattern, {
          source: 'consolidation',
          timestamp: Date.now(),
        }, 0.6);
        nodesCreated++;
      }

      // Crée des nœuds pour les procédures
      for (const proc of parsed.procedures) {
        this.graph.addNode('procedure', proc, {
          source: 'consolidation',
          timestamp: Date.now(),
          tested: false,
        }, 0.5);
        nodesCreated++;
      }

      // Link entities
      for (const [a, rel, b] of parsed.entities_to_link) {
        const nodeA = this.graph.query({ labelContains: a })[0];
        const nodeB = this.graph.query({ labelContains: b })[0];
        if (nodeA && nodeB) {
          this.graph.addEdge(nodeA.id, nodeB.id, rel as any, 0.6);
          edgesCreated++;
        }
      }

      console.log(`[Consolidation] ${nodesCreated} nœuds, ${edgesCreated} arêtes créés`);

      return {
        patternsFound: parsed.patterns,
        nodesCreated,
        nodesRemoved: 0,
        edgesCreated,
        proceduresExtracted: parsed.procedures,
        itemsConsolidated: recentItems.length,
      };
    } catch (err) {
      console.error('[Consolidation] Erreur:', err);
      return this.emptyResult();
    }
  }

  /**
   * Consolidation profonde — le cycle de sommeil.
   * Decay du graphe, extraction de procédures, optimisation.
   */
  async deepConsolidate(state: CortexState): Promise<ConsolidationResult> {
    console.log('[Consolidation] === SOMMEIL PROFOND ===');

    // 1. Decay — réduit le poids des nœuds peu consultés
    const removed = this.graph.decayAll(0.05);
    console.log(`[Consolidation] Decay: ${removed} nœuds éliminés`);

    // 2. Consolidation légère
    const light = await this.consolidate(state);

    // 3. Extraction de procédures — cherche des séquences d'actions répétées
    const procedures = await this.extractProcedures(state);
    let procNodes = 0;
    for (const proc of procedures) {
      this.graph.addNode('procedure', proc, {
        source: 'deep-consolidation',
        timestamp: Date.now(),
        tested: false,
      }, 0.7);
      procNodes++;
    }

    // 4. Nettoyage de la working memory — évince les items à faible relevance
    const before = state.workingMemory.length;
    state.workingMemory = state.workingMemory.filter(wm => wm.relevance > 0.1);
    const evicted = before - state.workingMemory.length;
    console.log(`[Consolidation] Working memory: ${evicted} items évincés`);

    // 5. Réduit les hypothèses anciennes
    state.activeHypotheses = state.activeHypotheses.filter(h => {
      const age = Date.now() - h.lastEvaluated;
      if (age > 30 * 60 * 1000 && h.confidence < 0.3) return false; // 30min + faible confiance = oublie
      return true;
    });

    // 6. Sauvegarde
    this.graph.save();

    return {
      patternsFound: light.patternsFound,
      nodesCreated: light.nodesCreated + procNodes,
      nodesRemoved: removed,
      edgesCreated: light.edgesCreated,
      proceduresExtracted: procedures,
      itemsConsolidated: light.itemsConsolidated + evicted,
    };
  }

  /**
   * Extrait des procédures des expériences répétées.
   */
  private async extractProcedures(state: CortexState): Promise<string[]> {
    const actions = state.workingMemory.filter(wm => wm.type === 'action' || wm.type === 'decision');
    if (actions.length < 3) return [];

    const actionsText = actions.map(a => a.content).join('\n');
    const prompt = `Tu es un extracteur de procédures.
Analyse ces actions et identifie des procédures reproductibles.

Actions:
${actionsText}

Réponds en JSON array de strings. Chaque string est une procédure:
["Pour faire X: 1. ... 2. ... 3. ..."]

Maximum 3 procédures. Sois concret.`;

    try {
      const response = await this.bridge.think(prompt, 'consolidation', {
        temperature: 0.2,
        maxTokens: 512,
      });
      const match = response.text.match(/\[[\s\S]*\]/);
      if (match) return JSON.parse(match[0]);
    } catch (err) {
      console.error('[Consolidation] Extract procedures error:', err);
    }
    return [];
  }

  private parseConsolidation(text: string): {
    patterns: string[];
    procedures: string[];
    entities_to_link: [string, string, string][];
  } {
    try {
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          patterns: parsed.patterns ?? [],
          procedures: parsed.procedures ?? [],
          entities_to_link: parsed.entities_to_link ?? [],
        };
      }
    } catch {
      // fallback
    }
    return { patterns: [], procedures: [], entities_to_link: [] };
  }

  private emptyResult(): ConsolidationResult {
    return {
      patternsFound: [],
      nodesCreated: 0,
      nodesRemoved: 0,
      edgesCreated: 0,
      proceduresExtracted: [],
      itemsConsolidated: 0,
    };
  }
}