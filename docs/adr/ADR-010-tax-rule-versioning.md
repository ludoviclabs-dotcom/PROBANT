# ADR-010 — versionnement des règles fiscales

## Statut

Accepté par TAX-00 le 16 août 2026.

## Contexte

Une règle fiscale dépend simultanément du texte applicable, de la date de
l'opération ou de la période, du millésime du formulaire et parfois d'une doctrine
publiée ultérieurement. Remplacer silencieusement une formule ou sélectionner la
« dernière règle » rendrait une exécution impossible à reproduire.

La transition de plusieurs dispositions TVA vers le code des impositions sur les
biens et services à compter du 1er septembre 2026 illustre le besoin de gérer des
frontières infra-annuelles.

## Décision

Une `TaxControlDefinition` publiée est immuable. Une exécution épingle le tuple :

```text
controlId
controlVersion
definitionHash
taxPeriod.startDate / endDate
taxYear
formYear
sourceVersionIds + paragraphes
applicabilityPolicyVersion
calculationPolicyVersion
engineVersion
```

La sélection s'effectue en deux temps :

1. déterminer, à partir d'un profil confirmé, la date fiscale pertinente et le
   formulaire effectivement utilisé ;
2. sélectionner une définition dont toutes les fenêtres d'effet et tous les
   millésimes couvrent ces faits.

Zéro ou plusieurs candidats est une erreur de configuration produisant
`inconclusive` et une limitation. Le moteur ne choisit jamais la version la plus
proche.

## Versions de définition et de source

- Tout changement d'applicabilité, d'entrée, de formule, d'arrondi, de tolérance,
  de sortie autorisée ou de niveau de preuve crée une nouvelle version de contrôle.
- Une correction de wording sans effet sémantique crée aussi un nouvel artefact et
  un nouveau hash, mais peut conserver une version de calcul identique.
- Un formulaire dispose d'une version distincte du texte de droit. Un nouveau
  millésime ne modifie pas rétroactivement les snapshots antérieurs.
- Une source stocke autorité, URI officielle, identifiant juridique, paragraphes,
  date de publication, période d'effet, date de consultation, statut et empreinte.
- Une source abrogée reste disponible pour rejouer les périodes où elle était
  applicable.
- Une source en `review_required`, remplacée sans table de correspondance validée
  ou inaccessible interdit l'activation de la règle dépendante.

## Rejeu et nouvelle analyse

Une exécution historique est toujours restituée avec son tuple original. Une
nouvelle source ou règle ne la réécrit pas. Le système peut créer une nouvelle
exécution et indiquer pourquoi elle diffère :

- nouveau document ou rectificatif ;
- profil ou période corrigé ;
- nouvelle version normative ;
- nouvel adaptateur de formulaire ;
- correction d'algorithme ;
- décision humaine modifiée.

Les deux exécutions restent auditables.

## Politique de dates

La règle définit explicitement sa `dateBasis` : date de clôture, date d'opération,
date d'exigibilité, période déclarative, date de dépôt ou autre événement officiel.
Le moteur n'utilise pas systématiquement la date d'exécution.

Les dates sont stockées au format civil pertinent et les horodatages en UTC. Une
échéance légale ne doit pas être recalculée sans calendrier et texte applicables.

## Options rejetées

### Toujours utiliser la dernière règle

Rejeté : produit des conclusions anachroniques et rend le rejeu impossible.

### Versionner seulement le code

Rejeté : formulaire, source, applicabilité et politique d'arrondi peuvent évoluer
indépendamment du binaire.

### Modifier les exécutions historiques après correction

Rejeté : détruit la piste d'audit. Une correction déclenche une nouvelle exécution.

### Déduire le millésime de l'année de dépôt

Rejeté : déclarations tardives, rectificatives ou exercices décalés rendent cette
inférence non fiable. Le millésime lu ou confirmé est requis.

## Conséquences

- le registre doit autoriser plusieurs versions actives pour des périodes
  disjointes ;
- les fixtures doivent couvrir les dates frontières ;
- la maintenance normative devient une fonction explicite du produit ;
- le stockage augmente, mais l'audit et la comparaison avant/après sont possibles ;
- toute capacité sans version applicable est `non_available` pour cette période.

## Garde-fous testables

- changement d'une source ou formule => hash différent ;
- même tuple et mêmes entrées => même trace et mêmes sorties ;
- périodes avant et après le 1er septembre 2026 ne partagent une règle TVA que si
  la source vérifiée le permet explicitement ;
- une exécution historique reste lisible après abrogation de sa source ;
- aucun fallback automatique vers un autre millésime.


