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
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname } from 'path';

export interface UserProfile {
  tone: EmotionalTone;
  engagement: number;
  preferences: string[];
  predictedNeeds: string[];
  workStyle: string;
  frustrationLevel: number;
  lastUpdated: number;
  // Densification: historique de tons + comptage de sujets pour inferer les preferences
  toneHistory?: EmotionalTone[];
  topicCounts?: Record<string, number>;
  interactions?: number;
}

export class TheoryOfMind {
  private bridge: ModelBridge;
  private profile: UserProfile;
  private persistPath: string | null;

  constructor(bridge: ModelBridge, persistPath?: string) {
    this.bridge = bridge;
    this.persistPath = persistPath ?? null;
    this.profile = this.persistPath && existsSync(this.persistPath)
      ? this.loadProfile(this.persistPath)
      : {
          tone: 'neutral',
          engagement: 0,
          preferences: [],
          predictedNeeds: [],
          workStyle: 'unknown',
          frustrationLevel: 0,
          lastUpdated: 0,
          toneHistory: [],
          topicCounts: {},
          interactions: 0,
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

    // Densification: historique de tons (borne a 20)
    this.profile.toneHistory = [...(this.profile.toneHistory ?? []), tone].slice(-20);
    this.profile.interactions = (this.profile.interactions ?? 0) + 1;

    // Densification: inference du workStyle a partir du niveau de detail
    if (detailLevel === 'high') this.profile.workStyle = 'detailed';
    else if (detailLevel === 'low' && questionCount === 0) this.profile.workStyle = 'terse';
    else if (questionCount >= 2) this.profile.workStyle = 'inquisitive';

    // Densification: inference des preferences implicites (heuristique, zero token)
    this.inferPreferences(message);

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

  /**
   * Infère des préférences implicites depuis le contenu du message.
   * Heuristique — zéro token. Ajoute sans doublon, borne à 10.
   */
  private inferPreferences(message: string): void {
    const m = message.toLowerCase();
    const prefs = new Set(this.profile.preferences);
    const signals: [RegExp, string][] = [
      [/\b(concis|court|bref|rapide|direct)\b/, 'reponses concises'],
      [/\b(detail|precis|explique|comment|pourquoi)\b/, 'explications detaillees'],
      [/\b(code|exemple|snippet|montre)\b/, 'exemples de code'],
      [/\b(fran[cç]ais)\b/, 'francais'],
      [/\b(git|commit|push|pr)\b/, 'workflow git'],
      [/\b(test|verifie|build)\b/, 'verification systematique'],
      [/\b(autonom|tout seul|debrouille|continue)\b/, 'autonomie'],
    ];
    for (const [re, pref] of signals) if (re.test(m)) prefs.add(pref);
    this.profile.preferences = Array.from(prefs).slice(0, 10);
  }

  /**
   * Retourne le ton dominant sur l'historique récent (mode statistique).
   */
  dominantTone(): EmotionalTone {
    const hist = this.profile.toneHistory ?? [];
    if (hist.length === 0) return this.profile.tone;
    const counts = new Map<EmotionalTone, number>();
    for (const t of hist) counts.set(t, (counts.get(t) ?? 0) + 1);
    let best: EmotionalTone = this.profile.tone;
    let bestC = -1;
    for (const [t, c] of Array.from(counts.entries())) if (c > bestC) { bestC = c; best = t; }
    return best;
  }

  /**
   * Synchronise le modèle utilisateur vers le CortexState (source de vérité partagée).
   */
  syncToState(state: CortexState): void {
    state.userTone = this.profile.tone;
    state.userEngagement = this.profile.engagement;
    state.userLastSeen = this.profile.lastUpdated || Date.now();
  }

  /**
   * Persiste le profil sur disque (si un chemin a été fourni au constructeur).
   */
  save(): void {
    if (!this.persistPath) return;
    const dir = dirname(this.persistPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(this.persistPath, JSON.stringify(this.profile, null, 2));
  }

  /**
   * Charge un profil depuis le disque. Fusionne avec les valeurs par défaut.
   */
  private loadProfile(path: string): UserProfile {
    try {
      const loaded = JSON.parse(readFileSync(path, 'utf-8'));
      return {
        tone: loaded.tone ?? 'neutral',
        engagement: loaded.engagement ?? 0,
        preferences: loaded.preferences ?? [],
        predictedNeeds: loaded.predictedNeeds ?? [],
        workStyle: loaded.workStyle ?? 'unknown',
        frustrationLevel: loaded.frustrationLevel ?? 0,
        lastUpdated: loaded.lastUpdated ?? 0,
        toneHistory: loaded.toneHistory ?? [],
        topicCounts: loaded.topicCounts ?? {},
        interactions: loaded.interactions ?? 0,
      };
    } catch {
      return {
        tone: 'neutral', engagement: 0, preferences: [], predictedNeeds: [],
        workStyle: 'unknown', frustrationLevel: 0, lastUpdated: 0,
        toneHistory: [], topicCounts: {}, interactions: 0,
      };
    }
  }
}