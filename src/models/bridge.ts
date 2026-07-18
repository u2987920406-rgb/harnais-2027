/**
 * ModelBridge — Le pont vers les cerveaux.
 *
 * Abstraction unifiee sur les 3 modeles souverains de Raf:
 * - Qwythos v2 (local, raisonnement, outils) — le stratege
 * - Qwen 3.5 (cloud $0, rapide, polyvalent) — le generaliste
 * - GLM 5.2 (cloud $0, creatif, long contexte) — le penseur
 *
 * Maintenant avec:
 * - Routeur par capacite (local-first, par tier) au lieu d'allocation statique
 * - Budget avec tokens (maxPrompt/maxCompletion, withinBudget avant chaque appel)
 * - Self-consistency et debate pour compenser les modeles faibles
 */

import { OllamaConnector, type ModelResponse, type ModelRequest } from './ollama.js';
import { NousPortalConnector } from './nous-portal.js';
import {
  type Capability, type ProviderInfo,
  selectWithFallback,
} from '../core/router.js';
import {
  type Budget, makeBudget, withinBudget, charge, resetBudget, budgetSummary,
} from '../core/budget.js';

export type CognitiveMode = Capability;

export type GenStrategy = 'single' | 'selfconsistency' | 'debate';

export interface BridgeConfig {
  reasoningModel: string;
  creativeModel: string;
  generalModel: string;
  visionModel: string;
  metaModel: string;
  consolidationModel: string;
  critiqueModel: string;
  allowCloud: boolean;
  strategy: GenStrategy;
  nSamples: number;
}

const DEFAULT_CONFIG: BridgeConfig = {
  reasoningModel: 'qwythos-tools:q6',
  creativeModel: 'tencent/hy3:free',
  generalModel: 'tencent/hy3:free',
  visionModel: 'qwen2.5vl:3b', // local leger (~2Go), pull: ollama pull qwen2.5vl:3b
  metaModel: 'qwythos-tools:q6',
  consolidationModel: 'tencent/hy3:free',
  critiqueModel: 'qwythos-tools:q6',
  allowCloud: true,
  strategy: 'single',
  nSamples: 3,
};

export class ModelBridge {
  private connector: OllamaConnector;
  private nous: NousPortalConnector;
  private config: BridgeConfig;
  private providers: ProviderInfo[];
  private budget: Budget;
  private callCount = new Map<CognitiveMode, number>();
  private totalTokens = 0;

  constructor(config: Partial<BridgeConfig> = {}) {
    this.connector = new OllamaConnector();
    this.nous = new NousPortalConnector('tencent/hy3:free');
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.budget = makeBudget(20, 500_000, 500_000);

    // Construit la liste des providers depuis la config
    const all = [
      { id: 'qwythos', label: 'Qwythos v2 Q6', model: this.config.reasoningModel, isLocal: true,
        caps: ['reasoning', 'meta', 'critique'] as Capability[],
        tiers: { reasoning: 2, meta: 3, critique: 2 } as Record<string, number> },
      { id: 'glm', label: 'GLM 5.2 cloud', model: this.config.generalModel, isLocal: false,
        caps: ['general', 'creative', 'reasoning', 'critique'] as Capability[],
        tiers: { general: 3, creative: 3, reasoning: 3, critique: 3 } as Record<string, number> },
      { id: 'qwen', label: 'Qwen 3.5 cloud', model: this.config.consolidationModel, isLocal: false,
        caps: ['consolidation', 'general'] as Capability[],
        tiers: { consolidation: 3, general: 3 } as Record<string, number> },
      { id: 'qwen-vl', label: 'Qwen3 VL local', model: this.config.visionModel, isLocal: true,
        caps: ['vision'] as Capability[],
        tiers: { vision: 2 } as Record<string, number> },
      { id: 'hy3', label: 'Hunyuan hy3:free (Nous)', model: 'tencent/hy3:free', isLocal: false,
        caps: ['general', 'creative', 'reasoning', 'critique'] as Capability[],
        tiers: { general: 1, creative: 2, reasoning: 2, critique: 2 } as Record<string, number> },
    ];

    this.providers = all.map(p => ({
      id: p.id,
      label: p.label,
      model: p.model,
      isLocal: p.isLocal,
      capabilities: p.caps,
      tier: (cap: Capability) => (p.tiers as Record<string, number>)[cap] ?? 3,
    }));
  }

  /**
   * Route la capacite vers le meilleur provider (local-first, par tier).
   */
  private selectModel(mode: CognitiveMode): string {
    const candidates = selectWithFallback(mode, this.providers, this.config.allowCloud);
    if (candidates.length === 0) {
      // fallback ultime: le modele general
      return this.config.generalModel;
    }
    return candidates[0].model;
  }

