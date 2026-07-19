import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VectorStore, cosine } from '../src/memory/vector-store.js';

test('cosine: identique => 1, orthogonaux => 0', () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  assert.ok(cosine([1, 2, 3], [1, 2, 3]) > 0.99);
});

test('cosine: longueurs differentes => tronque proprement', () => {
  // ne doit pas crasher, utilise min length
  const s = cosine([1, 2, 3, 4], [1, 2, 3]);
  assert.ok(s >= 0 && s <= 1);
});

test('VectorStore: add + search via fetch mock (embeddings simules)', async () => {
  // Mock global.fetch pour simuler Ollama /api/embeddings
  const fakeEmbed = (text: string): number[] => {
    // vecteur deterministe: compte les lettres (poids simple)
    const v = new Array(8).fill(0);
    for (const ch of text) v[ch.charCodeAt(0) % 8] += 1;
    return v;
  };
  const origFetch = global.fetch;
  (global as any).fetch = async (_url: string, opts: any) => {
    const body = JSON.parse(opts.body);
    return {
      ok: true,
      status: 200,
      text: async () => '',
      json: async () => ({ embedding: fakeEmbed(body.prompt) }),
    } as any;
  };

  const store = new VectorStore({ persistPath: 'data/test-vectors.json' });
  await store.add('a', 'le chat noir dort sur le canapé');
  await store.add('b', 'la voiture rouge roule vite sur l autoroute');
  await store.add('c', 'le chat mimine court après la souris');

  const hits = await store.search('un chat qui court', 2);
  assert.equal(hits.length, 2);
  // 'a' et 'c' parlent de chat => doivent dominer sur 'b' (voiture)
  const ids = hits.map((h) => h.doc.id);
  assert.ok(ids.includes('a'));
  assert.ok(ids.includes('c'));
  assert.ok(!ids.includes('b'));

  // restaure
  (global as any).fetch = origFetch;
});

test('VectorStore: search vide si aucun doc', async () => {
  const store = new VectorStore({ persistPath: 'data/test-empty.json' });
  const hits = await store.search('rien', 3);
  assert.equal(hits.length, 0);
});
