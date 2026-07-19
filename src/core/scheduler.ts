/**
 * Scheduler — Planificateur récurrent type cron (mode SLEEP/IDLE).
 *
 * Équivalent du `cron` de Hermes Agent : enregistre des jobs
 * (schedule + prompt + skills + contexte partagé) qui se rejouent
 * automatiquement. Persisté en JSON pour survive aux redémarrages.
 *
 * Le cortex interroge `dueJobs()` à chaque tick (mode idle) et
 * exécute les jobs échus via le spawner. Chaque exécution écrit
 * un rapport (output) dans le graphe + sur disque.
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import type { Spawner } from '../cognition/spawner.js';
import { KnowledgeGraph } from '../memory/knowledge-graph.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type JobSchedule =
  | { kind: 'every'; minutes: number }       // toutes les N minutes
  | { kind: 'daily'; atHour: number };       // tous les jours à H h (local)

export interface SchedulerJob {
  id: string;
  name: string;
  schedule: JobSchedule;
  prompt: string;             // but / consigne du job
  context?: string;           // contexte partagé (mode, mémoire…)
  skills?: string[];          // tags de skills à charger (transmis au spawner)
  enabled: boolean;
  lastRun: number | null;     // timestamp dernier run
  runCount: number;
  lastOutput: string;         // dernier rapport (utile pour rapport matinal)
}

export class Scheduler {
  private jobs: Map<string, SchedulerJob> = new Map();
  private path: string;
  private spawner: Spawner | null = null;
  private graph: KnowledgeGraph | null = null;
  private seq = 0;

  constructor(path?: string) {
    this.path = path ?? join(__dirname, '..', '..', 'data', 'scheduler.json');
    this.load();
  }

  /** Injection du spawner + graphe pour l'exécution des jobs. */
  setRuntime(spawner: Spawner, graph: KnowledgeGraph): void {
    this.spawner = spawner;
    this.graph = graph;
  }

  /**
   * Ajoute un job. Renvoie son id.
   * schedule ex: { kind:'every', minutes:30 } ou { kind:'daily', atHour:9 }.
   */
  addJob(
    name: string,
    schedule: JobSchedule,
    prompt: string,
    opts: { context?: string; skills?: string[] } = {}
  ): string {
    const id = `job-${(++this.seq).toString(36)}-${Date.now().toString(36)}`;
    const job: SchedulerJob = {
      id,
      name,
      schedule,
      prompt,
      context: opts.context,
      skills: opts.skills,
      enabled: true,
      lastRun: null,
      runCount: 0,
      lastOutput: '',
    };
    this.jobs.set(id, job);
    this.save();
    console.log(`[Scheduler] Job ajouté: ${name} (${this.scheduleLabel(schedule)})`);
    return id;
  }

  removeJob(id: string): boolean {
    const ok = this.jobs.delete(id);
    if (ok) this.save();
    return ok;
  }

  enableJob(id: string, enabled: boolean): void {
    const job = this.jobs.get(id);
    if (job) {
      job.enabled = enabled;
      this.save();
    }
  }

  list(): SchedulerJob[] {
    return Array.from(this.jobs.values());
  }

  get(id: string): SchedulerJob | undefined {
    return this.jobs.get(id);
  }

  /** Renvoie les jobs dont l'échéance est atteinte à l'instant t. */
  dueJobs(now: number = Date.now()): SchedulerJob[] {
    const out: SchedulerJob[] = [];
    for (const job of this.jobs.values()) {
      if (!job.enabled) continue;
      if (this.isDue(job, now)) out.push(job);
    }
    return out;
  }

  private isDue(job: SchedulerJob, now: number): boolean {
    if (job.lastRun === null) return true; // jamais exécuté -> dû immédiatement
    const elapsedMs = now - job.lastRun;
    if (job.schedule.kind === 'every') {
      return elapsedMs >= job.schedule.minutes * 60_000;
    }
    // daily: dû si on a passé l'heure cible depuis le dernier run
    const last = new Date(job.lastRun);
    const today = new Date(now);
    const crossedHour =
      (today.getHours() > job.schedule.atHour ||
        (today.getHours() === job.schedule.atHour && today.getMinutes() >= 0)) &&
      (last.getHours() < job.schedule.atHour ||
        last.toDateString() !== today.toDateString());
    return crossedHour;
  }

  /**
   * Exécute un job dû. Utilise le spawner (batch) si dispo, sinon
   * fallback no-op silencieux (le cortex reste debout sans modèle).
   */
  async run(job: SchedulerJob): Promise<string> {
    const t0 = Date.now();
    let output = '';
    if (this.spawner) {
      const { summary } = await this.spawner.dispatch(
        [job.prompt],
        { context: job.context, concurrency: 1, mode: 'general' }
      );
      output = summary;
    } else {
      output = `[Scheduler] ${job.name}: exécution (pas de spawner configuré)`;
    }

    job.lastRun = t0;
    job.runCount++;
    job.lastOutput = output.slice(0, 1000);

    if (this.graph) {
      this.graph.addNode('episode', `Job: ${job.name}`, {
        jobId: job.id,
        output: output.slice(0, 200),
        runCount: job.runCount,
        timestamp: t0,
      }, 0.5);
    }
    this.save();
    console.log(`[Scheduler] Job exécuté: ${job.name} (run #${job.runCount})`);
    return output;
  }

  // --- Persistance ---

  private scheduleLabel(s: JobSchedule): string {
    return s.kind === 'every' ? `toutes les ${s.minutes} min` : `quotidien ${s.atHour}h`;
  }

  private load(): void {
    try {
      if (!existsSync(this.path)) return;
      const raw = JSON.parse(readFileSync(this.path, 'utf-8'));
      if (Array.isArray(raw.jobs)) {
        for (const j of raw.jobs) this.jobs.set(j.id, j as SchedulerJob);
      }
      if (typeof raw.seq === 'number') this.seq = raw.seq;
    } catch (e: any) {
      console.error(`[Scheduler] lecture échouée (${this.path}): ${e.message}`);
    }
  }

  private save(): void {
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      writeFileSync(this.path, JSON.stringify({
        seq: this.seq,
        jobs: Array.from(this.jobs.values()),
      }, null, 2), 'utf-8');
    } catch (e: any) {
      console.error(`[Scheduler] écriture échouée (${this.path}): ${e.message}`);
    }
  }
}
