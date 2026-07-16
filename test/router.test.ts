import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selectProviders, selectWithFallback, type ProviderInfo, type Capability } from '../src/core/router.js';

function makeProvider(
  id: string,
  isLocal: boolean,
  capabilities: Capability[],
  tier: number
): ProviderInfo {
  return { id, label: id, model: id, isLocal, capabilities, tier: () => tier };
}

test('selectProviders: filtre par capacite', () => {
  const providers = [
    makeProvider('a', true, ['reasoning'], 1),
    makeProvider('b', true, ['creative'], 1),
  ];
  const selected = selectProviders('reasoning', providers);
  assert.deepEqual(selected.map(p => p.id), ['a']);
});

test('selectProviders: local avant cloud', () => {
  const providers = [
    makeProvider('cloud', false, ['general'], 1),
    makeProvider('local', true, ['general'], 1),
  ];
  const selected = selectProviders('general', providers);
  assert.deepEqual(selected.map(p => p.id), ['local', 'cloud']);
});

test('selectProviders: trie par tier croissant a egalite de localite', () => {
  const providers = [
    makeProvider('lourd', true, ['general'], 3),
    makeProvider('leger', true, ['general'], 1),
  ];
  const selected = selectProviders('general', providers);
  assert.deepEqual(selected.map(p => p.id), ['leger', 'lourd']);
});

test('selectWithFallback: prefere le local si disponible', () => {
  const providers = [
    makeProvider('cloud', false, ['general'], 1),
    makeProvider('local', true, ['general'], 1),
  ];
  const selected = selectWithFallback('general', providers, true);
  assert.deepEqual(selected.map(p => p.id), ['local']);
});

test('selectWithFallback: bascule sur le cloud si aucun local et allowCloud=true', () => {
  const providers = [makeProvider('cloud', false, ['general'], 1)];
  const selected = selectWithFallback('general', providers, true);
  assert.deepEqual(selected.map(p => p.id), ['cloud']);
});

test('selectWithFallback: ne retourne rien si aucun local et allowCloud=false', () => {
  const providers = [makeProvider('cloud', false, ['general'], 1)];
  const selected = selectWithFallback('general', providers, false);
  assert.deepEqual(selected, []);
});
