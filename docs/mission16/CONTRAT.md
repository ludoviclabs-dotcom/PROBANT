# Mission 16 — Provisions et engagements : contrat

Registre des risques et engagements relié au grand livre et à l'annexe. Procédure `provisions.register`, route `/provisions`, API `/api/workpapers/provisions` et `/api/workpapers/provisions/imports`, tables `pv_*` (migration `0018_provision_workpapers`).

Statut : recette jetable sur données synthétiques. Le drapeau `PROBANT_PROVISIONS_DURABLE=disposable` ouvre la chaîne durable. Elle est toujours refusée sur Vercel production.

Ce document distingue quatre natures de règles :
- l'**obligation légale** ;
- la **norme professionnelle** ;
- la **méthode interne** ;
- le **paramètre utilisateur**.

## Problème utilisateur

Le préparateur doit tenir un registre unique des risques et engagements. Ce registre couvre les événements ouverts, nouveaux et clos pendant l'exercice, y compris ceux sans écriture.

Il doit le relier :
- au grand livre des comptes de provisions ;
- à l'annexe publiée.

Il doit aussi voir où divergent l'estimation documentée, l'écriture et l'information publiée.

La probabilité, la qualification de l'obligation et la décision comptable restent des décisions humaines. L'outil n'applique aucune formule probabilité × montant et ne déduit aucune issue juridique.

## Questions professionnelles

1. Chaque provision se reconstitue-t-elle de l'ouverture à la clôture ? Le pont est : ouverture + dotations − utilisations − reprises = clôture.
2. La provision comptabilisée correspond-elle à l'estimation documentée retenue par l'entité ?
3. Les passifs éventuels et engagements sans écriture figurent-ils en annexe, et pour quel montant ?
4. Les comptes de provisions du grand livre se rapprochent-ils du registre, à l'ouverture comme à la clôture ?
5. Chaque mouvement, chaque estimation et chaque traitement est-il étayé par une pièce citable, en particulier chaque reprise ?

## Assertions et risques visés (non validés)

| Assertion visée | Risques |
|---|---|
| Exhaustivité | Événement ou engagement absent du registre ; compte de provisions sans événement ; ligne d'annexe sans événement. |
| Évaluation | Provision différente de l'estimation retenue documentée ; clôture déclarée différente du pont. |
| Existence | Reprise sans justificatif ; risque clos avec un solde résiduel. |
| Présentation et information | Passif éventuel ou engagement absent de l'annexe ; montant ou rubrique d'annexe différent. |

Ces assertions sont visées, jamais validées par l'outil.

## Sources, champs et formats

Six sources tabulaires (CSV ou XLSX, feuille explicite pour un classeur) passent par le parseur partagé `previewImport`, avec le mapping versionné `provisions-1`. Chaque colonne est nommée explicitement ; aucune n'est devinée d'après un en-tête.

La colonne pivot porte des euros, avec deux décimales au plus.

| Type | Contenu | Colonnes requises |
|---|---|---|
| `pv_register` (requis) | Un événement par ligne. Le pivot porte la provision à l'ouverture (0 si aucune) ; la date est la naissance de l'événement. | type ; traitement retenu ; date de clôture du dossier ; compte ; clôture déclarée ; obligation décrite ; auteur ; confidentiel ; libellé public. Facultatives : engagement, contrepartie, méthode, décision, pièce de décision, date de décision. |
| `pv_movements` | Dotations, utilisations et reprises non utilisées. Le journal déclare couvrir l'exercice entier. | événement ; nature ; compte ; pièce. Facultative : justification. |
| `pv_estimates` | Un scénario par ligne. | événement ; scénario ; retenue (une seule par événement) ; méthode ; auteur ; pièce. Facultative : appréciation. |
| `pv_ledger` (requis) | Un compte 15 par ligne. Le pivot porte le solde de clôture ; la date est celle de la clôture. | solde d'ouverture |
| `pv_annex` | Informations publiées, rattachées à un événement. | rubrique ; statut du montant (`publie`, `non_chiffre`, `non_fourni_prejudice`). Un statut autre que `publie` impose 0 dans le pivot ; le montant est alors inconnu, jamais nul. |
| `pv_support` | Pièces citables. Le pivot porte le nombre de pages. | nature ; confidentiel. Facultatives : événement, libellé. |

