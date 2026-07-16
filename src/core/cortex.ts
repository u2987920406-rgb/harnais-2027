/**
 * Cortex — Le cœur cognitif continu.
 *
 * Pas un routeur. Pas une session. Un PROCESSUS qui pense en continu.
 *
 * Le cortex a 3 modes:
 * 1. AWAKE  — l'utilisateur est là, interagit. Réponse temps réel.
 * 2. IDLE   — pas d'utilisateur, mais le cortex pense en arrière-plan.
 *             Il consolide, explore des hypothèses, anticipe.
 * 3. SLEEP  — consolidation profonde. Comme le sommeil pour le cerveau.
 *
 * La boucle cognitive (tick):
 *   1. Observer — lire l'environnement (input utilisateur? graphe? fichiers?)
 *   2. Évaluer  — quelle est la situation? que faut-il faire?
 *   3. Décider  — allouer le budget cognitif, choisir les processus
 *   4. Agir     — exécuter les processus cognitifs (via le spawner)
 *   5. Apprendre — intégrer les résultats dans le graphe + état
 *   6. Consolider — faire de la place, dégrader le bruit
 */

import { ModelBridge } from '../models/bridge.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { Spawner } from '../cognition/spawner.js';
import { TheoryOfMind } from '../cognition/theory-of-mind.js';
import { Consolidation } from '../memory/consolidation.js';
import { ToolRegistry } from '../tools/registry.js';
import { createFilesystemTools } from '../tools/filesystem.js';
import { createTerminalTools } from '../tools/terminal.js';
import { createWebTools } from '../tools/web.js';
import { createNayaOSTools } from '../tools/nayaos-tools.js';
import { SkillRegistry } from './skill.js';
import { budgetSummary, resetBudget } from './budget.js';
import { makeCompositeVerifier, type Artifact } from '../verify/verifier.js';
import { WorkflowEngine, formatTrace, type WorkflowDef } from './workflow.js';
import { NayaQABridge } from '../bridge/nayaqa.js';
import { NayaOSBridge } from '../bridge/nayaos.js';
import {
  CortexState,
  createInitialState,
  pushToWorkingMemory,
  workingMemoryToContext,
  stateToSummary,
  saveCortexState,
  loadCortexState,
} from './state.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type CortexMode = 'awake' | 'idle' | 'sleep';

export interface CortexConfig {
  tickIntervalMs: number;     // intervalle entre les ticks en mode idle
  idleThoughtInterval: number; // tous les N ticks en idle, on pense
  sleepInterval: number;       // tous les N ticks, on consolide
  maxBackgroundThreads: number;
  statePath: string;
}

const DEFAULT_CONFIG: CortexConfig = {
  tickIntervalMs: 5000,
  idleThoughtInterval: 3,
  sleepInterval: 50,
  maxBackgroundThreads: 5,
  statePath: join(__dirname, '..', '..', 'data', 'cortex-state.json'),
};

export class Cortex {
  private bridge: ModelBridge;
  private _graph: KnowledgeGraph;
  private spawner: Spawner;
  private tom: TheoryOfMind;
  private consolidation: Consolidation;
  private tools: ToolRegistry;
  private _skills: SkillRegistry;
  private verifier: ReturnType<typeof makeCompositeVerifier>;
  private workflowEngine: WorkflowEngine;
  private nayaqa: NayaQABridge;
  private _nayaos: NayaOSBridge;

  /** Acces public en lecture au graphe de connaissance. */
  get graph(): KnowledgeGraph { return this._graph; }
  /** Acces public en lecture au registre de skills. */
  get skills(): SkillRegistry { return this._skills; }
  /** Acces public en lecture au pont NayaOS. */
  get nayaos(): NayaOSBridge { return this._nayaos; }

  state: CortexState;
  config: CortexConfig;
  mode: CortexMode = 'idle';
  private running = false;
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private inputQueue: string[] = [];

