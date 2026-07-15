# CHECKPOINT — Harnais 2027

**Date checkpoint:** 2026-07-16 (session CLI, modèle actif: tencent/hy3:free via Nous Portal)
**État:** STABLE — build OK, runtime OK, 15 outils, 34 skills.

## Ce qui est construit (3866 lignes, 21 fichiers .ts, 0 dépendance npm)

### Cœur cognitif (core/)
- `cortex.ts` (614) — centre d'orchestration: awake/idle/sleep, boucle tool-calling, skills injectés, budget reset par cycle, verifier après file_write, runWorkflow(), ponts NayaQA + NayaOS instanciés.
- `state.ts` (179) — état persistant du cortex.
- `budget.ts` (59) — budget tokens (prompt/completion/iterations), withinBudget/charge/reset.
- `router.ts` (58) — routeur par capacité, local-first avec fallback cloud.
- `strategies.ts` (125) — self-consistency (N tirages + vote) + debate (N modèles + juge).
- `skill.ts` (118) — SkillRegistry: charge 34 .skill.md, match par tag/texte, parsing frontmatter YAML (fix CRLF Windows).
- `workflow.ts` (163) — WorkflowEngine: graphe nodes+edges, topo sort (Kahn), trace, sous-workflows, maxSteps.

### Mémoire (memory/)
- `knowledge-graph.ts` (381) — graphe avec upsert (dedup), decay, cap 200 episodes, toContext.
- `consolidation.ts` (242) — sommeil: extract patterns, deepConsolidate, extractProcedures.

### Outils (tools/)
- `registry.ts` (106) — ToolRegistry dynamique.
- `filesystem.ts` (158), `terminal.ts` (60), `web.ts` (137) — 7 outils de base.
- `nayaos-tools.ts` (199) — 8 outils NayaOS (projects, agents, chat, create_agent, mission, start/stop_agent, brain_registry).

### Modèles (models/)
- `bridge.ts` (287) — ModelBridge: routeur + budget + strategies, tool-calling GLM 5.2.
- `ollama.ts` (167) — connecteur Ollama (fetch natif, pas de package npm).

### Cognition (cognition/)
- `spawner.ts` (243) — agents éphémères, pipeline/parallele, skills par tag.
- `theory-of-mind.ts` (156) — modélisation Raf (ton, engagement, calibration).

### Vérif (verify/)
- `verifier.ts` (109) — verifier composable: testgen + sandbox + vision gates.

### Ponts (bridge/)
- `nayaqa.ts` (163) — lit verdicts NayaQA, enrichit graphe, warnings cross-projet.
- `nayaos.ts` (199) — pont API REST NayaOS: lecture + commande.

### Skills
- `skills/` — 34 fichiers .skill.md (dont nayaqa.skill.md, copie adaptée de mangoqa).

## Angles morts restants (de la revue de cohérence)
1. Pont NayaQA pas automatisé (pas de polling dans idle loop) — MANUEL pour l'instant.
2. Verifier ne couvre que file_write (pas shell_exec).
3. Skills pas injectés dans idleThought (only processInput).
4. TOM pas branché dans processInput (température/maxTokens fixes).
5. Cortex ne bascule pas auto vers workflow sur tâche complexe.
6. Double système de budget (state vs core/budget) pas unifié.
7. Self-consistency pas activé par défaut (strategy='single').
8. (RÉSOLU) Pont NayaOS pas branché au tool-calling → désormais 8 outils NayaOS actifs.

## Situation modèles
- GLM 5.2 cloud: **RATE LIMITED** (atteint le 2026-07-16). Heartbeat 2:10 AM configuré pour réactivation.
- Modèle de secours actif: tencent/hy3:free (Nous Portal).
- Qwythos v2 Q6 local: meta/hypothèses (lent). Qwen 3.5 cloud: consolidation. Qwen3-VL: vision.

## Commandes CLI
/skills, /nayaos, /graph, /introspect, /sleep, /quit
(le harnais supporte aussi un outil `nayaos_chat` pour déclencher un build NayaOS)
