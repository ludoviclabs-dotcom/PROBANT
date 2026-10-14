# C09 — Parcours Capitaux propres unique : contrat

Date : 14 octobre 2026. Comparaison et choix : [COMPARAISON.md](COMPARAISON.md). Recette : [../recette/c09/RECETTE.md](../recette/c09/RECETTE.md).

## 1. Vue commune (`capitaux-parcours-1`)

**Entrée unique du cycle** : `/capitaux-propres/parcours`. Elle remplace dans la navigation la feuille et la procédure parallèle. La route `GET /api/workpapers/capitaux-propres/parcours` accepte :

- `dossierId` et `periodId` ;
- facultativement `capitauxId` et `capitauxVersion`, `equityId` et `equityVersion`.

**Lecture.** Chaque feuille est lue par son propre runtime : son drapeau, sa session, ses droits, sa transaction et sa version exacte. Un refus de session ou de droit refuse toute la lecture. Tout refus d’autorisation, y compris d’un dossier hors du périmètre de la session (`DOSSIER_NOT_FOUND`, 403), refuse la lecture avec son statut. Une chaîne fermée ou indisponible est signalée, et ses décisions ne sont jamais réputées absentes. La vue n’écrit rien.

`lib/workpapers/capitaux-parcours.ts` (`buildParcours`) lit le résultat figé de chaque feuille, sans recalcul à partir des sources :

- **`/capitaux-propres`.** Les lignes en vigueur sont regroupées par décision : identifiant de décision et résolution, ou type à défaut de résolution. Les lignes remplacées forment l’historique d’amendement. Les lignes des autres fonds propres sont exclues avec motif.
- **`/equity`.** Une ligne du registre forme une décision. Son PV est identifié par l’empreinte de la version citée par la lecture humaine. Son type reste « non typé » : ce parcours ne le qualifie pas.

Chaque décision économique porte :

- le type, l’organe, les dates ;
- l’effet voté par composante (rubrique et famille commune) ;
- le comptabilisé ;
- le paiement (§ 2.2) ;
- le PV cité (empreinte SHA-256, page) ;
- les traces de chaque feuille, avec un lien vers la feuille d’origine à sa version exacte. Le lien passe par `DossierContextAnchor`, qui transmet le contexte du dossier.

### Dédoublonnage — règle interne

| Situation | Correspondance | Comptée |
|---|---|---|
| Même PV (empreinte identique) à la même page, une décision par feuille, même montant, date d’effet commune | `linked_concordant` | une fois |
| Même PV et même page, une décision par feuille, montant ou date d’effet différents | `linked_divergent` | une fois, montant inconnu |
| Même PV et même page, plusieurs décisions dans une feuille et au moins une dans une autre | `to_reconcile` | non |
| Décision sans PV commun et décision d’une autre feuille à la même date d’effet | `to_reconcile` (doublon possible) | non |
| Autres cas | `single` | une fois |

Garde-fous :

- **Aucun rapprochement par montant.** Le montant ne sert qu’à signaler une divergence.
- **Décision de référence.** Une décision reliée prend ses montants dans la feuille cible 1.1.0, puis dans `/capitaux-propres` 1.0.0, puis dans `/equity`.
- **Totaux.** Ils ne portent que sur les décisions comptées : nombre par type, effet voté par famille, paiements. Les exclusions sont dénombrées avec leur motif.

## 2. Règle `capitaux_propres.review` 1.1.0

**Versions.**

- Règle, gabarit et programme en 1.1.0 ; résultat `capitaux-result-2` ; travail `equity-2`.
- Un résultat 1.0.0 reste lisible tel qu’enregistré, mais ne peut pas être produit.
- Sur une feuille 1.0.0, toute commande autre que la révision est refusée (`EQ_RULE_REPLACED_REVISION_REQUIRED`, HTTP 409). La révision adopte le gabarit 1.1.0.

### 2.1 Décision amendée

