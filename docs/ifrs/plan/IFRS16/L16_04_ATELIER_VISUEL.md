# Prompt L16-04 — Construire le poste de travail visuel Locations

Prérequis : L16-01 à L16-03 terminés ; lire le handoff C02 et la charte complète. Applique `AGENTS.md`. Travail local, aucun déploiement et aucune extension du moteur comptable dans ce lot.

## Objectif

Permettre de comprendre le portefeuille, traiter les exceptions et justifier les montants sans naviguer entre formulaires dispersés. Les graphiques sont des portes d’investigation reliées à la table et à la preuve, pas des résultats recalculés côté client.

## Parcours et écrans

Branche `/ifrs/locations` (ou route confirmée en C00) sur les résultats serveur. Rail métier : Sources → Qualification → Calcul → Retraitements → Revue. La progression s’appuie sur des états réels et indique pourquoi une étape est bloquée ; un contrat peut être consulté sans être calculable.

La page de portefeuille présente une ligne de synthèse compacte : nombre de contrats du registre fourni, calculables, exclus avec motif et à qualifier ; montants partiels explicitement étiquetés. Ne reproduis pas une grille de cartes KPI.

### Vues coordonnées requises

1. Matrice de complétude issue de L16-01, avec tri/filtre et navigation clavier ; chaque cellule mène au champ et à sa source.
2. Table de portefeuille : contrat, bailleur, dates, loyer, taux qualifié, dette, ROU, cadrage et revue. Pagination ou virtualisation ; pas de 120 000 lignes montées dans le DOM.
3. Frise du contrat sélectionné : prise d’effet et échéances ; options seulement comme jugements documentés. Pas de modification d’échéance par simple glisser-déposer.
4. Courbes dette/ROU net du même périmètre, info-bulle et alternative tabulaire. Afficher le fait qu’un portefeuille partiel exclut des contrats bloqués. Les axes et unités sont explicites ; pas d’axe tronqué trompeur.
5. Barres principal/intérêts et pont de dette ouverture → mouvements → clôture, puis pont ROU distinct. Les graphiques lisent les mêmes lignes que l’échéancier.
6. Pont PCG–IFRS et journal sélectionnable de L16-03, par poste, avec fiscal indéterminé visible. La sélection d’un retraitement ne se déduit pas d’un clic sur une barre.
7. Inspecteur : contrat/version, hypothèses, justification du taux et de la durée, formule et valeur de haute précision/arrondie, lignes comptables et pièces. Le niveau de preuve exact est affiché ; un lien au document entier ne prétend pas pointer une cellule.

## Interactions précises

Un clic dans une visualisation sélectionne/filtre sans changer le périmètre d’exécution. Les filtres actifs sont visibles et réinitialisables. Retour au portefeuille : préserver recherche, tri et position. Une comparaison de versions utilise deux snapshots exacts ; afficher les changements et leurs limites, pas un « effet taux » causal calculé par différence sans méthode.

Ne construis pas de simulateur paramétrique taux/durée dans V1. La comparaison de deux versions déjà exécutées est incluse ; les scénarios synthétiques de démonstration restent explicitement non revus et séparés des données réelles. Aucun curseur ne doit modifier une hypothèse officielle sans commande de sauvegarde.

Charte : graphite/bleu existant, ROU violet, dette bleue ; chiffres tabulaires, séparateurs fins et détail latéral. Motion discrète, pas de compteurs financiers animés, de nuages 3D ou de réseau global. Toute interaction est utilisable au clavier et sans survol.

## États et recette visuelle

Teste vide, charge, calcul long, contrat manquant, paiement discordant, hors scope, fiscal inconnu, résultat partiel, aucune ligne filtrée, source remplacée, version revue et conflit. À 390 px, pas de débordement global ; à 1024 px, inspecteur en tiroir ; à 1440 px, panneau si espace utile. Vérifie zoom 200 %, longue référence, nombre négatif et mouvement réduit.

Capture et inspecte les vrais écrans à ces largeurs. Teste les égalités entre graphique, table et JSON canonique. Aucune valeur en dur hors scénario isolé et nommé. Livre composants branchés, tests E2E ciblés, captures et `docs/ifrs/handoffs/L16-04.md` avec les limites restantes.
