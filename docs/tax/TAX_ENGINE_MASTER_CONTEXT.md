# PROBANT Tax Review Engine — contexte maître

## Statut et portée

TAX-00 est une décision d'architecture documentaire arrêtée au 16 août 2026.
Elle ne livre ni calcul fiscal, ni contrôle fiscal exécutable, ni dépôt de
déclaration. Elle définit le futur domaine `tax-review` et ses contrats.

TAX-02 traduit désormais ces contrats dans `lib/canonical-model/tax.ts` et
`lib/tax`, puis les persiste par artefacts immuables dans la migration `0002`.
Cette traduction reste un socle de données : elle n'implémente aucune formule IS
ou TVA et ne change pas le verdict des contrôles existants.

Le moteur a vocation à vérifier des données, exécuter des calculs explicables,
rapprocher plusieurs déclarations ou sources comptables, relever les informations
manquantes et proposer une analyse. La qualification définitive demeure une
décision humaine journalisée.

Le MVP est limité aux dossiers d'entités françaises individuelles soumises à
l'impôt sur les sociétés et, lorsqu'elles relèvent du réel normal, à leurs
déclarations de TVA CA3. Les groupes fiscalement intégrés, établissements stables,
régimes sectoriels ou territoriaux particuliers, groupes TVA, proratas complexes,
comptes consolidés seuls et déclarations sans millésime pris en charge sont
`future` ou `non_available`.

## Principes non négociables

1. `FindingFamily` (`hardLaw`, `methodology`, `internal`) reste l'autorité de la
   règle. `TaxDomain` est une dimension orthogonale, jamais une nouvelle famille.
2. Tout contrôle fiscal relève de `controlStage: tax_review`. Il ne peut pas rendre
   un FEC techniquement inadmissible.
3. Une sévérité, une probabilité ou un score ne constitue jamais un verdict.
4. Chaque valeur dérivée conserve ses entrées, sa formule ou son opérateur, ses
   arrondis, son unité, sa version et ses références de preuve.
5. Une exécution épingle une période fiscale, un millésime de formulaire, une
   version immuable de règle et chaque version de source normative utilisée.
6. Les données du dossier et les données externes vivent dans deux plans séparés.
   Un résultat externe n'est jamais recopié comme donnée déclarée par l'entreprise.
7. L'API Entreprise n'est ni requise ni appelée par le MVP.
8. Des comptes IFRS consolidés, sans comptes individuels de l'entité française et
   sans liasse fiscale, ne permettent pas de déterminer son résultat fiscal.
9. Une pièce ou un champ absent produit `missing_information`, `inconclusive` ou
   une limitation ; jamais une valeur supposée.
10. Le moteur propose. Une personne accepte, rejette ou amende un ajustement et
    motive sa décision. Les documents déposés restent immuables.

## Position dans l'architecture cible

```text
Plan dossier privé                 Plan connaissance externe
------------------                 --------------------------
FEC / balance / comptes            textes officiels versionnés
2065 / liasse / 2572               formulaires et notices
CA3 / justificatifs                tables de millésime
          |                                  |
          v                                  v
TaxDocumentSnapshot ----> sélection de TaxControlDefinition
          |                                  |
          +----------> TaxControlExecution <-+
                              |
                 traces / rapprochements / propositions
                              |
                         Finding générique
                       + TaxFindingDetails
                              |
                  décision humaine immuable
                              |
                   FiscalSynthesisSnapshot
```

Le domaine consomme des identifiants et des snapshots immuables. Il ne modifie ni
le `DossierSnapshot`, ni les écritures, ni une déclaration source. La synthèse
fiscale peut être référencée par la synthèse générale, mais conserve son propre
contrat de couverture et de limitation.

## Vocabulaire commun

```ts
type TaxDomain =
  | "corporate_income_tax"
  | "vat"
  | "tax_group"
  | "local_business_tax"
  | "payroll_tax"
  | "withholding_tax"
  | "tax_credit"
  | "cross_tax";

type TaxOutcome =
  | "passed"
  | "confirmed_non_compliance"
  | "reconciliation_difference"
  | "potential_tax_risk"
  | "missing_information"
  | "inconclusive"
  | "review_recommendation";

type TaxEvidenceLevel =
  | "direct"
  | "derived"
  | "corroborated"
  | "insufficient";

type TaxCapabilityStatus = "available" | "future" | "non_available";
type TaxAutomation = "automatic" | "assisted" | "manual" | "unavailable";
```

