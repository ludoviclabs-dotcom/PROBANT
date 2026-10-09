# Mission 15 — Stocks et inventaires : contrat

La mission est livrée en trois sous-lots séquentiels, chacun proposé dans une PR distincte :
1. **quantités et mouvements** — livré (sous-lot 1) ;
2. **coûts et cadrage** — livré (sous-lot 2, PR empilée sur le sous-lot 1) ;
3. **revue de valeur** — livré (sous-lot 3, PR empilée sur le sous-lot 2).

Ce document décrit les trois sous-lots.

## Problème utilisateur

Le préparateur doit établir, référence par référence, site par site et lot par lot, la quantité en stock à la clôture à partir du comptage physique. Pour cela, il doit :
- expliquer le passage du comptage à la clôture par les mouvements intercalaires ;
- comparer le résultat au stock théorique ;
- séparer ce qui n'appartient pas à l'entité ou n'a pas été testé.

Le tout sans transformer une inconnue en zéro, ni un écart arithmétique en anomalie. **Stocks n'est pas une simple comparaison de montants** : le cycle existant de `lib/rapprochement` (inventaire ↔ comptabilité en euros) reste une démonstration de rapprochement et n'est pas réutilisé comme test de quantité.

## Questions professionnelles (sous-lot 1)

1. Pour chaque référence, site et lot de stock propre, la quantité reconstituée à la clôture (comptée, puis entrées et sorties intercalaires) est-elle égale à la quantité théorique ?
2. Quelles quantités appartiennent à des tiers, sont en consignation, en transit ou en cours de production, et ne doivent donc pas entrer dans le stock propre ?
3. Quels sites n'ont pas été visités, et quelles références n'ont pas été comptées ou sont exclues ?
4. Un total net nul cache-t-il des écarts de sens opposés ?

## Assertions et risques visés (non validés)

- **Existence et exhaustivité des quantités** : quantités fictives, oubliées ou comptées deux fois. **La présence physique n'est jamais certifiée par l'outil.**
- **Droits et obligations** : stock de tiers ou consignation reçue compté comme stock propre ; stock déposé chez un tiers oublié.
- **Rattachement des mouvements** entre le comptage et la clôture, selon la convention du jour de comptage.

## Sources, champs et formats

Toutes les sources sont tabulaires (CSV ou XLSX), avec un mapping explicite `stocks-1`, versionnées et approuvées une à une. La colonne pivot du parseur tabulaire porte une **quantité** (deux décimales au plus, conservée en centièmes d'unité de comptage), jamais un montant.

| Source | Champs obligatoires | Contrôles à l'import (refus avec ligne, colonne et valeur) |
|---|---|---|
| `st_count` — feuilles de comptage | ligne, référence, site, unité, quantité, date, statut ; lot, fiche et libellé facultatifs | statut connu ; quantité ≥ 0 ; date dans l'exercice et au plus tard à la date de revue ; **une seule date de comptage par site** ; une seule unité par référence, site et lot |
| `st_system` — état théorique | ligne, référence, site, unité, quantité, date, statut ; motif obligatoire pour une référence exclue | date égale à la clôture ; une ligne par référence, site et lot |
| `st_movements` — mouvements intercalaires | mouvement, référence, site, unité, quantité, date, sens ; **période couverte déclarée** (du, au) | sens `entree` ou `sortie` ; quantité > 0 ; date dans la période couverte ; période couverte comprise dans l'exercice et au plus tard à la date de revue |
| `st_support` — pièces citables | pièce, quantité (0 si sans objet), date ; référence et libellé facultatifs | date au plus tard à la date de revue |

Statuts acceptés : `propre`, `tiers`, `consignation_recue`, `consignation_deposee`, `transit`, `en_cours`, `exclue`.

## Population, unité et période

- **Unité de test : référence | site | lot**, le lot pouvant être vide. Le séparateur `|` est refusé dans chacune des trois parties.
- **Population** : toutes les unités présentes dans le comptage ou dans le théorique (`stock_unit`).
- **Mesure de population** : une quantité en centièmes d'unité de comptage (la quantité théorique, ou la quantité comptée si l'unité est absente du théorique). Ce n'est jamais un montant, et elle n'est jamais additionnée d'une unité à l'autre.
- **Période** : l'exercice. La date de comptage est celle du site ; la clôture est la date de clôture de l'exercice.

