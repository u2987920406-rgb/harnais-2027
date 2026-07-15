/**
 * Spawner — Génération dynamique de processus cognitifs éphémères.
 *
 * Pas de rôles prédéfinis. Pas de brain-registry fixe.
 * Le cortex analyse la tâche, détermine quelles fonctions cognitives sont nécessaires,
 * et SPAWNE des sous-agents avec des prompts générés dynamiquement.
 *
 * Un sous-agent est:
 * - Éphémère (vit le temps de la tâche, meurt après)
 * - Spécialisé (son prompt est généré pour SA tâche, pas un template)
 * - Persistant en contribution (ses résultats vont dans le graphe)
 *
 * C'est l'émergence: pas de rôles, des fonctions cognitives matérialisées à la demande.
 */

import { ModelBridge, CognitiveMode } from '../models/bridge.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { ToolRegistry } from '../tools/registry.js';
import { SkillRegistry, type Skill } from '../core/skill.js';

export interface SpawnConfig {
  role: string;           // nom donné dynamiquement ("analyseur-de-causalité")
  task: string;           // description de la tâche
  mode: CognitiveMode;    // mode cognitif (détermine le modèle)
  systemPrompt: string;   // prompt système généré dynamiquement
  taskPrompt: string;     // prompt de tâche spécifique
  maxTokens?: number;
  temperature?: number;
  modelOverride?: string;
}

export interface SpawnResult {
  role: string;
  task: string;
  output: string;
  tokensUsed: number;
  success: boolean;
  error?: string;
  durationMs: number;
}

export class Spawner {
  private bridge: ModelBridge;
  private graph: KnowledgeGraph;
  private tools: ToolRegistry | null = null;
  private skills: SkillRegistry | null = null;
  private active = new Map<string, SpawnConfig>();

  constructor(bridge: ModelBridge, graph?: KnowledgeGraph) {
    this.bridge = bridge;
    this.graph = graph ?? new KnowledgeGraph();
  }

  /**
   * Injecte le registre d'outils pour que les agents ephemeres puissent agir.
   */
  setTools(tools: ToolRegistry): void {
    this.tools = tools;
  }

  /**
   * Injecte le registre de skills pour que les agents ephemeres
   * puissent charger des connaissances par tag.
   */
  setSkills(skills: SkillRegistry): void {
    this.skills = skills;
  }

  /**
   * Construit le prompt d'outils pour un sous-agent.
   */
  private toolsPrompt(): string {
    if (!this.tools) return '[Aucun outil]';
    return this.tools.toPrompt();
  }

  /**
   * Construit le prompt de skills pour un sous-agent, par tag.
   */
  private skillsPrompt(tags?: string[]): string {
    if (!this.skills || !tags || tags.length === 0) return '';
    const matched = this.skills.byTags(tags);
    return this.skills.toPrompt(matched);
  }

  /**
   * Analyse une tâche et détermine quel(s) processus cognitif(s) spawn.
   * C'est le méta-cerveau qui décide de la décomposition.
   */
  async planDecomposition(task: string, context?: string): Promise<SpawnConfig[]> {
    const prompt = `Tu es le méta-cerveau d'un système agentique.
Analyse cette tâche et détermine quels processus cognitifs sont nécessaires.

Tâche: ${task}
${context ? `Contexte: ${context}` : ''}

Réponds en JSON array. Chaque élément:
{
  "role": "nom-dynamique-du-role",
  "task": "description de la sous-tâche",
  "mode": "reasoning|creative|general|meta",
  "approach": "comment aborder la sous-tâche"
}

Maximum 3 processus. Sois précis et concis.`;

    const response = await this.bridge.think(prompt, 'meta', {
      temperature: 0.3,
      maxTokens: 1024,
    });

    return this.parseSpawnConfigs(response.text);
  }

