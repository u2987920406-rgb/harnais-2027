/**
 * VisionTool — Decrit une image via le modele local qwen3-vl (souverain).
 *
 * Instancie un ModelBridge en mode local (qwen3-vl, 0 cloud) et appelle
 * bridge.vision(). Permet au Cortex d'"voir" une image sans dependance externe.
 *
 * Risque: safe (lecture d'image locale + description texte).
 */

import { Tool, ToolResult } from './registry.js';
import { ModelBridge } from '../models/bridge.js';

export function createVisionTools(): Tool[] {
  // Bridge local strict: vision uniquement, pas de cloud.
  const bridge = new ModelBridge({
    visionModel: 'qwen3-vl:8b',
    allowCloud: false,
  });

  return [
    {
      name: 'image_describe',
      description: 'Décrire le contenu d\'une image (png/jpg) via le modèle local qwen3-vl. Retourne une description texte.',
      risk: 'safe',
      parameters: [
        { name: 'path', type: 'string', description: 'Chemin local de l\'image', required: true },
        { name: 'prompt', type: 'string', description: 'Consigne (défaut: décris en détail)', required: false },
      ],
      execute: async (params: Record<string, any>): Promise<ToolResult> => {
        const start = Date.now();
        try {
          const path = params.path as string;
          const prompt = (params.prompt as string) || 'Décris cette image en détail.';
          const res = await bridge.vision(path, prompt);
          return {
            success: true,
            output: res.text,
            data: { model: res.model, tokens: res.tokensGenerated ?? 0 },
            durationMs: Date.now() - start,
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message, durationMs: Date.now() - start };
        }
      },
    },
  ];
}
