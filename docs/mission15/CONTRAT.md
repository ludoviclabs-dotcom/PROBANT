# Mission 15 — Stocks et inventaires : contrat

La mission est livrée en trois sous-lots séquentiels, chacun proposé dans une PR distincte :
1. **quantités et mouvements** — livré ici ;
2. **coûts et cadrage** — à suivre ;
3. **revue de valeur** — à suivre.

Ce document décrit le sous-lot 1. Les sous-lots suivants y ajouteront leur section.

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

## Exemple synthétique

Voir `docs/mission15/RECETTE.md` : 15 unités, 9 testées, 6 exclues avec motif, 9 exceptions ou incertitudes, toutes calculées à la main.
