---
name: accessibility
description: "Accessibilite web : semantique, clavier, contraste, testid"
tags: [a11y, web]
---
# Accessibility (Web)

Tout livrable UI doit etre utilisable sans souris et par un lecteur d'ecran :

1. SEMANTIQUE. Balises correctes (`button`, `nav`, `main`, `label` lies aux inputs). Pas de `div`
   cliquable a la place d'un bouton.
2. CLAVIER. Toute interaction est accessible au clavier (focus visible, ordre logique).
3. CONTRASTE. Texte lisible sur fond (pas de gris sur gris).
4. TESTID. Chaque element interactif critique porte un `data-testid` — le Verifier (vision/capture)
   s'en sert pour prouver que l'UI repond.
5. TEXTE ALTERNATIF. Images porteuses d'info = `alt` pertinent ; decoration = `aria-hidden`.

Le Verifier peut refuser une UI sans `data-testid` sur les interactions critiques.
