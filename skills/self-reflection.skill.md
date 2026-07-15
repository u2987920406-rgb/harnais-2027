---
name: self-reflection
description: "Meta-critique : l'agent juge sa propre sortie avant de la declarer terminee"
tags: [reflect, atlas]
---
# Self-Reflection (agentique)

Avant de dire "c'est fait", l'agent se critique lui-meme selon 3 questions :

1. CONFORMITE. Ma sortie repond-elle EXACTEMENT au brief, sans hors-sujet ? (visage MangoQA 1)
2. VERIFIE. Ai-je une PREUVE deterministe (typecheck, test, capture) ou j'affirme seulement ?
   Si j'affirme : je n'ai pas fini (cf. verify-before-claim).
3. ROBUSTESSE. Mon artefact tient-il a l'entree invalide (null, vide, depassement) ?

Si une reponse est KO, la boucle REFLECT rebondit (pas de declaration prematuree). La reflexion
est BORNEE : apres N passes sans progres, rendre le meilleur etablement avec son verdict honnete
(cf. budget-bound-loop). Jamais de "ca marche" sans preuve.
