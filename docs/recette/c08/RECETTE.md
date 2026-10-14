# Recette C08 — valeur, coûts et périmètre Stocks (règle 1.1.0)

Date : 14 octobre 2026. Dossier synthétique : `lib/workpapers/__tests__/stock-c08-fixtures.ts`. Aucune référence, aucun prix et aucune pièce ne viennent d’une entité réelle.

Tous les attendus ci-dessous sont **calculés à la main** à partir des lignes du fixture, avant toute lecture du résultat du moteur. Les tests (`stock-value-bounds.test.ts`, `e2e/c08-stocks-valeur.spec.ts`) comparent le moteur à ces nombres.

Les montants sont en euros. Une quantité de 10 unités s’écrit `1000` en centièmes dans le résultat.

## Dossier

Exercice du 01/01/2026 au 31/12/2026, revue au 31/03/2027. Tous les comptages ont lieu le 31/12/2026 à ENTREPOT-NORD, donc sans mouvement intercalaire. Convention : mouvements du jour du comptage antérieurs au comptage (`INSTR-INV`).

| Réf. / lot | Compté | Théorique | Valeur déclarée | Dépr. comptabilisée | Coût documenté | Hypothèse (prix − sortie) |
|---|---|---|---|---|---|---|
| REF-N | 10 | 10 | 100,00 | 0,00 | 10,00 (CUMP, FA-N) | 2,00 − 5,00 (devis DEV-N) |
| REF-P | 40 | 40 | 320,00 | 100,00 | 8,00 (PEPS, FA-P) | 6,00 − 0,50 (FV-P) |
| REF-M | 12 | 12 | 60,00 | 0,00 | **aucun** | 3,00 − 0,00 (TAR-M) |
| REF-U | 8 | 8 | 72,00 | 0,00 | 9,00 par **unité** | 30,00 − 1,00 par **carton** |
| REF-L L1 | 10 | 10 | 35,00 | 5,00 | 3,50 (lot L1, FA-L1) | 3,00 − 0,00 (référence) |
| REF-L L2 | 20 | 20 | 80,00 | 20,00 | **aucun pour L2** ; 4,00 sur la ligne sans lot (FA-L) | 3,00 − 0,00 (référence) |
| REF-Q | **6** | **10** | 50,00 | 0,00 | 5,00 (FA-Q) | 4,00 − 0,00 (FV-Q) |
| REF-T (tiers) | 30 | 30 (tiers) | 300,00 sur 371000 | — | — | — |
| REF-R | 5 | 5 | 35,00 | 0,00 | 7,00 (FA-R) | **aucune** |
| REF-S | 3 | 3 | 15,00 | 0,00 | **aucun** | **aucune** |

Grand livre : 371000 = 100 + 320 + 60 + 72 + 35 + 80 + 50 + 35 + 15 = **767,00**. 397000 = −(100 + 5 + 20) = **−125,00**.

## Formules (règle 1.1.0, méthode interne)

Pour chaque unité revue, sur la quantité retenue *q* (quantité théorique), au coût documenté *c*, avec la valeur actuelle *v* = prix − coûts de sortie, qui peut être négative :

- comparaison économique *E* = (*c* − *v*) × *q* si *v* < *c*, sinon 0 ;
- valeur comptable de référence *C* = *q* × *c* ;
- perte de valeur de l’actif *A* = min(*E*, *C*) ;
- complément à qualifier *X* = *E* − *A* ;
- différence = *A* − dépréciation comptabilisée.

## Cas et attendus

| Cas (prompt) | Unité | Calcul à la main | Attendu |
|---|---|---|---|
| Valeur négative | REF-N | *v* = 2 − 5 = **−3,00** ; *E* = (10 − (−3)) × 10 = **130,00** ; *C* = 10 × 10 = **100,00** ; *A* = **100,00** ; *X* = **30,00** ; différence 100 − 0 = **+100,00** | statut « gap », quantité rapprochée ; `VALUE_REVIEW_DIFFERENCE` +100,00 € ; `VALUE_EXCESS_TO_QUALIFY`, montant inconnu (pas de provision) |
| Dépréciation déjà comptabilisée | REF-P | *v* = 5,50 ; *E* = 2,50 × 40 = **100,00** ; *C* = 320,00 ; *A* = 100,00 ; *X* = 0 ; différence 100 − 100 = **0** | aucune exception sur REF-P |
| Dépréciation déjà comptabilisée (variante) | REF-N, dépréciation 100,00 | *A* = 100,00 ; différence **0** ; *X* = 30,00 toujours | pas de `VALUE_REVIEW_DIFFERENCE` ; `VALUE_EXCESS_TO_QUALIFY` maintenu |
| Coût absent | REF-M | aucune comparaison possible | statut `cost_missing`, montants inconnus ; `VALUE_REVIEW_INCOMPLETE` et `COST_MISSING` |
| Unité différente | REF-U | carton ≠ unité, aucune conversion | statut `unit_incompatible` ; « Hypothèse en carton, coût en unite, quantité en unite » |
| Lot sans coût propre, repli documenté | REF-L L2 | coût de la ligne sans lot 4,00 (repli) ; *E* = (4 − 3) × 20 = **20,00** ; *C* = **80,00** ; *A* = 20,00 ; différence 20 − 20 = **0** | base du coût `reference_fallback`, signalée dans la base de jugement, au sous-lot coûts et en interface |
| Lot avec coût propre | REF-L L1 | coût du lot 3,50 ; *E* = 0,50 × 10 = **5,00** ; *A* = 5,00 ; différence **0** | base du coût `lot` ; hypothèse en repli `reference_fallback` |
| Quantité partielle | REF-Q | sur 10 : *E* = 1 × 10 = **10,00**, *C* = **50,00**, *A* = 10,00 ; sur 6 : *E* = **6,00**, *C* = **30,00**, *A* = 6,00 | statut `gap_partial` ; `VALUE_QUANTITY_UNRESOLVED` (incertitude) ; aucune `VALUE_REVIEW_DIFFERENCE` |
| Quantité partielle (variante non comptée) | REF-Q sans ligne de comptage | sur 10 : *A* = 10,00 ; quantité reconstituée inconnue | `gap_partial`, alternative absente |
| Stock de tiers valorisé | REF-T | 300,00 sur un compte de stock pour un bien non détenu | hors revue ; groupe « stock de tiers » 1 unité, 300,00 déclarés ; `VALUE_ON_NOT_OWNED` +300,00 |
| Absence de revue | REF-R, REF-S | REF-R : 5 × 7,00 = **35,00** au coût ; REF-S sans coût | « non revue » ; part non revue 35,00 + 1 unité de valeur inconnue |

