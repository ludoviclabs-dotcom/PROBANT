# Mission C10 — descriptif de PR prêt à examiner

Titre : IS — bénéfice arrondi à l'euro, impôt liquidé à l'euro, exercice non annuel refusé (moteur 1.1.0, feuille IS 1.1.0, C10)

Base : `main` `e25a4ad` (16/10/2026). Ce lot **refait** la mission C10 du 14/10/2026, jamais fusionnée et dont le chantier non commité a disparu (constat C15, `docs/recette/c15/RAPPORT.md` § 1, § 4 M9 bis / ter, § 10 point 1). Rien n'est repris du lot perdu : sources relues le 16/10/2026, attendus recalculés à la main.

## Cause (avant, moteur `tax-05-corporate-income-tax-1.0.0`)

- **Base non arrondie.** Le moteur ventilait le bénéfice en centimes. Base 50 000,49 €, PME éligible : 42 500 × 15 % + 7 500,49 × 25 % = 6 375 + 1 875,1225 → **8 250,12 €**. L'article 219, I impose pourtant d'arrondir le bénéfice imposable à l'euro avant tout calcul.
- **Un seul arrondi partout.** `half_up_cent` était appliqué tranche par tranche, et la charge d'impôt comptabilisée était comparée à cette somme au centime. L'article 1724 arrondit la liquidation à l'euro, une seule fois, « au niveau du décompte de chaque impôt ».
- **Exercice de 18 mois calculé sans avertissement.** Du 01/01/2026 au 30/06/2027, le moteur rendait `computed` avec le plafond de 42 500 € non ajusté et aucune limitation. Or le plafond s'entend « par période de douze mois » (art. 219, I-b), et un tel exercice recouvre deux périodes d'imposition (BOI-IS-LIQ-20-20 § 60).
- **Barèmes 2024 / 2025.** Absents du registre, donc bloqués (`UNSUPPORTED_RATE_SCHEDULE`) : ce comportement est correct et conservé.

## Sources lues (16/10/2026, page par page)

