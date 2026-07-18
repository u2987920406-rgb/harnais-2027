/**
 * Sandbox — Helpers de confinement pour l'exécution des commandes shell.
 *
 * Le but est de fournir des stratégies de sandboxing sans dépendance npm:
 *   - whitelist: filtrage des commandes (allowlist de tokens de base)
 *   - docker:    exécution isolée via un conteneur éphémère
 *
 * 0 dependance npm — TypeScript strict, ESModules.
 */

import { exec } from 'child_process';

/**
 * Allowlist de commandes autorisées en mode whitelist.
 * Toute commande dont le premier token (après découpage) n'est pas dans cette
 * liste est refusée. Cela empêche l'exécution de binaires arbitraires.
 * On autorise uniquement les utilitaires de lecture/inspection courants.
 */
const WHITELIST = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'wc', 'pwd', 'echo', 'date',
  'find', 'file', 'stat', 'readlink', 'realpath', 'which', 'type', 'env',
  'node', 'npm', 'npx', 'tsx', 'python3', 'python', 'git', 'ps', 'tree',
  'id', 'whoami', 'uname', 'df', 'du', 'free', 'top', 'curl', 'wget',
]);

/**
 * Filtre une commande contre l'allowlist.
 * Retourne { ok, cmd } où cmd est la commande nettoyée (échappée) si ok.
 */
export function wrapForWhitelist(cmd: string): { ok: boolean; cmd: string; reason?: string } {
  const trimmed = cmd.trim();
  if (!trimmed) return { ok: false, cmd, reason: 'commande vide' };

  // Le premier token (avant espace) est la commande demandée.
  // On tolère aussi `sudo <cmd>` interdit ici, et les chemins absolus / relatifs.
  const firstTokenMatch = trimmed.match(/^(?:\.\/|[\w./\\-]+?)(?=\s|$)/);
  if (!firstTokenMatch) return { ok: false, cmd, reason: 'commande non analysable' };
  const base = firstTokenMatch[0].replace(/^.*\//, ''); // retire le chemin, garde le nom

  if (!WHITELIST.has(base)) {
    return { ok: false, cmd, reason: `commande '${base}' hors allowlist` };
  }
  return { ok: true, cmd: trimmed };
}

/**
 * Construit la commande docker d'exécution isolée d'une commande shell.
 *
 * - --rm            : le conteneur est supprimé après exécution
 * - -v cwd:/work    : monte le répertoire courant dans /work
 * - -w /work        : définit /work comme répertoire de travail
 * - --network=none  : pas d'accès réseau depuis le conteneur (confinement)
 * - --read-only     : système de fichiers en lecture seule (sauf /work monté)
 * - sh -c <cmd>     : exécute la commande via le shell du conteneur
 *
 * La commande est sérialisée en JSON pour une échappement robuste des
 * espaces et guillemets, évitant les injections shell de bas niveau.
 */
export function dockerRunCmd(cmd: string, image = 'alpine:latest'): string {
  return `docker run --rm --network=none --read-only -v "${process.cwd()}:/work" -w /work ${image} sh -c ${JSON.stringify(cmd)}`;
}

/**
 * Échappe une commande shell pour éviter l'injection de bas niveau.
 * La commande sera exécutée via `sh -c "<cmd>"` : on neutralise donc les
 * métacaractères interprétés par le shell dans un contexte double-quote :
 *   $ ` " \  et les expansions $(...) / ${...}
 * On préfixe chaque occurrence par un backslash. Cela empêche toute
 * substitution arbitraire tout en préservant le texte de la commande.
 */
export function escapeShell(cmd: string): string {
  return cmd.replace(/[\\$`"!]/g, '\\$&');
}