  constructor(
    bridge?: ModelBridge,
    graph?: KnowledgeGraph,
    config: Partial<CortexConfig> = {}
  ) {
    this.bridge = bridge ?? new ModelBridge();
    this._graph = graph ?? new KnowledgeGraph();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.spawner = new Spawner(this.bridge, this._graph);
    this.tom = new TheoryOfMind(this.bridge);
    this.consolidation = new Consolidation(this.bridge, this._graph);
    this.state = createInitialState();

    // Pont NayaOS — cree AVANT les outils car les outils NayaOS en dependent
    this._nayaos = new NayaOSBridge(this._graph);

    // Enregistre les outils (filesystem + terminal + web + NayaOS)
    this.tools = new ToolRegistry();
    for (const tool of [
      ...createFilesystemTools(),
      ...createTerminalTools(),
      ...createWebTools(),
      ...createNayaOSTools(this._nayaos),
    ]) {
      this.tools.register(tool);
    }
    this.spawner.setTools(this.tools);

    // Charge les skills
    this._skills = new SkillRegistry();
    this._skills.load();
    this.spawner.setSkills(this._skills);

    // Verifier composable (testgen par defaut, sandbox/vision optionnels)
    this.verifier = makeCompositeVerifier({
      ctx: {},
      useTestgen: true,
      useSandbox: false,
      useVision: false,
    });

    // Workflow engine pour les taches complexes declarees en graphe
    this.workflowEngine = new WorkflowEngine(this.bridge, this.tools, this._graph, this._skills);

    // Pont NayaQA — lit les verdicts et enrichit le graphe
    this.nayaqa = new NayaQABridge(this._graph);
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    this._graph.load();
    this.loadState();
    this.mode = 'idle';

    // verifie qu'Ollama est en vie
    const alive = await this.bridge.ping();
    if (!alive) {
      console.error('[Cortex] Ollama ne repond pas. Demarrage en mode degrade.');
    }

    // verifie si NayaOS est en ligne
    const nayaosAlive = await this._nayaos.ping();
    if (nayaosAlive) {
      console.log('[Cortex] NayaOS detecte en ligne.');
      this._graph.upsertNode('entity', 'NayaOS', { type: 'nayaos', online: true }, 0.9);
    } else {
      console.log('[Cortex] NayaOS hors ligne. Pont disponible en attente.');
    }

    console.log('[Cortex] Initialise. Etat:');
    console.log(stateToSummary(this.state));
    console.log(this._graph.stats());

    // Enregistre soi-meme dans le graphe avec UPSERT (pas de doublons)
    const selfNode = this._graph.upsertNode('entity', 'Harnais-Cortex', {
      type: 'cortex',
      born: this.state.born,
    }, 1.0);
    const rafNode = this._graph.upsertNode('entity', 'Raf', {
      role: 'owner',
      preferences: 'sovereignty, autonomy, no-claude',
    }, 1.0);
    // ne cree l'arete que si elle n'existe pas deja
    const existingEdges = this._graph.getEdges(selfNode.id);
    const hasLink = existingEdges.some(e => e.from === rafNode.id || e.to === rafNode.id);
    if (!hasLink) {
      this._graph.addEdge(selfNode.id, rafNode.id, 'connu', 1.0);
    }
    this._graph.save();
  }

