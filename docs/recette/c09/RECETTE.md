# Recette C09 — parcours Capitaux propres unique et règle 1.1.0

Date : 14 octobre 2026. Dossier synthétique : `lib/workpapers/__tests__/capitaux-c09-fixtures.ts`. Aucune entité réelle.

Tous les attendus ci-dessous sont **calculés à la main** à partir du dossier, avant toute lecture des résultats du moteur. Les tests (`capitaux-c09.test.ts`, `capitaux-presentation.test.ts`, `capitaux-legal.test.ts`, `capitaux-parcours-http.test.ts`, `e2e/c09-capitaux-parcours.spec.ts`) comparent le moteur et l’écran à ces nombres.

Les montants sont en euros, dans le sens des capitaux propres (crédit positif).

## Dossier

- **Société** : SAS, forme déclarée sans pièce.
- **Exercice** : du 01/01/2026 au 31/12/2026, revue au 31/03/2027. ANC 2024-07 s’applique de plein droit.
- **Sources** : les mêmes PV (mêmes octets) sont importés dans `/capitaux-propres` et dans `/equity`.

| Composante (compte) | Ouverture | Mouvements | Clôture |
|---|---|---|---|
| Capital (101000) | 1 000,00 | +200,00 (D-CAP) | 1 200,00 |
| Réserve légale (106100) | 40,00 | +14,00 (affectation) | 54,00 |
| Autres réserves (106800) | 200,00 | +146,00 − 50,00 + 20,00 | 316,00 |
| Report à nouveau (110000) | −20,00 | +20,00 | 0,00 |
| Résultat (120000) | 300,00 | −180,00 − 120,00 + 60,00 | 60,00 |
| **Capitaux propres** | **1 520,00** | **+110,00** | **1 630,00** |
| Autres fonds propres : 167110 (titres participatifs) | 500,00 | — | 500,00 |
| Autres fonds propres : 167300 (avance publique) | 80,00 | — | 80,00 |

Registre des décisions :

| Ligne | Décision, résolution | Type | Composante | Voté | PV, page |
|---|---|---|---|---|---|
| D-AFF-RES / -RL / -RAN / -AR | AGO-2026, rés. 2 | Affectation | Résultat / RL / RAN / AR | −180 / +14 / +20 / +146 | PV-AGO-2026, p. 2 |
| D-DIV | AGO-2026, rés. 3 | Distribution | Résultat | −120 | PV-AGO-2026, p. 3 |
| D-EXC-1 | AGO-2026, rés. 4 | Distribution | AR | −50 | PV-AGO-2026, p. 3 |
| D-EXC-2 (remplace D-EXC-1) | AGE-2026-07, rés. 1 (10/07/2026) | Distribution | AR | −30 | PV-AGE-2026-07, p. 1 |
| D-CAP | AGE-2026-11, rés. 1 | Augmentation de capital | Capital | +200 | PV-AGE-2026-11, **absent** |

Règlements :

- P01 : 30,00, le 20/07/2026, pour D-EXC-2 ;
- P02 : 200,00, le 20/11/2026, pour D-CAP ;
- **aucun** règlement pour D-DIV.

## Cas du prompt

### Affectation sans mouvement global

T1 = −180 + 14 + 20 + 146 = **0**. Chaque ligne d’affectation concorde (écart 0). La décision vaut max(crédits 180, débits 180) = **180**.

Effet voté par famille sur les décisions comptées du parcours unique :

- Résultat : −180 − 120 = **−300** ;
- Réserves : +14 + 146 − 30 + 10 = **+140** ;
- Report à nouveau : **+20**.

### Distribution votée non payée

D-DIV : 120 votés, 120 comptabilisés, 0 payé.

- Statut `unpaid` ;
- reste **120,00** à la clôture comme à la revue ;
- sans source de règlements : `unknown`, jamais 0.

### Pièce absente

D-CAP n’a pas de PV. Exception unique de la feuille : `PV_MISSING`. Statut `reading_required`, écart inconnu.

Le paiement de la décision, P02 = 200, est rapproché : `paid`, reste 0.

Dans le parcours unique, D-CAP (`/capitaux-propres`) et CAP (`/equity`) n’ont pas de PV commun et ont la même date d’effet (15/11/2026). Elles sont listées **à rapprocher, non comptées**.

### Même PV dans deux parcours