**Source.** La colonne facultative `amendsColumn` du registre désigne la ligne remplacée.

**Contrôles à l’import.** Toute anomalie est refusée avec sa localisation :

| Cas | Code |
|---|---|
| Ligne remplacée absente du registre | `EQ_AMENDMENT_TARGET_UNKNOWN` |
| Composante ou type différent | `EQ_AMENDMENT_TARGET_MISMATCH` |
| Décision qui amende non postérieure à la décision remplacée | `EQ_AMENDMENT_ORDER_INVALID` |
| Ligne remplacée deux fois | `EQ_AMENDMENT_DUPLICATE` |
| Ligne qui se remplace elle-même | `EQ_AMENDMENT_INVALID` |

**Moteur.**

- **Ligne remplacée.** Une ligne remplacée par une décision prise au plus tard à la clôture prend le statut `superseded`. Elle reste visible, mais n’est ni testée ni comptée.
- **Décision en vigueur.** Elle reprend les écritures et les règlements des lignes qu’elle remplace. L’écart vaut comptabilisé de la chaîne − voté en vigueur.
- **Amendement après la clôture.** Une modification décidée après la clôture ne change pas la décision en vigueur à la clôture, même si elle déclare un effet dans l’exercice. Elle est datée par sa décision (« postérieure à la clôture ») : un signal visible, hors comparaison, paiement, repères légaux et décomptes du parcours unique.

### 2.2 Paiement de la décision en vigueur

Le paiement est calculé par décision (identifiant et résolution), sur les lignes de distribution et d’augmentation de capital, avec le module `capitaux-payment.ts`. Il compare le montant voté aux règlements cités, à la clôture et à la revue. Statuts :

- `paid`, `partially_paid`, `unpaid`, `overpaid` ;
- `unknown` sans source de règlements ;
- `not_applicable` pour un type sans paiement attendu.

La dette envers les associés (compte 457) est hors des sources du cycle : elle n’est ni calculée ni rapprochée.

### 2.3 Présentation dettes / autres fonds propres (ANC 2024-07)

**Régime de l’exercice.** Il est daté par le résolveur C04 (`resolveFrenchGaap`, statut d’`anc-2024-07`) :

- ANC 2024-07 de plein droit pour les exercices ouverts à compter du 01/01/2026 ;
- par anticipation déclarée et citée pour l’exercice en cours au 27/12/2025 (`EQ_ANTICIPATION_CITATION_REQUIRED`) ;
- texte antérieur sinon.

**Termes contractuels.** Un instrument porte des termes déclarés par une personne (oui, non ou inconnu) et cités à une pièce figée. **Le classement ne dépend jamais du numéro de compte, du libellé ou du montant.**

| Régime | Termes déclarés | Classement |
|---|---|---|
| ANC 2024-07 | Droits du concédant | Autres fonds propres (314-1, 1212-22) |
| ANC 2024-07 | Élément de capitaux propres (1211-10) déclaré | Capitaux propres (déclaré), hors rubrique |
| ANC 2024-07 | Avance publique, remboursement conditionné au succès, abandon en cas d’échec | Avances conditionnées (316-1) ; intérêts en 1674 s’ils sont conditionnés, en dettes sinon |
| ANC 2024-07 | Non inscriptible en capitaux propres et aucun remboursement en trésorerie ou par remise d’un actif imposable | Fonds non remboursables (315-1) |
| ANC 2024-07 | Remboursement imposable | Dettes |
| ANC 2024-07 | Remboursement imposable sur une part, parts fixes explicites | Ventilation fonds non remboursables / dettes (315-1) |
| ANC 2024-07 | Remboursement partiel sans parts fixes | Dettes pour le tout (315-1) |
| Texte antérieur | Présentation retenue par l’entité | « Déclaré » : aucun critère codé, aucun bien-fondé vérifié |
| Tous | Terme inconnu, pièce non citée, régime indéterminé | **À qualifier** : hors autres fonds propres comme hors dettes |

