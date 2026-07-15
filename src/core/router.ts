/**
 * Router — Routeur par capacite, local-first.
 *
 * Inspire d'Atlas core/router.ts. Remplace l'allocation statique du ModelBridge.
 * Le routeur choisit le modele selon la CAPACITE demandee, en preferant
 * le local puis le moins cher.
 *
 * Un provider declare ses capacites + son tier (1=cheap, 3=heavy).
 * Le routeur trie: local d'abord, puis par tier croissant.
 */

export type Capability =
  | 'reasoning'    // analyse, planification, debug
  | 'creative'     // generation, ideation, synthese
  | 'general'      // polyvalent, rapide
  | 'vision'       // analyse d'image
  | 'meta'         // raisonnement sur soi-meme
  | 'consolidation' // consolidation memoire
  | 'critique';    // jugement, verification

export interface ProviderInfo {
  id: string;
  label: string;
  model: string;
  isLocal: boolean;
  capabilities: Capability[];
  tier: (cap: Capability) => number;  // 1=cheap .. 3=heavy
}

/**
 * Routeur par defaut: local-first, puis moins cher.
 * Retourne les providers capables, tries du meilleur au pire.
 */
export function selectProviders(
  capability: Capability,
  providers: ProviderInfo[]
): ProviderInfo[] {
  return providers
    .filter(p => p.capabilities.includes(capability))
    .sort((a, b) => {
      if (a.isLocal !== b.isLocal) return a.isLocal ? -1 : 1;
      return a.tier(capability) - b.tier(capability);
    });
}

/**
 * Fallback: si aucun provider local, autorise le cloud si allowCloud=true.
 */
export function selectWithFallback(
  capability: Capability,
  providers: ProviderInfo[],
  allowCloud: boolean
): ProviderInfo[] {
  const local = selectProviders(capability, providers.filter(p => p.isLocal));
  if (local.length) return local;
  if (!allowCloud) return [];
  return selectProviders(capability, providers.filter(p => !p.isLocal));
}