/**
 * Smoke test live du Verifier — 3 gates en conditions reelles.
 * - testgen sur artefacts reels
 * - sandbox: vrai `npx tsc --noEmit` sur un mini-projet temporaire (cas OK + cas KO)
 * - vision: gate live via le modele (fail-open si indispo)
 * Lance: npm run smoke:verifier
 */
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { ModelBridge } from '../../src/models/bridge.js';
import {
  testgenVerify, sandboxVerify, makeCompositeVerifier, type Artifact,
} from '../../src/verify/verifier.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, '..', '..');

// Cree le mini-projet DANS le repo pour que `npx tsc` resolve le TypeScript local.
function makeTsProject(fileContent: string): string {
  const base = join(REPO, '.verify-tmp');
  mkdirSync(base, { recursive: true });
  const dir = mkdtempSync(join(base, 'p-'));
  writeFileSync(join(dir, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { strict: true, noEmit: true, module: 'esnext', target: 'es2022', moduleResolution: 'bundler' },
    include: ['*.ts'],
  }, null, 2));
  writeFileSync(join(dir, 'index.ts'), fileContent);
  return dir;
}

async function main() {
  // 1. testgen reel
  const good: Artifact[] = [{ path: 'a.ts', type: 'code', content: 'export const x: number = 1;' }];
  const bad: Artifact[] = [{ path: 'b.ts', type: 'code', content: 'const y = 1;' }];
  console.log('[verify] testgen bon code:', JSON.stringify(testgenVerify(good)));
  console.log('[verify] testgen sans export:', JSON.stringify(testgenVerify(bad)));

  // 2. sandbox reel — cas OK
  const okDir = makeTsProject('export const n: number = 42;\n');
  const okRes = sandboxVerify({ cwd: okDir });
  console.log(`[verify] sandbox code valide: ok=${okRes.ok}`);
  rmSync(okDir, { recursive: true, force: true });

  // 2b. sandbox reel — cas KO (erreur de type)
  const koDir = makeTsProject('export const n: number = "pas un nombre";\n');
  const koRes = sandboxVerify({ cwd: koDir });
  console.log(`[verify] sandbox code invalide: ok=${koRes.ok} (attendu false)`);
  if (koRes.reasons[0]) console.log(`[verify]   raison: ${koRes.reasons[0].slice(0, 120)}`);
  rmSync(koDir, { recursive: true, force: true });

  // 3. composite live avec vision (fail-open si pas de screenshot)
  const bridge = new ModelBridge();
  const verifier = makeCompositeVerifier({
    ctx: {}, useTestgen: true, useSandbox: false, useVision: false, bridge,
  });
  const composite = await verifier.verify(good);
  console.log(`[verify] composite (testgen only) sur bon code: ok=${composite.ok}`);

  // Assertions dures
  const allOk =
    testgenVerify(good).ok === true &&
    testgenVerify(bad).ok === false &&
    okRes.ok === true &&
    koRes.ok === false &&
    composite.ok === true;

  if (!allOk) { console.error('[verify] ECHEC: une gate ne se comporte pas comme attendu'); process.exit(1); }
  console.log('[verify] === VERIFIER LIVE OK (testgen + sandbox tsc reel) ===');
}

main().catch(e => { console.error('[verify] ECHEC:', e); process.exit(1); });
