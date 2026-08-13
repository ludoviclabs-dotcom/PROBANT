# PROBANT — Couverture du plan de connaissance

> Deux couches complémentaires, produites par deux lots distincts :
>
> | Couche | Lot | Code | Données |
> |---|---|---|---|
> | **Gouvernance des sources** — registre, hiérarchie d'autorité, versions | PR [#31](https://github.com/ludoviclabs-dotcom/PROBANT/pull/31) | `lib/knowledge/{registry,schemas,validation,crosswalk,types}.ts` | `data/sources/knowledge-registry.json`, `data/source-versions/`, `data/crosswalks/knowledge-crosswalks.json`, `data/statistics/external-statistics.json` |
> | **Contenus normatifs** — FEC, NEP, IFRS, PCG, crosswalks, statistiques | PR [#37](https://github.com/ludoviclabs-dotcom/PROBANT/pull/37) | `lib/knowledge/content/` | `data/{fec,nep,ifrs,pcg}/`, `data/crosswalks/*.yml`, `data/statistics/external.yml` |
>
> Les deux sections ci-dessous sont conservées telles quelles, chacune datée.
> Convergence notable : les deux couches, produites indépendamment, aboutissent
> aux mêmes réserves sur ANC 2026-03/2026-04 (homologation non établie) et sur
> IFRS 19 (adoption UE en attente). TODO (PR-04) : unifier les identifiants de
> sources entre le registre JSON et les contenus YAML.

---

# Couche 1 — Gouvernance des sources (13/08/2026)


Generated on 2026-08-13 for the knowledge-governance layer. This report does not
claim that the current local changes have been deployed.

## Coverage

| Area | Status | Evidence |
| --- | --- | --- |
| FEC 18 fields and BOFiP doctrine | PASS | Article A47 A-1 LPF and BOFiP versions are registered; existing `data/fec/fields.json` remains the control catalogue |
| NEP 230/300/315/320/330/450/500/501/530/700 | PASS | H2A index and homologation metadata are registered; NEP remain the primary French audit reference |
| PCG ANC 2014-03 consolidated 2026 | PASS | Consolidated version, publication metadata and verification are registered |
| ANC 2026-03 and 2026-04 | REVIEW_REQUIRED | Official ANC publications are registered as `pending_endorsement`; no effective date is inferred |
| IFRS Required 2026, IFRS 18 and IFRS 19 | PASS_WITH_LIMITATIONS | IASB and EU adoption states are separated; IFRS 19 EU endorsement remains pending |
| IFRS Accounting Taxonomy | PASS | The 2025 taxonomy is registered as the current taxonomy for 2026, with source verification |
| ACPR IFRS/ISA and CNCC IFRS | PASS | Professional guidance is distinguished from enforceable French standards |
| EY/PwC analyses | PASS | Registered only as secondary analysis and prohibited as the source of mandatory requirements |
| Crosswalks | REVIEW_REQUIRED | NEP/ISA entries are correspondence-only; detailed paragraph mappings require human review |
| External statistics | PASS | Every statistic has a period, unit, source version and verification status |
| 35 audit cycles | PASS | Existing `data/cycles/*.yml`, validated by tests |

## Sources

The executable source registry is `lib/knowledge/registry.ts`.
Validation rules live in `lib/knowledge/validation.ts`.
The validator rejects duplicate identifiers, dangling source versions, inconsistent
paragraph references, mandatory rules derived from secondary sources, incomplete
IFRS adoption metadata, unqualified supersession overlaps, unsourced mandatory
numeric rules, incomplete statistics and IFRS-like bulk text.

All unresolved verification points are enumerated in `docs/knowledge/REVIEW_REQUIRED.md`.

---

# Couche 2 — Contenus normatifs (14/08/2026)


> **PR-01** · Date de constat : **14/08/2026** · Base : commit `c4b1d44` (PR-00)
> Chiffres calculés en chargeant les données, pas estimés.
> Contrôles d'intégrité : `lib/knowledge/validation.ts` (K-001 → K-008).

---

## 1. Ce que ce lot a réellement établi

Le plan de connaissance existe désormais comme **structure validée** : six
référentiels, un schéma Zod par référentiel, un chargeur qui refuse un YAML
non conforme, huit contrôles d'intégrité exécutés par la CI.

Le **contenu normatif**, lui, est vérifié de façon très inégale. Ce rapport
existe pour que cette inégalité soit visible plutôt que masquée par un volume
de données rassurant.

| Référentiel | Enregistrements | `verified` | `review_required` |
|---|---:|---:|---:|
| FEC — zones (`data/fec/fields.yml`) | 18 | **18** | 0 |
| FEC — contrôles (`data/fec/controls.yml`) | 24 | 8 | 16 |
| NEP (`data/nep/nep.yml`) | 19 | 1 | 18 |
| IAS/IFRS (`data/ifrs/standards.yml`) | 21 | 2 | 19 |
| PCG (`data/pcg/requirements.yml`) | 3 | 1 | 2 |
| Statistiques (`data/statistics/external.yml`) | 0 | 0 | 0 |
| Crosswalks (6 fichiers) | 298 | 14 | 284 |

**Lecture honnête de ce tableau** : un seul bloc est solide de bout en bout —
le FEC. Tout le reste est une ossature correcte remplie d'informations qui
attendent une revue métier.

---

## 2. FEC — le bloc effectivement vérifié

Source primaire : article **A47 A-1 du Livre des procédures fiscales**,
consulté sur Légifrance le 14/08/2026.

**Établi par la consultation :**

- les **18 zones**, leur ordre et leur nom exact en ligne d'en-tête ;
- le format de date **AAAAMMJJ sans séparateur** ;
- la substitution des zones **12 et 13** par `Montant` et `Sens` lorsque le
  débit et le crédit ne figurent pas dans le système informatisé ;
- la convention de nommage **SirenFECAAAAMMJJ**, où AAAAMMJJ est la date de
  clôture de l'exercice ;
- la zone 3 est un « numéro sur une **séquence continue** ».

**Non établi** : la tolérance au vide zone par zone. Les 18 zones portent donc
`allowedBlankStatus: review_required`, distinct du statut du champ lui-même.
Séparer les deux évite de dégrader un fait vérifié à cause d'un attribut qui ne
l'est pas.

**Conséquence directe et vérifiée** : les 18 zones de `data/fec/fields.yml`
sont **identiques, dans le même ordre**, à `FEC_COLUMNS` de
`lib/canonical-model/fec.ts`. Le modèle d'exécution qui tourne depuis le début
est conforme au texte. Un test le vérifie désormais en continu
(`lib/knowledge/__tests__/fec-coherence.test.ts`).

### Contrôles atomiques : 24 contrôles, 12 familles

| Famille | Contrôles | dont `hard_law` |
|---|---:|---:|
| presence · ordre · type · date · montant · sequence · equilibre · compte · piece · periode · devise · lettrage | 24 | **8** |

Seuls **8 contrôles sur 24** sont fondés sur un texte. Les 16 autres sont des
heuristiques internes assumées comme telles. Ce n'est pas un défaut de
couverture : l'article A47 A-1 décrit un **format de fichier**, pas les règles
de tenue d'une comptabilité. L'équilibre débit/crédit ou le rattachement au
plan de comptes existent bien — ailleurs, dans le PCG, qui reste à rattacher.

---

## 3. Écart majeur détecté : trois règles du moteur classées « droit dur »

Le crosswalk `finding_control` a mis au jour un écart que la cartographie
PR-00 n'avait pas vu.

| Règle | Titre | Famille déclarée | Fondement établi dans A47 A-1 |
|---|---|---|---|
| `R-HL-006` | Conformité des numéros de compte (PCG) | `hardLaw` | **non** |
| `R-HL-007` | Ordre chronologique de validation | `hardLaw` | **non** |
| `R-HL-008` | Équilibre débit / crédit par écriture | `hardLaw` | **non** |

Ces trois règles produisent des constats présentés à l'auditeur comme
**opposables**. Leur fondement n'a pas été retrouvé dans l'article que le
moteur cite. Elles sont vraisemblablement fondées — mais dans le PCG, et le
rattachement n'existe nulle part dans le code.

**Ce lot ne modifie pas le moteur** : changer la famille d'une règle changerait
les constats produits, donc les résultats métier. L'écart est documenté ici et
dans `REVIEW_REQUIRED.md` (R-01 à R-03), à trancher en revue métier puis à
corriger dans un lot dédié.

---

## 4. IAS/IFRS — 21 normes, deux faits vérifiés

Source primaire : **EFRAG, « The EU Endorsement Status Report », 17 juillet
2026** — le rapport qui énumère les documents IASB/IFRIC *non encore adoptés*
par l'Union européenne.

**Vérifié :**

- **IFRS 19** figure dans la liste des documents **non adoptés** au 17/07/2026
  (adoption attendue T3/T4 2026, effet IASB 01/01/2027). Elle ne doit en aucun
  cas être présentée comme adoptée.
- **IFRS 18** est absente de cette liste : son processus d'adoption est achevé.
  Date d'effet IASB **01/01/2027** — donc **pas encore applicable** à la date de
  ce rapport.
- Un **amendement à IAS 21** (conversion en monnaie de présentation
  hyperinflationniste, publié le 13/11/2025) est non adopté, adoption attendue
  T4 2026. Le statut « adopté » d'IAS 21 porte sur la norme, pas sur cet
  amendement — la fiche le précise.
- **IFRS 20** (Regulatory Assets and Regulatory Liabilities, publiée le
  27/05/2026, effet 01/01/2029) est non adoptée. Hors des 21 normes demandées ;
  signalée ici car elle est postérieure à la connaissance générale du modèle.

**Méthode de statut d'adoption.** `endorsed` n'est jamais affirmé de mémoire.
Pour 20 normes, il repose sur une déduction **explicitée dans le champ `basis`**
— absence de la liste EFRAG des documents non adoptés — que le lecteur peut
contester. Pour IFRS 19, `not_endorsed` est une lecture directe.

**Non vérifié — 19 normes sur 21 :** leur **date d'entrée en vigueur IASB** vaut
`null`. Le navigateur `ifrs.org` rend sa liste par script et n'a pas pu être lu.
Une date plausible aurait été indiscernable d'une date exacte ; `null` est
lisible.

**Volontairement vides pour les 21 normes** : `pcgDifferences`,
`dataRequirements`, `disclosureRequirements`. Affirmer qu'un traitement PCG
diverge d'un traitement IFRS engage la lecture des deux référentiels — aucune
n'a pu être faite à la source. Vingt différences plausibles auraient donné un
fichier d'apparence riche et de valeur négative.

---

## 5. NEP — cadre vérifié, intitulés à certifier

**Vérifié :** les NEP sont homologuées par arrêté et codifiées au Code de
commerce (partie arrêtés, articles **A821-62 et suivants**). La **NEP 230
« Documentation de l'audit des comptes »** est homologuée par arrêté du
27/07/2023 (JO du 04/08/2023), modifiée par arrêté du 28/12/2023, et constitue
l'adaptation d'**ISA 230**.

**Non vérifié :** les intitulés des **18 autres NEP**. Le portail CNCC rend sa
liste par script. Les libellés proviennent du registre interne
`data/sources/nep.yml`, antérieur à ce lot — ce sont des libellés de travail,
pas des intitulés officiels certifiés.

Les **neuf thèmes** demandés sont couverts. Le thème `rapport` ne l'est que par
**NEP 700**, absente du registre interne et non vérifiée : c'est la couverture
la plus fragile du référentiel.

**Crosswalk NEP ↔ ISA** : 19 liens, dont **1 seul vérifié** (NEP 230 ↔ ISA 230,
relation `partial` — une adaptation nationale n'est pas une équivalence). Les
18 autres reposent sur la concordance de numérotation, indice sérieux mais pas
preuve.

---

## 6. PCG — version consolidée et deux règlements 2026

**Vérifié :** version consolidée **PCG au 1er janvier 2026** (règlement ANC
2014-03 modifié), publiée par l'ANC. Et sur la page officielle des règlements :

- **ANC 2026-03**, adopté le 06/03/2026 — comptabilisation des produits des ventes ;
- **ANC 2026-04**, adopté le 06/05/2026 — comptabilisation de l'impôt sur les
  bénéfices ; entrée en vigueur le lendemain de la publication au JO,
  applicable aux exercices en cours à cette date.

**Explicitement écarté.** Un résumé de moteur de recherche attribuait à un
règlement « ANC 2024-07 » une ligne obligatoire « autres fonds propres »
applicable aux exercices ouverts à compter du 01/01/2026. **Ce règlement ne
figure pas** sur la page officielle des règlements de l'ANC consultée le
14/08/2026, qui liste pour 2024 le règlement 2024-02 (certificats d'économies
d'énergie). L'information n'a pas été reprise ; elle est consignée en attente
de vérification (`REVIEW_REQUIRED.md`, R-08).

**Non vérifié :** les dates d'homologation et d'entrée en vigueur de ANC 2026-03
et 2026-04. `effectiveFrom` vaut `null` plutôt qu'une date supposée. Pour
2026-04, la *règle* d'entrée en vigueur est connue mais la *date* de publication
au JO ne l'est pas — la règle ne suffit donc pas à calculer la date.

---

## 7. Statistiques externes — zéro entrée, par choix

`data/statistics/external.yml` ne contient **aucune** statistique. Aucune n'a pu
être vérifiée avec les trois attributs qu'exige le schéma : date de mesure,
unité, périmètre.

L'invariant « une statistique ne contribue jamais au score d'un dossier » est
rendu **mécanique**, pas seulement déclaratif :

- chaque entrée porte `contributesToScore: false`, littéral imposé par Zod ;
- le contrôle **K-008** vérifie qu'aucun crosswalk ne référence un identifiant
  `stat-*` — donc qu'aucune statistique ne peut atteindre un contrôle, un
  constat ou un cycle par le graphe ;
- le référentiel a son répertoire, son schéma et son chargeur ; ni
  `lib/risk-mapping` ni `lib/rules-engine` ne le chargent.

Un fichier vide est un résultat. Une statistique fausse dans un outil d'audit
est pire que pas de statistique.

---

## 8. Non-régression des 35 cycles

| Contrôle | Résultat |
|---|---|
| `loadAllCycles()` retourne 35 cycles | ✅ |
| `validateAll()` (Audit Normatif 360) sans erreur | ✅ |
| Tests préexistants (115) | ✅ inchangés |
| Fichiers `data/cycles/*.yml` modifiés | **0** |
| Fichiers `lib/audit-cycles/` modifiés | **0** |
| Fichiers `lib/rules-engine/` modifiés | **0** |

Tout cycle référencé depuis le plan de connaissance (`affectedCycles`,
`relatedCycles`) est vérifié comme existant — un test échoue sur un slug
fantôme.

Les 35 fiches portent déjà un bloc `ifrsVsPcg`. Ce lot ne le modifie ni ne le
contredit : il reste sous le régime « revue requise » de la base Audit Normatif
360. Consolider les deux sources relève de **PR-04**.

---

## 9. Contrôles d'intégrité

| # | Ce qu'il refuse | Test de déclenchement |
|---|---|---|
| K-001 | Un contrôle opposable sans source primaire | ✅ |
| K-002 | Une source de doctrine (EY, PwC, Deloitte…) présentée comme primaire | ✅ |
| K-003 | Une norme IFRS future présentée comme applicable | ✅ |
| K-004 | Une adoption UE affirmée positive sans base ni date | ✅ |
| K-005 | Une différence PCG/IFRS sans source | ✅ |
| K-006 | Une statistique sans date, unité ou périmètre | ✅ |
| K-007 | Une citation IFRS au-delà de 200 caractères | ✅ |
| K-008 | Une statistique atteignable depuis un crosswalk | ✅ |

Chaque contrôle est testé **deux fois** : il passe sur les données réelles, et
il **échoue sur une violation fabriquée**. Seul le second test prouve quelque
chose — un garde-fou qu'on n'a jamais vu se déclencher n'est qu'une fonction
qui retourne un tableau vide.

`referenceDate` est toujours injectée : sans cela, K-003 deviendrait rouge tout
seul le 01/01/2027, quand IFRS 18 entrera en vigueur.

---

## 10. Où porter l'effort ensuite

Par rapport valeur / coût de vérification :

1. **Certifier les 18 intitulés de NEP** et l'existence de NEP 700 — une séance
   sur le recueil officiel suffit, et débloque tout le référentiel NEP.
2. **Trancher les trois écarts de fondement** `R-HL-006/007/008` — c'est le seul
   point qui touche des constats déjà présentés comme opposables aujourd'hui.
3. **Renseigner les 19 dates d'effet IASB** depuis le recueil officiel.
4. **Les différences PCG/IFRS** — le plus coûteux, à cadrer cycle par cycle
   plutôt que norme par norme (PR-04).
