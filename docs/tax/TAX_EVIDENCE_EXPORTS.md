# TAX-09 — preuve, revue et exports fiscaux

## Portée

Le paquet fiscal relie les sorties des moteurs IS, TVA et CFE au journal
`ReviewEvent`, au snapshot fiscal canonique et à un manifeste SHA-256. Il restitue
une analyse dans le périmètre du dossier; il ne constitue pas un avis juridique,
un dépôt fiscal, un calcul de pénalités ni un label global de conformité.

Le point d'entrée est `buildTaxEvidenceExportPackage`. Il exige un contexte actif
`organizationId + dossierId` identique au profil, aux documents, aux périodes,
aux matrices, aux résultats et aux pièces complémentaires. Un seul écart de
périmètre bloque l'export.

## Chaîne d'un constat

`TaxEvidenceFinding` conserve explicitement :

1. les documents sources et leur SHA-256 ;
2. la page, feuille, cellule, case, zone ou chemin structuré ;
3. la donnée brute et la donnée normalisée ;
4. l'identifiant, la version et le statut de la règle ;
5. chaque source normative, sa version et son paragraphe ;
6. la formule, les calculs intermédiaires et leurs hashes d'entrée ;
7. le résultat élémentaire et le niveau de preuve ;
8. la décision, le commentaire et les justificatifs rattachés ;
9. l'empreinte canonique du constat.

Une donnée réellement absente reste `null`. Elle n'est jamais remplacée par zéro
ou par une valeur estimée silencieusement et produit une limitation dans le
manifeste.

## Revue append-only

Les actions fiscales réutilisent `ReviewEvent`. `organizationId` et `action` sont
des métadonnées optionnelles pour les événements historiques, obligatoires dans
le workflow fiscal et couvertes par `eventHash`.

| Action fiscale | Statut générique | Effet de projection |
| --- | --- | --- |
| confirmer | `confirmed` | accepté |
| écarter | `dismissed` | rejeté |
| demander une preuve | `needs_evidence` | en attente |
| corriger | `corrected` | amendé |
| remplacer | `superseded` | amendé |
| marquer non applicable | `dismissed` | rejeté avec action distincte |
| marquer non concluant | `pending` | en attente avec action distincte |
| rattacher un justificatif | statut inchangé | preuve ajoutée |

Chaque événement pointe vers le hash de l'événement précédent du dossier. Une
action produit un nouveau `FiscalSynthesisSnapshot`; aucun événement, constat,
document ou snapshot antérieur n'est modifié.

## Artefacts

Le manifeste référence exactement neuf artefacts :

- `tax-profile.json` ;
- `tax-computation.json` ;
- `tax-reconciliation-lines.csv` ;
- `tax-findings.csv` ;
- `tax-controls.csv` ;
- `tax-sources.csv` ;
- `tax-review-events.csv` ;
- `fiscal-note.html` ;
- `fiscal-note.pdf`.

Le manifeste ne se référence pas lui-même pour éviter un cycle de hash. Le PDF
est dérivé du HTML accessible. Son statut PDF/A demeure `not_validated` tant
qu'aucun validateur, profil et horodatage de validation ne sont enregistrés.

## Limitations d'intégrité

Le paquet conserve et signale au minimum : document source absent, donnée brute
absente, source normative absente ou non résolue, source future, source ou règle
remplacée, hash source invalide et justificatif référencé mais absent. Une source
future ou remplacée reste exportée pour le rejeu historique; elle n'est jamais
présentée comme la source actuelle d'une conclusion.
