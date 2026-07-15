/**
 * TerminalTool — Le cortex peut exécuter des commandes shell.
 *
 * Risque: dangerous par défaut. Le cortex doit justifier chaque commande.
 * Timeout configurable. Output tronqué si trop long.
 */

import { execSync } from 'child_process';
import { Tool, ToolResult } from './registry.js';

async function run(params: Record<string, any>): Promise<ToolResult> {
  const start = Date.now();
  try {
    const command = params.command as string;
    const timeout = (params.timeout as number) ?? 10000;
    const cwd = params.cwd as string | undefined;

    const output = execSync(command, {
      timeout,
      maxBuffer: 1024 * 1024,
      encoding: 'utf-8',
      cwd: cwd ?? process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const truncated = output.length > 4000;
    return {
      success: true,
      output: truncated ? output.slice(0, 4000) + '\n...[tronqué]' : output,
      data: { command, exitCode: 0, truncated },
      durationMs: Date.now() - start,
    };
  } catch (err: any) {
    const stdout = err.stdout ?? '';
    const stderr = err.stderr ?? err.message;
    return {
      success: false,
      output: stdout.slice(0, 2000) + '\n[stderr] ' + stderr.slice(0, 2000),
      error: `exit ${err.status ?? '?'}`,
      data: { command: params.command, exitCode: err.status },
      durationMs: Date.now() - start,
    };
  }
}

export function createTerminalTools(): Tool[] {
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
      execute: run,
    },
  ];
}