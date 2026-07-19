# Harnais 2027 -> Hermes Agent : cartographie de faisabilite

But : savoir, module par module, ce que Hermes Agent donne DEJA (natif),
ce qui est equivalent (a rerouter), et ce qu'il FAUT coder toi-meme.

Scan du repo au 2026-07-17 : 67 fichiers .ts (src/ + test/), 0 dep npm,
~5700 lignes. Le coeur est `src/core/cortex.ts` (870 lignes) : boucle
cognitive continue 6 etapes + 3 modes AWAKE/IDLE/SLEEP + gouvernance.

LEGENDE
  [NATIF]        Hermes le fait deja, pas de code a ecrire
  [EQUIV]       Hermes le fait autrement, on reroute/configure
  [MCP]         On branche NayaOS/NayaQA comme serveur MCP Hermes
  [A CODER]     N'existe pas dans Hermes, il faut l'ecrire (skill/module)
  [PARTIEL]     Hermes couvre une partie, le reste a coder

============================================================
1. COEUR COGNITIF  (la partie qui ne mappe PAS sur Hermes)
============================================================

core/cortex.ts           [A CODER]  <- LE gros morceau
  Boucle tick (observer>evaluer>decider>agir>apprendre>consolider)
  + 3 modes AWAKE/IDLE/SLEEP + orchestration de tout le reste.
  Hermes a une boucle agentique mais PAS cette cognition continue
  specifique, et on ne peut PAS injecter la tienne DANS sa loop.
  Solutions :
    * (a) Skill Hermes `harnais-cortex` qui modelise la boucle via
         cron (IDLE/SLEEP) + etat persistant + appels au spawner natif.
    * (b) Garder cortex.ts tel quel et lancer via Hermes comme
         executeur autonome (option B de la discussion).

core/state.ts            [PARTIEL]
  Etat mental persistant (focus, hypotheses, emotionalTone,
  workingMemory, backgroundThreads).
  Hermes a `memory` persistante + user profile, mais pas cette
  structure. -> modeler en JSON + skill, reutiliser memory Hermes
  pour le ToM/USER.

core/budget.ts           [PARTIEL]
  Garde anti-boucle + anti-cout (tokens + iterations).
  Hermes a max-turns / garde-fores natives, pas ce compteur precis.
  -> rerouter via config Hermes + un petit module budget si besoin.

core/strategies.ts       [A CODER]  self-consistency + debate
  N tirages + vote / N modeles + juge.
  -> Skill Hermes qui orchestre N appels model et agrege.
  Facile a faire, tres utile, a garder.

core/workflow.ts         [PARTIEL]  moteur type n8n (nodes+edges, topo)
  Hermes n'a pas de workflow engine graphique, mais cron +
  delegate_task couvrent la plupart des cas. -> soit coder le
  moteur topologique en skill, soit remplacer par cron/delegate.

core/skill.ts            [NATIF]
  Registry de skills (.skill.md, frontmatter + markdown).
  C'EST EXACTEMENT le systeme de skills de Hermes. 0 code.

============================================================
2. MODELES / ROUTAGE
============================================================

core/router.ts           [NATIF]
  Routeur par capacite, local-first, tri par tier.
  Hermes fait ca dans sa config de providers (local-first,
  fallback chain). Equivalent direct, 0 code.

models/bridge.ts         [NATIF]
  Abstraction unifiee + router + budget + strategies.
  Couvert par la config providers Hermes + strategies en skill.

models/ollama.ts         [NATIF]
  Connexion HTTP directe a Ollama (fetch).
  Ollama est un provider natif Hermes (local + cloud). 0 code.

models/nous-portal.ts    [NATIF]
  Fallback via Nous Portal (tencent/hy3:free).
  Deja un provider Hermes. 0 code.

============================================================
3. MEMOIRE / CONNAISSANCE  (a coder, Hermes ne les a pas)
============================================================

memory/knowledge-graph.ts [A CODER]  graphe persistant
  Noeuds + aretes + poids + oubli. Hermes n'a pas de graphe de
  connaissances. -> skill + fichier JSON (data/knowledge-graph.json
  existe deja dans ton repo, on le reutilise).

memory/vector-store.ts   [PARTIEL]  RAG vectoriel
  Embeddings + recherche. Hermes a une couche memory/RAG mais pas
  ce format. -> reutiliser ton vectors.json ou coder un store leger.

memory/consolidation.ts  [A CODER]  cycle de sommeil
  Patterns, integration, oubli. Mappe sur mode SLEEP du cortex.
  -> skill `harnais-consolidation` lance par cron (sleepInterval).

cognition/theory-of-mind.ts [A CODER]  modele de l'utilisateur
  Ton, engagement, preferences. Hermes a un user profile basique
  dans memory, mais pas cette structure calibree. -> skill/module.

