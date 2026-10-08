# Mission 09 — recette Trésorerie : pont bancaire et apurement

Date : 2026-10-08. Branche locale `claude/tresorerie-pont-bancaire-5aa635`, base `origin/codex/mission07-security` (`fce26de`). Aucun push, aucune PR distante, aucun déploiement ni changement de variable distante.

## Ce qui est livré

| Couche | Livrable | Fichiers |
| --- | --- | --- |
| Sources qualifiées | Mapping fermé `cash-reconciliation-1`, 5 types de pièces, refus explicites avec ligne/colonne/valeur | `lib/workpapers/cash-sources.ts` |
| Calcul | `reconcileCash` + `clearCash` raccordés aux sources ; résultat `cash-reconciliation-result-1` à invariants (clôture jamais réécrite) | `lib/workpapers/cash-reconciliation.ts`, `cash.ts` (contexte réel, identité par document) |
| Chaîne durable | Tables `cash_*` append-only, runtime à port de stockage, commandes strictes, idempotence, verrou, péremption, révision | `drizzle/0007_cash_reconciliation.*`, `cash-store.ts`, `cash-runtime.ts`, `cash-commands.ts`, `cash-http.ts`, `app/api/workpapers/cash/**` |
| Synthèse / export | Programme fermé `cash.program@1.0.0`, file de travail, paquet diagnostic / approuvé (HTML, PDF, JSON, manifeste, 4 CSV) | `cash-mission.ts`, `lib/evidence/cash-mission-package.ts` |
| Interface | `/tresorerie` (feuille) et `/tresorerie/synthese`, reliées depuis `/dashboard/synthese` et la Synthèse de l’atelier | `components/probant/cash/**`, `app/tresorerie/**` |

Fichiers partagés modifiés (hunks additifs) : `model.ts` (champ `cashWork`, unité `account`), `service.ts` (adaptateur réel `cash.reconciliation`), `selection.ts` (population par compte), `imports.ts`, `cycle-context.ts`, `.env.example`, `drizzle/migration-manifest.json`, deux liens dans `app/dashboard/synthese/page.tsx` et `SyntheticSummary.tsx`.

## Écran

- **Sélecteur de compte** (groupe radio, flèches) : comptes testés et exclus avec motif.
- **Pont en cascade** : relevé 90,00 → +15,00 → −5,00 → ±0,00 → reconstitué 100,00 ; GL 100,00 ; écart du pont 0,00. Chaque étape est un bouton dont la valeur est écrite ; les étapes de suspens filtrent la table ; relevé et GL ouvrent leur source. Alternative tabulaire sous le graphique.
- **ERB / sources côte à côte** : soldes et suspens selon l’ERB d’un côté, relevé et GL de l’autre ; écarts de source dans une table séparée, jamais additionnés à l’écart du pont.
- **Table des suspens** : explication, âge, pièce, apuré / reste, statut avec icône + libellé + sens textuel ; filtres nature / statut, tri, défilement horizontal sur petit écran.
- **Panneau détail et source** : pièce, ligne physique, valeur normalisée, approbation, actualité, empreinte, téléchargement soumis à la même permission ; édition du brouillon (allocation, correction, exclusion motivée).
- Onglets Population · Tests · Exceptions · Pièces · Revue ; état de sauvegarde annoncé seulement après accusé serveur ; conflit avec comparaison brouillon / serveur.
- Bandeau de périmètre : comptes bancaires EUR uniquement ; caisse et VMP hors écran ; devises exclues sans conversion ; concordance ≠ authenticité.

