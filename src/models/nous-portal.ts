/**
 * NousPortalConnector — Connexion directe a Nous Portal (inference-api.nousresearch.com).
 *
 * Permet a Atlas d'utiliser les modeles cloud de Raf heberges sur son infra Nous
 * (ex: tencent/hy3:free = Hunyuan). OpenAI-compatible chat/completions.
 *
 * Authentification: OAuth Bearer token lu depuis ~/.hermes/auth.json
 * (providers.nous.access_token) OU via la variable d'env NOUS_PORTAL_TOKEN.
 * Refresh best-effort du access_token si expire.
 *
 * Pas de SDK externe. Juste fetch. Souverain (infra Raf).
 */

import { readFileSync, existsSync } from 'fs';

const DEFAULT_INFERENCE_URL = 'https://inference-api.nousresearch.com/v1';
const AUTH_JSON_PATHS = [
  'C:/Users/PC-DELL/AppData/Local/hermes/auth.json',
  process.env.HERMES_HOME ? `${process.env.HERMES_HOME}/auth.json` : '',
  `${process.env.USERPROFILE ?? process.env.HOME ?? ''}/AppData/Local/hermes/auth.json`,
].filter(Boolean);

export interface ModelRequest {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  maxTokens?: number;
  context?: number[];
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

interface NousAuthState {
  accessToken: string;
  refreshToken: string;
  inferenceBaseUrl: string;
  portalBaseUrl: string;
  expiresAt: number; // epoch ms
}

/**
 * Lit l'etat d'auth Nous depuis auth.json (ecrit par Hermes CLI).
 */
function readNousAuth(): NousAuthState | null {
  for (const path of AUTH_JSON_PATHS) {
    try {
      if (!existsSync(path)) continue;
      const raw = JSON.parse(readFileSync(path, 'utf8'));
      const nous = raw.providers?.nous ?? raw.nous;
      if (!nous?.access_token) continue;
      return {
        accessToken: nous.access_token,
        refreshToken: nous.refresh_token ?? '',
        inferenceBaseUrl: nous.inference_base_url ?? DEFAULT_INFERENCE_URL,
        portalBaseUrl: nous.portal_base_url ?? 'https://portal.nousresearch.com',
        expiresAt: nous.expires_at ? new Date(nous.expires_at).getTime() : 0,
      };
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Tente de rafraichir le access_token via le refresh_token OAuth.
 * Best-effort: retourne null si echec (on garde l'ancien token).
 */
async function refreshNousToken(auth: NousAuthState): Promise<string | null> {
  if (!auth.refreshToken) return null;
  try {
    const res = await fetch(`${auth.portalBaseUrl}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: auth.refreshToken,
      }),
    });
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.access_token ?? null;
  } catch {
    return null;
  }
}

export class NousPortalConnector {
  private model: string;
  private auth: NousAuthState | null = null;
  private tokenOverride: string | null = null;

  constructor(model = 'tencent/hy3:free') {
    this.model = model;
    // Token explicite via env (prioritaire)
    this.tokenOverride = process.env.NOUS_PORTAL_TOKEN ?? null;
    if (!this.tokenOverride) {
      this.auth = readNousAuth();
      // Refresh best-effort au demarrage si expire bientot
      if (this.auth && this.auth.expiresAt && Date.now() > this.auth.expiresAt - 120_000) {
        refreshNousToken(this.auth).then((t) => { if (t) this.auth!.accessToken = t; }).catch(() => {});
      }
    }
  }

  async ping(): Promise<boolean> {
    const token = this.resolveToken();
    if (!token) return false;
    try {
      const base = this.auth?.inferenceBaseUrl ?? DEFAULT_INFERENCE_URL;
      const res = await fetch(`${base}/models`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private resolveToken(): string | null {
    if (this.tokenOverride) return this.tokenOverride;
    if (!this.auth) return null;
    return this.auth.accessToken;
  }

  private baseUrl(): string {
    return this.auth?.inferenceBaseUrl ?? DEFAULT_INFERENCE_URL;
  }

  /** Vrai si ce connecteur doit gerer ce modele (texte OU vision Nous). */
  static handles(model: string): boolean {
    const m = model.toLowerCase();
    return m.includes('hy3') || m.includes('hunyuan') || m.includes('nous')
      || m.startsWith('tencent/') || m.includes('gpt-4o') || m.includes('gemini')
      || m.includes('qwen') || m.includes('ministral');
  }

  /**
   * Vision multimodale: envoie une image (data URI) + prompt a un modele
   * vision de l'infra Nous (OpenAI-compatible, content multimodal).
   */
  async visionMultimodal(model: string, prompt: string, imageDataUri: string): Promise<ModelResponse> {
    const token = this.resolveToken();
    if (!token) throw new Error('NousPortal: token manquant (login Hermes ou NOUS_PORTAL_TOKEN)');
    const body: any = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: imageDataUri } },
          ],
        },
      ],
      temperature: 0.4,
      max_tokens: 1024,
      stream: false,
    };
    const res = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`NousPortal vision HTTP ${res.status}: ${err.slice(0, 200)}`);
    }
    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};
    return {
      text,
      model: data.model ?? model,
      tokensGenerated: usage.completion_tokens ?? text.length / 4,
      evalCount: usage.prompt_tokens ?? 0,
      done: true,
    };
  }

  async generate(req: ModelRequest): Promise<ModelResponse> {
    const token = this.resolveToken();
    if (!token) throw new Error('NousPortal: token manquant (login Hermes ou NOUS_PORTAL_TOKEN)');

    const model = NousPortalConnector.handles(req.model) ? req.model : this.model;
    const body: any = {
      model,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.prompt },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
      stream: false,
    };

    const res = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`NousPortal HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    const data: any = await res.json();
    const text = data.choices?.[0]?.message?.content ?? '';
    const usage = data.usage ?? {};

    return {
      text,
      model: data.model ?? model,
      tokensGenerated: usage.completion_tokens ?? text.length / 4,
      evalCount: usage.prompt_tokens ?? 0,
      done: true,
    };
  }

  async *generateStream(req: ModelRequest): AsyncGenerator<string> {
    const token = this.resolveToken();
    if (!token) throw new Error('NousPortal: token manquant');

    const model = NousPortalConnector.handles(req.model) ? req.model : this.model;
    const body: any = {
      model,
      messages: [
        ...(req.system ? [{ role: 'system', content: req.system }] : []),
        { role: 'user', content: req.prompt },
      ],
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 2048,
      stream: true,
    };

    const res = await fetch(`${this.baseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) throw new Error(`NousPortal stream HTTP ${res.status}`);

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
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') return;
        try {
          const json = JSON.parse(payload);
          const delta = json.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // chunk incomplet
        }
      }
    }
  }
}