Les définitions ci-dessous restent l'autorité documentaire. Leur traduction
TypeScript et leur première persistance sont livrées par TAX-02 ; services de
calcul, adaptateurs de formulaires et orchestration restent des PR ultérieures.

## Contrats du domaine

### `TaxProfile`

Décrit les faits fiscaux confirmés pour une entité, sans les déduire silencieusement
d'une source externe.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId` | Identité stable et rattachement au dossier |
| `jurisdiction` | `FR` dans le MVP |
| `entityTaxResidence`, `individualAccountsStandard` | Résidence et référentiel des comptes individuels |
| `corporateIncomeTaxRegime`, `vatRegime` | Régimes déclarés, avec `unknown` autorisé |
| `taxGroupStatus`, `vatGroupStatus` | `none`, `member`, `parent` ou `unknown` |
| `activityFlags` | Secteur réglementé, exonérations, établissement stable, etc. |
| `facts[]` | Valeur, provenance dossier, période d'effet et statut de confirmation |
| `status` | `draft`, `confirmed`, `superseded` |
| `confirmedBy`, `confirmedAt` | Décision humaine |
| `version`, `contentHash` | Immutabilité et répétabilité |

Un fait non confirmé ne peut activer un contrôle dont l'applicabilité dépend de ce
fait. Il produit une limitation ou une demande d'information.

### `TaxPeriod`

Délimite une obligation fiscale indépendamment de l'exercice comptable.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId` | Identité et propriétaire |
| `taxDomain`, `taxKind` | Domaine et impôt visé |
| `startDate`, `endDate` | Période couverte |
| `taxYear` | Année fiscale de référence |
| `formYear` | Millésime du formulaire effectivement déposé |
| `frequency` | `annual`, `quarterly`, `monthly`, `event_based` |
| `accountingPeriodId` | Exercice rapproché, s'il existe |
| `status` | `open`, `filed`, `amended`, `closed`, `unknown` |
| `sourceRefs[]` | Origine des dates et du millésime |

Une échéance calculée est une donnée dérivée avec trace ; elle n'est pas un champ
de confiance saisi sans origine.

### `TaxDocument`

Représente la pièce logique et son historique, non son contenu courant mutable.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId` | Identité et cloisonnement |
| `taxPeriodId` | Période fiscale concernée |
| `documentType` | Par exemple `form_2065`, `form_2058_a`, `form_2058_b`, `form_2572`, `form_3310_ca3` |
| `sourceDocumentId` | Référence au document source privé |
| `currentSnapshotId` | Snapshot activé après validation |
| `status` | `received`, `classified`, `review_required`, `active`, `superseded`, `rejected` |
| `supersedesDocumentId` | Lien vers une déclaration remplacée ou rectificative |

### `TaxDocumentSnapshot`

Capture immuable du contenu extrait ou saisi et de sa lignée de preuve.

| Champ | Sens |
| --- | --- |
| `id`, `taxDocumentId`, `snapshotVersion` | Identité immuable |
| `sourceHash`, `snapshotHash` | Empreintes du fichier et du contenu normalisé |
| `documentType`, `formYear`, `schemaVersion` | Adaptateur exact utilisé |
| `parserName`, `parserVersion` | Reproductibilité de l'extraction |
| `fields[]` | Code de case, valeur brute, valeur normalisée, unité et provenance page/zone/cellule |
| `extractionMethod` | `structured`, `text_layer`, `ocr`, `manual` |
| `fieldReviewStatus` | État de validation humaine par champ |
| `entityIdentifiers`, `period` | Identité et dates lues dans le document |
| `warnings[]`, `limitations[]` | Ambiguïtés et champs non accessibles |
| `createdAt`, `createdBy` | Traçabilité |

L'OCR seul ne confère pas le niveau `direct`. Une transcription humaine peut être
directe seulement si la case et la page du document source sont référencées et la
valeur explicitement validée.

### `TaxControlDefinition`

Décrit une règle versionnée, son applicabilité et ses résultats autorisés.

| Champ | Sens |
| --- | --- |
| `controlId`, `version`, `definitionHash` | Identité immuable |
| `title`, `purpose`, `domain` | Sens métier et dimension fiscale |
| `family` | `FindingFamily`, seule autorité de la règle |
| `controlStage` | Toujours `tax_review` |
| `applicability` | Expression déclarative sur profil, période et millésime |
| `effectiveFrom`, `effectiveTo`, `taxYears`, `formYears` | Fenêtre d'application |
| `sourceVersionIds[]` | Sources officielles épinglées, paragraphes inclus |
| `requiredDocuments[]`, `requiredFields[]` | Préconditions observables |
| `automation`, `maximumEvidenceLevel` | Capacité et plafond de preuve |
| `allowedOutcomes[]` | Sorties juridiquement admissibles |
| `traceSpecification` | Entrées, opérateurs, unités, arrondis et tolérances attendus |
| `capabilityStatus`, `limitations[]` | `available`, `future` ou `non_available` |
| `reviewPolicy` | Cas imposant une décision humaine |

Une source retirée ou un millésime inconnu rend la définition inéligible ; le
moteur ne sélectionne pas « la règle la plus proche ».

### `TaxControlExecution`

Matérialise une exécution rejouable et ses propositions.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId`, `taxPeriodId` | Portée |
| `controlId`, `controlVersion`, `definitionHash` | Définition exacte |
| `taxProfileVersion`, `taxDocumentSnapshotIds[]` | Entrées fiscales épinglées |
| `ledgerSnapshotId`, `inputHashes[]` | Entrées comptables et empreintes |
| `status` | `not_applicable`, `blocked`, `executed`, `error` |
| `proposedOutcome` | Proposition déterministe du moteur |
| `evidenceLevel` | Niveau réellement atteint, jamais supérieur au plafond |
| `trace[]` | Étapes typées et ordonnées |
| `reconciliationLineIds[]`, `adjustmentIds[]` | Détails produits |
| `findingIds[]`, `coverage`, `limitations[]` | Restitution et périmètre |
| `executedAt`, `engineVersion`, `executionHash` | Audit et rejeu |

