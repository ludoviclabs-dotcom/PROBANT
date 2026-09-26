# Handoff — état courant du démonstrateur intégré (2026-09-25)

La PR #50 de reprise A–E est fusionnée et publiée sur `main` au commit `482314aa4e7810c3f0ffb88ed0adb163668e176f`. Le présent lot est préparé localement sur `feat/probant-demo-integree`, sans push, PR, merge ni déploiement. Les décisions de reprise ci-dessous restent l'historique du 25/09/2026 avant fusion.

Parcours de revue locale : `/dashboard/tests` → ouverture explicite d'un dossier `SYN-…` → dix cycles → travaux et exceptions ou limites → revue simulée → verrouillage → `/dashboard/synthese` du même dossier → export JSON, Markdown et manifeste. Le journal est versionné, contrôlé par empreinte et rejoué localement après rechargement ; expiration à sept jours et remise à zéro explicite. Il ne s'agit ni d'une preuve inviolable ni d'une persistance de production. Aucune donnée réelle admise. Les anciens constats de DEMO SA ne sont pas transposés silencieusement.

Cash, Cut-off, Fournisseurs/RPNE, Clients, Immobilisations, Capitaux, Achats, Congés payés et Participations utilisent leurs moteurs existants avec fixtures synthétiques ; les sorties non concluantes demeurent non concluantes. IS présente le pont et les gates, mais le calcul de l'impôt est bloqué pour le millésime 2024 du dossier. Les sources et méthodes de mission réelles restent `SOURCE REQUISE`. Le fichier Guide V1.1/138 pages n'est pas présent dans ce dépôt ; seule sa référence et son empreinte figurent dans le code. Le PDF V1.0/120 pages signalé dans la conversation n'a pas été substitué.

Réserves encore ouvertes : QA métier indépendante, méthodes/PBC réelles, adaptateur durable autorisé pour l'atelier réel, E2E persistant avec infrastructure dédiée, millésimes et sources fiscales couverts, points QF-08/09/14–21 historiques décrits ci-dessous. Le manifeste décrit séparément la maturité fonctionnelle, le mode synthétique, l'état du travail et sa conclusion. Le résultat de validation de ce lot est à lire dans la section finale du présent document.

Validation locale du lot : `npm test` 87 suites / 853 tests réussis ; `npm run typecheck` réussi après correction d'un test ; `npm run lint` code 0, sept avertissements préexistants hors fichiers modifiés ; `npm run build` réussi, 149 pages générées. Le premier `npm run test:e2e` a affiché les 32 succès et un cas FEC persistant ignoré, puis son serveur intégré a bloqué la sortie du processus. Une seconde exécution contre le même build, avec serveur local séparé, a terminé avec code 0 : **32 réussis, 1 ignoré**, dont les trois nouveaux parcours à 390/768/1440 px. Le cas ignoré n'est pas déclaré réussi. `git diff --check` ne relève aucune erreur.

## Historique de la reprise A–E avant fusion

Référence `origin/main` : `cd21e0308e0d6eec604ec6be9814291cebea3b0a`. Archive récupérable : `archive/probant-lots-ae-2026-09-25` (`30c5255`). Branche de reprise : `fix/reprise-probant-lots-ae`. Aucun merge ni déploiement ; branche proposée en PR de revue, sans activation réelle.

Main conservé : OIDC/isolation, ingestion durable, moteur fiscal, migrations 0000–0004, synthèse/export historiques. Transposé : noyau de feuilles, cycles synthétiques A→E, revue et projection, export figé, atelier et disponibilité. Corrigés : QF-01/02/03/06/10/11/12/13 et partie de QF-19. QF-04/05 traités par l'archive et la nouvelle base. QF-22 : références pédagogiques V1.1/138 pages ; aucune règle dérivée des exemples.

