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

async function main() {
  const args = process.argv.slice(2);
  const cortex = new Cortex();

  await cortex.init();
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         HARNAIS 2027 — CORTEX ACTIF              ║');
  console.log('║                                                  ║');
  console.log('║  Cognition continue. Graphe de connaissance.     ║');
  console.log('║  Émergence. Consolidation. Zéro Claude.          ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');

  // Mode inspection
  if (args.includes('--inspect')) {
    const introspection = await cortex.introspect();
    console.log(introspection);
    process.exit(0);
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

  // Mode interactif par défaut
  await cortex.start();

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log("Cortex en ecoute. Tape ton message, ou:");
  console.log("  /introspect  -- voir l'etat interne");
  console.log("  /sleep       -- forcer un cycle de sommeil");
  console.log("  /graph       -- voir le graphe de connaissance");
  console.log("  /skills      -- lister les skills charges");
  console.log("  /nayaos      -- verifier l'etat de NayaOS");
  console.log("  /quit        -- arreter\n");

  rl.on('line', async (line: string) => {
    const input = line.trim();
    if (!input) return;

    if (input === '/quit' || input === '/exit') {
      await cortex.stop();
      rl.close();
      process.exit(0);
    }

    if (input === '/introspect') {
      const introspection = await cortex.introspect();
      console.log('\n' + introspection + '\n');
      return;
    }

    if (input === '/sleep') {
      console.log('\nCycle de sommeil forcé...\n');
      await cortex.sleepCycle();
      console.log('\nTerminé.\n');
      return;
    }

    if (input === '/graph') {
      console.log('\n' + cortex.graph.toContext(30) + '\n');
      return;
    }

    if (input === '/nayaos') {
      const nayaos = cortex.nayaos;
      const alive = await nayaos.ping();
      if (alive) {
        const projects = await nayaos.listProjects();
        const agents = await nayaos.listAgents();
        console.log(`\nNayaOS EN LIGNE`);
        console.log(`  Projets: ${projects.length}`);
        console.log(`  Agents: ${agents.length}\n`);
      } else {
        console.log('\nNayaOS hors ligne.\n');
      }
      return;
    }

    if (input === '/skills') {
      const list = cortex.skills.list();
      console.log(`\n${list.length} skills charges:`);
      console.log(list.map((s: Skill) => `  [${s.tags?.join(',') ?? ''}] ${s.name}`).join('\n'));
      console.log('');
      return;
    }

    // Interaction normale
    console.log('');
    const response = await cortex.inject(input);
    console.log('\n[Cortex] ' + response + '\n');
  });

  rl.on('close', async () => {
    await cortex.stop();
    process.exit(0);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nSIGINT reçu. Arrêt en cours...');
    await cortex.stop();
    process.exit(0);
  });
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});