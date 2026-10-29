# Dictionnaire des sources IFRS 16 — mapping `ifrs16-leases-2` (L16-01)

Fichier produit par `npm run ifrs:l16-docs` depuis `lib/ifrs/leases/dictionary.ts` ; ne pas le modifier à la main.

## Format

- CSV UTF-8, séparateur `;`, guillemets doubles, décimal `.`, dates ISO `AAAA-MM-JJ`, euros. Colonnes : `Key;Amount;Date;Details`, lues par l'import existant.
- `Details` est un objet JSON : `contractId` (sauf grand livre, facultatif), `source` (`title`, `pack`, `date` au plus tard à la date de revue, `page` ou `null`, `clause`) et `fields`, les champs ci-dessous, tous en chaînes.
- Un champ inconnu du dictionnaire ou une valeur mal formée rejette la source (`L16_IMPORT_SCHEMA_INVALID`). Un doublon de contrat est refusé (`L16_DUPLICATE_CONTRACT`).

## Vide, zéro, inconnu, non applicable

| Forme | Sens | Effet |
|---|---|---|
| Champ absent | Vide : aucune réponse | Obligatoire → contrat `a_qualifier` (X25) |
| `inconnu` | Réponse explicite « on ne sait pas » | Comme un vide, motif distinct |
| `non_applicable` | Le champ ne s'applique pas | Admis seulement si la colonne « n/a » l'indique ; sinon `a_qualifier` (Q07) |
| `0.00`, `none` | Zéro ou absence déclarés | Une valeur, jamais déduite d'un vide |

## Contrats (`lease_contracts`) — une ligne par contrat ; `Key` = identifiant du contrat ; `Amount` = somme des loyers fixes non actualisés ; `Date` = commencement

| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |
|---|---|---|---|---|---|---|
| `lessor` | Bailleur | texte | — | oui | non | Vide → à qualifier |
| `assetCategory` | Catégorie d'actif sous-jacent (niveau de l'élection court terme, § 8) | texte | — | oui | non | Vide → à qualifier |
| `contractVersion` | Version du contrat et pièce | texte | — | oui | non | Vide → à qualifier |
| `versionNature` | Nature de la version | liste : `initial`, `transcription_correction`, `economic_modification` | — | oui | non | economic_modification → hors V1 (X12) ; une correction de transcription garde la lignée |
| `role` | Rôle de l'entité | liste : `lessee`, `lessor`, `sublease`, `sale_leaseback` | — | oui | non | ≠ lessee → hors périmètre (X30) |
| `contractCurrency` | Devise du contrat | texte | — | oui | non | ≠ EUR → hors V1 (X16) |
| `signatureDate` | Date de signature, distincte du commencement | date ISO | — | oui | non | Vide → à qualifier ; postérieure au commencement → à qualifier (Q01) |
| `endDate` | Fin du contrat retenue | date ISO | — | oui | non | Vide → à qualifier ; différente de la fin du mois n → à qualifier (Q02) |
| `termMonths` | Durée retenue en mois | entier | mois | oui | non | Vide → à qualifier (X20) ; < 1 ou > 120 → hors V1 (X18) |
| `payment` | Loyer fixe mensuel du modèle, hors TVA | montant `0.00` | EUR | oui | non | Vide → à qualifier ; Amount ≠ loyer × durée → à qualifier (Q03) |
| `paymentFrequency` | Périodicité des loyers | liste : `monthly`, `quarterly`, `annual`, `other` | — | oui | non | ≠ monthly → hors V1 (X17) |
| `paymentTiming` | Terme des loyers | liste : `arrears`, `advance` | — | oui | non | advance → hors V1 (X03) |
| `vatTreatment` | TVA sur les loyers | liste : `excluded_recoverable`, `no_vat`, `non_recoverable`, `uncertain` | — | oui | non | non_recoverable ou uncertain → hors V1 (X21) |
| `identifiedAsset` | Actif identifié (§ 9, B13-B20) | liste : `yes`, `no` | — | oui | non | no → non-location ; vide → à qualifier (R01) |
| `controlOfUse` | Contrôle de l'utilisation (B21-B30) | liste : `yes`, `no` | — | oui | non | no → non-location ; vide → à qualifier (R01) |
| `identificationEvidence` | Preuve et jugement d'identification | texte | — | oui | non | Vide → à qualifier (R01) |
| `serviceComponents` | Composantes non locatives (§ 12-15) | liste : `none`, `separated`, `election_15`, `present` | — | oui | non | present sans ventilation ni élection § 15 → à qualifier (X07) |
| `usefulLifeMonths` | Durée d'utilité retenue du droit d'utilisation | entier | mois | oui | non | Vide → à qualifier ; < 1 → à qualifier (Q04) |
| `depreciationMethod` | Méthode d'amortissement | liste : `straight_line`, `other` | — | oui | non | ≠ straight_line → hors V1 (Q05) |
| `depreciationJustification` | Justification de la durée et de la méthode | texte | — | oui | non | Vide → à qualifier |