  /**
   * Pensee unique (single). Avec budget check.
   */
  async think(
    prompt: string,
    mode: CognitiveMode = 'general',
    options: {
      system?: string;
      temperature?: number;
      maxTokens?: number;
      modelOverride?: string;
      strategy?: GenStrategy;
    } = {}
  ): Promise<ModelResponse> {
    const model = options.modelOverride ?? this.selectModel(mode);
    const strategy = options.strategy ?? this.config.strategy;

    // Self-consistency: N tirages + vote (compense les modeles faibles locaux)
    if (strategy === 'selfconsistency' && mode === 'general') {
      return this.thinkSelfConsistency(prompt, mode, options, this.config.nSamples);
    }

    // Budget check
    if (!withinBudget(this.budget, 100, options.maxTokens ?? 2048)) {
      console.warn('[Bridge] Budget epuise, reset.');
      resetBudget(this.budget);
    }

    const request: ModelRequest = {
      model,
      prompt,
      system: options.system,
      temperature: options.temperature ?? 0.7,
      maxTokens: options.maxTokens ?? 2048,
    };

    // Route vers Nous Portal si le modele est heberge sur l'infra Nous (hy3/hunyuan)
    if (NousPortalConnector.handles(model)) {
      const t0 = Date.now();
      const response = await this.nous.generate(request);
      const elapsed = Date.now() - t0;
      charge(this.budget, response.evalCount ?? 100, response.tokensGenerated ?? 100);
      this.callCount.set(mode, (this.callCount.get(mode) ?? 0) + 1);
      this.totalTokens += response.tokensGenerated ?? 0;
      console.log(`[Bridge] ${mode} -> ${model} (NousPortal, ${elapsed}ms, ~${response.tokensGenerated ?? '?'} tok)`);
      return response;
    }

    const t0 = Date.now();
    const response = await this.connector.generate(request);
    const elapsed = Date.now() - t0;

    charge(this.budget, response.evalCount ?? 100, response.tokensGenerated ?? 100);
    this.callCount.set(mode, (this.callCount.get(mode) ?? 0) + 1);
    this.totalTokens += response.tokensGenerated ?? 0;

    console.log(`[Bridge] ${mode} -> ${model} (${elapsed}ms, ~${response.tokensGenerated ?? '?'} tok)`);

    return response;
  }

  /**
   * Self-consistency: N tirages du meme modele, vote de majorite.
   * Compense les hallucinations d'un petit modele local (Qwythos).
   */
  private async thinkSelfConsistency(
    prompt: string,
    mode: CognitiveMode,
    options: { system?: string; temperature?: number; maxTokens?: number; modelOverride?: string },
    n: number
  ): Promise<ModelResponse> {
    const model = options.modelOverride ?? this.selectModel(mode);
    console.log(`[Bridge] Self-consistency x${n} -> ${model}`);

    const drafts: string[] = [];
    let lastResponse: ModelResponse | null = null;

    for (let i = 0; i < n; i++) {
      const t0 = Date.now();
      const response = await this.connector.generate({
        model,
        prompt,
        system: options.system,
        temperature: (options.temperature ?? 0.8) + i * 0.05, // diversite
        maxTokens: options.maxTokens ?? 2048,
      });
      charge(this.budget, response.evalCount ?? 100, response.tokensGenerated ?? 100);
      drafts.push(response.text.trim());
      lastResponse = response;
      console.log(`[Bridge]   draft ${i + 1}/${n} (${Date.now() - t0}ms)`);
    }

    // Vote de majorite: la reponse la plus frequente (normalisee) gagne
    const norm = drafts.map(d => d.replace(/\s+/g, ' ').trim());
    const counts = new Map<string, number>();
    for (const c of norm) counts.set(c, (counts.get(c) ?? 0) + 1);

    let bestIdx = 0;
    let bestCount = -1;
    norm.forEach((v, i) => {
      const c = counts.get(v)!;
      if (c > bestCount) { bestCount = c; bestIdx = i; }
    });

    console.log(`[Bridge] Self-consistency: draft ${bestIdx + 1} gagne (${bestCount}/${n} votes)`);

    return {
      ...lastResponse!,
      text: drafts[bestIdx],
    };
  }

