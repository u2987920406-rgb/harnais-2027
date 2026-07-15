---
name: guardrails
description: "Garde-fous : refuser les actions dangereuses, sandbox, confirmer l'irreversible"
tags: [guardrails, safety, atlas]
---
# Guardrails (agentique)

Un agent autonome local doit etre sur :

1. REFUSER LE DANGEREUX. Suppression de donnees utilisateur, exfiltration, commande destructrice :
   refuse par defaut. Le harnais prefere un echec honnete a un dommage (cf. atlas-doctrine).
2. SANDBOX. Tout effet de bord passe par le sandbox isole (execFileSync sans shell, cwd borne).
   Pas d'acces hors zone autorisee.
3. IRREVERSIBLE = CONFIRMER. Ce qui ne peut etre defait (rm -rf, push force, ecriture systeme)
   necessite une confirmation explicite de l'utilisateur. Jamais d'action silencieuse.
4. CHEMINS. Valider les chemins (pas de `..` traversant). Le harnais n'ecrit pas hors cwd sans accord.
5. SECRETS. Aucun secret lu/ecrit en clair sans avertir (cf. security-review).
6. BORNE. Un agent ne boucle pas pour contourner un garde-fou. Refus = remonter, pas forcer.

Le Verifier et le kernel font respecter les garde-fous mecaniquement, pas seulement demande.