## Hypothèses (`lease_assumptions`) — une ligne par contrat ; `Key` = identifiant du contrat ; `Amount` = 0.00 ; `Date` = commencement

| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |
|---|---|---|---|---|---|---|
| `rateKind` | Nature du taux (§ 26) | liste : `implicit`, `incremental_borrowing` | — | oui | non | Vide → à qualifier (X19) |
| `rateBasis` | Base du taux fourni | liste : `annual_effective`, `nominal`, `monthly` | — | oui | non | nominal ou monthly → à qualifier, jamais converti en silence (X19) |
| `annualEffectiveRate` | Taux annuel effectif décimal (0,05 = 5 %) | taux décimal | fraction décimale | oui | non | Vide → à qualifier (X19) ; négatif ou > 1 → hors V1 (X19) |
| `rateDate` | Date pertinente du taux | date ISO | — | oui | non | Vide → à qualifier (X19) |
| `rateJustification` | Justification et preuve du taux (IFRIC 09/2019) | texte | — | oui | non | Vide → à qualifier (X19) |
| `termJudgement` | Jugement de durée : options examinées, période exécutoire (B34-B41) | texte | — | oui | non | Vide → à qualifier (X20) |
| `lowValueExemption` | Exemption faible valeur, contrat par contrat (§ 5, B3-B8) | liste : `elected`, `not_elected` | — | oui | non | Vide → à qualifier |
| `lowValueNewValue` | Valeur à neuf de l'actif (B3-B8) | montant `0.00` | EUR | non | oui | Exigée si exemption faible valeur ; vide → à qualifier (X23) |
| `lowValueJudgement` | Jugement faible valeur (B3-B8), sans seuil par défaut | texte | — | non | oui | Exigé si exemption faible valeur ; vide → à qualifier (X23) |
| `variablePayments` | Loyers variables | liste : `none`, `index`, `usage` | — | oui | non | index → hors V1 (X01) ; usage → hors V1 (X02) |
| `prepaidPayments` | Paiements d'avance (§ 24 b) | montant `0.00` | EUR | oui | non | ≠ 0 → hors V1 (X03) |
| `leaseIncentives` | Avantages incitatifs reçus | montant `0.00` | EUR | oui | non | ≠ 0 → hors V1 (X04) |
| `initialDirectCosts` | Coûts directs initiaux (§ 24 c) | montant `0.00` | EUR | oui | non | ≠ 0 → hors V1 (X05) |
| `restorationCosts` | Coûts de remise en état (§ 24 d) | montant `0.00` | EUR | oui | non | ≠ 0 → hors V1 (X06) |
| `deposit` | Dépôt de garantie | liste : `none`, `qualified`, `unqualified` | — | oui | non | unqualified → à qualifier (X08) |
| `residualValueGuarantee` | Garantie de valeur résiduelle | liste : `none`, `present` | — | oui | non | present → hors V1 (X09) |
| `purchaseOption` | Option d'achat | liste : `none`, `present` | — | oui | non | present → hors V1 (X10) ; interdit l'exemption court terme (X22) |
| `ownershipTransfer` | Transfert de propriété | liste : `none`, `present` | — | oui | non | present → hors V1 (X10) |
| `terminationPenalty` | Pénalité de résiliation incluse dans la durée | liste : `none`, `present` | — | oui | non | present → hors V1 (X11) |
| `modification` | Modification ou réestimation en cours | liste : `none`, `present` | — | oui | non | present → hors V1 (X12) |
| `impairmentIndicator` | Indice de dépréciation (IAS 36) | liste : `none`, `present` | — | oui | non | present → hors V1 (X14) |
| `capitalizedInOtherAsset` | Charges incorporées au coût d'un autre actif | liste : `none`, `present` | — | oui | non | present → hors V1 (X15) |

