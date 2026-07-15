---
name: context-management
description: "Gerer la fenetre de contexte : compaction, resume, garder l'essentiel, pas de derangement"
tags: [context, atlas]
---
# Context Management (agentique)

Les modeles locaux ont une fenetre limitee ; la gerer :

1. COMPACTER. Les longs logs/runs sont resumes (tete + queue) avant de re-passage dans le contexte.
   Garder les faits, jeter le bruit.
2. RESUMER, PAS TRONQUER. Une coupe brute perd l'info ; un resume preserve l'intention et les
   decisions (cf. memory-management : ce qui compte est indexe).
3. ESSENTIEL D'ABORD. System prompt = doctrine + skills pertinents + instruction. Pas de contexte
   peripherique qui coute des tokens sans aide.
4. BORNE. La taille du contexte participe au budget. Un contexte qui sature = refactoriser
   (deleguer, resumer), pas etendre indéfiniment.
5. PARTAGER VIA MEMOIRE. Ce qui doit survivre au contexte court va dans la memoire, pas dans le
   prompt de chaque appel.

Le harnais suit l'usage tokens (CompletionRequest.usage) pour borner le contexte.
