---
name: documentation
description: "Documentation : README, commentaires utiles (pourquoi), nommage, exemples"
tags: [docs]
---
# Documentation

Un livrable n'est complet que s'il est comprehensible et reutilisable :

1. README. Pour une app generee : but, lancer (npm install && npm run dev), structure, limites.
2. COMMENTER LE POURQUOI. Pas de commentaire qui resume le code visible. Expliquer la decision,
   le contrat non evident, le piege evite.
3. NOMMAGE. Noms qui disent l'intention. Pas d'abreviations cryptiques (cf. refactor).
4. EXEMPLES. Pour une fonction d'API/util, un exemple minimal d'appel.
5. A PROPOS. Limites connues + TODO justifie. Un "ca marche" sans preciser les limites est un mensonge.
6. PAS DE SURENCHERE. La doc suit le code ; si le code change, la doc change (un test βédée vérifie
   que les liens/chemins cités existent quand c'est possible).

Le Verifier peut refuser une app sans README minimale si le brief le demande.
