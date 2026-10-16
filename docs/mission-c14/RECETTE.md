# Mission C14 — Recette : synthèse des travaux et clôture locale

Données synthétiques uniquement. Les attendus sont posés à la main, à partir de la recette Mission 19 (`docs/mission19/RECETTE.md`, « ALPHA SAS (synthétique) », exercice 2026) et des cas ci-dessous ; les tests comparent la sortie du moteur à ces valeurs.

| Fichier | Rôle |
|---|---|
| `lib/workpapers/__tests__/closing-c14.test.ts` | 9 tests : les 8 cas demandés, dates et seuils |
| `lib/workpapers/__tests__/closing-c14-fixtures.ts` | Dossier minimal, identité solo, têtes de feuilles synthétiques (double de test en lecture seule) |
| `lib/workpapers/__tests__/closing-runtime.test.ts` | Recette Mission 19 : 18 tests, inchangés sauf deux attendus (voir « Corrections consignées ») |
| `lib/workpapers/__tests__/closing-durable.integration.test.ts` | PostgreSQL jetable : cas « Paie retrouvée après reprise » ajouté |
| `lib/workpapers/__tests__/provision-mission.test.ts`, `components/probant/__tests__/provision-mission.test.tsx` | Restitution et export Provisions |
| `e2e/closing.spec.ts` | Navigateur (build de production) : 3 parcours Mission 19 adaptés, 3 parcours C14 |

## Dénominateurs de la recette Mission 19 (calcul manuel)

| Bloc | Calcul | Attendu |
|---|---|---|
| Procédures | 8 déclarées ; P-08 non applicable motivée | 7 applicables, 1 exclue |
| Revues par une autre personne | P-01 (feuille Provisions verrouillée, revue par `reviewer-pv`) et P-05 (revue par `reviewer-cl`) | 2 / 7 |
| Couples risque × assertion | R-01 : 3, R-02 à R-07 : 2 chacun → 15 ; R-07 couvert seulement par P-08 → 2 exclus | 13 comptés |
| Couples revus | R-01 · exhaustivité et évaluation (solde) par P-01 ; R-04 · existence et exhaustivité par P-05 | 4 |
| Couples sans procédure | R-03 · évaluation et imputation | 1 |
| Couples en cours | 13 − 4 − 1 | 8 |
| Feuilles outillées | P-01, une seule lignée `provisions.register` → rattachement implicite | 1 / 1 verrouillée |
| Exclusions encore pertinentes | P-08 (1) + couples de R-07 (2) + limites de capacité des 6 cycles présents : Provisions 2, Clients 1, Stocks 4, Trésorerie 1, Transversal 2, Systèmes d'information 2 = 12 | 15 |

Ces valeurs sont identiques dans les indicateurs, la carte (recomptée cellule par cellule), la projection et le JSON exporté.

## Cas