  /**
   * Debate: N modeles produisent, un juge departage.
   * Pour les taches critiques ou un seul modele ne suffit pas.
   */
  async thinkDebate(
    prompt: string,
    mode: CognitiveMode = 'general',
    options: { system?: string; temperature?: number; maxTokens?: number } = {}
  ): Promise<ModelResponse> {
    const candidates = selectWithFallback(mode, this.providers, this.config.allowCloud);
    if (candidates.length < 2) {
      // pas assez de modeles pour debattre, fallback single
      return this.think(prompt, mode, options);
    }

    console.log(`[Bridge] Debate entre ${candidates.length} modeles`);

    // Chaque modele produit un draft
    const drafts: ModelResponse[] = [];
    for (const provider of candidates.slice(0, this.config.nSamples)) {
      const t0 = Date.now();
      const response = await this.connector.generate({
        model: provider.model,
        prompt,
        system: options.system,
        temperature: options.temperature ?? 0.7,
        maxTokens: options.maxTokens ?? 2048,
      });
      charge(this.budget, response.evalCount ?? 100, response.tokensGenerated ?? 100);
      drafts.push(response);
      console.log(`[Bridge]   draft de ${provider.label} (${Date.now() - t0}ms)`);
    }

    // Le juge (capacite critique) score chaque draft
    const scores: number[] = [];
    const judgeModel = this.selectModel('critique');
    for (const draft of drafts) {
      const judgeResponse = await this.connector.generate({
        model: judgeModel,
        prompt: `Note ce draft de 0 a 10. Reponds EXACTEMENT "SCORE: n".\n${draft.text.slice(0, 1000)}`,
        system: 'Tu es un juge critique. Sois strict.',
        temperature: 0.2,
        maxTokens: 50,
      });
      const m = judgeResponse.text.match(/SCORE:\s*(\d+)/i);
      scores.push(m ? Number(m[1]) : 0);
    }

    const winnerIdx = scores.indexOf(Math.max(...scores));
    console.log(`[Bridge] Debate: scores [${scores.join(',')}], gagnant = ${candidates[winnerIdx]?.label}`);

    return drafts[winnerIdx];
  }

  /**
   * Pensee en streaming.
   */
  async *thinkStream(
    prompt: string,
    mode: CognitiveMode = 'general',
    options: { system?: string; temperature?: number; modelOverride?: string } = {}
  ): AsyncGenerator<string> {
    const model = options.modelOverride ?? this.selectModel(mode);
    if (NousPortalConnector.handles(model)) {
      yield* this.nous.generateStream({
        model,
        prompt,
        system: options.system,
        temperature: options.temperature ?? 0.7,
      });
      return;
    }
    yield* this.connector.generateStream({
      model,
      prompt,
      system: options.system,
      temperature: options.temperature ?? 0.7,
    });
  }

  /**
   * Vision: decrit une image via un modele multimodal de l'infra Nous
   * (defaut: openai/gpt-4o-mini, gratuit/rapide, OpenAI-compatible).
   * Lit l'image locale, l'envoie en data URI dans un message multimodal.
   * Pas de modele local lourd requis (contrairement a qwen3-vl:8b qui sature la RAM).
   */
  async vision(imagePath: string, prompt = 'Decris cette image en detail.'): Promise<ModelResponse> {
    const { readFileSync } = await import('fs');
    const { extname } = await import('path');
    const visionModel = this.config.visionModel; // ex: qwen2.5vl:3b (local) ou openai/gpt-4o-mini (Nous)
    const t0 = Date.now();

    // Si le modele est heberge sur l'infra Nous (cloud), on utilise le multimodal Portal.
    // Sinon (modele local Ollama type qwen*), on route vers le connecteur Ollama.
    let response: ModelResponse;
    if (NousPortalConnector.handles(visionModel) && !visionModel.includes('qwen')) {
      const mime = extname(imagePath).toLowerCase() === '.png' ? 'image/png'
        : extname(imagePath).toLowerCase() === '.jpg' || extname(imagePath).toLowerCase() === '.jpeg' ? 'image/jpeg'
        : extname(imagePath).toLowerCase() === '.webp' ? 'image/webp' : 'image/png';
      const b64 = readFileSync(imagePath).toString('base64');
      const dataUri = `data:${mime};base64,${b64}`;
      response = await this.nous.visionMultimodal(visionModel, prompt, dataUri);
    } else {
      const base64 = readFileSync(imagePath).toString('base64');
      response = await this.connector.generateWithImage({
        model: visionModel, imageBase64: base64, prompt,
        temperature: 0.4, maxTokens: 1024,
      });
    }
    const elapsed = Date.now() - t0;
    this.totalTokens += response.tokensGenerated ?? 0;
    console.log(`[Bridge] vision -> ${visionModel} (${elapsed}ms, ~${response.tokensGenerated ?? '?'} tok)`);
    return response;
  }

  getBudget(): Budget { return this.budget; }
  getProviders(): ProviderInfo[] { return this.providers; }

  /** Verifie qu'Ollama est en vie. */
  async ping(): Promise<boolean> {
    return this.connector.ping();
  }

  stats(): Record<string, any> {
    return {
      callsByMode: Object.fromEntries(this.callCount),
      totalTokens: this.totalTokens,
      budget: budgetSummary(this.budget),
      strategy: this.config.strategy,
    };
  }
}