# TAX-04 — Tax Control Planner et matrice de capacités

## Objet et frontière

TAX-04 détermine, de façon fermée et reproductible, ce que PROBANT peut préparer
ou exécuter à partir du profil fiscal, de la période et des snapshots disponibles.
Il ne contient aucune formule détaillée d'IS ou de TVA et ne produit aucune
conclusion fiscale à la place d'un futur exécuteur de contrôles.

Le planner répond aux quatre questions visibles par l'utilisateur :

1. quels contrôles ont déjà été vérifiés ;
2. quels contrôles ont produit un calcul tracé ;
3. sur quels contrôles PROBANT ne peut pas conclure ;
4. quelles pièces ou confirmations doivent être obtenues.

Un input manquant produit exclusivement un statut de planification, une
`TaxLimitation` et, lorsqu'une règle le prévoit, une `TaxRecommendation`. Il ne
produit jamais un `TaxControlOutcome`, une sévérité ou un constat.

## Contrats

| Contrat | Responsabilité |
| --- | --- |
| `TaxControlContext` | Isole organisation, dossier, entité, profil, période, snapshots et états d'exécution. |
| `TaxControlDefinition` | Épingle autorité, domaine, stage, impôt, période d'effet, millésimes, sources, prérequis et preuve maximale. |
| `TaxControlPlanner` | Évalue l'applicabilité et la disponibilité des inputs sans exécuter de formule. |
| `TaxControlResult` | Restitue statut, données utilisées/manquantes, sources, limitations, recommandations et hash. |
| `TaxCapabilityMatrix` | Agrège contrôles possibles, impossibles, non applicables, vérifiés, calculés et inconclusifs. |
| `TaxRecommendation` | Action déterministe issue d'une règle identifiée et versionnée. |
| `TaxLimitation` | Explique la frontière de preuve et les résultats qui restent interdits. |

`outcome`, `severity` et `evidenceStrength` restent trois dimensions séparées.
Le stage est toujours `tax_review`. Aucun score fiscal global n'existe dans ces
contrats.

## Sémantique des statuts

| Statut | Sens | `outcome` du planner |
| --- | --- | --- |
| `eligible` | Le contrôle est applicable et les inputs minimaux existent, mais la capacité est `future`, `non_available` ou indisponible dans cette version. | `null` |
| `not_applicable` | Impôt, régime, exercice, millésime ou période d'effet hors périmètre de la définition. | `null` |
| `missing_inputs` | Au moins une donnée minimale manque ou le régime/période n'est pas confirmé. | `null` |
| `ready` | Tous les inputs requis pour la preuve maximale annoncée sont disponibles ; l'exécution peut commencer. | `null` |
| `running` | Une exécution versionnée est en cours. | `null` |
| `concluded` | Une exécution distincte a produit un résultat explicite et traçable. | résultat de l'exécution |
| `inconclusive` | Le contrôle peut être préparé, mais une pièce nécessaire à la conclusion manque. | `null` |
| `failed` | Une erreur technique d'exécution a empêché toute conclusion. | `null` |

Les statuts ne forment pas un verdict fiscal. En particulier,
`missing_inputs`, `inconclusive` et `failed` ne sont jamais convertis en anomalie.

## Matrice initiale