| Décision | Traces | Correspondance |
|---|---|---|
| Affectation, PV-AGO-2026 p. 2 | rés. 2 (4 lignes) et AFF (180) | Reliée, concordante (180 = 180, effet 20/05/2026) |
| Dividende, PV-AGO-2026 p. 3 | D-DIV et DIV (120) | Reliée, concordante. D-EXC-1, remplacée, ne forme pas de décision : la page n’est donc pas ambiguë. |
| Distribution rectifiée, PV-AGE-2026-07 p. 1 | D-EXC-2 et EXC (30) | Reliée, concordante |
| NO-PV (`/equity` seul, +10, effet 01/09/2026) | — | Une feuille ; aucune décision de l’autre feuille au 01/09/2026 |

Totaux du parcours unique :

- **4** décisions comptées, dont **3** reliées, **1** à rapprocher, **9** traces ;
- par type : affectation 1 (180), distributions 2 (120 + 30 = **150**), non typées 1 (10) ;
- paiements : 2 décisions, voté **150**, payé à la revue **30**, reste **120**, **1** non payée ;
- hors décompte : 1 ligne remplacée.

### Décision amendée

D-EXC-1 a le statut `superseded` (remplacée par D-EXC-2) : sans écriture ni règlement propres, non comptée.

D-EXC-2 reprend la chaîne :

- comptabilisé = −50 + 20 = **−30** ; voté −30 ; écart **0** ;
- payé 30 au 20/07/2026 : `paid`, reste 0 à la clôture.

Contrôle « décisions » : 6 lignes rapprochées sur 7, D-CAP attendant son PV. D-EXC-1 est exclue avec son motif.

**Variante (même registre sans la colonne d’amendement).** D-EXC-1 concorde à −50. D-EXC-2 donne 20 comptabilisés − (−30) votés = **+50**, en `amount_divergent`. C’est l’« avant » corrigé.

### Classe d’instrument incertaine

- **TP-2019** (167110, 500) : élément de capitaux propres « non », remboursement imposable « inconnu ». Classé **à qualifier** : il manque l’art. 315-1.
- **AV-PUBLIQUE** (167300, 80) : avance publique, remboursement conditionné au succès, abandon en cas d’échec. Classée **avances conditionnées 80**.

Lignes du bilan :

- fonds non remboursables : non applicable, aucun instrument ;
- avances conditionnées : 80 ;
- droits du concédant : non applicable ;
- **total des autres fonds propres : inconnu** (1 élément à qualifier) ;
- capitaux propres : 1 630, sans les 580 du compte 167.

## Repères légaux (SAS, 2026)

| Repère | Calcul | Attendu |
|---|---|---|
| Réserve légale (L232-10, version du 01/10/2025, affectation du 20/05/2026) | Base = 300 − 20 = 280 ; 1/20 = 14 ; affectation votée 14 ≥ 14 | Aucun signal |
| Distribution (L232-11) | Distributions 120 + 30 = 150 ; capitaux propres 1 630 ; repère 1 200 + 54 = 1 254 (écarts de réévaluation non fournis, non inclus) | Aucun signal |
| Moitié du capital (L225-248 version 2023, L227-1 version 2025) | 1 630 / 1 200 | Aucun signal ; aucune alerte de dissolution, aucun délai |

Cas unitaires complémentaires (`capitaux-legal.test.ts`), SARL au capital de 1 000 avec 400 de capitaux propres :

- **Moitié du capital.** 400 × 2 < 1 000 : « à examiner » (L223-42, version 2023).
- **Réserve légale.** Base 100, 1/20 = 5, affectation votée 2, réserve 20 + 2 < 100 : « à examiner ».
- **Distribution.** 400 < 1 000 + 22 : « à examiner ».

## Avant / après

`AVANT-capitaux-1.0.0.json` : moteur `/capitaux-propres` de `main` `ff3f9fb` (règle 1.0.0) exécuté le 14/10/2026 sur ce dossier, dans un worktree temporaire, sans la colonne d’amendement que la règle 1.0.0 refuse.

| Point | 1.0.0 (`ff3f9fb`) | 1.1.0 |
|---|---|---|
| D-EXC-1 / D-EXC-2 | Deux décisions votées (−50 et −30) ; D-EXC-2 `amount_divergent` **+50** | Une décision en vigueur (−30), écart 0 ; D-EXC-1 remplacée et visible |
| D-DIV | Paiement « Aucun règlement rattaché » ; rien n’indique que 120 restent à payer | `unpaid`, reste 120 à la clôture et à la revue |
| Autres fonds propres | Exclus avec motif, non qualifiés | Présentation ANC 2024-07 par instrument ; TP-2019 à qualifier, total inconnu |
| Juridique | Texte « aucune règle juridique implémentée » | Repères datés L232-10, L232-11, L223-42 / L225-248 / L227-1, sans conclusion |
| Deux parcours | Deux écrans, sans lien : la même distribution apparaît dans chacun | Une entrée ; la même décision comptée une fois, liens vers chaque feuille à sa version exacte |
