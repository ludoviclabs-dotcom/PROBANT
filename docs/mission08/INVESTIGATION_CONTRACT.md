# Contrat d’investigation Achats, fournisseurs et cut-off — Mission 08

Version 1.0.0. Méthode technique interne, distincte d’une référence normative. Ce lot ne valide pas une opinion sur les comptes, ne génère aucune écriture ni envoi externe, et n’active pas la production.

## Périmètre fermé et chaîne durable

Les trois procédures `payables.frame`, `payables.purchases` et `payables.rpne` réutilisent `framePayables`, `testPurchases`, `searchUnrecordedLiabilities`, `analyzeCutoff`, `uniqueEconomicExposures`, les imports, la sélection et WorkpaperService. Les autres moteurs synthétiques restent désactivés pour un dossier réel.

La chaîne reprend les sessions serveur OIDC, les droits organisation/dossier, le contrôle CSRF, les versions immuables et les transactions PostgreSQL existants. Le rôle et l’approbation fournis par le navigateur ne sont jamais une autorité. Auteur de préparation, import, commande et revue proviennent de la session serveur. Une autre identité autorisée doit revoir les travaux. La transaction sérialise les modifications du dossier, compare la version attendue et conserve le reçu d’idempotence. Rejouer le même corps et la même clé ne crée qu’un effet ; changer le corps avec cette clé est refusé.

Les tables historiques `clients_*` sont le stockage partagé existant, malgré leur nom. Leurs protections append-only restent actives. La migration 0007 étend uniquement la liste fermée des types de sources ; son retour arrière est refusé si des sources ou versions Mission 08 existent. Aucun stockage mémoire ne remplace PostgreSQL. Le commutateur `PROBANT_PAYABLES_DURABLE=disposable` réserve les routes à la recette ; `VERCEL_ENV=production` les refuse même si le commutateur est fourni.

Import approuvé → méthode et population figées → calcul versionné → exceptions explicitées → conclusion humaine → soumission → revue distincte → verrouillage. Une préparation modifiée invalide calcul, conclusion et décision avant une nouvelle exécution. Une source remplacée rend la feuille périmée ; la reprise crée une révision, sans réécrire la précédente décision.

## Sources et unités

CSV et XLSX utilisent un mapping strict `payables-investigation-1`. Colonnes communes : identifiant unique, montant principal, date, tiers, devise. La devise de chaque ligne doit être EUR. Les autres devises sont refusées et ne sont jamais converties. Montants monétaires calculés en centimes entiers, sans flottants. Le signe est conservé pour les investigations ; l’inversion n’est permise que pour les trois sources de soldes, pour documenter la convention crédits négatifs.

| Source | Montant principal et date | Champs supplémentaires |
|---|---|---|
| GL / auxiliaire / balance âgée fournisseurs | Solde signé EUR à clôture | Compte et tiers ; convention crédits négatifs |
| Écritures achats | HT, date dans l’exercice | Compte inclus au périmètre, tiers, événement et facture |
| Factures achats / ventes cut-off | HT, date facture au plus tard à revue | Événement, tiers, TVA et TTC sourcés, disponibilité à clôture `yes/no/unknown`, flux `purchase/sale` |
| Réceptions / prestations | Montant technique 0, date fait générateur | Événement, tiers, facture, flux, nature `point/spread` |
| Recherche comptable | HT enregistré ; recherche datée de clôture | Événement, tiers, facture, compte et flux |
| FNP / CCA et absence documentée | HT ; recherche datée de clôture | Événement, compte, tiers, facture, flux ; `FNP/CCA/FAE/PCA/none` |
| Paiements ultérieurs | TTC positif, date dans la fenêtre documentée | Identifiant, tiers et compte bancaire |
| Pièces de méthode / fenêtre | Montant technique 0, date au plus tard à revue | Tiers ; identifiant de la pièce |

Une absence comptable est une ligne de recherche explicite à clôture et de montant nul. L’absence de FNP est une ligne `none` de montant nul, datée de clôture. Des champs vides ou une recherche datée seulement après clôture ne démontrent aucune absence. Ces lignes établissent la provenance des déclarations importées ; l’authenticité et la portée des originaux restent à corroborer par le professionnel.

Une facture représente un événement économique identifié. Plusieurs factures portant exactement la même identité d’événement sont refusées dans cette première chaîne plutôt que fusionnées implicitement. Plusieurs preuves de prestation concurrentes ou une prestation étalée restent non concluantes : aucune allocation linéaire n’est inventée.

## Achats et RPNE

Les achats figent les unités « écriture HT ». Chaque écriture sélectionnée est reliée à une facture du même tiers et événement et à une réception/prestation. Toutes les écritures importées doivent appartenir aux comptes déclarés. Les exclusions ont un motif et restent dans le dénominateur. La recherche comptable complète par événement prévaut sur la seule écriture testée : une sélection partielle n’invente pas une absence d’enregistrement.

