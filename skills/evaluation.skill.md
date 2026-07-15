---
name: evaluation
description: "Evaluer la sortie d'agent : score deterministe, criteres mesurables, comparer les drafts"
tags: [eval, atlas]
---
# Evaluation (agentique)

Comment le harnais score une sortie d'agent (utilise par self-consistency / debate) :

1. SCORE DETERMINISTE. Un nombre sort d'une FONCTION, pas de l'opinion du modele. Ex : compile ?
   tests verts ? longueur ? similarite au brief (distance editable).
2. CRITERES MESURABLES. Chaque critere est verifiable (oui/non ou valeur). "C'est bon" n'est pas
   un critere.
3. COMPARER LES DRAFTS. En debate, le gagnant = meilleur score total, pas le plus verbeux. En vote,
   le consensus = draft majoritaire (cf. reasoning-strategy).
4. POIDS EXPLICITES. Les criteres ont des poids connus (conformite > style). Pas de jugement flou.
5. BORNE. Le scoring s'arrete a N drafts. Au-dela, le meilleur score connu l'emporte.
6. PISTE. Le score est reproductible (meme entree => meme score). Pas de hasard non seede.

Le Verifier composable fournit les scores deterministes (testgen, sandbox, vision).
