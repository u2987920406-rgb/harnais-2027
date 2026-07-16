import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
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

test('inferPreferences: deduit des preferences implicites du message', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  await tom.updateProfile('sois concis et montre-moi du code en francais', state);
  const prefs = tom.getProfile().preferences;
  assert.ok(prefs.includes('reponses concises'));
  assert.ok(prefs.includes('exemples de code'));
  assert.ok(prefs.includes('francais'));
});

test('updateProfile: infere le workStyle et incremente interactions', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  const longMsg = 'x'.repeat(250);
  await tom.updateProfile(longMsg, state);
  assert.equal(tom.getProfile().workStyle, 'detailed');
  assert.equal(tom.getProfile().interactions, 1);
});

test('dominantTone: mode statistique sur l historique', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  // 3 messages frustres (heuristique "marche pas") -> dominant frustrated
  for (let i = 0; i < 3; i++) await tom.updateProfile('ca marche pas', state);
  await tom.updateProfile('ok super !', state);
  assert.equal(tom.dominantTone(), 'frustrated');
});

test('syncToState: propage le modele vers le CortexState', async () => {
  const bridge = makeMockBridge(() => 'neutral');
  const tom = new TheoryOfMind(bridge);
  const state = createInitialState();
  await tom.updateProfile('super genial !', state);
  tom.syncToState(state);
  assert.equal(state.userTone, tom.getProfile().tone);
  assert.ok(state.userLastSeen && state.userLastSeen > 0);
});

test('save + reload: le profil persiste sur disque', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-tom-'));
  const path = join(dir, 'profile.json');
  const bridge = makeMockBridge(() => 'neutral');
  const tom1 = new TheoryOfMind(bridge, path);
  const state = createInitialState();
  await tom1.updateProfile('sois concis en francais', state);
  tom1.save();
  assert.ok(existsSync(path));

  // recharge dans une nouvelle instance
  const tom2 = new TheoryOfMind(bridge, path);
  const prefs = tom2.getProfile().preferences;
  assert.ok(prefs.includes('reponses concises'));
  assert.ok(prefs.includes('francais'));

  rmSync(dir, { recursive: true, force: true });
});