## Totaux attendus

| Total | Calcul | Attendu |
|---|---|---|
| Unités testées | N, P, M, U, L1, L2, Q, R, S | 9 |
| Estimation complète | N, P, L1, L2 (quantités rapprochées) | 4 unités |
| Comparaison économique complète | 130 + 100 + 5 + 20 | 255,00 |
| Perte de valeur de l’actif complète | 100 + 100 + 5 + 20 | 225,00 |
| Complément à qualifier complet | 30 | 30,00 |
| Estimation partielle (non additionnée) | REF-Q sur 10 | 10,00 / 10,00 / 0,00 |
| Revue incomplète | M, U | 2 unités |
| Part non revue | R au coût ; S inconnue | 35,00 + 1 inconnue |
| Hors revue | T (tiers) | 1 unité, 300,00 déclarés |
| Dépréciations : détail / comptes 39 / écart | 100 + 5 + 20 ; −(−125) | 125,00 / 125,00 / 0,00 |
| Population du sous-lot coûts | 9 testées au coût, 7 valorisées (N, P, U, L1, L2, Q, R), 2 inconnues (M, S), 1 non testée (T) | 300,00 portés pour des biens non détenus, 0 inconnue |
| Même population, colonne de valeur non mappée | T sans valeur déclarée | valeur des biens non détenus **inconnue**, 1 ligne (jamais 0) |

Exceptions et incertitudes attendues : `QUANTITY_DIFFERENCE` (REF-Q, −4 × 5,00 = −20,00), `COST_MISSING` ×2 (M, S), `VALUE_ON_NOT_OWNED` (T), `VALUE_REVIEW_DIFFERENCE` (N), `VALUE_EXCESS_TO_QUALIFY` (N), `VALUE_REVIEW_INCOMPLETE` ×2 (M, U), `VALUE_QUANTITY_UNRESOLVED` (Q). **Neuf** au total ; issue « exceptions détectées ».

## Dossier de référence de la Mission 15

Sous la règle 1.1.0, les attendus d’origine restent valables. REF-C donne toujours (8,00 − 5,50) × 50 = 125,00 contre 150,00 comptabilisés, soit une différence de −25,00. La base de jugement de REF-C signale en plus l’écart entre la valeur déclarée (410,00) et 50 × 8,00 = 400,00. REF-A (98 comptées pour 100) reste sans écart, car sa valeur dépasse le coût sur les deux quantités ; sa quantité est marquée non rapprochée.

Nouveaux totaux attendus du dossier de référence :

- **Part non revue :** REF-B 120 × 0,30 + REF-E Sud 17 × 4,00 + REF-E Nord 20 × 4,00 = 184,00. Deux unités restent de valeur inconnue : REF-G, absente du théorique, et REF-H, sans coût.
- **Hors revue :** sept groupes, dont la consignation reçue de REF-F (écart de propriété, 1 800,00 déclarés) et le stock de tiers REF-T, compté mais absent du théorique, donc de valeur inconnue.

## Avant / après (moteur 1.0.0 sur ce dossier)

`AVANT-1.0.0.json` a été produit le 14/10/2026 en exécutant le moteur de `c5e717b` sur ce même dossier, dans un worktree temporaire :

| Unité | 1.0.0 (`c5e717b`) | 1.1.0 |
|---|---|---|
| REF-N | écart indicatif **130,00** (> 100,00 de valeur au coût) ; différence connue **+130,00** | actif **100,00**, différence +100,00 ; complément **30,00** à qualifier, sans montant ni provision |
| REF-Q | « gap » complet, différence connue **+10,00** sur la quantité théorique non rapprochée | estimation **partielle** (10,00 sur 10, 6,00 sur 6), incertitude, aucune différence établie |
| REF-L L2 | coût de la ligne sans lot appliqué **sans le dire** | repli `reference_fallback` affiché |
| Totaux | un seul total indicatif 265,00 ; aucune exclusion portée | complet, partiel, incomplet, non revu et hors revue séparés |