La RPNE fige les unités « paiement ultérieur TTC ». Elle conserve séparément la fenêtre, sa couverture, les allocations proposées et les allocations validées, la facture, le fait générateur et les recherches d’enregistrement/FNP. Le serveur refuse mauvais tiers et surallocations du paiement ou du TTC de la facture. Une proposition n’affecte pas le calcul. Un groupe partiellement affecté garde son résiduel TTC et reste non concluant. Une facture sans preuve de prestation reste non concluante. La fenêtre de paiements seule ne prouve jamais l’exhaustivité des dettes.

L’adaptateur expose déjà enregistré / FNP existante / hors période justifié / candidat omission / non concluant et les exclus non testés. Un candidat FNP est le résiduel HT après enregistrement et régularisations sourcés. Le TTC payé n’est jamais traité comme une charge HT. Le candidat reste technique, sans écriture, qualification normative ou opinion automatique.

L’identité économique contient organisation, dossier, période, flux, tiers et clé événement importée. Les deux procédures peuvent observer le même événement. `uniqueEconomicExposures` garde leurs observations et preuves mais un seul résiduel HT. Des montants ou méthodes divergents rendent ce résiduel inconnu avant revue. Les comparaisons de soldes GL/auxiliaire/âge ne sont pas additionnées comme expositions.

## Écrans et export

`/payables` : feuille durable, sources, méthode, période, population/sélection, allocations et investigation ; sauvegarde en cours/sauvegardée/échec, auteur réel et conflit avec comparaison complète. « Sauvegardée » exige une réponse serveur positive. `/payables/synthesis` : programme fermé de trois procédures et six contrôles, file priorisée, décisions, sources attendues, périmé et comparaison avant/après revue. Les couvertures exposent numérateur/dénominateur/exclusions ; les anomalies ne sont pas le programme. `/cutoff` : même identité d’événement, observations des deux parcours et filtres achat/vente/date par rapport à clôture. Les ventes nécessitent leurs sources dédiées ; les montants Clients existants ne sont pas transformés implicitement en preuves de cut-off.

Les liens transmettent la version et l’événement exacts. La revue ne rend aucun statut automatiquement vert ou conforme. DEMO SA historique, atelier synthétique et procédures de mission restent distincts. Le traitement d’une exception conserve résultat et historique.

L’export existant produit JSON, HTML imprimable, PDF standard, manifeste et CSV procédures/décisions/exceptions/sources. L’état est contrôlé avant et après génération : session, permissions et empreinte versionnée. Diagnostic et paquet approuvé sont distincts ; ce dernier exige une procédure sélectionnée courante, revue et verrouillée. Il n’approuve pas implicitement les autres procédures du contexte. Bases HT/TVA/TTC, residual TTC, résiduel HT unique, incertitudes, sources/version/localisateurs et preuves sont conservés. Les pièces binaires sont explicitement absentes du paquet ; leur téléchargement applique les mêmes droits. Aucune certification d’archivage/PDF-A. HTML et JSON gardent Unicode ; le PDF existant utilise sa limitation Latin-1 visible.

## Recette

Les fixtures déterministes couvrent : 1 200 TTC / 1 000 HT prestation antérieure sans FNP ; FNP 1 000 HT existante ; groupe 1 800 TTC dont 1 200 affectés et 600 résiduels ; prestation absente ; événement D détecté par Achats et RPNE et résiduel 600 HT unique. Elles vérifient aussi devise/signe, absence fictive, méthode absente, propositions, tiers, double affectation, méthodes divergentes, sources périmées, Unicode et export multipage.

La recette PostgreSQL fait partie de `clients-durable.integration.test.ts` pour partager l’infrastructure jetable et les sessions réelles de deux organisations/quatre dossiers. Elle vérifie les cinq cas, droits transversaux, auteur serveur, auto-approbation, rejeu, concurrence, invalidation, export/téléchargements, expiration, redémarrage de PostgreSQL et remplacement d’une source avec ancienne décision intacte. Elle est ignorée localement si `PROBANT_CLIENTS_TEST_DATABASE_URL` manque ; aucune simulation n’est présentée comme une preuve de durabilité. Le CI existant l’exécute sur PostgreSQL 17 et lui fournit l’identifiant du conteneur à redémarrer.

Les tests navigateur utilisent des réponses explicites pour vérifier présentation, accusés, conflits, filtres, unités, accès à la bonne version, affichage mobile et accessibilité. Ils ne remplacent pas la recette native. L’IdP OIDC externe, l’authenticité des originaux, un environnement de mission réel et la production ne sont pas exécutés/activés par ce lot.
