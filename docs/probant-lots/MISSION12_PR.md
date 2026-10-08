# Proposition de PR — Mission 12

Titre : Participations : droits applicables, distributions et valeur comparable

Le contrôle des participations comparait la valeur externe au coût et ne rendait pas lisibles les bases incompatibles. La revue distingue désormais coût et valeur nette, droits homogènes et allocations préférentielles, valeur d’entreprise / fonds propres / détention, avec état non concluant dès que la comparaison n’est pas documentée. Distribution 40, droits homogènes 25 %, produit enregistré 9 : droit attendu 10, écart arithmétique −1, sans proposition automatique.

La feuille `/participations`, reliée à la synthèse, expose la population titres/distributions, le détail droits/produit/encaissements, les preuves versionnées, les hypothèses et scénarios fournis, les différences entre versions et les décisions motivées. Aucun DCF ajouté, aucun scénario favorable sélectionné automatiquement, aucun seuil universel de détention.

Intégration : imports CSV/XLSX existants, modèle canonique, registre de calculs, sessions et droits serveur, workflow/versionnement/revue distincte. Migration additive 0011 pour sept types fermés ; manifestes contrôlés. Le gate durable reste désactivé, refusé en production ; la démonstration locale est synthétique et en lecture seule.

Validation : suite complète 1 267 tests réussis / 32 ignorés ; recette finale 33 tests ciblés réussis (dont 3 interface), typecheck/build validés, lint sans erreur (7 avertissements préexistants). Captures Chrome 1440/1024/390 et reduced-motion réel, rapport dans mission12-captures/ui-qa.md ; détails dans HANDOFF.md. Quatre tests PostgreSQL additionnels sont préparés dans le harnais partagé ; non exécutés sans base locale jetable configurée. Migrations non appliquées dans cette session. Pièces PDF et qualification métier indépendante hors de la recette structurée ; diagnostic HTML/JSON, aucun archivage certifié revendiqué.

Intégration autorisée le 2026-10-09 : publication et fusion de Mission 12. Base 464bdc7b886a18d4f0da5c2255b8400a02a204df, identique à la tête de PR #62 ; la PR vers main inclut donc les dépendances Missions 08 et 11 déjà présentes dans cette base. Les contrôles CI complets, PostgreSQL et migrations compris, doivent réussir avant fusion. Les limites locales historiques restent documentées ; les gates de production restent fermés.

