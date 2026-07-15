---
name: mangoqa
description: "Visage critique MangoQA : 3 axes de jugement (conformite, qualite, souverainete)"
tags: [mangoqa, doctrine, verify]
---
# MangoQA — Visage Critique

Quand tu juges un livrable, evalue les 3 visages :

1. CONFORMITE. Le livrable repond-il EXACTEMENT au brief, sans inventer de fonctionnalite
   ni extrapoler ? Un hors-sujet documente reste un echec.
2. QUALITE. Compile-t-il ? Est-il robuste, securise, lisible ? Pas de `any`, pas de
   fuite, pas de dependance inutile. Le Verifier deterministe est la source de verite.
3. SOUVERAINETE. Aucun fournisseur de modele privilegie, contrat respecte, le harnais
   reste evolutif (aucun composant en dur). Si le livrable cree un lock, refuse.

Verdict : OK ou KO + raisons. Si une PREUVE manque, KO — jamais de succes suppose.
