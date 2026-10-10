# Mission 19 — Dossier professionnel : contrôle interne et clôture

Contrat de conception, rédigé le 10/10/2026.

## Problème utilisateur

PROBANT juxtapose une douzaine de feuilles de cycle : Clients, Achats, Trésorerie, Immobilisations, Stocks, Provisions, Capitaux propres, Participations, TVA/IS, Résultat exceptionnel, Paie.

Une feuille verrouillée laisse croire qu'un pan du dossier est « fait ». Rien n'indiquait jusqu'ici :
- qu'un risque n'a aucune procédure ;
- qu'un contrôle interne est seulement décrit ;
- qu'une pièce est attendue ;
- que deux documents se contredisent.

Le risque est de présenter un ensemble de cycles comme un audit complet.

## Vue choisie

La vue est la route `/dossier-cloture`, reliée depuis `/dashboard/synthese` et la synthèse synthétique, juste avant la liste des cycles.

| Zone | Rôle |
|---|---|
| Bandeau de vérité | Feuilles de cycle verrouillées, travaux restants et pièces manquantes. Rappelle qu'aucune opinion n'est générée. |
| Registre des indicateurs | Chaque compte est une fraction, avec son unité, ses exclusions et un segment cliquable par élément réel. |
| **Programme** | Carte de couverture risques × assertions (NEP 500 §09), puis un couloir par risque : procédures, état, responsable, travaux, pièces, dernière action. |
| Fiche de traçabilité (panneau latéral) | Fil vertical : risques et assertions → population (sur quoi) → périmètre ITGC → étapes et travaux (qui, quand, sur quoi, avec quelle pièce et quelle version) → conclusion → revue. Formulaires d'action selon les droits. |
| **Pièces** | File des pièces manquantes, de la plus ancienne à la plus récente ; registre des pièces versionnées ; dépôt. |
| **Anomalies et limites** | Anomalies corrigées ou non, au montant connu ou inconnu ; contradictions déclarées en vis-à-vis ; incohérences détectées ; limites d'étendue. |
| **Revue** | Points de revue (levée, réponse, clôture) et procédures en attente de revue. |
| **Clôture** | Travaux restants par famille, feuilles de cycle observées et validation de clôture réservée au professionnel habilité. |
| **Journal** | Qui a fait quoi, quand : un événement par ligne, avec son empreinte chaînée. |

## Données disponibles

- **Le journal du dossier.** Il est en ajout seul, dans les tables `cl_events`, `cl_pieces` et `cl_command_receipts` (migration `0019_closing_dossier`). L'état est un repli pur du journal.
- **Les feuilles de cycle existantes.** Elles sont lues en lecture seule dans les têtes des sept familles :
  - `clients_` : Clients, Achats, Capitaux propres (Codex), Participations, Résultat exceptionnel ;
  - `cash_`, `fa_`, `eq_`, `fx_`, `st_`, `pv_`.

  Le dossier en lit l'état, la version, la révision, la revue, les assertions déclarées, la taille de population, le nombre de sources et l'empreinte de contenu. Il ne recalcule, ne revoit et ne verrouille jamais une feuille.
- **La paie (Mission 18).** Elle n'a pas de feuille durable : elle n'est pas observable et se documente comme procédure manuelle.

## Questions professionnelles

1. Chaque risque identifié a-t-il, pour chacune de ses assertions, au moins une procédure applicable ?
2. Pour chaque procédure : qu'a-t-on fait, qui, quand, sur quelle population et avec quelle pièce, dans quelle version ?
3. Un contrôle interne est-il seulement décrit, mis en œuvre, ou testé dans son fonctionnement ?
4. Quelles pièces sont attendues, de qui et depuis quand ?
5. Quelles anomalies sont corrigées, avec une preuve nouvelle, et lesquelles ne le sont pas ?
6. Quelles contradictions entre pièces restent ouvertes ?
7. Qu'est-ce qui empêche encore la validation de clôture, et qui peut l'enregistrer ?

## Assertions et risques

Les assertions suivent la NEP 500 §09, dans ses trois catégories :

| Catégorie | Assertions |
|---|---|
| Flux d'opérations et événements | Réalité, exhaustivité, mesure, séparation des exercices, classification |
| Soldes de fin de période | Existence, droits et obligations, exhaustivité, évaluation et imputation |
| Présentation et informations de l'annexe | Réalité, droits et obligations ; exhaustivité ; présentation et intelligibilité ; mesure et évaluation |

**Le risque.** Un risque porte un cycle, un libellé, ses assertions et une évaluation humaine.

L'échelle élevé / modéré / faible est une **méthode interne** : un paramètre du cabinet, jamais calculé et sans valeur par défaut. Un risque non évalué bloque la clôture.

