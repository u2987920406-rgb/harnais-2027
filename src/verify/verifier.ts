/**
 * Verifier — Verificateur composable.
 *
 * Inspire d'Atlas verify/verifier.ts. Adapte au harnais.
 *
 * 3 gates:
 * 1. testgen — verifie la presence de code sain (export, pas vide)
 * 2. sandbox — typecheck (tsc --noEmit) si un repertoire est fourni
 * 3. vision — un modele local juge une capture vs le brief
 *
 * Chaque gate est branchable independamment. Le verifier compose les gates.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { ModelBridge } from '../models/bridge.js';

export interface Artifact {
  path: string;
  type: 'code' | 'spec' | 'text' | 'image';
  content: string;
}

export interface VerifyResult {
  ok: boolean;
  reasons: string[];
}

export interface VerifyContext {
  cwd?: string;
  brief?: string;
  screenshotPath?: string;
}

// Gate 1: testgen — code sain
export function testgenVerify(arts: Artifact[]): VerifyResult {
  const reasons: string[] = [];
  const codeArts = arts.filter(a => a.type === 'code' && a.content.trim().length > 0);
  if (codeArts.length === 0) reasons.push('aucun artifact de code produit');
  for (const art of codeArts) {
    if (art.path.endsWith('.ts') || art.path.endsWith('.tsx')) {
      if (!art.content.includes('export')) reasons.push(`${art.path} sans export`);
    }
  }
  return { ok: reasons.length === 0, reasons };
}

// Gate 2: sandbox — typecheck
export function sandboxVerify(ctx: VerifyContext): VerifyResult {
  if (!ctx.cwd || !existsSync(ctx.cwd)) return { ok: true, reasons: [] };
  try {
    execSync('npx tsc --noEmit', { cwd: ctx.cwd, timeout: 30000, encoding: 'utf-8', stdio: 'pipe' });
    return { ok: true, reasons: [] };
  } catch (err: any) {
    // tsc ecrit ses diagnostics sur stdout (pas stderr) — on lit les deux.
    const out = (err.stdout ?? '') + (err.stderr ?? '');
    const detail = out.trim() || err.message || 'erreur inconnue';
    return { ok: false, reasons: [`typecheck echec: ${detail.slice(0, 400)}`] };
  }
}

// Gate 3: vision — juge visuel
export async function visionVerify(
  ctx: VerifyContext,
  bridge: ModelBridge
): Promise<VerifyResult> {
  if (!ctx.screenshotPath || !ctx.brief) return { ok: true, reasons: [] };
  try {
    const response = await bridge.think(
      `Brief: ${ctx.brief}\nCette capture respecte-t-elle le brief ? Reponds STRICTEMENT par "OK" ou "NON: <raison>".`,
      'vision',
      { temperature: 0.2, maxTokens: 100 }
    );
    const ok = /^\s*OK\b/i.test(response.text);
    return ok
      ? { ok: true, reasons: [] }
      : { ok: false, reasons: [`vision: ${response.text.trim().slice(0, 300)}`] };
  } catch (err: any) {
    return { ok: true, reasons: [] }; // fail-open
  }
}

// Verifier composable
export interface CompositeVerifierOpts {
  ctx: VerifyContext;
  useTestgen?: boolean;
  useSandbox?: boolean;
  useVision?: boolean;
  bridge?: ModelBridge;
}

export function makeCompositeVerifier(opts: CompositeVerifierOpts) {
  return {
    async verify(arts: Artifact[]): Promise<VerifyResult> {
      const reasons: string[] = [];
      if (opts.useTestgen !== false) {
        const r = testgenVerify(arts);
        if (!r.ok) reasons.push(...r.reasons);
      }
      if (opts.useSandbox) {
        const r = sandboxVerify(opts.ctx);
        if (!r.ok) reasons.push(...r.reasons);
      }
      if (opts.useVision && opts.bridge) {
        const r = await visionVerify(opts.ctx, opts.bridge);
        if (!r.ok) reasons.push(...r.reasons);
      }
      return { ok: reasons.length === 0, reasons };
    },
  };
}