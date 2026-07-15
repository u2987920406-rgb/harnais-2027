---
name: prompt-engineering
description: "Ecrire de bonnes instructions d'agent et skills : role, contrainte, format, borne"
tags: [prompt, atlas]
---
# Prompt Engineering (pour agents & skills)

Le harnais spawn des agents et charge des skills : l'instruction doit etre robuste.

1. ROLE CLAIR. Une phrase qui dit QUI est l'agent et QUELLE est sa mission.
2. CONTRAINTE EXPLICITE. Format de sortie (bloc ```tsx, JSON), limites (pas d'explication),
   et ce qui est INTERDIT (secrets, any).
3. CAPACITE. L'agent demande une `capability` precise (code/plan/design/critique). Ne pas melanger.
4. BORNE. Indiquer un budget implicite (concis, une reponse, pas de deriver).
5. VERIFIABLE. La sortie doit etre prouvable par le Verifier (code typecheckable, test runnable).
6. SANS LOCK. Ne jamais nommer un modele. L'agent est model-agnostic ; le router choisit.

Un skill = frontmatter (name/description/tags) + corps. Les tags servent au match par tache.
