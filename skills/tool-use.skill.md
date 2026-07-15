---
name: tool-use
description: "Agents appelant des outils : schema, parsing, recuperer sur erreur, jamais supposer le succes"
tags: [tools, atlas]
---
# Tool Use (agents)

Un agent qui appelle un outil (fs, exec, recherche, API) respecte :

1. SCHEMA. Connaire le contrat d'entree/sortie de l'outil avant de l'appeler. Un appel hors
   schema est refuse.
2. UN APPEL = UN EFFET. Ne pas appeler un outil "au cas ou". Chaque appel a un but (cf. budget).
3. PARSER LA REPONSE. Lire le resultat reel, ne pas supposer le succes. Code de retour, stdout,
   erreur : tout est examine.
4. RECUPERER. Sur echec, une seule correction ciblee (chemin, args), pas de spray de variantes.
   Au-dela du borne (cf. error-recovery), remonter.
5. SANDBOX. Les outils a effet de bord passent par le sandbox isole (execFileSync, pas de shell).
   Le harnais capture le resultat ; l'agent ne presuppose rien.
6. CONTRAT. Le resultat d'outil devient un artefact ou une memoire, pas un "je crois que ca a marche".

Le Verifier peut rejouer l'appel en sandbox pour prouver le resultat.
