/**
 * CortexState — L'état mental persistant du Cortex.
 *
 * Ce n'est pas une session. C'est un ÉTAT.
 * Le cortex maintient cet état entre les interactions, pendant le sommeil,
 * pendant la consolidation. Il ne repart jamais de zéro.
 *
 * L'état a plusieurs couches:
 * - currentFocus: ce sur quoi le cortex est en train de réfléchir
 * - activeHypotheses: idées en cours d'évaluation
 * - emotionalTone: ton émotionnel perçu (influx d'info de l'utilisateur)
 * - pendingQuestions: questions que le cortex se pose en arrière-plan
 * - workingMemory: le buffer à court terme, volatile mais riche
 * - backgroundThreads: fils de pensée en arrière-plan
 * - lastInteraction: timestamp de la dernière interaction utilisateur
 * - cognitiveBudget: budget de compute alloué pour le cycle actuel
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';

export type EmotionalTone =
  | 'neutral'
  | 'curious'
  | 'focused'
  | 'frustrated'
  | 'excited'
  | 'tired'
  | 'thinking';

export interface Hypothesis {
  id: string;
  text: string;
  confidence: number;    // 0..1
  evidence: string[];     // faits qui supportent/contredisent
  createdAt: number;
  lastEvaluated: number;
}

export interface BackgroundThread {
  id: string;
  topic: string;
  thought: string;
  priority: number;      // 0..1
  createdAt: number;
  lastUpdate: number;
  iterations: number;
}

export interface WorkingMemoryItem {
  id: string;
  content: string;
  type: 'observation' | 'decision' | 'action' | 'user_input' | 'model_output';
  timestamp: number;
  relevance: number;  // 0..1, décline avec le temps
}

export interface CortexState {
  // Identité
  born: number;
  cycles: number;          // nombre de cycles cognitifs effectués
  lastInteraction: number | null;
  lastThought: number | null;

  // Attention
  currentFocus: string | null;
  focusIntensity: number;  // 0..1 — combien le cortex est "concentré"

  // Cognition
  activeHypotheses: Hypothesis[];
  pendingQuestions: string[];
  workingMemory: WorkingMemoryItem[];

  // Arrière-plan
  backgroundThreads: BackgroundThread[];

  // Modèle de l'utilisateur (Theory of Mind)
  userTone: EmotionalTone;
  userEngagement: number;  // 0..1
  userLastSeen: number | null;

  // Économie cognitive
  cognitiveBudget: number;  // tokens/compute disponible pour ce cycle
  budgetSpent: number;

  // Méta
  introspectionLog: string[];  // dernières pensées introspectives
  selfModifications: number;    // combien de fois le cortex s'est modifié
}

export function createInitialState(): CortexState {
  const now = Date.now();
  return {
    born: now,
    cycles: 0,
    lastInteraction: null,
    lastThought: null,

    currentFocus: null,
    focusIntensity: 0,

    activeHypotheses: [],
    pendingQuestions: [],
    workingMemory: [],

    backgroundThreads: [],

    userTone: 'neutral',
    userEngagement: 0,
    userLastSeen: null,

    cognitiveBudget: 4096,
    budgetSpent: 0,

    introspectionLog: [],
    selfModifications: 0,
  };
}

/**
 * Ajoute un item en mémoire de travail et fait de la place si nécessaire.
 * La working memory est un buffer borné — pas un context window infini.
 */
export function pushToWorkingMemory(
  state: CortexState,
  content: string,
  type: WorkingMemoryItem['type'],
  relevance = 0.8,
  maxItems = 50
): void {
  const item: WorkingMemoryItem = {
    id: Math.random().toString(36).slice(2),
    content,
    type,
    timestamp: Date.now(),
    relevance,
  };
  state.workingMemory.push(item);

  // decay: réduit la relevance des anciens items
  const now = Date.now();
  for (const wm of state.workingMemory) {
    const age = now - wm.timestamp;
    wm.relevance = Math.max(0, wm.relevance - age / (1000 * 60 * 30)); // decay sur 30min
  }

  // evict: garde seulement les maxItems plus pertinents
  if (state.workingMemory.length > maxItems) {
    state.workingMemory.sort((a, b) => b.relevance - a.relevance);
    state.workingMemory = state.workingMemory.slice(0, maxItems);
  }
}

