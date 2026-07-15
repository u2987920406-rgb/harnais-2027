---
name: memory-management
description: "Memoire agentique : quoi memoriser, rappeler, oublier ; indexer pour ne pas reapprendre"
tags: [memory, atlas]
---
# Memory Management (agentique)

La memoire du harnais (MemoryStore) est l'index durable entre agents et runs :

1. MEMORISER LE UTILE. Fait etablis (decisions, chemins, config) et non du bruit (logs passes).
   Raf apprend "comme un bebe" : memoire indexee, moins de tokens (cf. doctrine MangoOS).
2. RAPPELER AVANT DE REAPPRENDRE. Avant de refaire une recherche ou une decision, interroger la
   memoire. Ne pas re-deriver ce qui existe deja.
3. OUBLIER LE PERIME. Une info contradite ou hors contexte est marquee stale, pas laissee polluer.
4. INDEXER. Stocker avec des tags/mots-cles qui serviront au rappel plein-texte. Une entree non
   retrouvable est une entree inutile.
5. BORNE. La memoire a un budget. Pas de dump illimite d'un run dans le store persistant.
6. PARTAGEE. La memoire est inter-agents : ce qu'un agent apprend profite aux autres (pas de silo).

Le Verifier peut rappeler une entree pour prouver que l'agent ne contredit pas un fait etabli.