La décision humaine n'écrase pas `proposedOutcome`. Elle est portée par un
événement de revue séparé ; une vue peut exposer le dernier état décidé.

### `TaxReconciliationLine`

Compare deux valeurs sans conclure au bien-fondé fiscal de l'une ou de l'autre.

| Champ | Sens |
| --- | --- |
| `id`, `executionId`, `label` | Identité et contexte |
| `leftOperand`, `rightOperand` | Valeur, unité et référence exacte vers chaque snapshot |
| `normalizations[]` | Changements de signe, période, unité ou reclassement |
| `difference` | Écart calculé, avec trace |
| `tolerance` | Montant, devise, motif, famille et source de la tolérance |
| `status` | `matched`, `different`, `not_comparable`, `missing_operand` |
| `evidenceRefs[]`, `traceStepIds[]` | Lignée de preuve |

Une tolérance interne reste `internal`; elle ne devient pas une tolérance légale.

### `TaxAdjustment`

Porte une proposition de correction fiscale sans altérer une déclaration.

| Champ | Sens |
| --- | --- |
| `id`, `executionId`, `taxPeriodId`, `domain` | Portée |
| `adjustmentCode`, `label`, `direction` | Nature et effet proposé |
| `baseAmount`, `taxAmount`, `currency` | Montants documentés, si calculables |
| `originRefs[]`, `sourceVersionIds[]`, `trace[]` | Origine et justification |
| `proposalStatus` | `proposed`, `withdrawn` |
| `reviewStatus` | `pending`, `accepted`, `rejected`, `amended` |
| `reviewEventId` | Décision, auteur, date et motif |
| `supersedesAdjustmentId` | Historique d'amendement |

Le MVP peut proposer un rapprochement ou une revue sans proposer de montant
d'ajustement lorsqu'une qualification fiscale manque.

### `TaxComputationSnapshot`

