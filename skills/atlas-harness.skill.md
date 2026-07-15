---
name: atlas-harness
description: "Harnais agentique model-agnostic, local-first, evolutif : comment l'utiliser et l'etendre pour generer des apps et orchestrer des modeles locaux"
tags: [atlas, orchestration, meta]
---
# ATLAS Harness

Harnais agentique UNIVERSEL, model-agnostic, local-first, concu pour l'evolutivite.
Aucun modele en dur : tout passe par des CONTRATS + REGISTRIES. On change de modele = on
change une ligne de config, jamais le noyau.

## Quand utiliser ce skill
- Generer une app (web / 3D / jeu) a partir d'un brief, via des modeles locaux (Ollama).
- Orchestrer plusieurs modeles quantifies pour egaliser Fable/Mythos (self-consistency, debate).
- Spawner des agents specialises a la demande sans coder.
- Appliquer une doctrine d'orchestration (verifier avant de clamer, boucle bornee, souverainete).

## Principe d'or
Le monde de l'IA change tous les 3 mois : AUCUN composant ne doit etre en dur. Ajouter un
modele / agent / outil / skill = implementer une interface + register (ou deposer un .skill.md).
Le noyau (core/) ne change jamais.

## Architecture (racine = C:\Users\kuchu\Desktop\atlas)
- `core/` : contracts.ts (interfaces), kernel.ts (boucle PERCEIVE→PLAN→ACT→VERIFY→REFLECT),
  router.ts (routage par CAPACITE, local-first), budget.ts (REFLECT borne), skill.ts (SkillRegistry),
  strategies.ts (self-consistency / debate), registry.ts (Registry generique).
- `providers/` : ollama.ts (HTTP localhost:11434, zero dep), fake.ts (deterministe, tests).
- `agents/` : defaults.ts (makeAgent), roster.ts (5 agents), spawner.ts (agents a la demande).
- `memory/` : store.ts (SQLite persistante + in-memory).
- `verify/` : verifier.ts (Verifier composable : testgen + sandbox + vision).
- `app/` : engine.ts, multitarget.ts (web/3d/jeu), tauri.ts (coque Rust), pipeline.ts.
- `bridge/` : fable.ts (GESTES→contraintes), mangoqa.ts (visage Critique MangoQA).
- `skills/` : .skill.md charges automatiquement (doctrine + metiers).
- `config/` : bootstrap.ts (assemblage surchargeable), providers.ts, agents.ts.
- `tests/` : harnais de tests maison (zero-dep, `npm run test`).

## Cycle de vie d'une tache
1. `bootstrap()` assemble providers + agents + memory + tools + verifier + skills.
2. `runKernel(deps, brief)` : PERCEIVE (memorise) → PLAN → ACT (code, boucle REFLECT bornee)
   → VERIFY (Verifier composable) → DONE. Chaque agent injecte la doctrine + skills pertinents.
3. Les strategies (self-consistency / debate) egalisent les modeles quantifies.

## Etendre (sans toucher le noyau)
- Nouveau modele : `providers/monprovider.ts` implémentant `ModelProvider`, puis `register()`.
- Nouvel agent fixe : une ligne dans `agents/roster.ts`.
- Agent a la demande : `spawnAgent({ id, role, requiredCapabilities, instruction, skillTags })`.
- Nouveau skill : deposer `skills/mon-skill.skill.md` (frontmatter name/description/tags + corps).
- Nouvelle gate de verification : fonction dans `verify/` + flag dans le Verifier composable.

## Verifier sans modele
Le harnais tourne "sans modele" : `makeFakeProvider` prouve tout le pipeline. Pour activer Ollama,
decommenter le bloc dans `config/providers.ts`. Rien d'autre ne bouge.

## Tests
`npm run test` → tous les modules verifies offline (31 tests). Ajouter un test = nouveau fichier
`tests/xxx.test.ts` qui importe `./harness.ts` (`test()` + `run()` a la fin via run.ts).
