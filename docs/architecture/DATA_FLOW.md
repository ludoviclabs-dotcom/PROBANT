# PROBANT — Flux de données réels

> **Commit audité** : `e61ae741df1694a5beadb76ddaeee8cb7d79b0e6`
> Ce document décrit les flux **tels qu'ils existent**, pas tels qu'ils
> devraient être. Pour la cible, voir [`TARGET_ARCHITECTURE.md`](./TARGET_ARCHITECTURE.md).

---

## 1. Vue générale — trois chemins indépendants

Il n'existe pas *un* flux de données dans PROBANT, mais **trois chemins qui ne se
rejoignent jamais** — c'est la traduction technique du P0-4.

```mermaid
flowchart TB
    subgraph C1["Chemin 1 — DÉMO (statique, serveur)"]
        D1["lib/demo/dataset.ts<br/>DEMO_DOSSIER<br/>28 silos · 41 constats"]
        D2["layout · synthese · dossier<br/>tests · cloisons · /api/export"]
        D1 --> D2
    end

    subgraph C2["Chemin 2 — DÉPÔT RÉEL (client, éphémère)"]
        U1["Fichier utilisateur"]
        U2["POST /api/depot"]
        U3["sessionStorage<br/>4 clés probant:live-*"]
        U4["CloisonsViewLive<br/>RiskMappingView"]
        U1 --> U2 --> U3 --> U4
    end

    subgraph C3["Chemin 3 — CONNAISSANCE (YAML, serveur)"]
        Y1["data/cycles/*.yml × 35<br/>data/sources/*.yml × 88<br/>data/methodology/*.yml × 6"]
        Y2["lib/audit-cycles/loader.ts<br/>node:fs + js-yaml"]
        Y3["/normatif/* · /dashboard/risques<br/>/api/normatif/*"]
        Y1 --> Y2 --> Y3
    end

    C1 -.->|"fusion partielle,<br/>uniquement dans<br/>RiskMappingView"| C2
    C3 -.->|"cycles utilisés<br/>comme axes"| C2
```

Seule la Cartographie des risques (`/dashboard/risques`) fusionne les trois. La
Synthèse (`/dashboard/synthese`) n'en voit **qu'un seul** : le chemin démo.

---

## 2. Chemin 1 — le dossier de démonstration

```mermaid
flowchart LR
    DS["lib/demo/dataset.ts:1163<br/>DEMO_DOSSIER"]

    DS --> L["app/dashboard/layout.tsx:3<br/>badges, société, SIREN"]
    DS --> S["app/dashboard/synthese/page.tsx:340<br/>const d = DEMO_DOSSIER"]
    DS --> DO["app/dashboard/dossier/page.tsx:8"]
    DS --> T["app/dashboard/tests/page.tsx:29"]
    DS --> C["app/dashboard/cloisons/page.tsx:29<br/>fallback si aucun scénario"]
    DS --> E["app/api/export/route.ts:9<br/>buildReviewPack()"]
    DS --> R["components/probant/RecentDossiers.tsx:94"]
    DS --> RM["components/probant/risk/RiskMappingView.tsx:185"]

    DS --> SC["lib/demo/scenarios.ts:3<br/>SCENARIO_MAP"]
    DS --> TO["lib/demo/tour.ts:24<br/>visite guidée"]
    SC --> C
```

**Aucune persistance.** La démo est reconstruite à chaque rendu depuis un module
TypeScript statique. C'est ce qui garantit que le mode DEMO SA fonctionne sans
base ni credentials — propriété à préserver.

---

## 3. Chemin 2 — dépôt réel d'un FEC