La nouvelle API réelle de feuilles reste volontairement **désactivée** : l'adaptateur OIDC + persistance durable n'est pas livré. Le canal de démonstration est opt-in, synthétique, volatile et affiche les rôles simulés. Méthodes et PBC de mission : `SOURCE REQUISE`. Les anciens parcours demeurent sous les contrôles main renforcés ; ne pas les présenter comme certifiés sans QA.

À vérifier en QA indépendante ultérieure : QF-08/09 métriques historiques main hors nouveau noyau ; QF-14 effet fiscal inconnu dans la synthèse legacy ; QF-15/16 déduplication/couverture sur cas métiers réels ; QF-17 paquet de preuve sur livrables réels ; QF-18 visibilité générale ; QF-19 limite de débit distribuée ; QF-20/21 couverture et rendu détaillés. Le préflight XLSX est ajouté et testé ; les autres points ne sont pas déclarés clos par la seule transposition. QF-07 est couvert par la recette synthétique reproductible, mais le scénario de dépôt persistant est ignoré sans infrastructure dédiée.

## Validation finale

Unitaires : 84 suites/816 tests passés avant le dernier garde XLSX ; ses 16 tests ciblés passent ensuite, dont une nouvelle non-régression. Typecheck passé. Lint : code 0, sept avertissements préexistants dans des fichiers non modifiés ; lint ciblé XLSX sans avertissement. Build final passé après le garde et la fixation de la racine de traçage au worktree. E2E : 32 passés, 1 ignoré faute d'infrastructure persistante. Sécurité + multi-locales ciblées : 5 suites/54 tests passés. Aucune QA indépendante réalisée.

Commits locaux de reprise : `25dfa32`, `63b1e65`, `23b6410`, `979a969`, `a22e479`, `46d2734`, `a3b824b`, `5e0b28f`, `e607a0e` ; handoff figé sur la branche locale. Fichiers modifiés regroupés : `lib/rapprochement/*`, `lib/canonical-model/*`, `lib/workpapers/*`, `lib/synthesis/*`, `lib/evidence/*`, `lib/ingestion/*`, `lib/dossier/*`, `lib/security/export-text.ts`, `app/api/{export,ingestions,workpapers}/*`, `app/dashboard/{tests,synthese}/page.tsx`, `components/probant/{CycleDemonstration,CycleTechnicalPanel,ModuleAvailability,WorkpaperPanel}.tsx`, `e2e/phase-de.spec.ts`, `playwright.config.ts`, `next.config.ts` et les quatre documents de ce dossier. Liste exacte : `git diff --name-only origin/main..HEAD` dans le worktree.

Statut : **implémentation démonstrative terminée, activation réelle et QA métier encore requises**. Ne pas utiliser de données réelles ni déployer.

## Validation finale de la branche — 2026-09-25

Périmètre validé : `fix/reprise-probant-lots-ae` à `940f120926a48364bf240fff2577d208cce2173c`, comparé à `origin/main` `cd21e0308e0d6eec604ec6be9814291cebea3b0a`. Aucun code modifié pendant cette validation ; chaque commande de validation demandée a été exécutée une seule fois.

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Unitaires complets | `npm test` | 86 suites, 821 tests passés |
| TypeScript | `npm run typecheck` | Passé, 0 erreur |
| Lint | `npm run lint` | Code 0, 0 erreur, 7 avertissements préexistants hors diff |
| Build | `npm run build` | Passé, 149 pages générées |
| Navigateur | `npm run test:e2e` | 32 passés, 1 ignoré : dépôt FEC persistant sans infrastructure dédiée |
| QF-01/02/03/06/13/19 | `npm test -- lib/rapprochement/__tests__/cycles.test.ts lib/ingestion/__tests__/legacy-routes.test.ts lib/auth/__tests__/isolation.test.ts lib/synthesis/__tests__/canonical.test.ts lib/dossier/__tests__/snapshot-hash-locale.test.ts lib/dossier/__tests__/repositories.test.ts lib/evidence/__tests__/export-route.test.ts lib/ingestion/__tests__/service.test.ts lib/ingestion/__tests__/xlsx-guard.test.ts lib/security/__tests__/upload-hardening.test.ts` | 10 suites, 79 tests passés |

