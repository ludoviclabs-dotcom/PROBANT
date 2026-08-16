# TAX-07-CFE — capability gate et module

## Verdict

| Le module… | Réponse |
| --- | --- |
| **calcule** | non — et il ne peut pas |
| **estime** | non |
| **rapproche** | **oui**, dès qu'un avis est importé ou saisi |
| **recommande une revue** | oui, lorsqu'aucun avis n'est disponible |

`CfeCapability` n'a que trois valeurs — `reconcile`, `recommend_review`,
`blocked`. `compute` n'existe pas dans le type : l'incapacité est portée par le
modèle, pas seulement par la documentation.

## ÉTAPE 1 — capability gate

### Population concernée

Entités disposant d'au moins un établissement en France, non exonérées, pour une
période CFE. Le module ne traite ni les groupes, ni les régimes sectoriels.

### Données nécessaires à un calcul

1. base d'imposition (valeur locative des biens passibles de taxe foncière) ;
2. taux voté par la commune ou l'EPCI ;
3. délibérations d'exonération et de réduction applicables ;
4. cotisation minimum et barème de chiffre d'affaires ;
5. période et établissements.

### Données disponibles dans PROBANT

| Donnée | Disponible | Où |
| --- | --- | --- |
| Établissements, commune, code postal, vérification | oui | `TaxProfile.establishments` |
| Statut d'exonération | oui, si renseigné **et vérifié** | `TaxProfile.parameters.cfe_exemption` |
| Charge comptabilisée | oui | FEC, comptes 6351 |
| Dette | oui | FEC, comptes 447 / 4486 |
| Règlements | oui | FEC, trésorerie 512 rattachée à une écriture CFE |
| Avis de CFE | oui, **en entrée** | document `tax_notice` ou saisie |
| Période et exercice | oui | `TaxPeriod` |

### Données externes nécessaires — absentes

| Donnée | État dans le registre |
| --- | --- |
| Valeur locative cadastrale | non modélisée |
| Taux communal / EPCI | non versionné |
| Délibérations locales | non versionnées |
| Cotisation minimum et barème CA | non versionnés |

`extension-cfe` est `metadata_only` et le dit explicitement : « Les bases
locales, deliberations, exonérations et periodes ne sont pas modelisees ; aucun
controle n'est disponible. »

### Conclusion du gate

- **Calcul possible** : non. Aucun des quatre paramètres d'assiette et de taux
  n'existe sous forme versionnée. Le lot l'interdit d'ailleurs explicitement —
  « ne pas prétendre recalculer sans base locative et taux local ».
- **Estimation seulement** : non plus. Estimer supposerait un taux moyen fictif.
- **Rapprochement** : oui. C'est exactement ce que le lot demande — « importer ou
  saisir l'avis ; rapprocher paiement, charge et avis ; contrôler cohérence des
  établissements et périodes ».
- **Cas non concluants** : aucun avis fourni ; total d'avis illisible ; statut
  d'exonération non vérifié ; période antérieure au 29 avril 2026.

## ÉTAPE 2 — sources

Aucune source n'a été ajoutée. Le module utilise la seule source CFE déjà
enregistrée :

| Source | Version | Portée |
| --- | --- | --- |
| `bofip-cfe` — BOI-IF-CFE-10-20-20 | `bofip-cfe-v2026-04-29`, effective au 29/04/2026 | doctrine sur les **activités imposables** |

Cette doctrine fonde une question d'**applicabilité**, jamais un montant. Sa
fenêtre d'effet est respectée : une période antérieure au 29 avril 2026 produit
`CFE_DOCTRINE_NOT_COVERED`, sans substitution d'une version voisine — la même
discipline que la frontière CIBS de TAX-06, servie par la primitive partagée
`assessSourceCoverage`.

## ÉTAPE 3 — modèle et moteur

```text
lib/tax-engine/cfe/
  types.ts          contrats, dont CfeCapability sans valeur « compute »
  applicability.ts  établissements, exonération vérifiée, couverture doctrinale
  ledger.ts         charge, dette et règlements reconstruits du FEC (candidats)
  engine.ts         les huit contrôles de rapprochement
  findings.ts       TaxFindingDetails rattachés au contrôle du catalogue
  trace.ts          trace, dont l'abstention explicite de calcul
  schemas.ts        frontière de validation
  __tests__/        39 tests
```

Le chemin `lib/tax-engine/` suit littéralement la consigne du lot (« sous-module
autonome »). Il diverge de l'arborescence `lib/tax/` des lots précédents ; les
primitives partagées (`createTaxReconciliationLine`, `assessSourceCoverage`,
catalogue de contrôles) restent importées de `lib/tax`.

### Les huit contrôles

`CFE.NOTICE.AVAILABLE`, `CFE.NOTICE.INTERNAL_CONSISTENCY`,
`CFE.NOTICE.VS.CHARGE`, `CFE.NOTICE.VS.PAYMENT`, `CFE.CHARGE.VS.PAYMENT`,
`CFE.ESTABLISHMENT.COHERENCE`, `CFE.PERIOD.COHERENCE`,
`CFE.EXEMPTION.CONSISTENCY`.

### L'abstention est tracée

Avant tout traitement, le moteur enregistre une étape
`abstain_from_computation` citant les trois entrées manquantes, et porte en
permanence la limitation `CFE_BASE_NOT_RECOMPUTABLE`. Le schéma **refuse** tout
snapshot dépourvu de l'une ou de l'autre : le module doit prouver qu'il s'est
abstenu autant qu'il prouve ce qu'il a rapproché.

## Le seul seuil du module

Le module ne possède aucun seuil légal — il n'y en a pas de versionné. Son unique
seuil est sa **tolérance de rapprochement**, nulle par défaut, portée par des
lignes de famille `internal`. Elle ne devient jamais une tolérance légale. Les
scénarios « seuil exact / juste en dessous / juste au-dessus » du lot portent sur
cette tolérance, aux centimes près.

## Prudence

- L'avis est une **entrée**, jamais un résultat : importé (document source
  obligatoire) ou saisi (porteur obligatoire). Aucune troisième voie.
- Les préfixes de comptes repèrent des écritures et ne concluent rien ; ils sont
  injectables et toute position reste `derived`, ce que le schéma vérifie.
- Une exonération non **vérifiée** ne suffit pas à écarter l'impôt.
- Un total d'avis illisible n'est jamais remplacé par la somme partielle des
  autres.
- L'absence d'avis dans PROBANT ne vaut pas absence d'avis.
- `confirmed_non_compliance` et `potential_tax_risk` sont hors périmètre : le
  second supposerait un montant de référence que le module ne calcule pas.

## Dette connue (TAX-07-CFE.1)

- le rattachement d'un règlement à la CFE repose sur la coexistence, dans une
  même écriture, d'un compte de charge ou de dette et d'un compte de trésorerie ;
  un règlement groupé de plusieurs impôts n'est pas ventilé ;
- la charge lue en 6351 peut couvrir d'autres impôts directs si le compte n'est
  pas dédié ; la ligne de rapprochement le déclare en note de normalisation ;
- les acomptes de CFE ne sont pas distingués du solde ;
- la continuité d'un exercice à l'autre relève de la synthèse pluri-périodes.