**Refus à l'aperçu.** Un refus porte la ligne et la colonne en cause, mais jamais la valeur d'une colonne potentiellement confidentielle (obligation, contrepartie, méthode, décision, scénario, appréciation, justification). Rien n'est conservé. Sont refusés notamment :
- un traitement ou un type inconnu ;
- une provision sans compte de classe 15, sans clôture déclarée ou sans méthode ;
- une clôture non nulle pour un traitement sans provision ;
- un montant d'engagement hors engagement hors bilan ;
- une obligation, un auteur ou un libellé manquant ;
- un drapeau de confidentialité illisible ;
- un journal de mouvements ne couvrant pas l'exercice entier ;
- un mouvement hors exercice ou sur un autre compte que son événement (le reclassement n'est pas couvert) ;
- une estimation sans pièce, ou deux estimations retenues pour un même événement ;
- une ligne de mouvement ou d'estimation rattachée à un événement absent du registre.

## Population, unité et période

- **Unité de test** : l'événement du registre (`pv_event`).
- **Population** : tous les événements du registre approuvé, avec ou sans écriture.
- **Mesure descriptive** : la provision à l'ouverture.
- **État**, calculé selon une méthode interne à partir des dates :
  - ouvert à l'ouverture ;
  - nouveau dans l'exercice ;
  - clos pendant l'exercice.
- **Exclusions motivées**, que l'outil ne supprime jamais :
  - un événement né après la clôture. Son incidence relève de la revue des événements postérieurs, hors de ce test ;
  - un événement clos avant l'ouverture.

## Calculs (méthodes internes de comparaison)

1. **Pont par événement.** Provision d'ouverture + dotations − utilisations − reprises non utilisées = provision de clôture calculée. Elle est comparée à la clôture déclarée au registre.
   - Sans journal approuvé, la clôture calculée est **inconnue**, jamais égale à l'ouverture.
2. **Estimation / écriture.** Pour les seuls événements que l'entité traite en provision, la différence est : estimation retenue − provision de clôture calculée.
   - Une différence non nulle est une **différence à examiner**, au montant connu. Ce n'est jamais une anomalie validée ni une correction proposée.
   - Sans estimation retenue, l'événement est non concluant.
   - Un événement clos dont la provision est soldée ne requiert pas d'estimation.
3. **Événement / annexe.**
   - Un passif éventuel, un engagement hors bilan ou un passif non comptabilisé, non clos, absent de l'annexe est signalé « à examiner ».
   - Pour chaque ligne d'annexe, le montant publié est comparé à la référence :
     - la provision calculée pour une provision ;
     - l'engagement au registre pour un engagement ;
     - l'estimation retenue pour un passif éventuel.
   - Une rubrique incohérente avec le traitement est signalée.
   - Une ligne sans événement au registre signale un registre peut-être incomplet.
4. **Cadrage par compte 15.**
   - Ouverture : grand livre − somme des ouvertures du registre.
   - Clôture : grand livre − somme des clôtures calculées.
   - Pont du grand livre : clôture − (ouverture + dotations − utilisations − reprises).
   - Un compte du registre absent du grand livre a un solde inconnu, jamais nul.
5. **Tableau des provisions par catégorie** (151 risques, 152 charges, autres comptes 15). Il reprend les colonnes de l'article 832-13, recalculées sur le registre pour comparaison. Il ne remplace pas l'annexe.
6. **Probabilités.** Aucune formule probabilité × montant. Les scénarios sont affichés tels que documentés ; l'hypothèse retenue est celle que désigne la source.

## États et issue

**Statut d'un événement**, de la priorité la plus haute à la plus basse :

| Priorité | Statut | Déclencheurs |
|---|---|---|
| 1 | Hors population | — |
| 2 | Différence à examiner | estimation ≠ provision ; pont ≠ clôture déclarée ; clos avec solde ; solde sans traitement « provision » |
| 3 | Écart avec l'annexe | absent ; montant différent ; rubrique différente |
| 4 | Justificatif manquant | mouvement sans pièce citable ; décision sans pièce |
| 5 | Non concluant | estimation absente ; mouvements inconnus ; information non fournie pour préjudice |
| 6 | Clos, provision soldée | — |
| 7 | Concordant | — |
| 8 | Sans écriture | — |

Chaque nature d'écart porte une couleur, une icône et un libellé : l'interface ne repose jamais sur la couleur seule.

**Incertitudes.** Les codes suivants ne sont jamais des écarts :
- mouvement ou décision sans pièce ;
- estimation absente ;
- mouvements inconnus ;
- information non fournie pour préjudice ;
- annexe non fournie ;
- cadrage incomplet ;
- informations des avocats non obtenues.

**Issue de la feuille.** Toute autre exception donne « exceptions détectées ». Si la feuille ne porte que des incertitudes, elle est « non concluante ». Sinon, « aucune exception détectée ».

## Confidentialité : masquage côté serveur selon les droits

- **Ce qui est confidentiel.** Le registre marque chaque événement confidentiel ou non ; les pièces citables portent aussi ce drapeau (paramètre utilisateur).
- **Qui peut lire.** L'accès au contenu confidentiel est une **capacité distincte**, fournie par le serveur de confiance. Elle n'est jamais déduite d'un rôle général et jamais lue dans la requête.
  - Par défaut, le serveur durable ne l'accorde à personne : le contenu est masqué pour tous tant qu'une habilitation dédiée n'est pas validée.
  - La recette l'accorde à des identités synthétiques nommées.
- **Ce qui est retiré de la réponse.** Pour un lecteur sans la capacité, le serveur retire ces éléments de la réponse JSON elle-même, pas seulement de l'affichage CSS :
  - l'obligation décrite, la contrepartie, la méthode et la décision ;
  - les scénarios et les estimations, y compris l'estimation retenue et la différence estimation / provision ;
  - les libellés des pièces confidentielles ;
  - les lignes confidentielles des sources, y compris la copie des lignes que le calcul conserve comme entrée ;
  - le texte et le montant des notes portant sur une différence sensible ou sur un événement confidentiel (identifiant `pv-event:<événement>:…`).
- **Ce qui reste visible.**
  - Les montants comptabilisés (pont, grand livre) et les montants publiés en annexe.
  - Les runs stockés, les empreintes et le `submittedHash` ne sont pas modifiés.
- **Téléchargements.** Le téléchargement de l'original d'une source contenant du contenu confidentiel est refusé (`PV_CONFIDENTIAL_FORBIDDEN`, 403) sans la capacité.
- **Limite.** Une note libre sans rattachement à un événement n'est pas masquée. Le préparateur ne doit pas y recopier de contenu confidentiel.

## Preuves et jugement humain

- **Préparation.** Avant le gel, le préparateur déclare si les informations des avocats sur les procès et litiges ont été obtenues :
  - s'il les a obtenues, il cite la pièce figée et sa ligne ;
  - sinon, il donne un motif d'au moins dix caractères.

  Sans informations des avocats et avec au moins un litige dans l'exercice, la feuille porte une incertitude citant NEP 501 §§ 07-08.
- **Traitement des points.** Chaque différence ou incertitude devient une note bloquante. Son traitement cite une pièce figée et sa version, résolue par le serveur ; le navigateur ne saisit jamais un nom de fichier ni une empreinte.
- **Revue.** Elle est faite par une autre identité (auto-revue refusée), sur l'empreinte soumise, puis la version est verrouillée.
- **Portée.** Une approbation de feuille ne vaut ni opinion sur les comptes ni conclusion juridique.

## Chaîne durable

| Élément | Comportement |
|---|---|
| Tables | `pv_imports`, `pv_import_approvals`, `pv_source_heads`, `pv_workpaper_heads`, `pv_workpaper_versions`, `pv_command_receipts`, en ajout seul (déclencheur `PV_APPEND_ONLY`). |
| Écritures | Compare-and-swap des versions, idempotence par clé, sources courantes exigées. |
| Source remplacée | La feuille devient périmée et une révision est requise. |
| Downgrade | Refusé si des données existent. |

## Sources professionnelles consultées (10/10/2026)

| Source | Organisme, version, section | Nature | Limites d'application |
|---|---|---|---|
| [Code de commerce, art. L123-20](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000030927181) | Légifrance ; version en vigueur depuis le 01/01/2016 (ordonnance n° 2015-900 du 23/07/2015, art. 1). Prudence ; provisions nécessaires même sans bénéfice ; prise en compte des passifs nés pendant l'exercice ou antérieurement, connus avant l'établissement des comptes. | Obligation légale | L'outil ne qualifie aucun passif. La borne de population (événements nés au plus tard à la clôture) est une méthode interne de découpage, pas une application de l'article. |
| [PCG — règlement ANC n° 2014-03, version consolidée au 1er janvier 2026](https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/Recueils/PCG_janvier2026/PCG--1er-janvier-2026.pdf) | ANC ; PDF officiel téléchargé et lu le 10/10/2026. Art. 321-1, 321-5, 321-6 (p. 34) ; 322-1, 322-2, 322-4, 322-5, 322-8 (p. 35-36) ; 323-2, 323-10, 323-12 (p. 36-37) ; 832-13 (p. 113) ; 832-14 (p. 113-114) ; 836-1 (p. 118-119) ; comptes 151 et 152 (p. 133-134). | Obligation légale (règlement homologué) | Les définitions (provision, passif éventuel) servent à libeller les traitements retenus par l'entité. « Hypothèse la plus probable » (323-2), « probabilité faible » (832-13) et « montants individuellement significatifs » (832-14) restent des jugements humains. |
| NEP 540 — Audit des estimations comptables et des informations y afférentes fournies dans l'annexe | Homologuée par arrêté du 13/11/2024 (JO n° 0273 du 19/11/2024, art. A. 821-82 C. com.). Elle remplace la version homologuée par [arrêté du 24/08/2021](https://www.legifrance.gouv.fr/jorf/id/JORFTEXT000043990557) (JORF du 31/08/2021). Lue dans la [reproduction CNCC](https://doc.cncc.fr/docs/nep-540-audit-des-estimations-co-67497cbd403c2/attachments/nep-540) : §§ 01-02, 05-09 (estimation comptable, estimation retenue par la direction, dénouement), § 14. | Norme professionnelle | Le texte du JO de 2024 n'a pas été lu directement (la CNCC rappelle que seuls les textes publiés au JO font foi). L'outil n'exécute pas les procédures du commissaire aux comptes : il compare l'estimation retenue documentée et l'écriture, et montre le dénouement d'un risque clos. |
| [NEP 501 — Caractère probant des éléments collectés (applications spécifiques), §§ 07-08](https://h2a-france.org/normes/caractere-probant-des-elements-collectes-applications-specifiques/) | H2A ; arrêté du 27/11/2024, JO du 30/11/2024. Procès, contentieux et litiges : informations des avocats. | Norme professionnelle | L'outil consigne la pièce ou le motif et lève une incertitude. Il ne tire pas les conséquences que la norme confie au professionnel. |

**Méthodes internes** :
- pont par événement ;
- comparaisons estimation / écriture et événement / annexe ;
- cadrage par compte ;
- statuts et priorités ;
- bornes de population ;
- règle « un mouvement sur le compte de son événement » ;
- masquage.

Aucun seuil, taux, tolérance ni durée n'est encodé.

**Paramètres utilisateur** :
- traitement retenu ;
- confidentialité ;
- estimation retenue ;
- statut du montant publié ;
- déclaration sur les informations des avocats.

## Exemple synthétique

Voir [RECETTE.md](RECETTE.md). Le recueil contient 7 événements, 6 mouvements, 5 estimations, 3 comptes, 3 lignes d'annexe et 13 pièces, tous fictifs.
