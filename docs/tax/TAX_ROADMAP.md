# Tax Review Engine — roadmap de PR

## Règle de séquencement

TAX-00 est documentaire. Chaque PR suivante doit rester livrable, testable et
réversible. Une PR ne peut activer un contrôle tant que ses sources, son millésime,
ses entrées, sa trace et ses résultats autorisés ne sont pas validés.

Les prérequis PRE-TAX-00 et PRE-TAX-01 sont considérés terminés. La séparation
`FindingFamily` / `controlStage` est une dépendance de sécurité : aucun travail
fiscal ne doit la contourner.

## Graphe de dépendances

```text
TAX-00 documentation et ADR
  |
  +--> TAX-01 contrats + registre de sources fiscales
          |
          +--> TAX-02 profil + périodes + applicabilité
          |
          +--> TAX-03 ingestion des documents fiscaux
                  |
                  +--> TAX-04 exécution + traces + rapprochements
                          |
                          +--> TAX-05 contrôles IS du MVP
                          |
                          +--> TAX-06 contrôles TVA du MVP
                                  |
                                  +--> TAX-07 revue + synthèse + evidence pack
                                          |
                                          +--> TAX-08 persistance/API/UI minimale
                                                  |
                                                  +--> TAX-09 durcissement MVP
```

TAX-02 et TAX-03 peuvent avancer en parallèle après TAX-01. TAX-05 et TAX-06
peuvent avancer en parallèle après TAX-04, mais TAX-06 doit aussi disposer des
versions normatives couvrant la transition TVA du 1er septembre 2026.

## TAX-01 — contrats et gouvernance des sources

### Livrables

- traduire les contrats de TAX-00 dans `lib/tax/contracts.ts` et leurs schémas ;
- introduire `TaxDomain`, `TaxOutcome`, `TaxEvidenceLevel` et
  `TaxCapabilityStatus` sans modifier `FindingFamily` ;
- créer un registre fiscal dans le plan connaissance avec périodes d'effet,
  paragraphes, millésimes, statut de vérification et empreintes ;
- définir l'extension `TaxFindingDetails` du `Finding` canonique ;
- ajouter les validateurs interdisant une règle active sans source applicable ;
- prouver par test qu'un `tax_review` n'entre jamais dans l'admissibilité FEC.

### Critères

- aucune formule fiscale ;
- contrats sérialisables et validés ;
- versions immuables ;
- migrations de données absentes à ce stade ;
- tests de séparation autorité/domaine/stage.

## TAX-02 — profil, périodes et applicabilité

**Statut au 16 août 2026 : socle canonique et persistance livrés.** Le mandat
TAX-02 exécuté a avancé les contrats de snapshots et les tables fiscales prévus
initialement dans TAX-03/TAX-08. Les adaptateurs, formules, routes et écrans
restent dans leurs étapes respectives.

### Dépendances

TAX-01 et service de dossier canonique stable.

### Livrables

- service de profil versionné et confirmation humaine ;
- périodes IS et TVA indépendantes de l'exercice comptable ;
- moteur d'applicabilité fermé : une donnée inconnue bloque au lieu de supposer ;
- prise en charge MVP : IS réel normal hors groupe et TVA CA3 standard ;
- limitations explicites pour IFRS consolidé seul, groupe, régime spécial et
  établissement stable.

### Critères

- aucune API Entreprise ;
- toute activation de règle est expliquée ;
- profil modifié => nouvelle version et nouvelle exécution requise.

## TAX-03 — ingestion et snapshots fiscaux

### Dépendances

TAX-01, ingestion privée existante et stratégie de persistance stable.

### Livrables

- classification 2065, 2058-A, 2058-B, 2572 et 3310-CA3 ;
- adaptateurs par formulaire et millésime ;
- snapshots immuables de champs avec page/zone et méthode d'extraction ;
- workflow de revue des champs OCR ou ambigus ;
- gestion des déclarations rectificatives et de la supersession ;
- migrations fiscales dédiées étendant `lib/persistence/schema.ts`.

### Critères

- aucun écrasement de source ;
- aucun champ sans provenance ;
- OCR non revu plafonné à `insufficient` ;
- document inconnu conservé mais non interprété.

## TAX-04 — exécution, traces et rapprochements

### Dépendances

TAX-01, TAX-02 et TAX-03.

### Livrables

- registre de `TaxControlDefinition` ;
- sélection par période, millésime et source ;
- `TaxControlExecution`, `TaxReconciliationLine`, `TaxAdjustment` et
  `TaxComputationSnapshot` ;
- trace typée des opérandes, unités, signes, arrondis et tolérances ;
- idempotence, rejeu et hash d'exécution ;
- états `blocked`, `not_applicable`, `executed`, `error`.

### Critères

- exécution identique sur snapshots identiques ;
- aucun score opaque dans le verdict ;
- tolérance interne étiquetée `internal` ;
- une erreur technique n'est pas un résultat fiscal.

