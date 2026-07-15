---
name: testing-discipline
description: "Discipline de test : le code n'est pas fini sans verification executable"
tags: [test, verify]
---
# Testing Discipline

Inspiré de la regle Hermes "Finish the job" : un artefact non verifie n'est pas un resultat.

1. TOUT CODE = UN TEST. Si tu produis une fonction, produis au moins un test qui l'exerce.
2. VERITE. Le test doit pouvoir ECHOUER. Un test qui ne peut pas rouge n'est pas un test.
3. DETERMINISME. Pas de `Math.random` non seede, pas de `Date.now` dans l'assertion. Le test
   doit etre reproductible (`npm run test` vert a chaque run).
4. FRONTIERE. Tester l'entree invalide (null, vide, depassement) autant que le cas heureux.
5. VERIFIER NE PAS SIMULER. Utiliser le vrai Verifier du harnais (typecheck, sandbox) plutot
   que d'affirmer "ca marche". Si le test n'est pas executable ici, le dire explicitement.

Le harnais execute les tests dans le sandbox : la preuve sort de la, pas de ton affirmation.
