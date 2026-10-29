# Prompt P18-01 — Qualifier le profil IFRS 18 et la base de présentation

Prérequis : C00–C02 terminés ; lire leurs handoffs et les quatre documents racine. IFRS 16 n’est pas requis si une base IFRS qualifiée est fournie. Applique `AGENTS.md`. Travail local, pas de push, déploiement ou migration personnelle réelle.

## Objectif et frontières

Créer le dossier de préparation du compte de résultat annuel IFRS 18, sans calculer des traitements de reconnaissance/évaluation absents. Ce module n’est ni un convertisseur de FEC, ni un outil de comptes IFRS complets, ni un moteur de consolidation. Le périmètre V1 est celui du document d’architecture ; ne le remplacer par « toute entreprise non bancaire ».

Relis S18 et la version UE applicable : activités principales, catégories, présentation, MPM et transition. Le texte IASB « issued 2026 » n’est pas, seul, la preuve de l’applicabilité de tous ses amendements à chaque exercice. Règle UE non vérifiée = pas d’activation réelle avec cette qualification ; schémas et scénarios peuvent avancer.

## Qualification du profil

Documente entité, EUR, exercice calendaire N, comparatif N-1, présentation par nature, première application et référentiel de mesure des entrées. Cas de référence : 2027/2026. Pour V1, première application anticipée uniquement en scénario ; une représentation IFRS 18 du comparatif 2026 dans une première application 2027 n’est pas une adoption anticipée en 2026.

Pose les questions explicites d’activité principale d’investissement dans les actifs visés et de financement des clients, avec preuves et jugement. Une réponse oui ou inconnue sort du profil automatique V1. Détecte consolidation/NCI, activités abandonnées non nulles, dérivés/couvertures, IAS 29 et différences de change non couvertes. Ne pas déclarer ces situations non applicables par défaut.

## Formats et données d’entrée

Réutilise imports et approbations. Documente CSV V1 et dictionnaire pour :

1. `PreparationManifest` : nature de la base, auteur/date, source de reporting IFRS, résultat de référence, limites de mesure, ajustements déjà inclus, N et N-1. Une base PCG ou un pont partiel ne permet que le diagnostic.
2. Lignes de résultat normalisées : ID stable, période de référence, montant signé produit positif/charge négative, monnaie, nature économique, compte de reporting facultatif, description, document/ligne source, ancien poste IAS 1 et dimensions nécessaires au classement. La convention de signe brute reste traçable.
3. Ancienne présentation IAS 1 : rubriques et montants publiés du comparatif, composition justifiable et version ; les sous-totaux ne sont pas réimportés comme des lignes contributrices supplémentaires.
4. Registre des communications publiques : document fourni localement, version/date/canal, page et mesure candidate ; le traitement MPM vient en P18-03. Pas de scraping ni publication externe automatique.
5. Sélection éventuelle de bundles L16 : version, périmètre, empreinte et manifeste d’inclusion. N’incorpore que les contributions utiles à la période de résultat ; un compte de bilan ne devient pas une charge.

Les comparatifs portent leur vraie période et leur provenance. Respecte le contrat C01 pour les références inter-périodes/dossiers ; pas de réécriture silencieuse de scope.

## Contrôles à implémenter

Identifiants uniques, montants EUR exacts, données manquantes, lignes de résultat versus bilan/OCI/sous-totaux, cadrage du résultat au reporting de référence par période, doublons économiques, périodes/devises incompatibles, base incluant déjà le bundle sélectionné. Un cadrage de somme ne valide pas tous les traitements IFRS.

Figer population, manifeste et sources. Le rôle `IFRS_prepared` est une conclusion documentée de préparation pour l’usage, jamais déduit du nom du fichier. Si les impôts ou autres ajustements nécessaires restent indéterminés, maintenir le diagnostic ; ne pas présenter un résultat net complet. Les catégories « impôts sur le résultat » utilisent les montants IFRS qualifiés fournis, sans calcul d’IS ou d’impôt différé dans ce module.

## Interface et recette

Écran d’accueil du workspace : profil, sources et contrôles d’admissibilité pour ce périmètre. Les termes « admissible à la préparation » et « conforme aux IFRS » ne sont pas interchangeables. Montrer chaque blocage et sa prochaine action ; pas encore de compte de résultat final.

Teste base IFRS cadrée ; base PCG ; pont L16 partiel ; N-1 absent ; exercice incorrect ; ligne OCI ; sous-total importé comme détail ; doublon ; signe inversé ; activité principale de financement ; activité inconnue ; NCI non qualifié ; source remplacée et double bundle. Produis modèles CSV, dictionnaire, tests, captures et `docs/ifrs/handoffs/P18-01.md`.
