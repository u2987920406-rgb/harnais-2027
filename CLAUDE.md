# Harnais 2027 — Cortex Cognitif Souverain

## Contexte
Ce fichier est le contexte projet universel. Il est lu par tous les agents qui travaillent sur ce codebase:
Claude Code, GLM 5.2, Hunyuan (hy3), Qwen, Qwythos, ou tout autre modele via Hermes Agent.
Les instructions ci-dessous s'appliquent a tous, independamment du moteur.

## Architecture
Cortex cognitif continu avec 3 modes: AWAKE (interaction temps reel), IDLE (pensee arriere-plan), SLEEP (consolidation profonde).
Graphe de connaissance persistant. Spawner dynamique d'agents ephemeres. Theory of Mind de l'utilisateur.
Pont vers NayaOS (API REST lecture+commande) et NayaQA (lecture verdicts QA).

## Souverainete
100% souverain: 0 dependance proprietaire dans le code. Modeles via Ollama (local + cloud).
- Qwythos v2 (local): raisonnement, meta-cognition
- GLM 5.2 (cloud): general, creatif, tool-calling fiable
- Qwen 3.5 (cloud): consolidation
- Qwen-VL (local): vision
- Hunyuan hy3 (cloud, fallback): general, rapide

## Modules
- core/cortex.ts — coeur cognitif, boucle tick: observer>evaluer>decider>agir>apprendre>consolider
- core/state.ts — etat mental persistant (focus, hypotheses, emotionalTone, workingMemory, backgroundThreads)
- core/router.ts — routeur par capacite, local-first, trie par tier
- core/budget.ts — garde anti-boucle + anti-cout (tokens + iterations)
- core/strategies.ts — self-consistency (N tirages + vote) et debate (N modeles + juge)
- core/workflow.ts — moteur de workflow type n8n (nodes + edges, topologique)
- core/skill.ts — registry de skills (.skill.md, frontmatter + markdown)
- models/bridge.ts — abstraction unifiee sur les modeles, routeur, budget, strategies
- models/ollama.ts — connexion HTTP directe a Ollama (fetch, pas de SDK)
- memory/knowledge-graph.ts — graphe persistant (noeuds + aretes + poids + oublie)
- memory/consolidation.ts — cycle de sommeil (patterns, integration, oubli)
- cognition/spawner.ts — generation dynamique de sous-agents ephemeres
- cognition/theory-of-mind.ts — modele de l'utilisateur (ton, engagement, preferences)
- bridge/nayaos.ts — pont HTTP vers NayaOS
- bridge/nayaqa.ts — pont lecture verdicts NayaQA + Retex
- tools/registry.ts — registre dynamique d'outils (schema + risque)
- tools/filesystem.ts — read/write/list/search (risque graduated)
- tools/terminal.ts — exec shell async (dangerous)
- tools/web.ts — DuckDuckGo search + page extract (pas de cle API)
- tools/nayaos-tools.ts — outils NayaOS pour le ToolRegistry
- verify/verifier.ts — verificateur composable (testgen + sandbox + vision)

## Build
- `npm run build` — tsc (TypeScript strict, ESNext, 0 dep npm)
- `npm test` — tsx --test test/*.test.ts (node:test natif, 18 tests)
- `npm run dev` — tsx src/index.ts (mode interactif)
- `npm run think` — une pensee de fond
- `npm run sleep` — cycle de sommeil force

## Conventions (OBLIGATOIRES pour tous les agents)
- TypeScript strict, ESModules (.js extensions dans les imports)
- 0 dependance npm (uniquement devDeps: tsx, typescript, @types/node)
- Commentaires en francais dans le code
- Pas de SDK externe — fetch direct uniquement
- Le harnais ne repompe PAS axiomes/embeddings/auto-forge/Blackboard de NayaOS
- Apres chaque changement, verifier: npm run build && npm test
- Ne jamais commiter sans permission explicte de Raf
- Ne pas changer l'architecture ni ajouter de modules sans accord

## Regles pour agents autonomes
- Si tu es Claude Code: utilise Read/Write/Edit/Bash, --max-turns pour limiter
- Si tu es GLM 5.2 / hy3 / Qwen via Hermes: utilise les tools terminal/read_file/patch/write_file
- Quel que soit le moteur: build + tests doivent passer avant de considerer le travail termine
- Si une tache echoue 3 fois sur le meme fichier, arreter et demander a Raf
- Ne jamais inventer des fichiers, symboles, ou APIs qui ne sont pas dans le repo
- Tracer les symboles avant de modifier (read_file + search_files)