```mermaid
sequenceDiagram
    actor U as Utilisateur
    participant DV as DepotView.tsx
    participant API as /api/depot
    participant P as lib/fec/parser.ts
    participant RE as lib/rules-engine
    participant SS as sessionStorage
    participant CL as CloisonsViewLive

    U->>DV: dépose un FEC
    DV->>API: POST multipart (l. 160)
    Note over API: await file.text()<br/>fichier ENTIER en mémoire — P0-5
    API->>API: sha256(text) — lib/evidence/hash.ts
    API->>P: parseFec(text)
    P-->>API: ParsedFec (entries, headerColumns, parseErrors)
    API->>RE: runRules({parsed, entries, siren, referentielVersion})
    RE-->>API: Finding[]
    API->>API: splitAdmissibilite(findings)
    Note over API: entries plafonnées à 20 000<br/>APRÈS parsing (l. 47-50)
    API-->>DV: JSON {admissibilite, analyse, entries, mapping, …}

    DV->>SS: probant:live-findings (l. 189)
    DV->>SS: probant:live-admissibilite (l. 193)
    DV->>SS: probant:live-fec (l. 208)
    DV->>SS: probant:live-meta (l. 209)

    U->>CL: navigue vers /dashboard/cloisons
    CL->>SS: lit les 4 clés (l. 233-243)
    CL-->>U: revue par cloison sur données réelles
```

### Ce que ce chemin **ne fait pas**

- Il n'écrit **rien** côté serveur. `/api/depot` est un pipeline pur.
- Il ne survit **pas** à la fermeture de l'onglet (`sessionStorage`).
- Il n'atteint **jamais** `/dashboard/synthese`, qui reste câblée sur la démo.
- Le SIREN est extrait du **nom de fichier** par expression régulière
  (`/^(\d{9})FEC/iu`, `app/api/depot/route.ts:34`) — `null` sinon.

### Variante — dépôt par cycle (rapprochement)

```mermaid
flowchart LR
    F["Fichiers du cycle<br/>(tableur)"] --> CU["CycleUploadPanel.tsx"]
    CU --> PU["lib/rapprochement/parse-upload.ts<br/>+ build-from-upload.ts"]
    PU --> FI["resultToFindings()"]
    FI --> K1["sessionStorage<br/>probant:live-rapprochement (l. 179)"]
    FI --> K2["sessionStorage<br/>probant:live-findings — fusion dédupliquée (l. 187-193)"]
    K1 --> DC["useDepositCoverage.ts:33"]
    K2 --> CL["CloisonsViewLive"]
```

Ce chemin **s'exécute entièrement dans le navigateur** — il n'appelle aucune
route API. C'est aussi lui qui consomme `xlsx@0.18.5` via
`lib/balance/parse-xlsx.ts:21` (`await import("xlsx")`) → surface de **P0-1**.

---

## 4. Chemin 3 — base de connaissance normative

```mermaid
flowchart LR
    Y["data/cycles/*.yml × 35<br/>data/sources/*.yml × 88<br/>data/methodology/*.yml × 6"]
    LO["lib/audit-cycles/loader.ts<br/>node:fs/promises + js-yaml<br/>DATA_DIR = process.cwd()/data"]
    Y --> LO

    LO --> N1["/normatif — 1 page"]
    LO --> N2["/normatif/cycles/[slug] — 35 pages SSG"]
    LO --> N3["/normatif/sources/[slug] — 88 pages SSG"]
    LO --> N4["/api/normatif/search — Fuse.js"]
    LO --> N5["/api/normatif/export — JSON/CSV/MD"]
    LO --> N6["/api/normatif/validate — validation.ts"]
    LO --> RQ["/dashboard/risques<br/>loadAllCycles() → axes de risque"]
```

`next.config.ts:6-8` embarque `./data/**/*` dans le tracing de fichiers de chaque
fonction serverless — condition nécessaire au fonctionnement de `loader.ts` en
production.

**Le registre TypeScript `lib/referentiel/sources.ts` (24 sources) n'apparaît pas
dans ce flux.** Il alimente un chemin distinct :

```mermaid
flowchart LR
    TS["lib/referentiel/sources.ts<br/>SOURCES × 24 · SEUILS_INTERNES<br/>REFERENTIEL_VERSION = '2024-01-01'"]
    TS --> RG["lib/rules-engine/registries/*<br/>citations des 15 règles"]
    TS --> RF["/dashboard/referentiel"]
    TS --> DP["/api/depot<br/>referentielVersion dans la réponse"]
```

