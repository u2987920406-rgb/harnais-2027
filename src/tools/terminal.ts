/**
 * TerminalTool — Le cortex peut exécuter des commandes shell.
 *
 * Risque: dangerous par défaut. Le cortex doit justifier chaque commande.
 * Timeout configurable. Output tronqué si trop long.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { Tool, ToolResult } from './registry.js';
import { dockerRunCmd } from '../security/sandbox.js';

const execAsync = promisify(exec);

// Stratégies de sandbox disponibles pour l'exécution shell.
export type SandboxStrategy = 'none' | 'whitelist' | 'docker';

async function run(
  params: Record<string, any>,
  strategy: SandboxStrategy = 'none'
): Promise<ToolResult> {
  const start = Date.now();
  const command = params.command as string;
  const timeout = (params.timeout as number) ?? 10000;
  const cwd = params.cwd as string | undefined;

  // En stratégie docker, on enveloppe la commande dans un conteneur isolé.
  const effectiveCommand = strategy === 'docker' ? dockerRunCmd(command) : command;

  try {
    const { stdout } = await execAsync(effectiveCommand, {
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
      cwd: cwd ?? process.cwd(),
    });

    const truncated = stdout.length > 4000;
    return {
      success: true,
      output: truncated ? stdout.slice(0, 4000) + '\n...[tronqué]' : stdout,
      data: { command: effectiveCommand, exitCode: 0, truncated },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const stdout = err.stdout ?? '';
    const stderr = err.stderr ?? err.message;
    const timedOut = err.killed && err.signal === 'SIGTERM';
    return {
      success: false,
      output: stdout.slice(0, 2000) + '\n[stderr] ' + stderr.slice(0, 2000),
      error: timedOut ? `timeout apres ${timeout}ms` : `exit ${err.code ?? '?'}`,
      data: { command: effectiveCommand, exitCode: err.code, timedOut },
      durationMs: Date.now() - start,
    };
  }
}

export function createTerminalTools(
  strategy: SandboxStrategy = 'none'
): Tool[] {
  return [
    {
      name: 'shell_exec',
      description: 'Exécuter une commande shell (bash). Retourne stdout.',
      risk: 'dangerous',
      parameters: [
        { name: 'command', type: 'string', description: 'Commande à exécuter', required: true },
        { name: 'timeout', type: 'number', description: 'Timeout en ms (défaut: 10000)', required: false, default: 10000 },
        { name: 'cwd', type: 'string', description: 'Répertoire de travail', required: false },
      ],
      execute: (params) => run(params, strategy),
    },
  ];
}