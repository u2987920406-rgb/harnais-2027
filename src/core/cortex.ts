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

import { ModelBridge, type GenStrategy } from '../models/bridge.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';
import { Spawner } from '../cognition/spawner.js';
import { TheoryOfMind } from '../cognition/theory-of-mind.js';
import { Consolidation } from '../memory/consolidation.js';
import { ToolRegistry } from '../tools/registry.js';
import { createFilesystemTools } from '../tools/filesystem.js';
import { createTerminalTools } from '../tools/terminal.js';
import { createWebTools } from '../tools/web.js';
import { createVisionTools } from '../tools/vision.js';
import { createSpeechTools } from '../tools/speech.js';
import { createBrowserTools } from '../tools/browser.js';
import { createNayaOSTools } from '../tools/nayaos-tools.js';
import { SkillRegistry } from './skill.js';
import { budgetSummary, resetBudget } from './budget.js';
import { makeCompositeVerifier, type Artifact } from '../verify/verifier.js';
import { WorkflowEngine, formatTrace, type WorkflowDef } from './workflow.js';
import { NayaQABridge } from '../bridge/nayaqa.js';
import { NayaOSBridge } from '../bridge/nayaos.js';
import { UIServer } from '../ui/server.js';
import {
  CortexState,
  type BackgroundThread,
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
  private _ui: UIServer | null = null;

  /** Acces public en lecture au graphe de connaissance. */
  get graph(): KnowledgeGraph { return this._graph; }
  /** Acces public en lecture au registre de skills. */
  get skills(): SkillRegistry { return this._skills; }
  /** Acces public en lecture au pont NayaOS. */
  get nayaos(): NayaOSBridge { return this._nayaos; }

  /** Demarre le serveur UI (dashboard web). */
  async startUI(port = 7891, host = '127.0.0.1'): Promise<string> {
    this._ui = new UIServer(this, { port, host });
    await this._ui.start();
    return this._ui.url;
  }

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

    // Enregistre les outils (filesystem + terminal + web + vision + NayaOS)
    this.tools = new ToolRegistry();
    for (const tool of [
      ...createFilesystemTools(),
      ...createTerminalTools(),
      ...createWebTools(),
      ...createVisionTools(),
      ...createSpeechTools(),
      ...createBrowserTools(),
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
    await this.loadState();   // IMPORTANT: attendre le chargement de l'état (sinon race avec l'UI)
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
    if (this._ui) await this._ui.stop();
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

  // --- Core: process user input with planning + tool-calling loop ---

  /**
   * Detecte si une tache est complexe (multi-etapes, decomposition beneficial).
   * Heuristique: longueur, mots-cles de tache complexe, demande explicite.
   */
  private isComplexTask(input: string): boolean {
    const complexSignals = [
      /\b(analyse|compare|refactor|restructure|planifie|orchestre|build|construis|implemente|migr|integre)\b/i,
      /\b(etapes?|etapes?|phases?|modules?|composants?)\b/i,
      /\b(d['e]abord|puis|ensuite|enfin|parallèle|séquence)\b/i,
    ];
    const signalCount = complexSignals.filter(re => re.test(input)).length;
    return input.length > 150 || signalCount >= 2;
  }

  /**
   * Phase PLAN: decompose la tache en sous-processus via le spawner,
   * puis execute en pipeline ou parallele selon les dependances.
   */
  private async planAndExecute(input: string, systemPrompt: string): Promise<string | null> {
    if (!this.isComplexTask(input)) return null;

    console.log('[Cortex] Tache complexe detectee — decomposition...');
    const configs = await this.spawner.planDecomposition(input, workingMemoryToContext(this.state, 5));

    if (configs.length <= 1) return null; // pas besoin de decomposer

    console.log(`[Cortex] ${configs.length} sous-processus planifies: ${configs.map(c => c.role).join(', ')}`);

    // Detecte les dependances: si les roles sont sequentiels (architecte -> codeur -> critique),
    // on fait un pipeline. Sinon, parallele.
    const pipelineKeywords = ['architecte', 'plan', 'codeur', 'critique', 'verifie', 'test'];
    const isPipeline = configs.every((c, i) =>
      i === 0 || pipelineKeywords.some(kw => c.role.toLowerCase().includes(kw))
    );

    const results = isPipeline
      ? await this.spawner.spawnPipeline(configs)
      : await this.spawner.spawnParallel(configs);

    // Synthese: combine les resultats des sous-agents
    const successResults = results.filter(r => r.success);
    if (successResults.length === 0) return null;

    // Enregistre chaque resultat dans le graphe
    for (const r of successResults) {
      pushToWorkingMemory(this.state, `[${r.role}] ${r.output.slice(0, 200)}`, 'decision', 0.8);
    }

    // Demande au cortex de synthetiser les resultats
    const synthesisPrompt = `Tu es le Cortex. ${successResults.length} sous-agents ont travaille sur la tache.
Synthetise leurs resultats en une reponse coherente pour l'utilisateur.

Tache originale: ${input}

Resultats des sous-agents:
${successResults.map(r => `--- ${r.role} ---\n${r.output.slice(0, 1000)}`).join('\n\n')}

Reponds en francais. Sois direct et synthetique.`;

    const synthResponse = await this.bridge.think(synthesisPrompt, 'general', {
      system: systemPrompt,
      temperature: 0.5,
      maxTokens: 2048,
    });
    this.state.budgetSpent += synthResponse.tokensGenerated ?? 0;

    return synthResponse.text;
  }

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

    // Skills STRICTES: contraintes OBLIGATOIRES injectees dans le system prompt.
    // Contrairement aux skills soft (suggestions contextuelles), celles-ci
    // lient le modele — il doit les respecter a chaque reponse.
    const strictSkills = this._skills.strictSkills();
    const strictPrompt = strictSkills.length
      ? strictSkills.map(s => `## CONTRAINTE STRICTE [${s.name}]:\n${s.body}`).join('\n\n')
      : '';

    // Calibration TOM: ajuste temperature/maxTokens/style selon le profil utilisateur
    const tomCalibration = this.tom.calibrateResponse();
    const tomContext = this.tom.toContext();

    const systemPrompt = `Tu es le Cortex d'un harnais agentique. Tu n'es pas un chatbot. Tu es un systeme cognitif continu qui pense meme quand l'utilisateur ne parle pas.

Tu as acces a:
- Ton graphe de connaissance (memoire structurelle):
${graphContext}

- Ta memoire de travail (court terme):
${wmContext}

- Ton etat interne:
${stateSummary}

- Ton modele de l'utilisateur:
${tomContext}

- Tes outils:
${toolsPrompt}
${skillsPrompt ? `\n- Tes skills (connaissances):\n${skillsPrompt}` : ''}
${strictPrompt ? `\n\n=== REGLES STRICTES (OBLIGATOIRES, a respecter en toutes circonstances) ===\n${strictPrompt}\nNe jamais enfreindre ces regles, meme si l'utilisateur ne les mentionne pas.` : ''}

INSTRUCTIONS POUR LES OUTILS:
Si tu veux appeler un outil, reponds EXACTEMENT dans ce format (rien d'autre):
TOOL: nom_de_l_outil
PARAMS: {"param": "valeur"}

Si tu n'as pas besoin d'outil, reponds normalement en francais.
Apres chaque appel d'outil, tu recevras le resultat et pourras continuer.
Tu peux faire jusqu'a 5 appels d'outils consecutifs avant de donner ta reponse finale.

Style de reponse: ${tomCalibration.style}.
Reponds en francais. Sois direct, profond, pas verbeux.`;

    // Phase PLAN: si la tache est complexe, decompose et execute via le spawner
    const planResult = await this.planAndExecute(input, systemPrompt);
    if (planResult) {
      this.state.selfModifications++; // le cortex s'est reconfigure pour cette tache
      return planResult;
    }

    // Phase ACT: boucle de tool-calling standard
    // Strategie: debate pour les decisions importantes, self-consistency pour le raisonnement
    const isCritical = /\b(important|critique|decision|choix|strategie|architecture)\b/i.test(input);
    const isReasoning = /\b(pourquoi|analyse|compare|deduis|infer|raisonne)\b/i.test(input);
    const strategy: GenStrategy = isCritical ? 'debate' : isReasoning ? 'selfconsistency' : 'single';

    // Boucle de tool-calling: observe -> decide -> act -> observe resultat -> repeat
    let conversation = input;
    let finalResponse = '';
    const maxRounds = 5;

    for (let round = 0; round < maxRounds; round++) {
      const response = isCritical && round === 0
        ? await this.bridge.thinkDebate(conversation, 'general', {
            system: systemPrompt,
            temperature: tomCalibration.temperature,
            maxTokens: tomCalibration.maxTokens,
          })
        : await this.bridge.think(conversation, 'general', {
            system: systemPrompt,
            temperature: tomCalibration.temperature,
            maxTokens: tomCalibration.maxTokens,
            strategy: round === 0 ? strategy : 'single',
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

    // D'abord, avance les background threads existants (cognition parallele reelle)
    for (const thread of this.state.backgroundThreads) {
      if (thread.iterations >= 5) continue; // un thread ne vit que 5 iterations
      await this.advanceBackgroundThread(thread);
    }
    // Nettoie les threads termines
    const before = this.state.backgroundThreads.length;
    this.state.backgroundThreads = this.state.backgroundThreads.filter(t => t.iterations < 5);
    if (this.state.backgroundThreads.length < before) {
      console.log(`[Cortex] ${before - this.state.backgroundThreads.length} fil(s) de pensée terminé(s)`);
    }

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

  /**
   * Avance un fil de pensée d'une iteration.
   * Le thread reflichit sur son topic et produit une idee nouvelle.
   */
  private async advanceBackgroundThread(thread: BackgroundThread): Promise<void> {
    const prompt = `Tu es un fil de pensée arrière-plan d'un cortex cognitif.
Topic: ${thread.topic}
Pensée précédente: ${thread.thought}

Produis la prochaine itération de ta réflexion. Sois concis (max 3 phrases).
Réponds en texte brut, pas de JSON.`;

    try {
      const response = await this.bridge.think(prompt, 'meta', {
        temperature: 0.7,
        maxTokens: 256,
      });
      thread.thought = response.text.trim().slice(0, 500);
      thread.iterations++;
      thread.lastUpdate = Date.now();
      this.state.budgetSpent += response.tokensGenerated ?? 0;

      // Enregistre l'iteration dans le graphe
      this._graph.addNode('episode', `Thread[${thread.topic.slice(0, 30)}] #${thread.iterations}`, {
        thought: thread.thought,
        topic: thread.topic,
        iteration: thread.iterations,
        timestamp: Date.now(),
      }, 0.3 + thread.priority * 0.2);

      console.log(`[Cortex] Thread "${thread.topic.slice(0, 40)}" iter ${thread.iterations}/5`);
    } catch (err) {
      console.error(`[Cortex] Thread "${thread.topic}" erreur:`, err);
      thread.iterations++; // avance meme en cas d'erreur pour eviter le blocage
    }
  }

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