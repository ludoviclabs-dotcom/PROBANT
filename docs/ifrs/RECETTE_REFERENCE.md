# Recette de référence IFRS 16 — attendus établis avant le moteur (lot C00)

Version 1.0 du 29/10/2026. Les attendus ci-dessous viennent d'un **oracle indépendant**, [`recette/attendus_l16.py`](./recette/attendus_l16.py) :
- il est écrit en Python avec `decimal` à 60 chiffres significatifs, plus précis que le moteur, qui travaille à 40 décimales ;
- il n'importe aucun code PROBANT ;
- il écrit [`recette/attendus_l16.json`](./recette/attendus_l16.json).

Le moteur TypeScript de L16-02 **ne doit jamais** servir à fabriquer ou à corriger ces valeurs. Si un attendu paraît faux, on corrige l'oracle avec une justification écrite, puis on relance.

```bash
python -I docs/ifrs/recette/attendus_l16.py
```

## 1. Conventions appliquées

Ce sont celles de [`CONTRAT_COMMUN.md`](./CONTRAT_COMMUN.md) § 5 : taux annuel effectif ; taux mensuel `(1 + r)^(1/12) − 1` ; loyers fixes à terme échu ; publication des **soldes** au centime, moitié à l'opposé de zéro ; cumul d'amortissement arrondi ; retraitement de clôture sans mouvement de trésorerie, sur une base PCG qui a passé en charge les loyers échus de la période ; impôt non calculé.

## 2. Contrôles internes de l'oracle

Chaque exécution vérifie, par assertion :
- la dette initiale par deux méthodes, la somme actualisée et la formule fermée de l'annuité (écart < 10⁻⁴⁰) ;
- la dette finale publiée égale à 0,00 ;
- le total des intérêts publiés égal au total des loyers moins la dette initiale ;
- un écart d'arrondi mensuel d'au plus 1 centime (des écarts de ±0,01 apparaissent réellement dans F03, F05, F07 et F08 : ils sont tracés, non absorbés) ;
- un retraitement équilibré au centime ;
- l'identité *effet d'ouverture + effet de la période = ROU net de clôture − dette de clôture*. Sur toute la durée d'un contrat, la somme des effets sur le résultat est nulle.

## 3. Fixtures et attendus publiés

Montants en euros. « Effet » = effet sur le résultat avant impôt de la période.

| Fixture | Cas | Période | Dette initiale | Intérêts | Dotation | Dette de clôture | ROU net | Effet d'ouverture | Effet |
|---|---|---|---|---|---|---|---|---|---|
| F01 | Plan : 3 × 1 000,00, 1 % mensuel | 01-31/01/2027 | 2 940,99 | 29,41 | 980,33 | 1 970,40 | 1 960,66 | 0,00 | −9,74 |
| F01 | idem, fin du contrat | 01/01-31/03/2027 | | 59,01 | 2 940,99 | 0,00 | 0,00 | 0,00 | 0,00 |
| F02 | Taux zéro, 12 × 500,00 | 2027 | 6 000,00 | 0,00 | 6 000,00 | 0,00 | 0,00 | 0,00 | 0,00 |
| F03 | 5 %, 36 × 1 000,00 | 2027 | 33 421,27 | 1 398,49 | 11 140,42 | 22 819,76 | 22 280,85 | 0,00 | −538,91 |
| F03 | idem | 2028 | | 868,41 | 11 140,43 | 11 688,17 | 11 140,42 | −538,91 | −8,84 |
| F03 | idem | 2029 | | 311,83 | 11 140,42 | 0,00 | 0,00 | −547,75 | +547,75 |
| F04 | Année bissextile, échéance au 29/02/2028 | 01-29/02/2028 | 2 940,99 | 29,41 | 980,33 | 1 970,40 | 1 960,66 | 0,00 | −9,74 |
| F05 | 120 × 2 500,00, 4 % | 2027 | 247 756,28 | 9 364,14 | 24 775,63 | 227 120,42 | 222 980,65 | 0,00 | −4 139,77 |
| F05 | idem, dernière année | 2036 | | 628,74 | 24 775,63 | 0,00 | 0,00 | −4 595,63 | +4 595,63 |
| F06 | Terme final : 1 × 10 000,00, 6 % | 2027 | 9 951,56 | 48,44 | 9 951,56 | 0,00 | 0,00 | 0,00 | 0,00 |
| F07 | Gros montant : 60 × 12 345 678,91, 3,5 % | 2027 | 679 560 211,64 | 21 422 825,51 | 135 912 042,33 | 552 834 890,23 | 543 648 169,31 | 0,00 | −9 186 720,92 |
| F08 | Historique : commencé le 01/01/2025, 60 × 2 000,00, 4,5 % | 2025 | 107 515,21 | 4 347,12 | 21 503,04 | 87 862,33 | 86 012,17 | 0,00 | −1 850,16 |
| F08 | idem | 2026 | | 3 462,74 | 21 503,04 | 67 325,07 | 64 509,13 | −1 850,16 | −965,78 |
| F08 | idem, exercice repris | 2027 | | 2 538,56 | 21 503,05 | 45 863,63 | 43 006,08 | −2 815,94 | −41,61 |
| F09 | Durée d'utilité 24 mois < contrat de 36 mois (5 %) | 2027 | 33 421,27 | 1 398,49 | 16 710,64 | 22 819,76 | 16 710,63 | 0,00 | −6 109,13 |
| F09 | idem | 2028 | | 868,41 | 16 710,63 | 11 688,17 | 0,00 | −6 109,13 | −5 579,04 |
| F09 | idem | 2029 | | 311,83 | 0,00 | 0,00 | 0,00 | −11 688,17 | +11 688,17 |
| F10 | Prise d'effet le 01/01/2028, clôture le 31/12/2027 | 2027 | — | — | — | — | — | — | `not_commenced` : rien de reconnu |

