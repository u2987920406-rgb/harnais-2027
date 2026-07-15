/**
 * NayaOS Tools — Outils NayaOS pour le ToolRegistry du cortex.
 *
 * Ces outils permettent au cortex de LIRE et COMMANDER NayaOS
 * via sa boucle de tool-calling. Le modele peut:
 * - lister les projets et agents NayaOS
 * - envoyer un chat (declencher un build)
 * - creer un agent, assigner une mission, demarrer/arreter un agent
 * - lire le brain-registry
 *
 * Chaque outil wrappe le NayaOSBridge en lui ajoutant le schema Tool.
 */

import { NayaOSBridge } from '../bridge/nayaos.js';
import { Tool, ToolResult } from './registry.js';

/**
 * Cree les outils NayaOS a partir d'un NayaOSBridge.
 * Le bridge est partage — tous les outils utilisent la meme instance.
 */
export function createNayaOSTools(bridge: NayaOSBridge): Tool[] {
  const t0 = () => Date.now();

  async function listProjects(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const projects = await bridge.listProjects();
      const output = projects.length > 0
        ? projects.map((p: any, i: number) => `[${i + 1}] ${p.name ?? p} — ${p.status ?? 'unknown'}`).join('\n')
        : 'Aucun projet NayaOS';
      return { success: true, output, data: { count: projects.length }, durationMs: t0() - start };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function listAgents(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const data = await bridge.listAgents();
      const agents = Array.isArray(data) ? data : [];
      const output = agents.length > 0
        ? agents.map((a: any, i: number) => `[${i + 1}] ${a.name ?? a.id} (${a.category ?? '?'}) — ${a.status ?? 'unknown'}`).join('\n')
        : 'Aucun agent NayaOS';
      return { success: true, output, data: { count: agents.length }, durationMs: t0() - start };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function sendChat(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const prompt = params.prompt as string;
      const project = params.project as string | undefined;
      const model = params.model as string | undefined;
      const result = await bridge.sendChat(prompt, project, model);
      return {
        success: !result.toLowerCase().includes('error'),
        output: result.slice(0, 4000),
        data: { prompt: prompt.slice(0, 100), project },
        durationMs: t0() - start,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function createAgent(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const result = await bridge.createAgent(
        params.name as string,
        params.category as string,
        params.description as string,
      );
      const success = !result?.error;
      return {
        success,
        output: success ? `Agent cree: ${params.name} (${params.category})` : `Erreur: ${result?.error}`,
        data: result,
        durationMs: t0() - start,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function assignMission(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const result = await bridge.assignMission(
        params.agentId as string,
        params.mission as string,
      );
      const success = !result?.error;
      return {
        success,
        output: success ? `Mission assignee a ${params.agentId}` : `Erreur: ${result?.error}`,
        data: result,
        durationMs: t0() - start,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function startAgent(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const result = await bridge.startAgent(params.agentId as string);
      return {
        success: !result?.error,
        output: `Agent ${params.agentId} ${result?.error ? 'erreur: ' + result.error : 'demarre'}`,
        data: result,
        durationMs: t0() - start,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function stopAgent(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const result = await bridge.stopAgent(params.agentId as string);
      return {
        success: !result?.error,
        output: `Agent ${params.agentId} ${result?.error ? 'erreur: ' + result.error : 'arrete'}`,
        data: result,
        durationMs: t0() - start,
      };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  async function getBrainRegistry(params: Record<string, any>): Promise<ToolResult> {
    const start = t0();
    try {
      const data = await bridge.getBrainRegistry();
      const output = data ? JSON.stringify(data, null, 2).slice(0, 4000) : 'Brain-registry indisponible';
      return { success: !!data, output, data, durationMs: t0() - start };
    } catch (err: any) {
      return { success: false, output: '', error: err.message, durationMs: t0() - start };
    }
  }

  return [
    {
      name: 'nayaos_projects',
      description: 'Lister les projets NayaOS et leur etat',
      risk: 'safe',
      parameters: [],
      execute: listProjects,
    },
    {
      name: 'nayaos_agents',
      description: 'Lister les agents NayaOS et leur etat',
      risk: 'safe',
      parameters: [],
      execute: listAgents,
    },
    {
      name: 'nayaos_chat',
      description: 'Envoyer un prompt a NayaOS (declenche le relay Eleve — build/generation de code)',
      risk: 'moderate',
      parameters: [
        { name: 'prompt', type: 'string', description: 'Le prompt a envoyer', required: true },
        { name: 'project', type: 'string', description: 'Nom du projet (optionnel)', required: false },
        { name: 'model', type: 'string', description: 'Modele a utiliser (optionnel)', required: false },
      ],
      execute: sendChat,
    },
    {
      name: 'nayaos_create_agent',
      description: 'Creer un nouvel agent NayaOS',
      risk: 'dangerous',
      parameters: [
        { name: 'name', type: 'string', description: 'Nom de l\'agent', required: true },
        { name: 'category', type: 'string', description: 'Categorie: collecteur, processeur, acteur, coordinateur', required: true },
        { name: 'description', type: 'string', description: 'Description de l\'agent', required: true },
      ],
      execute: createAgent,
    },
    {
      name: 'nayaos_mission',
      description: 'Assigner une mission a un agent NayaOS',
      risk: 'moderate',
      parameters: [
        { name: 'agentId', type: 'string', description: 'ID de l\'agent', required: true },
        { name: 'mission', type: 'string', description: 'Description de la mission', required: true },
      ],
      execute: assignMission,
    },
    {
      name: 'nayaos_start_agent',
      description: 'Demarrer un agent NayaOS',
      risk: 'moderate',
      parameters: [
        { name: 'agentId', type: 'string', description: 'ID de l\'agent a demarrer', required: true },
      ],
      execute: startAgent,
    },
    {
      name: 'nayaos_stop_agent',
      description: 'Arreter un agent NayaOS',
      risk: 'moderate',
      parameters: [
        { name: 'agentId', type: 'string', description: 'ID de l\'agent a arreter', required: true },
      ],
      execute: stopAgent,
    },
    {
      name: 'nayaos_brain_registry',
      description: 'Lire le registre des cerveaux NayaOS (modele par agent)',
      risk: 'safe',
      parameters: [],
      execute: getBrainRegistry,
    },
  ];
}