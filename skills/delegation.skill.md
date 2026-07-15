---
name: delegation
description: "Deleguer ou faire soi-meme : router par capacite, spawner un sous-agent, contrat de retour"
tags: [delegation, atlas]
---
# Delegation (agentique)

Un agent ne fait pas tout ; il delègue par CAPACITE :

1. ROUTER PAR CAPACITE. Une tache `code` va au Codeur, `design` au Designer, `critique` au Critique.
   L'agent demande la bonne capability ; le router choisit le meilleur modele local.
2. SPAWNER SI MANQUANT. Une tache hors roster = `spawnAgent({ id, role, requiredCapabilities,
   instruction, skillTags })`. Aucun code en dur (cf. agent-orchestration).
3. CONTRAT DE RETOUR. Deleguer = definir quoi recevoir (artefact, verdict) et le format. Une
   delegation sans contrat de retour est une fuite.
4. PARALLELISE QUAND INDEPENDANT. Deux sous-taches sans dependance = les lancer en parallele
   (economie de tokens, local est gratuit). Dependantes = ordre strict.
5. NE PAS RE-ROUTER LE LOCAL. Changer de modele ne change rien au contrat : la delegation est
   model-agnostic (cf. atlas-doctrine : route par capacite, pas par marque).

Le harnais orchestre : l'agent delegate, le kernel boucle, le Verifier juge.
