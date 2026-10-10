# Mission 19 — Recette synthétique « ALPHA SAS (synthétique) », exercice 2026

Données exclusivement synthétiques : aucune entité, personne ni pièce réelle. Les valeurs attendues ci-dessous sont calculées à la main. Les tests comparent la sortie du moteur à ces valeurs.

## Fichiers

| Fichier | Rôle |
|---|---|
| `lib/workpapers/__tests__/closing-fixtures.ts` | Construction du dossier, commande par commande, avec les vrais handlers |
| `lib/workpapers/__tests__/closing-harness.ts` | Banc de test (runtime et handlers réels, stockage mémoire). Feuille Provisions verrouillée par sa propre chaîne (Mission 16). |
| `lib/workpapers/__tests__/closing-runtime.test.ts` | 16 tests métier et d'accès |
| `lib/workpapers/__tests__/closing-durable.integration.test.ts` | Recette PostgreSQL jetable (CI) |
| `e2e/closing.spec.ts` | Recette navigateur (build de production, appels routés vers le runtime réel) |

**Exercice et identités.** Exercice du 01/01/2026 au 31/12/2026, date de revue 31/03/2027 : le dossier et l'exercice sont ceux de la recette Provisions. Identités serveur synthétiques :
- `preparer-cl` et `collab-b-cl` (préparation) ;
- `reviewer-cl` (revue) ;
- `signer-cl` (signature avec habilitation de clôture) ;
- `signer-sans-habilitation` (signature sans habilitation) ;
- `admin-cl` (tous les droits, pour les tests de séparation des tâches).

## Programme

| Risque | Cycle | Assertions | Évaluation |
|---|---|---|---|
| R-01 Litiges non provisionnés ou mal évalués | Provisions | Exhaustivité (solde), évaluation (solde), exhaustivité (annexe) | Élevé |
| R-02 Ventes rattachées au mauvais exercice | Clients | Séparation des exercices, réalité (flux) | Modéré |
| R-03 Stocks inexistants ou mal valorisés | Stocks | Existence, évaluation (solde) | Élevé |
| R-04 Soldes et frais bancaires non exhaustifs | Trésorerie | Existence, exhaustivité (solde) | Faible |
| R-05 Événements postérieurs non pris en compte | Transversal | Exhaustivité (annexe), évaluation (solde) | Modéré |
| R-06 Accès non autorisés à l'ERP | Systèmes d'information | Réalité, mesure (flux) | Modéré |
| R-07 Emprunts non confirmés | Transversal | Existence, droits et obligations | Faible |