Contrôles de périmètre : `git diff --check origin/main..HEAD` sans erreur ; aucune migration modifiée, ni nouveau fichier de cache, artefact volumineux ou donnée binaire ajouté. La branche ne contient pas de fichier de secret suivi ; le `.env.example` préexistant a ses valeurs secrètes vides, et une recherche de signatures courantes de clés n'a rien trouvé. Les ajouts de tests et de démonstration sont synthétiques. Un dossier réel sélectionné mais introuvable produit une erreur, et l'API des nouvelles feuilles reste fermée hors démonstration explicitement activée ; le contexte sans dossier sélectionné conserve la démo identifiée comme telle.

**Verdict au moment de cette validation : NO-GO pour push/activation réelle.** `GET /api/ingestions/[id]` recherchait le job avant l'authentification, révélant potentiellement son existence. Ce point est corrigé dans le commit `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` décrit ci-dessous. Le parcours FEC persistant E2E reste ignoré sans infrastructure dédiée. Le nouvel atelier réel est volontairement désactivé ; les réserves métier et de sécurité listées plus haut restent à examiner avant activation.

Commits à relire, dans l'ordre (hashes complets) :

1. `25dfa323108fe506f9f01ec5fe24cfb2fc8c9d60` — montants invalides ;
2. `63b1e65256562214f6ce6bfa172ed1f8c05745c4` — portée serveur des routes historiques ;
3. `23b64103292ee7db2885dd20d6160937c1edaf08` — fallback démo et export ;
4. `979a969a3d9d858c7782e60fa7c79822132a38eb` — hash canonique multi-locales ;
5. `a22e479355f5e1a87bd5c89924f36ecf4c4ec8b` — limites FEC ;
6. `46d27345afd86e1928e8c64a4bfbfcf4ab393bf1` — noyau et cycles synthétiques ;
7. `a3b824b3ed462ffb4db052e832ae85621358bb29` — atelier et disponibilité ;
8. `5e0b28f3c8565ecbc0b70cd85dd72aeee676a906` — documentation de reprise ;
9. `e607a0ed6cf978bd29c676ae0c9b769f313a5985` — garde XLSX ;
10. `e3e2ef3af1ac668c7775758727797bbe8bed470a` — références du handoff ;
11. `93917c1df5a1af98988b5ba5823e6a45fd7aaf85` — montants ambigus ;
12. `940f120926a48364bf240fff2577d208cce2173c` — hash de dossier indépendant de la locale.
13. `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` — authentification avant lecture des jobs d'ingestion et réponses uniformes hors périmètre.

Revue humaine du diff : depuis `C:\Users\Ludo\PROBANT\reprise-probant-lots-ae`, exécuter `git diff --stat origin/main...HEAD` puis `git diff origin/main...HEAD`.

## Correctif préalable à la PR — 2026-09-25

Le commit `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` authentifie les accès `GET /api/ingestions/[id]` et `POST /api/ingestions/[id]/process` avant toute lecture du job. Après authentification, un job absent, d'une autre organisation ou d'un dossier non autorisé répond uniformément 404. Tests ciblés `legacy-routes` et `isolation` : 2 suites, 20 tests passés. Typecheck passé, lint ciblé sans avertissement, `git diff --check` sans erreur. Ces contrôles complètent la validation intégrale ci-dessus, exécutée avant ce correctif localisé ; la suite intégrale n'a pas été relancée.

**Verdict : GO pour une PR de revue uniquement ; NO-GO pour activation réelle ou déploiement.** Avant toute mise en production : exécuter l'E2E persistant dans un environnement synthétique dédié, arbitrer les autres réserves ouvertes et réaliser la QA indépendante. Aucune donnée réelle ni QA métier indépendante n'a été utilisée.