| # | Cas | Données | Attendu (calcul manuel) | Test |
|---|---|---|---|---|
| 1 | Cycle verrouillé mais programme incomplet | Recette Mission 19 | P-01 « Feuille verrouillée », dossier non clôturable, 19 travaux restants, 1 / 1 feuille | `closing-c14` n° 1, e2e C14 n° 1 |
| 2 | 2 / 7 procédures revues | Recette Mission 19 | `procedures = {declared 8, applicable 7, notApplicable 1, done 2, donePersonal 2, concluded 2}` ; lignes revues : P-05, P-01 ; HTML « 2 / 7 », CSV 1 en-tête + 8 lignes | `closing-c14` n° 1 |
| 3 | Procédure non applicable motivée | P-08, motif « Aucun emprunt à la clôture : compte 164 soldé au 31/12/2026 » | Exclusion listée avec son motif ; 2 couples R-07 exclus | `closing-c14` n° 2 |
| 4 | Population absente | P-04, site B non identifié | Ligne « Absente : … » ; A-03 « Montant inconnu — Site B non observé », résiduel « Inconnu », jamais 0 | `closing-c14` n° 2 |
| 5 | Correction avec preuve nouvelle | A-01 corrigée par OD-2027-014 ; A-04 relevée 500,00 € puis corrigée de 200,00 € avec OD-2027-030 | A-01 « corrigée », preuve nouvelle OD-2027-014 v1, pièce d'origine : réponse de la banque ; A-04 corrigé 200,00, résiduel 300,00 ; totaux : corrigé 1 240 + 200 = 1 440,00 ; non corrigé connu 3 000,00 (A-02) ; résiduel connu 3 000 + 300 = 3 300,00 ; 1 inconnu ; anomalies corrigées 2 / 4. Refus : 500,00 (égal), −100,00 (signe), A-03 (inconnu) | `closing-c14` n° 3 |
| 5 bis | La déclaration de la direction ne clôt pas une contradiction | Seconde lettre d'affirmation déposée après C-01 | C-01 reste ouverte, lettre listée en regard ; résolution par la seule lettre refusée (`CL_REPRESENTATION_ONLY`) | `closing-c14` n° 3 |
| 6 | Source remplacée après clôture | Dossier validé par `signer-cl` ; source `pv_annex` de la feuille Provisions remplacée dans son cycle | P-02 « Source remplacée depuis le gel » ; validation périmée, changement : `provisions.register (<run>, source remplacée)` ; blocages `VALIDATION_STALE`, `CYCLE_SOURCE_REPLACED` | `closing-c14` n° 6 |
| 6 bis | Pièce remplacée après le marquage personnel | Dossier solo marqué terminé, puis nouvelle version du relevé | Marquage périmé (« 1 événement du journal postérieur au marquage »), P-01 conclusion périmée | `closing-c14` n° 7 |
| 7 | Paie retrouvée après reprise | Feuille `payroll.review` verrouillée sous relecture personnelle, famille `hr` | Mémoire : lue, P-02 verrouillée mais revue professionnelle manquante (`PERSONAL_REVIEW_ONLY`), `payroll.leave` hors programme listée (non concluante) ; révision r2 → « Feuille de cycle en cours ». PostgreSQL : rattachement explicite conservé après une nouvelle connexion, révision r2 → « Feuille à rattacher » (`revisee`) | `closing-c14` n° 8, durable « C14 — Paie » |
| 8 | Deux feuilles même procédure sur périmètres distincts | `cash-B1` verrouillée, `cash-B2` exécutée | Sans rattachement : P-02 « Feuille à rattacher » malgré B1 verrouillée, 0 / 1 ; B1 rattachée : 1 / 1, B2 → `SHEET_UNASSIGNED` ; P-03 rattachée à B2 : 1 / 2 verrouillée, 2 lignées retenues ; B1 déjà rattachée refusée ; variante : B2 écartée avec motif → 1 / 1 avec mention « 1 feuille écartée du programme avec motif » | `closing-c14` n° 4, e2e C14 n° 2 |
| — | Verrouillage ancien et nouvelle population | `cash-B1` verrouillée non concluante, puis r2 en brouillon avec deux comptes | Résultat non concluant exposé ; r2 : « Feuille à rattacher » (`SHEET_REVISED`), r1 listée en révision antérieure ; après confirmation : « Feuille de cycle en cours » | `closing-c14` n° 5 |
| — | Mode solo | Identité `proprietaire-local`, relecture personnelle nommée « Camille Martin » | P-01 « Relue — relecture personnelle nommée » ; revues 0 / 1, relues 1 / 1 ; couple « relue » ; aucun travail restant commun ; 1 condition professionnelle non remplie ; marquage enregistré avec 1 limite ; validation refusée (403) ; marquage refusé à `preparer-cl` (403) et à `reviewer-cl` (`CL_PERSONAL_PROFILE_REQUIRED`) | `closing-c14` n° 7, e2e C14 n° 3 |
| — | Dates et seuils | Arrêté des comptes déclaré au 20/03/2027 ; signification 15 000,00 € (2 % déclaré) ; planification 20 000,00 € puis 10 000,00 € | `THRESHOLD_ORDER` puis plus d'incohérence ; sources NEP 450 §06 et §07 ; synthèse des anomalies et nombre de blocages inchangés (aucune comparaison) ; premier travail 08/01/2027 | `closing-c14` n° 9 |

## Corrections consignées

- `closing-runtime.test.ts` : le refus `CL_ENGINE_ALREADY_LINKED` est remplacé par le comportement C14 (une seconde procédure sur la même procédure de cycle est acceptée ; les deux exigent alors un rattachement). L'expression de contrôle « aucune certification » admet désormais une négation explicite (« non certifiées » des limites de capacité listées) : `/(?<!non )certifi|sans réserve|opinion favorable/i`.
- `e2e/closing.spec.ts` : la fiche affiche « Feuille de cycle rattachée » et « Le dossier observe ces feuilles » au lieu de « Feuille de cycle observée » / « cette feuille ».
- Revue de la PR #96 (Codex) : une validation enregistrée avant C14 (empreinte sans fraîcheur des sources) devient périmée si une source est remplacée depuis ; une lignée dont le rattachement a dérivé (nouvelle révision ou population) est comptée « à rattacher », plus « retenue », et n'apparaît qu'une fois ; un paquet Provisions « approuvé » est refusé si la feuille a été verrouillée par une seconde identité simulée (`EXPORT_APPROVED_SIMULATED_REVIEW`), et une relecture personnelle nommée y est nommée comme telle. Tests : `closing-c14.test.ts` (10 tests), `provision-mission.test.ts`.