| Procédure | Nature | État attendu | Cas de recette |
|---|---|---|---|
| P-01 Registre des provisions | Feuille outillée (`provisions.register`) | Feuille verrouillée | **Cycle verrouillé mais dossier incomplet** |
| P-02 Lettres aux avocats | Confirmation | En cours (réponse de l'avocat 2 attendue) | Litige signalé par l'avocat 1 |
| P-03 Rapprochement BL / factures | Contrôle interne | En cours | **Contrôle décrit mais non testé** |
| P-04 Observation de l'inventaire | Observation physique | Population absente | **Population absente** |
| P-05 Confirmation bancaire B1 | Confirmation | Revue | **Anomalie corrigée avec nouvelle preuve** |
| P-06 Événements postérieurs | Événements postérieurs | En cours | Déclaration de la direction seule |
| P-07 ITGC — gestion des accès | ITGC | Périmètre et méthode requis | Checklist refusée |
| P-08 Confirmation des emprunts | Confirmation | Non applicable (motivée) | **Procédure non applicable motivée** |

**Contradiction C-01 (non résolue).** La lettre d'affirmation de la direction (« aucun litige en cours ») contredit la réponse de l'avocat 1 (« litige prud'homal en cours »). C'est le cas **contradiction non résolue**.

## Valeurs attendues (calcul manuel)

**Procédures.** 8 au total, dont 1 non applicable motivée : 7 applicables.

| Indicateur | Attendu | Détail |
|---|---|---|
| Procédures conclues et revues | 2 / 7 | P-01 (feuille verrouillée), P-05 (revue) |
| Procédures conclues par le préparateur | 2 / 7 | — |
| Couples risque × assertion avec une procédure revue | 4 / 13 | R-01 : 2, R-04 : 2. Les 2 couples de R-07, seulement non applicables, sont exclus. |
| Contrôles : description | 1 / 2 | P-03 et P-07 |
| Contrôles : mise en œuvre | 1 / 2 | — |
| Contrôles : test de fonctionnement | 0 / 2 | — |
| ITGC avec périmètre et méthode | 0 / 1 | — |
| Feuilles de cycle verrouillées | 1 / 1 | — |
| Pièces demandées reçues | 1 / 3 | D-02 reçue ; D-01 et D-03 ouvertes |
| Points de revue clos | 1 / 2 | RP-01 clos ; RP-02 ouvert sur P-03 |
| Contradictions résolues | 0 / 1 | — |
| Anomalies corrigées | 1 / 3 | — |
| Limites d'étendue appréciées | 0 / 1 | — |

**Anomalies.**

| Anomalie | Montant | État |
|---|---|---|
| A-01 | 1 240,00 € | Corrigée, avec l'écriture OD-2027-014 déposée après l'anomalie |
| A-02 | 3 000,00 € | Non corrigée, appréciée par la revue |
| A-03 | **Inconnu** | Non corrigée, non appréciée (site B non observé) |

- **Totaux :** corrigées 1 240,00 € ; non corrigées 3 000,00 € connus et 1 montant inconnu, jamais compté pour zéro.
- **Aucune comparaison à un seuil.**

**File des pièces manquantes (4 éléments).**
- D-01 : échantillon de rapprochements (P-03) ;
- D-03 : réponse de l'avocat 2 (P-02) ;
- population absente (P-04) ;
- éléments corroborant la déclaration de la direction (P-06).

**Travaux restants : 19.**

| Origine | Nombre | Détail |
|---|---|---|
| Couple sans procédure | 1 | R-03 · Évaluation et imputation |
| P-02 | 2 | Pièce attendue, conclusion |
| P-03 | 3 | Test de fonctionnement, pièce attendue, conclusion |
| P-04 | 3 | Population absente, aucun travail, conclusion |
| P-06 | 2 | Déclaration seule, conclusion |
| P-07 | 4 | Périmètre ITGC, population, aucun travail, conclusion |
| Point de revue | 1 | RP-02 |
| Contradiction | 1 | C-01 |
| Anomalie à apprécier | 1 | A-03 |
| Limite à apprécier | 1 | L-01 |

**Journal.** 53 événements, chacun avec son auteur serveur, son heure et son empreinte chaînée.

## Cas de recette et preuve

| Cas | Comportement attendu | Test |
|---|---|---|
| Contrôle décrit mais non testé | Trois étapes séparées : le test de fonctionnement est absent et le fonctionnement n'est jamais déduit. Une conclusion sur le fonctionnement est refusée (`CL_WORK_INCOMPLETE`). Une conclusion « conception et mise en œuvre » reste possible et porte la limite « fonctionnement non testé ». | `closing-runtime.test.ts`, `e2e/closing.spec.ts` |
| Procédure non applicable motivée | Motif obligatoire (`CL_NA_REASON_REQUIRED`) ; exclue des dénominateurs avec mention ; aucun travail admis ; incohérence si des travaux existent | `closing-runtime.test.ts` |
| Population absente | Aucun travail d'exécution ni conclusion (`CL_POPULATION_ABSENT`) ; présente dans la file des pièces ; montant d'anomalie inconnu conservé inconnu | `closing-runtime.test.ts`, e2e |
| Anomalie corrigée avec nouvelle preuve | Pièce d'origine refusée (`CL_NEW_EVIDENCE_REQUIRED`) ; déclaration seule refusée (`CL_REPRESENTATION_ONLY`) ; pièce déposée après l'anomalie acceptée | `closing-runtime.test.ts` |
| Contradiction non résolue | Elle bloque la clôture. Une résolution par la seule déclaration est refusée, une résolution citant la réponse de l'avocat est acceptée. | `closing-runtime.test.ts`, e2e |
| Cycle verrouillé mais dossier incomplet | Feuille Provisions réellement verrouillée (1 / 1), dossier non clôturable. Validation refusée au signataire habilité (`CL_CLOSING_BLOCKED`), au signataire sans habilitation et au préparateur (403). | `closing-runtime.test.ts`, e2e |
| Aucune opinion générée | Aucune mention de certification ou d'opinion dans la réponse ; la validation est un texte humain enregistré | `closing-runtime.test.ts` |
| Péremption | Une nouvelle version d'une pièce citée rend la conclusion et la revue périmées, et le travail « à réexaminer ». La validation devient périmée si une feuille de cycle change ; la réouverture est tracée. | `closing-runtime.test.ts` |
| Qui, quoi, quand, sur quoi, quelle preuve | Auteur et heure serveur, date de réalisation déclarée, objet, éléments examinés, pièce, version, page et empreinte. Revue par une autre personne. | `closing-runtime.test.ts`, e2e |
