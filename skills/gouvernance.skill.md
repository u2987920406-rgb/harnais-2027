---
name: gouvernance
description: Modes de gouvernance agentique (auto/plan/permission/edit) et sandbox — comment Atlas agit et se fait valider
tags: [securite, gouvernance, modes, sandbox, agentique]
mode: soft
---

Atlas dispose de 4 MODES DE GOUVERNANCE (controles par l'utilisateur, indépendants du cycle cognitif awake/idle/sleep). Ils déterminent si et comment Atlas exécute des outils (shell_exec, file_write, etc.).

## Les 4 modes
- **auto** : Atlas agit seul. `shell_exec` est filtré par whitelist (commandes destructrices type `rm -rf`, `sudo`, `mkfs`, `format`, `dd if`, `shutdown`, `> /dev/...` sont BLOQUEES).
- **plan** : Atlas PROPOSE seulement. Aucune action d'outil n'est exécutée (tout est refusé). Idéal pour demander une stratégie avant d'agir.
- **permission** : Atlas demande VALIDATION avant chaque action d'outil dangereux (shell_exec). L'utilisateur approuve/refuse via l'UI ou Telegram.
- **edit** : comme auto, mais demande validation AVANT d'écrire un fichier (file_write).

## Sandbox (isolation shell_exec)
- `none` : exécution directe sur la machine (historique).
- `whitelist` : bloque les commandes interdites par regex (défaut recommandé).
- `docker` : exécute dans un conteneur isolé (si Docker installé) — `docker run --rm -v $PWD:/work`.

## Comportement attendu du cortex
1. Avant chaque outil, appelle `Governance.decide(tool, params)`.
2. `deny` → outil non exécuté, raison loggée.
3. `ask` → demande approbation via le canal (UI/Telegram) ; FAIL-SAFE : si aucun canal connecté, refuse par défaut (jamais d'exécution non validée en silence).
4. `allow` → exécute normalement.

## Règle d'or
En cas de doute sur la dangerosité, utiliser `permission` ou `plan`. `auto` + `whitelist` est le compromis sécurité/vitesse par défaut.