## Champs et formats

| Commande | Champs | Droit |
|---|---|---|
| `open` | Exercice et entité | Préparation |
| `set_risk` | `R-nn` ; cycle ; libellé ; assertions ; évaluation (niveau et motif) ou `null` | Préparation |
| `set_procedure` | `P-nn` ; risques ; assertions incluses dans celles des risques ; nature ; libellé ; responsable ; feuille de cycle observée (nature « outillée » seulement) | Préparation |
| `set_population` | Définie (description, taille ou `null`, pièces) ou absente (motif) | Préparation |
| `set_applicability` | Non applicable avec motif obligatoire et pièces, ou rétablie | Préparation |
| `set_itgc_scope` | Systèmes, processus, période et méthode | Préparation |
| `record_work` | Étape ; date de réalisation (jamais future) ; sur quoi ; ce qui a été fait ; éléments examinés ; résultat ; pièces citées | Préparation |
| `request_piece` / `close_piece_request` | Pièce attendue et destinataire ; reçue (pièce déposée après la demande) ou annulée (motif) | Préparation |
| `conclude_procedure` | Texte ; portée pour un contrôle ; pièces | Préparation |
| `review_procedure` | Approuvée ou modifications demandées, avec texte | Revue |
| `raise_review_point` / `answer_review_point` / `close_review_point` | Point sur une procédure, une anomalie, une contradiction ou le dossier | Revue, puis préparation, puis revue |
| `record_misstatement` / `correct_misstatement` / `assess_misstatement` | Montant connu ou inconnu avec motif ; pièces | Préparation (relevé, correction) ; revue (appréciation) |
| `record_limitation` / `assess_limitation` | Cycle, description, procédures | Préparation, puis revue |
| `record_contradiction` / `resolve_contradiction` | Deux pièces différentes ; résolution citée | Préparation |
| `validate_closing` / `reopen` | Texte ou motif | Signature **et** habilitation de clôture |
| Dépôt de pièce (multipart) | Fichier (PDF, tableur, texte ou image ; 3 Mio) ; libellé ; nature (document, réponse de tiers, déclaration de la direction) ; pièce à versionner | Préparation |

Plusieurs éléments sont fixés par le serveur, jamais par le navigateur :
- les identifiants `W-`, `D-`, `RP-`, `A-`, `L-`, `C-`, `PC-nn-vk` ;
- l'auteur et l'heure ;
- les citations résolues : fichier, version, empreinte et nature ;
- l'empreinte des bases de conclusion.

## Population, unité et période

- **Unité.** L'unité du dossier est la procédure du programme.
- **Population d'une procédure manuelle.** Elle est déclarée par le préparateur : sur quoi porte le travail, sa taille (ou « non déclarée ») et ses pièces.
- **Population d'une feuille outillée.** Elle vient de son cycle (taille de la population figée).
- **Période.** C'est l'exercice déclaré à l'ouverture. L'identifiant de période doit correspondre à l'exercice.

## Exclusions

- **Procédure non applicable.** Elle n'est admise que motivée. Elle est exclue des dénominateurs, et l'exclusion est affichée.
- **Couple risque × assertion.** S'il n'est couvert que par des procédures non applicables motivées, il est exclu du dénominateur des couples, avec mention.
- **Demande de pièce annulée.** Elle est exclue du dénominateur des pièces, avec son motif.

## Calculs

L'outil ne fait que des comptages et une somme.
- **Comptages.** Chacun donne un numérateur et un dénominateur, avec l'unité, les exclusions et un segment par élément. Jamais de pourcentage ni de score.
- **Somme des anomalies.** Elle porte sur les seuls montants connus, séparément pour les anomalies corrigées et non corrigées. Les montants inconnus sont comptés à part, jamais pour zéro.
- **Aucune comparaison à un seuil.** Le caractère significatif relève du professionnel (NEP 450 §13-14).

## États

| Procédure manuelle | Feuille outillée |
|---|---|
| À faire, en cours, population absente, périmètre et méthode requis (ITGC) | Aucune feuille de cycle |
| Conclue (revue attendue), modifications demandées | Feuille en cours |
| Conclusion périmée | Feuille bloquée |
| Revue | Approuvée (verrouillage attendu), verrouillée |
| Non applicable (motivée) | Non applicable (motivée) |

**Étapes d'un contrôle.** Chaque étape est dans l'un de ces états : absente, documentée, sans pièce, pièce remplacée, déclaration seule.

**Validation.** Elle est absente, validée, périmée (une feuille de cycle a changé depuis) ou rouverte.

**États d'affichage.** Vide, chargement, erreur expliquée, conflit (le journal a avancé), dossier non ouvert, dossier validé et figé.

## Règles

