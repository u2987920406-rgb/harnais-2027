---
name: data-persistence
description: "Persistance locale : localStorage, IndexedDB, SQLite (node) — schema, migration, borne"
tags: [data, web]
---
# Data Persistence (local-first)

Pour stocker des donnees dans une app locale :

1. LOCAL-FIRST. Privilegier le stockage local (localStorage pour petit, IndexedDB pour struct,
   node:sqlite pour le harnais). Pas de cloud obligatoire.
2. SCHEMA. La forme des donnees est typee (interface). Une lecture sans type est refusee.
3. MIGRATION BORNEE. Si le schema change, versionner + migration simple. Pas de migration qui
   peut perdre des donnees silencieusement.
4. ERREURS. localStorage peut echouer (quota, privé). Toujours try/catch ; en echec, retrouver un
   etat sain (cf. security-review).
5. SECRET. Les donnees sensibles ne sont pas stockees en clair sans avertir l'utilisateur.
6. BORNE. Limiter la taille (pas de dump illimite). Le harnais suit le budget memoire.

Le Verifier sandbox peut rejouer un round-trip persist/recall pour le prouver.
