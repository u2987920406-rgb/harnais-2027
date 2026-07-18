/**
 * SpeechTool — Transcription vocale souveraine via Ollama (whisper local).
 *
 * Ollama expose la transcription audio via le modele "whisper" (ggml-base / tiny).
 * Si le modele n'est pas installe, l'outil le dit clairement (fallback gracieux,
 * pas de crash). 0 dependance externe, 0 cloud.
 *
 * Risque: safe (lecture de fichier audio local + texte en sortie).
 */

import { Tool, ToolResult } from './registry.js';
import { OllamaConnector } from '../models/ollama.js';

export function createSpeechTools(): Tool[] {
  const connector = new OllamaConnector();

  return [
    {
      name: 'transcribe',
      description: 'Transcrire un fichier audio (wav/mp3/ogg) en texte via le modèle local whisper d\'Ollama. Requiert "ollama pull whisper".',
      risk: 'safe',
      parameters: [
        { name: 'path', type: 'string', description: 'Chemin local du fichier audio', required: true },
      ],
      execute: async (params: Record<string, any>): Promise<ToolResult> => {
        const start = Date.now();
        try {
          const { readFileSync } = await import('fs');
          const audio = readFileSync(params.path as string);
          const b64 = audio.toString('base64');

          const res = await fetch(`${connector['url'] ?? 'http://localhost:11434'}/api/transcribe`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'whisper', audio: b64 }),
            signal: AbortSignal.timeout(120000),
          });

          if (!res.ok) {
            const err = await res.text();
            // Message clair si le modele whisper n'est pas installe
            if (err.includes('not found') || err.includes('pull')) {
              return {
                success: false,
                output: '',
                error: 'Modèle whisper non installé. Lance: ollama pull whisper',
                durationMs: Date.now() - start,
              };
            }
            return { success: false, output: '', error: `HTTP ${res.status}: ${err.slice(0,200)}`, durationMs: Date.now() - start };
          }

          const data: any = await res.json();
          return {
            success: true,
            output: data.text ?? '',
            data: { model: 'whisper', length: (data.text ?? '').length },
            durationMs: Date.now() - start,
          };
        } catch (err: any) {
          return { success: false, output: '', error: err.message, durationMs: Date.now() - start };
        }
      },
    },
  ];
}
