# ADR-009 — frontière du Tax Review Engine

## Statut

Accepté par TAX-00 le 16 août 2026.

## Contexte

PROBANT dispose d'un modèle canonique de dossier, d'un moteur de règles surtout
orienté FEC, d'une synthèse, d'événements de revue et d'empreintes de preuve. Un
moteur fiscal exige cependant plusieurs déclarations, des périodes propres à
chaque impôt, des millésimes de formulaires, des données comptables et des sources
normatives versionnées.

Étendre directement le runner FEC confondrait admissibilité technique,
comptabilité et revue fiscale. Créer une nouvelle famille `tax` confondrait le
domaine traité avec l'autorité de la règle.

## Décision

Créer à terme un bounded context `lib/tax` qui :

- consomme les snapshots du dossier par référence immuable ;
- conserve `FindingFamily` comme autorité (`hardLaw`, `methodology`, `internal`) ;
- ajoute `TaxDomain` comme dimension séparée ;
- émet des `Finding` génériques enrichis par `TaxFindingDetails` ;
- assigne tous ses constats à `controlStage: tax_review` ;
- utilise son propre orchestrateur multi-document et périodé ;
- conserve calculs, rapprochements, limitations et décisions sous forme de
  snapshots rejouables ;
- référence le plan connaissance externe sans copier ses valeurs dans les données
  déclarées du dossier ;
- expose sa synthèse à la synthèse générale sans réutiliser un score opaque comme
  verdict.

La frontière exclut :

- rejet d'admissibilité du FEC ;
- tenue ou correction automatique de la comptabilité ;
- modification d'une déclaration source ;
- télétransmission, paiement ou représentation du contribuable ;
- dépendance à l'API Entreprise pour le MVP ;
- détermination du résultat fiscal français à partir de seuls comptes IFRS
  consolidés.

## Données et dépendances

Le moteur dossier fournit : profil confirmé, périodes, snapshots de documents,
écritures et décisions humaines. Le plan connaissance fournit : sources officielles,
schémas de formulaires et définitions de contrôles versionnés.

Une exécution fiscale stocke seulement les identifiants et empreintes nécessaires
au rejeu. Une donnée externe enrichie, si elle existe un jour, possède un snapshot
séparé, une provenance et une politique d'expiration ; elle ne devient jamais un
fait fiscal confirmé sans décision explicite.

## Options rejetées

### Ajouter les contrôles au runner FEC

Rejeté : son contexte est mono-FEC et son cycle d'exécution ne représente ni les
périodes TVA, ni les déclarations rectificatives, ni les snapshots multi-documents.

### Ajouter `tax` à `FindingFamily`

Rejeté : « fiscal » décrit le domaine, pas l'autorité. Une règle fiscale peut être
une obligation légale, une méthodologie de rapprochement ou une politique interne.

### Stocker le verdict dans la synthèse générale

Rejeté : la synthèse existante contient un indice d'exposition hérité. Un verdict
fiscal doit rester explicite, traçable et rattaché à des contrôles élémentaires.

### Enrichir automatiquement le profil via l'API Entreprise

Rejeté pour le MVP : disponibilité, fraîcheur, périmètre des données et dépendance
externe incompatibles avec le fonctionnement minimal. Le profil repose sur des
faits du dossier confirmés.

## Conséquences

- nouveaux contrats et nouvelles tables fiscales seront nécessaires ;
- les services génériques de preuve et de revue sont réutilisés par composition ;
- le dashboard n'est modifié qu'après disponibilité des services fiscaux ;
- les contrôles FEC existants ne sont pas dupliqués ;
- toute capacité hors périmètre produit une limitation explicite ;
- la maintenance exige un registre des sources et millésimes indépendant du code
  d'interface.

## Garde-fous testables

- un constat fiscal bloquant et `hardLaw` reste hors admissibilité FEC ;
- une règle `internal` peut appartenir au domaine fiscal sans changer de famille ;
- une synthèse sans données suffisantes ne peut produire `passed` global ;
- un dossier composé uniquement de comptes IFRS consolidés bloque les contrôles de
  résultat fiscal ;
- le MVP fonctionne sans appel à l'API Entreprise.


