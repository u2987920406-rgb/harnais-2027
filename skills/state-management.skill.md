---
name: state-management
description: "Etat applicatif React/TS : local vs global, derive, effets, eviter la duplication"
tags: [web, react, state]
---
# State Management

Pour une app React/TS générée :

1. LOCAL D'ABORD. Etat propre a un composant = useState. Ne pas sur-dimensionner.
2. GLOBAL SEULEMENT SI PARTAGE. Si 2+ composants eloignes partagent, context ou store leger.
   Pas de Redux pour un compteur.
3. DERIVE. Les valeurs calculables (total, filtre) sont derivees, pas stockees (un seul source of
   truth).
4. EFFETS BORNES. useEffect pour les effets de bord (fetch, subscription), avec cleanup. Pas
   d'effet qui recalcule a chaque render sans deps correctes.
5. TYPE. L'etat est type strictement (interface). Pas de any qui cache une mutation.
6. PERSISTANCE. Si l'etat doit survivre, le brancher sur data-persistence, pas sur un stash ad hoc.

Le Verifier typecheck prouve le typage ; un etat non type est refuse.
