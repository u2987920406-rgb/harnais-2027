---
name: refactor
description: "Refactor : garder KISS/DRY, matcher le style environnant, eviter la sur-ingenierie"
tags: [refactor, quality]
---
# Refactor

Quand on modifie du code existant (pas juste genere) :

1. KISS. La solution la plus simple qui marche. Pas d'abstraction prematuree pour "plus tard".
2. DRY. Pas de duplication de logique : extraire une fonction, pas copier-coller.
3. STYLE. Respecter le style du fichier environnant (indentation, nommage, imports).
4. ELITISME. Elegant, concis, efficace. Eviter les commentaires qui repete le code ; commenter
   le POURQUOI, pas le QUOI.
5. NON-REGRESSION. Tout refactor garde les tests verts. Si un test casse, c'est le refactor qui
   a tort, pas le test (sauf si le test testait un bug).
6. CONTRAT INTACT. Ne pas casser l'interface publique utilisee ailleurs sans le signaler.
