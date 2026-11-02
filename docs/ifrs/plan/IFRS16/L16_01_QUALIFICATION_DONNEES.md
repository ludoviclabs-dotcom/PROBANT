# Prompt L16-01 — Qualifier et organiser les données de location

Prérequis : C00–C02 terminés. Lis leurs handoffs, les quatre documents racine et `AGENTS.md`. Exécute uniquement ce lot local ; pas de push, fusion, déploiement ou migration personnelle réelle. Les fichiers IFRS 18 ne sont pas à implémenter ici.

## Objectif

Créer un portefeuille qualifié, une population figée et une traçabilité exploitables par le futur calcul. Pas de dette ou ROU calculés dans ce lot. La qualification humaine ne se déduit ni du nom d’un fournisseur ni d’un préfixe comptable.

## Sources et données

Relis S16 sur identification, séparation des composantes, exemptions, durée et options ; S16-R pour le taux ; S16-D si nécessaire. Pour toute comparaison PCG, lire la source française applicable et ne pas généraliser le seul article relatif au crédit-bail. Corrige ou nuance les assertions documentaires de la fiche existante si elles contredisent le périmètre retenu, en conservant la traçabilité avant/après.

Définis et documente les formats CSV V1 (UTF-8, séparateur déclaré, dates ISO, décimal explicite), leurs colonnes et exemples synthétiques :

- Contrats : identifiant stable, bailleur, catégorie d’actif, version et pièce, date de signature distincte du commencement, début/fin et nombre de mois, loyer EUR avec base TVA explicite, actif identifié/contrôle de l’usage avec preuve, composantes de service, options et jugement de durée, durée d’utilité retenue et méthode d’amortissement justifiée.
- Hypothèses : type et source du taux, valeur annuelle effective et unité, date pertinente, justification ; politique d’exemption, décision et auteur. Les champs de scope exclu portent une réponse explicite : variable/indexé, anticipation, incitation, coûts initiaux, remise en état, dépôt, garantie résiduelle, option d’achat, transfert de propriété, modification, dépréciation, capitalisation dans un autre actif.
- Échéances/paiements : contrat/version, date exigible, montant, date et montant réglé, statut et pièce. Les paiements prévus et réalisés ne sont pas confondus. Pour une échéance déjà exigible à la date de revue, une preuve de paiement absente reste inconnue ; une échéance future est `non_encore_exigible`, pas manquante. Si paiement TTC, conserver séparément loyer du modèle, TVA entièrement récupérable qualifiée et total réglé ; récupération incertaine/non récupérable hors calcul V1.
- Comptabilité : lignes de charges/paiements de loyers avec période, compte, pièce, montant, identifiant source et rapprochement. Les comptes 612/613 et récurrences servent à proposer des candidats ; aucune exhaustivité IFRS n’en est déduite.
- Ouverture historique si nécessaire : dette, ROU brut/cumul/net, date, reporting de référence et preuve de revue. Reprise automatique uniquement dans les conditions du contrat V1 ; une ouverture externe ne doit pas devenir une valeur inventée pour équilibrer le calcul.

Le dictionnaire indique pour chaque champ : type, unité, caractère obligatoire, valeurs inconnue/non applicable/zéro, contrôle, source et condition bloquante. Réutilise les imports et l’approbation existants ; ne crée pas un parseur CSV concurrent pour éviter une extension de schéma.

## Règles de population

Une unité économique stable par contrat et périmètre ; les versions/avenants gardent la même lignée, pas un second contrat artificiel. Une correction de transcription initiale et une modification économique effective en cours de contrat ont des natures distinctes ; la seconde reste hors calcul V1. Rejet des identifiants doublés au même niveau ; absence d’appariement conservée ; aucune compensation entre deux bailleurs. Une réimportation identique est idempotente.

Applique toutes les limites V1 du document d’architecture, dont mensualités fixes à terme échu, dates mensuelles, EUR et durée maximale technique. Distingue `non_location`, `exemption_documentée`, `éligible_V1`, `à_qualifier` et `hors_scope_V1` sans les confondre avec les états du run. Une location exclue techniquement n’est pas une exemption normative.

Le gel conserve inclusions, exclusions motivées, sources, hypothèses et empreintes. Mesure séparément couverture du registre fourni et rapprochement de la population comptable fournie. Aucune affirmation d’exhaustivité de tous les contrats de l’entité sur ces seuls dénominateurs.

## Interface livrée ici

Branche l’import et la matrice de complétude réelle sur le shell C02. Colonnes métier stables, filtres « à qualifier / manque de taux / hors scope / non rapproché », inspecteur avec pièce et jugement. Contrôles et boutons nommés clairement ; pas de fausse courbe de dette. Les réponses sauvegardées retournent leur version serveur. Une décision d’exemption demande la politique et son niveau d’application, pas une case « < 5 000 € ».

## Recette et livrables

Contrôle au minimum : contrat complet ; champ vide versus zéro ; durée absente ; taux nominal non converti ; exemption court terme avec option d’achat ; faible valeur non justifiée ; service non séparé ; indexation ; paiement anticipé ; doublon ; contrat comptable non rapproché ; nouveau contrat hors population gelée ; remplacement de pièce ; historique sans ouverture validée ; mauvais scope.

Résultat : schémas, modèles CSV, imports, qualification persistante, gel, tests et captures 390/1024/1440. Produis `docs/ifrs/handoffs/L16-01.md` et un tableau cas → statut → cause → action. Aucun contrat incomplet ne doit devenir calculable par valeur par défaut.