============================================================
4. SPAWNER / SOUS-AGENTS
============================================================

cognition/spawner.ts     [PARTIEL]
  Sous-agents ephemeriques dynamiques (prompt genere a la volee).
  Hermes `delegate_task` cree des sous-agents (background, isolation
  de contexte), MAIS : profondeur max 1 (pas de delegation imbriquee)
  et pas de "threads d'arriere-plan continus" comme ton IDLE.
  -> couvre 80% de l'usage. Le reste (threads IDLE persistants) =
  cron + skill.

============================================================
5. PONTS VERS NAYAOS / NAYAQA
============================================================

bridge/nayaos.ts         [MCP]  pont HTTP lecture+commande
  -> Brancher NayaOS comme serveur MCP Hermes. Au lieu de coder
  l'API REST, on expose les endpoints NayaOS en outils MCP.

bridge/nayaqa.ts         [MCP]  lecture verdicts + Retex
  -> Idem, serveur MCP NayaQA. 0 code TS, config MCP.

tools/nayaos-tools.ts    [MCP]  outils NayaOS pour le registry
  -> Remplace par les outils exposes par le MCP NayaOS ci-dessus.

============================================================
6. OUTILS
============================================================

tools/registry.ts        [NATIF]  registre schema + risque
  C'est le systeme d'outils natif de Hermes. 0 code.

tools/filesystem.ts      [NATIF]  read/write/list/search
tools/terminal.ts        [NATIF]  exec shell async
tools/web.ts             [NATIF]  DuckDuckGo + extract
tools/vision.ts          [NATIF]  analyse image
tools/speech.ts          [NATIF]  TTS/STT (OpenAI sous Nous)
tools/browser.ts         [NATIF]  navigation web
  Tous equivalents natifs Hermes. 0 code.

tools/image-ansi.ts      [A CODER]  rendu ASCII/couleur
  Specifique a ton UI. -> skill ou skip si pas d'UI.

============================================================
7. VERIFICATION / SECURITE / GOUVERNANCE
============================================================

verify/verifier.ts       [PARTIEL]  testgen + sandbox + vision
  Hermes a build/test natifs + sandbox, mais pas ce verificateur
  composable. -> skill `harnais-verify` qui orchestre.

security/governance.ts   [NATIF]  modes auto/plan/permission/edit
  Hermes a governance (approve, permissions, sandbox) native.
  Equivalent direct.

security/sandbox.ts      [NATIF]  none/whitelist/docker
  Hermes sandbox natif. 0 code.

security/audit-log.ts    [NATIF]  journal signe
  Hermes log/audit natif. 0 code.

security/telegram-approval.ts [NATIF]  canal d'approbation
  Hermes Telegram gateway deja connecte (Raf appaire). 0 code.

============================================================
8. UI / SCENARIOS / ENTREE
============================================================

ui/server.ts             [PARTIEL]  dashboard HTTP+WS
ui/dashboard-html.ts     [PARTIEL]  canvas force-directed
  Hermes est CLI (pas de dashboard web natif). -> soit coder un
  petit serveur en skill (reutiliser ton code), soit utiliser
  les browser tools pour piloter. A coder si tu veux garder le
  dashboard temps reel.

scenarios/self-improvement.ts [A CODER]  auto-amelioration
  Observe->detecte->avertit->agit->apprend. -> skill `harnais-auto`
  qui orchestre build+test+git+rapport. Tres pertinent pour ton
  usage autonome. A garder en priorite.

index.ts                 [NATIF]  point d'entree CLI
  Remplace par la CLI Hermes elle-meme. 0 code.

============================================================
BILAN
============================================================

Gratuit / natif Hermes (0 code) :
  router, bridge, ollama, nous-portal, skill, registry,
  filesystem, terminal, web, vision, speech, browser,
  governance, sandbox, audit-log, telegram-approval, index.

Reroutable (config / MCP, 0 code TS) :
  nayaos, nayaqa, nayaos-tools  -> serveurs MCP.

A coder toi-meme (la valeur ajoutee Harnais) :
  cortex (boucle 3 modes)        <- le coeur, le plus gros
  knowledge-graph + vector-store
  consolidation (SLEEP)
  theory-of-mind
  strategies (self-consistency/debate)
  spawner (threads IDLE continus)
  verifier
  self-improvement (auto)
  ui (si dashboard voulu)
  state (structure persistance)

Soit : ~15 modules sur 67 sont uniques a Harnais et representent
ta propriete intellectuelle. Le reste (~52 fichiers : plomberie
modeles/outils/securite) est couvert par Hermes.

