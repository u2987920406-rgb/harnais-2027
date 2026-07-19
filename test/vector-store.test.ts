import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VectorStore, cosine, bm25Score } from '../src/memory/vector-store.js';

test('cosine: identique => 1, orthogonaux => 0', () => {
  assert.ok(Math.abs(cosine([1, 0], [1, 0]) - 1) < 1e-9);
  assert.ok(Math.abs(cosine([1, 0], [0, 1])) < 1e-9);
  assert.ok(cosine([1, 2, 3], [1, 2, 3]) > 0.99);
});

test('cosine: longueurs differentes => tronque proprement', () => {
  const s = cosine([1, 2, 3, 4], [1, 2, 3]);
  assert.ok(s >= 0 && s <= 1);
});

test('bm25Score: document avec termes de la requete => > 0', () => {
  const s1 = bm25Score('securiser serveur linux', 'utilise ufw pour securiser le serveur linux');
  const s2 = bm25Score('securiser serveur linux', 'la voiture rouge roule vite');
  assert.ok(s1 > 0);
  assert.ok(s2 === 0 || s2 < s1);
});

test('VectorStore: add + search via fetch mock (embeddings simules)', async () => {
  const fakeEmbed = (text: string): number[] => {
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
  const ids = hits.map((h) => h.doc.id);
  assert.ok(ids.includes('a'));
  assert.ok(ids.includes('c'));
  assert.ok(!ids.includes('b'));

  (global as any).fetch = origFetch;
});

test('VectorStore: search vide si aucun doc', async () => {
  const store = new VectorStore({ persistPath: 'data/test-empty.json' });
  const hits = await store.search('rien', 3);
  assert.equal(hits.length, 0);
});

