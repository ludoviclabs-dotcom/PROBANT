# Prompt P18-05 — Rendre l’atelier Présentation visuel, révisable et exportable

Prérequis : P18-01 à P18-04 terminés ; C02, charte et conventions C14 lues. Applique `AGENTS.md`. Local uniquement, aucun déploiement et aucun élargissement de règles comptables.

## Objectif

Assembler un poste de travail continu pour comprendre le résultat, résoudre les classements, examiner les MPM et expliquer la transition. Il ne s’agit pas d’une galerie de graphiques indépendante des travaux.

## Parcours

Branche la route convenue sur le serveur : Sources/profil → Classement → Résultat → MPM → Comparatifs → Revue. Le bandeau identifie entité, N/N-1, base de mesure, première application, édition normative, mode et version. Une préparation partielle reste étiquetée diagnostic, même si tous les graphiques sont dessinés.

### Vues coordonnées obligatoires

1. Matrice nature × catégorie avec nombres de lignes et montants, total non classé séparé et filtres réversibles. Clic cellule → table contributrice et inspecteur.
2. Compte de résultat par nature, rubriques et sous-totaux, colonnes N/N-1 ; clic ligne → composition. Les variations indiquent si les bases sont comparables ; pas de pourcentage sur une base nulle ou inconnue.
3. Table des propositions de mapping, aperçu des actions en lot et justification de revue. Les règles proposées ne deviennent pas approuvées par couleur verte ou validation de formulaire front-end.
4. Pont de transition IAS 1 → IFRS 18, tableau canonique, sélection et surbrillance des compositions. Pas de Sankey dans V1 ; un graphique décoratif ne doit pas compliquer ou masquer la réconciliation signée.
5. Registre MPM et pont en cascade du sous-total IFRS comparable à la mesure de direction, avec ajustements signés. Impôt/NCI ont leurs colonnes documentaires ; l’absence de données ne devient pas une économie fiscale supposée.
6. Inspecteur borné de traçabilité : montant → lignes → mapping/hypothèse → pièce. Limite le nombre d’objets montrés et propose la table paginée ; pas de graphe global de chaque écriture.

## Interactions et design

Réutilise C02 et les tokens actuels. Accent produit pour action/sélection ; nuance violette pour règles/hypothèses ; couleur de catégorie accompagnée d’un libellé. Pas de rouge automatique sur une charge normale. Chiffres tabulaires, colonnes lisibles et espaces éditoriaux ; un graphique principal par tâche plutôt qu’une grille de cartes.

Les filtres d’affichage, la sélection de lignes, le mapping approuvé, la population exécutée et la version revue restent distincts. Toute édition métier demande une commande versionnée et affiche son état de sauvegarde. Revenir d’un détail restaure les filtres/position. Conflit : explication et rechargement, pas d’écrasement silencieux.

1440/1024/390 px selon la charte ; inspecteur en tiroir si nécessaire, défilement local des tables, clavier et focus restitué, zoom 200 %, mouvement réduit. Transitions courtes, aucun chiffre financier décorativement animé, aucune interaction seulement au survol.

## Revue et clôture

Prépare une synthèse de points : base IFRS et limites ; profil ; classements ; sous-totaux ; MPM/absence documentée ; comparatifs/transition ; sources et versions. Réutilise relecture personnelle nommée, soumission, verrouillage et fraîcheur existants. Un changement de mapping périme cette présentation et sa revue, pas le moteur L16.

Rattache P18 au programme C14 dans la section IFRS séparée. Ne transforme pas les retraitements normaux, désagrégations ou changements de présentation en anomalies C05. Les contrôles de cohérence de P18 ne valident pas la qualité de toutes les évaluations sous-jacentes.

## Exports V1

JSON canonique ; CSV du compte de résultat, mappings, réconciliation et MPM ; rapport HTML imprimable avec manifeste. Inclure la base de mesure déclarée, les versions et empreintes, profil et limites, sources, mappings, résultat N/N-1, transition, note de travail MPM et décisions. Mention explicite : compte de résultat et travaux associés sur périmètre V1, pas états financiers IFRS complets.

Diagnostic et revu ont des intitulés différents. Le rapport revu nécessite les données obligatoires, la bonne version et les décisions à jour. PDF natif hors V1 ; le HTML reste imprimable par l’utilisateur, sans prétendre qu’un PDF est livré. Sources binaires hors paquet par défaut.

## Recette et livrables

Teste les états vide, partiel, non classé, conflit, source remplacée, MPM absente documentée, MPM non qualifiée, fiscal manquant et comparatif absent. Vérifie table/graphique/CSV/JSON/HTML identiques, navigation clavier et captures inspectées aux trois largeurs. Livre les composants branchés, workflow de revue, exports et `docs/ifrs/handoffs/P18-05.md`.
