---
name: security-review
description: "Revue securite : injection, secrets, dependances, execution非 fiable"
tags: [security, verify]
---
# Security Review

Tout livrable qui touche des entrees externe ou des fichiers doit passer ces gardes :

1. INJECTION. Aucune concatenation dans une commande shell / requete SQL. Utiliser des APIs
   parametrees (execFileSync sans shell, requetes preparees).
2. SECRETS. Aucun secret hardcode. Si une cle est necessaire, elle vient de l'environnement
   (process.env) ou est refusee. Le harnais prefere un echec honnete a une fuite.
3. DEPENDANCES. Ajouter une dependance = un risque de supply chain. Justifier chaque ajout ;
   preferer le stdlib (node:fs, node:sqlite, node:crypto) aux packages tiers.
4. EXECUTION. Tout code execute pour le compte de l'utilisateur passe par le sandbox isole
   (execFileSync, pas de shell) et son resultat est capture, pas suppose.
5. CHEMINS. Valider les chemins (pas de `..` traversant, pas d'ecriture hors cwd autorise).

Si une menace n'est pas prouvablement neutralisee, dit KO — jamais de succes suppose.
