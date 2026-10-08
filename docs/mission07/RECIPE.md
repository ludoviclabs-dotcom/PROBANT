# Recette Mission 07 — Clients et ventes

Date : 8 octobre 2026. Lot limité aux encaissements, avoirs, estimation et confirmations. Le cadrage existant reste une procédure distincte, référencée par identité, version et empreinte de sa décision verrouillée.

## Livraison

Deux branches empilées : codex/mission07-security corrige les dépendances avant toute modification fonctionnelle ; codex/mission07-clients complète la chaîne Clients. Les décisions du cadrage et des travaux Clients ont leurs propres versions. Aucun déploiement ni activation de production.

Le nouvel audit recensait les 14 vulnérabilités préexistantes et une alerte Next supplémentaire. Toutes ont été corrigées, sans exclusion d’avis. PR sécurité 57 : CI95 terminée avec succès (installation propre, audit, SBOM, types, lint, suite avec PostgreSQL17 jetable et redémarrage réel, construction, navigateur, migrations aller-retour, CodeQL et recherche de secrets).

## Parcours serveur

Les imports approuvés figent les factures ouvertes à la clôture et les événements postérieurs dans une fenêtre documentée. La source contient un solde ouvert à clôture, distinct du montant brut historique. Seul l’adaptateur clients.sales 1.0.0 est ajouté au parcours réel. Les autres moteurs restent en démonstration.

L’identité provient de la session serveur OIDC existante. Chaque mutation et téléchargement conserve les permissions organisation/dossier. Les schémas de commande rejettent rôle, auteur ou approbation envoyés par le navigateur. Le serveur attribue l’auteur et la date des allocations, estimations et confirmations, conserve ceux des enregistrements identiques et versionne les confirmations modifiées.

La commande et sa réponse sont persistées sous une clé d’idempotence liée à l’acteur et à l’empreinte du contenu. Un verrou de dossier et une comparaison transactionnelle de version empêchent deux écritures concurrentes d’effacer une décision. Une configuration nouvelle invalide résultat, notes de traitement, conclusion et soumission courants ; une révision conserve les anciennes décisions immuables et impose des sources nouvelles validées. Le changement d’une source ou du cadrage lié périme les travaux correspondants.

La recette native ajoute aux contrôles du cadrage : sources de factures/paiements/avoirs/pièces, 1000/300/700, facture annulée après clôture, avoir postérieur, mauvais tiers, paiement utilisé deux fois, auteur forgé, méthode absente, réponse de confirmation remise par le client, rejouage, conflit, auto-approbation refusée, revue distincte, verrouillage, concordance export, accès aux pièces/export, session expirée, reprise après redémarrage PostgreSQL et remplacement d’une source de paiement. Elle utilise deux organisations, quatre dossiers et les identités préparateur/relecteur réellement stockées dans les sessions.

## Interprétation et preuve

1000 EUR à clôture moins 300 EUR affectés donne 700 EUR restant à revue. Ce résultat n’établit ni une perte de 700 EUR ni une créance entièrement sûre. Sans échéance, l’âge est mesuré depuis la facture et le retard demeure inconnu. Les propositions n’affectent aucun solde. Une annulation de facture postérieure laisse le solde clôture inchangé et constitue une incertitude ; un paiement annulé est tracé et cesse de réduire le solde revue. La surallocation est contrôlée à chaque date.

L’estimation conserve méthode/version, intervalle applicable, base, montant, raisonnement, auteur serveur et références de pièces. Méthode ou source comptabilisée absente : comparaison indéterminée. Aucun calcul sur l’âge seul.

Les confirmations réutilisent le contrat commun pour demande, réponse, origine, rapprochement et procédure alternative. Le registre CSV/XLSX ne suffit pas à authentifier une réponse directe : la déclaration d’origine reste visible et l’origine établie reste inconnue. Les originaux externes absents sont identifiés. Aucun envoi externe n’est déclenché.

## Écran et export

Le tableau affiche séparément clôture, encaissements affectés, avoirs et revue. La frise ne modifie jamais rétroactivement la clôture. Panneau de résiduels, estimation/litiges et confirmations reliées aux preuves ; brouillons séparés des calculs serveur. Sauvegardée apparaît après l’accusé serveur. Le conflit compare les allocations, estimations et confirmations du brouillon à la version serveur ; la reprise requiert un choix explicite.

Le programme fixe deux procédures et cinq contrôles : cadrage (deux), encaissements/avoirs, estimation et confirmations (trois). Les compteurs de procédure ne dérivent jamais du nombre d’anomalies. Numérateur, dénominateur, exclusions et incertitudes restent accessibles. Les liens ouvrent identité/version/filtre exacts.

JSON, HTML imprimable, CSV et PDF réutilisent l’export existant. Le paquet approuvé porte explicitement sur la procédure choisie ; les autres travaux sont contextuels. Les exceptions demeurent après revue. Index : procédure/version/document/ligne/localisateur pour toutes les preuves, y compris avoir non apparié, fenêtre et absence d’avoirs. Le PDF conserve la limite Latin-1 existante ; HTML et JSON conservent Unicode. Pas d’opinion automatique ni certification d’archivage.

## Exécutions et limites

- Contrôles locaux de calcul, projection/export et composants : exécutés ; voir les résultats finaux de CI.
- Suite locale : 1110 réussis, une assertion d’ancien libellé corrigée puis relancée ; treize cas PostgreSQL étaient alors ignorés faute de service local. La recette comporte désormais quatorze cas natifs.
- Types et lint : validés ; sept avertissements préexistants, aucune erreur.
- Construction et navigateur : reconstruction finale et recette en cours au moment de ce rapport ; résultats à mettre à jour après exécution.
- PostgreSQL : aucun serveur local installé. L’exécution native finale est confiée au service jetable CI17, sans alternative en mémoire.
- Non exécutés : connexion à un fournisseur OIDC externe et parcours navigateur connecté de bout en bout à ce fournisseur ; authentification des originaux de confirmations externes ; activation et migration de production.

Les essais navigateur interceptent les réponses serveur pour vérifier l’affichage, le rejet, l’accusé et les conflits. Ils ne constituent pas une preuve de persistance. La recette PostgreSQL utilise séparément les handlers, sessions et stockage réels.
