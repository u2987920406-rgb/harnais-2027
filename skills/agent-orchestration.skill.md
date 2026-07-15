---
name: agent-orchestration
description: "Orchestration multi-agents : router par capacite, spawner a la demande, critique"
tags: [orchestration, atlas]
---
# Agent Orchestration

Le harnais orchestre par CAPACITE, pas par modele. Regles :

1. ROUTE PAR CAPACITE. Un agent demande `capability: 'code' | 'plan' | 'design' | 'critique' |
   'vision' | 'reason'`. Le router choisit le meilleur provider local (puis moins cher).
2. ROLES. Architecte (plan) → Designer (design) → Codeur (code) → Critique (verif) → Testeur.
   Chaque role est un agent cree via `makeAgent` ou `spawnAgent` (a la demande).
3. SPAWN A LA DEMANDE. Besoin d'un agent que le roster ne prevoit pas ? `spawnAgent({ id, role,
   requiredCapabilities, instruction, skillTags })` — aucun code en dur, instancie et reuse.
4. CRITIQUE EN DERNIER. Toute livraison passe par la face Critique (MangoQA / Verifier) AVANT
   d'etre dite terminee. Le critique peut refuser ; la boucle REFLECT rebondit.
5. PAS DE LOCK. Aucun agent ne nomme un modele. Changer de modele = changer la config des providers.
