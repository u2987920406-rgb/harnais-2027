---
name: provider-agnostic
description: "Connectivite universelle : aucun provider privilegie, contrat unique, router par capacite"
tags: [atlas, providers]
---
# Provider-Agnostic

ATLAS ne privilegie AUCUN fournisseur de modele. Tout passe par l'interface `ModelProvider` :

1. UN CONTRAT. Ollama, LM Studio, vLLM, OpenRouter, Together, Groq, ou un provider maison :
   implementer `ModelProvider` (complete + capabilities + tier + isLocal), puis `register()`.
2. AUCUN NOM EN DUR. Le noyau ne cite jamais un modele. Le router choisit par CAPACITE puis
   local-first puis moins cher (cf. agent-orchestration, atlas-doctrine).
3. STANDARD OUVERT. Le provider `openai-compatible` couvre de fait LM Studio, vLLM, Ollama (/v1),
   OpenRouter, Together, Groq, DeepInfra : un seul code, n'importe quel endpoint. Pas de silo.
4. LOCAL D'ABORD. Un provider `isLocal:true` est prefere au cloud. Le cloud n'est repli qu'en
   fallback explicite (allowCloud), jamais par defaut (cf. atlas-doctrine : souverainete).
5. CLE OPTIONNELLE. Le local n'a pas besoin de cle. La cle cloud vient de l'environnement
   (process.env), jamais hardcodee (cf. security-review).
6. BRANCHER = ENREGISTRER. Ajouter un modele au harnais = un appel `register(...)` dans la config.
   Aucune modification du coeur.

Le harnais est souverain par construction : changer de modele ne change qu'une ligne de config.
