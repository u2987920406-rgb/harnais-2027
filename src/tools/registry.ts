/**
 * ToolRegistry — Le registre dynamique d'outils du cortex.
 *
 * Pas une liste hardcodée. Un registre où les outils s'enregistrent eux-mêmes.
 * Le cortex découvre les outils disponibles, génère leur schéma à la volée,
 * et les expose au modèle pour qu'il puisse les appeler.
 *
 * Chaque outil a:
 * - Un nom et une description (pour le modèle)
 * - Un schéma de paramètres (JSON Schema)
 * - Une fonction d'exécution (qui retourne un résultat structuré)
 * - Un niveau de risque (pour l'autonomie graduée)
 */

export type RiskLevel = 'safe' | 'moderate' | 'dangerous';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean';
  description: string;
  required: boolean;
  default?: any;
}

export interface ToolResult {
  success: boolean;
  output: string;
  data?: any;
  error?: string;
  durationMs: number;
}

export interface Tool {
  name: string;
  description: string;
  risk: RiskLevel;
  parameters: ToolParameter[];
  execute: (params: Record<string, any>) => Promise<ToolResult>;
}

export class ToolRegistry {
  private tools = new Map<string, Tool>();

  register(tool: Tool): void {
    this.tools.set(tool.name, tool);
    console.log(`[Tools] Enregistré: ${tool.name} (${tool.risk})`);
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  list(): Tool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Génère la description des outils pour le prompt du modèle.
   * Format compact — pas un JSON Schema complet, juste ce que le modèle
   * doit savoir pour appeler l'outil correctement.
   */
  toPrompt(): string {
    const tools = this.list();
    if (tools.length === 0) return '[Aucun outil disponible]';

    return tools.map(t => {
      const params = t.parameters.map(p =>
        `${p.name}${p.required ? '' : '?'}: ${p.type} — ${p.description}`
      ).join(', ');
      return `[${t.risk}] ${t.name}(${params}) — ${t.description}`;
    }).join('\n');
  }

  /**
   * Exécute un outil par nom. Vérifie les paramètres requis.
   */
  async execute(name: string, params: Record<string, any>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        output: '',
        error: `Outil inconnu: ${name}`,
        durationMs: 0,
      };
    }

    // Vérifie les paramètres requis
    for (const param of tool.parameters) {
      if (param.required && params[param.name] === undefined) {
        return {
          success: false,
          output: '',
          error: `Paramètre requis manquant: ${param.name}`,
          durationMs: 0,
        };
      }
      // applique les valeurs par défaut
      if (params[param.name] === undefined && param.default !== undefined) {
        params[param.name] = param.default;
      }
    }

    return tool.execute(params);
  }
}