| Contrôle | Inputs minimaux | Inputs de conclusion | Source et version | Preuve maximale | Sans input de conclusion |
| --- | --- | --- | --- | --- | --- |
| `IS.RECONCILIATION.2058A@2026.1.0` | FEC + liasse 2050-2059 + régime IS normal + période alignée | mêmes documents | `form-2050-liasse-v2026`, 2058-A rubriques I à III | `corroborated` | `missing_inputs` car les documents sont minimaux |
| `IS.RECONCILIATION.2033B@2026.1.0` | FEC + liasse 2033 + régime IS simplifié + période alignée | mêmes documents | `form-2033-liasse-v2026`, 2033-B partie B | `corroborated` | `missing_inputs` |
| `IS.RATE.REDUCED.ELIGIBILITY@2026.1.0` | déclaration 2065 + régime IS connu | capital libéré, détention et CA documentés | `cgi-art-219-v2026-02-21`, art. 219 I-b | `corroborated` | `inconclusive` |
| `IS.COMPUTATION.RESULT_AND_TAX.2058A@2026.1.0` | liasse 2050-2059 + régime IS normal + période alignée | déclaration 2065, capital libéré, détention et CA documentés | `cgi-art-209-v2023-12-31`, `cgi-art-219-v2026-02-21`, `form-2050-liasse-v2026` | `corroborated` | `inconclusive` (TAX-05) |
| `IS.COMPUTATION.RESULT_AND_TAX.2033B@2026.1.0` | liasse 2033 + régime IS simplifié + période alignée | déclaration 2065, capital libéré, détention et CA documentés | `cgi-art-209-v2023-12-31`, `cgi-art-219-v2026-02-21`, `form-2033-liasse-v2026` | `corroborated` | `inconclusive` (TAX-05) |
| `CFE.NOTICE.RECONCILIATION@2026.1.0` | FEC + avis de CFE (tax_notice) + période alignée | mêmes documents, exonération vérifiée | `bofip-cfe-v2026-04-29`, BOI-IF-CFE-10-20-20 | `corroborated` | `missing_inputs` (rapproche, ne calcule pas) |
| `VAT.FORM.CA3.RECONCILIATION@2026.1.0` | FEC + CA3 + cases 16 et 23 | mêmes données | `form-ca3-v2026`, cases 16, 23, 25 et TD | `corroborated` | `missing_inputs` |
| `VAT.FORM.CA12.RECONCILIATION@2026.1.0` | FEC + CA12 + cases 19 et 26 | mêmes données | `form-ca12-v2026`, cases 19, 26, 29, 51 et 54 | `corroborated` | `missing_inputs` |
| `VAT.DEDUCTIBLE.SUPPORT@2026.1.0` | FEC + CA3 + case 23 | factures associées | `cgi-art-271-v2026-02-21` et `bofip-tva-deduction-v2025-01-08` | `corroborated` | `inconclusive` |

Cette matrice prépare les futurs contrôles. Un statut `ready` ne signifie pas que
le rapprochement ou le calcul a été réalisé.

## Matrices dossier couvertes par les tests

| Dossier | Résultat déterministe attendu |
| --- | --- |
| FEC seul | contrôles dépendant d'une déclaration en `missing_inputs`, sans outcome |
| FEC + balance | identique lorsque la balance ne remplace pas la déclaration requise |
| FEC + liasse | rapprochement de la liasse correspondante en `ready` |
| FEC + CA3 | cohérence CA3 en `ready`, support TVA déductible `inconclusive` sans factures |
| FEC + CA3 + factures | support TVA déductible en `ready` |
| dossier incomplet | limitations et demandes de pièces, aucun constat |
| exercice décalé | `ready` si profil, période et documents portent exactement les mêmes bornes |
| régime inconnu | `missing_inputs` et recommandation de confirmation du régime |

## Propositions déterministes

Le catalogue `TAX_RECOMMENDATION_RULES` contient des textes fermés, identifiants
stables et versions explicites. Une recommandation est émise seulement si son
input déclencheur est manquant et si la définition du contrôle autorise la règle.

Les règles initiales demandent notamment la 2058-A, la 2033-B, la 2065, la CA3,
les factures associées ou la confirmation du régime, du capital, de la détention,
du chiffre d'affaires et de la période. Aucun texte n'est généré librement.

## Déterminisme et limites

- définitions, résultats, recommandations et matrice portent un hash stable ;
- les tableaux sont triés avant empreinte, donc l'ordre d'arrivée des documents
  n'altère pas le résultat ;
- un document rejeté, supersédé, d'un mauvais millésime ou hors période n'est pas
  utilisable ;
- les FEC et balances peuvent couvrir une période fiscale incluse dans leur
  exercice ; une déclaration doit correspondre exactement à la période ;
- le planner n'interprète ni montants, ni signes, ni taux, ni cases au-delà de
  leur présence et de leur utilisabilité déclarée ;
- les formules IS et TVA, leurs traces d'opérandes et les conclusions restent
  réservées aux étapes suivantes.


