#!/usr/bin/env node
/**
 * Harnais 2027 — Point d'entrée.
 *
 * Le harnais agentique du futur.
 * Cortex cognitif continu. Graphe de connaissance. Émergence. Consolidation.
 *
 * Usage:
 *   npm run dev              — démarre le cortex en mode interactif
 *   npm run dev -- --think   — une seule pensée de fond
 *   npm run dev -- --sleep   — force un cycle de sommeil
 *   npm run dev -- --inspect — introspection du cortex
 */

import { Cortex } from './core/cortex.js';
import type { Skill } from './core/skill.js';
import { createInterface } from 'readline';
import { join } from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { imageToAnsi } from './tools/image-ansi.js';
const execAsync = promisify(exec);

// Banniere Atlas (logo pixel art en ANSI truecolor) si le terminal supporte
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
function printBanner(): void {
  const logo = join(__dirname, '..', 'assets', 'atlas-logo.png');
  if (existsSync(logo) && process.stdout.isTTY) {
    try { console.log(imageToAnsi(logo, 64) + '\n'); return; } catch { /* ignore */ }
  }
  // Fallback texte
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         HARNAIS 2027 — CORTEX ACTIF              ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const cortex = new Cortex();

  await cortex.init();
  printBanner();

  // Avertissement de securite selon le mode de gouvernance actif
  const mode = cortex.governanceMode;
  if (mode === 'permission' || mode === 'edit') {
    const couleur = mode === 'permission' ? C.cyan : C.magenta;
    console.log(`${couleur}${C.bold}⚠  MODE ${mode.toUpperCase()} ACTIF${C.reset}${couleur} — les actions (shell_exec / ecriture) requierent votre validation.${C.reset}`);
    console.log(`${C.dim}   Basculez avec /mode auto pour le mode libre, ou /mode plan pour lecture seule.${C.reset}\n`);
  } else if (mode === 'plan') {
    console.log(`${C.yellow}${C.bold}⚠  MODE PLAN ACTIF${C.reset}${C.yellow} — aucune action ne sera executee (lecture seule).${C.reset}\n`);
  }

  // Mode inspection
  if (args.includes('--inspect')) {
    const introspection = await cortex.introspect();
    console.log(introspection);
    process.exit(0);
  }

  // Mode UI (dashboard web) — démarre le serveur et reste en vie
  if (args.includes('--ui')) {
    const portIdx = args.indexOf('--ui');
    const portArg = args[portIdx + 1];
    const port = portArg && !portArg.startsWith('-') ? parseInt(portArg, 10) : 7891;
    const url = await cortex.startUI(port);
    console.log(`\n  Dashboard UI: ${url}\n  Ctrl+C pour arrêter.\n`);

    // Garde le process en vie — le serveur tourne jusqu'à SIGINT
    process.on('SIGINT', async () => {
      console.log('\nArrêt du dashboard...');
      await cortex.stop();
      process.exit(0);
    });
    // Empêche le process de quitter
    setInterval(() => {}, 1 << 30);
    return;
  }

  // Mode sommeil forcé
  if (args.includes('--sleep')) {
    console.log('Mode sommeil forcé. Lancement de la consolidation profonde...\n');
    await cortex.sleepCycle();
    process.exit(0);
  }

  // Mode pensée unique
  if (args.includes('--think')) {
    console.log('Mode pensée unique. Une pensée de fond puis arrêt.\n');
    await cortex.idleThought();
    const introspection = await cortex.introspect();
    console.log(introspection);
    await cortex.stop();
    process.exit(0);
  }

  // Mode interactif par défaut — REPL agentique riche (0 dep, ANSI)
  await cortex.start();
  startRichRepl(cortex);
}

// ============================================================
// REPL agentique riche — couleurs, historique, prompt stylé,
// complétion Tab, barre de statut, TTS local (System.Speech Windows)
// ============================================================