  async start(): Promise<void> {
    this.running = true;
    console.log(`[Cortex] Démarrage. Mode: ${this.mode}. Tick: ${this.config.tickIntervalMs}ms`);
    this.tickLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.tickTimer) clearInterval(this.tickTimer);
    this.saveState();
    this._graph.save();
    console.log('[Cortex] Arrêté. État sauvegardé.');
  }

  // --- Input (from user) ---

  async inject(input: string): Promise<string> {
    this.mode = 'awake';
    this.state.lastInteraction = Date.now();
    this.state.userLastSeen = Date.now();
    this.state.userEngagement = Math.min(1, this.state.userEngagement + 0.3);

    // Reset le budget cognitif pour ce cycle
    resetBudget(this.bridge.getBudget());

    pushToWorkingMemory(this.state, input, 'user_input', 1.0);

    // Theory of Mind: analyse le ton de l'utilisateur
    const tone = await this.tom.analyzeTone(input, this.state);
    this.state.userTone = tone;
    console.log(`[Cortex] Ton utilisateur perçu: ${tone}`);

    // Enregistre l'input dans le graphe
    const inputNode = this._graph.addNode('episode', `User: "${input.slice(0, 80)}"`, {
      fullText: input,
      timestamp: Date.now(),
    }, 0.8);
    const rafNode = this._graph.query({ labelContains: 'Raf' })[0];
    if (rafNode) this._graph.addEdge(rafNode.id, inputNode.id, 'connu', 0.8);

    // Traite l'input
    const response = await this.processInput(input);

    // Enregistre la réponse
    pushToWorkingMemory(this.state, response, 'model_output', 0.9);
    const respNode = this._graph.addNode('episode', `Cortex: "${response.slice(0, 80)}"`, {
      fullText: response,
      timestamp: Date.now(),
    }, 0.7);
    this._graph.addEdge(inputNode.id, respNode.id, 'connu', 0.9);

    this.mode = 'idle';
    return response;
  }

  // --- Core: process user input with tool-calling loop ---

  private async processInput(input: string): Promise<string> {
    const graphContext = this._graph.toContext(15);
    const wmContext = workingMemoryToContext(this.state, 10);
    const stateSummary = stateToSummary(this.state);
    const toolsPrompt = this.tools.toPrompt();

    // Charge les skills pertinents: doctrine par defaut + match par texte
    const doctrineSkills = this._skills.byTags(['doctrine']);
    const textSkills = this._skills.byText(input).filter(s =>
      !doctrineSkills.includes(s) // evite les doublons
    );
    const relevantSkills = [...doctrineSkills, ...textSkills].slice(0, 5);
    const skillsPrompt = this._skills.toPrompt(relevantSkills);

    const systemPrompt = `Tu es le Cortex d'un harnais agentique. Tu n'es pas un chatbot. Tu es un systeme cognitif continu qui pense meme quand l'utilisateur ne parle pas.

Tu as acces a:
- Ton graphe de connaissance (memoire structurelle):
${graphContext}

- Ta memoire de travail (court terme):
${wmContext}

- Ton etat interne:
${stateSummary}

- Tes outils:
${toolsPrompt}
${skillsPrompt ? `\n- Tes skills (connaissances):\n${skillsPrompt}` : ''}

INSTRUCTIONS POUR LES OUTILS:
Si tu veux appeler un outil, reponds EXACTEMENT dans ce format (rien d'autre):
TOOL: nom_de_l_outil
PARAMS: {"param": "valeur"}

Si tu n'as pas besoin d'outil, reponds normalement en francais.
Apres chaque appel d'outil, tu recevras le resultat et pourras continuer.
Tu peux faire jusqu'a 5 appels d'outils consecutifs avant de donner ta reponse finale.

Reponds en francais. Sois direct, profond, pas verbeux.`;

    // Boucle de tool-calling: observe -> decide -> act -> observe resultat -> repeat
    let conversation = input;
    let finalResponse = '';
    const maxRounds = 5;

    for (let round = 0; round < maxRounds; round++) {
      const response = await this.bridge.think(conversation, 'general', {
        system: systemPrompt,
        temperature: 0.7,
        maxTokens: 2048,
      });

      this.state.budgetSpent += response.tokensGenerated ?? 0;
      const text = response.text.trim();

      // Detecte si le modele veut appeler un ou plusieurs outils
      // GLM 5.2 peut mettre plusieurs appels TOOL/PARAMS dans une seule reponse
      const toolMatches = Array.from(text.matchAll(/TOOL:\s*(\w+)\s*\nPARAMS:\s*(\{[\s\S]*?\})/g));

      if (toolMatches.length > 0) {
        // Execute tous les appels d'outils trouves
        const toolResults: string[] = [];

        for (const match of toolMatches) {
          const toolName = match[1];
          let toolParams: Record<string, any>;
          try {
            toolParams = JSON.parse(match[2]);
          } catch {
            toolParams = {};
          }

          console.log(`[Cortex] Appel outil: ${toolName} ${JSON.stringify(toolParams).slice(0, 80)}`);

          const result = await this.tools.execute(toolName, toolParams);
          console.log(`[Cortex] Outil ${toolName}: ${result.success ? 'OK' : 'ECHEC'} (${result.durationMs}ms)`);

          this._graph.addNode('episode', `Action: ${toolName}`, {
            tool: toolName, params: toolParams,
            success: result.success, output: result.output.slice(0, 200),
            timestamp: Date.now(),
          }, 0.6);
          pushToWorkingMemory(this.state, `[outil:${toolName}] ${result.output.slice(0, 200)}`, 'action', 0.8);

          // Verification apres file_write: le fichier est-il sain?
          let verifyNote = '';
          if (toolName === 'file_write' && result.success) {
            const artifacts: Artifact[] = [
              { path: toolParams.path, type: 'code', content: toolParams.content ?? '' },
            ];
            const verdict = await this.verifier.verify(artifacts);
            if (!verdict.ok) {
              verifyNote = `\nVERIFICATION: KO — ${verdict.reasons.join('; ')}. Corrige le fichier.`;
              console.log(`[Cortex] Verification KO: ${verdict.reasons.join('; ')}`);
            } else {
              verifyNote = '\nVERIFICATION: OK — fichier sain.';
            }
          }

          toolResults.push(`Resultat de ${toolName}:\n${result.output.slice(0, 3000)}${verifyNote}`);
        }

        // Injecte tous les resultats dans la conversation pour le prochain round
        conversation = toolResults.join('\n---\n') + '\n\nContinue. Tu peux appeler un autre outil ou donner ta reponse finale.';
      } else {
        // Pas d'appel d'outil = reponse finale
        finalResponse = text;
        break;
      }
    }

    if (!finalResponse) {
      finalResponse = 'J\'ai atteint la limite d\'actions. Voici ce que j\'ai fait:\n' +
        this.state.workingMemory.slice(-3).map(wm => wm.content).join('\n');
    }

    return finalResponse;
  }

  /**
   * Execute un workflow declare en graphe (nodes + edges).
   * Pour les taches complexes qui necessitent un pipeline structure.
   */
  async runWorkflow(def: WorkflowDef, initial: Record<string, unknown> = {}): Promise<string> {
    console.log(`[Cortex] Workflow: ${def.id} (${def.nodes.length} noeuds)`);
    const result = await this.workflowEngine.run(def, initial);
    console.log(formatTrace(result.trace));
    if (!result.ok) {
      return `Workflow echoue: ${result.error}`;
    }
    // Retourne la sortie du dernier noeud
    const lastNode = def.nodes[def.nodes.length - 1];
    return String(result.outputs[lastNode.id] ?? JSON.stringify(result.outputs));
  }

  // --- The cognitive tick loop ---

  private tickLoop = async (): Promise<void> => {
    if (!this.running) return;

    try {
      this.state.cycles++;

      // Détection de mode
      if (this.state.lastInteraction) {
        const sinceInteraction = Date.now() - this.state.lastInteraction;
        if (sinceInteraction > 2 * 60 * 1000) this.mode = 'idle';
        if (sinceInteraction > 10 * 60 * 1000) this.mode = 'sleep';
      }

      switch (this.mode) {
        case 'awake':
          // l'utilisateur est là, on attend son input. tick léger.
          break;
        case 'idle':
          if (this.state.cycles % this.config.idleThoughtInterval === 0) {
            await this.idleThought();
          }
          break;
        case 'sleep':
          if (this.state.cycles % this.config.sleepInterval === 0) {
            await this.sleepCycle();
          }
          break;
      }

      // Sauvegarde périodique
      if (this.state.cycles % 20 === 0) {
        this.saveState();
        this._graph.save();
      }
    } catch (err) {
      console.error('[Cortex] Erreur dans tick:', err);
    }

    // Schedule next tick
    this.tickTimer = setTimeout(this.tickLoop, this.config.tickIntervalMs);
  };

  // --- Idle thought (background cognition) ---

  async idleThought(): Promise<void> {
    console.log(`[Cortex] Pensée de fond #${this.state.cycles} (mode: ${this.mode})`);

    // Le cortex réfléchit en arrière-plan.
    // Il peut: explorer une hypothèse, anticiper une question, consolider un souvenir.

    const graphContext = this._graph.toContext(10);
    const wmContext = workingMemoryToContext(this.state, 5);
    const stateSummary = stateToSummary(this.state);

    const prompt = `Tu es le Cortex en mode arrière-plan. L'utilisateur n'est pas là.
Fais une pensée productive. Options:
1. Explore une hypothèse active ou crées-en une nouvelle
2. Anticipe une question que l'utilisateur pourrait poser
3. Identifie un pattern dans les interactions récentes
4. Note quelque chose d'important que tu as remarqué

État:
${stateSummary}

Mémoire:
${wmContext}

Graphe:
${graphContext}

Réponds en JSON: {"thought": "...", "type": "hypothesis|anticipation|pattern|observation", "action": "create_hypothesis|spawn_thread|consolidate|note"}`;

    try {
      const response = await this.bridge.think(prompt, 'meta', {
        temperature: 0.8,
        maxTokens: 512,
      });

      this.state.lastThought = Date.now();
      this.state.budgetSpent += response.tokensGenerated ?? 0;

      // Parse la pensée
      const thought = this.parseThought(response.text);
      if (thought) {
        pushToWorkingMemory(this.state, thought.thought, 'observation', 0.6);
        console.log(`[Cortex] Pensée (${thought.type}): ${thought.thought.slice(0, 100)}...`);

        // Agit selon le type
        switch (thought.action) {
          case 'create_hypothesis':
            this.state.activeHypotheses.push({
              id: Math.random().toString(20).slice(2),
              text: thought.thought,
              confidence: 0.3,
              evidence: [],
              createdAt: Date.now(),
              lastEvaluated: Date.now(),
            });
            break;
          case 'spawn_thread':
            this.spawnBackgroundThread(thought.thought);
            break;
          case 'consolidate':
            await this.consolidation.consolidate(this.state);
            break;
          case 'note':
            this._graph.addNode('episode', thought.thought, {
              type: 'idle_thought',
              timestamp: Date.now(),
            }, 0.4);
            break;
        }
      }
    } catch (err) {
      console.error('[Cortex] Erreur idle thought:', err);
    }
  }

  // --- Sleep cycle (deep consolidation) ---

  async sleepCycle(): Promise<void> {
    console.log(`[Cortex] === CYCLE DE SOMMEIL #${Math.floor(this.state.cycles / this.config.sleepInterval)} ===`);
    this.mode = 'sleep';
    await this.consolidation.deepConsolidate(this.state);
    console.log('[Cortex] === Fin du cycle de sommeil ===');
  }

  // --- Background threads ---

  private spawnBackgroundThread(topic: string): void {
    if (this.state.backgroundThreads.length >= this.config.maxBackgroundThreads) {
      // remplace le moins prioritaire
      this.state.backgroundThreads.sort((a, b) => b.priority - a.priority);
      this.state.backgroundThreads.pop();
    }
    this.state.backgroundThreads.push({
      id: Math.random().toString(36).slice(2),
      topic,
      thought: topic,
      priority: 0.5,
      createdAt: Date.now(),
      lastUpdate: Date.now(),
      iterations: 0,
    });
    console.log(`[Cortex] Fil de pensée spawn: "${topic.slice(0, 60)}"`);
  }

  // --- Helpers ---

  private parseThought(text: string): { thought: string; type: string; action: string } | null {
    try {
      // essaie de parser le JSON
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        return {
          thought: parsed.thought ?? text,
          type: parsed.type ?? 'observation',
          action: parsed.action ?? 'note',
        };
      }
    } catch {
      // fallback: prend le texte comme pensée brute
    }
    return { thought: text.slice(0, 200), type: 'observation', action: 'note' };
  }

  private loadState(): void {
    this.state = loadCortexState(this.config.statePath);
    console.log(`[Cortex] Etat charge: cycle ${this.state.cycles}, ${this.state.workingMemory.length} items en WM`);
  }

  private saveState(): void {
    saveCortexState(this.state, this.config.statePath);
  }

  // --- Introspection (for debugging / meta-cognition) ---

  async introspect(): Promise<string> {
    const summary = stateToSummary(this.state);
    const graphStats = this._graph.stats();
    const bridgeStats = this.bridge.stats();

    return `=== INTROSPECTION CORTEX ===
${summary}

Graphe: ${JSON.stringify(graphStats)}
Modèles: ${JSON.stringify(bridgeStats, null, 2)}
========================`;
  }
}