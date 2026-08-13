# PROBANT — Points en attente de revue métier

> Deux couches, deux listes — toutes deux actives. La couche « gouvernance »
> (PR #31) recense les éléments non promus en règle applicable ; la couche
> « contenus » (PR #37) recense 17 points appelant une décision d'expert audit.
> Les recoupements sont signalés dans le texte (ANC 2026-03/04, IFRS 19,
> crosswalks NEP↔ISA).

---

# Couche 1 — Gouvernance des sources (13/08/2026)


Liste exhaustive au 13 aout 2026 des elements conserves sans promotion en regle
applicable.

| Identifiant | Champs ou relation | Motif | Statut |
| --- | --- | --- | --- |
| `anc-2026-03:adopted-2026-03-06` | `homologationDate`, `effectiveFrom` | La page ANC emploie un libelle « Journal Officiel », mais le PDF consulte porte encore « En cours d'homologation ». Aucune date d'effet n'est inferee. | `pending_endorsement` |
| `anc-2026-04:adopted-2026-05-04` | `homologationDate`, `effectiveFrom` | Le PDF ANC porte encore « En cours d'homologation ». | `pending_endorsement` |
| `ifrs-required-2026:required-2026` | adoption UE norme par norme | Le volume Required 2026 etablit le statut IASB, pas l'adoption UE individuelle de chaque texte. | `review_required` |
| `ifrs-19:issued-2024-05-09` | `euEndorsementDate`, `euEffectiveFrom` | Le rapport EFRAG mis a jour le 23 juillet 2026 indique une adoption attendue au T3/T4 2026. | `pending` |
| Crosswalks `nep-*-isa-*` | equivalence de contenu paragraphe par paragraphe | L'ACPR confirme seulement le role de correspondance et la primaute des NEP; les equivalences detaillees restent a valider. | `review_required` |
| `pcg-ifrs-revenue` | correspondances ANC 2026-03 / IFRS 15 | Crosswalk de haut niveau; homologation ANC et differences par paragraphe a confirmer. | `review_required` |
| `pcg-ifrs-tax` | correspondances ANC 2026-04 / IAS 12 | Crosswalk de haut niveau; homologation ANC et differences par paragraphe a confirmer. | `review_required` |

## Sources officielles controlees

- ANC, PCG 2014-03 consolide au 1er janvier 2026 :
  <https://www.anc.gouv.fr/plan-comptable-general-0>
- ANC, reglements 2026-03 et 2026-04 :
  <https://www.anc.gouv.fr/normes-comptables-francaises/reglements-de-lanc>
- Legifrance, article A.47 A-1 :
  <https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000027804775/>
- BOFiP FEC, BOI-CF-IOR-60-40-20 :
  <https://bofip.impots.gouv.fr/bofip/9028-PGP.html/identifiant%3DBOI-CF-IOR-60-40-20-20170607>
- H2A, referentiel normatif :
  <https://h2a-france.org/referentiel-normatif-et-code-de-deontologie/acceder-au-referentiel-normatif/>
- IFRS Foundation, Required 2026 et taxonomie courante 2026 :
  <https://www.ifrs.org/news-and-events/news/2026/01/now-available-ifrs-accounting-standards-required-2026-two-editions/>
  et <https://www.ifrs.org/news-and-events/news/2026/02/ifrs-accounting-taxonomy-2025-to-remain-current-for-2026/>
- EFRAG, statut d'adoption UE :
  <https://www.efrag.org/en/financial-reporting/endorsement-status>
- EUR-Lex, adoption d'IFRS 18 :
  <https://eur-lex.europa.eu/eli/reg/2026/338/oj/fra>
- ACPR, IFRS et ISA :
  <https://acpr.banque-france.fr/fr/lacpr/lacpr-en-europe-linternational/cadre-comptable/standards-internationaux-cadre-comptable>
- CNCC, referentiel IFRS : <https://doc.cncc.fr/docs/referentiel-ifrs>

EY et PwC sont enregistres uniquement comme analyses secondaires. Leur presence
ne permet jamais de faire passer une exigence a `mandatory`.

## Index exhaustif controle par les tests

Versions ou statuts d'adoption a revoir :

- `anc-2026-03:adopted-2026-03-06`
- `anc-2026-04:adopted-2026-05-04`
- `ifrs-required-2026:required-2026`
- `ifrs-19:issued-2024-05-09`

Exigences bloquees en revue :

- `ifrs-19-eu-pending`
- `anc-2026-03-pending`
- `anc-2026-04-pending`

Crosswalks non promus en correspondances normatives :

- `nep-230-isa-230`
- `nep-300-isa-300`
- `nep-315-isa-315`
- `nep-320-isa-320`
- `nep-330-isa-330`
- `nep-450-isa-450`
- `nep-500-isa-500`
- `nep-530-isa-530`
- `nep-700-isa-700`
- `pcg-ifrs-revenue`
- `pcg-ifrs-tax`

---

# Couche 2 — Contenus normatifs (14/08/2026)


> **PR-01** · Constaté le **14/08/2026** · Base : commit `c4b1d44`
> Ce document appelle une **décision d'expert audit**. Rien de ce qui y figure
> ne doit être présenté à un utilisateur comme établi.
>
> Chaque point indique **ce qui a été tenté**, **ce qui manque** et **ce qu'il
> faut trancher**. Un point se ferme en modifiant la donnée puis en passant son
> `status` à `verified` — jamais en cochant une case ici.

---

## Priorité 1 — touche des constats déjà présentés comme opposables

### R-01 · `R-HL-006` « Conformité des numéros de compte (PCG) » est classée `hardLaw`

- **Où** : `lib/rules-engine/registries/hard-law.ts`
- **Constat** : la règle cite l'article A47 A-1 du LPF. La consultation du
  14/08/2026 n'y a pas trouvé d'exigence de rattachement au plan de comptes.
  L'article décrit un format de fichier.
- **Conséquence** : des constats sont produits avec `family: "hardLaw"`, donc
  affichés comme opposables, sur un fondement non établi.
- **À trancher** : quel article du PCG fonde l'exigence ? À défaut, la règle
  doit-elle passer en `internal` ?
- **Interdit ici** : modifier la famille de la règle changerait les résultats
  métier. Cela relève d'un lot dédié, après décision.

### R-02 · `R-HL-007` « Ordre chronologique de validation » est classée `hardLaw`

- **Où** : `lib/rules-engine/registries/hard-law.ts` ; contrôle `FEC-ORDRE-002`
- **Constat** : l'exigence est attribuée à l'article par plusieurs sources
  secondaires, mais n'a pas été retrouvée dans le texte lors de la consultation.
- **À trancher** : identifier le paragraphe exact d'A47 A-1, ou reclasser.

### R-03 · `R-HL-008` « Équilibre débit / crédit par écriture » est classée `hardLaw`

- **Où** : `lib/rules-engine/registries/hard-law.ts` ; contrôles
  `FEC-EQUILIBRE-001` et `FEC-EQUILIBRE-002`
- **Constat** : le principe de la partie double ne figure pas dans A47 A-1.
- **À trancher** : rattacher à l'article du PCG qui l'énonce.

---

## Priorité 2 — référentiel NEP

### R-04 · Intitulés de 18 NEP non certifiés

- **Où** : `data/nep/nep.yml` — toutes les entrées sauf `nep-230`
- **Tenté** : consultation de `cncc.fr/les-normes-dexercice-professionnel.html`
  le 14/08/2026 ; la page rend sa liste par script et n'expose aucun contenu
  lisible.
- **Manque** : les intitulés officiels exacts. Ceux en place proviennent du
  registre interne `data/sources/nep.yml`, antérieur à ce lot.
- **À faire** : confronter au recueil officiel des NEP homologuées, puis passer
  chaque entrée en `verified`.

### R-05 · NEP 700 — existence et intitulé non vérifiés

- **Où** : `data/nep/nep.yml`, entrée `nep-700`
- **Constat** : cette NEP est **absente** du registre interne. Elle a été
  ajoutée parce que le thème `rapport`, explicitement demandé, serait sinon
  vide. Son numéro et son intitulé n'ont pas été vérifiés.
- **À trancher** : confirmer le numéro de la NEP traitant du rapport
  d'opinion. C'est la couverture la plus fragile du référentiel.

### R-06 · Crosswalk NEP ↔ ISA : 18 liens sur 19 non vérifiés

- **Où** : `data/crosswalks/nep-isa.yml`
- **Constat** : seul `nep-230 ↔ isa-230` est établi. Les autres reposent sur la
  concordance de numérotation — indice sérieux, pas preuve.
- **À trancher** : pour chaque paire, la relation est-elle `partial`,
  `related` ou `no_equivalent` ? Une NEP peut ajouter ou retrancher des
  exigences par rapport à l'ISA correspondante.
- **Point d'attention** : `isa-700` est absente de `data/sources/isa.yml`.

---

## Priorité 3 — IAS/IFRS

### R-07 · Dates d'entrée en vigueur IASB manquantes pour 19 normes sur 21

- **Où** : `data/ifrs/standards.yml`, champ `iasbEffectiveDate: null`
- **Vérifiées** : IFRS 18 et IFRS 19 (01/01/2027), par le rapport EFRAG du
  17/07/2026.
- **Tenté** : `ifrs.org/issued-standards/list-of-standards/` — liste rendue par
  script, non lisible.
- **Manque** : les 19 autres dates. `null` a été préféré à une date plausible :
  dans un référentiel d'audit, une date approximative est indiscernable d'une
  date exacte.
- **Effet de bord** : tant que `iasbEffectiveDate` est `null`, le contrôle K-003
  refuse de présenter la norme comme applicable — comportement volontaire.

### R-08 · Règlement « ANC 2024-07 » — existence non confirmée

- **Où** : `data/pcg/requirements.yml` (information **non reprise**)
- **Constat** : un résumé de moteur de recherche attribue à un règlement
  « ANC 2024-07 » une ligne obligatoire « autres fonds propres » au passif,
  applicable aux exercices ouverts à compter du 01/01/2026. Ce règlement **ne
  figure pas** sur la page officielle des règlements de l'ANC consultée le
  14/08/2026, qui liste pour 2024 le règlement 2024-02 (certificats d'économies
  d'énergie).
- **À trancher** : ce règlement existe-t-il sous un autre numéro ? Si oui, la
  ligne « autres fonds propres » affecte les cycles capitaux propres et doit
  être indexée.
- **Pourquoi c'est important** : c'est le cas type de l'information plausible
  qui aurait été recopiée sans contrôle.

### R-09 · Dates d'entrée en vigueur des règlements ANC 2026-03 et 2026-04

- **Où** : `data/pcg/requirements.yml`, `effectiveFrom: null`
- **Vérifié** : dates d'**adoption** (06/03/2026 et 06/05/2026) et, pour
  2026-04, la **règle** d'entrée en vigueur (lendemain de la publication au JO,
  exercices en cours à cette date).
- **Manque** : les dates d'homologation par arrêté et de publication au JO. La
  règle est connue mais ne suffit pas à calculer la date.

### R-10 · Référence exacte du règlement UE adoptant IFRS 18

- **Où** : `data/ifrs/standards.yml`, `ifrs-18.euEndorsement.basis`
- **Constat** : l'adoption est établie (absence de la liste EFRAG des documents
  non adoptés). La publication au JOUE le 16/02/2026 provient de deux sources
  **secondaires** concordantes, marquées comme telles.
- **Manque** : le numéro du règlement de la Commission / la référence CELEX.

### R-11 · Différences PCG/IFRS absentes pour les 21 normes

- **Où** : `data/ifrs/standards.yml`, `pcgDifferences: []`
- **Constat** : volontairement vides. Affirmer une divergence engage la lecture
  des deux référentiels ; aucune n'a pu être faite à la source.
- **À faire** : traiter **par cycle** plutôt que par norme, en s'appuyant sur le
  bloc `ifrsVsPcg` déjà présent dans les 35 fiches — lui-même en revue requise.
  Relève de **PR-04**.
- **Garde-fou en place** : le contrôle K-005 refuse toute différence sans
  source, y compris ajoutée plus tard.

### R-12 · IFRS 17 — périmètre sectoriel à arbitrer

- **Où** : `data/ifrs/standards.yml`, entrée `ifrs-17`
- **Constat** : aucun des 35 cycles ne traite l'assurance. `affectedCycles` est
  vide.
- **À trancher** : PROBANT couvre-t-il le secteur assurance ? Si non, la fiche
  doit passer en `out_of_scope` plutôt que rester en `review_required`.

---

## Priorité 4 — FEC

### R-13 · Tolérance au vide des 18 zones

- **Où** : `data/fec/fields.yml`, `allowedBlankStatus: review_required` (18/18)
- **Constat** : l'article A47 A-1 énumère et ordonne les zones — vérifié — mais
  ne précise pas, zone par zone, laquelle peut rester à blanc sur une écriture.
  Les valeurs en place reflètent la pratique observée dans
  `lib/canonical-model/fec.ts`.
- **À trancher** : confronter à la doctrine administrative. Zones les plus
  sensibles : `CompAuxNum`, `CompAuxLib` (comptabilité auxiliaire),
  `EcritureLet`, `DateLet` (lettrage), `Montantdevise`, `Idevise`.

### R-14 · Valeurs admises pour la zone `Sens`

- **Où** : contrôle `FEC-MONTANT-002`
- **Constat** : la substitution des zones 12/13 par `Montant`/`Sens` est
  vérifiée. Le texte ne normalise pas les valeurs admises pour `Sens`
  (`D`/`C`, `+`/`-`, autre).
- **Conséquence** : un contrôle strict rejetterait des fichiers légitimes.

### R-15 · Codification de la zone `Idevise`

- **Où** : contrôle `FEC-DEVISE-002`
- **Constat** : le renvoi à l'ISO 4217 n'a pas été vérifié dans le texte.
- **À trancher** : avant de refuser un code hors ISO 4217.

### R-16 · Colonnes supplémentaires dans l'en-tête

- **Où** : contrôle `FEC-PRESENCE-002`
- **Constat** : l'article énumère les zones attendues ; la consultation n'a pas
  établi qu'il **interdise** une colonne supplémentaire.
- **À trancher** : une colonne en plus est-elle une non-conformité ?

---

## Priorité 5 — crosswalks dérivés

### R-17 · 238 liens cycle ↔ comptes et cycle ↔ assertions

- **Où** : `data/crosswalks/cycle-accounts.yml` (70),
  `data/crosswalks/cycle-assertions.yml` (168)
- **Constat** : générés depuis `data/cycles/*.yml` par
  `scripts/gen-crosswalks.mjs`. Ils n'ajoutent aucune affirmation normative :
  ils projettent un contenu existant. Mais ce contenu est lui-même en revue
  requise — les liens en héritent.
- **À faire** : la revue des 35 fiches (PR-04) fermera ce point mécaniquement.
  Régénérer ensuite.

---

## Récapitulatif

| Priorité | Points | Nature |
|---|---:|---|
| 1 — constats opposables | 3 | Fondement normatif non établi |
| 2 — NEP | 3 | Intitulés et correspondances non certifiés |
| 3 — IFRS / PCG | 6 | Dates, références et divergences manquantes |
| 4 — FEC | 4 | Attributs de tolérance non établis |
| 5 — crosswalks | 1 | Hérité de la revue des cycles |
| **Total** | **17** | |

Les points **R-01 à R-03** sont les seuls qui affectent ce que l'application
affiche **aujourd'hui** comme opposable. Les autres portent sur des données qui
n'alimentent encore aucune restitution.
