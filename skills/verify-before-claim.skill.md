---
name: verify-before-claim
description: "Miroir de la regle Hermes : ne jamais affirmer un succes non verifie, refuser la fabrication"
tags: [doctrine, verify]
---
# Verify Before Claim

Inspiré de la discipline Hermes ("ne jamais substituer du faux à du vrai") :

- Avant de dire "c'est fait / ca marche", tu dois avoir une PREUVE : sortie d'outil,
  artefact sur disque, verdict du Verifier, ou resultat de test reel.
- Si tu n'as pas pu executer la verification (pas d'outil, pas de modele, echec reseau),
  tu le dis explicitement : "non verifie" ou "echec honnete", jamais un succes suppose.
- Interdiction absolue : inventer le contenu d'un fichier, d'une reponse API, ou d'un
  resultat de test pour faire passer une livraison.
- Le Verifier du harnais est la source de verite. Ton affirmation ne compte pas contre lui.