**Totaux et signaux.**

- Un compte de la rubrique sans instrument, ou un instrument à qualifier, rend le **total des autres fonds propres inconnu**.
- Une ligne sans instrument est « non applicable », jamais 0.
- Un compte incohérent avec le classement déclaré (art. 1211-16) donne un signal, jamais un reclassement.

### 2.4 Repères légaux — ce que le moteur calcule et ce qui reste juridique

La forme sociale est déclarée (SARL, SA, SAS, SCA, autre ou non documentée), avec la pièce citée en option. La version d’article est choisie par date :

- date de la décision d’affectation pour L232-10 ;
- date de clôture pour les autres articles.

| Sujet | Texte et version | Ce que le moteur calcule | Signal | Ce qui reste juridique |
|---|---|---|---|---|
| Réserve légale | L232-10 (SARL et sociétés par actions) | Résultat d’ouverture ; report à nouveau débiteur d’ouverture ; base repère ; 1/20 de cette base et 1/10 du capital en fractions exactes ; réserve d’ouverture ; affectation votée à la réserve légale | « À examiner » si l’affectation votée est inférieure au 1/20 de la base et que la réserve reste sous le 1/10 du capital | Notions légales de bénéfice et de pertes antérieures, réserves statutaires, nullité, capital à retenir |
| Distribution | L232-11 (depuis le 04/01/2003) | Distributions en vigueur à effet dans l’exercice ; capitaux propres de clôture ; capital + réserve légale + écarts de réévaluation à la clôture. Une composante non fournie est exclue et nommée. | « À examiner » si les capitaux propres de clôture sont inférieurs à ce repère | Bénéfice distribuable, réserves indisponibles statutaires, postes de réserves désignés, acomptes (L232-12), dividende fictif |
| Moitié du capital | L223-42 (SARL) ; L225-248 (SA, SCA ; SAS par le renvoi de L227-1) | Capitaux propres et capital de clôture, rapport exact | « À examiner » si les capitaux propres sont inférieurs à la moitié du capital. **Aucune alerte de dissolution, aucun délai calculé.** | Capitaux propres retenus pour ce test, approbation des comptes, délai de 4 mois, décision, publicité, reconstitution ou réduction, seuil fixé par décret, sauvegarde ou redressement, disposition transitoire de la loi 2023-171 |

## 3. Sources lues

**PDF ANC.** Lus le 14/10/2026 et extraits avec pypdf dans un dossier isolé ; empreintes SHA-256 comparées au résolveur C04.

| Texte | Version, empreinte | Articles | Effet | Usage |
|---|---|---|---|---|
| Règlement ANC n° 2024-07 du 6/12/2024, homologué par arrêté du 26/12/2025, JO du 27/12/2025 | PDF ANC, 13 p., `19288fed…` | Art. 1er : 314-1, 315-1, 315-2, 316-1, 322-14, 821-1, 838-18, 1121-1 (comptes 16, 161–164, 167, 1682), 1141-1, 1211-10, 1211-16, 1212-22 ; art. 6 | Exercices ouverts à compter du 01/01/2026 ; anticipation dès le JO pour l’exercice en cours | Régime et critères § 2.3. Le texte ne contient aucune disposition propre de première application. |
| PCG consolidé au 01/01/2026 | `b9e7a732…` (même empreinte que le résolveur C04) | 314-1 à 316-1, 1141-1, 1211-10, 1211-12 (compte 1209, renvoi L232-12), 1211-16 | Édition de lecture dès 2026 | Contrôle de l’intégration de 2024-07 |
| Recueil des normes comptables, version 01/01/2024 | `f608f78f…`, 677 p. | 821-1, renvoi « * » (p. 429-430 du PDF) ; 932-1 (compte 167, p. 512) ; 941-16 (p. 538) | Exercices 2024 (fenêtre interne C04) | Texte antérieur : rubrique « le cas échéant », aucun critère |
| Règlement ANC n° 2022-06 | `aeaa05cf…` | 821-1 renvoi (PDF p. 10), 1121-1 (p. 42), 1141-1 (p. 65), 1211-16 (p. 71) | Exercices ouverts dès le 01/01/2025 | Même rédaction antérieure pour 2025 sans anticipation |

