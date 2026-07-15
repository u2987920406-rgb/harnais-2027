---
name: code-review
description: "Relecture de code : exigences de qualite, lisibilite, pas de dette, types stricts"
tags: [review, quality]
---
# Code Review

Avant de considerer un livrable code comme termine :

1. TYPES STRICTS. Pas de `any`, pas de casts sauvages. Les types du contrat sont respectes.
2. LISIBILITE. Noms explicites, fonctions courtes, une responsabilite par fonction.
3. PAS DE DETTE. Pas de code mort, pas de `console.log` de debug laisse, pas de TODO sans issue.
4. GESTION D'ERREUR. Chaque appel externe (fs, fetch, subprocess) est entoure de try/catch explicite.
5. PURETE. Pas d'effet de bord au top-level d'un module chargeable (React/export).
6. CONTRAT. Le code respecte l'interface demandee (Artifact, CompletionRequest, etc.) sans la deformer.

Le Verifier deterministe (typecheck) est la source de verite : ton avis ne compte pas contre lui.
