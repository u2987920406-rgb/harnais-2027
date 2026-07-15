---
name: api-integration
description: "Appels API : fetch type, erreurs, retry borne, cache, pas de secret en dur"
tags: [api, web]
---
# API Integration

Tout appel a un service externe respecte :

1. TYPAGE. La reponse est typee (interface) avant usage. Pas de any sur le JSON brut.
2. ERREURS. fetch peut echouer (reseau, 4xx, 5xx). Toujours verifier res.ok + gerer le catch.
   Un appel non entoure de try/catch est refuse (cf. security-review).
3. RETRY BORNE. En cas d'echec temporaire, retry avec backoff, mais BORNE (max 3). Pas de boucle
   infinie (cf. budget). Au-dela, remonter l'erreur honnetement.
4. SECRET. La cle API vient de l'environnement (process.env), jamais hardcodee. Si absente, echec
   explicite (cf. security-review).
5. CACHE. Pour eviter de rappeler a chaque render : memoization (useMemo / module cache), pas de
   fetch dans le corps de render.
6. CONTRAT. L'app ne suppose pas que l'API repond vite ; elle affiche un etat de chargement.

Le Verifier sandbox peut rejouer un appel ; l'affirmation "ca marche" ne suffit pas.
