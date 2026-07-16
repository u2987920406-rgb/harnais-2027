import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfConsistency, debate } from '../src/core/strategies.js';
import { makeBudget } from '../src/core/budget.js';
import type { ModelResponse } from '../src/models/ollama.js';
import type { ProviderInfo } from '../src/core/router.js';

function resp(text: string): ModelResponse {
  return { text, model: 'mock', tokensGenerated: text.length, evalCount: text.length, done: true };
}

test('selfConsistency: vote de majorite choisit la reponse la plus frequente', async () => {
  const answers = ['Paris', 'Paris', 'Lyon'];
  let i = 0;
  const complete = async () => resp(answers[i++]);
  const res = await selfConsistency(complete, 'capitale ?', undefined, 3);
  assert.equal(res.chosen.text, 'Paris');
  assert.equal(res.candidates.length, 3);
});

test('selfConsistency: n<1 est borne a 1', async () => {
  const complete = async () => resp('unique');
  const res = await selfConsistency(complete, 'q', undefined, 0);
  assert.equal(res.candidates.length, 1);
  assert.equal(res.chosen.text, 'unique');
});

test('selfConsistency: pas de majorite -> premiere reponse (tie sur le 1er)', async () => {
  const answers = ['A', 'B', 'C'];
  let i = 0;
  const complete = async () => resp(answers[i++]);
  const res = await selfConsistency(complete, 'q', undefined, 3);
  assert.equal(res.chosen.text, 'A');
});

test('debate: le juge departage, meilleur score gagne', async () => {
  // Connecteur mock: drafts renvoient leur nom, le juge score selon le contenu.
  const providers: ProviderInfo[] = [
    { id: 'a', label: 'A', model: 'm-a', isLocal: true, capabilities: ['general'], tier: () => 1 },
    { id: 'b', label: 'B', model: 'm-b', isLocal: false, capabilities: ['general'], tier: () => 1 },
  ];
  const connector: any = {
    async generate(req: any) {
      if (req.prompt.startsWith('Note ce draft')) {
        // draft contenant "bon" -> score 9, sinon 3
        return resp(req.prompt.includes('bon-draft') ? 'SCORE: 9' : 'SCORE: 3');
      }
      // drafters produisent selon le modele
      return resp(req.model === 'm-b' ? 'bon-draft' : 'mauvais-draft');
    },
  };
  const budget = makeBudget(50, 100000, 100000);
  const res = await debate(connector, providers, 'judge', 'question', undefined, budget);
  assert.equal(res.winner.text, 'bon-draft');
  assert.ok(Math.max(...res.scores) === 9);
});