## Exclusions motivées (textes serveur)

| Cas | Traitement |
|---|---|
| Stock détenu pour le compte de tiers | Compté et présenté à part, hors stock propre |
| Consignation reçue | Propriété du déposant, présentée à part |
| Consignation déposée chez un tiers | Non comptée sur site ; confirmation ou procédure alternative à documenter |
| Transit | Rattachement relevant du cut-off, hors de ce test |
| En-cours de production | Avancement non mesuré par un comptage de quantités |
| Référence exclue | Avec le motif indiqué dans l'état théorique |
| Site non visité (aucune ligne de comptage) | Quantités non testées ; procédure alternative à documenter (NEP 501 § 06) |

La sélection est reconstruite par le serveur à l'exécution (`ST_SELECTION_NOT_REPRODUCIBLE` sinon).

## Calcul (méthode interne, non une règle légale)

- **Comptage antérieur ou égal à la clôture** :

  clôture reconstituée = compté + entrées − sorties, sur la période allant du lendemain du comptage à la clôture.

- **Comptage postérieur à la clôture** :

  clôture reconstituée = compté − entrées + sorties, sur la période allant du lendemain de la clôture au comptage.

- **Mouvements datés du jour du comptage.** Le préparateur choisit une convention, en citant les instructions d'inventaire :
  - `before_count` : ces mouvements sont réputés antérieurs au comptage, donc déjà compris dans les quantités comptées ;
  - `after_count` : ils sont réputés postérieurs au comptage, donc ajoutés ou retranchés.

  Ce choix est un **paramètre utilisateur justifié**. Le modifier invalide le résultat, les notes et la revue.

- **Écart** = clôture reconstituée − théorique. Un écart négatif est un manquant physique, un écart positif un excédent.

- **Écarts nets et bruts** : pour chaque référence et chaque unité de comptage, on calcule l'écart net et l'écart brut (somme des valeurs absolues). Si l'écart net est inférieur à l'écart brut et que la référence porte sur plusieurs unités, l'exception `NET_COMPENSATED` est levée.

## États et issue

| Statut de l'unité | Nature | Effet sur l'issue |
|---|---|---|
| Sans écart de quantité | — | — |
| Écart de quantité ; comptée mais absente du théorique | Écart de quantité | Exception (observation à expliquer) |
| Écart de propriété (statut compté ≠ statut théorique, ou deux statuts comptés) | Propriété | Exception ; la quantité n'est pas testée |
| Unité incompatible (par exemple cartons contre unités) | **Bloqué** | Incertitude ; aucune conversion sans facteur documenté |
| Mouvements incomplets (journal absent ou couverture insuffisante) | **Non concluant** | Incertitude ; la clôture reste inconnue |
| Non comptée (site visité, référence absente des feuilles) | Non concluant | Incertitude ; jamais zéro |
| Présentée à part ; site non visité | Exclusion motivée | Le site non visité est une incertitude |

Issue de la feuille :
- au moins une exception → **exceptions détectées** ;
- seulement des incertitudes → **non concluant** ;
- sinon → **aucune exception détectée**.

Chaque exception devient une note bloquante. Toutes les notes sont créées dans une seule version.

## Preuves et jugement humain

- Chaque quantité du résultat renvoie à sa source : fichier, version (empreinte SHA-256), ligne et date.
- Le panneau ouvre la ligne de comptage, puis la pièce : fiche, bon de réception ou de livraison, quand la pièce citable est approuvée.
- Toute décision humaine cite une pièce figée et sa version :
  - le traitement d'une exception ;
  - un jugement ou une anomalie validée ;
  - la convention du jour de comptage.
- La revue est faite par une autre identité ; la feuille est ensuite verrouillée, puis peut être révisée sur les sources courantes.
- Le remplacement ou l'ajout d'une source rend la feuille périmée.

## Chaîne durable

