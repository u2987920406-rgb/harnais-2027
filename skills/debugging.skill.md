---
name: debugging
description: "Debug systematique : comprendre avant de patcher, isoler, verifier le fix"
tags: [debug, verify]
---
# Debugging (systematique)

Inspiré de la methode de debug : comprendre AVANT de corriger.

1. REPRODUIRE. Isoler le cas minimal qui echoue. Sans reproduction, pas de fix.
2. OBSERVER. Lire l'erreur/le log reelle, pas ce qu'on suppose. Le Verifier (typecheck, sandbox)
   est la source de verite.
3. HYPOTHESE UNIQUE. Une cause a la fois. Changer UNE variable, re-tester. Pas de shotgun de patchs.
4. RACINE. Corriger la cause, pas le symptome. Un patch qui masque l'erreur (try/catch vide) est
   refuse.
5. VERIFIER LE FIX. Le test qui etait rouge doit passer. Ajouter un test qui fige la regression.
6. BORNER. Si apres N tentatives bornées la cause reste inconnue, dire "je ne peux pas" et remonter
   (cf. budget-bound-loop). Pas de boucle de debug infinie.

Le debug laisse les tests verts : casser un test pour avancer est interdit.
