/**
 * TheoryOfMind — Le modèle que le cortex construit de l'utilisateur.
 *
 * L'agent ne traite pas avec un prompt. Il traite avec un MODÈLE de l'utilisateur.
 *
 * Ce module:
 * - Analyse le ton émotionnel de chaque message
 * - Détecte le niveau d'engagement
 * - Identifie les préférences implicites
 * - Prédit les réactions probables
 * - Calibre le comportement du cortex selon ce modèle
 *
 * Pas de questions explicites. L'observation émerge de l'interaction.
 */

import { ModelBridge } from '../models/bridge.js';
import { CortexState, EmotionalTone } from '../core/state.js';

export interface UserProfile {
  tone: EmotionalTone;
  engagement: number;
  preferences: string[];
  predictedNeeds: string[];
  workStyle: string;
  frustrationLevel: number;
  lastUpdated: number;
}

export class TheoryOfMind {
  private bridge: ModelBridge;
  private profile: UserProfile;

  constructor(bridge: ModelBridge) {
    this.bridge = bridge;
    this.profile = {
      tone: 'neutral',
      engagement: 0,
      preferences: [],
      predictedNeeds: [],
      workStyle: 'unknown',
      frustrationLevel: 0,
      lastUpdated: 0,
    };
  }

  /**
   * Analyse le ton émotionnel d'un message utilisateur.
   * Utilise le modèle pour inférer l'état émotionnel — pas des règles regex.
   */
  async analyzeTone(message: string, state?: CortexState): Promise<EmotionalTone> {
    // heuristique rapide d'abord (pas de token dépensé)
    const quickTone = this.quickTone(message);
    if (quickTone) return quickTone;

    // sinon, demande au modèle
    try {
      const response = await this.bridge.think(
        `Analyse le ton émotionnel de ce message. Réponds avec UN seul mot parmi: neutral, curious, focused, frustrated, excited, tired, thinking.\n\nMessage: "${message}"`,
        'general',
        { temperature: 0.2, maxTokens: 20 }
      );
      const tone = response.text.trim().toLowerCase() as EmotionalTone;
      const valid: EmotionalTone[] = ['neutral', 'curious', 'focused', 'frustrated', 'excited', 'tired', 'thinking'];
      return valid.includes(tone) ? tone : 'neutral';
    } catch {
      return 'neutral';
    }
  }

  /**
   * Heuristique rapide pour le ton — zéro coût en tokens.
   */
  private quickTone(message: string): EmotionalTone | null {
    const m = message.toLowerCase();
    if (m.includes('!') && m.length < 100) return 'excited';
    if (m.includes('???') || m.includes('comprends pas') || m.includes('marche pas')) return 'frustrated';
    if (m.includes('?') && m.length < 50) return 'curious';
    if (m.split('\n').length > 3) return 'focused';
    if (m.length < 20 && m.endsWith('.')) return 'tired';
    return null;
  }

  /**
   * Met à jour le profil utilisateur basé sur l'observation continue.
   */
  async updateProfile(message: string, state: CortexState): Promise<UserProfile> {
    // ajuste l'engagement
    const length = message.length;
    const questionCount = (message.match(/\?/g) ?? []).length;
    const detailLevel = length > 200 ? 'high' : length > 50 ? 'medium' : 'low';

    // engagement: plus de détails = plus d'engagement
    this.profile.engagement = Math.min(1, this.profile.engagement * 0.8 + (length / 500) * 0.2);

    // frustration: détecte les signaux
    if (message.includes('pas') || message.includes('non') || message.includes('arrête')) {
      this.profile.frustrationLevel = Math.min(1, this.profile.frustrationLevel + 0.2);
    } else {
      this.profile.frustrationLevel = Math.max(0, this.profile.frustrationLevel - 0.05);
    }

    // Prédit les besoins probables
    const tone = await this.analyzeTone(message, state);
    this.profile.tone = tone;

    if (tone === 'frustrated') {
      this.profile.predictedNeeds = ['clarity', 'simplicity', 'results'];
    } else if (tone === 'excited') {
      this.profile.predictedNeeds = ['depth', 'creativity', 'possibilities'];
    } else if (tone === 'tired') {
      this.profile.predictedNeeds = ['conciseness', 'directness'];
    } else {
      this.profile.predictedNeeds = ['accuracy', 'structure'];
    }

    this.profile.lastUpdated = Date.now();
    return this.profile;
  }

  /**
   * Calibre le comportement du cortex selon le profil.
   * Retourne des directives de style pour la réponse.
   */
  calibrateResponse(): { temperature: number; maxTokens: number; style: string } {
    const p = this.profile;
    let style = 'direct, précis, en français';
    let temperature = 0.7;
    let maxTokens = 2048;

    if (p.frustrationLevel > 0.5) {
      style = 'très direct, concret, pas de théorie, des résultats';
      temperature = 0.3;
      maxTokens = 1024;
    } else if (p.tone === 'excited') {
      style = 'enthousiaste, explore les possibilités, sois audacieux';
      temperature = 0.9;
    } else if (p.tone === 'tired') {
      style = 'très concis, pas de bla bla, droit au but';
      maxTokens = 512;
    } else if (p.tone === 'focused') {
      style = 'structuré, détaillé, méthodique';
      temperature = 0.4;
    }

    return { temperature, maxTokens, style };
  }

  getProfile(): UserProfile {
    return { ...this.profile };
  }

  toContext(): string {
    const p = this.profile;
    return `[Modèle utilisateur] ton=${p.tone}, engagement=${p.engagement.toFixed(2)}, frustration=${p.frustrationLevel.toFixed(2)}, besoins=${p.predictedNeeds.join(', ')}`;
  }
}