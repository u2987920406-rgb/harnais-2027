/**
 * KnowledgeGraph — Le tissu mémoire du harnais.
 *
 * Pas un fichier. Pas un vector store. Un GRAPHE.
 *
 * Nœuds = entités (Raf, NayaOS, brain-registry, une décision, un bug, une procédure)
 * Arêtes = relations (travaille_sur, préfère, a_echoué_avec, dépend_de, a_appris)
 * Propriétés = timestamps, poids de confiance, état émotionnel, etc.
 *
 * Le graphe est:
 * - Persistant (sauvé en JSON sur disque)
 * - Interrogeable (query par type, par relation, par similarité)
 * - Mutable (le cortex le met à jour en continu)
 * - Dégradable (la consolidation efface les nœuds à faible poids)
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Types ---

export interface GraphNode {
  id: string;
  type: NodeType;
  label: string;
  properties: Record<string, any>;
  createdAt: number;
  updatedAt: number;
  weight: number;      // 0..1 — confiance / pertinence. La consolidation dégrade le poids.
  accessCount: number;  // combien de fois ce nœud a été consulté
  lastAccessed: number | null;
}

export type NodeType =
  | 'entity'      // une chose concrète: Raf, NayaOS, un fichier
  | 'concept'     // une idée: "souvenirainte", "multi-agent"
  | 'episode'     // une expérience: "j'ai essayé X, ça a échoué"
  | 'procedure'   // une procédure: "pour debug NayaOS, faire..."
  | 'preference'  // une préférence utilisateur
  | 'hypothesis'  // une hypothèse non confirmée
  | 'model';      // un modèle du monde (sous-graphe cohérent)

export interface GraphEdge {
  id: string;
  from: string;  // node id
  to: string;     // node id
  type: EdgeType;
  weight: number; // 0..1
  properties: Record<string, any>;
  createdAt: number;
}

export type EdgeType =
  | 'travaille_sur'
  | 'prefere'
  | 'a_echoue_avec'
  | 'depend_de'
  | 'a_appris'
  | 'contradicte'  // relation de conflit
  | 'evolue_vers'
  | 'spawned_par'
  | 'derive_de'
  | 'connu';      // relation générique de connaissance

export interface GraphSnapshot {
  nodes: GraphNode[];
  edges: GraphEdge[];
  version: number;
  savedAt: number;
}

// --- Query ---

export interface QueryOptions {
  type?: NodeType;
  labelContains?: string;
  minWeight?: number;
  limit?: number;
}

// --- The Graph ---

export class KnowledgeGraph {
  private nodes = new Map<string, GraphNode>();
  private edges = new Map<string, GraphEdge>();
  private version = 1;
  private storePath: string;
  private maxEpisodes = 200;  // cap: au-dela, on evince les episodes les plus faibles

  constructor(storePath?: string) {
    this.storePath = storePath ?? join(__dirname, '..', '..', 'data', 'knowledge-graph.json');
  }

  // --- Lifecycle ---

  load(): void {
    if (!existsSync(this.storePath)) {
      return; // graphe vierge
    }
    try {
      const raw = readFileSync(this.storePath, 'utf-8');
      const snapshot: GraphSnapshot = JSON.parse(raw);
      this.nodes.clear();
      this.edges.clear();
      for (const n of snapshot.nodes) this.nodes.set(n.id, n);
      for (const e of snapshot.edges) this.edges.set(e.id, e);
      this.version = snapshot.version;

      // Dedup au chargement: fusionne les entites de meme label+type
      this.dedupEntities();

      // Nettoyage des aretes orphelines (pointant vers des nœuds supprimes)
      this.cleanOrphanEdges();

      console.log(`[Graph] Charge: ${this.nodes.size} noeuds, ${this.edges.size} aretes (v${this.version})`);
    } catch (err) {
      console.error('[Graph] Erreur de chargement:', err);
    }
  }

  save(): void {
    const dir = dirname(this.storePath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    const snapshot: GraphSnapshot = {
      nodes: Array.from(this.nodes.values()),
      edges: Array.from(this.edges.values()),
      version: ++this.version,
      savedAt: Date.now(),
    };
    writeFileSync(this.storePath, JSON.stringify(snapshot, null, 2));
    console.log(`[Graph] Sauve: ${this.nodes.size} noeuds, ${this.edges.size} aretes (v${this.version})`);
  }

  // --- Nodes ---

  addNode(type: NodeType, label: string, properties: Record<string, any> = {}, weight = 0.5): GraphNode {
    const id = randomUUID();
    const now = Date.now();
    const node: GraphNode = {
      id, type, label, properties,
      createdAt: now, updatedAt: now,
      weight, accessCount: 0, lastAccessed: null,
    };
    this.nodes.set(id, node);

    // Si c'est un episode, on evince les plus faibles si on depasse le cap
    if (type === 'episode') this.enforceEpisodeCap();

    return node;
  }

  /**
   * UPSERT: trouve un noeud par type+label, le met a jour s'il existe,
   * sinon le cree. C'est CA qui empeche les doublons.
   */
  upsertNode(type: NodeType, label: string, properties: Record<string, any> = {}, weight = 0.5): GraphNode {
    const existing = this.findByTypeAndLabel(type, label);
    if (existing) {
      // Merge les proprietes (nouvelles proprietes ne remplacent pas les anciennes si deja presentes)
      existing.properties = { ...existing.properties, ...properties };
      existing.weight = Math.max(existing.weight, weight);
      existing.updatedAt = Date.now();
      return existing;
    }
    return this.addNode(type, label, properties, weight);
  }

  /**
   * Trouve un noeud par type et label exact. Utilise pour l'upsert.
   */
  findByTypeAndLabel(type: NodeType, label: string): GraphNode | undefined {
    for (const node of this.nodes.values()) {
      if (node.type === type && node.label === label) return node;
    }
    return undefined;
  }

  getNode(id: string): GraphNode | undefined {
    const node = this.nodes.get(id);
    if (node) {
      node.accessCount++;
      node.lastAccessed = Date.now();
    }
    return node;
  }

  updateNode(id: string, patch: Partial<GraphNode>): void {
    const node = this.nodes.get(id);
    if (!node) return;
    Object.assign(node, patch, { updatedAt: Date.now() });
  }

  removeNode(id: string): void {
    // supprime aussi les arêtes connectées
    for (const [eid, edge] of this.edges) {
      if (edge.from === id || edge.to === id) {
        this.edges.delete(eid);
      }
    }
    this.nodes.delete(id);
  }

  query(opts: QueryOptions = {}): GraphNode[] {
    let results = Array.from(this.nodes.values());
    if (opts.type) results = results.filter(n => n.type === opts.type);
    if (opts.labelContains) {
      const q = opts.labelContains.toLowerCase();
      results = results.filter(n => n.label.toLowerCase().includes(q));
    }
    if (opts.minWeight !== undefined) results = results.filter(n => n.weight >= opts.minWeight!);
    // tri par poids décroissant, puis par récence
    results.sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      return b.updatedAt - a.updatedAt;
    });
    if (opts.limit) results = results.slice(0, opts.limit);
    return results;
  }

  // --- Edges ---

  addEdge(from: string, to: string, type: EdgeType, weight = 0.5, properties: Record<string, any> = {}): GraphEdge | null {
    if (!this.nodes.has(from) || !this.nodes.has(to)) return null;
    const id = randomUUID();
    const edge: GraphEdge = { id, from, to, type, weight, properties, createdAt: Date.now() };
    this.edges.set(id, edge);
    return edge;
  }

  getEdges(nodeId: string): GraphEdge[] {
    return Array.from(this.edges.values()).filter(e => e.from === nodeId || e.to === nodeId);
  }

  getNeighbors(nodeId: string): GraphNode[] {
    const neighborIds = new Set<string>();
    for (const edge of this.edges.values()) {
      if (edge.from === nodeId) neighborIds.add(edge.to);
      if (edge.to === nodeId) neighborIds.add(edge.from);
    }
    return Array.from(neighborIds).map(id => this.nodes.get(id)).filter(Boolean) as GraphNode[];
  }

  // --- Maintenance (utilise par la consolidation) ---

  decayAll(decayRate: number): number {
    let removed = 0;
    const now = Date.now();
    const entries = Array.from(this.nodes.entries());
    for (const [id, node] of entries) {
      const timeSinceAccess = node.lastAccessed ? now - node.lastAccessed : now - node.createdAt;
      const accessBonus = Math.min(node.accessCount * 0.01, 0.3);
      const baseDecay = decayRate * (1 - accessBonus);
      node.weight = Math.max(0, node.weight - baseDecay);
      if (node.weight < 0.05) {
        this.removeNode(id);
        removed++;
      }
    }
    return removed;
  }

  reinforce(nodeId: string, boost: number): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.weight = Math.min(1, node.weight + boost);
      node.accessCount++;
      node.lastAccessed = Date.now();
    }
  }

  // --- Deduplication et nettoyage ---

  /**
   * Fusionne les noeuds de meme type+label. Garde le plus ancien,
   * transfere les aretes, merge les proprietes, additionne les accessCount.
   */
  dedupEntities(): number {
    const seen = new Map<string, GraphNode>();
    let deduped = 0;

    const allNodes = Array.from(this.nodes.entries());
    for (const [id, node] of allNodes) {
      // Les entites et modeles sont dedup. Les episodes restent uniques.
      if (node.type !== 'entity' && node.type !== 'model') {
        seen.set(id, node);
        continue;
      }

      const key = `${node.type}::${node.label}`;
      const existing = seen.get(key);
      if (existing) {
        // Merge vers l'existant
        existing.properties = { ...existing.properties, ...node.properties };
        existing.weight = Math.max(existing.weight, node.weight);
        existing.accessCount += node.accessCount;
        existing.updatedAt = Math.max(existing.updatedAt, node.updatedAt);

        // Transfere les aretes du doublon vers l'existant
        const dupEdges = Array.from(this.edges.values()).filter(
          e => e.from === id || e.to === id
        );
        for (const edge of dupEdges) {
          if (edge.from === id) edge.from = existing.id;
          if (edge.to === id) edge.to = existing.id;
        }

        this.nodes.delete(id);
        deduped++;
      } else {
        seen.set(id, node);
      }
    }
    return deduped;
  }

  /**
   * Supprime les aretes qui pointent vers des noeuds qui n'existent plus.
   */
  cleanOrphanEdges(): number {
    let removed = 0;
    const allEdges = Array.from(this.edges.entries());
    for (const [eid, edge] of allEdges) {
      if (!this.nodes.has(edge.from) || !this.nodes.has(edge.to)) {
        this.edges.delete(eid);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Cap sur les episodes: evince les plus faibles si on depasse maxEpisodes.
   */
  enforceEpisodeCap(): void {
    const episodes = Array.from(this.nodes.values()).filter(n => n.type === 'episode');
    if (episodes.length <= this.maxEpisodes) return;

    // Trie par poids croissant, evince le 10% le plus faible
    episodes.sort((a, b) => a.weight - b.weight);
    const toRemove = Math.ceil(episodes.length * 0.1);
    for (let i = 0; i < toRemove; i++) {
      this.removeNode(episodes[i].id);
    }
    console.log(`[Graph] Episode cap: ${toRemove} episodes evinces (${this.nodes.size} restants)`);
  }

  // --- Serialization for LLM context ---

  toContext(maxNodes = 20): string {
    // Dedup par label avant d'envoyer au modele — pas de doublons dans le contexte
    const all = this.query({ limit: maxNodes * 2 });
    const seenLabels = new Set<string>();
    const top: GraphNode[] = [];
    for (const n of all) {
      const key = `${n.type}::${n.label}`;
      if (seenLabels.has(key)) continue;
      seenLabels.add(key);
      top.push(n);
      if (top.length >= maxNodes) break;
    }

    if (top.length === 0) return '[Graphe vide — systeme vierge]';
    const lines = top.map(n => {
      const edges = this.getEdges(n.id);
      const edgeSummary = edges.slice(0, 3).map(e => {
        const other = this.nodes.get(e.from === n.id ? e.to : e.from);
        return other ? `  -> ${e.type} -> ${other.label} (w=${e.weight.toFixed(2)})` : '';
      }).join('\n');
      return `[${n.type}] ${n.label} (w=${n.weight.toFixed(2)}, acc=${n.accessCount})\n${edgeSummary}`;
    });
    return lines.join('\n\n');
  }

  stats(): { nodes: number; edges: number; version: number } {
    return { nodes: this.nodes.size, edges: this.edges.size, version: this.version };
  }
}