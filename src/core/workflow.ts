/**
 * WorkflowEngine — Moteur de workflow type n8n.
 *
 * Inspire d'Atlas agents/workflow.ts. Adapte au harnais.
 *
 * On declare un graphe (nodes + edges), le moteur l'execute en ordre
 * topologique avec trace par noeud, sous-workflows imbriques, et borne maxSteps.
 *
 * Types de noeuds:
 * - agent: un agent du spawner
 * - tool: un outil du ToolRegistry
 * - transform: une fonction pure
 * - workflow: un sous-workflow imbrique
 */

import type { ModelBridge, CognitiveMode } from '../models/bridge.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { KnowledgeGraph } from '../memory/knowledge-graph.js';
import type { SkillRegistry } from './skill.js';

export type NodeKind = 'agent' | 'tool' | 'transform' | 'workflow';

export interface WorkflowNode {
  id: string;
  kind: NodeKind;
  ref: string;
  capability?: CognitiveMode;
  system?: string;
  transform?: (input: unknown) => unknown;
  sub?: WorkflowDef;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  map?: { out: string; in: string };
}

export interface WorkflowDef {
  id: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  maxSteps?: number;
}

export interface NodeTrace {
  id: string;
  kind: NodeKind;
  ref: string;
  status: 'done' | 'failed' | 'skipped';
  ms: number;
  error?: string;
}

export interface WorkflowResult {
  ok: boolean;
  steps: number;
  outputs: Record<string, unknown>;
  trace: NodeTrace[];
  error?: string;
}

function topoSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): string[] {
  const indeg = new Map<string, number>();
  const adj = new Map<string, string[]>();
  for (const n of nodes) { indeg.set(n.id, 0); adj.set(n.id, []); }
  for (const e of edges) {
    if (!indeg.has(e.from) || !indeg.has(e.to)) throw new Error(`edge inconnue: ${e.from}->${e.to}`);
    adj.get(e.from)!.push(e.to);
    indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  }
  const q: string[] = [];
  for (const [id, d] of Array.from(indeg.entries())) if (d === 0) q.push(id);
  const order: string[] = [];
  while (q.length) {
    const id = q.shift()!;
    order.push(id);
    for (const nx of adj.get(id) ?? []) {
      indeg.set(nx, (indeg.get(nx) ?? 1) - 1);
      if (indeg.get(nx) === 0) q.push(nx);
    }
  }
  if (order.length !== nodes.length) throw new Error('cycle detecte dans le workflow');
  return order;
}

export class WorkflowEngine {
  private bridge: ModelBridge;
  private tools: ToolRegistry;
  private graph: KnowledgeGraph;
  private skills: SkillRegistry | null = null;
  private workflows = new Map<string, WorkflowDef>();

  constructor(bridge: ModelBridge, tools: ToolRegistry, graph: KnowledgeGraph, skills?: SkillRegistry) {
    this.bridge = bridge;
    this.tools = tools;
    this.graph = graph;
    this.skills = skills ?? null;
  }

  registerWorkflow(def: WorkflowDef): void {
    this.workflows.set(def.id, def);
  }

  async run(def: WorkflowDef, initial: Record<string, unknown> = {}): Promise<WorkflowResult> {
    const order = topoSort(def.nodes, def.edges);
    const nodeById = new Map(def.nodes.map(n => [n.id, n]));
    const outputs: Record<string, unknown> = { ...initial };
    const trace: NodeTrace[] = [];
    const maxSteps = def.maxSteps ?? 50;
    let steps = 0;

    for (const id of order) {
      if (steps++ > maxSteps) {
        trace.push({ id, kind: nodeById.get(id)!.kind, ref: nodeById.get(id)!.ref, status: 'skipped', ms: 0, error: 'maxSteps' });
        return { ok: false, steps, outputs, trace, error: 'maxSteps atteint' };
      }
      const node = nodeById.get(id)!;
      const t0 = Date.now();
      try {
        if (node.kind === 'agent') {
          const brief = String(outputs[`${id}:in`] ?? JSON.stringify(outputs));
          const sys = node.system ?? '';
          const response = await this.bridge.think(brief, node.capability ?? 'general', {
            system: sys, temperature: 0.5, maxTokens: 2048,
          });
          outputs[id] = response.text;
        } else if (node.kind === 'tool') {
          const tool = this.tools.get(node.ref);
          if (!tool) throw new Error(`outil inconnu: ${node.ref}`);
          const args = (outputs[`${id}:in`] as Record<string, any>) ?? {};
          const result = await tool.execute(args);
          outputs[id] = result.output;
        } else if (node.kind === 'transform') {
          outputs[id] = node.transform ? node.transform(outputs[`${id}:in`]) : outputs[`${id}:in`];
        } else if (node.kind === 'workflow') {
          const sub = node.sub ?? this.workflows.get(node.ref);
          if (!sub) throw new Error(`sous-workflow inconnu: ${node.ref}`);
          const subIn = (outputs[`${id}:in`] as Record<string, unknown>) ?? {};
          const subRes = await this.run(sub, subIn);
          for (const t of subRes.trace) trace.push({ ...t, id: `${id}.${t.id}` });
          if (!subRes.ok) throw new Error(`sous-workflow ${node.ref} echoue: ${subRes.error}`);
          outputs[id] = subRes.outputs;
        }
        for (const e of def.edges.filter(x => x.from === id)) {
          const val = e.map ? (outputs[id] as any)?.[e.map.out] : outputs[id];
          outputs[`${e.to}:in`] = val;
        }
        trace.push({ id, kind: node.kind, ref: node.ref, status: 'done', ms: Date.now() - t0 });
      } catch (err: any) {
        trace.push({ id, kind: node.kind, ref: node.ref, status: 'failed', ms: Date.now() - t0, error: err.message });
        return { ok: false, steps, outputs, trace, error: `${id}: ${err.message}` };
      }
    }
    return { ok: true, steps, outputs, trace };
  }
}

export function formatTrace(trace: NodeTrace[]): string {
  return trace.map(t =>
    `  ${t.status === 'done' ? 'OK' : t.status === 'failed' ? 'KO' : 'SKIP'} ${t.id} (${t.kind}:${t.ref}) ${t.ms}ms${t.error ? ` — ${t.error}` : ''}`
  ).join('\n');
}