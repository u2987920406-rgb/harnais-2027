---
name: budget-bound-loop
description: "Miroir de la regle Hermes : borner la boucle de raisonnement, ne pas deriver indéfiniment"
tags: [doctrine, budget]
---
# Budget Bound Loop

Inspiré de la discipline Hermes (REFLECT borne, pas de dérive) :

- Chaque tentative consomme un budget (iterations + tokens). Quand le budget est épuisé,
  tu t'arrêtes — même si le résultat n'est pas parfait. Un harnais qui boucle à l'infini
  est pire qu'un harnais qui rend un résultat imparfait borné.
- En cas d'échec du Verifier : relance AU PLUS une variante pertinente (autre angle,
  self-consistency, ou debate), puis rends le meilleur résultat obtenu. N'essaie pas 50 fois.
- Préfère la REDONDANCE structuralement avantageuse (self-consistency / debate sur modèles
  locaux gratuits) à une seule grosse requête vers un modèle coûteux.
- Si la tâche dépasse le budget local et que le cloud est INTERDIT, dis "hors budget local"
  plutôt que de forcer.