## Résultats d’exécution (locaux, 2026-10-08)

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Suite unitaire complète | `npx vitest run --config vitest.config.mjs --configLoader runner --pool=forks` | 107 fichiers réussis, 2 ignorés ; **1 160 tests réussis, 17 ignorés** (14 PostgreSQL Clients + 3 PostgreSQL Trésorerie, sans base locale). Avec le pool `threads` par défaut, le processus Node principal a fait deux segfaults intermittents sur ce poste (un passage `threads` complet réussi : 1 159 / 17, avant l’ajout d’un test) ; non reproduit en `forks`, cause non déterminée |
| Métier Trésorerie | `lib/workpapers/__tests__/cash-reconciliation.test.ts` | 19 réussis (sources, pont, écarts de source, apurement) |
| Moteur historique | `lib/workpapers/__tests__/cash.test.ts` | 8 réussis, inchangés |
| Chaîne serveur | `lib/workpapers/__tests__/cash-runtime.test.ts` | 10 réussis (runtime et handlers réels, stockage **de test** en mémoire) |
| Synthèse / export | `lib/workpapers/__tests__/cash-mission.test.ts` | 5 réussis |
| PostgreSQL jetable | `lib/workpapers/__tests__/cash-durable.integration.test.ts` | **NON EXÉCUTÉ** localement (3 ignorés : ni PostgreSQL ni Docker sur le poste) ; prévu pour le service PostgreSQL 17 de la CI via `PROBANT_CLIENTS_TEST_DATABASE_URL` |
| Composants | `components/probant/__tests__/cash-reconciliation.test.tsx` | 7 réussis (jsdom) |
| Types | `npm run typecheck` | 0 erreur |
| Lint | `npx eslint` sur les fichiers créés / modifiés | 0 erreur, 0 avertissement |
| Migrations | `npm run db:check`, `npm run db:generate` | 10 migrations, invariants valides, manifeste régénéré |
| Build | `npm run build` | Réussi, 153 pages ; `/tresorerie` 20,5 kB, `/tresorerie/synthese` 5,1 kB |
| Navigateur Trésorerie | `npx playwright test e2e/cash-reconciliation.spec.ts` | 6 réussis |
| Navigateur complet | `npx playwright test` | 66 réussis, 1 ignoré (FEC durable : S3 / SQS / IdP dédiés absents, préexistant) |

Recette navigateur : les requêtes de la page sont routées vers le **vrai** `CashRuntime` et ses handlers sur le stockage de test en mémoire. Les mutations traversent donc le code serveur réel (schémas stricts, contrôles, idempotence), mais ce n’est **pas** une recette de persistance, d’OIDC externe ni de PostgreSQL.

### Matrice de la recette demandée

| Cas | Attendu | Preuve |
| --- | --- | --- |
| Banque 90 + remises 15 − paiements en circulation 5 = GL 100 | Pont calculé, écart 0,00, écarts de source 0,00 | Tests métier, runtime, composants, Chromium |
| Suspens 5 encore non apuré | P1 « Ouvert », reste 5,00, exception `SUSPENSE_OPEN`, note bloquante à documenter | Tests métier / runtime / Synthèse, capture nominale |
| Apurement partiel | R1 « Partiellement apuré » 10 / 15, reste 5,00 | Tests métier, composants, capture partielle |
| Mauvaise banque | Ligne refusée avec localisateur (`CASH_ACCOUNT_UNKNOWN`, ligne 4, `BNK-Z / FR76-0009`) ; allocation entre comptes refusée | Tests métier / runtime, alerte Chromium |
| Devise non gérée | Relevé USD refusé (`CASH_CURRENCY_UNSUPPORTED`, ligne 2, colonne devise) ; compte USD du GL exclu avec motif | Tests métier / runtime, Population à l’écran |
| Signe incohérent | Remise négative ou convention inversée refusée (`CASH_ITEM_SIGN_INCONSISTENT`, ligne 4) ; allocation de sens opposé refusée | Tests métier / runtime, alerte Chromium |
| Fenêtre incomplète | Suspens « Non testé », `WINDOW_INCOMPLETE`, apurement non concluant 0 / n ; aucune allocation validable | Tests métier / runtime |
| Double allocation | `CASH_OVERALLOCATION` / `CASH_ALLOCATION_DUPLICATE`, échec de sauvegarde affiché, montants serveur inchangés | Tests métier / runtime, Chromium |
| Totaux concordants ≠ authenticité | Mention dans l’écran, la Synthèse, le HTML et le manifeste | Tests, export, captures |
| Clavier pont → ligne → source → retour | Entrée sur la barre : focus 1ʳᵉ ligne filtrée ; Entrée : titre du panneau source ; Échap : retour ligne ; Échap : retour barre | Composants + Chromium |