| Source | Version et dates d'effet | Passage retenu | Usage |
|---|---|---|---|
| [CGI art. 219](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006308695) (Légifrance) | En vigueur depuis le 21/02/2026 (loi n° 2026-103 du 19/02/2026, art. 15) : `cgi-art-219-v2026-02-21`, déjà au registre | I, 1er alinéa : « le bénéfice imposable est arrondi à l'euro le plus proche. La fraction d'euro égale à 0,50 est comptée pour 1 ». I-b : chiffre d'affaires « ramené s'il y a lieu à douze mois », plafond de 42 500 € « par période de douze mois » | Arrondi de la base ; périmètre de durée |
| [CGI art. 219, version antérieure](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046868562/2024-06-17) | Du 01/01/2023 au 21/02/2026 (loi n° 2022-1726, art. 37) | Mêmes arrondi, taux (25 %, 15 %), plafond (42 500 €) et seuil de chiffre d'affaires (10 M€) | Lue pour 2024 / 2025 : voir « Limites » |
| [CGI art. 1724](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006312863) (Légifrance) | En vigueur depuis le 31/03/2002 (règlement CE 974/98, art. 14) : `cgi-art-1724-v2002-03-31`, nouvelle | « La liquidation de toutes sommes à recevoir […] est arrondie à l'euro le plus proche. La fraction d'euro égale à 0,50 est comptée pour 1. Il est procédé à cet arrondissement au niveau du décompte de chaque impôt ou taxe. » | Arrondi unique de l'impôt |
| [BOI-IS-LIQ-20-10](https://bofip.impots.gouv.fr/bofip/2062-PGP.html/identifiant=BOI-IS-LIQ-20-10-20230621) (BOFiP) | Publication du 21/06/2023 : `bofip-is-liq-20-10-v2023-06-21`, nouvelle | § 70 : chiffre d'affaires ajusté prorata temporis (12 / nombre de mois, jours résiduels / 30). § 80 à 100 : exercice sans bilan dans l'année civile, déclaration provisoire (art. 37) ; exemple d'un exercice de 18 mois traité en deux périodes | Périmètre de durée |
| [BOI-IS-LIQ-20-20](https://bofip.impots.gouv.fr/bofip/2065-PGP.html/identifiant=BOI-IS-LIQ-20-20-20230621) (BOFiP) | Publication du 21/06/2023 : `bofip-is-liq-20-20-v2023-06-21`, nouvelle | § 50 : plafond ajusté prorata temporis (mois / 12, jours résiduels / 30 ; exemple 01/01 → 15/09 : 30 104 €). § 60 : exercice de plus de douze mois sans bilan dans l'année civile, plafond apprécié distinctement pour chaque période d'imposition | Périmètre de durée |

Registre fiscal : 3 sources, 3 versions et 3 règles ajoutées.

- **`is-arrondi-base-2026`** (`IS.ROUNDING.TAXABLE_BASE`) : obligation fondée sur l'art. 219, I.
- **`is-arrondi-liquidation`** (`IS.ROUNDING.LIQUIDATION`) : obligation fondée sur l'art. 1724.
- **`is-duree-exercice-2026`** (`IS.PERIOD.LENGTH`) : doctrine interprétative, sans calcul. Elle documente le refus et ne prétend à aucun prorata.

Aucun choix interne n'est attribué à une norme. L'exemple de 30 104 € n'est pas transformé en règle d'arrondi du plafond.

## Changements

Moteur `lib/tax/corporate-tax`, qui reste le seul moteur IS. Il passe de `1.0.0` à **`1.1.0`**, calcul `2026.2.0`.

- **Pont et déficits au centime.** Le pont comptable, les retraitements et l'imputation des déficits restent au centime. Le nouveau champ `taxableProfitBeforeRoundingCents` porte le bénéfice après déficits, avant arrondi.
- **Base arrondie à l'euro.** `taxableBaseCents` devient la base arrondie à l'euro, avec 0,50 compté pour 1 (`step-taxable-base`, source art. 219, I). La ventilation par tranche porte sur cette base.
- **Impôt avant arrondi.** `grossTaxCents` reste la somme des tranches, c'est-à-dire l'impôt avant arrondi de liquidation.
- **Impôt liquidé.** Le nouveau champ `liquidatedTaxCents` arrondit une seule fois, à l'euro, la somme exacte des produits base × taux (`step-liquidation`, source art. 1724). La charge 695 et la dette 444 sont désormais comparées à ce montant.
- **Exercice non annuel refusé.** Tout exercice qui ne dure pas exactement douze mois est bloqué (`NON_ANNUAL_PERIOD_NOT_SUPPORTED`). Le message distingue l'exercice court (prorata) de l'exercice long (deux périodes), avec une note de méthode qui cite l'art. 219, I-b et les deux BOI. Aucun impôt n'est calculé et le plafond de 42 500 € n'est jamais appliqué sans ajustement. Un exercice de douze mois décalé (01/07 → 30/06, ou ouvert un 29 février) est reconnu (`period.ts`).
- **Invariants du schéma.** Le snapshot refuse une base qui n'est pas un multiple de 100 centimes ou qui s'écarte de plus de 0,50 € du bénéfice. Il refuse aussi un impôt liquidé qui n'est pas arrondi à l'euro.

Feuille IS `is.computation` :

- **Versions.** Règle, gabarit et procédure du programme passent en 1.1.0, et le programme fiscal en 1.2.0.
- **Contrat de résultat.** Le résultat passe en **`fiscal-cit-result-2`**, qui ajoute le bénéfice avant arrondi et l'impôt liquidé.
- **Feuilles 1.0.0.** Un résultat `fiscal-cit-result-1` **reste lisible**, mais une exécution n'écrit plus que la v2. La feuille 1.0.0 apparaît périmée (« La version de règle diffère du programme. »). Toute commande autre que la révision y est refusée (`FX_RULE_REPLACED_REVISION_REQUIRED`, 409), et la révision adopte la règle 1.1.0.
- **Règle bloquée.** Elle nomme le périmètre de durée et ses trois sources (« Exercice d'une durée différente de douze mois »).
- **Textes.** La méthode et les limitations disent les deux arrondis et le refus de l'exercice non annuel.

Interface et export :

- **Écran `/fiscal` (IS).** Une table « Arrondis légaux » montre, pour la base puis pour l'impôt, les valeurs avant arrondi et arrondies à l'euro, avec leur source. Un résultat v1 affiche à la place un avertissement « base non arrondie », avec la version du moteur.
- **Synthèse de mission et paquet HTML.** Ils présentent l'IS arrondi à l'euro et la même table.
- **Charte.** Elle est conservée : table continue lisible au clavier, aucune nouvelle carte. Aucun calcul n'est fait dans React : l'écran lit les champs du résultat.

Dossier fiscal de démonstration :

- La charge comptabilisée passe de 101 562,50 € à **101 563,00 €**, pour que l'écart pédagogique reste de **24 850,00 €** face à l'impôt liquidé de 126 413 € (126 412,50 € avant arrondi, avec 0,50 compté pour 1).

## Cas contrôlés (attendus calculés à la main, indépendamment du code)

| Cas | Attendu | Obtenu |
|---|---|---|
| PME éligible, bénéfice 50 000,49 € | base 50 000 ; 42 500 × 15 % + 7 500 × 25 % = 8 250,00 ; liquidé 8 250 | conforme |
| PME éligible, bénéfice 50 000,50 € | base 50 001 ; 6 375 + 1 875,25 = 8 250,25 ; liquidé 8 250 | conforme |
| Non éligible (capital non libéré), 50 000 € | 12 500,00 | conforme |
| Plafond + 0,49 € (42 500,49) | base 42 500, tout à 15 % : 6 375,00 | conforme |
| Plafond + 0,50 € (42 500,50) | base 42 501 ; 1 € à 25 % = 0,25 ; 6 375,25 → liquidé 6 375 | conforme |
| Base 42 502 € | 6 375,50 → liquidé **6 376** (0,50 compte pour 1) | conforme |
| Bénéfice 100 000,30, déficit imputé 40 000,10 (stock 50 000) | stock restant 9 999,90 au centime ; bénéfice 60 000,20 → base 60 000 → 15 000 | conforme |
| Bénéfice 0,49 € | base 0, impôt 0 | conforme |
| Barème de test à 15 %, bénéfice 33 333,33 € | base 33 333 → 4 999,95 → liquidé 5 000 (1.0.0 : 4 999,99995 arrondi au centime) | conforme |
| Charge comptabilisée 8 250,00 face à une base de 50 001 € | rapprochée avec l'impôt liquidé de 8 250 (écart de 0,25 € avec l'ancien brut au centime) | conforme |
| Exercice 01/01/2026 → 30/06/2027 | bloqué, `NON_ANNUAL_PERIOD_NOT_SUPPORTED` (« deux périodes d'imposition »), aucune tranche | conforme |
| Exercice 01/01/2026 → 15/09/2026 | bloqué (« prorata temporis ») | conforme |
| Exercice 01/07/2025 → 30/06/2026 | calculé (douze mois) | conforme |
| Exercice 2024, millésime 2024 | bloqué, `UNSUPPORTED_RATE_SCHEDULE`, aucun repli sur 2026 | conforme (inchangé) |

Les 10 golden cases IS de TAX-10 gardent leur statut, leur outcome et leurs montants : leurs bases sont en euros entiers. Seules les empreintes sont refigées, puisque la version et la trace changent.

## Matrice C15

Le fichier `lib/recette/__tests__/c15-matrice.test.ts` est sur la branche C15 `claude/recette-finale-controle-c85076`, qui n'est pas encore sur `main`. La vérification a été faite sur une intégration locale C15 + C10 :

- **M9 bis et M9 ter.** Les deux `it.fails` deviennent des `it` normaux et passent, **attendus inchangés** (`attendus.json` : base 50 000 → 8 250,00 ; 18 mois → refus ciblé).
- **M9 et M10.** Ils passent aussi.

Voir la section « Livraison » pour l'ordre de fusion.

## Contrôles (16/10/2026)

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit` | aucune erreur |
| ESLint (dépôt entier) | 0 erreur ; 7 avertissements préexistants, hors fichiers du lot |
| vitest (`vitest.config.mjs`, pool `forks`), suite complète | 195 fichiers : **1 940 réussis**, 62 ignorés (recettes PostgreSQL sans base), 1 échec : `provision-mission.test.ts` (export, délai de 5 s dépassé sous la charge), déjà constaté sur `main` par C15 ; **rejoué seul : 12 / 12 réussis** |
| Tests IS, feuille, exports et TAX-10 | `lib/tax` 212 + fichier C10 du moteur ; feuille `fiscal-cit-c10.test.ts` 4 ; exports `lib/evidence` verts |
| Intégration C15 + C10 (`claude/c10-sur-c15-matrice`) | `lib/recette` (matrice C15 entière, **aucun `it.fails` restant**), `lib/tax`, feuilles IS : 19 fichiers, 276 tests réussis |
| `next build` | réussi |
| e2e IS (`e2e/fiscal.spec.ts`, « IS 2026 », serveur de production, magasin de test en mémoire) | **réussi** : table « Arrondis légaux » avec ses deux sources, axe sans violation critique ou sérieuse, aucun débordement de page à 1024 ni à 390. Le tableau défile dans sa région à 390, comme celui des tranches. Captures dans `docs/probant-lots/c10-captures/` (1440, 1024, 390) |

Non vérifié dans ce passage : le parcours e2e sur un profil personnel local PostgreSQL (C07 / C15) et la suite e2e complète. Le cas de démonstration de la feuille a une base en euros entiers : à l'écran, les montants avant et après arrondi y sont identiques. Les cas qui changent réellement (,49 / ,50) sont couverts par les tests unitaires.

## Livraison

- Branche `claude/inspiring-rosalind-d180f8`, commit `1a060ca`, sur `main` `e25a4ad`. Non poussée, non fusionnée.
- La matrice C15 n'existe pas sur `main` : la bascule des deux `it.fails` est un commit séparé, `219f6d6`, sur la branche locale `claude/c10-sur-c15-matrice`. Cette branche est faite de la branche C15, d'une fusion de C10 et de cette bascule.
- **Ordre de fusion.**
  - Si C15 est fusionnée avant C10 : fusionner C10, puis reprendre `219f6d6`.
  - Si C10 est fusionnée avant : la branche C15 doit intégrer `219f6d6`. Sinon, ses deux `it.fails` échoueront, puisque les cas passent désormais.

## Limites restantes

- **Exercice court.** Le prorata n'est pas modélisé. Les sources fixent le principe (mois / 12, jours résiduels / 30) mais pas tout le décompte : mois calendaires ou de date à date pour un exercice ouvert en cours de mois, et arrondi du plafond ajusté (l'exemple BOFiP affiche 30 104 € sans énoncer de règle). Le refus explicite est conservé tant que ces points ne sont pas lus dans une source.
- **Exercice long.** Les deux périodes d'imposition (déclaration provisoire, art. 37) demandent les données de la période provisoire : le refus est maintenu.
- **Barèmes 2024 / 2025.** L'article 219 en vigueur du 01/01/2023 au 21/02/2026 a été lu ; ses paramètres sont identiques. Ces barèmes restent bloqués pour deux raisons :
  - les formulaires 2065-SD, 2058-A-SD, 2058-B-SD et 2033-B-SD des millésimes 2024 et 2025 n'ont pas été relus case par case (ils sont en ligne sur impots.gouv.fr le 16/10/2026) ;
  - la correspondance entre exercice et millésime n'est pas établie, puisque le registre marque lui-même le millésime 2026 « période d'application exacte review_required ».

  Ouvrir ces exercices sera un ajout de données (barème, millésimes), sans modification du moteur.
- **Incidence fiscale d'un ajustement (C05).** Elle n'est pas livrée : c'était l'item facultatif. `exposure.taxIncidence.provider` reste `none`, donc l'effet fiscal reste « inconnu, hors couverture ». La comparaison de scénarios IS avant / après reste à brancher sur ce moteur.
- **Cockpit `/dashboard/fiscalite` et paquet TAX.** Ils affichent encore l'« impôt brut », désormais avant arrondi de liquidation, sans l'impôt liquidé.
- **Dette 444.** Elle reste comparée à l'impôt liquidé, alors qu'elle est nette des acomptes : la note de normalisation le signale, comme avant.
