# Écarts entre la base du plan et `main` — relevé du 29/10/2026

- Base du plan : `e25a4adfe82aaf2249b4011603f1846beea7b970` (16/10/2026).
- Relevé sur : `97bed709526513456bcbadc7d9d9cc760408e3b7`, `main` après fusion de la PR #100.
- Méthode : comparaison git locale et lecture du code. Aucun test applicatif relancé, puisque ce relevé ne touche pas au code. GitHub distant et déploiement Vercel non consultés : **non vérifiés**. C00 refait ce relevé sur le SHA alors courant.

## 1. PR fusionnées depuis la base

| Fusion | PR | Objet | Fichiers |
|---|---|---|---|
| `8f1f50d` | #98 | Recette finale C15 : matrice, parcours réel persistant, rapport | 77 |
| `7e2f857` | #99 | C10 : IS 1.1.0 (millésimes, arrondis) et incidence fiscale par scénario dans la Synthèse | 56 |
| `97bed70` | #100 | Refonte de la landing, du châssis du tableau de bord et de la Synthèse | 104 |

Les trois fusions datent du 16/10/2026. Le plan avait lu les PR #75 à #97.

## 2. Ancrages cités par le plan (`01_ARCHITECTURE_ET_SCOPE.md` § 2)

| Ancrage | Au `97bed70` |
|---|---|
| `lib/workpapers/service.ts`, `model.ts`, `calculations.ts` | Inchangés |
| `lib/canonical-model/money.ts`, `period.ts` | Inchangés |
| `lib/workpapers/loan-*` | Inchangés ; dernière migration toujours `drizzle/0021_loans_review` |
| `lib/workpapers/fixed-asset-*` | Une ligne : l'export reçoit le profil d'exécution (`fixed-asset-runtime.ts`) |
| `lib/workpapers/closing-*` | Inchangés |
| `lib/capabilities/registry.ts` | Inchangé (version 1.4.1) |
| `lib/ingestion/local-runtime.ts` | Inchangé |
| `data/cycles/contrats-location-ifrs16.yml`, `data/crosswalks/pcg-ifrs.yml`, `data/ifrs/standards.yml` | Inchangés |
| `package.json` | Inchangé : Recharts 3.9, TanStack Table 8.21, aucune bibliothèque décimale |
| `app/globals.css` | Jetons `--pb-*` inchangés ; importe désormais `app/tokens.css` (§ 3) |

Le socle moteur visé par C00, C01 et L16-01 → L16-03 est donc celui que le plan a inspecté.

## 3. Écart principal : charte et châssis du tableau de bord (PR #100)

Le tableau 1 de `02_CHARTE_UI_ET_DATAVIZ.md` décrit les jetons de `globals.css`. Ils restent ceux des écrans non refondus, dont les feuilles de cycle comme `/emprunts`. La PR #100 ajoute une seconde charte et un châssis :

- **Jetons.** `app/tokens.css` porte la charte « Le grand livre rendu vivant », appliquée par sous-arbre (`data-ambiance`) et non sur `:root` :
  - `papier` pour la landing ;
  - `instruments` pour le tableau de bord : fond `#111214`, encre `#ECE8DF`, bleu de vérification `#85A3F2`, signal `#F06A3C`, gravités `--pb-sev-*`, filets de 1 px, rayons 0 / 2 / 4 px, aucune ombre.
- **Polices.** Cette charte utilise Newsreader, Geist et IBM Plex Mono (`app/fonts.ts`). Les écrans non migrés gardent Inter et JetBrains Mono, que cite le plan.
- **Châssis.** `components/instruments/` : `DashboardShell`, `InstrumentRail` (dès 760 px), `BottomBar` (sous 760 px), `ContextRibbon`, `DemoBanner`, `DossierGate`. Le rail et la barre basse se construisent depuis `WORKFLOW_ROUTES` (`components/instruments/nav.ts`) : un écran ajouté au registre y apparaît.
- **Volets.** `components/synthese/DetailDrawer.tsx` (Synthèse) s'ajoute à `components/probant/useNavDrawer.ts` (tiroirs Normatif) et aux corrections des PR #80 et #87 citées par le plan.
- **Mouvement.** Trait du rail en 200 ms, volet de détail en 220 ms ; le plan propose 120 à 180 ms.

À trancher en C00 / C02, sans décision ici :