**Légifrance.** Lu le 14/10/2026 dans le navigateur intégré (pages `codes/article_lc` et sections datées) :

| Article | Version | Identifiant | Usage |
|---|---|---|---|
| L232-10 | Du 21/09/2000 au 30/09/2025 (ord. 2000-912) | `LEGIARTI000051322888` à la date du 31/12/2024 | Réserve légale |
| L232-10 | Depuis le 01/10/2025 (ord. 2025-229, art. 62 ; application : art. 70) | `LEGIARTI000051322888` | Réserve légale |
| L232-11 | Depuis le 04/01/2003 | `LEGIARTI000006229026` | Distribution |
| L232-12 | Depuis le 21/09/2000 | Lu dans la même section | Acomptes, cités comme « reste juridique » |
| L223-42 | Du 05/08/2003 au 10/03/2023 (loi 2003-721) | `LEGIARTI000047292166` à date | Moitié du capital (SARL) |
| L223-42 | Depuis le 11/03/2023 (loi 2023-171, art. 14) | `LEGIARTI000047292166` | Moitié du capital (SARL) |
| L225-248 | Du 21/09/2000 au 10/03/2023 | `LEGIARTI000047292156` à date | Moitié du capital (SA, SCA, SAS) |
| L225-248 | Depuis le 11/03/2023 (loi 2023-171, art. 14) | `LEGIARTI000047292156` | Moitié du capital (SA, SCA, SAS) |
| L227-1 | Du 21/07/2019 au 25/05/2023 | `LEGIARTI000048535177` à date | Renvoi des SAS aux règles des SA |
| L227-1 | Du 26/05/2023 au 31/12/2024 | `LEGIARTI000048535177` à date | Renvoi des SAS aux règles des SA |
| L227-1 | Depuis le 01/01/2025 | `LEGIARTI000048535177` | Renvoi des SAS aux règles des SA |

**Non lu.** La disposition transitoire de la loi n° 2023-171, art. 14 (page `/loda/` protégée par une vérification anti-robot, non contournée). Elle n’est pas appliquée, et aucun délai n’est calculé. Une date antérieure à la première version relue d’un article laisse le repère non calculé.

## 4. Choix internes

Ces choix ne sont pas attribués à une norme :

- **Identité d’une décision.** Deux feuilles désignent la même décision si elles citent le même PV (empreinte du fichier) à la même page, à raison d’une décision par feuille.
- **Doute de doublon.** Une décision sans PV commun et une décision d’une autre feuille à la même date d’effet ne sont pas comptées.
- **Montant d’une décision.** On retient le plus grand des crédits et des débits de ses lignes : un transfert compte une fois le montant déplacé.
- **Regroupement.** Une décision regroupe les lignes de même identifiant et de même résolution ; à défaut de résolution, celles de même type.
- **Paiement attendu.** Il concerne les distributions et les augmentations de capital, comparé au voté de la décision en vigueur.
- **Amendement.** Il remplace une ligne de même composante et de même type, et prend effet s’il est décidé au plus tard à la clôture.
- **Base repère de la réserve légale.** Résultat d’ouverture moins report à nouveau débiteur d’ouverture. La notion légale reste à apprécier.
- **Repère minimal de distribution.** Capital, réserve légale et écarts de réévaluation (al. 3 et 4 de L232-11). Les réserves statutaires restent juridiques.
- **Date des versions d’articles.** Décision d’affectation pour L232-10, clôture pour les autres articles.
- **Questions déclarées.** La transcription des critères des art. 315-1 et 316-1 en questions déclarées est un choix de modélisation ; le texte fait foi.