  /**
   * Spawn un processus cognitif unique.
   */
  async spawn(config: SpawnConfig): Promise<SpawnResult> {
    const id = Math.random().toString(36).slice(2);
    this.active.set(id, config);
    const t0 = Date.now();

    console.log(`[Spawner] Spawn: ${config.role} (${config.mode})`);

    try {
      const response = await this.bridge.think(config.taskPrompt, config.mode, {
        system: config.systemPrompt,
        temperature: config.temperature ?? 0.7,
        maxTokens: config.maxTokens ?? 2048,
        modelOverride: config.modelOverride,
      });

      const result: SpawnResult = {
        role: config.role,
        task: config.task,
        output: response.text,
        tokensUsed: response.tokensGenerated ?? 0,
        success: true,
        durationMs: Date.now() - t0,
      };

      // Enregistre dans le graphe
      const spawnNode = this.graph.addNode('episode', `Spawn: ${config.role}`, {
        task: config.task,
        output: response.text.slice(0, 200),
        tokensUsed: result.tokensUsed,
        durationMs: result.durationMs,
        timestamp: Date.now(),
      }, 0.6);

      this.active.delete(id);
      return result;
    } catch (err: any) {
      console.error(`[Spawner] ${config.role} a échoué: ${err.message}`);
      this.active.delete(id);
      return {
        role: config.role,
        task: config.task,
        output: '',
        tokensUsed: 0,
        success: false,
        error: err.message,
        durationMs: Date.now() - t0,
      };
    }
  }

  /**
   * Spawn plusieurs processus en parallèle.
   * C'est la cognition parallèle — plusieurs cerveaux qui travaillent simultanément.
   */
  async spawnParallel(configs: SpawnConfig[]): Promise<SpawnResult[]> {
    console.log(`[Spawner] Spawn parallèle de ${configs.length} processus`);
    const results = await Promise.all(configs.map(c => this.spawn(c)));
    const successCount = results.filter(r => r.success).length;
    console.log(`[Spawner] ${successCount}/${configs.length} réussis`);
    return results;
  }

  /**
   * Spawn en séquence — chaque processus alimente le suivant.
   * C'est le pipeline cognitif.
   */
  async spawnPipeline(configs: SpawnConfig[]): Promise<SpawnResult[]> {
    const results: SpawnResult[] = [];
    for (const config of configs) {
      // Injecte les résultats précédents dans le prompt
      const prevContext = results
        .map(r => `[${r.role}]: ${r.output.slice(0, 500)}`)
        .join('\n---\n');

      const enrichedConfig: SpawnConfig = {
        ...config,
        taskPrompt: prevContext
          ? `Résultats précédents:\n${prevContext}\n\nTa tâche:\n${config.taskPrompt}`
          : config.taskPrompt,
      };

      const result = await this.spawn(enrichedConfig);
      results.push(result);
      if (!result.success) {
        console.warn(`[Spawner] Pipeline cassé à ${config.role}`);
        break;
      }
    }
    return results;
  }

  getActiveSpawns(): SpawnConfig[] {
    return Array.from(this.active.values());
  }

  private parseSpawnConfigs(text: string): SpawnConfig[] {
    try {
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return parsed.map((item: any): SpawnConfig => ({
          role: item.role ?? 'process-' + Math.random().toString(36).slice(2, 6),
          task: item.task ?? '',
          mode: item.mode ?? 'general',
          systemPrompt: `Tu es ${item.role}. ${item.approach ?? ''}\nTu travailles sur une tâche précise dans un système multi-agent. Sois concis et direct.`,
          taskPrompt: item.task,
          maxTokens: 1024,
          temperature: item.mode === 'creative' ? 0.8 : 0.5,
        }));
      }
    } catch (err) {
      console.error('[Spawner] Parse error:', err);
    }

    // Fallback: un seul processus general
    return [{
      role: 'general-solver',
      task: text,
      mode: 'general',
      systemPrompt: 'Tu es un agent cognitif. Résous la tâche de façon directe.',
      taskPrompt: text,
      maxTokens: 2048,
      temperature: 0.7,
    }];
  }
}