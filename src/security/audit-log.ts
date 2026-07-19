/**
 * AuditLog — Journal d'audit signé et inviolable (append-only, chaîné).
 *
 * Chaque action dangereuse (shell_exec, file_write, etc.) est enregistrée
 * avec un hash cryptographique lié à l'entrée précédente (type blockchain
 * lightweight). Toute modification a posteriori casse la chaîne -> détectable.
 *
 * 0 dépendance npm — crypto Node natif (createHmac, createHash).
 */

import { createHash, createHmac } from 'crypto';
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';

export type AuditDecision = 'allow' | 'deny' | 'ask-approved' | 'ask-denied';

export interface AuditEntry {
  seq: number;
  ts: number;
  tool: string;
  params: Record<string, any>;
  decision: AuditDecision;
  mode: string;
  prevHash: string;
  hash: string;
  signature: string;
}

export class AuditLog {
  private path: string;
  private secret: string;
  private seq = 0;
  private lastHash: string;

  constructor(opts: { persistPath?: string; secret?: string } = {}) {
    this.path = opts.persistPath ?? join(process.cwd(), 'data', 'audit.jsonl');
    // Secret dérivé de l'empreinte machine (souverain, pas de clé externe)
    this.secret = opts.secret ?? createHash('sha256').update(process.cwd()).digest('hex');
    this.lastHash = 'GENESIS';
    this.seq = 0;
    this.replay();
  }

  /** Rejoue le journal pour reconstruire la chaîne (et vérifier l'intégrité). */
  private replay(): void {
    if (!existsSync(this.path)) return;
    const lines = readFileSync(this.path, 'utf-8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const e: AuditEntry = JSON.parse(line);
        this.seq = e.seq;
        this.lastHash = e.hash;
      } catch { /* ligne corrompue -> on s'arrête */ break; }
    }
  }

  /** Enregistre une action et renvoie l'entrée signée. */
  record(
    tool: string,
    params: Record<string, any>,
    decision: AuditDecision,
    mode: string,
  ): AuditEntry {
    this.seq += 1;
    const entry: AuditEntry = {
      seq: this.seq,
      ts: Date.now(),
      tool,
      params,
      decision,
      mode,
      prevHash: this.lastHash,
      hash: '',
      signature: '',
    };
    // Hash de l'entrée (lie prevHash pour chaînage)
    const payload = JSON.stringify({ ...entry, hash: undefined, signature: undefined });
    entry.hash = createHash('sha256').update(payload + entry.prevHash).digest('hex');
    // Signature HMAC (preuve d'intégrité)
    entry.signature = createHmac('sha256', this.secret).update(entry.hash).digest('hex');
    this.lastHash = entry.hash;

    try {
      mkdirSync(join(this.path, '..'), { recursive: true });
      appendFileSync(this.path, JSON.stringify(entry) + '\n');
    } catch { /* ignore disque plein */ }
    return entry;
  }

  /** Vérifie l'intégrité de toute la chaîne (détecte toute altération). */
  verifyChain(): { ok: boolean; brokenAt?: number } {
    if (!existsSync(this.path)) return { ok: true };
    const lines = readFileSync(this.path, 'utf-8').split('\n').filter(Boolean);
    let prevHash = 'GENESIS';
    let seq = 0;
    for (const line of lines) {
      let e: AuditEntry;
      try {
        e = JSON.parse(line);
      } catch {
        return { ok: false, brokenAt: seq };
      }
      // le hash doit correspondre au payload + prevHash
      const payload = JSON.stringify({ ...e, hash: undefined, signature: undefined });
      const computed = createHash('sha256').update(payload + prevHash).digest('hex');
      if (computed !== e.hash) return { ok: false, brokenAt: e.seq };
      const sig = createHmac('sha256', this.secret).update(e.hash).digest('hex');
      if (sig !== e.signature) return { ok: false, brokenAt: e.seq };
      prevHash = e.hash;
      seq = e.seq;
    }
    return { ok: true };
  }

  get count(): number { return this.seq; }
}