TRADE-OFF PRINCIPAL
  - Tu gagnes du temps sur la plomberie (routing, outils,
    persistence, scheduling, delegation, securite, Telegram).
  - Tu perds le controle absolu de la LOOP (cortex) et la
    souverainete "0 dependance" : Hermes est un binaire externe,
    meme si les modeles restent Ollama/local-first.

PROCHAINE ETAPE (option B proposée)
  Rebatir les ~15 modules "a coder" en skills Hermes + fichiers
  JSON persistants, en gardant build+test a chaque etape.
  Commencer par cortex + knowledge-graph (le coeur), puis
  strategies + self-improvement (le plus utile pour ton autonomie).

═══════════════════════════════════════════════════════
COUCHE ORCHESTRATION — 5 MODULES AJOUTES (P1→P5)
═══════════════════════════════════════════════════════
Au lieu de migrer vers Hermes (option A/B), on a comble les 5
manques d'orchestration DIRECTEMENT dans Atlas. Le cortex garde
sa loop souveraine ET gagne les capacites d'orchestration Hermes.
Tous 0-dep, build+test verts (173 tests).

─── P1 · Delegation par lot (dispatch) ───
Fichier : src/cognition/spawner.ts
Equivaut a : delegate_task (Hermes, max_concurrent_children=3)
Ce que ca fait : traite N buts independants en parallele mais avec
concurrence BORNEE (defaut 3) — evite de saturer Ollama. Chaque
tache dans son contexte isole, renvoie { results, summary }.

  const { results, summary } = await cortex['spawner'].dispatch(
    ['analyse le module X', 'resume les logs', 'liste les TODO'],
    { concurrency: 3, mode: 'reasoning' }
  );

─── P2 · Scheduler recurrent (type cron) ───
Fichier : src/core/scheduler.ts   (persistance data/scheduler.json)
Equivaut a : cron jobs (Hermes)
Ce que ca fait : jobs recurrents rejoues automatiquement en mode
IDLE. Deux schedules : { kind:'every', minutes:N } et
{ kind:'daily', atHour:H }. Chaque run ecrit un noeud episode
dans le graphe + sauve lastRun/runCount/lastOutput.

  cortex.addScheduledJob('rapport-matin',
    { kind: 'daily', atHour: 9 },
    'Fais un resume du projet + lance build+test'
  );
  // tourne tout seul quand le cortex est en idle

─── P3 · Toolset-scoping (isolation d'outils) ───
Fichiers : src/tools/registry.ts + src/cognition/spawner.ts
Equivaut a : enabled_toolsets (Hermes)
Ce que ca fait : restreint les outils visibles par un sous-agent.
Un agent "recherche" ne voit que web/filesystem, jamais le
terminal dangereux. Scope par spawn OU par defaut.

  registry.scoped(['web_search', 'fs_read']);      // registre filtre
  spawner.setToolScope(['web_search']);            // defaut
  await spawner.spawn({ ..., tools: ['fs_read'] }); // par spawn

─── P4 · MCPBridge (extensibilite externe) ───
Fichier : src/tools/mcp.ts   (client MCP stdio, JSON-RPC 2.0)
Equivaut a : serveurs MCP (Hermes)
Ce que ca fait : consomme un serveur MCP externe et expose ses
outils dans le ToolRegistry (prefixes mcp_<serveur>_<outil>).
Handshake initialize + tools/list + tools/call. Charge au
demarrage via CortexConfig.mcpServers, non bloquant.

  new Cortex({ mcpServers: [
    { command: 'npx', args: ['-y','@modelcontextprotocol/server-filesystem','/data'],
      name: 'fs' }
  ]});
  // ATTENTION : ne PAS re-exposer NayaOS via MCP (regle: le
  // harnais ne repompe pas NayaOS) — garder bridge/nayaos.ts natif.
  // MCP = pour de NOUVEAUX outils externes uniquement.

─── P5 · ProcessRegistry (demons long-lived) ───
Fichier : src/tools/process-registry.ts
Equivaut a : background process registry (Hermes)
Ce que ca fait : lance et surveille des process long-lived
(serveurs, watchers). Ring-buffer de sortie borne, poll
incrementiel (nouvelles lignes seulement), kill, list, prune.
killAll() a l'arret du cortex (aucun orphelin).

  const p = cortex.procs.start('node', { args: ['server.js'] });
  const { proc, newOutput } = cortex.procs.poll(p.id);
  cortex.procs.kill(p.id);

─── Note technique ───
Le linter affiche des TS1343 (import.meta) et TS2802 (Map
iteration) sur ces fichiers : ce sont des FAUX-POSITIFS de la
config lint, presents partout dans le repo. Le vrai `npm run
build` (tsc) passe a 0 erreur. Verifie : npm run build && npm test.