Autres propriétés vérifiées : clôture jamais réécrite par l’apurement (invariant du schéma + comparaison avant / après) ; résultat déterministe et indépendant de l’ordre des imports ; auteur et convention attribués par le serveur ; corps navigateur porteur d’un rôle, d’un auteur ou d’une approbation refusé (400) ; idempotence et clé réutilisée (409) ; conflit de version avec comparaison ; session expirée (401) ; accès d’une autre organisation (403) ; source remplacée → travail périmé, diagnostic permis, paquet approuvé refusé, révision possible ; paquet approuvé refusé avant verrouillage ; HTML hostile échappé, Unicode conservé, formules CSV neutralisées ; axe WCAG 2.1 AA sans violation sérieuse ni critique sur les cinq onglets et la Synthèse ; aucun débordement global à 1024 et 390 px.

### Captures

Produites par Playwright sur le build de production local, inspectées, conservées hors Git (`*.png` ignoré) dans `docs/mission09/captures/` : `cash-nominal-1440.png`, `cash-nominal-1024.png`, `cash-nominal-390.png`, `cash-partial-1440.png`, `cash-population-1440.png`, `cash-keyboard-source-1440.png`, `cash-reduced-motion-1440.png`. L’inspection a conduit à corriger : colonne de statut hors champ (déplacée après l’identifiant), case de fenêtre décalée, en-tête collant d’une petite table, accords (« 1 jour », pluriels), états de feuille en clair, champs du panneau trop larges.

## Non exécuté et limites

- PostgreSQL jetable, redémarrage réel du conteneur, OIDC externe et Preview Vercel : **non exécutés** (aucune infrastructure locale ; aucun push). La recette `cash-durable.integration.test.ts` est écrite et s’exécutera dans la CI existante.
- Confirmations bancaires, pouvoirs, engagements, caisse, VMP et devises : hors périmètre de cet écran, affichés comme tels.
- Aucune référence normative nouvelle ; méthode interne `cash.reconciliation@1.0.0` (validation technique du contrat de calcul, pas d’une méthode d’audit). Aucune opinion automatique ; une revue documentée ne vaut pas conformité.
- PDF standard (Latin-1), sans PDF/A ; originaux binaires absents du paquet, téléchargeables séparément avec la même permission.

## Proposition de PR (non créée)

Titre : **Trésorerie : pont bancaire et apurement des suspens sur sources qualifiées**

Base proposée : `codex/mission07-security` tant que la PR #58 n’est pas dans `main` (sinon `main`, après rebase).

> Raccorde `reconcileCash` et `clearCash` à cinq sources qualifiées (GL de clôture, relevés, ERB, relevés postérieurs, pièces de correction) au lieu du seul scénario synthétique à suspens vides.
>
> - Population par compte (banque / référence / devise), exclusions motivées caisse, VMP et devises sans conversion ; refus explicites « mauvaise banque », devise et signe avec ligne / colonne.
> - Pont relevé + suspens → GL, écarts de source ERB distincts et jamais additionnés ; apurement postérieur par allocation, correction ou exclusion motivée ; la clôture n’est jamais réécrite.
> - Chaîne durable dédiée (`cash_*`, migration `0007`, append-only), revue par une autre identité, verrouillage, péremption sur source remplacée, Synthèse et export diagnostic / approuvé.
> - Écran `/tresorerie` : sélecteur de compte, pont aux valeurs écrites (barre → filtre), table des suspens (explication, âge, pièce, apurement, statut + sens), ERB / relevé côte à côte, panneau source au clavier.
>
> Recette locale : 1 160 tests unitaires réussis / 17 ignorés (PostgreSQL) ; Chromium 66 réussis / 1 ignoré (FEC durable). **Non exécuté** : PostgreSQL jetable, OIDC externe, Preview. Aucune opinion automatique ; des totaux concordants ne prouvent pas l’authenticité.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
