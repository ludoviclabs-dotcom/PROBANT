# Tax Review — catalogue des contrôles

## Statut du catalogue

Catalogue de conception au 16 août 2026. Aucun contrôle ci-dessous n'est encore
implémenté par TAX-00. `available` signifie « spécification assez bornée pour une
PR d'implémentation », non « contrôle présent en production ».

Les contrôles existants du moteur FEC restent dans leurs registres actuels. Le
moteur fiscal peut consommer leurs résultats mais ne les duplique pas. En
particulier, un constat `tax_review` ne participe jamais au rejet technique du FEC.

## Sources officielles épinglables

| Source ID | Référence officielle | Version / effet utile | Usage |
| --- | --- | --- | --- |
| `CGI-53A@1999-03-31` | [CGI, article 53 A](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000006302451) | En vigueur depuis le 31 mars 1999 | Déclaration annuelle permettant de déterminer et contrôler le résultat imposable |
| `CGI-209I@2023-12-31` | [CGI, article 209, I](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048847486) | En vigueur depuis le 31 décembre 2023 au jour de la revue | Détermination du résultat IS et report déficitaire |
| `CGI-223@2017-04-08` | [CGI, article 223](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000034387974) | En vigueur depuis le 8 avril 2017 au jour de la revue | Déclaration des personnes morales passibles de l'IS |
| `FORM-2065@2026` | [Formulaire 2065-SD, millésime 2026](https://www.impots.gouv.fr/formulaire/2065-sd/impot-sur-les-societes) | Millésime 2026 ; applicabilité exacte à épingler par période | Déclaration IS |
| `FORM-2050-LIASSE@2026` | [Liasse 2050 à 2059-G, millésime 2026](https://www.impots.gouv.fr/formulaire/2050-liasse/liasse-fiscale-du-regime-reel-normal-en-matiere-de-bic-et-dis) | Millésime 2026 | 2058-A, 2058-B et autres tableaux du réel normal |
| `NOTICE-2032@2026` | [Notice de la liasse BIC/IS, millésime 2026](https://www.impots.gouv.fr/formulaire/2032-not-sd/notice-pour-remplir-la-liasse-bicis-regime-rn-tableaux-ndeg-2050-sd-2059-g-s) | Millésime 2026 | Sens des cases et reports |
| `FORM-2572@2026` | [Relevé de solde IS 2572-SD, millésime 2026](https://www.impots.gouv.fr/formulaire/2572-sd/releve-de-solde) | Millésime 2026 | Liquidation, acomptes, crédits et solde |
| `CGI-287@PRE-CIBS-2026` | [CGI, article 287](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048826856) | Version applicable avant la recodification TVA ; sélection par date obligatoire | Contenu et périodicité de la déclaration TVA |
| `CGI-269@PRE-CIBS-2026` | [CGI, article 269](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044983827) | Version applicable avant le 1er septembre 2026, sous réserve des dispositions transitoires | Fait générateur et exigibilité TVA |
| `CGI-271@2026-02-21` | [CGI, article 271](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053545646) | Version depuis le 21 février 2026 ; transition au 1er septembre 2026 à gérer | Droit et date de déduction |
| `FORM-3310-CA3@2026` | [Formulaire 3310-CA3-SD, millésime 2026](https://www.impots.gouv.fr/formulaire/3310-ca3-sd/tva-et-taxes-assimilees-regime-du-reel-normal-mini-reel) | Millésime 2026 | TVA brute, déductible, crédit ou montant à payer |
| `BOI-TVA-DED-40-20@2025-01-08` | [BOI-TVA-DED-40-20](https://bofip.impots.gouv.fr/bofip/1133-PGP.html/identifiant%3DBOI-TVA-DED-40-20-20250108) | Publication du 8 janvier 2025 | Conditions temporelles de la déduction |

Le registre futur doit conserver l'URL pérenne, l'identifiant juridique, la date
de consultation, les paragraphes utilisés, la période d'effet et l'empreinte du
snapshot autorisé. Une page de formulaire ne remplace pas une règle de droit ;
elle fixe le schéma et les reports du millésime.

## Fiche `TAX-CROSS-001` — identité et période des pièces

- **Exigence** : vérifier que l'entité, la période et le millésime de chaque pièce
  concordent avec `TaxProfile` et `TaxPeriod`.
- **Famille / domaine / stage** : `internal` / `cross_tax` / `tax_review`.
- **Sources** : provenance des pièces ; les formulaires officiels ne fondent pas
  une obligation de présence dans PROBANT.
- **Applicabilité** : toute pièce fiscale reçue.
- **Entrées** : SIREN/SIRET ou dénomination, dates d'ouverture et clôture, période
  déclarative, millésime.
- **Automatisation / preuve maximale** : `automatic` ou `assisted` / `direct` après
  validation des champs extraits.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`.
- **Limite** : une dénomination similaire ne prouve pas l'identité juridique.
- **Conclusion** : contrôle de cloisonnement interne ; il ne qualifie jamais une
  non-conformité fiscale.
- **Capacité** : `available`.

## Fiche `TAX-DOC-001` — complétude documentaire du périmètre sélectionné

- **Exigence** : vérifier que les documents et périodes requis par les contrôles
  sélectionnés sont disponibles dans le dossier.
- **Famille / domaine / stage** : `internal` / `cross_tax` / `tax_review`.
- **Sources** : matrice de données versionnée ; `CGI-53A`, `CGI-223` et `CGI-287`
  servent uniquement à déterminer les obligations lorsque le profil est confirmé.
- **Applicabilité** : profil fiscal confirmé.
- **Entrées** : profil, périodes, inventaire des `TaxDocumentSnapshot`.
- **Automatisation / preuve maximale** : `automatic` / `direct` sur l'inventaire.
- **Résultats** : `passed`, `missing_information`, `inconclusive`.
- **Limite** : « absent de PROBANT » ne signifie pas « non déposé ».
- **Conclusion** : signal de couverture, sans `confirmed_non_compliance`.
- **Capacité** : `available`.

## Fiche `TAX-IS-001` — résultat comptable vers 2058-A

- **Exigence** : rapprocher le résultat comptable issu des comptes individuels avec
  le bénéfice comptable WA ou la perte comptable WS du 2058-A.
- **Famille / domaine / stage** : `methodology` / `corporate_income_tax` /
  `tax_review`.
- **Sources** : `FORM-2050-LIASSE@2026`, tableau 2058-A, cadre I (WA) et cadre II
  (WS) ; `CGI-53A@1999-03-31` ; `CGI-209I@2023-12-31`.
- **Applicabilité** : entité individuelle à l'IS, réel normal, comptes individuels
  et 2058-A de même exercice.
- **Entrées** : comptes 120/129 ou résultat individuel validé, WA, WS, dates et
  devise.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`.
- **Limite** : écritures d'affectation, clôture provisoire et périmètres différents
  nécessitent un pont documenté. Des comptes IFRS consolidés seuls sont
  insuffisants.
- **Conclusion** : un écart est une différence de rapprochement, pas une
  non-conformité confirmée.
- **Capacité** : `available`.

## Fiche `TAX-IS-002` — cohérence arithmétique du 2058-A

- **Exigence** : rejouer uniquement les totaux et reports explicitement prescrits
  par le tableau 2058-A du millésime applicable.
- **Famille / domaine / stage** : `hardLaw` / `corporate_income_tax` /
  `tax_review`.
- **Sources** : `CGI-53A@1999-03-31` ; `FORM-2050-LIASSE@2026`, tableau 2058-A,
  cadres I à III ; `NOTICE-2032@2026`.
- **Applicabilité** : 2058-A complet, millésime reconnu et profil réel normal.
- **Entrées** : toutes les cases participant aux totaux I/II et au résultat fiscal
  avant/après déficits, avec signe et unité.
- **Automatisation / preuve maximale** : `automatic` / `derived`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`. `confirmed_non_compliance` reste interdit dans le MVP : une
  extraction ou une déclaration rectificative peut expliquer l'écart.
- **Limite** : ce contrôle vérifie l'arithmétique déclarée, pas la déductibilité de
  chaque ajustement.
- **Conclusion** : exécution possible seulement avec un schéma de formulaire exact.
- **Capacité** : `available` après création de l'adaptateur 2026.

## Fiche `TAX-IS-003` — résultat fiscal 2058-A vers 2065

- **Exigence** : rapprocher le résultat fiscal du 2058-A et les bases/résultats
  déclarés sur la 2065, en conservant les compartiments de taux et de nature.
- **Famille / domaine / stage** : `methodology` / `corporate_income_tax` /
  `tax_review`.
- **Sources** : `CGI-223@2017-04-08`, `FORM-2065@2026`,
  `FORM-2050-LIASSE@2026`, `NOTICE-2032@2026`.
- **Applicabilité** : 2065 et 2058-A validés, même entité, exercice et millésime
  compatible.
- **Entrées** : résultat fiscal bénéficiaire/déficitaire, rubriques de la 2065,
  ventilation à taux distincts et reports explicitement documentés.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`.
- **Limite** : taux réduits, plus-values et régimes spéciaux rendent une comparaison
  agrégée trompeuse.
- **Conclusion** : aucune agrégation forcée si la ventilation n'est pas disponible.
- **Capacité** : `available` pour le périmètre MVP standard ; autres cas `future`.

## Fiche `TAX-IS-004` — continuité des déficits reportables

- **Exigence** : rapprocher le stock de déficits antérieurs, l'imputation de
  l'exercice et le stock de clôture entre 2058-B successifs et 2058-A.
- **Famille / domaine / stage** : `hardLaw` / `corporate_income_tax` /
  `tax_review`.
- **Sources** : `CGI-209I@2023-12-31`, notamment la règle de report ;
  `FORM-2050-LIASSE@2026`, tableaux 2058-A et 2058-B ;
  `NOTICE-2032@2026`.
- **Applicabilité** : historique continu et profil hors intégration fiscale.
- **Entrées** : 2058-B N et N-1, résultat avant imputation, déficit imputé, événements
  affectant le stock et, si nécessaire, millésimes d'origine.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`.
- **Limite** : sans historique, changements de groupe, restructurations et décisions
  affectant les déficits, le stock juridiquement disponible n'est pas calculable.
- **Conclusion** : le contrôle est `non_available` pour un dossier sans historique ;
  aucun stock ne doit être reconstitué fictivement.
- **Capacité** : `future`.

## Fiche `TAX-IS-005` — résultat déclaré vers liquidation 2572

- **Exigence** : rapprocher les bases et l'IS brut issus des pièces de résultat avec
  la liquidation déclarée sur le relevé de solde 2572.
- **Famille / domaine / stage** : `methodology` / `corporate_income_tax` /
  `tax_review`.
- **Sources** : `FORM-2065@2026`, `FORM-2572@2026` et sa notice ; textes de taux et
  de crédits à versionner séparément lors de l'implémentation.
- **Applicabilité** : société redevable de son propre IS, hors groupe fiscal, 2065,
  2572 et annexes de crédits disponibles.
- **Entrées** : bases par taux, IS brut, contributions, crédits, acomptes, excédents
  et solde.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`; `passed` seulement lorsque toutes les
  composantes sont couvertes.
- **Limite** : 2065 et 2572 seuls ne suffisent pas si crédits, acomptes ou
  contributions exigent des annexes absentes.
- **Conclusion** : pas de liquidation estimée à partir de la seule charge d'impôt
  comptable.
- **Capacité** : `future`.

## Fiche `TAX-VAT-001` — cohérence arithmétique d'une CA3

- **Exigence** : rejouer les totaux, imputations et reports explicitement prévus par
  la CA3 du millésime applicable.
- **Famille / domaine / stage** : `hardLaw` / `vat` / `tax_review`.
- **Sources** : `CGI-287@PRE-CIBS-2026`, `FORM-3310-CA3@2026` et notice 2026.
- **Applicabilité** : CA3 d'une période antérieure à la transition normative ou
  couverte par une version post-transition vérifiée.
- **Entrées** : cases de TVA brute, TVA déductible, crédit antérieur, régularisations,
  TVA à payer ou crédit.
- **Automatisation / preuve maximale** : `automatic` / `derived`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`.
- **Limite** : le contrôle arithmétique ne vérifie ni l'exigibilité de chaque vente
  ni le droit à déduction de chaque achat.
- **Conclusion** : définition distincte obligatoire pour chaque schéma de CA3.
- **Capacité** : `available` pour les périodes dont les sources sont vérifiées ;
  `non_available` sinon.

## Fiche `TAX-VAT-002` — TVA collectée comptable vers CA3

- **Exigence** : rapprocher la TVA collectée comptabilisée et les montants déclarés,
  par période d'exigibilité et catégorie de taux/opération.
- **Famille / domaine / stage** : `methodology` / `vat` / `tax_review`.
- **Sources** : `CGI-269@PRE-CIBS-2026`, `CGI-287@PRE-CIBS-2026`,
  `FORM-3310-CA3@2026` ; versions CIBS futures pour les périodes concernées.
- **Applicabilité** : CA3 complète, FEC ou sous-grand-livre TVA, régime et options
  d'exigibilité confirmés.
- **Entrées** : mouvements 4457, codes TVA, dates de fait générateur/exigibilité,
  bases et cases CA3.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`, `potential_tax_risk` après analyse
  d'indices explicites.
- **Limite** : le seul numéro de compte ne détermine ni le taux, ni l'exigibilité,
  ni le traitement d'une opération.
- **Conclusion** : sans codes TVA et faits d'exigibilité, le contrôle est
  `inconclusive`, jamais une non-conformité.
- **Capacité** : `available` en mode assisté ; automatisation complète `future`.

## Fiche `TAX-VAT-003` — TVA déductible comptable vers CA3

- **Exigence** : rapprocher la TVA déductible enregistrée et déclarée en tenant
  compte de la date de naissance et des conditions du droit à déduction.
- **Famille / domaine / stage** : `methodology` / `vat` / `tax_review`.
- **Sources** : `CGI-271@2026-02-21`, `BOI-TVA-DED-40-20@2025-01-08`,
  `FORM-3310-CA3@2026` ; nouvelles références CIBS à vérifier selon la période.
- **Applicabilité** : FEC ou sous-grand-livre, CA3, factures/justificatifs et profil
  d'assujettissement disponibles.
- **Entrées** : mouvements 4456, cases CA3, date d'exigibilité, facture, usage,
  coefficient/prorata et exclusions lorsque pertinents.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`, `potential_tax_risk`.
- **Limite** : FEC et CA3 seuls ne démontrent pas le droit à déduction. Sans factures
  et qualification des opérations, la preuve est plafonnée à `derived` et la
  conformité ne peut être confirmée.
- **Conclusion** : contrôle par échantillons ou sous-grand-livre pour le MVP ; pas
  de conclusion exhaustive.
- **Capacité** : `future` tant que les justificatifs ne sont pas ingestibles.

## Fiche `TAX-VAT-004` — chiffre d'affaires comptable vers bases CA3

- **Exigence** : rapprocher le chiffre d'affaires comptable avec les bases déclarées
  en distinguant taux, exonérations, territorialité, opérations hors champ et
  décalages d'exigibilité.
- **Famille / domaine / stage** : `methodology` / `vat` / `tax_review`.
- **Sources** : `CGI-269@PRE-CIBS-2026`, `CGI-287@PRE-CIBS-2026`,
  `FORM-3310-CA3@2026` ; sources post-transition à versionner.
- **Applicabilité** : profil, codes TVA et mapping des opérations confirmés.
- **Entrées** : comptes de produits, codes et taux TVA, nature/territorialité,
  période d'exigibilité et cases de bases CA3.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`.
- **Limite** : appliquer un taux moyen au chiffre d'affaires n'est pas une méthode
  probante et est interdit.
- **Conclusion** : sans ventilation opérationnelle, capacité `non_available`.
- **Capacité** : `future`.

## Fiche `TAX-VAT-005` — continuité du crédit et règlement TVA

- **Exigence** : rapprocher le crédit reporté entre CA3 successives et, lorsqu'une
  TVA est due, le montant déclaré avec la preuve de paiement ou d'imputation.
- **Famille / domaine / stage** : `methodology` / `vat` / `tax_review`.
- **Sources** : `FORM-3310-CA3@2026` et notice du millésime ; sources de
  remboursement ou d'imputation selon le cas.
- **Applicabilité** : séquence complète de CA3 et justificatifs de paiement,
  remboursement ou imputation.
- **Entrées** : crédit antérieur/final, montant à payer, dates et références des
  règlements ou demandes.
- **Automatisation / preuve maximale** : `assisted` / `corroborated`.
- **Résultats** : `passed`, `reconciliation_difference`, `missing_information`,
  `inconclusive`, `review_recommendation`.
- **Limite** : une écriture bancaire sans identifiant fiscal ne prouve pas
  l'affectation du paiement ; une CA3 seule ne prouve pas le règlement.
- **Conclusion** : pas de statut `passed` sans chaîne complète.
- **Capacité** : `future`.

## Capacités explicitement non disponibles dans le MVP

| Capacité | Statut | Donnée ou décision manquante |
| --- | --- | --- |
| Résultat fiscal depuis des comptes IFRS consolidés seuls | `non_available` | Comptes individuels français, périmètre de l'entité, liasse et ajustements |
| Liquidation exhaustive de l'IS | `non_available` | Régimes, taux, crédits, contributions, acomptes et sources versionnées exhaustives |
| Intégration fiscale | `future` | Périmètre groupe, états 2058 spécifiques, règles 223 A à U et historiques |
| TVA groupe, prorata complexe ou régime sectoriel | `future` | Profil détaillé, sous-grands-livres et corpus normatif dédié |
| Validation exhaustive de la TVA déductible | `non_available` | Factures, affectation, usage, exclusions et événements de régularisation |
| Confirmation automatique d'une non-conformité | `non_available` | Politique de revue et preuves directes/corroborées ; décision humaine obligatoire |
| Profil enrichi par API Entreprise | `non_available` pour le MVP | Dépendance expressément exclue ; saisie et confirmation dossier requises |
| Télétransmission ou paiement | `non_available` | Hors frontière produit et responsabilités associées |


