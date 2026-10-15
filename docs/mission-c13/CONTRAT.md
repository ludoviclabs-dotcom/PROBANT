# C13 — Emprunts : la chaîne réellement livrée

Date : 15 octobre 2026. Base : `main` `172ddd7` (PR #93 fusionnée). Branche locale : `claude/chaine-emprunts-manquante-2904e3`. Règle `loans.review` 1.0.0, registre des capacités 1.3.0. Outil personnel local ; aucune exploitation SaaS, aucun pilote.

## 1. Point de départ constaté

- `main` n'avait qu'une **carte historique** « Financement & Emprunts » (rapprochement générique échéancier ↔ grand livre 16, `lib/rapprochement/demo/dettes-financieres.ts`) et, dans le registre C01, un périmètre `dettes_financieres` hors journal, **sans moteur ni route** (« Pas de feuille persistante dédiée »). Aucune route `/dettes-financieres` ni `/emprunts`.
- Le **chantier local Mission 14** a été retrouvé hors du dépôt : `%USERPROFILE%\.codex\.chatgpt-projects\g-p-6a828022…\mission14`, branche `codex/mission14-loans`, base `5e49934` (09/10/2026), **jamais commité** (57 fichiers indexés, 1 097 lignes). Ni branche, ni stash, ni commit pendant de ce chantier dans le dépôt ; aucune session Claude ne l'a repris. Le worktree `Apprentissage/…/compta-pilot-emprunts-activation` relève d'un autre dépôt (hub d'apprentissage) et n'a pas été utilisé.
- Comparaison avec la base actuelle : 13 migrations, le profil d'exécution C07, la relecture personnelle nommée, le registre C01 et les feuilles C08–C11 sont arrivés depuis `5e49934`. La migration Mission 14 `0012_loans_simple` entrait en collision avec `0012_capitaux_propres` ; ses écrans étaient une maquette sombre autonome hors charte ; son verrou `PROBANT_LOAN_DURABLE` ignorait le profil personnel C07.

## 2. Ce qui est porté de Mission 14, ce qui change

| Mission 14 | C13 |
|---|---|
| `LoanRuntime` sur `ClientsRuntime`, `WorkpaperService`, store `clients_*`, sessions/CSRF, verrou transactionnel, reçus d'idempotence | **Conservé** (aucun store ni moteur parallèle). |
| Pont ouverture + tirages − remboursements, résidu par le rapprochement générique (`reconcileLoanBalances`) | **Conservé** ; résidu = GL de clôture − attendu, jamais une « dette omise ». |
| Intérêt simple en rationnels BigInt, segments aux avenants et mouvements, arrondi une fois | **Conservé** ; taux en millionièmes de point (6 décimales) au lieu de points de base entiers (l'index publié a trois décimales). |
| Six types de sources | **Huit** : + `loan_rates` (avis de révision : index, date de révision, date de fixation) et `loan_balance` (balance des comptes de dettes financières, cadrage du périmètre). |
| Taux indexé = une valeur d'index par version de contrat | **Remplacé** : index + marge + **dates de révision contractuelles** ; une valeur d'index n'est utilisée qu'à une date de révision du contrat et pour l'index du contrat ; une révision hors calendrier est signalée, jamais appliquée. |
| Conventions ACT/360, ACT/365F, 30E/360 | + **30/360** (règle « Bond basis » définie dans la méthode) ; toute autre convention → « autre » → calcul bloqué. |
| `instrument: simple / unsupported` | **Nature déclarée** (12 natures) ; emprunts bancaires et autres emprunts calculés ; les autres exclus et nommés ; instruments proches des fonds propres classés par le **moteur C09** existant. |
| Covenant : définition et seuil facultatifs | + **date de test** ; définition et seuil restent le texte du contrat ; aucun ratio calculé. |
| Population = contrats + toutes les lignes d'échéancier | **Échéances exigibles pendant l'exercice** (les futures restent dans l'import) ; la période est passée explicitement au gel et à sa reproduction. |
| Frais : lien `fee` exigé même à 0 ; principal exigé même pour une échéance d'intérêts seuls | **Corrigé** : un montant prévu nul et l'absence d'écriture → « sans objet », pas « inconnu ». |
| Échéance à cheval sur l'ouverture → bloquée | La part antérieure à l'ouverture reprend les **intérêts courus d'ouverture du GL** (attribuables à une seule échéance) ; la part de l'exercice est recalculée. |
| Faits sources copiés dans chaque version du résultat | **Retirés** (seuls les liens de preuve restent) : la limite de taille du store était atteinte après une quarantaine de versions ; les faits sont recalculés depuis les sources figées à la lecture et à l'export. |
| Route `/emprunts` + maquette autonome ; drapeau `PROBANT_LOAN_DURABLE=disposable` | Route `/emprunts` dans la charte des feuilles (cash.module.css), contexte dossier C01, profil C07 ; drapeau `PROBANT_LOANS_DURABLE` (`disposable` ou `personal`, refusé sur Vercel production). |
| Migration `0012_loans_simple` | **`0020_loans_review`**, additive (contrainte de types de sources), retour arrière refusé tant que des données Emprunts existent. |

## 3. Sources officielles lues (15/10/2026)

Les PDF de l'ANC ont été retéléchargés ; leurs empreintes SHA-256 sont **identiques** à celles du registre C04.

| Texte | Fichier lu | Articles | Retenu |
|---|---|---|---|
| PCG au 01/01/2024 (exercices ouverts en 2024) | `f608f78f…` | 821-1 (p. 427, passif p. 429), 932-1 (compte 16, p. 511), 941-16 (p. 536-537) | Postes « Emprunts obligataires convertibles », « Autres emprunts obligataires », « Emprunts et dettes auprès des établissements de crédit », « Emprunts et dettes financières diverses (dont emprunts participatifs) » ; « Autres fonds propres » le cas échéant ; intérêts courus « regroupés dans une subdivision du compte 168 » (16884 pour les établissements de crédit) ; concours bancaires courants au compte 519. |
| Règlement ANC 2022-06 (exercices ouverts dès le 01/01/2025) | `aeaa05cf…` | 821-1 (p. 7, passif p. 10), 1121-1 (p. 40-43), 1211-16 (p. 70-71) | Intérêts courus « dans une subdivision du compte des emprunts ou des dettes auxquels les intérêts courus se rapportent » (1648, 16748, 16758, 1688). |
| PCG consolidé au 01/01/2026 (intègre ANC 2024-07) | `55c824b2…` | 821-1 (p. 96, passif p. 98), 1121-1 (p. 133-134), 1211-16 (p. 155-156) | « Total des autres fonds propres (II) » ; 164 « si non inscrits dans le compte 167 » ; 167 fonds non remboursables et avances conditionnées (1671, 1673, 1674) ; emprunts participatifs au compte 1682. |
| Règlement ANC 2026-03 (exercices ouverts dès 2027) | `59330e81…` | art. 1er à 3 | Ne modifie ni le compte 16 ni le passif de l'art. 821-1 (1121-1 modifié au seul compte 6454) : les exercices 2027 gardent les règles du PCG consolidé 2026. |
| Règlement ANC 2024-07 (distinction dettes / autres fonds propres) | `19288fed…` (lu en C09) | 314-1 à 316-1 | Appliqué **par le moteur C09** (`classifyInstrument`), réutilisé tel quel. |

Le texte applicable à un exercice est résolu par le résolveur partagé C04 (nouveau sujet `financial_debts`, sans règle de traitement dans le résolveur). La feuille ne déclare aucune anticipation : un exercice 2025 reste sous ANC 2022-06.

**Choix de méthode PROBANT (jamais attribués à une norme)** : correspondance d'une nature déclarée à l'intitulé d'un poste du modèle de bilan (le PCG ne fournit pas de table comptes → postes) ; formules des conventions de jours reconnues ; rattachement d'une échéance à la version du contrat en vigueur le dernier jour de son intervalle ; bornes « départ inclus, fin exclue » et mouvement de principal effectif à sa date ; arrondi au centime une fois par intervalle, demi-centime éloigné de zéro ; reprise des intérêts courus d'ouverture pour la part antérieure à l'exercice.

## 4. Sources du pack et champs

CSV UTF-8 `Key;Amount;Date;Details` (ou XLSX à feuille explicite), mapping fermé `loans-review-1` (EUR, point décimal, dates ISO) ; `Details` est un objet JSON strict par type, avec la pièce citée (`title`, `pack`, `date`, `page`, `clause`, `excerpt`). Aucun PDF n'est lu automatiquement : la transcription vient de la pièce originale lue par une personne ; la ligne est vérifiée, pas l'exactitude de la transcription.

| Type | Montant / date | Champs |
|---|---|---|
| `loan_contracts` | nominal / date d'effet de la version | contrat, version, nature, prêteur, comptes du principal et des intérêts courus, devise, début, échéance finale, dates d'effet, convention de jours, taux `fixed` (taux en %) ou `variable` (index, marge, dates de révision, plancher/plafond déclaré), traitement des frais, exhaustivité des mouvements et de l'échéancier, dernière borne de règlement des intérêts, convention de bornes, termes contractuels C09 (instruments proches des fonds propres) |
| `loan_schedule` | principal de l'échéance (0.00 si intérêts seuls) / exigibilité | intervalle d'intérêts, version du contrat, intérêts et frais de l'échéancier, type (`scheduled` / `early` + explication) |
| `loan_ledger` | montant / date d'écriture | compte, base (`opening_principal`, `closing_principal`, `draw`, `principal_repayment`, `interest`, `opening_accrued_interest`, `accrued_interest`, `fee`), échéance reliée |
| `loan_payments` | montant / date | base `principal` / `interest` / `fee`, échéance reliée |
| `loan_confirmations` | capital restant dû / date du solde | (date de la pièce dans `source.date`) |
| `loan_clauses` | 0.00 (sans objet) | garantie ou covenant, lecture (`unread`, `read`, `qualified` + lecteur et qualification), **définition contractuelle**, **seuil (texte du contrat)**, **date de test** |
| `loan_rates` | 0.00 (sans objet) / date de révision | index, valeur publiée, date de fixation |
| `loan_balance` | solde créditeur / clôture | compte (= clé), libellé |

Un champ prévu mais inconnu vaut `null` ; aucune valeur métier par défaut.

## 5. Population, calculs et états

- **Unité** `loan_contract_due` : un contrat (toutes ses versions, ou les lignes citant une référence sans contrat) ou une échéance exigible pendant l'exercice. Les montants de la population ne s'additionnent jamais. Gel exhaustif de toutes les sources approuvées courantes (une version par type) ; sélection = population.
- **Pont de principal** : ouverture GL + tirages − remboursements de l'exercice = attendu ; résidu = GL de clôture − attendu (rapprochement générique). Exhaustivité des mouvements non documentée → inconnu.
- **Échéances** : principal, intérêts et frais comparés séparément entre échéancier, GL et paiements ; date d'écriture ou de paiement différente → à expliquer ; mouvement sans échéance de l'exercice → non concluant ; échéance rattachée à une version remplacée → « échéancier modifié » à expliquer.
- **Intérêts** : principal × taux × jours / base, par segment (mouvements, avenants, révisions) ; version unique en vigueur ; taux fixe transcrit ou index de la révision contractuelle + marge ; aucun taux, aucune convention, aucune borne déduits.
- **Intérêts courus** : de la dernière borne de règlement documentée au lendemain de la clôture ; comparés au GL ; aucun attendu et aucune écriture → sans objet.
- **Confirmation** : confirmation − GL de clôture.
- **Présentation** : texte applicable, nature, poste, comptes attendus ; compte déclaré ou écrit incohérent → signal, aucun reclassement ; natures proches des fonds propres → moteur C09 ; présentées en autres fonds propres → exclues des emprunts sans rendre la feuille non concluante ; à qualifier, ou dettes complexes → exclues et la feuille reste non concluante.
- **Cadrage** : balance − GL des contrats du pack, par compte (principal et intérêts courus), sans compensation entre comptes. Écart → « mismatch de périmètre » non concluant ; balance absente → non concluant.
- **États** : un point « inconnu » (source ou paramètre manquant) n'est jamais un zéro ; « bloqué » (calcul impossible) ; « non concluant » ; « exclu et nommé » ; « à expliquer » (différence arithmétique documentée) ; « documenté » (concordant sur les seules sources fournies). Chaque point devient une note bloquante portant **son seul montant** (le résidu ne prête son montant à aucun autre point).

## 6. Parcours, architecture et autorité

Import (aperçu puis approbation explicite) → feuille → gel et calcul → points expliqués et cités → conclusion citée → soumission → relecture (identité distincte, ou **relecture personnelle nommée** du profil local C07) → verrouillage → export HTML/JSON de la version (index des sources figées, sans originaux ni signature). Source remplacée ou ajoutée après le gel → feuille périmée, révision sur les sources courantes ; l'ancienne version, son approbation et ses preuves restent lisibles.

`loans.review` est une procédure du registre C01 (cycle `dettes_financieres`, désormais dans le vocabulaire du journal, famille `clients`, route `/emprunts`) : le dossier de clôture (Mission 19) l'observe et peut y rattacher risques et anomalies ; la Synthèse et la page `/local` l'affichent. La page consomme le contexte dossier C01 (dossier, exercice, période). Le serveur décide de l'identité, des rôles et du type de relecture ; aucun rôle, auteur ni approbation n'est accepté du navigateur.

Exemple en lecture seule : `/emprunts?demo=1` (`case=simple`, `long`, `empty`), calculé côté serveur par le même moteur, fermé en production.

## 7. Exclus et nommés

Emprunts obligataires (primes 169), obligations convertibles ou remboursables en actions, prêts participatifs, titres participatifs, avances conditionnées et comptes courants d'associés (hors calcul ; classement C09), concours bancaires courants (compte 519, Trésorerie), crédit-bail, devises, frais capitalisés ou intégrés au taux (aucun taux effectif), planchers / plafonds d'index, dérivés de couverture, indemnités de remboursement anticipé au-delà des frais transcrits, ventilation à plus / moins d'un an de l'annexe, anticipation d'un texte par la feuille. **Aucun DCF, aucun LBO, aucune conformité de financement globale, aucun calcul de ratio de covenant.**

## 8. Recette — attendus fixés avant exécution

Calculés indépendamment du moteur par `docs/recette/c13/attendus.py` (fractions exactes). Exercice 2026, revue au 15/02/2027.

| Cas | Attendu |
|---|---|
| Recette simple (prompt C13) | 100 000 − 10 000 = **90 000** ; 3 % pendant 30 jours en 30/360 sur 100 000 = **250,00** ; puis 225,00 par mois ; intérêts courus 225,00 ; aucune différence. Contre-épreuves : ACT/360 → 258,33 ; 30E/360 sur 01/01→31/01 → 241,67. |
| Taux absent (variable) | T1 1 600,00 ; T2 1 626,63 ; T3 1 626,61 ; Euribor du 01/10/2026 absent → intérêts courus **bloqués** ; pont 185 000. Taux fixe ou convention non transcrits → bloqué. |
| Échéancier modifié / avenant (Atlas, recette Mission 14) | 2,00 % puis 2,50 % au 01/07/2026 : 2 555,56 (ouverture), 2 450,00, 2 426,67, 3 002,78 ; courus 2 938,89 ; 500 000 − 40 000 = 460 000, GL 470 000 → **résidu +10 000 à expliquer** ; confirmation − GL −10 000. Échéance rattachée à la version 1 après l'avenant → signalée ; source d'échéancier remplacée → feuille périmée, révision. |
| Frais séparés | Intérêt S1 1 428,16 (frais exclus) ; GL qui fusionne 1 548,16 → intérêts GL − recalculés **+120,00** et frais GL à relier ; paiements séparés concordants. |
| Remboursé dans l'exercice | 1 500,00 (ouverture) puis 1 000,00 au remboursement anticipé ; clôture 0 confirmée ; contrat conservé dans la population. |
| Mismatch de périmètre | Balance 168100 = 95 000, GL des contrats du pack = 80 000 → **15 000 non couverts** ; référence REF-INCONNUE sans contrat : pont non concluant ; 164800 = 6 013,75 concordant. |
| Autres fonds propres | Avance publique, remboursement conditionné au succès, abandon en cas d'échec → avances conditionnées (art. 316-1), exclue des emprunts. |

## 9. Limites restantes

Packs transcrits à la main ; aucune lecture native des contrats PDF. La feuille ne recalcule pas l'échéancier lui-même (capital restant dû) : elle compare. Une convention non additive (30/360) découpée aux mouvements peut différer d'un décompte sur l'intervalle entier : l'écart reste à expliquer. Un intérêt réglé d'avance, une échéance couvrant deux exercices au-delà de la part d'ouverture et plusieurs devises ne sont pas couverts. Données exclusivement synthétiques : une suite verte n'autorise aucune mission réelle.
