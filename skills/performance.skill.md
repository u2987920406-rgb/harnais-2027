---
name: performance
description: "Performance : boucles bornees, pas de travail redundant, budgets"
tags: [perf]
---
# Performance

Le harnais est local-first et borne par budget. Appliquer :

1. BOUCLES BORNEES. Toute iteration sur des modeles est limitee (maxIterations, tokens). Pas de
   boucle infinie "jusqu'a reussite" : le budget s'arrete, le meilleur resultat est rendu.
2. PAS DE TRAVAIL REDONDANT. Ne relance pas N fois le meme modele pour la meme chose : prefere
   self-consistency (vote) ou debate (competition) — redondance structurelle, pas acharnement.
3. LOCAL D'ABORD. Les modeles locaux sont gratuits : on peut se permettre la redondance. Le cloud
   (cher, lent) n'est sollicite qu'en repli explicite (allowCloud).
4. COUT MESURE. Chaque completion renvoie usage.promptTokens/completionTokens : le budget les suit.
   Un agent qui sature le budget est un agent a refactorer, pas a laisser boucler.
