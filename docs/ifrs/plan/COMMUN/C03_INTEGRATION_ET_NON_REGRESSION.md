# Prompt C03 — Relier les deux ateliers et vérifier le récit complet

Prérequis : L16-06 et P18-06 terminés, C00–C02 lus, handoffs et limites de tous les lots consultés. Applique `AGENTS.md`. Modifications et tests locaux uniquement ; aucun push, fusion, déploiement ou migration personnelle réelle.

## Mission

Vérifie et termine l’intégration transversale sans élargir le périmètre comptable. La promesse à démontrer est : une donnée et son traitement restent explicables, versionnés et comptés une seule fois, de la source au rapport.

## Parcours de référence obligatoire

1. Dossier synthétique local avec contrats, paiements et comptabilité PCG. Qualifier les contrats V1 et exécuter L16 ; ouvrir le détail d’un montant et sa preuve.
2. Produire et revoir un bundle avant impôts, avec statut fiscal explicite. Le sélectionner pour une base IFRS préparée qui déclare ne pas l’inclure. Fournir séparément, si requis pour un résultat net de référence, les traitements fiscaux déjà établis ailleurs : aucun taux ou impôt n’est calculé par ce parcours.
3. Si le manifeste laisse d’autres retraitements nécessaires indéterminés, afficher `partial_bridge` et conserver P18 en diagnostic. Un contrat L16 correctement calculé ne rend pas toute la base IFRS qualifiée.
4. Sur une base IFRS qualifiée de fixture, classer le résultat P18, préparer le comparatif de transition et une MPM. Rapprocher chiffres d’écran et exports au centime. Le bundle n’est jamais additionné aux anomalies C05.
5. Rejouer la sélection du bundle : pas de double montant. Fournir une base qui l’inclut déjà : double sélection refusée. Changer la version du contrat : calcul, bundle et présentation qui en dépendent périmés ; autres contrats et présentations indépendantes conservés.
6. Modifier seulement le mapping P18 : relecture et export P18 à réexaminer, calcul L16 inchangé. Ouvrir une simulation : aucune version revue modifiée.
7. Redémarrer le runtime local et restaurer une sauvegarde sur une base jetable ; retrouver sources, runs, décisions et liens exacts. Ne touche pas la base personnelle réelle.

## Dossier de clôture et capacités

Vérifie les deux procédures au registre : portée locale réelle, limites, mode scénario et activation distincte de l’exécution. Rattache explicitement leurs lignées au programme C14 avec versions et empreintes. Préserve les dénominateurs existants et les effets C11/C05 ; ajouter une section « Travaux IFRS », pas un total financier commun artificiel.

Les statuts affichés restent : exécuté, contrôle déterminé ou non, conclusion, relecture et fraîcheur. Un dossier personnel terminé n’est pas une certification IFRS. Les exports reprennent les limites du périmètre, y compris ce que l’atelier P18 ne couvre pas.

## Non-régression et performance

Relis les scripts courants de `package.json`. Lance typage, lint ciblé puis global si pertinent, tests unitaires, contrôle de migrations, build et E2E ciblés. Vérifie les anciens cas Clients, Emprunts, Immobilisations, fiscalité, clôture et profil personnel touchés par les fichiers partagés. Une recette PostgreSQL requiert une base jetable identifiée ; `skipped` = non vérifié.

Rejoue la charge de référence de chaque atelier et le recalcul ciblé. Mesure les temps et la mémoire sans importer toutes les lignes dans React. Inspecte tableaux, matrices, graphiques, conflits et exports aux trois largeurs de référence ; aucun bouton inactif simulant une fonctionnalité livrée.

## Livrables de sortie

`docs/ifrs/handoffs/C03.md`, bilan final avant/après, matrice exigence/test/résultat, capacités effectivement couvertes, limites et cas non vérifiés, captures et mesures sur machine de référence. Confirme l’absence de modification du déploiement distant. Prépare une note de revue et les commandes locales nécessaires ; ne demande pas de fusion automatique et ne présente pas le site public comme mis à jour.

Une nouvelle amélioration hors scope va dans un backlog distinct avec source, bénéfice et dépendances ; ne la réalise pas en fin de lot pour obtenir une impression de complétude.
