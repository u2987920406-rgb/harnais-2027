import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBudget, withinBudget, charge, resetBudget, budgetSummary } from '../src/core/budget.js';

test('makeBudget: valeurs par defaut', () => {
  const b = makeBudget();
  assert.equal(b.maxIterations, 10);
  assert.equal(b.maxPromptTokens, 200_000);
  assert.equal(b.maxCompletionTokens, 200_000);
  assert.equal(b.spentPrompt, 0);
  assert.equal(b.spentCompletion, 0);
  assert.equal(b.iterations, 0);
});

test('withinBudget: accepte tant que sous les plafonds', () => {
  const b = makeBudget(2, 100, 100);
  assert.equal(withinBudget(b, 50, 50), true);
  assert.equal(withinBudget(b, 101, 0), false);
  assert.equal(withinBudget(b, 0, 101), false);
});

test('withinBudget: refuse au-dela du nombre d\'iterations', () => {
  const b = makeBudget(1, 1000, 1000);
  charge(b, 10, 10);
  assert.equal(withinBudget(b, 10, 10), false);
});

test('charge: accumule prompt/completion/iterations', () => {
  const b = makeBudget();
  charge(b, 100, 200);
  charge(b, 50, 25);
  assert.equal(b.spentPrompt, 150);
  assert.equal(b.spentCompletion, 225);
  assert.equal(b.iterations, 2);
});

test('resetBudget: remet les compteurs a zero sans toucher aux plafonds', () => {
  const b = makeBudget(5, 1000, 1000);
  charge(b, 100, 100);
  resetBudget(b);
  assert.equal(b.spentPrompt, 0);
  assert.equal(b.spentCompletion, 0);
  assert.equal(b.iterations, 0);
  assert.equal(b.maxIterations, 5);
});

test('budgetSummary: produit une chaine lisible', () => {
  const b = makeBudget(10, 1000, 1000);
  charge(b, 10, 20);
  const summary = budgetSummary(b);
  assert.match(summary, /1\/10 iter/);
  assert.match(summary, /10\/1000 prompt tok/);
  assert.match(summary, /20\/1000 completion tok/);
});
