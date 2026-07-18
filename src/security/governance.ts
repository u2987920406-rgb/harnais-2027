// Module de gouvernance agentique : applique la politique du mode courant
// (auto / plan / permission / edit) a chaque appel d'outil.
// 0 dependance npm — TypeScript strict, ESModules.

/** Mode de gouvernance choisi par l'utilisateur. */
export type GovernanceMode = 'auto' | 'plan' | 'permission' | 'edit';

/** Strategie d'isolation de l'execution shell. */
export type SandboxStrategy = 'none' | 'whitelist' | 'docker';

/** Decision prise par la gouvernance pour un appel d'outil. */
export interface Decision {
  action: 'allow' | 'deny' | 'ask';
  reason: string;
}

// Outils consideres comme dangereux (execution arbitraire).
const DANGEROUS = new Set(['shell_exec']);

// Motifs de commandes interdites meme en whitelist (destructif / privelege).
const FORBIDDEN = /(rm\s+-rf|sudo|mkfs|format|dd\s+if|shutdown|reboot|>\s*\/dev\/)/i;

/**
 * Politique centralisee de gouvernance.
 * decide() retourne allow / deny / ask pour chaque outil selon le mode.
 */
export class Governance {
  constructor(
    public mode: GovernanceMode,
    public sandbox: SandboxStrategy,
    public allowDangerous: boolean,
  ) {}

  decide(tool: string, params: Record<string, any>): Decision {
    // mode plan : lecture seule, aucune action permise
    if (this.mode === 'plan') return { action: 'deny', reason: 'mode plan: actions interdites' };

    if (DANGEROUS.has(tool)) {
      // outils dangereux desactives par config
      if (!this.allowDangerous) return { action: 'deny', reason: 'outils dangereux desactives' };
      // whitelist : filtre les commandes interdites
      if (this.sandbox === 'whitelist' && FORBIDDEN.test(String(params.command ?? '')))
        return { action: 'deny', reason: 'commande interdite par whitelist' };
      // mode permission : validation utilisateur requise
      if (this.mode === 'permission') return { action: 'ask', reason: 'validation requise (mode permission)' };
    }

    // mode edit : toute ecriture de fichier demande validation
    if (this.mode === 'edit' && tool === 'file_write')
      return { action: 'ask', reason: 'edition de fichier requiert validation' };

    return { action: 'allow', reason: 'ok' };
  }
}
