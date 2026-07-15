---
name: error-recovery
description: "Recuperation sur echec : boucle REFLECT bornee, une correction ciblee, escalade honnete"
tags: [recovery, atlas]
---
# Error Recovery (agentique)

Quand une etape echoue (Verifier rouge, outil en erreur) :

1. REFLECT BORNE. La boucle re-essaie avec un plan corrige, mais dans la limite de maxIterations
   et du budget tokens (cf. budget-bound-loop). Pas de rebond infini.
2. UNE CORRECTION CIBLEE. Chaque tentative change UNE chose (cause supposee). Pas de spray de
   variantes qui noie le signal.
3. LIRE LE VERDICT. Le Verifier dit POURQUOI (quelle gate a echoue). Agir sur la cause, pas le
   symptome (cf. debugging).
4. ESCALADER HONNETEMENT. Si borne atteinte sans succes : rendre le meilleur resultat obtenu
   avec un verdict KO explicite. Jamais de succes fabrique.
5. MEMORISER L'ECHEC. Noter la cause pour ne pas la rejouer (cf. memory-management).

Le harnais s'arrete proprement : echec prouve > silence ou faux succes.
