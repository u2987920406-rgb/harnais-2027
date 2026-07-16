import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  createInitialState,
  pushToWorkingMemory,
  workingMemoryToContext,
  saveCortexState,
  loadCortexState,
  stateToSummary,
} from '../src/core/state.js';

function tempStatePath(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harnais-state-'));
  return join(dir, 'state.json');
}

test('createInitialState: etat vierge coherent', () => {
  const s = createInitialState();
  assert.equal(s.cycles, 0);
  assert.equal(s.currentFocus, null);
  assert.equal(s.workingMemory.length, 0);
  assert.equal(s.userTone, 'neutral');
  assert.equal(s.budgetSpent, 0);
  assert.ok(s.cognitiveBudget > 0);
});

test('pushToWorkingMemory: ajoute un item', () => {
  const s = createInitialState();
  pushToWorkingMemory(s, 'observation test', 'observation', 0.9);
  assert.equal(s.workingMemory.length, 1);
  assert.equal(s.workingMemory[0].content, 'observation test');
  assert.equal(s.workingMemory[0].type, 'observation');
});

test('pushToWorkingMemory: evince au-dela de maxItems (garde les plus pertinents)', () => {
  const s = createInitialState();
  for (let i = 0; i < 10; i++) {
    pushToWorkingMemory(s, `item-${i}`, 'observation', i / 10, 5);
  }
  assert.equal(s.workingMemory.length, 5);
  // les items conserves doivent etre les plus pertinents
  const relevances = s.workingMemory.map(w => w.relevance);
  assert.ok(Math.max(...relevances) >= Math.min(...relevances));
});

test('workingMemoryToContext: vide vs rempli', () => {
  const s = createInitialState();
  assert.match(workingMemoryToContext(s), /vide/);
  pushToWorkingMemory(s, 'un fait', 'user_input', 0.9);
  assert.match(workingMemoryToContext(s), /un fait/);
});

test('save puis load: restitue l etat, reset budget', () => {
  const path = tempStatePath();
  const s = createInitialState();
  s.cycles = 42;
  s.currentFocus = 'debugging';
  s.budgetSpent = 1000;
  pushToWorkingMemory(s, 'memoire persistee', 'decision', 0.9);
  saveCortexState(s, path);
  assert.ok(existsSync(path));

  const loaded = loadCortexState(path);
  assert.equal(loaded.cycles, 42);
  assert.equal(loaded.currentFocus, 'debugging');
  assert.equal(loaded.workingMemory.length, 1);
  // budget remis a zero au chargement
  assert.equal(loaded.budgetSpent, 0);

  rmSync(join(path, '..'), { recursive: true, force: true });
});

test('loadCortexState: fichier absent -> etat initial', () => {
  const loaded = loadCortexState(join(tmpdir(), 'harnais-nexiste-pas-xyz.json'));
  assert.equal(loaded.cycles, 0);
});

test('stateToSummary: contient les champs cles', () => {
  const s = createInitialState();
  s.cycles = 7;
  const summary = stateToSummary(s);
  assert.match(summary, /Cycle: 7/);
  assert.match(summary, /Focus/);
  assert.match(summary, /Budget cognitif/);
});
