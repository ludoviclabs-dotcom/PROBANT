# Mission 07 — recette de présentation Clients

Date : 8 octobre 2026. Parcours : feuille Clients liée à un cadrage verrouillé ; aucun envoi externe de confirmation.

La table conserve le solde ouvert à la clôture et distingue les encaissements affectés, les avoirs postérieurs et le reste à la revue. La frise donne les dates, effets et références de preuve des événements. Les onglets présentent les propositions d’appariement, les allocations validées, les litiges, les méthodes d’estimation et le suivi des confirmations. Les montants affichés viennent des faits importés et du dernier calcul serveur ; un brouillon ne recalcule pas ces montants.

## Vérifications de composants

Dix tests ciblés sont passés localement : huit dans `client-receivables.test.tsx` et deux dans `clients-sales-workspace.test.tsx`.

- Facture de 1 000 EUR, encaissement affecté de 300 EUR, reste de 700 EUR ; aucune perte automatique ni sûreté affirmée.
- Échéance absente : âge depuis facture ; retard indéterminé.
- Proposition distincte de l’allocation validée ; soldes inchangés pendant une sauvegarde sans accusé.
- Annulation postérieure visible dans la frise et la revue ; solde de clôture conservé.
- Méthode absente : estimation non étayée ; identité et approbation absentes des commandes du navigateur.
- Confirmation reliée aux références de source ; absence d’envoi externe et d’authentification implicite d’un original absent.
- Fenêtre et absence d’avoirs documentées ; déplacement clavier entre les onglets.
- Mapping explicite : solde ouvert à clôture, devise EUR et échéance facultative ; facture cible obligatoire pour un avoir.
- Conflit : brouillon de 300 EUR comparé à 200 EUR serveur, reprise explicite du brouillon ou du contenu serveur, aucun enregistrement anticipé. Le reste serveur de 800 EUR demeure affiché tant qu’une nouvelle configuration n’a pas été exécutée.

Le test de sauvegarde vérifie l’auteur réel renvoyé par le serveur. Le parcours commun conserve la même clé de requête après une panne et le focus/position après documentation d’une exception.

## Recette navigateur définie

`e2e/clients-sales.spec.ts` contient trois parcours : montants 1 000/300/700 et accusé différé, annulation avec avoir ultérieur sans réécriture de clôture, puis allocation refusée et session expirée. Une analyse axe-core WCAG 2.1 AA exige zéro violation sérieuse ou critique sur la feuille Clients. Les résultats d’exécution navigateur sont consignés après le build validé.

Ces tests de présentation utilisent des réponses serveur interceptées. Ils vérifient les contrôles et leurs conséquences à l’écran ; ils ne constituent pas une recette de persistance, d’isolation organisation/dossier, d’OIDC externe ou de téléchargement sur une Preview authentifiée. Ces propriétés relèvent des tests serveur/PostgreSQL et de la recette d’infrastructure consignés séparément. Les originaux absents d’un registre tabulaire ne deviennent pas des pièces présentes par cette recette.
