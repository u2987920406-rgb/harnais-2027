/**
 * VectorStore — Mémoire vectorielle souveraine (RAG sémantique, 0 dép npm).
 *
 * Utilise l'API native Ollama /api/embeddings pour générer des vecteurs
 * (modèle nomic-embed-text par défaut, local). L'index est en mémoire
 * (cosine similarity) et persisté sur disque en JSON.
 *
 * Cela permet à Atlas de retrouver du contexte sémantique (pas seulement
 * par mots-clés) — passage d'un harnais "réactif" à "frontier".
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { OllamaConnector } from '../models/ollama.js';

export interface VectorDoc {
  id: string;
  text: string;
  vector: number[];
  meta?: Record<string, any>;
}

export interface SearchHit {
  doc: VectorDoc;
  score: number;
}

export class VectorStore {
  private docs: VectorDoc[] = [];
  private connector: OllamaConnector;
  private embedModel: string;
  private path: string;
  private ollamaUrl: string;

  constructor(
    opts: {
      embedModel?: string;
      persistPath?: string;
      ollamaUrl?: string;
    } = {}
  ) {
    this.embedModel = opts.embedModel ?? 'nomic-embed-text';
    this.ollamaUrl = opts.ollamaUrl ?? 'http://localhost:11434';
    this.path = opts.persistPath ?? join(process.cwd(), 'data', 'vectors.json');
    this.connector = new OllamaConnector(opts.ollamaUrl);
    this.load();
  }

  /** Génère un vecteur pour un texte via Ollama. */
  async embed(text: string): Promise<number[]> {
    const res = await fetch(`${this.ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embedModel, prompt: text }),
    });
    if (!res.ok) throw new Error(`Embeddings HTTP ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.embedding;
  }

  /** Ajoute un document (embed + index + persist). */
  async add(id: string, text: string, meta?: Record<string, any>): Promise<void> {
    const vector = await this.embed(text);
    // remplace si id existe
    this.docs = this.docs.filter((d) => d.id !== id);
    this.docs.push({ id, text, vector, meta });
    this.save();
  }

  /**
   * Recherche les k plus proches avec reranking hybride:
   *   1. Recupere les 2*k candidats par similarite cosine (semantique)
   *   2. Re-score chaque candidat = 0.65*cosine + 0.35*bm25 (lexical)
   *      -> corrige les faux-positifs semantiques (ex: mots differents,
   *         sens proches mais irrelevants pour la requete precise)
   *   3. Retourne les k re-tries
   * Approche souveraine: aucun appel LLM (comme Chroma/Weaviate en local).
   */
  async search(query: string, k = 5): Promise<SearchHit[]> {
    if (this.docs.length === 0) return [];
    const qv = await this.embed(query);

    // 1. candidats par cosine (pre-filtre 2x plus large)
    const cand = this.docs
      .map((doc) => ({ doc, score: cosine(qv, doc.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(k * 2, k));

    // 2. reranking hybride
    const reranked = cand.map((c) => {
      const lex = bm25Score(query, c.doc.text);
      const hybrid = 0.65 * c.score + 0.35 * lex;
      return { doc: c.doc, score: hybrid, semantic: c.score, lexical: lex };
    });
    reranked.sort((a, b) => b.score - a.score);
    return reranked.slice(0, k).map((r) => ({ doc: r.doc, score: r.score }));
  }

  /** Recherche synchrone (utilise un vecteur pré-calculé). */
  searchByVector(qv: number[], k = 5): SearchHit[] {
    if (this.docs.length === 0) return [];
    const scored = this.docs.map((doc) => ({ doc, score: cosine(qv, doc.vector) }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  get size(): number { return this.docs.length; }

  private load(): void {
    try {
      if (existsSync(this.path)) {
        const raw = JSON.parse(readFileSync(this.path, 'utf-8'));
        this.docs = raw.docs ?? [];
      }
    } catch { /* ignore */ }
  }

  private save(): void {
    try {
      mkdirSync(join(this.path, '..'), { recursive: true });
      writeFileSync(this.path, JSON.stringify({ docs: this.docs }, null, 0));
    } catch { /* ignore */ }
  }
}

/** Cosine similarity entre deux vecteurs. */
export function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * Score BM25 simplifié (lexical) entre une requête et un document.
 * Normalisé dans [0,1] via 1 - 1/(1+score) pour un mélange hybride avec cosine.
 * Souverain, 0 dépendance — corrige les faux-positifs sémantiques.
 */
export function bm25Score(query: string, doc: string): number {
  const qTerms = tokenize(query);
  const dTerms = tokenize(doc);
  if (qTerms.length === 0 || dTerms.length === 0) return 0;

  const df: Record<string, number> = {};
  for (const t of qTerms) df[t] = (df[t] ?? 0) + 1;
  const docLen = dTerms.length;
  const avgLen = docLen; // approximation: 1 seul doc, donc avg = sa longueur
  const k1 = 1.5, b = 0.75;
  const freq: Record<string, number> = {};
  for (const t of dTerms) freq[t] = (freq[t] ?? 0) + 1;

  let score = 0;
  for (const t of qTerms) {
    const f = freq[t] ?? 0;
    if (f === 0) continue;
    const idf = Math.log(1 + (1 / (1 + 0))); // df=1 (terme présent), simplifié
    const denom = f + k1 * (1 - b + b * (docLen / avgLen));
    score += idf * (f * (k1 + 1)) / denom;
  }
  // normalise dans [0,1]
  return 1 - 1 / (1 + score);
}

/** Tokenise: minuscules, alphanum, enlève la ponctuation. */
function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9àâäéèêëîïôöùûüç]+/g) ?? []);
}
