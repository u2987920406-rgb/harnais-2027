/**
 * Mock du ModelBridge pour les tests — pas d'appel reseau/Ollama.
 * Retourne des reponses canned deterministes selon un routeur de reponses.
 */
import type { ModelBridge, CognitiveMode } from '../src/models/bridge.js';

export interface MockCall {
  prompt: string;
  mode: CognitiveMode;
  options: any;
}

/**
 * Cree un faux ModelBridge. `responder` decide du texte retourne selon
 * le prompt et le mode. Les appels sont enregistres dans `calls`.
 */
export function makeMockBridge(
  responder: (prompt: string, mode: CognitiveMode) => string
): ModelBridge & { calls: MockCall[] } {
  const calls: MockCall[] = [];
  const bridge: any = {
    calls,
    async think(prompt: string, mode: CognitiveMode = 'general', options: any = {}) {
      calls.push({ prompt, mode, options });
      const text = responder(prompt, mode);
      return {
        text,
        model: 'mock',
        tokensGenerated: text.length,
        evalCount: text.length,
        promptTokens: prompt.length,
        totalDurationMs: 1,
      };
    },
    async ping() { return true; },
    getBudget() { return {}; },
    getProviders() { return []; },
    stats() { return { mock: true }; },
  };
  return bridge as ModelBridge & { calls: MockCall[] };
}
