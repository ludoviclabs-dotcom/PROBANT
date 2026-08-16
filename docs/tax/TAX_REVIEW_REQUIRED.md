# TAX-01 — éléments à revoir

## Règle de gestion

Tout élément dont la date, le millésime, le périmètre ou le fondement exact n'a
pas été vérifié reste `review_required`. Il n'est ni sélectionné par la requête
des règles effectives, ni présenté comme une obligation actuelle. La présente
liste est exhaustive pour le registre TAX-01 au 16 août 2026.

## Versions de sources

| Identifiant | Motif | Action de résolution |
| --- | --- | --- |
| `cgi-art-39-v2024-02-23` | Date d'effet affichée, mais date officielle de publication de la modification non épinglée | Identifier le texte modificateur et sa publication au JORF |
| `cgi-art-53a-current` | Version courante consultée sans chaîne de publication/effet complète | Épingler le texte et la version utiles au millésime traité |
| `form-2050-liasse-v2026` | PDF officiel 2026 vérifié, sans date de publication/effet portée par l'artefact | Vérifier la page de diffusion ou une métadonnée DGFiP officielle datée |
| `notice-2032-v2026` | Notice officielle, mais millésime et dates exactes non épinglés | Associer la notice exacte à la liasse 2026 |
| `form-2033-liasse-v2026` | PDF officiel 2026 vérifié, sans date de publication/effet explicite | Vérifier une métadonnée DGFiP datée |
| `form-2065-v2026` | PDF officiel 2026 vérifié, sans date de publication/effet explicite | Vérifier une métadonnée DGFiP datée |
| `form-ca3-v2026` | PDF officiel 2026 vérifié, sans date de publication/effet explicite | Épingler la période exacte couverte par ce millésime |
| `form-ca12-v2026` | PDF officiel 2026 vérifié, sans date de publication/effet explicite | Épingler la période exacte et la transition annoncée du régime simplifié |
| `urssaf-c3s-v2026-08-16` | Page de service horodatée par la vérification, pas version normative | Ajouter les textes légaux versionnés avant toute règle |
| `dgfip-cvae-2026-v1` | Brochure 2026 informative; trajectoire législative non modélisée | Épingler chaque texte d'effet par exercice |
| `dgfip-taxe-salaires-v2026-08-16` | Page de service sans version normative de l'assiette et des taux | Ajouter CGI, annexes et formulaires versionnés |

## Millésimes de formulaires

Les six entrées suivantes sont structurées et testées, mais restent hors sélection
effective tant que leurs dates officielles exactes ne sont pas épinglées :

- `form-2058-a-2026` ;
- `form-2058-b-2026` ;
- `form-2033-b-2026` ;
- `form-2065-2026` ;
- `form-ca3-2026` ;
- `form-ca12-2026`.

## Règles et spécifications

| Identifiant | Motif | Conséquence |
| --- | --- | --- |
| `is-resultat-comptable-fiscal-2026` | Relation tirée du 2058-A dont les dates exactes restent ouvertes | Spécification analytique non sélectionnable |
| `is-2058a-resultat-final-2026` | Relation de formulaire, non règle légale autonome | Signal de cohérence futur seulement |
| `is-2058b-deficits-2026` | Roll-forward du formulaire; décisions de transfert/imputation non déterminables par les cases seules | Signal de rapprochement seulement |
| `is-2033b-resultat-2026` | Relation du millésime 2033-B sans date d'effet épinglée | Spécification non sélectionnable |
| `is-charges-produits-retraites-2026` | Article 39 courant non complètement versionné et qualification dépendante des pièces | Revue humaine, aucune classification automatique |
| `vat-ca3-relationship-2026` | Relation de cases issue du formulaire, non obligation légale autonome | Rapprochement futur seulement |
| `vat-ca12-relationship-2026` | Relation de cases et régime en transition | Rapprochement futur seulement |

## Crosswalks

Ces mappings restent `review_required`, car ils ne prouvent ni la concordance de
période, ni l'identité de l'entité, ni la qualification fiscale des montants :

- `cw-2058a-wa-accounting-profit` ;
- `cw-2058a-wr-reintegrations` ;
- `cw-2058a-xh-deductions` ;
- `cw-2058a-xo-2058b-yj` ;
- `cw-2058a-xn-2065-benefit` ;
- `cw-2033b-370-2065-benefit` ;
- `cw-ca3-16-gross-vat` ;
- `cw-ca3-23-deductible-vat` ;
- `cw-ca12-19-gross-vat` ;
- `cw-ca12-26-deductible-vat`.

## Transitions non activées

- Les versions des articles 269 et 289 enregistrées prennent fin le 31 août
  2026. Le basculement issu de la codification dans le CIBS à compter du
  1er septembre 2026 doit faire l'objet d'une source, d'une version et d'une
  analyse de périmètre distinctes avant activation.
- La fin annoncée du régime simplifié TVA et les obligations déclaratives 2027
  ne sont pas déduites d'une page d'information : elles restent futures jusqu'à
  versionnement du fondement officiel exact et des formulaires correspondants.
- C3S, CVAE, CFE et taxe sur les salaires restent `metadata_only`. Aucun
  contournement par taux ou date recopié d'une page de service n'est autorisé.

