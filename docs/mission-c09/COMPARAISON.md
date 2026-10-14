# C09 — Capitaux propres : comparaison des deux parcours et choix motivé

Date : 14 octobre 2026. Base : `main` `ff3f9fb`.

PROBANT propose deux procédures pour le même cycle :

- `equity.review` sur `/equity`, livrée par #62 ;
- `capitaux_propres.review` sur `/capitaux-propres`, livrée par #65 en cohabitation.

Le rapport du 12/10/2026 (ARCH-01) demande d’abord une vue unifiée, puis une migration contrôlée. Cette note établit la matrice, le choix et la transition. La vue commune et la règle 1.1.0 sont décrites dans [CONTRAT.md](CONTRAT.md).

## 1. Matrice

| Dimension | `equity.review` (`/equity`, #62) | `capitaux_propres.review` (`/capitaux-propres`, #65) |
|---|---|---|
| **Stockage** | Tables partagées de la chaîne Clients (`clients_imports`, `clients_workpaper_*`, `clients_source_heads`). La migration `0010` élargit le `CHECK` des types de pièces. `EquityRuntime` hérite de `ClientsRuntime`. | Tables dédiées `eq_*` (migration `0012`), en ajout seul (triggers `probant_eq_immutable`). Magasin `EquityWorkpaperRepository`. |
| **Activation** | `PROBANT_EQUITY_DURABLE` (jetable ou profil personnel). | `PROBANT_CAPITAUX_DURABLE` (idem). |
| **Versions** | Règle 1.0.0, travail `equity-dossier-1`, résultat `equity-result-1`. Le registre ne contrôle le résultat que par `z.custom` sur la version. | Avant C09 : règle 1.0.0, travail `equity-1`, résultat `equity-result-1` (même nom, autre contrat). Après C09 : règle 1.1.0, travail `equity-2`, résultat `capitaux-result-2`, contrôlé par zod avec invariants. |
| **Sources** | Sept types : soldes, GL, tableau de variation, registre, règlements, PV (PDF), actes (PDF). Un seul mapping de onze colonnes, toutes obligatoires. Une tête par type, donc un seul PV et un seul acte courants. | Six types : balance, écritures, tableau fourni, registre, règlements, PV (PDF). Colonnes requises par source, colonnes facultatives nommées. Une tête par pièce : plusieurs PV courants. |
| **Composantes** | Déclarées par la personne : familles, comptes, inventaire complet déclaré. Une exclusion se justifie par une pièce. Couverture du GL et du registre déclarée (`documented` ou `incomplete`). | Treize rubriques du modèle de bilan (art. 821-1, repère documentaire), compte rattaché à une composante dans chaque source. Les autres fonds propres sont exclus avec motif. Une composante non fournie n’est jamais réputée nulle. |
| **Décision** | Une ligne porte un identifiant, une date de vote, une date d’effet, un montant positif, une composante et un sens (hausse, baisse, transfert, sans effet). Ni organe, ni type métier, ni résolution. | Ligne, identifiant de décision, type (affectation, distribution, augmentation ou réduction de capital, incorporation, autre), organe, résolution, extrait, pièce et page, montant signé. En 1.1.0, ligne remplacée par une décision ultérieure. |
| **PV cité** | Lecture humaine (une par décision) à une page de PV ou d’acte. Citation ajoutée au texte des notes. | Référence du registre (pièce, page) puis lecture validée, horodatée par le serveur. Citations structurées (`NoteCitation`) résolues côté serveur. |
| **Comptabilisation** | Colonne « décision » du GL. Écritures sans décision (« orphelines »). Transferts équilibrés. | Référence de ligne et nature compatible (dix natures). Transferts équilibrés. Écriture sans décision, décision introuvable ou incohérente. |
| **Paiement** | Règlements rattachés, affichés à part, sans comparaison. | Avant C09 : idem. En 1.1.0 : paiement de la décision en vigueur, à la clôture et à la revue (voté, payé, reste). |
| **Contrôles** | Quatre contrôles, huit statuts de décision. | Cinq contrôles avec numérateur, dénominateur et exclusions motivées ; neuf statuts en 1.1.0. |
| **Tableau de variation** | Σ tableau − Σ GL par composante. | Cellule par cellule : fourni ↔ reconstitué. |
| **Juridique** | Aucune règle, ratios arithmétiques. | Avant C09 : aucune règle. En 1.1.0 : repères légaux datés par forme sociale, sans conclusion. |
| **Autres fonds propres** | Non traités. | Avant C09 : exclus avec motif. En 1.1.0 : présentation selon ANC 2024-07 ou le texte antérieur, par instrument déclaré et cité. |
| **Revue** | Notes bloquantes ; revue par une autre identité ou relecture personnelle nommée ; verrou. | Idem ; notes générées en une seule version. |
| **Révisions et péremption** | `revise` vide le travail ; `EQUITY_REVISION_REPLACED` ; source remplacée → révision requise. | `revise` ; `EQ_SOURCE_REPLACED_REVISION_REQUIRED` ; en 1.1.0, `EQ_RULE_REPLACED_REVISION_REQUIRED`. |
| **Exports** | HTML, PDF, JSON et CSV (paquet `equity-package-1`, jeu de règles `equity.review-1`), diagnostic ou approuvé. Route de démonstration synthétique. | HTML, PDF, JSON et CSV (`equity-mission-1.0.0`), diagnostic ou approuvé. Téléchargement des originaux. En 1.1.0 : cadre, présentation et repères dans l’export. |
| **Écrans** | `/equity` et `/equity/synthesis`, onglets, page de preuve PDF. | `/capitaux-propres` et `/capitaux-propres/synthese` : tableau de variation, frise, listes de rapprochement, panneau PV à la page citée. |
| **Tests** | 18 + 7 + 3 cas unitaires, 4 scénarios PostgreSQL (suite Clients). En e2e, seulement la démonstration de C01. | Environ 36 cas unitaires et 6 de composants, 5 e2e, intégration PostgreSQL. |
| **Documentation** | `docs/probant-lots/MISSION11_CONTRACT.md`, `MISSION11_PR.md`. | `docs/mission11/CONTRAT.md`, `RECETTE.md`. |

Deux pièges de lecture relevés :

- **Même nom, autres contrats.** Les deux résultats s’appelaient `equity-result-1`. L’adaptateur les distingue par la procédure de la feuille, jamais par ce nom.
- **Moteur partagé.** La procédure `/capitaux-propres` appelle le moteur partagé `reviewEquity` avec le contexte `equity.review`. C’est le même moteur arithmétique, pas une seconde procédure.

## 2. Choix motivé

L’ordre des livraisons n’est pas un critère. La feuille `/capitaux-propres` devient le **parcours cible des travaux nouveaux** pour cinq raisons :

1. **La vue commune demandée.** Elle exige décision, effet par composante, comptabilisation, paiement et PV cité. Seule `/capitaux-propres` transcrit l’organe, le type, la résolution et la pièce par décision. `/equity` ne qualifie pas le type, si bien qu’un dividende n’y est pas distinguable d’une autre baisse.
2. **Plusieurs PV.** Un exercice compte souvent une AGO et une ou plusieurs AGE. `/capitaux-propres` garde une tête par pièce, `/equity` une tête par type de document.
3. **L’indépendance du stockage.** Les tables `eq_*` sont dédiées et en ajout seul. `/equity` partage les tables de la chaîne Clients et étend leur contrainte de types.
4. **Le contrat de résultat.** Il est validé avec ses invariants (pont, transferts nuls, comparaison après lecture) au lieu d’un simple contrôle de version.
5. **Le cadre du modèle de bilan.** Les rubriques de l’art. 821-1 sont celles qu’ANC 2024-07 complète par la rubrique « Autres fonds propres » ; la présentation dettes / autres fonds propres s’y rattache directement.

`/equity` garde des points forts qui ne sont pas perdus. Ils restent dans `/equity`, lisible et poursuivable, et leur portage est la phase 2 :

- la couverture déclarée du GL et du registre ;
- l’inventaire complet déclaré des composantes ;
- l’exclusion de composante appuyée par une pièce ;
- la démonstration synthétique publique ;
- la page de preuve PDF.

## 3. Transition

| Phase | Contenu | État |
|---|---|---|
| 1 — C09 | Entrée unique `/capitaux-propres/parcours` : adaptateur en lecture seule, dédoublonnage par PV, liens vers chaque feuille à sa version exacte avec le contexte du dossier. Règle 1.1.0 pour `/capitaux-propres`. `/equity` inchangé (1.0.0). Aucune migration, aucune revue réécrite. | **Livrée** |
| 2 | Porter dans `/capitaux-propres` la couverture déclarée et l’inventaire des composantes de `/equity`. Ajouter une correspondance manuelle citée et versionnée entre feuilles, pour lever les décisions « à rapprocher ». | Proposée |
| 3 | Ne plus créer de feuille `/equity` ; `/equity` reste lisible. Reprise éventuelle par création de feuilles `/capitaux-propres` en révision, selon la correspondance ci-dessous. | Optionnelle, non engagée |

Correspondance documentée pour une reprise éventuelle (phase 3). Les identifiants et versions d’origine restent dans `clients_*` et sont cités, sans écrasement :

| `/equity` | `/capitaux-propres` | Ce qui reste humain |
|---|---|---|
| `equity_balances` (compte, composante déclarée, `opening`/`closing`) | `eq_balances` (compte, rubrique 821-1) | Rubrique d’une famille large : « réserves » se répartit entre quatre rubriques. |
| `equity_ledger` (`decision`/`other`, décision, transfert) | `eq_entries` (nature, décision, transfert, date d’effet) | Nature du mouvement. |
| `equity_variation` (par compte) | `eq_variation` (composante × colonne) | Agrégation par colonne. |
| `equity_decisions` (montant positif, sens) | `eq_decisions` (type, montant signé, organe, PV, page, résolution) | Type, organe, résolution. |
| `equity_payments` | `eq_payments` | — |
| `equity_minutes`, `equity_acts` | `eq_minutes` (une pièce par PV ou acte) | Référence de pièce. |
| Feuille, version, empreinte, revue | Nouvelle feuille en révision, citant `equity.review` / identifiant / version / empreinte d’origine | Revue de la nouvelle feuille. |

Une migration de schéma n’est pas nécessaire pour la phase 1 : la règle 1.1.0 ne change que des champs JSON (mapping, travail, résultat), et les versions 1.0.0 restent lues telles qu’enregistrées.
