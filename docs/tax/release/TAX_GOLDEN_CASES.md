# TAX-10 — Golden cases fiscaux

Date de la gate : 2026-08-17
Nature des données : **100 % synthétiques**
Commande : `npm run test:tax-release`

## Corpus documentaire

Chaque jeu annuel contient dix fichiers synthétiques, hachés séparément : FEC, balance, 2058-A, 2033-B, 2065, CA3, CA12, factures, avis fiscal et résumé de paie.

Pour les cinq documents structurés par année, le `sourceHash` du snapshot et le `documentHash` de chaque champ sont égaux au SHA-256 exact du fichier synthétique correspondant, soit 15/15 couples fichier/snapshot. Les golden cases fabriquent encore leurs objets canoniques sans traverser les parseurs ; cette limite est reprise dans le rapport de readiness.

| Millésime | Usage de la fixture | Attente normative |
|---|---|---|
| 2025 | Garde de version antérieure | aucun repli sur les règles/formulaires 2026 |
| 2026 | Cas calculables publiés | règles, formulaires et barème 2026 uniquement |
| 2027 | Garde de version future | calcul bloqué tant qu'aucun registre 2027 n'est publié |

Les fixtures 2025 et 2027 sont des enveloppes techniques de test. Elles ne sont pas présentées comme des modèles officiels de formulaires.

## Golden cases IS

| ID | Cas | Résultat pivot attendu | Outcome global attendu |
|---|---|---|---|
| `is-zero-adjustment` | zéro retraitement | base 100 000,00 € ; IS brut 25 000,00 € | `passed` |
| `is-reintegration` | réintégration | résultat fiscal 120 000,00 € | `passed` |
| `is-deduction` | déduction | résultat fiscal 70 000,00 € | `passed` |
| `is-loss` | perte | base et IS brut nuls | `passed` |
| `is-deficit` | déficit | base après imputation 60 000,00 € | `passed` |
| `is-reduced-rate` | taux réduit démontré | IS brut 4 500,00 € sur 30 000,00 € | `passed` |
| `is-reduced-rate-unproven` | taux réduit non démontré | tranche réduite allouée : 0 ; estimation au taux normal | `missing_information` |
| `is-inconsistent-return` | liasse incohérente | calcul bloqué ; IS brut nul | `reconciliation_difference` |
| `is-divergent-tax-charge` | charge d'IS divergente | ligne de rapprochement `different` | `reconciliation_difference` |
| `is-missing-declaration` | déclaration absente | impact fiscal non calculé | `missing_information` |

## Golden cases TVA

| ID | Cas | Invariant principal | Outcome global attendu |
|---|---|---|---|
| `vat-ca3-exact` | CA3 exacte | TVA nette comptabilisée 100,00 € | `passed` |
| `vat-collected-difference` | écart collectée | ligne de rapprochement différente | `reconciliation_difference` |
| `vat-deductible-difference` | écart déductible | ligne de rapprochement différente | `reconciliation_difference` |
| `vat-missing-invoice` | facture absente | `VAT.PIECE.MISSING = potential_tax_risk` ; pas de niveau « + facture » | `potential_tax_risk` |
| `vat-multiple-rates` | taux multiples | taux observés 20 %, 10 % et 3 % ; atypique à revoir | `reconciliation_difference` (prioritaire sur la recommandation) |
| `vat-credit-note` | avoir | candidat TVA négatif conservé | `passed` |
| `vat-credit` | crédit | position comptable −300,00 € ; contrôle crédit passé | `reconciliation_difference` (net dû distinct du crédit déclaré) |
| `vat-reverse-charge` | autoliquidation | candidat d'autoliquidation, jamais qualification automatique | `reconciliation_difference` (TVA théorique non dérivable) |
| `vat-shifted-period` | période décalée | `VAT.PERIOD.SHIFT = review_recommendation` | `review_recommendation` |
| `vat-ca12` | CA12 | formulaire 3517-S-SD ; couverture annuelle partielle | `missing_information` |
| `vat-unknown-regime` | régime inconnu | moteur bloqué, aucun contrôle exécuté | `missing_information` |

Un outcome global peut être plus prudent que le signal visé par le cas : l'ordre déterministe est donnée manquante, incohérence, risque potentiel, recommandation, non-concluant, vérifié.

Les 21 définitions portent un `expectedSnapshotHash` SHA-256 complet. La gate compare chaque snapshot canonique à cette empreinte attendue ; elle ne se contente pas de vérifier la longueur du hash ou quelques montants pivots.

## Propriétés vérifiées

- même entrée → même SHA-256 et même `snapshotHash` ;
- permutation des lignes FEC → même résultat lorsque l'ordre est sans portée ;
- toutes les clés `*Cents` et `*BasisPoints` sont des entiers sûrs ;
- aucune conclusion positive sans FEC ni déclaration ;
- aucune règle, aucun formulaire ni aucun barème 2026 appliqué à 2025 ou 2027 ; chaque référence publiée intersecte exactement la période ;
- aucune règle obligatoire ne repose sur une source `secondary_analysis` ;
- aucune déduction TVA sans pièce ne reçoit le niveau `ledger_declaration_and_invoice` ;
- aucune tranche IS réduite n'est allouée si un critère manque.

## Emplacement machine

- Corpus : `lib/tax/release/synthetic-fixtures.ts`
- Catalogue exécutable : `lib/tax/release/golden-cases.ts`
- Gate : `lib/tax/release/__tests__/release-gate.test.ts`
