# Mission 10 — recette Immobilisations : mouvements et recalcul documenté

Date : 2026-10-08. Branche locale `claude/immobilisations-mission10`, base `origin/main` `b8c7d7f` (PR #60 Trésorerie fusionnée). Aucun push, aucune PR distante, aucun déploiement ni changement de variable distante.

## Ce qui est livré

| Couche | Livrable | Fichiers |
| --- | --- | --- |
| Moteurs (additif) | Contexte réel `fixed_assets.review`, pont par tableau exporté (`movementBridge`), méthode réelle documentée (`fixedAssetMethodEligible`), `frameFixedAssets` sans module fabriqué (`module = null`) | `lib/workpapers/fixed-assets.ts`, `cycle-context.ts`, `cycle-review.ts` |
| Sources qualifiées | Mapping fermé `fixed-assets-1`, 4 types de pièces, refus explicites avec ligne / colonne / valeur, actifs complexes exclus avec motif | `lib/workpapers/fixed-asset-sources.ts` |
| Calcul | Ponts Brut / Amortissements / Dépréciations par actif et par famille, cadrage registre → GL, rapprochement des pièces, recalcul documenté, comparaison versionnée ; résultat `fixed-assets-result-1` à invariants | `lib/workpapers/fixed-asset-review.ts` |
| Chaîne durable | Tables `fa_*` append-only, runtime à port de stockage, commandes strictes, idempotence, verrou, péremption, révision | `drizzle/0008_fixed_assets.*`, `fixed-asset-store.ts`, `fixed-asset-runtime.ts`, `fixed-asset-commands.ts`, `fixed-asset-http.ts`, `fixed-asset-adapter.ts`, `app/api/workpapers/immobilisations/**` |
| Synthèse / export | Programme fermé `fixed_assets.program@1.0.0` (4 contrôles), file de travail, paquet diagnostic / approuvé (HTML, PDF, JSON, manifeste, 4 CSV) | `fixed-asset-mission.ts`, `lib/evidence/fixed-asset-mission-package.ts` |
| Interface | `/immobilisations` (feuille) et `/immobilisations/synthese`, reliées depuis `/dashboard/synthese`, la Synthèse de l’atelier et la feuille Trésorerie | `components/probant/fixed-assets/**`, `app/immobilisations/**` |

Fichiers partagés modifiés (hunks additifs) : `model.ts` (champ `fixedAssetWork`, unité `asset`), `service.ts` (adaptateur réel `fixed_assets.review`, `configureFixedAssets`), `selection.ts` (population par actif), `imports.ts` (mapping `fixedAssets`), `cycle-context.ts`, `cycle-review.ts`, `.env.example`, `drizzle/migration-manifest.json`, liens dans `app/dashboard/synthese/page.tsx`, `SyntheticSummary.tsx` et `CashReconciliationWorkspace.tsx` (un lien de navigation).

## Écran

- **Contexte** : dossier, organisation, exercice, date de revue, mode, identité serveur, version de feuille, état de sauvegarde annoncé après accusé serveur.
- **Onglets** Population · Tests · Exceptions · Pièces · Revue (flèches, Début / Fin).
- **Sélecteur de famille** (groupe radio, flèches) et **sous-onglets Brut / Amortissements / Dépréciations**.
- **Pont par famille** en cascade : ouverture → + entrées → − sorties → (− reprises) → ± reclassements → = clôture attendue ; clôture observée ; écart net et brut non compensé, avec dénominateur des actifs calculés. Chaque étape est un bouton à valeur écrite ; une variation **filtre les actifs** concernés et place le focus sur la première ligne ; l’écart filtre les actifs en écart ou incomplets. Alternative tabulaire.
- **Tableau actif / composant** : écart en tête de ligne, ouverture, entrées, sorties, reprises, reclassements, attendu, clôture ; colonne Recalcul dans l’onglet Amortissements ; identifiant d’actif figé à gauche au défilement horizontal ; actifs exclus listés avec motif.
- **Panneau détail** : pont de l’actif pour le tableau actif, **chronologie des mouvements** (date, nature, montant, pièce), ouverture de la ligne du registre puis de la **pièce** (statut concordante / montant ou date différents / absente), **recalcul documenté** (méthode et source citée, coût, résiduel, base, durée, prorata, mise en service, arrondi, formule, recalculé, comptabilisé, écart, provenance des paramètres et de la mise en service). Échap ramène à la ligne d’origine.
- **Cadrage registre → GL** par compte, convention `fa-sign-1` affichée.
- **Méthodes et comparaison versionnée** : méthodes documentées (aucune par défaut), avertissement « méthodes modifiées depuis la version exécutée… exécutez pour comparer ; aucun recalcul silencieux », puis tableau avant → après avec variation calculée par le serveur.
- Bandeau de périmètre : trois tableaux jamais additionnés ; VNC arithmétique ≠ valeur ; pas de conclusion d’existence physique ; aucune durée ni seuil implicite ; actifs complexes exclus avec motif.

## Résultats d’exécution (locaux, 2026-10-08)

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Suite unitaire complète | `npx vitest run --config vitest.config.mjs --configLoader runner --pool=forks` | 111 fichiers réussis, 3 ignorés ; **1 194 tests réussis, 20 ignorés** (PostgreSQL : 14 Clients, 3 Trésorerie, 3 Immobilisations, sans base locale). Avec le pool `threads` par défaut (`npm test`), un passage complet a réussi (1 192 / 20, avant l’ajout de 2 tests) et deux passages ont fini par un segfault du processus Node principal, sans test en échec — comportement intermittent déjà décrit en Mission 09, non reproduit en `forks`, cause non déterminée |
| Métier Immobilisations | `lib/workpapers/__tests__/fixed-asset-review.test.ts` | 16 réussis (recette complète, refus avec localisateur, population, comparaison) |
| Atelier synthétique (non-régression) | `lib/workpapers/__tests__/demo-cycles.test.ts` | 70 réussis, inchangés |
| Chaîne serveur | `lib/workpapers/__tests__/fixed-asset-runtime.test.ts` | 9 réussis (runtime et handlers réels, stockage **de test** en mémoire) |
| Synthèse / export | `lib/workpapers/__tests__/fixed-asset-mission.test.ts` | 2 réussis (programme, HTML échappé, CSV neutralisé) |
| PostgreSQL jetable | `lib/workpapers/__tests__/fixed-asset-durable.integration.test.ts` | **NON EXÉCUTÉ** localement (3 ignorés : ni PostgreSQL ni Docker sur le poste) ; prévu pour le service PostgreSQL 17 de la CI |
| Composants | `components/probant/__tests__/fixed-assets.test.tsx` | 7 réussis (jsdom, handlers réels) |
| Types | `npm run typecheck` | 0 erreur |
| Lint | `npm run lint` | 0 erreur ; 7 avertissements préexistants hors diff |
| Migrations | `npm run db:check` | 11 migrations, invariants valides |
| Build | `npm run build` | Réussi ; `/immobilisations` 20,3 kB, `/immobilisations/synthese` 5,1 kB |
| Navigateur Immobilisations | `npx playwright test e2e/fixed-assets.spec.ts` | 5 réussis (axe WCAG 2.1 AA sans violation sérieuse ni critique) |
| Navigateur complet | `npx playwright test --workers=2` | **71 réussis, 1 ignoré** (FEC durable : S3 / SQS / IdP dédiés absents, préexistant) ; recette Immobilisations relancée ensuite sur le build final : 5 réussis |

Recette navigateur : les requêtes de la page sont routées vers le **vrai** `FixedAssetRuntime` et ses handlers sur le stockage de test en mémoire. Les mutations traversent le code serveur réel (schémas stricts, contrôles, idempotence), mais ce n’est **pas** une recette de persistance, d’OIDC externe ni de PostgreSQL.

### Matrice de la recette demandée

| Cas | Attendu | Preuve |
| --- | --- | --- |
| Ouverture 100 + entrées 20 − sorties 10, clôture 109 | Attendu 110 ; écart −1,00 calculé, affiché « à expliquer », exception `MOVEMENT_DIFFERENCE` et note bloquante ; clôture jamais corrigée | Tests métier / runtime / composants, Chromium, capture `fa-gross-*` |
| Écart −1 expliqué | Traitement documenté (« mise au rebut non saisie, PV R-17 ») sur la note, conservé après revue et dans l’export ; l’exception reste dans le résultat | Runtime (parcours complet jusqu’au paquet approuvé), composants |
| Actif en cours | A-004 « En cours », pont Brut calculé, recalcul non applicable | Tests métier, Chromium |
| Sortie partielle | A-001 pont avec sortie ; recalcul exclu avec motif ; pièces d’entrée et de sortie rapprochées | Tests métier, composants (chronologie → pièce CES-001) |
| Résiduel incohérent | A-005 bloqué : « Valeur résiduelle 50.00 EUR supérieure au coût 45.00 EUR » | Tests métier / composants / Chromium |
| Méthode absente | A-003 bloqué : « SOURCE REQUISE : méthode absente des paramètres » ; méthode non documentée, non applicable ou non couverte distinguées | Tests métier, Chromium |
| Mise en service après clôture | A-004 : « Mise en service postérieure à clôture », jamais une dotation nulle | Tests métier / composants / Chromium |
| Source manquante bloquante | Sans GL : gel refusé `FA_SOURCES_REQUIRED`, bouton désactivé avec cause et action | Runtime, Chromium, capture `fa-blocked-source-*` |
| Changement de méthode | Résultat retiré, avertissement, exécution explicite, comparaison v1 → v2 ; paramètres remplacés → révision et comparaison entre révisions (+3,00) | Tests métier / runtime, Chromium, captures `fa-method-*` |
| Pas d’existence physique automatique | Mention à l’écran, dans la Synthèse, le HTML et le manifeste | Tests export, captures |

Autres propriétés vérifiées : tableau absent → incomplet, jamais nul ; pièce absente / montant / date différents distingués ; dotation comptabilisée ≠ recalcul → écart signé ; cadrage par compte sans compensation, convention de signe affichée ; refus avec localisateur (signe, période, tableau, reprise hors dépréciations, ouverture mal datée, actif inconnu, prorata, résiduel négatif, traitement inconnu) ; auteur des méthodes et convention attribués par le serveur ; corps porteur d’un auteur, d’un rôle ou d’une approbation refusé (400) ; idempotence et clé réutilisée (409) ; conflit de version ; session expirée (401) ; autre organisation (403) ; source remplacée → périmé, diagnostic permis, révision ; paquet approuvé refusé avant verrouillage ; HTML hostile échappé, formules CSV neutralisées ; aucun débordement global à 1024 et 390 px ; animations neutralisées en réduction des mouvements.

### Captures

Produites par Playwright sur le build de production local (`PROBANT_CAPTURES_DIR=docs/mission10/captures`), inspectées, conservées hors Git (`*.png` ignoré) : `fa-gross-1440.png`, `fa-gross-1024.png`, `fa-gross-390.png`, `fa-reduced-motion-piece-1440.png`, `fa-recalc-1440.png`, `fa-method-pending-1440.png`, `fa-method-comparison-1440.png`, `fa-blocked-source-1440.png`, `fa-blocked-source-390.png`, `fa-synthesis-1440.png`. L’inspection a conduit à corriger : colonne Écart hors champ à 390 px (identifiant figé à gauche, largeur minimale réduite), statuts techniques anglais dans la comparaison, couverture de la Synthèse débordant sur la colonne voisine, famille sans actif testé présentée « partielle », formulaire des méthodes mal aligné, et avertissement de méthode modifiée jamais affiché (rendu dans un bloc conditionné au résultat).

## Non exécuté et limites

- PostgreSQL jetable, OIDC externe, Preview Vercel : **non exécutés** (aucune infrastructure locale ; aucun push). La recette `fixed-asset-durable.integration.test.ts` s’exécutera dans la CI existante (migration `0008` appliquée par `npm run db:migrate`).
- Existence physique, indices de perte de valeur, recherche de dépenses à immobiliser, méthodes non linéaires, crédit-bail, réévaluation, actifs financiers ou en devise : hors périmètre, affichés comme tels.
- Aucune règle comptable nouvelle ; méthode interne `fixed_assets.review@1.0.0` (validation technique du contrat de calcul). Les méthodes et paramètres viennent du préparateur et des sources du client. Aucune opinion automatique ; une revue documentée ne vaut pas conformité.
- Le guide pédagogique (pages 85–88 citées par l’atelier) n’a pas été repris : ni seuil de 500 €, ni durée, ni exemple chiffré.
- PDF standard (Latin-1), sans PDF/A ; originaux binaires absents du paquet.

## Proposition de PR (non créée)

Titre : **Immobilisations : mouvements, cadrage et recalcul documenté sur sources qualifiées**

Base proposée : `main` (`b8c7d7f`). À coordonner avec la Mission 08 (`codex/mission07-security`), qui touche les mêmes fichiers partagés et porte une migration `0007`.

> Raccorde `fixedAssetMovements`, `recalculateDepreciation` et `frameFixedAssets` à quatre sources qualifiées (registre des mouvements, GL / balance, paramètres d’amortissement, pièces) au lieu du seul actif synthétique de l’atelier.
>
> - Population par actif / composant ; en cours, mis en service, sortis distingués ; actifs complexes (crédit-bail, réévaluation, financier, devise) exclus avec motif.
> - Ponts Brut, Amortissements et Dépréciations séparés, par actif et par famille (dénominateur, écart net et brut non compensé) ; cadrage registre → GL par compte, convention `fa-sign-1` ; pièces d’entrée et de sortie rapprochées.
> - Recalcul linéaire seulement sur méthode documentée (source citée, validité, auteur serveur) et paramètres sourcés ; aucune durée, aucun seuil ni prorata implicite ; causes de blocage explicites. Changement de méthode : résultat retiré, exécution explicite, comparaison versionnée.
> - Chaîne durable dédiée (`fa_*`, migration `0008`, append-only), revue par une autre identité, verrouillage, péremption, Synthèse et export diagnostic / approuvé.
> - Écran `/immobilisations` : familles, onglets Brut / Amortissements / Dépréciations, pont aux valeurs écrites (variation → actifs → pièce), chronologie, panneau de recalcul (entrées, formule, arrondi, provenance), clavier et réduction des animations.
>
> Recette locale : 1 194 tests unitaires réussis / 20 ignorés (PostgreSQL) ; Chromium 71 réussis / 1 ignoré (FEC durable). **Non exécuté** : PostgreSQL jetable, OIDC externe, Preview. La VNC arithmétique n’est pas une conclusion de valeur ; aucune conclusion d’existence physique.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
