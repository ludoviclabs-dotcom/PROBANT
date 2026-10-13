# C03 — Contrat de métriques : assertions, procédures et couverture

Date : 13 octobre 2026. Contrat interne de présentation et de mesure. Aucune nouvelle règle comptable, fiscale ou professionnelle ; les textes cités sont lus sur le site de la H2A ce jour, leur applicabilité à un exercice et à un régime donnés reste à vérifier par le professionnel.

## 1. Sources lues

| Texte | Organisme | URL | Section utilisée | Homologation | Date de lecture | Limite |
|---|---|---|---|---|---|---|
| NEP 500 — Caractère probant des éléments collectés | H2A | https://h2a-france.org/normes/caractere-probant-des-elements-collectes/ | §09 : trois catégories d'assertions (flux d'opérations et événements ; soldes de fin de période ; présentation et informations de l'annexe), 13 assertions | Arrêté du 28/12/2023, JO du 31/12/2023 (art. A. 821-74 C. com.) | 13/10/2026 | Date d'application à l'exercice non lue sur la page |
| NEP 2410 — Examen limité de comptes intermédiaires en application de dispositions légales ou réglementaires | H2A | https://h2a-france.org/normes/examen-limite/ | §08 (nature : entretiens avec la direction et procédures analytiques), §17, §18 | Arrêté du 28/12/2023, JO du 31/12/2023 (art. A. 821-96 C. com.) | 13/10/2026 | Comptes intermédiaires ; l'examen limité des comptes annuels par un expert-comptable relève d'une norme distincte, non lue |
| NEP 330, NEP 501, NEP 505 | H2A | voir `docs/mission19/CONTRAT.md` | §08, §14-16 ; §03-08 ; §04, §08-15 | voir Mission 19 | 10/10/2026 (Mission 19) | Non relues dans ce lot |

Le vocabulaire des assertions est celui de `lib/workpapers/closing-contract.ts` (`CL_ASSERTIONS`, 13 valeurs), conforme à la NEP 500 §09 relue : aucun autre vocabulaire n'est introduit. L'ancien vocabulaire de l'effet financier (7 valeurs) est traduit, jamais affiché.

## 2. Assertions : résolveur (`lib/audit/assertions.ts`)

Ordre de résolution, pour un constat :

| Ordre | Base | Résultat | Affichage |
|---|---|---|---|
| 1 | Règle de conformité du fichier (`R-HL-001` à `R-HL-010`) | aucune assertion | « Conformité du fichier (hors assertions) » |
| 2 | Règle connue (`RULE_ASSERTIONS`, `RECONCILIATION_ASSERTIONS`) | 1 à 2 assertions NEP 500 + objectif + justification | assertions nommées, « résolue par la règle » |
| 3 | Signal analytique ou seuil interne (`SIGNAL_RULES`, écart `a_justifier`) | aucune | « Non résolue » |
| 4 | Effet financier explicite (règle inconnue) | 1 assertion traduite (`assertionFromFinancialEffect`) | « reprise de l'effet financier, à confirmer » |
| 5 | Rien | aucune | « Non résolue » |

Correspondance de l'effet financier : existence → Existence (solde) ; exhaustivité → Exhaustivité (flux si la cible est le résultat, solde sinon) ; exactitude → Mesure (flux) ; évaluation → Évaluation et imputation (solde) ; droits et obligations → Droits et obligations (solde) ; présentation → Présentation et intelligibilité (annexe) ; rattachement → Séparation des exercices (flux).

Correspondances règle → assertions (extrait ; table complète et justifications dans le code) :

| Règle | Objectif | Assertions |
|---|---|---|
| R-PCG-CREANCES (créance litigieuse non dépréciée) | Recouvrabilité | Évaluation et imputation · solde |
| R-ME-003 (produits non facturés, 418) | Rattachement | Séparation des exercices · flux ; Exhaustivité · flux |
| R-PCG-TITRES (titres non dépréciés, sans effet chiffré) | Valeur d'inventaire | Évaluation et imputation · solde |
| R-HL-004 (date hors format) | Conformité du fichier | aucune |
| R-IN-GEARING, R-ISA-520-*, R-IN-MASSE-SAL, R-IN-001/002 | signal | non résolue |
| R-RAPPRO-perimetre / rapprochement_solde | Périmètre / concordance | Existence · solde ; Exhaustivité · solde |
| R-RAPPRO-a_justifier | écart non qualifié | non résolue |

Un constat peut porter plusieurs assertions : il compte dans chacune. La matrice est une matrice de constats, pas de couverture : une cellule vide signifie « aucun constat », jamais « assertion couverte ».

## 3. Procédures : résolveur (`lib/audit/procedures.ts`)

