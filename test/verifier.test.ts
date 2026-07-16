import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  testgenVerify,
  sandboxVerify,
  visionVerify,
  makeCompositeVerifier,
  type Artifact,
} from '../src/verify/verifier.js';
import { makeMockBridge } from './_mock.js';

const codeArt = (path: string, content: string): Artifact => ({ path, type: 'code', content });

test('testgenVerify: accepte du code sain avec export', () => {
  const r = testgenVerify([codeArt('a.ts', 'export const x = 1;')]);
  assert.equal(r.ok, true);
  assert.equal(r.reasons.length, 0);
});

test('testgenVerify: refuse si aucun artifact de code', () => {
  const r = testgenVerify([]);
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /aucun artifact/);
});

test('testgenVerify: refuse un .ts sans export', () => {
  const r = testgenVerify([codeArt('a.ts', 'const x = 1;')]);
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /sans export/);
});

test('sandboxVerify: cwd absent -> ok (rien a verifier)', () => {
  const r = sandboxVerify({ cwd: undefined });
  assert.equal(r.ok, true);
});

test('sandboxVerify: cwd inexistant -> ok fail-open', () => {
  const r = sandboxVerify({ cwd: '/chemin/qui/nexiste/pas/xyz123' });
  assert.equal(r.ok, true);
});

test('visionVerify: pas de screenshot -> ok', async () => {
  const bridge = makeMockBridge(() => 'OK');
  const r = await visionVerify({}, bridge);
  assert.equal(r.ok, true);
});

test('visionVerify: reponse OK du modele -> ok', async () => {
  const bridge = makeMockBridge(() => 'OK');
  const r = await visionVerify({ screenshotPath: 's.png', brief: 'un bouton bleu' }, bridge);
  assert.equal(r.ok, true);
});

test('visionVerify: reponse NON du modele -> ko avec raison', async () => {
  const bridge = makeMockBridge(() => 'NON: le bouton est rouge');
  const r = await visionVerify({ screenshotPath: 's.png', brief: 'un bouton bleu' }, bridge);
  assert.equal(r.ok, false);
  assert.match(r.reasons[0], /vision/);
});

test('makeCompositeVerifier: compose testgen seul', async () => {
  const v = makeCompositeVerifier({ ctx: {}, useTestgen: true });
  const ok = await v.verify([codeArt('a.ts', 'export const x = 1;')]);
  assert.equal(ok.ok, true);
  const ko = await v.verify([codeArt('a.ts', 'const x = 1;')]);
  assert.equal(ko.ok, false);
});

test('makeCompositeVerifier: combine testgen + vision', async () => {
  const bridge = makeMockBridge(() => 'NON: pas conforme');
  const v = makeCompositeVerifier({
    ctx: { screenshotPath: 's.png', brief: 'x' },
    useTestgen: true, useVision: true, bridge,
  });
  const r = await v.verify([codeArt('a.ts', 'export const x = 1;')]);
  assert.equal(r.ok, false);
  assert.match(r.reasons.join(' '), /vision/);
});
