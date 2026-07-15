---
name: reasoning-strategy
description: "Choisir la strategie de raisonnement : single, self-consistency (vote), debate (competition)"
tags: [reason, atlas]
---
# Reasoning Strategy (agentique)

Le harnais egalise les modeles quantifies par la strategie, pas par la marque :

1. SINGLE. Tache simple/deterministe (scaffold, format) = un seul draft. Pas de gaspillage.
2. SELF-CONSISTENCY. Tache a risque d'hallucination (logique, code non trivial) = N drafts, vote
   majoritaire. Le consensus l'emporte (cf. AGRÉGAT Fable : on agrege pour annuler le bruit).
3. DEBATE. Tache ou deux positions s'affrontent (design, choix d'archi) = 2 modeles, N rounds,
   le gagnant = meilleur score (fonction de score deterministe, pas le juge du modele).
4. COUT. Choisir la strategie la moins chere qui donne une preuve. Local est gratuit => la
   redondance est abordable ; le cloud (si allowCloud) n'est reserve qu'au repli.
5. BORNE. N et le nombre de rounds sont limites par budget. Pas de deriver a l'infini.

Le router/strategy choisit ; l'agent n'a pas a savoir quel modele execute.
