# Tax Review — matrice de données

## Convention

Cette matrice est le contrat de précondition des contrôles décrits dans
`TAX_CONTROL_CATALOG.md`. Une cellule requise absente ne reçoit jamais une valeur
par défaut : l'exécution produit `missing_information`, `inconclusive` ou reste
`blocked`.

Les intitulés de cases sont des identifiants documentaires. L'adaptateur futur doit
les relier au schéma exact du millésime, sans supposer qu'un code de case reste
stable d'une année à l'autre.

| Contrôle | Impôt | Document requis | Champ requis | Source normative / officielle | Automatisation | Preuve maximale | Résultats possibles | Limitation / disponibilité |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `TAX-CROSS-001` | Tous | Chaque pièce fiscale reçue + profil + période | Identifiant entité ; début/fin ; période déclarative ; millésime | Formulaire propre à la pièce ; provenance dossier | Automatique si champs structurés, sinon assistée | `direct` après validation | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive` | Comparaison de nom seule insuffisante. `available` |
| `TAX-DOC-001` | IS, TVA | Inventaire des snapshots ; profil confirmé | Type de document ; période ; statut actif ; empreinte | CGI 53 A, 223 ou 287 uniquement pour l'obligation applicable ; matrice interne pour la couverture PROBANT | Automatique | `direct` sur l'inventaire | `passed`, `missing_information`, `inconclusive` | Absence du dossier ≠ absence de dépôt. `available` |
| `TAX-IS-001` | IS | FEC final ou balance/comptes individuels ; 2058-A | Résultat comptable individuel ; WA ; WS ; dates ; devise | `CGI-53A@1999-03-31`, `CGI-209I@2023-12-31`, `FORM-2050-LIASSE@2026` 2058-A | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Comptes consolidés seuls interdits ; pont d'affectation parfois requis. `available` |
| `TAX-IS-002` | IS | 2058-A complet du millésime | WA/WS ; chaque réintégration et déduction ; total I ; total II ; résultat avant/après déficit | `CGI-53A@1999-03-31`, 2058-A et `NOTICE-2032@2026` | Automatique après adaptateur | `derived` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive` | Arithmétique seulement, aucune qualification de déductibilité. `available` après adaptateur 2026 |
| `TAX-IS-003` | IS | 2058-A ; 2065 | Résultat fiscal bénéficiaire/déficitaire ; résultats/base par catégorie et taux ; exercice | `CGI-223@2017-04-08`, `FORM-2065@2026`, `FORM-2050-LIASSE@2026`, `NOTICE-2032@2026` | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Compartiments spéciaux non agrégeables. Standard MVP `available`, autres `future` |
| `TAX-IS-004` | IS | 2058-A N ; 2058-B N et N-1 ; historique des événements | Stock initial ; déficit de N ; imputation ; stock final ; millésime d'origine | `CGI-209I@2023-12-31`, 2058-A/B, `NOTICE-2032@2026` | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Restructuration, groupe ou historique incomplet bloquent le calcul. `future`, et `non_available` sans historique |
| `TAX-IS-005` | IS | 2058-A ; 2065 ; 2572 ; annexes de crédits ; acomptes | Bases par taux ; IS brut ; contributions ; crédits ; acomptes ; excédent ; solde | `FORM-2065@2026`, `FORM-2572@2026` et notice ; futurs textes de taux/crédits épinglés | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Charge d'impôt comptable non substituable ; annexes nécessaires. `future` |
| `TAX-VAT-001` | TVA | Une 3310-CA3 du millésime applicable | TVA brute ; déductible ; crédit antérieur ; régularisations ; TVA due ou crédit | `CGI-287@PRE-CIBS-2026`, `FORM-3310-CA3@2026` et notice | Automatique après adaptateur | `derived` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive` | Arithmétique seulement. `available` si version de source applicable vérifiée, sinon `non_available` |
| `TAX-VAT-002` | TVA | FEC ou sous-grand-livre TVA collectée ; CA3 ; profil | Mouvements 4457 ; code/taux ; base ; date d'exigibilité ; cases CA3 | `CGI-269@PRE-CIBS-2026`, `CGI-287@PRE-CIBS-2026`, `FORM-3310-CA3@2026` | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation`, `potential_tax_risk` | Numéro de compte seul insuffisant ; sources CIBS requises après transition. Assisté `available`, complet `future` |
| `TAX-VAT-003` | TVA | FEC/sous-grand-livre ; CA3 ; factures ou justificatifs | Mouvements 4456 ; case CA3 ; date d'exigibilité ; facture ; affectation ; coefficient ; exclusion | `CGI-271@2026-02-21`, `BOI-TVA-DED-40-20@2025-01-08`, `FORM-3310-CA3@2026` | Assistée / manuelle | `corroborated` avec justificatifs ; sinon `derived` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation`, `potential_tax_risk` | FEC + CA3 ne prouvent pas le droit. `future` tant que les justificatifs ne sont pas ingestibles |
| `TAX-VAT-004` | TVA | FEC ; ventilation opérationnelle ; CA3 ; profil | Produits ; code/taux ; territorialité ; hors champ/exonération ; exigibilité ; bases CA3 | `CGI-269@PRE-CIBS-2026`, `CGI-287@PRE-CIBS-2026`, `FORM-3310-CA3@2026` | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Aucun taux moyen fictif ; sans ventilation : `non_available`. Sinon `future` |
| `TAX-VAT-005` | TVA | Suite complète de CA3 ; preuve de paiement/remboursement/imputation | Crédit initial/final ; TVA due ; référence, montant et date du règlement ou de la demande | `FORM-3310-CA3@2026` et notice ; source officielle propre au remboursement/imputation | Assistée | `corroborated` | `passed`, `reconciliation_difference`, `missing_information`, `inconclusive`, `review_recommendation` | Écriture bancaire non identifiée insuffisante. `future` |

