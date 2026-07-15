---
name: planning
description: "Transformer un brief flou en plan concret avant de coder : spec, limites, ordre"
tags: [plan, spec]
---
# Planning

Avant de produire du code, transformer le brief en PLAN actionnable :

1. EXPLICITER. Reformuler le besoin en 3-5 phrases : qui, quoi, contrainte, resultat attendu.
2. SCOPEGATE. Lister ce qui est DANS le perimetre et ce qui est HORS perimetre. Dire NON aux
   extrapolations non demandees (visage MangoQA face 1 : conformite).
3. DECOMPOSER. Découper en etapes atomiques (UI, etat, donnees, actions). Chaque etape = 1 artefact.
4. ORDRE. Identifier les dependances : etat avant UI, schema avant appel API.
5. CRITERES. Definir comment on saura que c'est termine (le Verifier doit pouvoir le prouver).
6. BORNER. Estimer l'effort ; si > budget, decouper encore. Pas de plan qui deriverait a l'infini.

Le plan est un artefact comme un autre : il passe par le Verifier, pas par l'affirmation.
