# Tax Review — taxonomie des sorties et niveaux de preuve

## Objet

Ce document fixe le langage de sortie du moteur fiscal. Une sortie décrit le
résultat d'un contrôle dans son périmètre ; elle n'est ni une sanction, ni une
opinion fiscale globale, ni une décision de dépôt.

`FindingFamily` reste l'autorité normative de la règle. `TaxOutcome`,
`TaxEvidenceLevel`, `severity`, `TaxDomain` et `controlStage` sont des dimensions
distinctes. Tous les constats fiscaux portent `controlStage: tax_review`.

## Taxonomie normative

### `passed`

Les assertions exécutées sont satisfaites sur toutes les données couvertes.

- Exige une exécution complète et une preuve au moins `derived`.
- Interdit si un champ indispensable est absent ou si une limitation bloque la
  conclusion.
- Ne signifie pas « déclaration conforme » au-delà du contrôle exécuté.
- Peut être produit par une règle `hardLaw`, `methodology` ou `internal`.

Wording : « Aucun écart relevé par ce contrôle sur les données couvertes. »

### `confirmed_non_compliance`

Des faits établis contreviennent à une exigence officielle exacte, applicable à
l'entité et à la période.

Conditions cumulatives :

- `family: hardLaw` ;
- source officielle, version et paragraphe applicables épinglés ;
- profil, période et millésime déterminés ;
- preuve `direct` ou `corroborated` ;
- aucune limitation bloquante ;
- revue humaine requise par la définition effectuée avant restitution comme
  conclusion confirmée.

Une différence de montant, une heuristique ou l'absence d'une pièce dans PROBANT
ne suffit jamais à cette sortie.

Wording : « Non-conformité confirmée après revue au regard de [référence], pour
la période [période]. »

### `reconciliation_difference`

Deux valeurs comparables ne se rapprochent pas dans la tolérance explicitement
documentée.

- Ne désigne pas la valeur correcte.
- Peut révéler un décalage de période, une écriture non déclarative, un périmètre
  différent ou une erreur.
- Doit exposer les deux opérandes, les normalisations, la différence et la
  tolérance.
- Niveau de preuve minimal : `derived`.

Wording : « Écart de rapprochement à analyser entre [source A] et [source B]. »

### `potential_tax_risk`

Un ensemble d'indices signale une exposition fiscale plausible, sans établir une
non-conformité.

- Ne peut pas être produit par un score opaque.
- Chaque indicateur contributif est visible et sourcé.
- Requiert au moins une preuve `derived`; `insufficient` mène à `inconclusive`.
- Une règle `methodology` ou `internal` emploie normalement cette sortie.

Wording : « Risque fiscal potentiel à qualifier ; les éléments disponibles ne
permettent pas de conclure à une non-conformité. »

### `missing_information`

Une pièce, un champ ou un fait fiscal nécessaire n'est pas disponible dans le
dossier.

- Ne signifie pas que le contribuable n'a pas produit la pièce à l'administration.
- Indique précisément l'information attendue et les conclusions bloquées.
- Le niveau de preuve est généralement `insufficient`.
- Peut exister sans `Finding` si elle est uniquement une limitation de couverture.

Wording : « Information absente du dossier PROBANT : [élément]. Le contrôle
[identifiant] ne peut pas conclure. »

### `inconclusive`

Les données existent mais leur qualité, leur compatibilité, l'applicabilité de la
règle ou le millésime ne permet pas une conclusion fiable.

Cas typiques : OCR ambigu, périmètres non comparables, profil non confirmé, source
normative en transition ou document d'un millésime non pris en charge.

Wording : « Contrôle non concluant : [cause]. Une revue ou une donnée plus fiable
est nécessaire. »

### `review_recommendation`

Le moteur recommande une diligence humaine sans prétendre constater un écart ou
une non-conformité.

- La recommandation précise l'objet, le motif et les éléments à examiner.
- Elle n'impose pas une conclusion au réviseur.
- Elle convient aux contrôles qualitatifs ou non automatisables.

Wording : « Revue recommandée sur [objet] pour [motif observable]. »

## Ordre de présentation, pas ordre de vérité

Pour une synthèse, l'ordre d'attention déterministe recommandé est :

