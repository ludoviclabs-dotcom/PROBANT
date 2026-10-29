# Périmètre V1 — atelier « Locations IFRS 16 » (lot C00)

Version 1.0 du 29/10/2026, base `main` `97bed70`. Ce document fixe le périmètre fermé que les lots L16-01 → L16-06 implémentent. Il précise `plan/01_ARCHITECTURE_ET_SCOPE.md` § 5 sans l'élargir. Les paragraphes cités ont été lus dans le texte IASB (voir [`SOURCES.md`](./SOURCES.md)). Les choix marqués « interne » sont des conventions de PROBANT, pas des exigences IFRS.

**IFRS 18 n'est pas couvert par ce lot.** L'utilisateur a restreint C00 à IFRS 16 le 29/10/2026. L'atelier « Présentation IFRS 18 » fera l'objet d'une décision après L16-06 (voir [`handoffs/C00.md`](./handoffs/C00.md)). Les contrats communs gardent seulement ce qu'il faut pour ne pas l'empêcher.

## 1. Vocabulaire

**Décisions de périmètre** (plan, `00_LIRE_D_ABORD.md`) :

| Valeur | Sens |
|---|---|
| `couvert` | Traité automatiquement après qualification humaine |
| `manuel_documenté` | Jugement humain saisi, sourcé et cité. Aucun calcul automatique de ce jugement |
| `bloqué` | Détecté et refusé avec motif. La détection ne vaut pas traitement comptable |
| `hors_périmètre` | Non modélisé en V1. S'il est déclaré, il bloque le contrat ou la sélection |

**Statut d'un contrat.** Il est distinct de l'état de la feuille (`draft` … `locked`) :

| Statut | Sens |
|---|---|
| `non_location` | Qualification documentée : le contrat ne contient pas de location (§ 9-11). Hors calcul |
| `exemption_documentee` | Exemption court terme ou faible valeur, avec la politique et le jugement cités (§ 5-8). Hors calcul ; ce n'est pas une exclusion technique |
| `eligible_v1` | Toutes les conditions du § 2 sont remplies et confirmées : calculable |
| `a_qualifier` | Donnée ou jugement manquant, ou réponse vide à un champ de périmètre. Rien n'est calculé par valeur par défaut |
| `hors_scope_v1` | Cas réel exclu de V1 (§ 4). Ce n'est pas une exemption normative |

**Résultat par clôture d'un contrat `eligible_v1`.** Il vaut `computed`, `diagnostic` (calcul affiché, sans retraitement sélectionnable) ou `not_commenced` (prise d'effet postérieure à la clôture : contrat à suivre, rien de reconnu).

## 2. Couvert automatiquement après qualification