| Règle | Nature | Fondement |
|---|---|---|
| Documenter qui a fait les travaux et quand ; qui a revu, quand et avec quelle étendue | Norme professionnelle | NEP 230 §08 |
| Documenter les éléments testés de façon identifiable | Norme professionnelle | NEP 230 §04 |
| Séparer conception, mise en œuvre et fonctionnement d'un contrôle. Le fonctionnement n'est jamais déduit ; un test exige description et mise en œuvre documentées. | Norme professionnelle et méthode interne | NEP 315 §34, NEP 330 §08, §14-16 et §23, NEP 265 §01. L'enchaînement imposé des étapes est une méthode interne. |
| ITGC : aucun travail ni conclusion sans périmètre (systèmes, processus, période) et méthode déclarés ; une checklist ne vaut pas couverture | Méthode interne | Éclairée par NEP 315 §09 et §33 et NEP 330 §15 |
| Une déclaration de la direction ne fonde seule ni une conclusion, ni une correction, ni une résolution de contradiction | Méthode interne | Lecture de la NEP 580 §04 (corroboration des déclarations pour les éléments significatifs) et §01. La NEP n'écrit pas « insuffisant à lui seul » : ce n'est pas une citation. |
| Une correction d'anomalie cite une preuve nouvelle : pièce déposée après l'anomalie, autre que celle qui l'a révélée | Méthode interne | NEP 450 §10-12 pour la demande de correction |
| Une anomalie non corrigée et une limite d'étendue reçoivent une appréciation humaine avant la clôture ; l'outil ne juge pas | Méthode interne | NEP 450 §13-18, NEP 700 §11 et §14 |
| Revue par une autre personne : ni l'auteur de la conclusion ni l'auteur d'un travail ; un point de revue est clos par une autre personne que l'auteur de la réponse | Méthode interne | Éclairée par NEP 230 §08 |
| Toute modification de la base d'une conclusion la rend périmée : procédure, risques, population, applicabilité, périmètre, travaux, nouvelle version d'une pièce citée | Méthode interne | Socle commun |
| Validation de clôture refusée tant qu'il reste un travail, une pièce, un point, une contradiction, une incohérence ou une appréciation | Méthode interne | — |
| Validation réservée à `dossier:sign` **et** à une habilitation de clôture fournie par le serveur, accordée à personne par défaut | Méthode interne | — |
| La formulation de l'opinion appartient au commissaire aux comptes ; PROBANT n'en génère aucune | Obligation légale et norme | Code de commerce L821-53, NEP 700 §01 |
| Échelle de risque, responsable, populations, motifs | Paramètre utilisateur | — |

**Incohérences factuelles calculées.** Elles ne sont jamais résolues par l'outil :
- feuille de cycle hors programme ;
- procédure non applicable alors que des travaux existent ;
- anomalie rattachée à une procédure conclue sur des travaux « sans exception relevée ».

## Explications, preuves et jugement humain

**Explications.** Chaque reste à faire est une phrase qui donne sa cause et l'action possible.

**Preuves.** Chaque citation est résolue par le serveur : pièce, version, page ou zone, nature et empreinte SHA-256. Une version remplacée reste lisible, mais les travaux qui la citent deviennent « à réexaminer ».

**Jugement humain.** Sont humains :
- l'évaluation des risques ;
- la conclusion de chaque procédure (portée pour un contrôle) ;
- la revue ;
- l'appréciation des anomalies non corrigées et des limites ;
- la résolution des contradictions ;
- la validation de clôture.

**Journal.** Le chaînage des empreintes du journal est un contrôle d'intégrité local, ni une signature ni une preuve inviolable.

## Sources officielles (consultées le 10/10/2026)

**Fidélité de lecture.**
- **Lus mot à mot :**
  - NEP 230 §03-04 et §08-09 ;
  - NEP 580 §01, §04 et §13 ;
  - NEP 265 §01-02 ;
  - intertitres de la NEP 700.
- **Lus à travers une synthèse des pages H2A** (numéros de paragraphe à revérifier avant toute citation dans le produit) :
  - NEP 315 et 330 ;
  - NEP 450, 500, 501, 505 et 560.

