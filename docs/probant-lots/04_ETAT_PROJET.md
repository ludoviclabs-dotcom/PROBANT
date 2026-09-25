# État du projet — 2026-09-25, démonstrateur intégré local

`main` contient désormais la PR #50 fusionnée et déployée (`482314aa4e7810c3f0ffb88ed0adb163668e176f`). La branche locale `feat/probant-demo-integree` part de ce commit. Aucune publication de ce nouveau lot n'est autorisée à cette étape.

L'atelier ouvre explicitement un dossier synthétique dédié, partagé entre Tests, Synthèse et export. Les dix cycles sont exposés. Les exécutions, revues et projections sont sauvegardées dans un journal local versionné, rejoué et vérifié ; expiration à sept jours et remise à zéro explicite. Cette sauvegarde du navigateur est réservée aux fixtures synthétiques et ne garantit ni inviolabilité ni conservation de production. Le dossier DEMO SA et les dossiers existants restent distincts.

IS 2024 : pont technique disponible, impôt dû bloqué car le moteur ne couvre pas ce millésime. L'accès aux données réelles et la nouvelle API réelle des feuilles restent fermés. Le Guide V1.1 référencé n'a pas été matériellement vérifié dans ce dépôt. Les limites métier et de QA du handoff continuent de s'appliquer.

## Historique — reprise après QA finale, avant fusion de la PR #50

Base de développement : `origin/main` `cd21e0308e0d6eec604ec6be9814291cebea3b0a` (fetch du 2026-09-25), worktree `reprise-probant-lots-ae`, branche `fix/reprise-probant-lots-ae`. L'ancien arbre `7af4981` est archivé localement, sans suppression ni push.

Le main actualisé fournit OIDC, isolation serveur, ingestion durable, moteur fiscal et migrations récentes. La reprise a ajouté un noyau technique de feuilles de travail et les cycles Cash, cut-off, fournisseurs/RPNE, clients, immobilisations, capitaux, achats, congés payés, participations et IS. Les montants sont en centimes exacts ; périodes, versions, provenance, population, sélection et revue sont explicites. L'atelier est **démonstratif, avec fixtures synthétiques uniquement**. Les GET/POST réels de `/api/workpapers` restent fermés ; PUT exige un flag serveur et un en-tête de démonstration. Mémoire volatile de 30 minutes, rôles simulés : aucune prétention de sécurité ou persistance de production.

Les règles dépendant de méthodes/PBC absents restent `SOURCE REQUISE`. Aucune conclusion comptable ni constat artificiel n'est publié automatiquement. Le Guide de formation Audit.pdf V1.1, 138 pages, révisé le 21/09/2026, est pédagogique et non normatif ; ses exemples ne sont pas des règles.

Statut d'activation : **non prêt pour production**. Les cycles et exports de l'atelier demeurent limités à la démonstration jusqu'au raccordement autorisé à OIDC et à la persistance durable existants, puis validation métier et QA indépendante. Les résultats de recette finale et réserves sont dans `HANDOFF.md`.

Validation technique finale : 816 tests unitaires passés, typecheck passé, lint code 0 avec sept avertissements préexistants, build passé, E2E 32 passés/1 ignoré, sécurité et multi-locales ciblées 54 tests passés. Le scénario persistant et les réserves de sécurité/synthèse listées dans le handoff restent à traiter avant activation réelle.