// --- Helpers ANSI (0 dep, terminal 16 couleurs) ---
const C = {
  reset: '\x1b[0m', bold: '\x1b[1m', dim: '\x1b[2m',
  cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m',
  red: '\x1b[31m', magenta: '\x1b[35m', blue: '\x1b[34m',
  gray: '\x1b[90m', white: '\x1b[37m',
};
const MODE_COLOR: Record<string, string> = {
  auto: C.green, plan: C.yellow, permission: C.cyan, edit: C.magenta,
};
const colorOf = (mode: string) => MODE_COLOR[mode] ?? C.white;

// --- Historique persistant (fichier) ---
import { appendFileSync, readFileSync, existsSync } from 'fs';
import { homedir } from 'os';
const HIST_FILE = join(homedir(), '.atlas_history');
const loadHistory = (): string[] => {
  try { return existsSync(HIST_FILE) ? readFileSync(HIST_FILE, 'utf8').split('\n').filter(Boolean) : []; }
  catch { return []; }
};
const saveHistory = (line: string) => {
  try { appendFileSync(HIST_FILE, line + '\n'); } catch { /* ignore */ }
};

// --- TTS local (Windows System.Speech via PowerShell, 0 dep) ---
let ttsEnabled = false;
async function speak(text: string): Promise<void> {
  if (!ttsEnabled) return;
  const clean = text.replace(/[*_`#]/g, '').slice(0, 500);
  const ps = `Add-Type -AssemblyName System.speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${clean.replace(/'/g, "''")}')`;
  try { await execAsync(`powershell -NoProfile -Command "${ps}"`, { timeout: 15000 }); } catch { /* ignore */ }
}

// --- Barre de statut ---
function statusBar(cortex: Cortex): string {
  const s = cortex.state;
  const mode = cortex.governanceMode;
  return `${C.gray}┌─ Atlas ${C.reset}${colorOf(mode)}${C.bold}${mode}${C.reset} ${C.gray}| cycles ${s.cycles} | budget ${s.budgetSpent} | grappe ${cortex.graph.stats().nodes}n/${cortex.graph.stats().edges}e | tts ${ttsEnabled ? C.green + 'on' : C.gray + 'off'}${C.reset}${C.gray} ─┐${C.reset}`;
}

// --- Commandes ---
const COMMANDS = ['/introspect', '/sleep', '/graph', '/skills', '/ui', '/nayaos', '/mode', '/status', '/tts', '/quit', '/help', '/clear'];
const HELP = `
${C.bold}Commandes Atlas :${C.reset}
  /introspect  — état interne du cortex
  /sleep       — cycle de sommeil forcé
  /graph       — graphe de connaissance
  /skills      — skills chargées
  /ui          — démarrer le dashboard web
  /nayaos      — état de NayaOS
  /mode <m>    — changer le mode de gouvernance (auto|plan|permission|edit)
  /status      — barre de statut détaillée
  /tts         — activer/désactiver la lecture vocale (TTS)
  /clear       — effacer l'écran
  /quit        — arrêter
${C.dim}Tape un message libre pour parler au Cortex.${C.reset}`;

async function startRichRepl(cortex: Cortex): Promise<void> {
  const history = loadHistory();
  let histIdx = history.length;

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '',
    crlfDelay: Infinity,
  });

  const promptStr = () => `${C.cyan}${C.bold}Atlas${C.reset}${colorOf(cortex.governanceMode)} ❯ ${C.reset}`;

  const redrawPrompt = () => {
    process.stdout.write('\x1b[2K\r' + statusBar(cortex) + '\n' + promptStr());
  };

  console.log(statusBar(cortex));
  console.log(`${C.dim}Cortex en écoute. ${COMMANDS.length} commandes. Tape ${C.reset}${C.bold}/help${C.reset}${C.dim} pour la liste.${C.reset}\n`);
  process.stdout.write(promptStr());

  // Compltion Tab sur les commandes /
  (rl as any).completer = (line: string) => {
    if (line.startsWith('/')) {
      const hits = COMMANDS.filter(c => c.startsWith(line));
      return [hits.length ? hits : COMMANDS, line];
    }
    return [[], line];
  };

  rl.on('line', async (raw: string) => {
    const line = raw.trim();
    if (!line) { process.stdout.write(promptStr()); return; }
    saveHistory(line);

    // --- Commandes ---
    if (line === '/quit' || line === '/exit') {
      await cortex.stop(); process.exit(0);
    }
    if (line === '/help' || line === '/?') { console.log(HELP); process.stdout.write(promptStr()); return; }
    if (line === '/clear') { process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); redrawPrompt(); return; }
    if (line === '/status') { console.log(statusBar(cortex)); console.log(`  mode=${cortex.governanceMode} cycles=${cortex.state.cycles} budget=${cortex.state.budgetSpent}`); process.stdout.write(promptStr()); return; }
    if (line === '/tts') {
      ttsEnabled = !ttsEnabled;
      console.log(`${C.green}TTS ${ttsEnabled ? 'activé' : 'désactivé'}.${C.reset}`);
      process.stdout.write(promptStr()); return;
    }
    if (line.startsWith('/mode')) {
      const m = line.split(/\s+/)[1];
      const valid = ['auto', 'plan', 'permission', 'edit'];
      if (m && valid.includes(m)) {
        cortex.setGovernanceMode(m as any);
        console.log(`${colorOf(m)}Mode gouvernance → ${m}${C.reset}`);
      } else {
        console.log(`${C.yellow}Usage: /mode <auto|plan|permission|edit>${C.reset}`);
      }
      process.stdout.write(promptStr()); return;
    }
    if (line === '/introspect') { console.log('\n' + await cortex.introspect() + '\n'); process.stdout.write(promptStr()); return; }
    if (line === '/sleep') { console.log('\nCycle de sommeil...\n'); await cortex.sleepCycle(); console.log('Terminé.\n'); process.stdout.write(promptStr()); return; }
    if (line === '/graph') { console.log('\n' + cortex.graph.toContext(30) + '\n'); process.stdout.write(promptStr()); return; }
    if (line === '/skills') {
      const list = cortex.skills.list();
      console.log(`\n${list.length} skills :`);
      console.log(list.map((s: Skill) => `  ${C.cyan}[${s.tags?.join(',') ?? ''}]${C.reset} ${s.name}`).join('\n'));
      console.log(''); process.stdout.write(promptStr()); return;
    }
    if (line === '/nayaos') {
      const alive = await cortex.nayaos.ping();
      console.log(alive ? '\nNayaOS EN LIGNE\n' : '\nNayaOS hors ligne.\n');
      process.stdout.write(promptStr()); return;
    }
    if (line === '/ui') { const url = await cortex.startUI(); console.log(`\nDashboard: ${C.cyan}${url}${C.reset}\n`); process.stdout.write(promptStr()); return; }

    // --- Interaction libre avec le Cortex ---
    process.stdout.write(`${C.gray}…${C.reset}`);
    const response = await cortex.inject(line);
    process.stdout.write('\r\x1b[K');
    console.log(`${colorOf(cortex.governanceMode)}${C.bold}Cortex »${C.reset} ${response}\n`);
    await speak(response);
    redrawPrompt();
  });

  rl.on('close', async () => { await cortex.stop(); process.exit(0); });
  process.on('SIGINT', async () => { console.log('\nArrêt...'); await cortex.stop(); process.exit(0); });

  // Flèches haut/bas = historique
  process.stdin.on('keypress', (_str, key) => {
    if (!key) return;
    if (key.name === 'up') { if (histIdx > 0) { histIdx--; process.stdout.write('\r\x1b[K' + promptStr() + history[histIdx]); (rl as any).line = history[histIdx]; } }
    if (key.name === 'down') { if (histIdx < history.length - 1) { histIdx++; process.stdout.write('\r\x1b[K' + promptStr() + history[histIdx]); (rl as any).line = history[histIdx]; } else { histIdx = history.length; process.stdout.write('\r\x1b[K' + promptStr()); (rl as any).line = ''; } }
  });
}


main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});