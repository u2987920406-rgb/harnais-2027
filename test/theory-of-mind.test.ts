import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TheoryOfMind } from '../src/cognition/theory-of-mind.js';
import { createInitialState } from '../src/core/state.js';
import { makeMockBridge } from './_mock.js';

test('analyzeTone: heuristique rapide detecte frustration (pas d appel modele)', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const tone = await tom.analyzeTone('ca marche pas du tout');
  assert.equal(tone, 'frustrated');
  // heuristique -> aucun appel modele
  assert.equal(bridge.calls.length, 0);
});

test('analyzeTone: heuristique detecte excited', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const tone = await tom.analyzeTone('super genial !');
  assert.equal(tone, 'excited');
});

test('analyzeTone: fallback modele quand pas d heuristique', async () => {
  const bridge = makeMockBridge(() => 'curious');
  const tom = new TheoryOfMind(bridge);
  const tone = await tom.analyzeTone('je me demande comment cela fonctionne sur le plan interne des couches');
  assert.equal(tone, 'curious');
  assert.equal(bridge.calls.length, 1);
});

test('analyzeTone: reponse modele invalide -> neutral', async () => {
  const bridge = makeMockBridge(() => 'nimportequoi');
  const tom = new TheoryOfMind(bridge);
  const tone = await tom.analyzeTone('phrase longue sans marqueur particulier pour eviter les heuristiques rapides du module');
  assert.equal(tone, 'neutral');
});

test('updateProfile: augmente la frustration sur signal negatif', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  const p1 = await tom.updateProfile('non ca marche pas arrete', state);
  assert.ok(p1.frustrationLevel > 0);
  assert.ok(Array.isArray(p1.predictedNeeds));
});

test('calibrateResponse: frustration -> style direct, temperature basse', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  // pousse la frustration au-dessus du seuil
  for (let i = 0; i < 5; i++) await tom.updateProfile('non pas ca arrete', state);
  const cal = tom.calibrateResponse();
  assert.ok(cal.temperature <= 0.3);
  assert.match(cal.style, /direct/);
});

test('getProfile et toContext: exposent le profil', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const p = tom.getProfile();
  assert.ok('tone' in p);
  assert.match(tom.toContext(), /Mod.le utilisateur/);
});
