# Harnais 2027 — Cortex Cognitif Souverain

Un harnais agentique qui ne repart jamais de zéro. Pas une session de chat, pas un
routeur stateless : un **processus cognitif continu** avec un état mental persistant,
un graphe de connaissance, et une boucle de pensée qui tourne même sans utilisateur.

100% souverain — 0 dépendance à Claude/Anthropic dans le code. Tous les modèles
passent par Ollama (local + cloud).

## Architecture

Le Cortex a 3 modes :

- **AWAKE** — l'utilisateur interagit, réponse en temps réel.
- **IDLE** — pas d'utilisateur, mais le cortex pense en arrière-plan (explore des
  hypothèses, anticipe, note des patterns).
- **SLEEP** — consolidation profonde, comme le sommeil pour un cerveau : dégrade
  le bruit, fusionne les patterns, intègre au graphe de connaissance.

La boucle cognitive (`tick`) : **observer → évaluer → décider → agir → apprendre → consolider**.

### Modèles (via Ollama, aucun SDK externe)

| Rôle | Modèle | Local/Cloud |
|---|---|---|
| Raisonnement, méta-cognition | Qwythos v2 | local |
| Généraliste, créatif, tool-calling | GLM 5.2 | cloud |
| Consolidation | Qwen 3.5 | cloud |
| Vision | Qwen-VL | local |

Le [`ModelBridge`](src/models/bridge.ts) route chaque appel vers le meilleur
provider disponible pour la capacité demandée (`reasoning`, `creative`, `general`,
`vision`, `meta`, `consolidation`, `critique`), local-first, puis par tier de coût
croissant. Il gère aussi le budget (tokens + itérations) et deux stratégies de
génération renforcée : self-consistency (N tirages + vote) et debate (N modèles + juge).

## Modules

### `core/`
- **`cortex.ts`** — le cœur cognitif : lifecycle (`init`/`start`/`stop`), traitement
  des inputs utilisateur avec boucle de tool-calling, pensée de fond (`idleThought`),
  cycle de sommeil (`sleepCycle`), introspection.
- **`state.ts`** — l'état mental persistant (`CortexState`) : focus courant,
  hypothèses actives, mémoire de travail (buffer borné avec décroissance de
  pertinence), fils de pensée en arrière-plan, modèle de l'utilisateur (ton,
  engagement), budget cognitif. Sérialisé sur disque via `saveCortexState`/
  `loadCortexState` (protégé par lock file contre la corruption multi-instance).
- **`router.ts`** — routeur par capacité, local-first, trié par tier.
- **`budget.ts`** — garde anti-boucle infinie et anti-coût (plafonds tokens +
  itérations, vérifiés avant chaque appel modèle).
- **`strategies.ts`** — self-consistency et debate.
- **`workflow.ts`** — moteur de workflow type n8n (graphe de nodes/edges, tri
  topologique) pour les tâches complexes déclarées à l'avance.
- **`skill.ts`** — registre de skills chargés depuis des fichiers `.skill.md`
  (frontmatter YAML + corps markdown), matchés par tag ou par texte.

### `memory/`
- **`knowledge-graph.ts`** — le tissu mémoire persistant : nœuds (entités,
  concepts, épisodes, procédures, préférences, hypothèses) reliés par des arêtes
  typées et pondérées. Upsert anti-doublon, requêtes par type/label/poids,
  dégradation (`decayAll`) et éviction des épisodes faibles.
- **`consolidation.ts`** — cycle de sommeil : détection de patterns, intégration
  au graphe, oubli des souvenirs peu pertinents.

### `cognition/`
- **`spawner.ts`** — génération dynamique d'agents/sous-processus éphémères.
- **`theory-of-mind.ts`** — modèle de l'utilisateur : analyse de ton, engagement,
  préférences perçues.

### `bridge/`
- **`nayaos.ts`** — pont HTTP vers NayaOS (lecture des projets/agents, commandes).
- **`nayaqa.ts`** — pont de lecture des verdicts QA et Retex de NayaQA, qui
  enrichissent le graphe de connaissance.

### `tools/`
- **`registry.ts`** — registre dynamique d'outils : schéma, niveau de risque
  (`safe`/`moderate`/`dangerous`), exécution avec validation des paramètres requis.
- **`filesystem.ts`** — read/write/list/search de fichiers.
- **`terminal.ts`** — exécution shell asynchrone (`child_process.exec` promisifié),
  avec timeout et distinction erreur/timeout dans le résultat.
- **`web.ts`** — recherche DuckDuckGo + extraction de page (pas de clé API).
- **`nayaos-tools.ts`** — outils exposant le pont NayaOS au ToolRegistry.

### `verify/`
- **`verifier.ts`** — vérificateur composable (génération de tests, sandbox,
  vision) appelé après chaque écriture de fichier pour valider la santé du code produit.

## Build & usage

```bash
npm run build   # tsc — TypeScript strict, ESNext, 0 dépendance npm
npm test        # node:test via tsx, sans dépendance npm
npm run dev     # mode interactif (REPL)
npm run think   # une seule pensée de fond puis arrêt
npm run sleep   # force un cycle de sommeil puis arrêt
npm start       # lance le build compilé (dist/index.js)
```

### Mode interactif

```bash
npm run dev
```

Commandes disponibles dans le REPL :

```
/introspect  -- voir l'état interne du cortex
/sleep       -- forcer un cycle de sommeil
/graph       -- voir le graphe de connaissance
/skills      -- lister les skills chargés
/nayaos      -- vérifier l'état de NayaOS
/quit        -- arrêter (sauvegarde l'état avant de sortir)
```

Tout message qui n'est pas une commande est injecté dans le cortex via
`cortex.inject(input)`, qui déclenche la boucle de tool-calling et retourne
la réponse.

### Persistance

- `data/knowledge-graph.json` — graphe de connaissance.
- `data/cortex-state.json` — état mental (focus, hypothèses, mémoire de travail,
  fils de pensée, modèle utilisateur). Chargé au démarrage (`cortex.init()`) et
  sauvegardé à l'arrêt (`cortex.stop()`) ainsi que périodiquement pendant la
  boucle de tick.

## Conventions

- TypeScript strict, ESModules (imports avec extension `.js`).
- 0 dépendance npm en production — uniquement des devDependencies (`tsx`,
  `typescript`, `@types/node`). Pas de SDK externe, `fetch` direct vers Ollama.
- Commentaires en français dans le code.
- Le harnais ne repompe pas les axiomes/embeddings/auto-forge/Blackboard de NayaOS.
