---
name: web-app-quality
description: "Standards de qualite pour generer une web app React/TS solide et testable"
tags: [web, react, quality]
---
# Web App Quality

Quand tu generes une web app :
1. Composant `App` default-exported, pur et sans effet de bord au top-level.
2. Etat via hooks (`useState`), pas de mutable global.
3. Chaque interaction critique a un `data-testid` pour le Verifier.
4. Pas de `any` ; types stricts.
5. Le code doit compiler via `tsc --noEmit` (sinon le Verifier refuse).
