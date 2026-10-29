# Prompt P18-04 — Construire la transition IAS 1 → IFRS 18 et les comparatifs

Prérequis : P18-01 à P18-03 terminés. Lis C00–C02 et les dispositions de transition S18 C1–C6 applicables. Applique `AGENTS.md`. Local uniquement ; pas de nouvelle règle de mesure, d’IAS 34 ou de déploiement.

## Objectif

Préparer le comparatif annuel de première application et une réconciliation par rubrique entre présentation IAS 1 antérieure et présentation IFRS 18 du même comparatif. Ce travail est distinct de la variation entre N et N-1 et distinct du pont PCG → IFRS.

## Données et liaisons

Conserve trois objets et leurs versions : présentation IAS 1 antérieure de N-1 ; dataset IFRS de N-1 utilisé pour la représentation IFRS 18 ; dataset/presentation de N. Les montants antérieurs publiés ne sont jamais écrasés. Chaque liaison indique rubrique d’origine, lignes contributrices, destination, montant signé, nature du changement et source.

La première application de référence est 2027 avec comparatif 2026. Ne pas appliquer une date 2027 au rôle comparatif comme si elle rendait ses données 2026 interdites ; la version de présentation cible et la période des valeurs sont deux champs différents.

## Traitements demandés

1. Relie les postes IAS 1 aux lignes détaillées et aux rubriques IFRS 18, y compris répartitions plusieurs-à-plusieurs documentées. Distingue les lignes contributrices des sous-totaux pour ne pas les additionner deux fois.
2. Préserve les composantes de signe opposé d’un ancien poste net. Une ancienne rubrique financière −10 000 peut provenir de +10 000 et −20 000 ; ces composants exigent des sources détaillées. Ne les invente pas en répartissant le solde net par des pourcentages.
3. Classe les différences : regroupement/désagrégation, reclassement de présentation, changement de libellé ; corrections ou changements de mesure externes séparés et documentés. Une simple transformation de présentation ne modifie pas le résultat total. Un écart de mesure ne s’absorbe pas dans un reclassement.
4. Produis le tableau de réconciliation par rubrique avec colonnes appropriées et compositions ; les ouvertures, mouvements et arrivées sont contrôlés. Pas de colonne de solde « autres » absorbant une différence non expliquée.
5. Affiche les comparatifs N/N-1 sur la même base de présentation et avec leurs limites. Si une rubrique manque en N-1, pas de variation égale au montant N par zéro supposé. Pourcentages : base nulle ou non comparable → non déterminé, avec raison ; ne pas afficher l’infini comme KPI.
6. Reprends les comparatifs MPM et leurs changements depuis P18-03, sans générer une deuxième définition de la formule. La relecture de transition porte mapping, sources, montants et versions exacts.

## Fixture indépendante

Jeu comparatif 2026 : produits 900 000 ; achats −360 000 ; personnel −240 000 ; amortissements −50 000 ; autres charges d’exploitation −40 000 ; produit de trésorerie qualifié +10 000 ; intérêts de financement −20 000 ; impôts fournis −50 000 ; absence documentée d’activités abandonnées.

Ancienne présentation de fixture IAS 1 : exploitation 210 000, résultat financier net −10 000, résultat avant impôts 200 000, impôts −50 000, résultat 150 000. Destination IFRS 18 : exploitation 210 000, investissement +10 000, avant financement et impôts 220 000, financement −20 000, avant impôts 200 000, résultat 150 000. Le détail sous-jacent est fourni : ne pas compter le poste financier net comme une troisième contribution.

## Interface et recette

Livre d’abord le tableau de réconciliation et l’inspecteur de composition ; P18-05 ajoutera la vue coordonnée. Une visualisation de redistribution n’utilise pas de largeur négative ; pour des flux de signes opposés, séparer les contributions ou rester au tableau. Le graphique n’est jamais la seule preuve de réconciliation.

Teste conservation du résultat dans une transition pure, rubrique divisée, rubriques fusionnées, ancien poste net, sous-total importé en double, différence de mesure externe, poste manquant, changement MPM, comparatif absent, différence de scope et source remplacée. Les cas réels d’impraticabilité ou de transition complexe hors V1 sont explicitement bloqués, pas traités comme zéro.

Livre modèle de transition, rapprochement et contrôles, tests, captures ciblées et `docs/ifrs/handoffs/P18-04.md`. Aucune liasse complète de première adoption IFRS ni reporting intermédiaire n’est implicitement ajouté.
