---
name: navigateur-interactif
description: Comment piloter un vrai navigateur (clics, formulaires) de façon souveraine avec les outils CDP
tags: [web, navigateur, automation, cdp]
mode: soft
---

Quand l'utilisateur veut cliquer, remplir un formulaire ou interagir avec une page web:

1. `browser_navigate` {url} -> ouvre la page (Chrome local, 0 dépendance)
2. `browser_snapshot` {limit?} -> liste les éléments cliquables/texte avec leur INDEX
3. `browser_click` {index} -> clique sur l'élément N°index de la snapshot
4. `browser_type` {index, text} -> saisit du texte dans un champ (input/textarea)
5. `browser_close` -> ferme le navigateur quand terminé

Règles:
- Toujours faire snapshot AVANT de cliquer (pour avoir les bons index).
- Les index sont recalculés à chaque snapshot; ne pas les mémoriser entre deux pages.
- Ce navigateur est souverain (Chrome déjà installé sur la machine, piloté via CDP).
- Si une page ne charge pas (file:// bloqué), sert-la via un serveur local ou utilise une URL http/https.
