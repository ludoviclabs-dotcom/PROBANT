# Contrat Clients et ventes 1.0.0

Cette procédure interne complète le cadrage `clients.frame` livré. Elle n’émet aucune opinion et n’ouvre aucun autre moteur synthétique en usage réel. Le runtime reste limité à l’infrastructure jetable.

## Population et période

`clients_invoices` contient les factures ouvertes à clôture. Le montant normalisé est **le solde ouvert à clôture**, déjà établi par la source. Il ne représente pas une reconstitution du montant brut. La date de facture précède ou égale la clôture ; le solde est strictement positif. Une facture annulée avant clôture n’appartient pas à cette population.

`clients_payments` et `clients_credits` contiennent uniquement des événements postérieurs à clôture et antérieurs ou égaux à la revue, inclus dans la fenêtre explicitement documentée. Cette distinction empêche de soustraire une seconde fois un paiement antérieur à clôture.

Le cadrage est référencé par identité de feuille, racine, version et empreinte de contenu. Le serveur vérifie sa portée, son état verrouillé et son actualité. Le navigateur ne fournit aucune autorité de revue.

La sélection porte sur les factures. Les encaissements, avoirs et registres de pièces sont des sources associées, versionnées dans les mêmes entrées figées. Le programme prévoit trois contrôles : encaissements/avoirs, estimation/jugement et confirmations. Leurs dénominateurs existent même en l’absence d’anomalie.

## Sources et devises

Mapping fermé `clients-sales-1`, avec une propriété `sales` explicitant la base : `open_at_closing`, `subsequent_payment`, `subsequent_credit` ou `support`. Chaque ligne expose son tiers et sa devise. Une échéance absente demeure absente. L’âge est alors calculé depuis la facture ; aucun retard n’est inventé.

Le socle monétaire actuel couvre EUR. Toute autre devise est refusée explicitement ; aucune conversion implicite n’a lieu.

Limites : 500 factures, 1 000 paiements, 1 000 avoirs et 1 000 lignes de registre. Les choix sont également bornés. Les références de preuve désignent des lignes d’import approuvées de la même organisation, du même dossier et de la même période.

## Affectation et soldes

Un appariement proposé ne réduit jamais un solde. Une allocation validée porte l’identité et la date du préparateur réellement connecté. Les références inconnues, tiers incohérents, montants négatifs, preuves absentes et utilisations excédant le paiement sont refusés par le serveur. Un paiement groupé peut couvrir plusieurs factures dans la limite de son montant. Un acompte demeure identifié et requiert une affectation documentée.

Le total effectif des allocations et des avoirs est plafonné au solde de chaque facture **à chaque date**. Une annulation ultérieure ne masque pas une surallocation antérieure. Un paiement annulé cesse de réduire le solde de revue et son montant disponible est nul. Son histoire demeure visible.

Une annulation de facture constitue une incertitude de traitement ; elle n’annule pas automatiquement le solde. Un avoir approuvé et relié au même tiers et à la facture peut réduire le solde de revue. Le solde à clôture reste fixe dans tous ces cas.

## Estimation et confirmations

L’ancienneté et le reste dû ne produisent aucune dépréciation automatique. L’estimation exige une méthode identifiée/versionnée, son intervalle applicable, une base comparable au solde ouvert à clôture, un montant explicite, un auteur serveur, une justification et des pièces. La comparaison avec la dépréciation comptabilisée demeure inconnue si la méthode, la base ou la source comptabilisée manquent. Le résultat `700 EUR restant` ne signifie ni `700 EUR de perte`, ni `créance entièrement sûre`.

Les confirmations réutilisent le validateur commun : demande, réponse, origine, rapprochement, différences et procédure alternative. Elles ne déclenchent aucun envoi externe. Les versions de chaque confirmation sont conservées dans les versions immuables de la feuille.

Un registre CSV/XLSX fournit des références de pièces ; il n’authentifie pas à lui seul l’origine directe d’une réponse externe. La déclaration d’origine reste visible, mais le résultat conserve l’origine inconnue et une exception tant que l’original externe n’est pas disponible dans cette chaîne. Les pièces externes absentes sont identifiées explicitement.

## Revue, Synthèse et export

Les résultats, exceptions, preuves et décisions partagent les identités et versions de la feuille. La résolution d’une note ou la revue ne retire pas les faits et exceptions du résultat. Une nouvelle configuration invalide le calcul courant et sa conclusion ; une nouvelle exécution puis une nouvelle revue sont nécessaires. Les décisions historiques restent immuables.

L’export conserve les soldes distincts, la fenêtre, les montants affectés, les résiduels, les propositions, les estimations, les confirmations, les incertitudes et leurs localisateurs. Aucun total de perte ou d’exposition n’est déduit de l’ensemble des événements. Le paquet reste un export de travail, sans opinion automatique ni archivage certifié.