→ **P1-1** : deux registres normatifs, deux flux, aucune réconciliation.

---

## 5. Cartographie des risques — le seul point de fusion

```mermaid
flowchart TB
    Y["data/cycles/*.yml × 35"] -->|"serveur, loadAllCycles()"| RV["RiskMappingView.tsx"]
    DM["DEMO_DOSSIER<br/>allFindings() (l. 185)"] --> MG["mergeFindings()<br/>déduplication par id (l. 115-120)"]
    SS["sessionStorage<br/>live-findings + live-admissibilite<br/>(l. 188-191, hydratation client)"] --> MG
    MG --> RV

    MB["DEMO_MATERIALITY_BASIS"] --> MAT["computeMateriality()<br/>lib/audit/materiality.ts"]
    MAT --> RV

    RV --> SCO["buildCycleScores() → scoreCycle()<br/>lib/risk-mapping/aggregate.ts:62<br/>lib/risk-mapping/scoring.ts:456"]
    ADJ["GET /api/adjustments<br/>store mémoire"] --> SCO
    CACHE["sessionStorage<br/>probant:risk-adjustments<br/>cache optimiste"] --> SCO

    SCO --> H["RiskMatrixHeatmap"]
    SCO --> G["RiskFlowGraph"]
    SCO --> B["RiskBubbleChart"]
    SCO --> P["CycleRiskPanel"]

    H --> LS["localStorage<br/>probant_risques_sort_demo-dossier"]
```

Le motif d'hydratation est explicite (`liveFindings: Finding[] | null`, sentinelle
`null` = pas encore hydraté, `RiskMappingView.tsx:186`) : le premier rendu serveur
n'ignore jamais silencieusement des constats déposés côté client.

---

## 6. Ajustements de jugement — le seul aller-retour serveur avec état

```mermaid
sequenceDiagram
    participant UI as useRiskAdjustments.ts
    participant SS as sessionStorage
    participant API as /api/adjustments
    participant ST as adjustments-store.ts

    Note over UI,SS: montage — cache optimiste d'abord
    UI->>SS: lecture probant:risk-adjustments (l. 100)
    UI->>API: GET ?dossierId=demo-dossier (l. 147)
    API->>ST: listAdjustments()
    ST-->>API: Map module-level
    API-->>UI: JSON
    Note over UI: si l'API échoue,<br/>on reste sur le cache (l. 161)

    UI->>API: POST {dossierId, cycleSlug, axe, valeur} (l. 218)
    API->>ST: upsertAdjustment()
    Note over ST: si la valeur change,<br/>push dans historyLog (l. 49-59)
    UI->>SS: écriture du cache (l. 110)

    UI->>API: POST /api/adjustments/reset (l. 328)
    API->>ST: deleteAllAdjustments()
```

**Durée de vie réelle** : la `Map` et le `historyLog` vivent dans le process
Next.js. Un redéploiement, un redémarrage, ou une seconde instance serverless
suffit à les perdre — ou à servir un état différent. C'est explicitement assumé
dans `lib/server-store/adjustments-store.ts:1-12`.

---

## 7. Ce qui n'existe pas dans les flux

| Absent | Vérification |
|---|---|
| Base de données | Aucune dépendance de driver ni d'ORM dans `package.json` |
| Stockage objet | Aucun appel de stockage dans `app/` ou `lib/` |
| Authentification / session serveur | Aucun `middleware.ts`, aucun cookie émis |
| Appel réseau sortant vers un tiers | `lib/analytics/track.ts` ne poste que vers `/api/analytics/events` |
| File d'attente / job asynchrone | Le parsing est synchrone dans la requête HTTP (P0-5) |
| Export PDF | `lib/evidence/export.ts` produit un `ReviewPack` **JSON** |