## Échéances et règlements (`lease_schedule`) — une ligne par échéance ; `Amount` = loyer dû hors TVA ; `Date` = date exigible

| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |
|---|---|---|---|---|---|---|
| `contractVersion` | Version du contrat de l'échéance | texte | — | oui | non | Vide → à qualifier |
| `paidDate` | Date de règlement | date ISO | — | non | oui | Échéance exigible : vide ou inconnu → à qualifier (X13) ; future : non applicable |
| `paidAmount` | Montant réglé total | montant `0.00` | EUR | non | oui | Échéance exigible : vide → à qualifier ; réglé < dû → hors V1 (X13) ; réglé > dû → à qualifier (Q06) |
| `paidVat` | TVA comprise dans le règlement (TVA récupérable qualifiée) | montant `0.00` | EUR | non | oui | Règlement TTC : loyer, TVA et total restent distincts |

## Comptabilité (`lease_ledger`) — une ligne par charge ou paiement de loyer ; `Amount` = montant ; `Date` = date d'écriture

| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |
|---|---|---|---|---|---|---|
| `account` | Compte PCG (612, 613, 614…) | texte | — | oui | non | Indice de recherche, jamais une preuve d'exhaustivité |
| `periodStart` | Début de la période couverte | date ISO | — | oui | non | Vide → ligne non rattachable |
| `periodEnd` | Fin de la période couverte | date ISO | — | oui | non | Vide → ligne non rattachable |
| `piece` | Pièce comptable | texte | — | oui | non | Vide → ligne non rattachable |

## Ouverture historique (`lease_opening`) — une ligne par contrat repris ; `Key` = identifiant du contrat ; `Amount` = 0.00 ; `Date` = date d'ouverture

| Champ | Libellé | Type | Unité | Obligatoire | n/a | Contrôle et blocage |
|---|---|---|---|---|---|---|
| `openingDate` | Date de l'ouverture (veille du début de l'exercice) | date ISO | — | oui | non | Vide → diagnostic (X24) |
| `debt` | Dette locative d'ouverture | montant `0.00` | EUR | oui | non | Écart au recalcul ≠ 0,00 → diagnostic (X24) |
| `rouGross` | Droit d'utilisation brut d'ouverture | montant `0.00` | EUR | oui | non | Écart au recalcul ≠ 0,00 → diagnostic (X24) |
| `rouAccumulated` | Amortissements cumulés d'ouverture | montant `0.00` | EUR | oui | non | Écart au recalcul ≠ 0,00 → diagnostic (X24) |
| `rouNet` | Droit d'utilisation net d'ouverture | montant `0.00` | EUR | oui | non | Écart au recalcul ou brut − cumul ≠ net → diagnostic (X24) |
| `reportingRef` | Reporting IFRS validé de référence | texte | — | oui | non | Vide → diagnostic (X24) |
| `reviewEvidence` | Preuve de revue de l'ouverture | texte | — | oui | non | Vide → diagnostic (X24) |

## Contrôles de cohérence (Qnn)

Codes internes, en plus des cas exclus X01-X34 de `docs/ifrs/SCOPE_V1.md` :

| Code | Contrôle | Effet |
|---|---|---|
| Q01 | Signature postérieure au commencement | `a_qualifier` |
| Q02 | Fin du contrat différente de la fin du mois n | `a_qualifier` |
| Q03 | Total de la pièce ≠ loyer × durée | `a_qualifier` |
| Q04 | Durée d'utilité inférieure à un mois | `a_qualifier` |
| Q05 | Amortissement non linéaire | `hors_scope_v1` |
| Q06 | Règlement supérieur au loyer dû | `a_qualifier` |
| Q07 | « non applicable » sur un champ qui ne l'admet pas | `a_qualifier` |
| Q08 | Contrat de 12 mois au plus sans politique court terme déclarée pour sa catégorie (§ 8) | `a_qualifier` |
| Q09 | Échéance rattachée à une autre version du contrat | `a_qualifier` |
| Q10 | Échéancier incomplet ou décalé | `a_qualifier` |