Les échéanciers complets (36 mois au plus, sinon les trois premiers et les trois derniers), les valeurs exactes à 40 décimales et les lignes de chaque retraitement figurent dans `attendus_l16.json`. Le critère de précision interne est fixé **avant** le calcul : écart ≤ 10⁻²⁰ € avec l'oracle sur `debtInitialExact` et `monthlyRateExact`.

### Retraitements de référence

**F01 au 31/01/2027** (cas chiffré de L16-03). Total 3 950,73 au débit et au crédit. Les cibles du plan sont retrouvées : dette 1 970,40 ; ROU net 1 960,66 ; effet −9,74.

| Compte logique | Débit | Crédit |
|---|---|---|
| `rou_gross` | 2 940,99 | |
| `rou_accumulated_depreciation` | | 980,33 |
| `lease_liability` | | 1 970,40 |
| `lease_interest_expense` | 29,41 | |
| `rou_depreciation_expense` | 980,33 | |
| `pcg_rent_neutralized` | | 1 000,00 |

**F03 au 31/12/2028** (clôture N+1, effet d'ouverture séparé). Total 45 969,02 au débit et au crédit.

| Compte logique | Débit | Crédit |
|---|---|---|
| `rou_gross` | 33 421,27 | |
| `rou_accumulated_depreciation` | | 22 280,85 |
| `lease_liability` | | 11 688,17 |
| `lease_interest_expense` | 868,41 | |
| `rou_depreciation_expense` | 11 140,43 | |
| `pcg_rent_neutralized` | | 12 000,00 |
| `opening_equity_effect` | 538,91 | |

**F08 au 31/12/2027** (reprise historique, ouverture cadrée sur les valeurs au 31/12/2026). L'effet d'ouverture de 2 815,94 est porté au débit : il n'est jamais déversé dans la charge de 2027.

## 4. Mutations que la recette doit détecter (L16-06)

| Mutation | Effet attendu | Fixture |
|---|---|---|
| `r / 12` au lieu de `(1 + r)^(1/12) − 1` | Dette initiale de 2 937,69 au lieu de 2 940,99 ; 33 365,70 au lieu de 33 421,27 | F01, F03 |
| Signe d'un paiement inversé | Dette finale ≠ 0,00 ; identité des intérêts rompue | F01 |
| Contrat compté deux fois | Sous-total des contrats calculés doublé ; identité économique en double rejetée | Population de deux contrats identiques |
| Source remplacée ignorée | `L16_SOURCE_REPLACED_REVISION_REQUIRED` attendu | Remplacement de `lease_schedule` après le gel |
| Coût direct initial absent pris pour zéro | Contrat attendu en `a_qualifier` (X25), pas en `eligible_v1` | Réponse vide |
| Dernière échéance « ajustée » pour absorber l'arrondi | Écart tracé ≠ 0 au dernier mois de F03, ou dette finale non nulle | F03 |
| Amortissement sur la durée du contrat au lieu de la durée d'utilité plus courte | Dotation 2027 de 11 140,42 au lieu de 16 710,64 | F09 |

## 5. Cas de qualification sans chiffre (L16-01)

Chaque cas reçoit un statut, une cause et une prochaine action, tous issus de `SCOPE_V1.md` § 5 :

- contrat complet → `eligible_v1` ;
- champ vide face à zéro documenté → X25 ;
- durée absente → X20 ;
- taux nominal non converti → X19 ;
- exemption court terme avec option d'achat → X22 ;
- faible valeur non justifiée → X23 ;
- service non séparé → X07 ;
- indexation → X01 ;
- paiement anticipé → X03 ;
- identifiant en double → X26 ;
- contrat comptable non rapproché → X27 ;
- nouveau contrat hors de la population gelée → `L16_SOURCE_REPLACED_REVISION_REQUIRED` ;
- remplacement de pièce → nouvelle révision exigée ;
- historique sans ouverture validée → X24 ;
- mauvais périmètre → `WORKPAPER_SCOPE_MISMATCH`.

## 6. Performance : protocole, pas de promesse

La charge proposée par le plan est un portefeuille de 1 000 contrats × 120 mensualités, généré par une graine, sans données réelles. L16-02 mesure le calcul froid et chaud et le recalcul d'un contrat, sur une machine documentée (CPU, RAM, OS, version de Node, nombre de répétitions), **avant** de choisir entre calcul synchrone et job local. Objectifs d'interface repris du plan :
- accusé de prise en charge en moins de 300 ms ;
- filtres en moins de 200 ms au 95e centile après chargement des agrégats ;
- progression affichée au-delà de 2 s.

Le budget du calcul complet est fixé **après** la première mesure, puis il n'est plus assoupli.