## Matrice minimale de documents du MVP

| Profil confirmé | Documents minimaux | Couverture possible | Ce qui reste interdit |
| --- | --- | --- | --- |
| IS, réel normal, hors groupe | FEC final ou balance validée, comptes individuels, 2065, 2058-A, 2058-B si déficit | Identité/période, pont du résultat, arithmétique 2058-A, rapprochement 2058-A/2065 | Liquidation de l'IS sans 2572, crédits, taux et annexes |
| TVA réel normal mensuel/trimestriel | Profil TVA, toutes les CA3 de la période, FEC ou sous-grand-livre avec codes TVA | Arithmétique CA3 ; rapprochements collectée assistés | Validation du droit à déduction sans factures et faits d'usage |
| Comptes IFRS consolidés seuls | Aucun ensemble minimal satisfait | Inventaire et `missing_information` | Résultat fiscal français, ajustements et IS |
| Intégration fiscale ou groupe TVA | Documents reçus conservés mais profil hors MVP | Identité/période seulement | Calcul ou conclusion groupe ; statut `future` |

## Provenance requise par champ

Chaque champ utile à un contrôle conserve :

- `documentSnapshotId` et empreinte ;
- type et millésime du formulaire ;
- code de case ou chemin structuré ;
- page et zone, cellule ou ligne source ;
- valeur brute, valeur normalisée, unité et signe ;
- méthode d'extraction et version du parseur ;
- score technique éventuel, qui n'est jamais un verdict ;
- état de validation humaine, acteur et date ;
- transformations ultérieures via les identifiants de trace.

## Données externes

Les textes, formulaires, notices et tables de règles sont des snapshots du plan
connaissance. Ils sont référencés par identifiant depuis l'exécution. Ils ne sont
pas stockés dans les champs déclarés du dossier. Une future API externe suivrait
le même principe, mais aucune API Entreprise n'est une dépendance du MVP.