- Tables `st_*` (migration `0014_stock_workpapers`), en ajout seul grâce à un trigger ; le retour arrière est refusé si des données existent.
- Idempotence, contrôle de concurrence par version, budget de sources vérifié avant tout stockage.
- Ouverte seulement avec `PROBANT_STOCKS_DURABLE=disposable`, et toujours refusée si `VERCEL_ENV=production`.

## Sources professionnelles consultées (09/10/2026)

Le guide pédagogique ne fournit pas de méthode complète pour les stocks. Les sources ci-dessous encadrent la démarche, mais **aucune ne fixe la formule de passage du comptage à la clôture**, qui reste une méthode interne.

| Source | Nature | Référence | Effet | Limites d'application |
|---|---|---|---|---|
| Code de commerce, art. L123-12 | Obligation légale | [Légifrance](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006219304) | Version en vigueur depuis le 21/09/2000 | Contrôle par inventaire, au moins une fois tous les douze mois, de l'existence et de la valeur des éléments actifs et passifs. Aucune méthode de comptage. |
| NEP 501 — Caractère probant des éléments collectés (applications spécifiques), §§ 03 à 06 | Norme professionnelle (commissaire aux comptes) | [H2A](https://h2a-france.org/normes/caractere-probant-des-elements-collectes-applications-specifiques/) | Arrêté du 27/11/2024, JO du 30/11/2024 | Présence à l'inventaire si les stocks sont significatifs ; choix des sites selon le risque ; autre date et contrôle des mouvements intercalaires ; procédures alternatives. Ne traite pas explicitement des stocks détenus par des tiers. |

**Distinctions** :
- **obligation légale** : L123-12 ;
- **norme professionnelle** : NEP 501 ;
- **méthode interne** : le calcul de la clôture reconstituée, les textes d'exclusion et l'issue ;
- **paramètre utilisateur** : la convention du jour de comptage, citée.

Aucun seuil, aucune tolérance et aucune durée n'est encodé.

## Sous-lot 2 — coûts et cadrage

### Questions professionnelles

1. Au coût unitaire documenté, que représentent en valeur les écarts de quantité ? Ce sont des **écarts potentiels**, non validés comme anomalies.
2. La valeur théorique déclarée de chaque ligne est-elle égale à la quantité théorique × le coût documenté (écart de prix) ?
3. Pour chaque compte de stock, l'état théorique valorisé est-il cadré avec le solde du grand livre à la clôture ?
4. Une valeur est-elle portée en stock pour un bien que l'entité ne détient pas ?
5. Un total net valorisé cache-t-il des écarts de sens opposés ?

### Sources ajoutées (facultatives : sans elles, aucune valeur n'est dérivée)

| Source | Champs | Contrôles (refus avec ligne, colonne et valeur) |
|---|---|---|
| `st_costs` — coûts documentés | ligne, référence, lot (facultatif), unité, coût unitaire en euros, date, méthode, pièce, libellé | méthode parmi `cmp`, `peps`, `identification_specifique`, `cout_standard`, `prix_de_detail` ; coût ≥ 0 ; date au plus tard à la date de revue ; un seul coût par référence et lot |
| `st_ledger` — grand livre des stocks | compte (identifiant), solde en euros, date, libellé | compte de classe 3 ; date égale à la clôture |
| `st_system` — colonnes ajoutées | valeur théorique en euros, compte | valeur obligatoire pour une ligne détenue une fois la colonne mappée ; valeur ≥ 0 ; compte de classe 3 pour une ligne valorisée |

Toute colonne nommée dans le mapping doit exister dans le fichier (`ST_COLUMN_NOT_FOUND`) : une colonne manquante n'est jamais lue comme vide.

La migration additive `0015_stock_costs_ledger` élargit les contraintes de type de source. Son retour arrière est refusé si des coûts ou des soldes existent.

### Calcul (méthodes internes)

- **Coût applicable** : celui de la référence et du lot, sinon celui de la référence sans lot. **Jamais celui d'une autre référence.**
- **Unité du coût.** Elle doit être celle du théorique et du comptage. Sinon, la valeur est bloquée (`COST_UNIT_INCOMPATIBLE`), sans conversion.
- **Valeur** = quantité × coût, arrondie au centime, le demi-centime s'arrondissant loin de zéro.
- **Écart de quantité valorisé** = écart × coût. C'est un écart potentiel : la note correspondante porte un montant connu.
- **Écart de prix** = valeur théorique déclarée − quantité théorique × coût.
- **Cadrage par compte**, avec :
  - écart = solde du grand livre − somme des valeurs théoriques des lignes **détenues** (propre, consignation déposée, transit, en-cours, référence exclue) ;
  - les stocks de tiers et consignations reçues valorisés sont exclus du cadrage et signalés (`VALUE_ON_NOT_OWNED`) ;
  - les **comptes 39** (dépréciations des stocks et en-cours, plan de comptes du PCG) sont réservés à la revue de valeur.
- **Total net et brut** des écarts valorisés, par référence et au total (`NET_COMPENSATED_VALUE`).

### Méthode de coût

La méthode déclarée pour chaque coût (PCG art. 213-33 à 213-35) est **affichée par compte**. L'outil ne recalcule pas le coût moyen pondéré ni le premier entré, premier sorti, et **n'approuve aucune méthode**. La cohérence des méthodes pour des stocks de nature et d'usage similaires (art. 213-35) relève du jugement humain.

### États

| Code | Nature |
|---|---|
| `PRICE_DIFFERENCE`, `VALUE_ON_NOT_OWNED`, `FRAMING_DIFFERENCE`, `NET_COMPENSATED_VALUE` | Exceptions |
| `COST_MISSING` (valeur inconnue, jamais nulle), `COST_UNIT_INCOMPATIBLE`, `FRAMING_INCOMPLETE` (compte absent du grand livre, valeurs non mappées, ligne valorisée sans compte) | Incertitudes |

### Sources consultées (09/10/2026)

**Plan comptable général** (règlement ANC n° 2014-03), [version consolidée au 1er janvier 2026](https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/Recueils/PCG_janvier2026/PCG--1er-janvier-2026.pdf), page ANC [Plan comptable général](https://www.anc.gouv.fr/plan-comptable-general-0). Nature : **norme comptable**.

| Article | Contenu | Usage dans l'outil |
|---|---|---|
| 213-30 | Composition du coût des stocks ; pertes et gaspillages exclus | Repère, non recalculé |
| 213-31 | Coût d'acquisition | Repère, non recalculé |
| 213-32 | Coût de production | Repère, non recalculé |
| 213-33 | Identification spécifique pour les éléments non fongibles | Méthode déclarée |
| 213-34 | Biens interchangeables : coût moyen pondéré ou premier entré, premier sorti | Méthode déclarée |
| 213-35 | Même méthode pour une nature et un usage similaires ; coût standard et prix de détail s'ils sont proches du coût | Méthode déclarée ; cohérence laissée au jugement humain |
| 214-22 | Évaluation à l'inventaire unité par unité ou catégorie par catégorie ; l'unité d'inventaire est la plus petite partie qui peut être inventoriée | Fonde le choix de l'unité référence / site / lot |
| Plan de comptes, classe 3 | Comptes 31 à 37 ; 39 = dépréciations des stocks et en-cours | Comptes acceptés au grand livre ; comptes 39 écartés du cadrage |

**Limites.** L'outil n'applique aucune de ces règles de coût : il affiche le coût documenté par une pièce et la méthode déclarée. L'évaluation à la valeur actuelle et les dépréciations (art. 214-22 et suivants) relèvent du sous-lot 3. Aucun seuil ni aucune tolérance n'est encodé.

## Sous-lot 3 — revue de valeur

### Questions professionnelles

1. Pour les références revues, la valeur actuelle *selon une hypothèse citée et justifiée* est-elle inférieure au coût documenté ?
2. L'écart indicatif qui en résulte est-il cohérent avec la dépréciation comptabilisée ?
3. Une dépréciation est-elle comptabilisée sans hypothèse qui la documente ?
4. Le détail des dépréciations est-il cadré avec les comptes 39 du grand livre ?

### Sources ajoutées (facultatives : sans elles, la revue n'est pas lancée)

| Source | Champs | Contrôles (refus avec ligne, colonne et valeur) |
|---|---|---|
| `st_value` — hypothèses de valeur | ligne, référence, lot (facultatif), unité, prix de vente estimé par unité (colonne montant), coûts de sortie par unité, date, nature, pièce, justification ; date du dernier mouvement facultative | nature parmi `prix_post_cloture`, `tarif`, `devis`, `estimation_direction` ; **pièce et justification obligatoires** ; coûts de sortie explicites (0 si aucun) ; une hypothèse par référence et lot ; référence ou lot inconnu refusé ; dernier mouvement au plus tard à la clôture |
| `st_system` — colonne ajoutée | dépréciation comptabilisée de la ligne | obligatoire (0 si aucune) pour une ligne détenue une fois la colonne mappée ; jamais négative |

La migration additive `0016_stock_value_review` élargit à nouveau les contraintes de type de source. Son retour arrière est refusé si des hypothèses existent.

### Comparaison (méthode interne, qui ne propose ni ne comptabilise rien)

- **Valeur actuelle selon l'hypothèse** = prix de vente estimé − coûts de sortie. C'est la valeur vénale nette des coûts de sortie (PCG art. 214-6), éclairée par les prix et perspectives de vente (art. 214-22).
- **Écart indicatif.** Si la valeur actuelle est inférieure au coût documenté (art. 214-5) : (coût − valeur actuelle) × quantité théorique ; sinon 0.
- **Différence** = écart indicatif − dépréciation comptabilisée. Si elle n'est pas nulle : `VALUE_REVIEW_DIFFERENCE`, avec **jugement humain motivé et cité requis**.
- **Dépréciation comptabilisée sans hypothèse** : `VALUE_HYPOTHESIS_MISSING` (incertitude).
- **Hypothèse sans coût, sans ligne théorique ou dans une autre unité** : `VALUE_REVIEW_INCOMPLETE` (incertitude).
- **Cadrage des dépréciations** : comptes 39 du grand livre (soldes créditeurs) − détail de l'état théorique (lignes détenues). Écart : `DEPRECIATION_FRAMING_DIFFERENCE`.
- **Rotation.** La date du dernier mouvement est affichée comme **indice** (art. 214-16). **Aucune dépréciation n'est déduite de la rotation**, de l'ancienneté ou d'un seuil.
- **Périmètre de la revue** : les unités testées en quantité et portant une hypothèse. Les autres restent « non revues » ; les écarts de propriété sont hors revue.

### Sources consultées (09/10/2026)

**PCG** (règlement ANC n° 2014-03), version au 1er janvier 2026, texte officiel ANC. Nature : **norme comptable**.

| Article | Contenu |
|---|---|
| 214-5 | Définition de la dépréciation : valeur actuelle devenue inférieure à la valeur nette comptable |
| 214-6 | Valeur actuelle = la plus élevée de la valeur vénale et de la valeur d'usage ; valeur vénale nette des coûts de sortie |
| 214-16 | Indices de perte de valeur, dont l'obsolescence |
| 214-19 | Reprise des dépréciations |
| 214-22 | Évaluation des stocks à l'inventaire ; prix et perspectives de vente |
| 214-23 | Contrat de vente ferme (non modélisé) |

**Limites.** La valeur d'usage, les contrats de vente ferme et les positions globales sur matières (art. 214-22) ne sont pas modélisés. L'outil compare une hypothèse fournie : il ne l'établit pas et ne l'approuve pas.

## Exemple synthétique

Voir `docs/mission15/RECETTE.md`, dont tous les montants sont calculés à la main :
- **sous-lot 1** : 15 unités, 9 testées, 6 exclues avec motif, 9 exceptions ou incertitudes ;
- **sous-lot 2** : 14 exceptions ou incertitudes, dont l'écart potentiel de −24,00 € sur REF-A ;
- **sous-lot 3** : 17 exceptions ou incertitudes, dont la différence de −25,00 € à apprécier sur REF-C.
