# Prompt P18-06 — Recette indépendante et volumétrie de la présentation

Prérequis : P18-01 à P18-05 terminés et handoffs lus. Applique `AGENTS.md`. Corrections ciblées locales du scope V1 autorisées ; pas d’extension sectorielle, push, déploiement ou migration personnelle réelle.

## Mission

Vérifier le classement, les réconciliations, les mesures de direction et le parcours complet sur des attendus indépendants. Ce lot ne transforme pas un compte de résultat de démonstration en jeu d’états IFRS complet.

## Recette normative et métier

| Domaine | Cas obligatoires | Attendu |
|---|---|---|
| Profil | Entité V1 ; financement de clients comme activité principale ; activité inconnue | Automatisation seulement sur profil qualifié V1 ; aucun classement général forcé |
| Base | IFRS préparée ; PCG ; pont partiel ; bundle déjà inclus | Base qualifiée ou diagnostic clairement limité ; jamais double retraitement |
| Catégories | Fixture 2027 ; cession d’actif d’exploitation ; intérêt identifié ; ligne mixte | Classement justifié, pas par compte ou libellé seul |
| Hors V1 | Activité abandonnée non nulle, dérivé/couverture, change non attribuable, IAS 29, NCI | Blocages explicites sans suppression des lignes |
| Sous-totaux | O 250 000 ; avant financement/impôts 262 000 ; avant impôts 240 000 ; résultat 180 000 | Identités de la fixture P18-02, au centime |
| Mapping | Non classé, règles contradictoires, ventilation, compensation | Aucun montant perdu/doublé ni inconnu transformé en exploitation |
| MPM | Mesure publique, interne seule, ratio, flux, segment, exclusion du texte | Qualification motivée, pas sur le seul nom EBITDA |
| Note MPM | 250 000 + 15 000 − 5 000 = 260 000 ; impôt/NCI documentés ou manquants | Rapprochement exact ; données obligatoires manquantes bloquent le statut revu de la note |
| Transition | Fixture 2026, poste financier net composé, comparaison 2027/2026 | Résultat 150 000 conservé sur reclassement pur ; pas de sous-total compté comme détail |
| Dates | Comparatif 2026 sous cible 2027 ; première application anticipée réelle | Comparatif autorisé par son rôle ; adoption anticipée réelle hors V1 |
| Versions | Pièce, mapping, MPM ou base changés | Dépendances et revue P18 périmées ; L16 intact si non concerné |

## Propriétés et contrôles indépendants

Chaque ligne/fraction est affectée au plus une fois ; somme des affectations et non-affectations = population complète ; les sous-totaux sont des projections, pas des entrées comptées à nouveau. Contrôle exact des montants signés et couverture via lignes + sommes absolues, sans revendiquer une exhaustivité de l’entité.

Une réorganisation pure de présentation conserve le résultat. Un changement de mesure externe est séparé et expliqué. L’ordre d’import, le tri et les filtres ne modifient pas les montants. Écran, graphiques et exports partagent les mêmes valeurs et empreintes.

Tests de mutation : classer toute cession en investissement ; mettre les inconnus en exploitation ; compter le net financier et ses deux composants ; transformer fiscal absent en zéro ; compter un bundle deux fois ; modifier le mapping sans périmer la revue. Les tests doivent détecter chaque faute sans laisser la mutation dans le code livré.

## Volume et résilience

Fixture déterministe de 250 000 lignes normalisées réparties sur N/N-1 et plusieurs natures, sans données réelles. Mesure import, mapping, agrégation, recalcul ciblé, export, mémoire résidente et latence des filtres sur machine documentée. Essai à 1 million facultatif et identifié comme tel, pas prérequis caché ni performance acquise.

Ne déporte pas les sommes dans React. Pagination/virtualisation pour les détails, agrégats pour matrices/graphiques, sélection de preuve bornée. Tester interruption/reprise et absence de publication partielle si traitement en job ; budgets définis dans C00 puis mesurés, pas ajustés silencieusement après échec.

## Parcours UI et livraison

Depuis l’UI : importer et qualifier la base → approuver → figer → proposer/revoir le mapping → produire le résultat → qualifier une MPM → rapprocher le comparatif → relire personnellement → verrouiller → exporter → remplacer une source → constater le réexamen. Tester aussi l’absence de MPM documentée et un dossier seulement diagnostique.

Recette aux largeurs 390/1024/1440, clavier, zoom, mouvement réduit et tableaux alternatifs. Après redémarrage local, retrouver sources et décisions. Exécute typage, lint, tests unitaires, intégrations PostgreSQL jetables, build et E2E ciblés selon les scripts courants ; `skipped` reste non vérifié.

Livre `docs/ifrs/handoffs/P18-06.md`, oracle et fixtures, matrice exigences/tests/résultats, mesures, captures et limites. Ne conclus « prêt pour C03 » que si les portes de sortie sont satisfaites ; aucun badge global de conformité IFRS et aucune promesse de zéro bug.