Une proposition par constat, à partir de la règle (`RULE_PROCEDURES`, `RECONCILIATION_PROCEDURE`), avec : titre, objectif, assertions, population (silo, comptes, lignes source), source du constat (référence et date d'effet portées par la règle, jamais réécrites), étapes, ce qui reste au professionnel, références H2A, outil de l'application lorsqu'il existe.

| Cas | Résultat |
|---|---|
| Créance litigieuse (R-PCG-CREANCES) | Revue de recouvrabilité documentée : pièces du litige, appréciation avec direction/avocat (NEP 501 §07-08), confrontation au compte 491, conclusion écrite |
| Produit non facturé (R-ME-003) | Rattachement : livraisons/prestations avant clôture contre factures après clôture, compte 418, cut-off |
| Date FEC invalide (R-HL-004) | Localiser (lignes listées), corriger à la source, redéposer et revalider — pas de collecte de preuve générique |
| Règle sans procédure connue | « Procédure à définir » : objectif, assertions, population et source connus ; aucune étape inventée |
| Écart de rapprochement qualifié | Analyse de l'écart selon sa qualification ; « à justifier » reste à définir |

Régime et période (`regimeReferences`) : le régime n'est pas renseigné dans le dossier ; il est choisi à l'écran et ne modifie que les références rappelées. Audit légal : NEP 330 et NEP 500 ; examen limité : NEP 2410 §08, §17-18, avec la mention que les tests de détail proposés ne sont pas requis par la norme. L'exercice du dossier est rappelé avec l'obligation de vérifier l'applicabilité des textes.

## 4. Couverture : populations qualifiées (`lib/synthesis/engine.ts`)

Chaque population est qualifiée séparément ; un ratio exige un dénominateur qualifié.

| Population | Qualification (`CalculationContext`) | État possible | Ratio |
|---|---|---|---|
| Écritures | `entriesPopulation` : `counted` (dénombrées par le parseur), `missing` (non dénombrées), `known_empty` (fichier lu, 0 ligne), `not_applicable` | traitée / partiellement traitée / non traitée ; manquante ; connue vide ; non applicable | seulement si `counted` |
| Contrôles | `controlsDenominatorBasis` : `catalog` (règles du moteur), `declared` (fourni par le producteur), `findings_only` (règles ayant produit un constat) | traitée / partielle / non traitée ; dénominateur non qualifié | seulement si `catalog` ou `declared` |

Statut de couverture : `unqualified` dès qu'une population est manquante ou au dénominateur non qualifié (on ne qualifie pas de « partielle » une population non dénombrée), avec la limite `coverage_unqualified` ; sinon `substantial` si le plus faible ratio qualifié est ≥ 95 % (et sans limitation aux documents déposés), `partial` s'il est > 0, `none` s'il est nul. Les populations connues vides ou non applicables sont exclues du ratio directeur et tracées comme telles. L'avancement des contrôles historiques n'établit jamais une couverture d'écritures ou d'audit.

Producteurs : la démonstration historique (`buildDemoDossierSnapshot`) déclare `missing` + `findings_only` (DEMO SA passe de « Substantielle » à « Non qualifiée ») ; le dépôt FEC (`buildSnapshotFromFecDepot`) déclare `counted` ou `known_empty` et `catalog` lorsque le pipeline fournit le dénominateur (service et worker d'ingestion le fournissent). Le dépôt historique de documents par cycle (`addRapprochementToSnapshot`) déclare `not_applicable` pour les écritures lorsqu'aucun FEC n'est présent (une comparaison de documents ne porte pas sur une population d'écritures) et `declared` pour les contrôles (dépôts actifs, plus les règles du socle s'il existe) : sa couverture reste « partielle » car limitée aux documents déposés, jamais « substantielle ».

## 5. Vues

| Vue | Contenu | Ce qu'elle n'est pas |
|---|---|---|
| Matrice des constats (`riskHeatmap`) | cloison × assertions NEP 500 présentes, colonnes « Non résolue » et « Conformité du fichier » si nécessaire | pas une couverture |
| Couverture de l'analyse (`coverage`) | une ligne par population : état, réalisé, dénominateur (ou —), ratio (ou —), base du dénominateur | pas un avancement de contrôles |
| Couverture des travaux (`workCoverage`) | une ligne par feuille de travail : assertions visées, état, travail (exécuté / non concluant / bloqué), pièces, version, revue ; vide = « non établie » | pas une matrice remplie par défaut |
| Tests complémentaires | régime et période, puis une réponse par constat | pas des procédures exigées |

## 6. Recette

| Cas | Preuve |
|---|---|
| Constat qualitatif de valorisation sans impact (R-PCG-TITRES) | `lib/audit/__tests__/resolvers.test.ts`, `lib/visualization/__tests__/build-datasets.test.ts` |
| Deux constats Clients d'objectifs différents | `resolvers.test.ts` (créance litigieuse ≠ produit non facturé) |
| Source absente | `coverage-populations.test.ts` (limite `missing_document` distincte de la couverture) |
| Population vide / manquante / non applicable / partielle / non qualifiée | `coverage-populations.test.ts` |
| Travail non concluant, travail bloqué, absence de travail | `coverage-populations.test.ts` (couverture des travaux) |
| Procédure non applicable motivée | hors périmètre de cette vue : elle vit dans le programme de clôture (Mission 19, `set_applicability`) ; non projetée dans la Synthèse dans ce lot |
| Vues réelles 390 / 1024 / 1440, axe strict | `e2e/c03-assertions.spec.ts`, captures `docs/probant-lots/c03-captures/` |