1. `confirmed_non_compliance` ;
2. `missing_information` bloquant ;
3. `reconciliation_difference` ;
4. `potential_tax_risk` ;
5. `inconclusive` ;
6. `review_recommendation` ;
7. `passed`.

Cet ordre organise l'affichage. Il ne calcule aucune gravité et ne remplace ni les
résultats élémentaires ni la décision humaine.

## Niveaux de preuve

### `direct`

La conclusion repose directement sur une donnée authentifiée du dossier, avec
localisation précise et sans transformation substantielle.

Exemples : case validée d'un snapshot 2065 ; période lue et validée sur une CA3 ;
écriture FEC conservant fichier, ligne et empreinte.

Ne sont pas directs : OCR non revu, valeur reconstituée, donnée d'une API externe,
montant inféré d'un total.

### `derived`

La valeur résulte d'une transformation déterministe de preuves directes : somme,
différence, regroupement, changement de signe ou sélection de période. La trace
complète rend le résultat reproductible.

Un résultat dérivé peut établir un écart arithmétique. Il n'établit pas à lui seul
la qualification fiscale des écritures qui le composent.

### `corroborated`

Au moins deux sources de nature suffisamment indépendante convergent et leur
périmètre est compatible. La corroboration documente les éventuels ajustements de
période ou de périmètre.

Exemple : montant déclaré sur une CA3, rapproché du sous-grand-livre TVA et de la
preuve de paiement. Plusieurs vues produites à partir du même fichier ne sont pas
des sources indépendantes.

### `insufficient`

Les éléments disponibles ne permettent pas de soutenir la conclusion envisagée.
Ce niveau impose `missing_information`, `inconclusive` ou une limitation et
interdit `passed` ainsi que `confirmed_non_compliance`.

## Règle d'agrégation de la preuve

Le niveau d'une exécution est le plus faible niveau nécessaire à sa conclusion,
plafonné par `TaxControlDefinition.maximumEvidenceLevel` et par la fiabilité de
l'extraction. Il n'est jamais obtenu par moyenne.

```text
preuve des entrées
  -> transformations tracées
  -> limites du contrôle
  -> plafond défini
  -> niveau réellement atteint
```

Une validation humaine ne transforme pas une donnée absente en preuve. Elle peut
valider une transcription directe ou confirmer une qualification sur la base de
pièces identifiées.

## Compatibilité résultat / preuve

| Résultat | Minimum | Conditions supplémentaires |
| --- | --- | --- |
| `passed` | `derived` | Couverture complète du contrôle, aucune limitation bloquante |
| `confirmed_non_compliance` | `direct` ou `corroborated` | `hardLaw`, source applicable, revue humaine |
| `reconciliation_difference` | `derived` | Deux opérandes comparables et trace de différence |
| `potential_tax_risk` | `derived` | Indices explicites ; jamais score seul |
| `missing_information` | `insufficient` | Élément manquant précisément identifié |
| `inconclusive` | `insufficient` ou preuve contradictoire | Cause et conclusion bloquée explicites |
| `review_recommendation` | Tout niveau | Motif observable et diligence proposée |

## Mapping vers le modèle canonique

Un résultat fiscal est attaché à un `Finding` existant via `TaxFindingDetails`.

```text
Finding.family          = autorité de la règle
Finding.controlStage    = tax_review
Finding.severity        = priorité opérationnelle
TaxFindingDetails.domain = impôt / domaine fiscal
TaxFindingDetails.outcome = résultat du contrôle
TaxFindingDetails.evidenceLevel = solidité de la preuve
ReviewEvent             = décision humaine, séparée de la proposition
```

Le `splitAdmissibilite` continue donc d'exclure ces constats de l'admissibilité du
FEC, quelle que soit leur famille ou leur sévérité.

## Interdictions de wording

Le moteur n'emploie pas « fraude », « redressement certain », « déclaration
conforme », « impôt définitif » ou « FEC rejeté » sans une capacité et une preuve
qui le justifient. Il distingue toujours :

- pièce absente de PROBANT et pièce non déposée à l'administration ;
- différence et erreur ;
- proposition et décision ;
- estimation et calcul ;
- contrôle passé et conformité globale.


