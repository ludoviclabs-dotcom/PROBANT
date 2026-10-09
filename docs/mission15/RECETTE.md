# Mission 15 — Recette du sous-lot 1 « quantités et mouvements »

Les données sont **100 % synthétiques** (`lib/workpapers/__tests__/stock-fixtures.ts`) : exercice 2026, trois entrepôts et un dépôt. Une suite verte sur ces fixtures **n'autorise aucune mission réelle**.

## Cas de référence — quantités calculées à la main

Le comptage de l'Entrepôt Nord a lieu à la clôture (31/12/2026). Celui de l'Entrepôt Sud a lieu le 20/12/2026, avec un journal de mouvements déclaré couvrant du 20 au 31/12. La convention citée (pièce INSTR-INV) est `before_count`.

| Unité | Calcul indépendant | Feuille |
|---|---|---|
| REF-A, Nord, lot L1 | 98 comptées, 100 au théorique → **−2** | Écart de quantité −2 unite ; montant **inconnu** (valeur établie dans le sous-lot 2 : 2 × 12 = 24 €) |
| REF-B, Nord | 10 cartons contre 120 unités au théorique | **Bloqué** (unité incompatible), aucun écart calculé |
| REF-C, Nord | 50 = 50 | Sans écart |
| REF-T, Nord | 30 comptées en statut « tiers », absentes du théorique | Présentée à part, hors stock propre |
| REF-E, Nord, lot L7 | 25 contre 20 → **+5** | Écart de quantité |
| REF-F, Nord | Comptée en stock propre, théorique en « consignation reçue » | **Écart de propriété** ; quantité non testée |
| REF-G, Nord | 7 comptées, absentes du théorique | Comptée hors théorique ; théorique inconnu |
| REF-H, Nord | Au théorique (15), non comptée ; site visité | **Non comptée** : inconnu, jamais zéro |
| REF-D, Sud | 40 au 20/12 ; + 10 (le 22/12) − 5 (le 28/12) = 45 ; théorique 45 | Sans écart. Le mouvement BL-2000 du 20/12 (−3) est hors période intercalaire selon la convention. |
| REF-D, Sud, convention `after_count` | 40 + 10 − 5 − 3 = 42 ; théorique 45 → **−3** | Recalcul après modification de la convention |
| REF-E, Sud, lot L7 | 20 au 20/12 ; − 8 (le 24/12) = 12 ; théorique 17 → **−5** | Écart de quantité |
| REF-E, total | +5 et −5 : net 0, brut 10 | **Écarts compensés** signalés ; aucune conclusion sur le net |
| REF-W, Dépôt Ouest | Aucune ligne de comptage sur le site | **Site non visité** (NEP 501 § 06) |
| REF-X, REF-Y, REF-Z, REF-K | En-cours, transit, exclue (avec motif), consignation déposée | Présentées à part avec leur motif |

**Bilan.** 15 unités au total : 9 testées et 6 exclues avec motif. On relève 9 exceptions ou incertitudes :
- 3 écarts de quantité ;
- 1 référence comptée hors théorique ;
- 1 écart de propriété ;
- 1 unité bloquée ;
- 1 référence non comptée ;
- 1 cas d'écarts compensés ;
- 1 site non visité.

L'issue est « exceptions détectées ». Toutes les notes portent un montant **inconnu** : aucune valeur monétaire n'est établie dans ce sous-lot.

**Comptage postérieur à la clôture** (MAGASIN-EST, compté le 05/01/2027, en kg) :
- convention `before_count` : 100,5 − 20 + 30,25 + 4 = **114,75**, contre 110 au théorique, soit un écart de +4,75 ;
- convention `after_count` : 110,75, soit un écart de +0,75.

## Matrice de recette

| Cas exigé | Preuve |
|---|---|
| 98 comptées contre 100, coût 12, écart potentiel −24 | Écart de quantité −2 (unitaire, runtime, E2E). La valeur −24 € relève du sous-lot 2 « coûts et cadrage » : **non établie ici**, montant inconnu. |
| Cartons contre unités | Bloqué, aucune conversion (unitaire, E2E). Unités mélangées dans une même feuille : refus à l'import avec la cellule. Mouvements dans une autre unité : bloqué. |
| Stock tiers | Présenté à part avec son motif ; un statut différent entre comptage et théorique donne un écart de propriété (unitaire, E2E) |
| Inventaire décalé sans mouvements | Non concluant, journal absent, clôture inconnue (unitaire, runtime, E2E). Journal couvrant seulement une partie de la période : non concluant. |
| Total net compensé | REF-E net 0, brut 10 : exception `NET_COMPENSATED` (unitaire, E2E) |
| Mouvements incomplets → non concluant | Issue « non concluant » quand il n'y a que des incertitudes (unitaire) |
| Unité incompatible → bloqué | Voir ci-dessus |
| Sites non visités et références exclues | Exclusions motivées, reconstruites par le serveur (unitaire, runtime, E2E) |
| Version et péremption | Feuille de comptage remplacée : feuille périmée, ancienne version conservée avec son empreinte, révision sur les sources courantes. Journal ajouté après le gel : feuille périmée (runtime, E2E, PostgreSQL). |
| Décision citée et revue distincte | Citation hors sources figées refusée ; jugement sans citation refusé ; auto-revue refusée (403) ; approbation et verrouillage par une autre identité (runtime, E2E, PostgreSQL) |
| Garde de recette | Fermée sans le drapeau, toujours fermée en production (runtime) |
| Absence de certification et de dépréciation | Mentions sur la feuille, dans le panneau, dans la méthode et dans les limites ; aucun calcul de valeur ni de dépréciation |

## Exécutions locales (09/10/2026)

- **Tests unitaires complets** (`--pool=forks`) : 1 391 réussis, 42 ignorés. Les tests propres aux stocks : `stock-review.test.ts` 17/17 et `stock-runtime.test.ts` 10/10.
- **Typecheck** : OK.
- **Lint** : 0 erreur, 7 avertissements déjà présents avant ce lot.
- **`db:check`** : 17 migrations, invariants valides.
- **Build de production** : OK.
- **Chromium** (Playwright, build de production) : 90 réussis, 1 ignoré. `stocks.spec.ts` passe 4/4, sans violation axe sérieuse ni critique. Captures inspectées à 1440, 1024 et 390 px, ainsi qu'avec réduction des animations.
- **Non exécuté localement** : `stock-durable.integration.test.ts`, faute de PostgreSQL jetable sur ce poste. Il s'exécute dans la CI, dans le projet Vitest « durable », un fichier à la fois.
