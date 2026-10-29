# Prompt P18-02 — Classer et agréger le résultat sans modifier sa mesure

Prérequis : P18-01 terminé, contrats C00–C02 lus. Applique `AGENTS.md`. Implémentation locale uniquement, pas de changement du moteur L16 ni de déploiement.

## Objectif

Construire le moteur de classement du compte de résultat par nature pour le profil V1 qualifié. Il classe des données déjà préparées en IFRS ; il ne réévalue pas créances, contrats, impôts, actifs ou passifs.

Lis les passages applicables de S18 §41–43, §47–85 et les compléments pertinents, notamment les différences entre opérations de financement et autres passifs. Les règles réelles exigent le pack validé pour la juridiction et la période. Le cas général couvert ne doit pas être présenté comme un moteur sectoriel universel.

## Modèle et règles

1. Sépare **catégorie**, **rubrique**, **nature de charge/produit**, **ordre de présentation** et **règle de mapping**. Chaque mapping porte version, population, critères déterministes, justification et sources. Un préfixe de compte peut proposer un candidat, jamais décider seul de sa nature économique.
2. Conserve les cinq catégories du modèle. En V1, les activités abandonnées non nulles bloquent ; leur absence doit être confirmée sur la base fournie. Les lignes non classées restent une population visible et ne sont pas versées automatiquement dans « exploitation » comme poubelle technique. Une règle d’exploitation générale ne s’applique qu’après qualification et revue du contexte requis.
3. Distingue les produits/charges d’actifs qui génèrent un rendement autonome et les éléments liés à l’exploitation ; ne classe pas toutes les cessions en investissement. Différencie les intérêts identifiés des autres variations de passifs selon les textes applicables. Les cas complexes hors V1 restent bloqués et motivés.
4. Une ligne mixte nécessite une ventilation documentée vers des fractions identifiées. Somme des fractions = ligne source en centimes, preuve de composition et aucune double affectation. Pas de ventilation par pourcentage inventé ni de compensation de lignes de sens opposé sans fondement.
5. Les propositions sont distinguées des mappings revus. Les actions en lot annoncent les lignes et montants concernés ; confirmation de la commande métier, aperçu des exceptions, pas d’approbation automatique à l’import.
6. Implémente les agrégats pour le profil V1 : résultat d’exploitation ; résultat avant financement et impôts sur le résultat ; résultat avant impôts calculé comme sous-total utile ; résultat de période. Les titres et regroupements respectent le texte vérifié, pas une imitation de présentation PCG.

Convention signée : `O` = total exploitation, `V` = investissement, `F` = financement, `T` = impôts sur le résultat et `A` = activités abandonnées. Identités du scope : `avant_financement_impôts = O + V`, `avant_impôts = O + V + F`, `résultat = O + V + F + T + A`. `A` est zéro documenté dans V1, pas un montant forcé à zéro. Les sommes exactes ne suffisent pas à prouver le bon classement.

## Projection et traçabilité

Publie une projection serveur unique : arbre des rubriques, compositions, catégories, montants N/N-1, non-classés, conflits de mapping, dénominateurs de couverture et empreintes. Le choix de rubrique ne modifie pas le montant source. Conserve anciennes versions et raisons des changements.

Pas de nouveau framework de règles générique ou d’IA qui décide la catégorie. Si les temps le justifient, lots locaux et agrégats indexés, avec publication atomique ; aucun téléchargement des 250 000 lignes dans React pour additionner les totaux.

## Fixture indépendante

Jeu synthétique 2027 : produits 1 000 000 ; achats −400 000 ; personnel −250 000 ; amortissements −60 000 ; autres charges d’exploitation −40 000 ; produit de trésorerie qualifié investissement +12 000 ; intérêts de dette qualifiés financement −22 000 ; impôts sur résultat fournis −60 000 ; aucune activité abandonnée documentée.

Attendus : exploitation 250 000 ; avant financement et impôts 262 000 ; avant impôts 240 000 ; résultat 180 000. Ces valeurs sont celles de la fixture, pas des barèmes ou taux. Établis-les indépendamment du moteur.

## Recette

Teste cette fixture, cession d’un actif d’exploitation, poste mixte avec ventilation approuvée, conflit de deux règles, charge de signe positif légitime/documentée, ligne inconnue, impôts non calculés mais fournis/qualifiés, catégorie absente, montant nul, compensation interdite et source changée. Un résultat diagnostique peut montrer une partie classée, mais pas un compte de résultat revu tant qu’une ligne pertinente reste indéterminée.

Livre moteur/adaptateur, matrice de règles, tests et `docs/ifrs/handoffs/P18-02.md`. L’UI complète vient en P18-05 ; aucun graphique ne doit recalculer les sous-totaux.
