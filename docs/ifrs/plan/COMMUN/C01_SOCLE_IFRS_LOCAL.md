# Prompt C01 — Implémenter le socle local commun, sans les moteurs

Prérequis : C00 terminé ; lire son handoff, les contrats produits et les quatre documents racine. Applique `AGENTS.md`. L’autorisation porte sur ce lot uniquement : modifications et tests locaux, pas de push/fusion/déploiement ni de migration de la base personnelle réelle.

## Objectif

Créer le minimum partagé nécessaire aux deux ateliers : identité de contexte, snapshots, manifestes, références normatives, exécution versionnée et bundle de retraitement. Il ne s’agit pas d’ajouter un moteur IFRS universel ni de réécrire les cycles existants.

## Implémentation demandée

1. Introduis les schémas typés/validés décidés en C00, en réutilisant `Money`, `KnownAmount`, dates civiles, `stableSha256`, imports et preuves. Montants sérialisés en chaînes EUR, calculs en centimes `bigint` ; valide les tailles, unités, identifiants et limites. Les valeurs décimales de taux/facteurs ont un type distinct de `Money`.
2. Étends de manière ciblée `WorkpaperService`, registre de calcul, modèles de run et adaptateurs persistants pour les deux procédures. Un adaptateur encore sans moteur doit retourner une incapacité explicite, jamais un résultat réussi avec des zéros. Pas de contournement par un stockage client ou un faux rôle navigateur.
3. Implémente un manifeste de base : `PCG`, `IFRS_prepared`, `partial_bridge`, périodes, résultat de référence, ajustements inclus, preuve de préparation et limites. Sa validation est spécifique à l’usage du dataset ; elle ne certifie pas tous les traitements IFRS de l’entité.
4. Crée le contrat de bundle : identité économique stable, version, base attendue et empreinte, entrées équilibrées en débit/crédit, base de mesure, statut fiscal, statut proposé/sélectionné et preuve. L’équilibre ne prouve pas la pertinence de l’écriture. Aucun import du même ID logique avec même version ne peut doubler les montants ; contenu différent sous même identité/version = rejet.
5. Définis les dépendances et empreintes au niveau utile : sources, contrat, politique, règle, mapping, sélection de bundle. La nouvelle version conserve l’ancienne et ses preuves. Une simple consultation n’invalide rien.
6. Réutilise compare-and-swap et transactions existants : version attendue, idempotence, absence de double publication et reprise après conflit. Pour une chaîne L16 → P18, la sélection lit la version exacte ; un bundle périmé ou remplacé entraîne refus ciblé et réexamen.
7. Pour les comparatifs P18, garde le périmètre réel de la donnée et son rôle N-1. Ne réécris pas les identifiants de scope pour faire passer les contrôles existants. Un document déposé pour le dossier N peut déclarer une période de référence N-1 ; une référence à un autre dossier nécessite une lecture explicite autorisée, typée et vérifiée, pas une jointure libre.
8. Ajoute seulement les migrations additives nécessaires, dans l’ordre alors courant, avec manifeste vérifié. Teste montée de version sur base jetable vierge et avec fixtures existantes ; retour arrière refusé si destructeur pour des données présentes. Les objets binaires continuent d’utiliser le stockage de pièces existant.

## Interface et portée

Pas d’écran de résultats ni de calcul L16/P18 dans ce lot. Exposer les capacités configurées et les limites au bon niveau, sans les annoncer exécutées. Pas de nouveau serveur Python permanent, de service cloud ou de queue Vercel pour le profil PC. Si un job de calcul devient nécessaire, prévoir un port ciblé compatible avec le runtime local ; ne construire l’ordonnanceur concret que pour le besoin démontré par les lots de calcul.

## Recette minimale

- Sérialisation de gros montants sans perte ; zéro connu, inconnu, non applicable et valeur vide distincts.
- Mauvaise entité/période/juridiction : rejet, sans écriture partielle.
- Même commande rejouée : même résultat, pas de doublon ; même version avec contenu différent : conflit.
- Deux modifications concurrentes : une seule réussit ; l’autre reçoit une réponse de conflit exploitable.
- Bundle déséquilibré, déjà inclus, obsolète ou ciblant une mauvaise base : rejet avec motif.
- Source remplacée : seule la chaîne dépendante devient à réexaminer ; historique conservé.
- Échec au milieu d’une transaction : aucune projection finale publiée.
- Reprise d’une base existante : aucun changement de lecture des feuilles des autres cycles.

Exécute les tests ciblés, typage, lint pertinent et contrôle de migrations selon les scripts réellement présents. Produis `docs/ifrs/handoffs/C01.md`, le contrat des nouvelles données et le bilan des migrations. Ne déclare pas les moteurs prêts avant leurs lots dédiés.
