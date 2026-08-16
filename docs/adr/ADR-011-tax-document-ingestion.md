# ADR-011 — ingestion des documents fiscaux

## Statut

Accepté par TAX-00 le 16 août 2026.

## Contexte

Le pipeline actuel sait recevoir des fichiers privés et reconnaît principalement
FEC, balance et PDF générique. Un moteur fiscal doit distinguer document logique,
fichier source, déclaration rectificative, millésime, champs extraits et validation
humaine. Un PDF peut être structuré, contenir une couche texte, être scanné ou
avoir été aplati ; l'extraction ne peut donc pas être tenue pour vraie par défaut.

## Décision

Chaque document fiscal suit le pipeline suivant :

```text
réception privée + hash
  -> classification type / millésime
  -> contrôle entité / période
  -> adaptateur exact du formulaire
  -> extraction champ par champ
  -> validation du schéma et des reports
  -> revue humaine des ambiguïtés
  -> TaxDocumentSnapshot immuable activé
```

Le fichier original reste dans le stockage privé existant. `TaxDocument` représente
la pièce logique et `TaxDocumentSnapshot` une version immuable de son contenu
interprété. Une rectificative crée un nouveau document ou snapshot relié par
supersession ; elle n'écrase jamais la version déposée auparavant.

## Documents ciblés

Le premier périmètre d'adaptateurs comprend :

- 2065-SD ;
- 2058-A-SD ;
- 2058-B-SD ;
- 2572-SD ;
- 3310-CA3-SD ;
- FEC, balance et comptes individuels par référence aux snapshots existants.

Les annexes de crédits d'impôt, liasses d'intégration fiscale, régimes simplifiés,
groupes TVA et formulaires sectoriels sont `future`. Ils sont conservés comme
documents non interprétés s'ils sont reçus.

## Méthodes d'extraction et preuve

| Méthode | Traitement | Plafond avant revue |
| --- | --- | --- |
| Donnée structurée dont le schéma et le millésime sont validés | Conserver chemin, valeur brute et schéma | `direct` |
| Couche texte PDF avec ancrage fiable sur une case | Conserver page, zone et texte | `derived` tant que non validé |
| OCR | Conserver image/zone, texte, moteur et confiance technique | `insufficient` |
| Saisie manuelle depuis la pièce | Exiger page/case, auteur et confirmation | `direct` après double contrôle prévu par la politique |

La confiance OCR est un signal technique, jamais un verdict fiscal. Les champs
nécessaires à un contrôle et non validés produisent `inconclusive` ou
`missing_information`.

## Contrat minimal d'un champ

Chaque champ extrait conserve : code de case, libellé du millésime, valeur brute,
valeur normalisée, type, devise/unité, signe, page et zone ou chemin structuré,
méthode, version de parseur, avertissements et statut de revue.

Une normalisation ne perd jamais la valeur brute. Les montants sont stockés dans
une unité exacte documentée ; aucune conversion ou règle d'arrondi implicite n'est
autorisée.

## Classification et erreurs

- Type ou millésime incertain : document conservé, statut `review_required`.
- Adaptateur absent : capacité `future`, aucune extraction générique utilisée pour
  un calcul.
- Identité ou période discordante : `TAX-CROSS-001`, sans rattachement automatique
  à une autre entité.
- Fichier illisible ou chiffré : erreur technique et `TaxLimitation`, pas résultat
  fiscal.
- Cases indispensables vides : distinction entre case réellement vide, extraction
  impossible et champ non applicable.
- Déclaration rectificative : relation de supersession confirmée par une personne.

## Séparation dossier / externe

Les formulaires vierges, notices, textes et schémas d'adaptation appartiennent au
plan connaissance. Les déclarations remplies et justificatifs appartiennent au
dossier privé. Un adaptateur référence le schéma officiel par version ; il ne copie
pas de données de référence dans la déclaration et ne mélange jamais un résultat
d'API externe avec une case déposée.

## Options rejetées

### Utiliser le texte PDF comme source de vérité

Rejeté : l'ordre de lecture et l'association libellé/case sont souvent ambigus.

### Écraser le snapshot courant lors d'une rectificative

Rejeté : empêche de comprendre les résultats antérieurs et la décision humaine.

### Accepter n'importe quel millésime avec un mapping générique

Rejeté : codes, libellés et reports changent. Un adaptateur exact est requis.

### Déduire les cases absentes du FEC

Rejeté : le FEC n'encode pas toutes les qualifications, options et ventilations
fiscales d'une déclaration.

## Conséquences

- un schéma de snapshots et une file de revue de champs sont nécessaires ;
- les contrôles peuvent être bloqués à un niveau fin sans perdre le document ;
- l'ingestion demande davantage de stockage, mais permet le rejeu et l'evidence
  pack ;
- le MVP peut commencer par des données structurées et de la saisie contrôlée ;
- aucun contournement fictif n'est proposé pour les formulaires non pris en charge.

## Garde-fous testables

- fichier identique => même hash source ;
- correction d'un champ => nouveau snapshot, ancien inchangé ;
- OCR non revu ne permet ni `passed` ni `confirmed_non_compliance` ;
- adaptateur absent => limitation, jamais mapping d'un autre millésime ;
- un document d'un autre dossier ou d'une autre entité ne peut être consommé ;
- les données externes ne figurent pas dans `TaxDocumentSnapshot.fields`.