## TAX-05 — contrôles IS du MVP

### Dépendances

TAX-04 et schémas officiels 2026 validés.

### Contrôles candidats

- `TAX-CROSS-001`, `TAX-DOC-001` ;
- `TAX-IS-001`, `TAX-IS-002`, `TAX-IS-003`.

`TAX-IS-004` et `TAX-IS-005` restent `future` jusqu'à disponibilité des historiques,
annexes et sources de calcul exhaustives.

### Critères

- comparaison sur comptes individuels seulement ;
- chaque différence restitue les deux sources ;
- aucune liquidation exhaustive revendiquée ;
- cas groupe et régime spécial bloqués explicitement.

## TAX-06 — contrôles TVA du MVP

### Dépendances

TAX-04, adaptateur CA3 et registre normatif avant/après transition CIBS.

### Contrôles candidats

- `TAX-VAT-001` ;
- `TAX-VAT-002` en mode assisté.

`TAX-VAT-003` à `TAX-VAT-005` restent `future` tant que factures, codes TVA,
ventilations et preuves de règlement ne sont pas disponibles.

### Critères

- aucune version « proche » utilisée pour une période non couverte ;
- aucun taux moyen fictif ;
- FEC + CA3 seuls ne produisent pas de conformité sur la déduction ;
- tests à la frontière du 1er septembre 2026.

## TAX-07 — revue, synthèse et evidence pack

### Dépendances

TAX-05 ou TAX-06 avec exécutions persistables.

### Livrables

- workflow `pending`, `accepted`, `rejected`, `amended` sans écraser la
  proposition ;
- `FiscalSynthesisSnapshot`, `TaxCoverage` et `TaxLimitation` ;
- règles déterministes d'ordre de présentation ;
- export des définitions, sources, entrées, traces et décisions ;
- intégration au mécanisme de preuve par hash existant.

### Critères

- aucun résumé ne masque les résultats élémentaires ;
- couverture et dénominateurs visibles ;
- preuve du contrôle distincte de la preuve de la décision humaine.

## TAX-08 — persistance, API et UI minimale

### Dépendances

TAX-07 et persistance Drizzle stabilisée.

### Livrables

- tables fiscales, repositories et routes dossier-scopées ;
- autorisation et cloisonnement de chaque objet ;
- espace fiscal minimal dans la navigation ;
- écrans de couverture, contrôle, trace, limitation et décision.

### Hors périmètre

- refonte du dashboard ;
- télétransmission ;
- paiement ;
- API Entreprise ;
- import de données externes dans le dossier.

## TAX-09 — durcissement MVP

### Dépendances

TAX-08.

### Livrables

- fixtures anonymisées multi-millésimes et déclarations rectificatives ;
- tests de mutation des formules et des sélecteurs de version ;
- tests de non-régression du nombre de constats ;
- sécurité des documents privés et séparation tenant/dossier ;
- performance, observabilité et reprise après erreur ;
- revue juridique finale des sources et formulations ;
- documentation des capacités `future` et `non_available`.

### Critères de sortie MVP

- CI verte sur lint, typecheck, tests et build ;
- aucune règle active sans source exacte ;
- aucune conclusion au-delà du niveau de preuve ;
- aucune confusion entre rejet FEC et constat fiscal ;
- rejeu bit-à-bit ou écarts expliqués par une version ;
- décision humaine conservée avec auteur, date et motif ;
- périmètre commercial aligné sur les limitations techniques.

## Risques de dépendance

| Dépendance | Risque | Gate |
| --- | --- | --- |
| Modèle canonique | Extension fiscale couplée au `Finding` | Revue TAX-01, aucune nouvelle famille |
| Registre de connaissance | Mauvaise date d'effet | Validation source + tests de frontière |
| Ingestion PDF | Extraction non fiable | Snapshot par champ + revue obligatoire |
| Persistance | Schéma demandé historiquement sous `lib/db/schema.ts`, fichier absent | Étendre le point réel `lib/persistence/schema.ts` |
| Synthèse héritée | Réemploi de l'indice d'exposition | Interdiction contractuelle comme verdict fiscal |
| UI | Pression pour afficher un statut global prématuré | TAX-08 après taxonomie et synthèse explicables |
| Sources TVA | Transition normative en 2026 | TAX-06 bloqué sans versions pré/post vérifiées |

## Condition d'arrêt permanente

Si une PR découvre qu'un contrôle dépend d'une donnée non accessible ou d'une
source non vérifiée, elle doit :

1. conserver les données déjà reçues sans les surinterpréter ;
2. produire une `TaxLimitation` ;
3. classer la capacité `future` ou `non_available` ;
4. interdire les résultats devenus indémontrables ;
5. ne proposer aucun proxy, taux, mapping ou montant fictif.

