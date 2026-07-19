/**
 * NayaOS Bridge — Pont HTTP vers l'API REST de MangoOS (le repo appelle
 * MangoOS "NayaOS" en interne — confirme par Raf le 2026-07-19).
 *
 * Le harnais peut LIRE l'etat de MangoOS et le COMMANDER.
 *
 * LECTURE:
 *  - GET /api/projects — liste les projets
 *  - GET /api/agents — liste les agents + leur etat
 *  - GET /api/agents/:id/logs — logs d'un agent
 *  - GET /api/brain-registry — registre des cerveaux
 *
 * COMMANDE:
 *  - POST /api/chat — envoie un prompt (declenche le relay Eleve)
 *  - POST /api/agents — cree un agent
 *  - POST /api/agents/:id/mission — assigne une mission
 *  - POST /api/agents/:id/start — demarre un agent
 *  - POST /api/agents/:id/stop — arrete un agent
 *
 * ATTENTION (audit 2026-07-19) : le port par defaut a ete corrige (3001->3000,
 * le port reel du backend Express MangoOS, cf. CLAUDE.md "Ports"). Les
 * endpoints /api/agents (CRUD complet : creation, mission, start/stop) ne
 * correspondent PAS a l'API MangoOS actuelle verifiee (pas de CRUD multi-agents
 * cote MangoOS aujourd'hui) — seuls /api/projects et /api/chat sont surs
 * d'exister. Ce pont reste donc NON VERIFIE end-to-end au-dela du port ; ne pas
 * le considerer fonctionnel sans re-tester chaque endpoint contre le MangoOS reel.
 *
 * Le harnais enregistre chaque action dans son graphe.
 */

import { KnowledgeGraph } from '../memory/knowledge-graph.js';

export interface NayaOSConfig {
  baseUrl: string;
  timeout: number;
}

const DEFAULT_CONFIG: NayaOSConfig = {
  baseUrl: process.env.NAYAOS_URL ?? 'http://localhost:3000',
  timeout: 60_000,
};

export class NayaOSBridge {
  private config: NayaOSConfig;
  private graph: KnowledgeGraph;

  constructor(graph: KnowledgeGraph, config: Partial<NayaOSConfig> = {}) {
    this.graph = graph;
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  private async get(path: string): Promise<any> {
    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async post(path: string, body: any): Promise<any> {
    try {
      const res = await fetch(`${this.config.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });
      if (!res.ok) return { error: `HTTP ${res.status}` };
      return await res.json();
    } catch (err: any) {
      return { error: err.message };
    }
  }

  /**
   * Verifie si NayaOS est en ligne.
   */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.config.baseUrl}/api/projects`, {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // --- LECTURE ---

  async listProjects(): Promise<any[]> {
    const data = await this.get('/api/projects');
    const projects = data?.projects ?? data ?? [];
    if (Array.isArray(projects)) {
      for (const p of projects) {
        this.graph.upsertNode('entity', `Projet: ${p.name ?? p}`, {
          type: 'nayaos-project',
          status: p.status ?? 'unknown',
        }, 0.7);
      }
    }
    return projects;
  }

  async listAgents(): Promise<any[]> {
    const data = await this.get('/api/agents');
    const agents = data?.agents ?? [];
    if (Array.isArray(agents)) {
      for (const a of agents) {
        this.graph.upsertNode('entity', `Agent NayaOS: ${a.name ?? a.id}`, {
          type: 'nayaos-agent',
          category: a.category,
          status: data?.states?.[a.id]?.status ?? 'unknown',
        }, 0.6);
      }
    }
    return agents;
  }

  async getAgentLogs(agentId: string): Promise<string[]> {
    const data = await this.get(`/api/agents/${agentId}/logs`);
    return data?.logs ?? [];
  }

  async getBrainRegistry(): Promise<any> {
    return await this.get('/api/brain-registry');
  }

  // --- COMMANDE ---

  async sendChat(prompt: string, project?: string, model?: string): Promise<string> {
    console.log(`[NayaOS] Envoi chat: "${prompt.slice(0, 60)}..."`);
    const result = await this.post('/api/chat', { prompt, project, model });

    // Enregistre dans le graphe
    this.graph.addNode('episode', `NayaOS chat: "${prompt.slice(0, 60)}"`, {
      type: 'nayaos-command',
      prompt,
      project,
      result: typeof result === 'string' ? result.slice(0, 200) : JSON.stringify(result).slice(0, 200),
      timestamp: Date.now(),
    }, 0.8);

    return typeof result === 'string' ? result : JSON.stringify(result);
  }

  async createAgent(name: string, category: string, description: string): Promise<any> {
    console.log(`[NayaOS] Creation agent: ${name} (${category})`);
    const result = await this.post('/api/agents', { name, category, description });

    if (!result?.error) {
      this.graph.upsertNode('entity', `Agent NayaOS: ${name}`, {
        type: 'nayaos-agent',
        category,
        description,
        created: true,
      }, 0.8);
    }

    return result;
  }

  async assignMission(agentId: string, mission: string): Promise<any> {
    console.log(`[NayaOS] Mission pour ${agentId}: "${mission.slice(0, 60)}..."`);
    const result = await this.post(`/api/agents/${agentId}/mission`, { mission });
    this.graph.addNode('episode', `Mission: ${agentId}`, {
      type: 'nayaos-mission',
      agentId, mission, timestamp: Date.now(),
    }, 0.7);
    return result;
  }

  async startAgent(agentId: string): Promise<any> {
    return await this.post(`/api/agents/${agentId}/start`, {});
  }

  async stopAgent(agentId: string): Promise<any> {
    return await this.post(`/api/agents/${agentId}/stop`, {});
  }

  // --- CONTEXTE ENRICHI ---

  /**
   * Recupere le contexte enrichi: warnings NayaQA + etat NayaOS.
   * A injecter dans les prompts du cortex quand on parle de projets NayaOS.
   */
  async getEnrichedContext(projectName?: string): Promise<string> {
    const parts: string[] = [];

    const projects = await this.listProjects();
    if (projects.length > 0) {
      parts.push(`Projets NayaOS actifs: ${projects.length}`);
    }

    const agents = await this.listAgents();
    if (agents.length > 0) {
      parts.push(`Agents NayaOS: ${agents.length}`);
    }

    return parts.join('\n');
  }

  getConfig(): NayaOSConfig { return this.config; }
}