| Condition | Règle V1 | Base |
|---|---|---|
| Entité, monnaie, rôle | Une entité, EUR, **preneur** | Interne |
| Modèle | Modèle du coût ; pas de juste valeur ni de réévaluation | § 29-30 |
| Composantes | Composante locative isolée par une ventilation documentée (§ 13-14), **ou** élection § 15 documentée pour la catégorie d'actif. Sans l'une ou l'autre, voir X07 | § 12-15 |
| Paiements | Loyers **fixes** mensuels, à terme échu | § 27(a) |
| Calendrier | Commencement le 1er d'un mois, échéances en fin de mois, clôture en fin de mois | Interne |
| Durée | Entier de 1 à 120 mois retenu par jugement documenté (options examinées). La borne de 120 mois est technique, pas normative | § 18-21, B34-B41 |
| Taux | Taux implicite facilement déterminable ou, à défaut, taux marginal d'endettement approuvé. Nature, date, justification et preuve sont exigées | § 26, annexe A, IFRIC 09/2019 |
| Unité du taux | Taux **annuel effectif** décimal `r`, avec 0 ≤ r ≤ 1. Taux mensuel `(1 + r)^(1/12) − 1`. Zéro documenté admis | Interne |
| Droit d'utilisation initial | Égal à la dette initiale seulement si les paiements d'avance, avantages incitatifs, coûts directs initiaux et coûts de remise en état sont **déclarés nuls un par un**, avec preuve | § 23-24 |
| Amortissement | Linéaire, en mois entiers, sur min(durée d'utilité retenue, durée du contrat). Pas de transfert de propriété ni d'option d'achat | § 31-32 |
| Dette | Intérêt à taux périodique constant sur le solde restant | § 36-38 |
| TVA | Flux du modèle hors TVA entièrement récupérable, ou opération sans TVA, **documenté**. En cas de règlement TTC : loyer retenu, TVA qualifiée et total réglé restent trois montants distincts | Interne |
| Contrats | Nouveaux contrats, et contrats déjà calculés dans PROBANT | Interne |
| Contrat historique | Recalcul depuis l'origine si toutes les données sont présentes **et** si l'ouverture est cadrée au centime sur un reporting IFRS validé. Sinon : `diagnostic` | Interne |
| Échéances | Une échéance exigible au plus tard à la date de revue (`period.asOfDate`) exige une preuve de règlement. Une échéance future est `non_encore_exigible`, jamais « manquante » | Interne |

**Restitution** : dette, droit d'utilisation, intérêts, amortissement, échéancier, ponts par poste et retraitement de clôture proposé. Données utiles à l'annexe :
- dotation par catégorie, charge d'intérêts, sorties de trésorerie, entrées et valeurs nettes (§ 53) ;
- échéances non actualisées présentées à part (§ 58).

Ces données ne forment pas une annexe IFRS 16 exhaustive. La ventilation du principal exigible à 12 mois est une aide d'analyse, pas un classement courant / non courant. L'effet fiscal n'est pas calculé (`taxStatus = not_computed`).

## 3. Manuel documenté

Qualification de la location : actif identifié et contrôle de l'usage (§ 9-11, B9-B31). Séparation des composantes ou élection § 15. Durée et options : le contrat est exécutoire tant que les deux parties ne peuvent pas le résilier sans pénalité plus qu'insignifiante, appréciée sur l'économie d'ensemble du contrat (B34, IFRIC 11/2019). Choix et justification du taux (IFRIC 09/2019). Élection d'exemption et revue des sources.

Les exemptions ne se déclenchent **jamais** sur un montant :
- **court terme** : politique par catégorie d'actif sous-jacent (§ 8), durée de 12 mois au plus **et** aucune option d'achat (annexe A) ;
- **faible valeur** : décision contrat par contrat, appréciée sur la valeur à neuf (B3-B8). Le texte ne fixe aucun seuil monétaire. Ni 5 000 € ni 5 % ne sont des règles par défaut.

## 4. Matrice 1 — exigence → source → entrée → traitement → sortie → test

| ID | Exigence | Source | Entrée (type de document · champ) | Traitement | Sortie | Test |
|---|---|---|---|---|---|---|
| R01 | Identifier une location | § 9-11, B9-B31 | `lease_contracts` · actif identifié, contrôle de l'usage, preuve | Qualification humaine, jamais déduite d'un compte ou d'un bailleur | Statut `non_location` / suite | L16-01 : contrat sans preuve de contrôle → `a_qualifier` |
| R02 | Séparer les composantes | § 12-15 | `lease_assumptions` · services, ventilation ou élection § 15 | Contrôle de présence et de preuve | Composante locative retenue | X07 |
| R03 | Exemptions | § 5-8, annexe A, B3-B8 | `lease_assumptions` · politique, niveau, jugement | Contrôle des conditions ; aucun seuil | `exemption_documentee` | X22, X23 |
| R04 | Durée | § 18-21, B34-B41, IFRIC 11/2019 | `lease_assumptions` · mois retenus, options, jugement | Contrôle 1 ≤ n ≤ 120, preuve | Durée retenue | X18, X20 |
| R05 | Taux | § 26, annexe A, IFRIC 09/2019 | `lease_assumptions` · nature, `r` annuel effectif, date, justification | `i = (1 + r)^(1/12) − 1` en virgule fixe 40 décimales | Taux mensuel exact | F03, X19 |
| R06 | Paiements de location | § 27 | `lease_contracts`, `lease_assumptions` · réponses explicites pour chaque composante exclue | Seuls les loyers fixes sont admis | Flux du modèle | X01-X11, X25 |
| R07 | Dette initiale | § 26 | Flux, `i`, n | `D0 = Σ L / (1 + i)^t`, soldes publiés au centime | Dette initiale | F01-F07 |
| R08 | Droit d'utilisation initial | § 23-24 | Composantes initiales déclarées nulles une par une | ROU = D0 publiée | ROU brut | F01 ; X03-X06 |
| R09 | Suivi de la dette | § 36-38 | Échéancier | Intérêt = dette publiée de clôture − dette d'ouverture + loyers ; écart d'arrondi tracé | Intérêts, principal, dette | F01, F03, F05 |
| R10 | Amortissement | § 29-32 | Durée d'utilité retenue | Cumul publié = arrondi(ROU × j / m) | Dotation, cumul, valeur nette | F01, F09 |
| R11 | Dépréciation | § 33 (IAS 36) | Indice déclaré | Blocage | — | X14 |
| R12 | Réestimations et modifications | § 20-21, 39-46 | Version du contrat avec changement économique | Blocage ; une correction de transcription reste distincte | — | X12 |
| R13 | Présentation | § 47-49 | Résultat du calcul | Droit d'utilisation et dette séparés ; intérêts séparés de l'amortissement | Export | L16-05 |
| R14 | Informations à fournir | § 53, § 58 | Résultat du calcul | Tableaux préparatoires, non exhaustifs | Export HTML / CSV | L16-05 |
| R15 | Base PCG | PCG art. 212-5 ; comptes 612, 613, 614 | `lease_ledger` · compte, pièce, période, montant | Candidats proposés, jamais une preuve d'exhaustivité ; neutralisation du loyer cadré | Pont PCG → IFRS | X27, X28 |
| R16 | Retraitement de clôture | Interne (CONTRAT_COMMUN § 7) | Résultat + base cible déclarée | Bundle `closing_adjustment` équilibré, sans mouvement de trésorerie | Lignes débit / crédit | F01, F03, F08 |
| R17 | Fiscalité | Aucune (IAS 12 hors périmètre) | — | Rien de calculé | `taxStatus = not_computed` | L16-03 |
| R18 | Contrat historique | Interne | `lease_opening` · dette, ROU brut / cumul / net, date, reporting, preuve | Recalcul depuis l'origine et cadrage au centime | Effet d'ouverture distinct | F08, X24 |

## 5. Matrice 2 — cas exclu → détection → message → blocage

« Hors » = statut `hors_scope_v1`. Toute détection se fait côté serveur, même quand l'appel ne passe pas par l'interface.

| ID | Cas | Détection | Message (sens) | Blocage |
|---|---|---|---|---|
| X01 | Loyers indexés ou liés à un taux | Réponse `variable_payments` ≠ `none`, ou montants d'échéance non constants | Loyers variables ou indexés : hors calcul V1 | Hors |
| X02 | Loyers variables non indexés (usage, chiffre d'affaires) | Même réponse | Charge variable hors modèle V1 | Hors |
| X03 | Paiement d'avance ou loyer à échoir | Réponse `prepaid` ≠ 0, ou échéance non située en fin de mois | Paiement anticipé ou terme à échoir hors V1 | Hors |
| X04 | Avantage incitatif reçu | Réponse ≠ 0 | Avantage incitatif hors V1 | Hors |
| X05 | Coûts directs initiaux | Réponse ≠ 0 | Coûts directs initiaux hors V1 | Hors |
| X06 | Remise en état ou démantèlement | Réponse ≠ 0 | Coûts de remise en état hors V1 | Hors |
| X07 | Services non séparés, sans élection § 15 | Indicateur « services » présent sans ventilation ni élection documentée. Les lignes 614 rapprochées sont un indice | Composante locative à isoler ou élection à documenter | `a_qualifier` |
| X08 | Dépôt de garantie non qualifié | Dépôt présent sans qualification | Dépôt à qualifier | `a_qualifier` |
| X09 | Garantie de valeur résiduelle | Réponse ≠ `none` | Hors V1 | Hors |
| X10 | Option d'achat ou transfert de propriété | Réponse ≠ `none` | Hors V1 (amortissement sur la durée d'utilité, § 32) | Hors |
| X11 | Pénalité de résiliation incluse dans la durée | Réponse ≠ `none` | Hors V1 | Hors |
| X12 | Modification, changement de durée, résiliation, réestimation | Nouvelle version du contrat qualifiée « changement économique » ; réponse explicite | Modification hors V1. Une nouvelle version documentaire ne réécrit pas l'historique | Hors |
| X13 | Échéance exigible impayée ou partiellement réglée | Règlement < échéance, à une date ≤ `asOfDate` | Échéancier non respecté hors V1 | Hors. Preuve absente → `a_qualifier` (inconnu) |
| X14 | Indice de dépréciation du droit d'utilisation | Réponse ≠ `none` | IAS 36 hors V1 | Hors |
| X15 | Intérêts ou amortissement incorporés au coût d'un autre actif | Réponse ≠ `none` | Hors V1 | Hors |
| X16 | Devise autre que l'euro | Devise ≠ EUR | Hors V1 | Hors |
| X17 | Dates hors convention | Commencement ≠ 1er du mois ; échéance ≠ fin de mois | Calendrier hors convention V1 | Hors |
| X18 | Durée hors bornes | n < 1 ou n > 120 | Limite technique interne, non normative | Hors |
| X19 | Taux absent, nominal non converti, nature non sourcée, négatif ou > 100 % | Champs du taux | Absent, nominal ou non sourcé → `a_qualifier` ; négatif ou > 100 % → hors V1 | Selon le cas |
| X20 | Durée ou jugement des options absent | Champ vide | Durée à qualifier | `a_qualifier` |
| X21 | TVA non récupérable ou récupération incertaine | Réponse TVA | Hors calcul V1, sans décision fiscale implicite | Hors |
| X22 | Exemption court terme avec option d'achat | Les deux réponses à la fois | Pas un contrat de courte durée (annexe A) | Exemption refusée → `a_qualifier` |
| X23 | Faible valeur sans valeur à neuf ni jugement B3-B8 | Champs vides | Exemption non justifiée | `a_qualifier` |
| X24 | Contrat historique sans ouverture validée, ou ouverture non cadrée | `lease_opening` absent, ou écart ≠ 0,00 avec le recalcul | Calcul affiché, aucun retraitement déterminé | `diagnostic` |
| X25 | Réponse vide à un champ de périmètre | Champ vide (vide ≠ zéro ≠ non applicable) | Un champ absent ne prouve pas l'absence | `a_qualifier` |
| X26 | Identifiant de contrat en double au même niveau | Import | Doublon refusé | Rejet d'import |
| X27 | Charge PCG du loyer non identifiée ou non cadrée | Pas de ligne `lease_ledger` rapprochée | Pas de retraitement sélectionnable | `diagnostic` |
| X28 | CCA, FNP ou autre décalage non couvert | Écart de cadrage | Décalage non couvert listé | `diagnostic` |
| X29 | Base cible inconnue, ou incluant déjà ce retraitement | Manifeste de la sélection | Sélection refusée | Refus de sélection |
| X30 | Bailleur, sous-location, cession-bail | Rôle déclaré | Hors périmètre | Hors |
| X31 | Plusieurs entités ou consolidation | Contexte | Hors périmètre | Hors |
| X32 | Première application IFRS, méthodes de transition IFRS 16 (annexe C) | Demande de reprise sans ouverture validée | Aucune méthode de transition choisie par l'outil | `diagnostic` |
| X33 | Juridiction `EU_adopted` sans texte UE lu | Fiche de règle | Exécution réelle bloquée : règle `review_required` | Règle non activable en réel |
| X34 | Prise d'effet postérieure à la clôture | Commencement > clôture | Contrat à suivre, rien de reconnu à cette date | Aucun (`not_commenced`) |

Hors périmètre de V1, sans qu'il faille les détecter au-delà de leur déclaration : comptes IFRS complets, IAS 12, annexe exhaustive, classement courant / non courant affirmé, simulateur paramétrique, OCR / IA d'extraction de contrats, connecteurs ERP, PDF natif.

## 6. Exhaustivité et couverture

Deux mesures séparées, qui ne doivent pas être confondues :
- **le registre de contrats fourni** : nombre de contrats par statut ;
- **le rapprochement de la population comptable fournie** : nombre de lignes 612 / 613 / 614 rapprochées ou non, et sommes absolues.

Aucune affirmation d'exhaustivité de tous les contrats de l'entité ne découle de ces dénominateurs. Un total portant seulement sur les contrats calculés est libellé « contrats calculés », jamais « portefeuille ».
