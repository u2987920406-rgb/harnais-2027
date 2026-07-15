# GAPS — Travaux autonomes restants (Harnais 2027)

Liste ordonnee des angles morts a fermer. L'agent autonome (cron 2:10 AM)
traite UN gap a la fois, build + test apres chaque modif, puis passe au suivant.
Champ `status`: `pending` | `done` | `blocked` (avec raison).

Gardes-fous (imposes a l'agent):
- Edite UNIQUEMENT `D:\HERMES AGENT\harnais 2027\src\*` et ce fichier GAPS.md.
- `npm run build` OBLIGATOIRE apres chaque modif; iterer jusqu'a 0 erreur.
- PAS de git, PAS de push, PAS de suppression hors scope.
- Un gap a la fois. Sur bloqueur: marquer `blocked` + raison, s'arreter, rapporter.
- Style KISS/DRY, cohérent avec le reste.

---

## GAP-1 — NayaQA auto-poll dans la boucle idle
status: pending
risk: low-medium
file: src/core/cortex.ts (tickLoop / idleThought)
desc: NayaQABridge.readVerdict(projectDir) existe mais n'est jamais appele auto.
  Dans la boucle idle du cortex (tickLoop), une fois par cycle (pas a chaque tick),
  scanner les projets NayaOS connus et appeler readVerdict pour chacun.
  Projets NayaOS = sous-dossiers de `D:\HERMES AGENT\test ia os` contenant
  `.mangoqa/audit-verdict.json`. Enregistrer les verdicts dans le graphe.
  Ajouter un flag `state.lastNayaQAScan` pour limiter a 1 scan / 10 min.
verification: npm run build; node dist/index.js + /quit; pas d'erreur au demarrage.

## GAP-2 — Skills injectes dans idleThought
status: pending
risk: low
file: src/core/cortex.ts (idleThought)
desc: processInput injecte deja les skills (doctrine + match texte). idleThought ne le fait pas.
  Dans idleThought, charger this.skills.byText(currentThought) et les ajouter au prompt
  du modele (section "SKILLS DISPONIBLES"). Garder legage: max 2 skills matches.
verification: npm run build; grep "SKILLS" dans la sortie idle (ou /introspect memoire).

## GAP-3 — TOM branche dans processInput
status: pending
risk: low
file: src/core/cortex.ts (processInput) + src/cognition/theory-of-mind.ts
desc: TheoryOfMind.calibrateResponse(state) existe mais processInput utilise temperature/maxTokens fixes.
  Appeler this.tom.calibrateResponse(this.state) et utiliser le resultat (temperature, maxTokens,
  style) dans l'appel this.bridge.think(...). Ne pas casser le schema think().
verification: npm run build; node dist/index.js + /quit; pas d'erreur.

## GAP-4 — Verifier couvre aussi shell_exec
status: pending
risk: low
file: src/core/cortex.ts (boucle tool-calling)
desc: La verification post-action ne couvre que file_write. Ajouter: si toolName==='shell_exec'
  et result.success, verifier que le resultat ne contient pas de pattern d'erreur crasse
  (ex: "command not found", "EACCES", "Permission denied", "fatal:"). Si pattern => verifyNote KO.
verification: npm run build; node dist/index.js + /quit; pas d'erreur.

## GAP-5 — Unifier les deux systemes de budget
status: pending
risk: medium
file: src/core/state.ts + src/core/budget.ts + src/core/cortex.ts
desc: state a budgetSpent/cognitiveBudget (simple). core/budget.ts a un budget tokens complet.
  Choisir UNE source: faire de CortexState.budget un objet {spentPrompt, spentCompletion,
  maxPromptTokens, maxCompletionTokens} et deleguer a budget.ts. Retirer le champ simple.
  Mettre a jour chargeBudget/resetBudget dans cortex (init/reset par cycle deja fait).
  Attention a la migration de l'etat charge depuis cortex-state.json (version bump si besoin).
verification: npm run build; node dist/index.js + /quit; budgetSummary() coherent.

## GAP-6 — Bascule auto vers workflow sur tache complexe
status: pending
risk: medium
file: src/core/cortex.ts (processInput ou inject)
desc: Le cortex ne decide jamais d'utiliser runWorkflow. Heuristique: si l'input contient
  >=3 mots-cles parmi [pipeline, etape, sequence, puis, ensuite, agent, parallele, workflow, orchestr]
  OU si une decomposition spawner retourne >=3 sous-taches, proposer/declencher un workflow.
  Pour rester sur, declencher seulement si l'utilisateur a dit "workflow" ou si decomposition >=3.
  Generer la WorkflowDef depuis la decomposition et appeler this.runWorkflow(def).
verification: npm run build; test unitaire minimal: construire une def a la main + runWorkflow.

## GAP-7 — Self-consistency active par defaut (testee)
status: pending
risk: medium
file: src/models/bridge.ts (config.strategy) + src/core/cortex.ts (init)
desc: config.strategy='single' par defaut. Activer 'selfconsistency' pour le meta/critique local
  (Qwythos) afin de compenser sa faiblesse. AVANT d'activer, tester: faire 3 appels
  think('meta') avec self-consistency sur une question simple et verifier que la reponse
  est coherente (pas d'hallucination de format). Si le test echoue, laisser 'single' et
  marquer blocked avec la raison. Sinon activer pour 'meta'/'critique'.
verification: npm run build; script de test 3 tirages self-consistency, lire la sortie.
