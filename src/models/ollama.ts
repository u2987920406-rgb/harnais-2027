/**
 * OllamaConnector — Connexion directe à Ollama.
 *
 * Parle au daemon Ollama local via HTTP (http://localhost:11434).
 * Supporte les modèles locaux ET les modèles cloud routés par Ollama
 * (qwen3.5:cloud, glm-5.2:cloud).
 *
 * Pas de SDK externe. Juste fetch. Souverain.
 */

import { setTimeout as sleep } from 'timers/promises';

const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';

export interface ModelRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  context?: number[]; // context window d'Ollama (token IDs)
}

export interface ModelResponse {
  text: string;
  model: string;
  tokensGenerated?: number;
  evalCount?: number;
  evalDuration?: number;
  context?: number[];
  done: boolean;
}

export class OllamaConnector {
  private url: string;

  constructor(url?: string) {
    this.url = url ?? OLLAMA_URL;
  }

  /**
   * Vérifie qu'Ollama est en vie.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.url}/api/tags`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Génère une réponse (mode batch).
   */
  async generate(req: ModelRequest): Promise<ModelResponse> {
    const body = {
      model: req.model,
      prompt: req.prompt,
      system: req.system,
      stream: false,
      options: {
        temperature: req.temperature ?? 0.7,
        num_predict: req.maxTokens ?? 2048,
      },
      context: req.context,
    };

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch(`${this.url}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          throw new Error(`Ollama HTTP ${res.status}: ${await res.text()}`);
        }

        const data: any = await res.json();
        return {
          text: data.response ?? '',
          model: data.model,
          tokensGenerated: data.eval_count,
          evalCount: data.eval_count,
          evalDuration: data.eval_duration,
          context: data.context,
          done: data.done ?? true,
        };
      } catch (err: any) {
        lastError = err;
        console.error(`[Ollama] Tentative ${attempt + 1} échouée: ${err.message}`);
        await sleep(1000 * (attempt + 1));
      }
    }

    throw lastError ?? new Error('Ollama generate failed');
  }

  /**
   * Génère en streaming (yield token par token).
   */
  async *generateStream(req: ModelRequest): AsyncGenerator<string> {
    const body = {
      model: req.model,
      prompt: req.prompt,
      system: req.system,
      stream: true,
      options: {
        temperature: req.temperature ?? 0.7,
        num_predict: req.maxTokens ?? 2048,
      },
      context: req.context,
    };

    const res = await fetch(`${this.url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream HTTP ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.response) yield json.response;
          if (json.done) return;
        } catch {
          // ligne incomplète, on continue
        }
      }
    }
  }

  /**
   * Liste les modèles disponibles.
   */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(`${this.url}/api/tags`);
      if (!res.ok) return [];
      const data: any = await res.json();
      return (data.models ?? []).map((m: any) => m.name);
    } catch {
      return [];
    }
  }
}