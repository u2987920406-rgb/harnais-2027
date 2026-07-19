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

  /** Recherche les k plus proches (cosine similarity). */
  async search(query: string, k = 5): Promise<SearchHit[]> {
    if (this.docs.length === 0) return [];
    const qv = await this.embed(query);
    const scored = this.docs.map((doc) => ({
      doc,
      score: cosine(qv, doc.vector),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
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