/**
 * Sérialise la working memory en texte pour injection dans un prompt.
 */
export function workingMemoryToContext(state: CortexState, maxItems = 15): string {
  const sorted = [...state.workingMemory]
    .sort((a, b) => b.relevance - a.relevance)
    .slice(0, maxItems);
  if (sorted.length === 0) return '[mémoire de travail vide]';
  return sorted.map(wm =>
    `[${wm.type}] ${wm.content} (rel=${wm.relevance.toFixed(2)})`
  ).join('\n');
}

/**
 * Sauvegarde l'état sur disque, protegee par un lock file
 * (evite la corruption si deux instances tournent en meme temps).
 */
export function saveCortexState(state: CortexState, path: string): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  // Hard cap sur le budget avant sauvegarde
  if (state.budgetSpent > state.cognitiveBudget) {
    state.budgetSpent = state.cognitiveBudget;
  }

  const lockPath = path + '.lock';
  if (existsSync(lockPath)) {
    const lockAge = Date.now() - parseInt(readFileSync(lockPath, 'utf-8'), 10);
    if (lockAge < 5000) {
      console.warn('[State] Lock file detecte, ecriture annulee');
      return;
    }
  }
  writeFileSync(lockPath, String(Date.now()));
  writeFileSync(path, JSON.stringify(state, null, 2));
  try { unlinkSync(lockPath); } catch { /* lock deja supprime */ }
}

/**
 * Charge l'état depuis le disque. Retourne un état initial si absent
 * ou corrompu. Le budget cognitif est toujours remis a zero au chargement
 * (pas d'accumulation inter-sessions).
 */
export function loadCortexState(path: string): CortexState {
  const initial = createInitialState();
  if (!existsSync(path)) return initial;

  try {
    const raw = readFileSync(path, 'utf-8');
    const loaded = JSON.parse(raw);

    // Merge profond: les tableaux et objets sont fusionnes, pas ecrases
    const merged: CortexState = {
      ...initial,
      ...loaded,
      activeHypotheses: loaded.activeHypotheses ?? initial.activeHypotheses,
      pendingQuestions: loaded.pendingQuestions ?? initial.pendingQuestions,
      workingMemory: loaded.workingMemory ?? initial.workingMemory,
      backgroundThreads: loaded.backgroundThreads ?? initial.backgroundThreads,
      introspectionLog: loaded.introspectionLog ?? initial.introspectionLog,
      // Budget: reset a chaque demarrage
      cognitiveBudget: initial.cognitiveBudget,
      budgetSpent: 0,
    };

    // Hard cap sur la working memory: pas plus de 50 items au chargement
    if (merged.workingMemory.length > 50) {
      merged.workingMemory.sort((a, b) => b.relevance - a.relevance);
      merged.workingMemory = merged.workingMemory.slice(0, 50);
    }

    return merged;
  } catch (err) {
    console.error('[State] Erreur chargement etat:', err);
    return initial;
  }
}

/**
 * Sérialise l'état global pour introspection.
 */
export function stateToSummary(state: CortexState): string {
  return [
    `Cycle: ${state.cycles}`,
    `Focus: ${state.currentFocus ?? 'aucun'} (intensité=${state.focusIntensity.toFixed(2)})`,
    `Hypothèses actives: ${state.activeHypotheses.length}`,
    `Questions en attente: ${state.pendingQuestions.length}`,
    `Mémoire de travail: ${state.workingMemory.length} items`,
    `Fils de pensée: ${state.backgroundThreads.length}`,
    `Tonalité utilisateur: ${state.userTone} (engagement=${state.userEngagement.toFixed(2)})`,
    `Budget cognitif: ${state.budgetSpent}/${state.cognitiveBudget}`,
    `Modifications propres: ${state.selfModifications}`,
  ].join('\n');
}