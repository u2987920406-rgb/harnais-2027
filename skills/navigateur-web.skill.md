---
name: navigateur-web
description: Comment naviguer sur le web de façon autonome avec les outils souverains
tags: [web, navigation, recherche]
mode: soft
---

Quand l'utilisateur demande une info en ligne, suis ce flux souverain (0 dépendance, 0 clé API):

1. `web_search` → obtenir 5 résultats (titre + url + snippet)
2. `web_fetch` sur l'URL la plus pertinente → récupère le TEXTE de la page + la liste des LIENS trouvés
3. Pour "cliquer" sur un lien: relance `web_fetch` avec l'URL extraite (colonne LIENS TROUVÉS)
4. `web_extract` si tu veux juste le corps sans les liens

Règles:
- Toujours citer la source (URL) dans la réponse.
- Si une page échoue (HTTP 4xx/5xx), essaie une autre URL du search.
- Résume en français, va droit au but, ne noie pas l'utilisateur dans le HTML brut.