| Source | Organisme | URL | Repères | Date d'effet | Nature | Limites |
|---|---|---|---|---|---|---|
| Code de commerce, art. L821-53 | Légifrance | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048525441 | Mission de certification | 01/01/2024 (ord. 2023-1142) | Obligation légale | Fonde la mission ; ne décrit pas les procédures |
| Code de commerce, art. L821-11 | Légifrance | https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048535361 | NEP homologuées par arrêté | 01/01/2024 | Obligation légale | — |
| Arrêté du 28/12/2023 (JORF 31/12/2023) | Légifrance | https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000048735742 | Recodification A. 821-xx | 01/01/2024 | Obligation légale | Homologation des NEP non révisées depuis |
| Arrêté du 13/11/2024 (JORF 19/11/2024) | Légifrance | https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000050510512 | NEP 315, 330, 265… révisées | NEP 315 et 330 : exercices ouverts à compter du 19/11/2024 | Obligation légale | — |
| NEP 230 — Documentation de l'audit des comptes | H2A | https://h2a-france.org/normes/documentation-de-laudit-des-comptes/ | §04, §08, §09 | Arrêté du 28/12/2023 | Norme professionnelle | — |
| NEP 315 (révisée) — Prise de connaissance et évaluation du risque | H2A | https://h2a-france.org/normes/connaissance-de-lentite-et-de-son-environnement-et-evaluation-du-risque-danomalies-significatives-dans-les-comptes/ | §09-11 (ITGC, environnement informatique), §24, §33-34 (conception, « mis en œuvre »), §41 | Exercices ouverts depuis le 19/11/2024 | Norme professionnelle | Lien avec l'ISA 315 (2019) non établi par une source lue |
| NEP 330 (révisée) — Procédures à l'issue de l'évaluation des risques | H2A | https://h2a-france.org/normes/procedures-daudit-mises-en-oeuvre-par-le-commissaire-aux-comptes-a-lissue-de-son-evaluation-des-risques/ | §08, §14-16, §19-23, §27-28 | Exercices ouverts depuis le 19/11/2024 | Norme professionnelle | Périodicité des tests (§19-22) non modélisée |
| NEP 500 — Caractère probant des éléments collectés | H2A | https://h2a-france.org/normes/caractere-probant-des-elements-collectes/ | §09 (assertions), §06-07 (fiabilité) | Arrêté du 28/12/2023 | Norme professionnelle | — |
| NEP 501 — Applications spécifiques | H2A | https://h2a-france.org/normes/caractere-probant-des-elements-collectes-applications-specifiques/ | §03-06 (inventaire), §07-08 (litiges) | Arrêté du 27/11/2024 (intitulé) | Norme professionnelle | Procédures alternatives non outillées |
| NEP 505 — Demandes de confirmation des tiers | H2A | https://h2a-france.org/normes/demandes-de-confirmation-des-tiers/ | §04, §08-15 | Arrêté du 28/12/2023 | Norme professionnelle | Maîtrise de l'envoi non vérifiable par l'outil |
| NEP 560 — Événements postérieurs à la clôture | H2A | https://h2a-france.org/normes/evenements-posterieurs-a-la-cloture-de-lexercice/ | §05-18 | Arrêté du 28/12/2023 | Norme professionnelle | Aucune date de signature modélisée |
| NEP 580 — Déclarations de la direction | H2A | https://h2a-france.org/normes/declarations-de-la-direction/ | §01, §04, §07, §13 | Arrêté du 28/12/2023 | Norme professionnelle | Voir la règle de méthode interne ci-dessus |
| NEP 450 — Évaluation des anomalies relevées | H2A | https://h2a-france.org/normes/evaluation-des-anomalies-relevees-au-cours-de-laudit/ | §03, §10-18 | Arrêté du 28/12/2023 | Norme professionnelle | Versions des arrêtés de 2023 non lues |
| NEP 265 — Communication des faiblesses du contrôle interne | H2A | https://h2a-france.org/normes/communication-des-faiblesses-du-controle-interne/ | §01-02, §05-06 | Arrêté du 13/11/2024 | Norme professionnelle | Communication non outillée |
| NEP 700 — Rapports du commissaire aux comptes | H2A | https://h2a-france.org/normes/rapports-du-commissaires-aux-comptes-sur-les-comptes-annuels-et-consolides/ | §01, §11, §14 | Arrêté du 28/12/2023 | Norme professionnelle | Aucune opinion n'est générée |

## Limites

- **Habilitation de clôture.** Elle n'est branchée sur aucune source réelle (inscription, mandat, IdP). Par défaut, personne ne la détient dans le serveur durable.
- **Feuilles de cycle.** Elles sont observées sur leur tête courante. La plus avancée est retenue quand plusieurs feuilles portent la même procédure ; les autres sont listées.
- **Non modélisé :**
  - périodicité des tests de contrôles (NEP 330 §19-22) ;
  - communication des faiblesses (NEP 265) ;
  - dates de signature et d'arrêté des comptes (NEP 560) ;
  - seuil de signification ;
  - lettre d'affirmation structurée.
- **Paie.** Elle n'est pas observable (pas de feuille durable).
- **Responsable.** C'est une affectation déclarée (texte), pas une identité vérifiée. Le « qui a fait » est en revanche toujours l'identité serveur.
