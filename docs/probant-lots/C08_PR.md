# Mission C08 — descriptif de PR prêt à examiner

Titre : Stocks — revue de valeur bornée à la valeur comptable, quantité retenue, coûts déclarés et populations (règle 1.1.0, C08)

Base : `main` `c5e717b`.

## Cause

La revue de valeur 1.0.0 (#67) calculait (coût − valeur actuelle) × quantité théorique et la comparait telle quelle à la dépréciation comptabilisée. Sur le dossier de recette, avec le moteur de `c5e717b` (`docs/recette/c08/AVANT-1.0.0.json`) :

- **REF-N (valeur négative).** Coût 10 €, prix 2 €, sortie 5 €, 10 unités : écart indicatif **130 €** pour une valeur au coût de **100 €**, et une différence connue de +130 € sur la note.
- **REF-Q (quantité non rapprochée).** 6 unités comptées pour 10 : estimation « complète » sur 10, avec une différence connue de +10 €.
- **Lot L2.** Le coût de la ligne sans lot était appliqué sans le dire.
- **Totaux.** Un total unique, sans exclusions ni part non revue.

## Changements

Moteur (`stock-value-review.ts`, `stock-valuation.ts`, `stock-contract.ts`) :

- **Trois montants distincts par unité.**
  - Comparaison économique brute.
  - Perte de valeur de l'actif, bornée à la valeur comptable de référence (quantité × coût documenté). C'est le seul montant comparé à la dépréciation comptabilisée.
  - Complément au-delà : `VALUE_EXCESS_TO_QUALIFY`, montant inconnu, ni dépréciation ni provision automatique, pistes de qualification PCG citées.
- **Valeur négative conservée** telle quelle.
- **Quantités exposées** : théorique, comptée, reconstituée, écart, quantité retenue et sa base (rapprochée, non rapprochée, inconnue). Une quantité non rapprochée donne une estimation **partielle** (`gap_partial`, incertitude `VALUE_QUANTITY_UNRESOLVED`, alternative sur la quantité reconstituée), hors du total complet.
- **Base de jugement** rédigée côté serveur et figée avec le résultat.
- **Coûts** : base `lot` / `reference` / `reference_fallback` pour le coût et pour l'hypothèse, capacité `declared` (CUMP / PEPS déclarés, non reconstitués). Aucun sous-lot de reconstitution : les transactions d'ouverture, d'entrée et de sortie valorisées ne sont pas dans les sources.
- **Totaux par population** : complet, partiel, incomplet, non revu (valeur au coût et inconnues), hors revue par motif avec valeur déclarée, dépréciations et comptes 39. Le sous-lot coûts porte sa population.

Versions : règle, gabarit et programme en 1.1.0, résultat `stocks-result-3`. Les résultats 1.0.0 restent lisibles et périmés. Toute commande autre que la révision y est refusée (`ST_RULE_REPLACED_REVISION_REQUIRED`) ; la révision adopte 1.1.0 et l'historique est conservé.

Interface (`/stocks`) :

- **Tableau de revue en 8 colonnes** : coût, valeur actuelle, quantité retenue, comparaison, perte bornée, complément, différence avec la dépréciation comptabilisée.
- **Totaux par population** et cases de la grille : « estimation partielle », « complément à qualifier ».
- **Panneau de détail** : quantités, trois montants, base de jugement, base du coût.
- **Population et capacité** affichées au cadrage.
- **Feuille 1.0.0** : alerte avec bouton de révision, revue affichée en lecture seule.

Registre C01 (1.1.0) : la capacité Stocks dit coûts déclarés, revue bornée et absence d'inventaire physique certifié.

## Sources

PCG consolidé au 01/01/2026 (PDF ANC, SHA-256 identique au résolveur C04), lu le 14/10/2026 : articles 213-33 à 213-35, 214-5, 214-6, 214-15, 214-16, 214-22 à 214-24, 214-26, 321-1, 321-2, 321-5, 321-6, 322-1, 322-2, 322-5, 322-8, 322-9 et 322-12.

ANC 2026-03 a été lu : il ne modifie aucun de ces articles et s'applique aux exercices ouverts dès 2027.

La borne de l'actif, le repli du coût et la quantité retenue sont des **choix internes**, justifiés dans `docs/mission15/CONTRAT.md` § C08 et non attribués à la norme.

## Validation

- **Recette C08** (`stock-value-bounds.test.ts`, attendus posés à la main dans `docs/recette/c08/RECETTE.md`) : 12/12. Cas couverts : coût absent, unité différente, lot sans coût propre avec repli, quantité partielle (écart et non comptée), stock de tiers valorisé, valeur négative, dépréciation déjà comptabilisée, absence de revue, dépréciation non mappée, contrats 1.0.0 / 1.1.0, feuille 1.0.0 au runtime.
- **Suites Stocks** : 64/64. Les attendus chiffrés de la Mission 15 sont inchangés ; ce qui change est la forme et les libellés « déclaré ».
- **Suite complète, recettes PostgreSQL comprises** : 1 749/1 749, sans test ignoré, sur une base jetable locale (PostgreSQL 17.11, migrations jusqu'à 0019).
- **Contrôles statiques** : typecheck et build OK ; lint sans erreur.
- **E2E navigateur** : `e2e/c08-stocks-valeur.spec.ts` à 1440, 1024 et 390 (clavier, axe, débordement, réduction des animations, registre C01) avec `e2e/stocks.spec.ts` et `e2e/c01-context.spec.ts`, 27/27. Captures dans `docs/probant-lots/c08-captures/`.
- **Suite e2e complète** : 209 réussis, 3 échecs et 5 ignorés. Les 3 échecs sont le cas C01 « Stocks » à trois largeurs, qui attendait l'ancien libellé du registre ; l'attente a été alignée et le cas repasse. Les 5 ignorés sont hors lot et **non vérifiés** : 4 du profil local C07 (profil non démarré), 1 du dépôt FEC persistant (dossier non fourni).

## Limites

- **Borne et base comptable.** La borne retenue est la base au coût documenté ; un écart avec la valeur déclarée est signalé, non arbitré.
- **Qualification du complément.** Elle reste humaine ; aucun passif n'est estimé.
- **Hors périmètre de la revue.** Valeur d'usage, contrats de vente ferme et positions globales ne sont pas modélisés. Aucune reconstitution de CUMP ou de PEPS.
- **E2E sans persistance.** Les e2e utilisent le magasin mémoire de test. La conservation d'une feuille 1.0.0 est prouvée au runtime, pas sur PostgreSQL.

Aucun merge ni déploiement réalisés.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
