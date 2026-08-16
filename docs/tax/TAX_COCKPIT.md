# TAX-08 — Cockpit fiscalité (`/dashboard/fiscalite`)

## Objet

Restituer les snapshots fiscaux existants — IS (TAX-05), TVA (TAX-06), CFE
(TAX-07), planner (TAX-04) et synthèse fiscale — dans un cockpit à quatre
niveaux. **Aucun calcul métier n'est effectué dans les composants React** : la
page rend des `VisualizationDataset` construits par
`lib/tax/cockpit/build-cockpit-datasets.ts`, eux-mêmes projetés depuis les
snapshots moteurs. Même discipline que la Synthèse (`lib/visualization`).

## Structure

| Niveau | Contenu | Composants |
| --- | --- | --- |
| Capacité et décision | impôts applicables, documents, contrôles conclus/non conclus, anomalies confirmées, risques potentiels, données manquantes, prochaine action | `TaxSummaryHeader`, `TaxCapabilityPanel` |
| Calcul | waterfall résultat comptable → résultat fiscal → IS ; IS calculé/déclaré/comptabilisé ; réconciliation TVA ; contrôles par sortie ; exposition confirmée/proposée | `AccountingToTaxWaterfall`, `CorporateTaxReconciliation`, `VatReconciliationChart`, `TaxControlCoverageBar` (4 visualisations principales maximum) |
| Analyse | matrice impôt × cycle, sorties par nature, contrôles par niveau de preuve, périodes, pièces requises | `TaxRiskMatrix`, `TaxMissingDataPanel`, cartes tabulaires |
| Exploration | toutes les lignes de réconciliation et tous les contrôles, avec source, formule, données utilisées, limites, preuve, historique de revue | `TaxFindingTable` (replié par défaut) |

Primitives transverses : `TaxChartCard`, `TaxMethodologyPopover`,
`TaxSourceFootnote`, `AccessibleTaxChartTable` — délégation aux primitives de
`components/synthesis` (tableau sous chaque graphique, méthodologie et sources
visibles).

## Langage utilisateur

`lib/tax/cockpit/labels.ts` projette la taxonomie de
[`TAX_OUTPUT_TAXONOMY.md`](./TAX_OUTPUT_TAXONOMY.md) :

| `TaxControlOutcome` | Libellé |
| --- | --- |
| `passed` | Vérifié |
| `confirmed_non_compliance` | Anomalie confirmée |
| `reconciliation_difference` | Incohérence |
| `potential_tax_risk` | Risque potentiel |
| `missing_information` | Donnée manquante |
| `inconclusive` | Non concluant |
| `review_recommendation` | Analyse recommandée |

« Calculé / Déclaré / Comptabilisé / Revu » qualifient des montants, pas des
sorties. L'ordre d'affichage suit l'ordre de présentation déterministe de la
taxonomie ; aucun score fiscal global n'est produit (seul `headlineStatus` +
`headlinePolicyVersion` sont restitués).

## Prudences héritées des moteurs

- une valeur absente reste « non disponible », jamais 0 ;
- les étapes « proposées » du waterfall IS restent hors du cumul retenu
  (barre pointillée, mention « hors cumul ») ;
- une somme d'écarts est une grandeur de revue, ni un redressement ni une
  exposition certaine ;
- wording interdit (« fraude », « redressement certain », « déclaration
  conforme », « impôt définitif », « FEC rejeté ») testé sur les datasets.

## Données de démonstration

`lib/tax/demo/demo-dossier.ts` construit des ENTRÉES fictives (liasse 2058-A,
2065, CA3, FEC, avis de CFE) puis **exécute réellement les moteurs** — aucun
montant de sortie n'est écrit à la main. Jeu déterministe (horloge figée) avec
deux écarts pédagogiques : 24 850,00 € entre impôt brut recalculé et charge
comptabilisée, 20,00 € sur la TVA nette. Variantes pour les tests : IS seul,
TVA seule, sans aucune pièce (« aucun impôt calculable »).

## Filtres et accessibilité

- filtre impôt (`?impot=`) et statut (`?statut=`) synchronisés à l'URL,
  restaurés au chargement ; les datasets sont pré-construits côté serveur par
  périmètre, le client ne fait que sélectionner ;
- clavier complet (popovers Échap, cellules de matrice focusables avec zone
  `aria-live`, filtres `aria-pressed`) ; reduced-motion via la couche globale
  et `.pbz-anim` ;
- page enregistrée dans `e2e/accessibility.spec.ts` (axe-core),
  `e2e/partial-coverage.spec.ts` (aucune conclusion excessive) et
  `lighthouserc.json`.

## Hors périmètre (inchangé, cf. TAX_ROADMAP § TAX-08)

Persistance des snapshots fiscaux, API dossier-scopée, télétransmission,
paiement, import externe. Le cockpit lit un snapshot en mémoire.
