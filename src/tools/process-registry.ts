/**
 * ProcessRegistry — Gestionnaire léger de processus long-lived (démons, watchers,
 * serveurs) — équivalent du registre de process en arrière-plan de Hermes.
 *
 * 0 dépendance npm (child_process). Chaque process a un id, un état, un
 * ring-buffer de sortie (stdout+stderr fusionnés, borné) et un code de sortie.
 * Permet: start, poll (statut + nouvelle sortie), log (sortie complète bornée),
 * kill, list. Utile pour le cortex qui veut lancer un serveur/daemon et le
 * surveiller sans bloquer la boucle tick.
 */

import { spawn, type ChildProcess } from 'child_process';

export type ProcStatus = 'running' | 'exited' | 'error';

export interface ManagedProc {
  id: string;
  command: string;
  args: string[];
  status: ProcStatus;
  pid?: number;
  exitCode: number | null;
  startedAt: number;
  endedAt?: number;
  error?: string;
}

interface ProcEntry extends ManagedProc {
  child: ChildProcess;
  buffer: string[];       // ring-buffer de lignes
  readCursor: number;     // curseur pour poll (lignes déjà lues)
}

export interface StartOptions {
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  maxLines?: number;      // taille du ring-buffer (défaut 500)
}

export class ProcessRegistry {
  private procs = new Map<string, ProcEntry>();
  private seq = 0;
  private defaultMaxLines: number;

  constructor(defaultMaxLines = 500) {
    this.defaultMaxLines = defaultMaxLines;
  }

  /** Démarre un process long-lived et renvoie son descripteur. */
  start(command: string, opts: StartOptions = {}): ManagedProc {
    const id = `proc-${++this.seq}`;
    const args = opts.args ?? [];
    const maxLines = opts.maxLines ?? this.defaultMaxLines;

    const child = spawn(command, args, {
      cwd: opts.cwd ?? process.cwd(),
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const entry: ProcEntry = {
      id,
      command,
      args,
      status: 'running',
      pid: child.pid,
      exitCode: null,
      startedAt: Date.now(),
      child,
      buffer: [],
      readCursor: 0,
    };

    const push = (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (line === '') continue;
        entry.buffer.push(line);
        if (entry.buffer.length > maxLines) {
          entry.buffer.shift();
          if (entry.readCursor > 0) entry.readCursor--;
        }
      }
    };

    if (child.stdout) child.stdout.on('data', push);
    if (child.stderr) child.stderr.on('data', push);

    child.on('error', (err) => {
      entry.status = 'error';
      entry.error = err.message;
      entry.endedAt = Date.now();
    });

    child.on('exit', (code) => {
      entry.status = 'exited';
      entry.exitCode = code;
      entry.endedAt = Date.now();
    });

    this.procs.set(id, entry);
    return this.snapshot(entry);
  }

  /** Statut + nouvelles lignes depuis le dernier poll. */
  poll(id: string): { proc: ManagedProc; newOutput: string[] } | null {
    const entry = this.procs.get(id);
    if (!entry) return null;
    const newOutput = entry.buffer.slice(entry.readCursor);
    entry.readCursor = entry.buffer.length;
    return { proc: this.snapshot(entry), newOutput };
  }

  /** Sortie complète bornée (ring-buffer courant). */
  log(id: string, lastN?: number): string[] | null {
    const entry = this.procs.get(id);
    if (!entry) return null;
    return lastN ? entry.buffer.slice(-lastN) : [...entry.buffer];
  }

  /** Tue un process (SIGTERM). */
  kill(id: string, signal: NodeJS.Signals = 'SIGTERM'): boolean {
    const entry = this.procs.get(id);
    if (!entry) return false;
    if (entry.status === 'running') {
      entry.child.kill(signal);
      return true;
    }
    return false;
  }

  /** Liste tous les process gérés (descripteurs). */
  list(): ManagedProc[] {
    const out: ManagedProc[] = [];
    for (const entry of this.procs.values()) out.push(this.snapshot(entry));
    return out;
  }

  /** Récupère un descripteur. */
  get(id: string): ManagedProc | null {
    const entry = this.procs.get(id);
    return entry ? this.snapshot(entry) : null;
  }

  /** Supprime du registre les process terminés (nettoyage). */
  prune(): number {
    let n = 0;
    for (const [id, entry] of this.procs) {
      if (entry.status !== 'running') {
        this.procs.delete(id);
        n++;
      }
    }
    return n;
  }

  /** Tue tous les process encore vivants (arrêt du cortex). */
  killAll(): void {
    for (const entry of this.procs.values()) {
      if (entry.status === 'running') entry.child.kill('SIGTERM');
    }
  }

  /** Extrait un descripteur public (sans le ChildProcess). */
  private snapshot(entry: ProcEntry): ManagedProc {
    return {
      id: entry.id,
      command: entry.command,
      args: entry.args,
      status: entry.status,
      pid: entry.pid,
      exitCode: entry.exitCode,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt,
      error: entry.error,
    };
  }
}