1. Placer les ateliers dans le châssis `/dashboard` (ambiance `instruments`, entrée par `WORKFLOW_ROUTES`) ou en routes autonomes `/ifrs/*` à la manière de `/emprunts` (jetons de `globals.css`).
2. Réutiliser un volet existant pour l'inspecteur au lieu d'en créer un troisième.
3. Aligner les durées d'animation sur la convention existante ou fixer une règle commune.

## 4. Points que C00 doit trancher

| # | Constat au 29/10/2026 | Ce qu'il faut décider |
|---|---|---|
| 1 | Aucune bibliothèque décimale. Emprunts exprime les taux en millionièmes de point dans un `bigint` (`ratePpm`, [`loan-rules.ts:82`](../../lib/workpapers/loan-rules.ts#L82)) | Le taux mensuel `(1 + r)^(1/12) − 1` exige une racine 12e : ajouter une dépendance (`decimal.js`) ou écrire une virgule fixe `bigint` avec racine par Newton. Préférence exprimée le 29/10 : version interne, sans dépendance, contrôlée par l'oracle indépendant |
| 2 | `RuleReference.authority` vaut `internal`, `methodology` ou `law` ; `validation` vaut `provisional` ou `validated` ([`model.ts:44`](../../lib/workpapers/model.ts#L44)) | Le plan emploie `review_required` / `validated` et distingue le texte IASB de l'adoption UE. Fixer la correspondance sans élargir le sens de `law` |
| 3 | `CAPABILITY_CYCLE_IDS` ne liste que des cycles du journal ([`procedures.ts:2`](../../lib/capabilities/procedures.ts#L2)). Une procédure moteur exige un cycle et une variable d'activation `PROBANT_*_DURABLE` | Rattacher `ifrs16.leases` à un cycle existant ou ouvrir un axe distinct, sans fausser la carte des capacités par cycle |
| 4 | Plusieurs contrats proposés recouvrent l'existant : `RulePack` ↔ `RuleReference` + `data/ifrs/standards.yml` ; `SourceSnapshot` ↔ `ImportBatch`, `Population`, `WorkpaperScope` ; `CanonicalProjection` ↔ projection du dossier de clôture (C14) | Statuer type par type : réutiliser, étendre ou créer. Seuls `AdjustmentBundle` et `PreparationManifest` sont vraiment nouveaux, plus `PresentationDataset` si IFRS 18 est engagé |
| 5 | Le registre du référentiel est versionné par éditions, sous un test de garde ([`lib/referentiel/edition.ts`](../../lib/referentiel/edition.ts)) | Une source IFRS ajoutée à ce registre impose l'édition suivante |
| 6 | Dans `data/ifrs/standards.yml`, IFRS 18 est marquée `endorsed` : publication au JOUE le 16/02/2026 selon deux sources secondaires, référence exacte « à confirmer ». Le plan cite le règlement (UE) 2026/338 du 13/02/2026, mais n'a pas pu lire EUR-Lex | Référence non vérifiée ici : la lire avant toute activation réelle, sans la recopier telle quelle |
| 7 | IFRS 18 exige une base déclarée `IFRS_prepared`, alors que PROBANT ingère des FEC au PCG | En usage réel, l'atelier resterait le plus souvent en diagnostic : décider d'engager P18 après L16-06 |

## 5. Chiffres de recette du plan

[`precontrole_attendus.py`](./precontrole_attendus.py) recalcule, sans code PROBANT, les attendus de L16-02, L16-03, L16-06 (mutation `r/12`), P18-02, P18-03 et P18-04 : **22 sur 22 confirmés** le 29/10/2026.

- Sur la fixture L16, l'échéancier publié à partir des soldes arrondis ne laisse aucun écart d'arrondi : intérêts 29,41 / 19,70 / 9,90, dette finale 0,00.
- Avec `r/12`, la dette initiale serait de 2 937,69 € au lieu de 2 940,99 €.

Ce précontrôle ne remplace pas l'oracle que C00 doit établir.

## 6. Séquence proposée

1. **Étape 0** (ce relevé) : plan versionné, aucun code.
2. **C00** restreint à IFRS 16, avec les contrats communs minimaux et les points du § 4.
3. **C01** (socle minimal), **C02** (sur le châssis retenu au § 3), puis **L16-01 → L16-06**.
4. **Après L16-06**, décision sur IFRS 18 : plan complet (P18-01 → P18-06 puis C03), version réduite (P18-01 + P18-02) ou report.
5. **Dès L16-03**, le bundle garde la nature de chaque contribution au résultat (intérêt sur dette locative, dotation du droit d'utilisation, loyer neutralisé), pour qu'un classement IFRS 18 ultérieur reste possible selon le texte vérifié.
