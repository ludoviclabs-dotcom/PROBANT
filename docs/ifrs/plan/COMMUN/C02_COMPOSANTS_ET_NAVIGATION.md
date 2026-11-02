# Prompt C02 — Poser le langage visuel et la navigation des ateliers

Prérequis : C01 terminé, contrats C00 et charte racine lus intégralement. Applique `AGENTS.md`, préserve l’existant et travaille localement ; aucun déploiement. Cette mission implémente les composants partagés, pas les moteurs ni les visualisations métier complètes.

## Objectif et disposition

Construis un poste de travail continu : bandeau de contexte, rail de parcours, espace principal, table liée et inspecteur. Reprends les tokens de `app/globals.css`, Inter, JetBrains Mono, Recharts et TanStack Table déjà présents. Ne change pas le thème global, la page d’accueil ou les autres cycles. Pas de grille répétitive de cartes KPI, de 3D, de glassmorphism envahissant ou de nouvelle bibliothèque d’animation sans besoin démontré.

## Travaux demandés

1. Ajoute les entrées de navigation convenues pour « Locations IFRS 16 » et « Présentation IFRS 18 ». Préserve le contexte canonique et les routes existantes ; distingue scénario synthétique et profil local. Si une capacité est indisponible, l’entrée explique la cause et n’affiche pas un écran fictivement terminé.
2. Crée ou adapte les primitives nécessaires : bandeau contexte/version, étapes avec blocages, indicateur de fraîcheur, matrice accessible, table de travail, panneau de preuve, liste d’exceptions, cadre de graphique avec alternative tabulaire et barre d’action. Évite de dupliquer un composant déjà adapté.
3. Implémente un état de sélection commun par workspace : objet sélectionné, filtres d’affichage, période visualisée et panneau ouvert. La population d’exécution et la version revue restent séparées ; un filtre ne change pas un export de dossier sans demande explicite d’export de vue filtrée.
4. Fournis les états vides, en chargement, bloqués, en erreur, périmés et non disponibles. L’écran doit dire « moteur non disponible » tant que les lots suivants ne le branchent pas ; pas de totaux de démonstration dans un dossier réel.
5. Les actions conditionnelles sont dérivées d’un view-model serveur typé, pas de déductions sur des labels ou de zéros affichés. Sauvegarde avec état sale et version serveur retournée ; conflit visible ; aucun écrasement automatique.
6. Respecte la charte : fond graphite, accent bleu existant et nuances violettes ; séparateurs fins ; hiérarchie éditoriale ; chiffres tabulaires. Les changements d’état ne reposent pas seulement sur la couleur.

## Comportements précis

À 1440 px, inspecteur latéral si la table reste lisible. À 1024 px, tiroir réutilisant les conventions existantes. À 390 px, sections empilées et défilement horizontal limité au tableau ; pas de débordement de page. Le tiroir possède un titre, une fermeture au clavier, une gestion correcte du focus et restitue celui-ci à l’élément déclencheur.

Transitions 120–180 ms au maximum pour ouverture/sélection, neutralisées par mouvement réduit. Aucun chiffre financier qui défile artificiellement ; pas de contenu uniquement au survol ; les opérations nécessaires au clavier ont une alternative aux gestes. Les noms d’étapes parlent du travail, pas du code.

## Recette et limites

Teste composants et navigation, contexte conservé, lien direct et retour arrière, absence de contamination démo/réel, états non disponibles, conflit, focus, zoom 200 % et mouvement réduit. Capture les layouts réels à 390/1024/1440 px et inspecte les images. Un contrôle automatisé d’accessibilité complète, mais ne remplace pas, la vérification clavier.

Ne crée pas de visualisation métier remplie pour « faire moderne » avant le résultat canonique. Les fixtures visuelles sont explicitement synthétiques, isolées et ne deviennent pas des sources de résultat. Produis `docs/ifrs/handoffs/C02.md` avec liste des composants, API de sélection, captures, tests et contrats de branchement pour L16-04 et P18-05.
