/**
 * Sandbox — Helpers de confinement pour l'exécution des commandes shell.
 *
 * Le but est de fournir des stratégies de sandboxing sans dépendance npm:
 *   - whitelist: filtrage des commandes (application réelle dans Governance)
 *   - docker:    exécution isolée via un conteneur éphémère
 *
 * Ce module ne fait QUE construire les chaînes de commande. L'application
 * du filtrage et du choix de la stratégie reste du ressort de l'appelant
 * (par exemple Governance pour la whitelist, terminal.ts pour docker).
 */

import { exec } from 'child_process';

/**
 * Placeholder de filtrage par liste blanche.
 *
 * À ce stade l'appel ne transforme rien: le filtrage réel (validation de la
 * commande contre une whitelist de tokens) sera appliqué côté Governance.
 * On garde la fonction pour figer l'interface et permettre les tests.
 */
export function wrapForWhitelist(cmd: string): string {
  return cmd;
}

/**
 * Construit la commande docker d'exécution isolée d'une commande shell.
 *
 * - --rm            : le conteneur est supprimé après exécution
 * - -v cwd:/work    : monte le répertoire courant dans /work
 * - -w /work        : définit /work comme répertoire de travail
 * - sh -c <cmd>     : exécute la commande via le shell du conteneur
 *
 * La commande est sérialisée en JSON pour une échappement robuste des
 * espaces et guillemets, évitant les injections shell de bas niveau.
 */
export function dockerRunCmd(cmd: string, image = 'alpine:latest'): string {
  return `docker run --rm -v "${process.cwd()}:/work" -w /work ${image} sh -c ${JSON.stringify(cmd)}`;
}
