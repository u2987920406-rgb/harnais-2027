/**
 * Strategies — Techniques d'egalisation des modeles quantifies.
 *
 * Inspire d'Atlas core/strategies.ts. Adapte au harnais.
 *
 * 1) SELF-CONSISTENCY: N tirages -> vote de majorite.
 *    Annule les hallucinations ponctuelles d'un petit modele local (Qwythos).
 *    Avantage du local: N tentatives a 0 cout.
 *
 * 2) DEBATE: N modeles produisent -> un juge (capacite critique) departage.
 *    Compense la faiblesse d'un seul modele en les faisant competir.
 */

import { OllamaConnector, type ModelResponse } from '../models/ollama.js';
import { selectWithFallback, type Capability, type ProviderInfo } from './router.js';
import { type Budget, withinBudget, charge } from './budget.js';

export type CompleteFn = (
  prompt: string,
  system?: string,
  temperature?: number
) => Promise<ModelResponse>;

// ---- Self-consistency ----

export interface SelfConsistencyResult {
  chosen: ModelResponse;
  candidates: ModelResponse[];
}

/**
 * N tirages du meme modele, vote de majorite sur le contenu normalise.
 * La reponse la plus frequente gagne. Si pas de majorite, la premiere.
 */
export async function selfConsistency(
  complete: CompleteFn,
  prompt: string,
  system: string | undefined,
  n: number,
  baseTemp = 0.7
): Promise<SelfConsistencyResult> {
  const k = Math.max(1, n);
  const candidates: ModelResponse[] = [];

  for (let i = 0; i < k; i++) {
    const response = await complete(prompt, system, baseTemp + i * 0.05);
    candidates.push(response);
  }

  const chosen = majorityPick(candidates);
  return { chosen, candidates };
}

function majorityPick(cands: ModelResponse[]): ModelResponse {
  const norm = cands.map(c => c.text.trim().replace(/\s+/g, ' '));
  const counts = new Map<string, number>();
  norm.forEach(v => counts.set(v, (counts.get(v) ?? 0) + 1));

  let bestIdx = 0;
  let bestCount = -1;
  norm.forEach((v, i) => {
    const c = counts.get(v)!;
    if (c > bestCount) { bestCount = c; bestIdx = i; }
  });

  return cands[bestIdx];
}

// ---- Debate ----

export interface DebateResult {
  winner: ModelResponse;
  scores: number[];
  drafts: ModelResponse[];
}

/**
 * N modeles produisent, un juge (capacite critique) score chaque draft.
 * Le draft avec le meilleur score gagne.
 */
export async function debate(
  connector: OllamaConnector,
  providers: ProviderInfo[],
  judgeModel: string,
  prompt: string,
  system: string | undefined,
  budget: Budget,
  baseTemp = 0.7,
  maxTokens = 2048
): Promise<DebateResult> {
  const drafters = providers.slice(0, Math.max(2, 3));
  const drafts: ModelResponse[] = [];

  for (const provider of drafters) {
    if (!withinBudget(budget, 100, maxTokens)) break;
    const response = await connector.generate({
      model: provider.model,
      prompt,
      system,
      temperature: baseTemp,
      maxTokens,
    });
    charge(budget, response.evalCount ?? 100, response.tokensGenerated ?? 100);
    drafts.push(response);
  }

  // Le juge score chaque draft
  const scores: number[] = [];
  for (const draft of drafts) {
    if (!withinBudget(budget, 100, 50)) { scores.push(0); continue; }
    const judgeResponse = await connector.generate({
      model: judgeModel,
      prompt: `Note ce draft de 0 a 10. Reponds EXACTEMENT "SCORE: n".\n${draft.text.slice(0, 1000)}`,
      system: 'Tu es un juge critique. Sois strict.',
      temperature: 0.2,
      maxTokens: 50,
    });
    charge(budget, judgeResponse.evalCount ?? 50, judgeResponse.tokensGenerated ?? 10);
    const m = judgeResponse.text.match(/SCORE:\s*(\d+)/i);
    scores.push(m ? Number(m[1]) : 0);
  }

  const winnerIdx = scores.indexOf(Math.max(...scores));
  return { winner: drafts[winnerIdx] ?? drafts[0], scores, drafts };
}