Fige un calcul fiscal explicable à une date, en distinguant proposition et décision.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId`, `taxPeriodId`, `domain` | Portée |
| `calculationType`, `calculationVersion` | Nature et version du calcul |
| `inputSnapshotIds[]`, `sourceVersionIds[]` | Entrées et droit applicable |
| `proposedAdjustmentIds[]`, `acceptedAdjustmentIds[]` | Deux plans explicitement séparés |
| `outputs[]` | Montant, unité, sémantique et statut `declared`, `computed`, `reviewed` |
| `trace[]` | Graphe ou séquence complète des calculs |
| `coverage`, `limitations[]`, `evidenceLevel` | Portée réelle |
| `createdAt`, `createdBy`, `snapshotHash` | Audit |

Ce snapshot n'est ni une déclaration, ni une télétransmission, ni un avis juridique.

### `FiscalSynthesisSnapshot`

Agrège sans masquer les résultats élémentaires.

| Champ | Sens |
| --- | --- |
| `id`, `dossierId`, `entityId`, `periodIds[]` | Portée |
| `executionIds[]`, `computationSnapshotIds[]` | Sources de la synthèse |
| `outcomeCounts` | Comptage par taxonomie, sans pondération opaque |
| `coverage` | Couverture calculée et dénominateurs visibles |
| `limitations[]` | Obstacles et périmètre exclu |
| `reviewSummary` | Décisions en attente, acceptées, rejetées ou amendées |
| `headlineStatus` | Résumé déterministe, accompagné de sa règle de priorité |
| `trace[]`, `snapshotHash`, `generatedAt` | Explicabilité et immutabilité |

Un éventuel indicateur numérique est purement descriptif et ne peut ni produire,
ni modifier `headlineStatus` ou un `TaxOutcome`.

### `TaxFindingDetails`

Extension typée attachée à un `Finding` générique ; elle ne remplace pas le modèle
canonique et ne modifie pas sa `family`.

| Champ | Sens |
| --- | --- |
| `findingId`, `executionId`, `domain`, `taxPeriodId` | Rattachement |
| `outcome`, `evidenceLevel` | Qualification fiscale et preuve |
| `controlId`, `controlVersion` | Règle exacte |
| `documentSnapshotIds[]`, `sourceVersionIds[]` | Pièces et droit |
| `reconciliationLineIds[]`, `adjustmentIds[]` | Détails structurés |
| `taxImpactStatus` | `not_computed`, `estimated`, `computed`, `reviewed` |
| `limitationIds[]`, `requiredReview` | Prudence et workflow humain |

`confirmed_non_compliance` requiert une norme applicable, des faits directs ou
corroborés, l'absence de limitation bloquante et la validation humaine prévue par
la politique du contrôle.

### `TaxCoverage`

Rend visible ce qui a réellement été contrôlé.

| Champ | Sens |
| --- | --- |
| `applicableControlCount`, `executedControlCount`, `blockedControlCount` | Couverture des contrôles |
| `requiredDocumentCount`, `availableDocumentCount` | Couverture documentaire |
| `requiredFieldCount`, `usableFieldCount`, `verifiedFieldCount` | Couverture des champs |
| `coveredPeriods[]`, `uncoveredPeriods[]` | Couverture temporelle |
| `excludedScopes[]` | Domaines ou régimes hors périmètre |
| `calculationMethod`, `trace[]` | Dénominateurs et calcul visibles |

Une couverture élevée ne signifie pas conformité ; une couverture faible interdit
une conclusion globale positive.

### `TaxLimitation`

Décrit une impossibilité sans inventer de donnée.

| Champ | Sens |
| --- | --- |
| `id`, `code`, `scope` | Identité et niveau document/champ/contrôle/période/synthèse |
| `capabilityStatus` | `available`, `future`, `non_available` |
| `reason` | `missing_document`, `missing_field`, `unsupported_millesime`, `unsupported_regime`, `unverified_source`, `low_extraction_confidence`, `external_data_unavailable`, etc. |
| `message` | Formulation utilisateur factuelle |
| `blockedOutcomes[]` | Conclusions interdites |
| `requiredInputs[]` | Données nécessaires, sans contournement fictif |
| `sourceRefs[]`, `relatedIds[]` | Justification et objets concernés |
| `resolvability` | `user_can_supply`, `human_review`, `future_engine`, `not_resolvable` |

## États d'exécution et décision humaine

```text
applicabilité inconnue -> blocked + missing_information
non applicable         -> not_applicable (hors dénominateur exécuté)
applicable + entrées    -> executed + proposition du moteur
proposition             -> revue humaine pending
revue                   -> accepted / rejected / amended avec motif
nouvelle pièce          -> nouveau snapshot et nouvelle exécution, jamais écrasement
```

`passed` signifie uniquement que les assertions testées par cette version de
contrôle n'ont révélé aucun écart sur les données couvertes. Ce résultat ne vaut
pas validation de la déclaration dans son ensemble.

## Sources officielles de cadrage

Les contrôles détaillés dans le catalogue utilisent uniquement des sources
officielles :

- CGI, art. 53 A : obligation annuelle permettant de déterminer et contrôler le
  résultat imposable ;
- CGI, art. 209, I : détermination du bénéfice imposable à l'IS et traitement des
  déficits ;
- CGI, art. 223 : obligations déclaratives des personnes morales soumises à l'IS ;
- formulaires DGFiP 2065-SD, liasse 2050 à 2059-G et 2572-SD, millésime 2026 ;
- CGI, art. 269, 271 et 287 et formulaire DGFiP 3310-CA3-SD pour les périodes où
  ces références sont applicables ;
- BOI-TVA-DED-40-20 pour les conditions temporelles de déduction.

La recodification de la TVA dans le code des impositions sur les biens et services
à compter du 1er septembre 2026 impose des versions de sources et de règles
distinctes. Aucune règle TVA postérieure à cette date ne sera activée avant
vérification des nouveaux articles applicables.

## Écart avec l'existant

| Existant | Écart à traiter |
| --- | --- |
| `FindingFamily` et `controlStage` sont déjà séparés | Ajouter `TaxDomain` et `TaxFindingDetails`, sans nouvelle famille |
| Le runner est synchrone et centré sur `ParsedFec` | Créer un orchestrateur fiscal multi-document, périodé et rejouable |
| Les sources figurent surtout dans les constats | Épingler sources, périodes d'effet et millésimes dans la définition et l'exécution |
| Le modèle canonique possède preuves, revue et contexte de calcul | Réutiliser les principes, puis typer les opérandes, unités, arrondis et lignées fiscales |
| L'ingestion reconnaît surtout FEC, balance et PDF générique | Ajouter classification par formulaire/millésime et snapshots de champs |
| La persistance contient exécutions, constats et synthèses génériques | Ajouter tables fiscales versionnées et relations vers les snapshots existants |
| La synthèse expose encore un indice d'exposition hérité | Ne jamais l'utiliser comme verdict fiscal ; conserver les issues explicites |
| `calculationContext.taxEffectCents` est générique | Le remplacer à terme par outputs fiscaux tracés et qualifiés |
| `lib/db/schema.ts` n'existe pas | S'appuyer sur `lib/persistence/schema.ts` et les migrations Drizzle, puis étendre ce point unique |
| La barre latérale n'a pas d'espace fiscal | Prévoir une entrée future après les services ; aucune refonte de dashboard dans TAX-00 |

## Fichiers futurs proposés

```text
lib/tax/
  contracts.ts
  schemas.ts
  domains.ts
  profile-service.ts
  period-service.ts
  document-types.ts
  document-snapshot-service.ts
  control-registry.ts
  applicability.ts
  execution-service.ts
  reconciliation-service.ts
  computation-trace.ts
  synthesis-service.ts
  review-policy.ts
  controls/is/
  controls/vat/
