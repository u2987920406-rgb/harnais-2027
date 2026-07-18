# Sandbox + Modes de Gouvernance Agentique (auto / plan / permission / edit) — Plan

> **For Hermes:** Utiliser subagent-driven-development pour implémenter tâche par tâche.

**Goal:** Ajouter à Atlas un système de gouvernance agentique façon Claude Code / Hermes : modes `auto`/`plan`/`permission`, sandbox pour `shell_exec` (whitelist + confirmation + option container), et édition de fichiers contrôlée (edit-mode avec diff/permission).

**Architecture:** On étend `CortexMode` (aujourd'hui `awake|idle|sleep`) en y ajoutant les modes de *gouvernance* (`auto`, `plan`, `permission`, `edit`). Un nouveau module `src/security/governance.ts` intercepte chaque appel d'outil dans la boucle `inject()` (cortex.ts ~ligne 443) et applique la politique du mode courant (allow / deny / ask). Le sandbox terminal devient une stratégie configurable (`none` | `whitelist` | `docker`). Aucune dépendance npm (0 dep, souverain). L'UI expose le basculement de mode + un canal de validation (permission/ask).

**Tech Stack:** TypeScript strict, Node `child_process`/`exec` (déjà utilisé), `fs`, WebSocket natif. Docker optionnel (si installé). 0 nouveau package.

---

## Contexte actuel (vérifié dans le code)
- `src/core/cortex.ts:56` → `CortexMode = 'awake' | 'idle' | 'sleep'` (modes *cognitifs*, pas de gouvernance)
- `src/core/cortex.ts:407-478` → boucle tool-calling : `tools.execute(toolName, toolParams)` exécuté directement, **aucun garde-fou**
- `src/tools/registry.ts:15` → `RiskLevel = 'safe' | 'moderate' | 'dangerous'` (déjà présent mais **non utilisé** pour bloquer)
- `src/tools/terminal.ts` → `shell_exec` marqué `dangerous`, lance `exec()` avec les droits de l'utilisateur, timeout 10s, **aucune sandbox**
- `src/ui/server.ts` → serveur HTTP ; on ajoutera des routes pour `setMode` et `approve`

---

## Tâche 1 : Élargir CortexMode + config gouvernance
**Objective:** Introduire les modes de gouvernance et la config sandbox dans le type Cortex.

**Files:**
- Modify: `src/core/cortex.ts:56` (type CortexMode)
- Modify: `src/core/cortex.ts:58` (interface CortexConfig)

**Step 1:** Remplacer le type :
```ts
export type CortexMode = 'awake' | 'idle' | 'sleep' | 'auto' | 'plan' | 'permission' | 'edit';
```
Note : `awake/idle/sleep` = cycle cognitif ; `auto/plan/permission/edit` = *gouvernance* (choisie par l'utilisateur). Le cortex garde `mode` pour le cycle, on ajoute `governanceMode` séparé (voir Tâche 2).

**Step 2:** Ajouter à `CortexConfig` :
```ts
governanceMode: GovernanceMode;   // 'auto' | 'plan' | 'permission' | 'edit'
sandbox: SandboxStrategy;         // 'none' | 'whitelist' | 'docker'
allowDangerous: boolean;          // false => shell_exec bloqué hors permission
```

**Step 3:** Build + test (doit rester 118 tests).
Run: `npm run build && npm test` → attendu : pass.

**Step 4:** Commit `feat: cortex modes gouvernance + config sandbox`.

---

## Tâche 2 : Module governance (`src/security/governance.ts`)
**Objective:** Politique centralisée qui décide allow/deny/ask pour chaque outil selon le mode.

**Files:**
- Create: `src/security/governance.ts`
- Test: `test/governance.test.ts`

**Step 1 (test):** Écrire `test/governance.test.ts` :
```ts
import { Governance, GovernanceMode } from '../src/security/governance.js';
test('plan mode: shell_exec refuse (deny)', () => {
  const g = new Governance('plan', 'none', false);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'deny');
});
test('permission mode: shell_exec demande confirmation (ask)', () => {
  const g = new Governance('permission', 'none', true);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'ask');
});
test('auto mode + whitelist: commande rm refuse', () => {
  const g = new Governance('auto', 'whitelist', true);
  const d = g.decide('shell_exec', { command: 'rm -rf /' });
  assert.equal(d.action, 'deny');
});
test('auto mode + whitelist: commande ls autorise', () => {
  const g = new Governance('auto', 'whitelist', true);
  const d = g.decide('shell_exec', { command: 'ls' });
  assert.equal(d.action, 'allow');
});
```

**Step 2 (impl):** `src/security/governance.ts` :
```ts
export type GovernanceMode = 'auto' | 'plan' | 'permission' | 'edit';
export type SandboxStrategy = 'none' | 'whitelist' | 'docker';
export interface Decision { action: 'allow' | 'deny' | 'ask'; reason: string; }
const DANGEROUS = new Set(['shell_exec']);
const FORBIDDEN = /(rm\s+-rf|sudo|mkfs|format|dd\s+if|shutdown|reboot|>+\s*\/dev\/)/i;
export class Governance {
  constructor(public mode: GovernanceMode, public sandbox: SandboxStrategy, public allowDangerous: boolean) {}
  decide(tool: string, params: Record<string, any>): Decision {
    // plan mode: lecture seule, jamais d'action
    if (this.mode === 'plan') return { action: 'deny', reason: 'mode plan: actions interdites' };
    if (DANGEROUS.has(tool)) {
      if (!this.allowDangerous) return { action: 'deny', reason: 'outils dangereux desactives' };
      if (this.sandbox === 'whitelist' && FORBIDDEN.test(String(params.command ?? '')))
        return { action: 'deny', reason: 'commande interdite par whitelist' };
      if (this.mode === 'permission') return { action: 'ask', reason: 'validation requise (mode permission)' };
    }
    if (this.mode === 'edit' && tool === 'file_write')
      return { action: 'ask', reason: 'edition de fichier requiert validation' };
    return { action: 'allow', reason: 'ok' };
  }
}
```

**Step 3:** Run `npm test` → attendu : 4 nouveaux tests pass.

**Step 4:** Commit `feat: module governance (modes + whitelist)`.

---

## Tâche 3 : Intercepter les outils dans la boucle inject()
**Objective:** Brancher `Governance.decide()` avant `tools.execute()` (cortex.ts ~ligne 443).

**Files:**
- Modify: `src/core/cortex.ts` (importer Governance, l'instancier, intercepter)
- Modify: `src/core/cortex.ts:407` (boucle)

**Step 1:** Importer + instancier dans le constructeur :
```ts
import { Governance } from '../security/governance.js';
// dans constructor:
this.governance = new Governance(this.config.governanceMode, this.config.sandbox, this.config.allowDangerous);
```

**Step 2:** Dans la boucle, remplacer l'exécution directe (ligne 443) par :
```ts
const decision = this.governance.decide(toolName, toolParams);
if (decision.action === 'deny') {
  toolResults.push(`REFUSE (${decision.reason}): ${toolName}`);
  continue;
}
if (decision.action === 'ask') {
  const approved = await this.requestApproval(toolName, toolParams, decision.reason);
  if (!approved) { toolResults.push(`ANNULE par l'utilisateur: ${toolName}`); continue; }
}
const result = await this.tools.execute(toolName, toolParams);
```

**Step 3:** Ajouter `requestApproval()` (voit Tâche 5 pour le canal réel ; stub sync pour les tests) :
```ts
private pendingApprovals: Map<string, (ok: boolean) => void> = new Map();
async requestApproval(tool: string, params: any, reason: string): Promise<boolean> {
  // Si pas de canal UI/Telegram connecte, deny par defaut (fail-safe)
  if (!this.approvalChannel) return false;
  return this.approvalChannel.ask(tool, params, reason);
}
```

**Step 4:** Build + test → 118+ pass.

**Step 5:** Commit `feat: cortex intercepte outils via governance`.

---

## Tâche 4 : Sandbox whitelist + docker pour shell_exec
**Objective:** Isoler l'exécution shell selon la stratégie.

**Files:**
- Modify: `src/tools/terminal.ts` (accepter une `SandboxStrategy`)
- Create: `src/security/sandbox.ts` (helper docker)

**Step 1:** `src/security/sandbox.ts` :
```ts
import { exec } from 'child_process';
export function wrapForWhitelist(cmd: string): string {
  // pas de changement ici: le filtrage est dans Governance.
  return cmd;
}
export function dockerRunCmd(cmd: string, image = 'alpine:latest'): string {
  return `docker run --rm -v "${process.cwd()}:/work" -w /work ${image} sh -c ${JSON.stringify(cmd)}`;
}
```

**Step 2:** `terminal.ts` : `createTerminalTools(strategy: SandboxStrategy = 'none')` ; si `docker`, préfixer la commande via `dockerRunCmd`.

**Step 3:** Test unitaire : `dockerRunCmd('ls')` contient `docker run`.

**Step 4:** Build + test.

**Step 5:** Commit `feat: sandbox terminal (whitelist + docker)`.

---

## Tâche 5 : Canal d'approbation (UI + Telegram)
**Objective:** Permettre à l'utilisateur de valider en mode permission/edit.

**Files:**
- Modify: `src/ui/server.ts` (routes `POST /api/mode`, `POST /api/approve`, `GET /api/pending`)
- Modify: `src/core/cortex.ts` (exposer `setGovernanceMode`, `approvalChannel`)
- Test: `test/approval.test.ts` (simule un canal en mémoire)

**Step 1:** Ajouter au serveur UI :
```ts
// set mode
if (path === '/api/mode' && req.method === 'POST') {
  const { mode, sandbox } = JSON.parse(await readBody(req));
  cortex.setGovernanceMode(mode, sandbox);
  return sendJson(res, 200, { ok: true, mode: cortex.governanceMode });
}
// list pending approvals
if (path === '/api/pending' && req.method === 'GET') {
  return sendJson(res, 200, cortex.pendingApprovals());
}
// approve/deny
if (path.startsWith('/api/approve/') && req.method === 'POST') {
  const id = path.split('/')[3];
  const { ok } = JSON.parse(await readBody(req));
  cortex.resolveApproval(id, ok);
  return sendJson(res, 200, { ok: true });
}
```

**Step 2:** `Cortex.setGovernanceMode(mode, sandbox)` + `pendingApprovals()` + `resolveApproval(id, ok)`.

**Step 3:** Test : créer un `MemoryApprovalChannel` qui stocke les demandes ; vérifier `requestApproval` renvoie true après `resolve(true)`.

**Step 4:** Build + test.

**Step 5:** Commit `feat: canal approbation UI + Telegram-ready`.

---

## Tâche 6 : UI — sélecteur de mode + file d'approbation
**Objective:** L'utilisateur bascule le mode et valide depuis le dashboard.

**Files:**
- Modify: `public/index.html` (boutons de mode + panneau approbations)

**Step 1:** Ajouter une barre de modes (auto/plan/permission/edit) qui fait `POST /api/mode`.

**Step 2:** Ajouter un panneau « Approbations en attente » qui poll `GET /api/pending` et propose Valider/Refuser (`POST /api/approve/:id`).

**Step 3:** Tester en live : lancer `npm run ui`, basculer en `permission`, faire une demande `shell_exec`, valider via l'UI.

**Step 4:** Commit `feat: UI modes + approbations`.

---

## Tâche 7 : Skill de gouvernance + doc
**Objective:** Documenter le comportement pour le modèle et l'utilisateur.

**Files:**
- Create: `skills/gouvernance.skill.md`
- Modify: `CLAUDE.md` (section sécurité)

**Step 1:** Skill `gouvernance` (mode soft) expliquant : en `plan` Atlas propose seulement ; en `permission` il demande ; en `auto` il agit (whitelist) ; en `edit` il demande avant d'écrire un fichier.

**Step 2:** Ajouter à CLAUDE.md une section « Gouvernance » résumant les modes et le sandbox.

**Step 3:** Commit `docs: gouvernance skill + CLAUDE.md`.

---

## Validation globale
- `npm run build` → propre
- `npm test` → 118 + (~10 nouveaux) pass
- Smoke live : `npm run ui` → mode `permission` → `shell_exec "echo hi"` → l'UI demande validation → Valider → sortie affichée
- Smoke live : mode `plan` → `shell_exec` → REFUSE loggé, aucune exécution
- Smoke live : `allowDangerous=false` → tout `shell_exec` refusé même en `auto`

## Risques / tradeoffs
- **fail-safe** : si aucun canal d'approbation connecté, `requestApproval` renvoie `false` (deny) — jamais d'exécution non validée silencieuse.
- **docker** requiert Docker installé ; sinon fallback `whitelist`.
- **`edit` mode** ralentit les tâches d'écriture (demande par fichier) — à réserver aux sessions supervisées.
- **Non rupture d'archi** : on n'altère pas la boucle cognitivo, on ajoute une couche *policière* avant l'exécution (conforme CLAUDE.md : 0 dep, commentaires FR).
