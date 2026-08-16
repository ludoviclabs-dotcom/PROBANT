# TAX-06 — moteur de réconciliation TVA

## Objet et frontière

TAX-06 rapproche trois plans pour une période déclarative : les **écritures**
(FEC), la **déclaration** (CA3 ou CA12) et, lorsqu'elles sont fournies, les
**pièces**. Il explique les écarts ; il ne liquide pas la TVA et **n'effectue
aucune télétransmission à la DGFiP**.

### Périmètre

| Couvert | Hors périmètre |
| --- | --- |
| Assujetti isolé, une période déclarative | Groupes TVA |
| Réel normal et mini-réel (CA3) | Franchise, exonéré, régimes sectoriels |
| Réel simplifié (CA12) | Prorata et coefficients de déduction |
| Mensuel, trimestriel, annuel | Régularisations pluri-périodes |

Un cas hors périmètre produit une `TaxLimitation` explicite et un snapshot
`blocked`. `confirmed_non_compliance` est interdit par le schéma : il n'est pas
une sortie de ce lot.

## Deux contraintes qui façonnent le moteur

### 1. Aucune source de taux légal de TVA n'existe dans le registre

Le registre publie les articles 269, 271, 287 et 289 du CGI, la doctrine
associée et les millésimes CA3/CA12 — mais **aucune source de taux** (pas
d'article 278 et suivants). Inventer « 20 % », « 10 % » ou « 5,5 % » exigerait
une citation fabriquée.

Le moteur travaille donc sur des **taux constatés** : pour chaque opération,
`taux = TVA ÷ base`. Un `VatRateBucket` agrège par taux constaté et qualifie sa
place *dans ce dossier* — `dominant`, `secondary`, `outlier`, `unresolved`. Le
contrôle « taux inhabituel » signale un taux marginal ; il ne dit jamais qu'un
taux est légalement incorrect, ce qui applique littéralement la règle du lot :
*un taux atypique n'est pas automatiquement une erreur*.

Le seuil de marginalité (5 % de la base par défaut) est une heuristique
**interne** : au sens du modèle canonique elle ne devient jamais une tolérance
légale.

### 2. La transition CIBS du 1er septembre 2026 est déjà encodée

`cgi-art-269` (fait générateur et exigibilité) et `cgi-art-289` (obligation de
facturation) portent `effectiveTo: 2026-08-31`, **sans version successeur**.

`assessNormativeCoverage` répond à une seule question : toutes les sources
requises couvrent-elles toute la période ? Chaque contrôle déclare ses
exigences, et un contrôle dont une source n'est pas couverte est **bloqué en
`missing_information`** avec une limitation `VAT_SOURCE_NOT_COVERED:<contrôle>`
en `capabilityStatus: non_available`. Aucune version voisine n'est substituée.

Conséquences observées et testées :

| Période | Couverture (fait générateur) |
| --- | --- |
| T1 2026 | `covered` |
| T3 2026 (1er juil. → 30 sept.) | `partially_covered`, rupture au 2026-09-01 |
| Septembre 2026 | `not_covered` |

Le registre présente aussi une lacune réelle en janvier 2026 : `cgi-art-271`
n'a de version effective qu'à compter du 2026-02-21. Une CA12 annuelle 2026 est
donc `not_covered` pour le droit à déduction — le moteur le dit au lieu de le
masquer.

## Contrats livrés

| Contrat | Rôle |
| --- | --- |
| `VatPeriod` | Projection de `TaxPeriod` enrichie du régime, du formulaire attendu et de la couverture normative. Ne remplace pas la période canonique : la référence par `taxPeriodId`. |
| `VatTransactionCandidate` | Opération reconstruite depuis le FEC. **Toujours un candidat** ; ses signaux portent le suffixe `_candidate`. |
| `VatRateBucket` | Agrégat par taux constaté, avec TVA théorique, comptabilisée et écart. |
| `VatDeclarationSnapshot` | Lecture normalisée d'une CA3 ou CA12. `status: "absent"` est un fait, jamais une déclaration à zéro. |
| `VatReconciliationSnapshot` | Sortie figée, hachée, validée par `VatReconciliationSnapshotSchema`. |
| `VatControlEngine` | Exécute les seize contrôles du MVP. |
| `VatFindingFactory` | Produit des `TaxFindingDetails` rattachés à un contrôle du catalogue. |

## Les seize contrôles

`VAT.BASE.BY_RATE`, `VAT.THEORETICAL.BY_RATE`, `VAT.COLLECTED.ACCOUNTED`,
`VAT.DEDUCTIBLE.ACCOUNTED`, `VAT.DECLARED`, `VAT.NET`, `VAT.CREDIT`,
`VAT.CREDIT.CARRYFORWARD`, `VAT.PERIOD.SHIFT`, `VAT.RATE.UNUSUAL`,
`VAT.PIECE.DUPLICATE`, `VAT.PIECE.MISSING`, `VAT.ENTRY.NO_REFERENCE`,
`VAT.ACCOUNT.ABNORMAL_BALANCE`, `VAT.REVERSE_CHARGE.CANDIDATE`,
`VAT.FORM.COHERENCE`.

## Étagement de la preuve

`VatEvidenceTier` matérialise la règle du lot :

| Niveau | Entrées | Conclusion maximale |
| --- | --- | --- |
| `ledger_only` | FEC seul | signal ou estimation |
| `ledger_and_declaration` | FEC + déclaration | réconciliation |
| `ledger_declaration_and_invoice` | + inventaire de pièces | contrôle renforcé |
| `insufficient` | source non couverte | `missing_information` |

Sans inventaire de pièces, le droit à déduction reste `inconclusive` : le moteur
ne conclut pas à l'absence de facture. « Absent de PROBANT » ne signifie pas
« absent du dossier ».

## Discipline du plan comptable

Les préfixes de comptes (4457, 4456, 70, 60…) **repèrent** des écritures ; ils
ne concluent rien. Ils sont injectables via `VatAccountMap` : un dossier au plan
atypique se paramètre sans modifier le moteur. Aucune opération issue du FEC ne
dépasse `evidenceStrength: "derived"`, ce que le schéma vérifie.

## Jeux de données de visualisation

`salesByRate`, `comparison` (théorique / comptabilisée / déclarée),
`netWaterfall` (6 étapes), `timeline`, `missingPieces`. Une donnée absente reste
`null` et se lit comme telle : rien n'est comblé.

## Exactitude en centimes

Le FEC porte des euros décimaux ; ils sont convertis en centimes entiers **une
seule fois**, à la frontière. Toute l'arithmétique réutilise le module
`corporate-tax/arithmetic` de TAX-05 (`bigint`, arrondi `half_up_cent` tracé).
Un écart d'arrondi entre TVA théorique et comptabilisée est exposé au centime,
pas absorbé.

## Réutilisation TAX-05

`readDeclarationBoxes` a été extrait de `corporate-tax/liasse.ts` vers
`lib/tax/declaration-reading.ts` pour être partagé. Le comportement est
identique — les 80 tests TAX-05 le vérifient — et `liasse.ts` continue de le
réexporter pour ses importateurs.

## Ajouts au catalogue

`VAT.FORM.CA12.RECONCILIATION` et `TAX.RECOMMENDATION.REQUEST_CA12` ont été
ajoutés : `VAT.FORM.CA3.RECONCILIATION` ne s'applique qu'au réel normal et au
mini-réel, et le réel simplifié serait resté sans contrôle applicable — le même
défaut de couverture par régime que la revue TAX-05 avait relevé.

## Dette connue (TAX-06.1)

- la continuité du crédit d'une période à la suivante suppose la déclaration
  précédente ; elle n'est pas vérifiée par une exécution mono-période ;
- le millésime CA3 publié n'expose qu'une base HT (case 08, taux normal) et la
  CA12 aucune : la ventilation **déclarée** par taux reste partielle ;
- l'autoliquidation est détectée par une heuristique d'écriture symétrique ;
  la qualification de l'opération reste humaine ;
- `VatPeriod` ne modélise pas les acomptes du régime simplifié.

## Ce que TAX-06 ne fait pas

- aucune télétransmission, aucun dépôt, aucune liquidation ;
- aucun prorata ni coefficient de déduction ;
- aucune persistance ni API : le snapshot reste en mémoire (TAX-08) ;
- aucun rattachement à un `Finding` générique : `TaxFindingDetails` est produit,
  la cloison et le silo restent du ressort de TAX-07.