lib/persistence/tax-schema.ts
lib/ingestion/tax/
  classifier.ts
  adapters/
data/tax/source-versions/
data/tax/form-schemas/
app/api/dossiers/[dossierId]/tax/
```

Ces chemins sont une cible, pas des fichiers créés par TAX-00.

## Risques structurants

| Risque | Réponse d'architecture |
| --- | --- |
| Confondre écart et infraction | Taxonomie séparée et conditions strictes de `confirmed_non_compliance` |
| Utiliser une règle d'un mauvais millésime | Sélection fermée par période, formulaire et source versionnée |
| Halluciner une donnée fiscale absente | `TaxLimitation`, état `blocked`, aucune valeur par défaut |
| OCR erroné présenté comme preuve | Provenance par champ, plafond de preuve et validation humaine |
| Calcul impossible à reproduire | Snapshots immuables, hashes et trace complète |
| Écraser une décision humaine | Proposition et décision stockées séparément |
| Mélanger données externes et dossier | Identifiants de référence entre deux plans, sans copie implicite |
| Sur-promettre à partir du FEC | Contrôles de rapprochement seulement lorsque les déclarations et faits fiscaux manquent |
| Migration TVA 2026 | Versions avant/après le 1er septembre et blocage si source non vérifiée |

## Critères du MVP

Le MVP est atteint lorsque :

- le profil fiscal et les périodes sont confirmés et versionnés ;
- les snapshots FEC, 2065, 2058-A, 2058-B, 2572 et toutes les CA3 de la période
  peuvent être référencés sans écrasement ;
- chaque contrôle éligible épingle définition, millésime, sources et entrées ;
- chaque calcul et rapprochement produit une trace rejouable ;
- toutes les sorties utilisent la taxonomie officielle du présent dossier ;
- les pièces ou champs manquants bloquent les conclusions qu'ils empêchent ;
- aucun constat fiscal n'altère l'admissibilité technique du FEC ;
- une décision humaine motivée peut accepter, rejeter ou amender une proposition ;
- la synthèse montre couverture, limitations et décisions en attente sans score
  opaque ;
- l'API Entreprise, les groupes fiscaux, les comptes IFRS consolidés seuls et les
  régimes non pris en charge ne sont pas nécessaires au fonctionnement ;
- aucune télétransmission, liquidation exhaustive ou certification de conformité
  n'est revendiquée.

