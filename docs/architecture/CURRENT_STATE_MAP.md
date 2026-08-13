# PROBANT — Cartographie de l'existant

> **Commit audité** : `e61ae741df1694a5beadb76ddaeee8cb7d79b0e6` — 13/08/2026
> Tout constat ci-dessous porte le **chemin du fichier** concerné. Les
> affirmations non confirmées sont marquées `UNVERIFIED`.
> 242 fichiers suivis par git au commit audité.

---

## 1. Routes → source de données → persistance

### 1.1 Routes `app/dashboard/*`

| Route | Fichier | Rendu | Source de données | Persistance |
|---|---|---|---|---|
| *(layout)* | [`app/dashboard/layout.tsx`](../../app/dashboard/layout.tsx) | Serveur | `DEMO_DOSSIER` (import direct, l. 3) | Aucune |
| `/dashboard/depot` | [`app/dashboard/depot/page.tsx`](../../app/dashboard/depot/page.tsx) | Serveur → `DepotView` (client) | Fichier utilisateur → `POST /api/depot` | `sessionStorage` (4 clés) |
| `/dashboard/synthese` | [`app/dashboard/synthese/page.tsx`](../../app/dashboard/synthese/page.tsx) | **Client** (`"use client"` l. 1) | `DEMO_DOSSIER` **exclusivement** (l. 340) | Aucune — `reviewPct = 0` en dur (l. 411) |
| `/dashboard/risques` | [`app/dashboard/risques/page.tsx`](../../app/dashboard/risques/page.tsx) | Serveur (`loadAllCycles`) | `data/cycles/*.yml` + `DEMO_DOSSIER` + `sessionStorage` (fusion l. 185-197 de `RiskMappingView.tsx`) | `sessionStorage` + store mémoire via `/api/adjustments` + `localStorage` (tri) |
| `/dashboard/cloisons` | [`app/dashboard/cloisons/page.tsx`](../../app/dashboard/cloisons/page.tsx) | Serveur, `searchParams` | `SCENARIO_MAP` ?? `DEMO_DOSSIER.silos` (l. 29) **ou** `sessionStorage` via `CloisonsViewLive` | `sessionStorage` |
| `/dashboard/dossier` | [`app/dashboard/dossier/page.tsx`](../../app/dashboard/dossier/page.tsx) | Serveur | `DEMO_DOSSIER` (l. 8) | Aucune |
| `/dashboard/tests` | [`app/dashboard/tests/page.tsx`](../../app/dashboard/tests/page.tsx) | Serveur | `DEMO_DOSSIER` (l. 29) | Aucune |
| `/dashboard/referentiel` | [`app/dashboard/referentiel/page.tsx`](../../app/dashboard/referentiel/page.tsx) | Serveur | `lib/referentiel/sources.ts` (`SOURCES`, `SEUILS_INTERNES`) | Aucune |

**7 routes dashboard**, toutes déclarées dans la navigation
[`components/probant/Sidebar.tsx:19-25`](../../components/probant/Sidebar.tsx).

### 1.2 Routes `app/normatif/*` et racine

| Route | Fichier | Source de données | Persistance |
|---|---|---|---|
| `/` | [`app/page.tsx`](../../app/page.tsx) | Statique + `SplashScreen` | `sessionStorage` (`probant_splash_seen`) |
| `/onboarding` | [`app/onboarding/page.tsx`](../../app/onboarding/page.tsx) | Formulaire local + `DepotView` | `sessionStorage` (`probant:onboarding-params`) |
| `/normatif` | [`app/normatif/page.tsx`](../../app/normatif/page.tsx) | `loadAllCycles` + `loadAllSources` → `data/*.yml` | Aucune |
| `/normatif/cycles` | [`app/normatif/cycles/page.tsx`](../../app/normatif/cycles/page.tsx) | `loadAllCycles` | Aucune |
| `/normatif/cycles/[slug]` | [`app/normatif/cycles/[slug]/page.tsx`](../../app/normatif/cycles/%5Bslug%5D/page.tsx) | `loadCycle` — **35** pages SSG | Aucune |
| `/normatif/sources` | [`app/normatif/sources/page.tsx`](../../app/normatif/sources/page.tsx) | `loadAllSources` | Aucune |
| `/normatif/sources/[slug]` | [`app/normatif/sources/[slug]/page.tsx`](../../app/normatif/sources/%5Bslug%5D/page.tsx) | `loadAllSources` — **88** pages SSG | Aucune |
| `/normatif/methodologie` | [`app/normatif/methodologie/page.tsx`](../../app/normatif/methodologie/page.tsx) | `data/methodology/*.yml` | Aucune |
| `/normatif/export` | [`app/normatif/export/page.tsx`](../../app/normatif/export/page.tsx) | `loadAllCycles` | Aucune |

Total build : **145 pages statiques générées** (voir § 8).

---

## 2. API — `app/api/*`

**10 fichiers `route.ts`, 12 handlers.** Aucun n'est authentifié.

| Endpoint | Méthode(s) | Fichier | Source de vérité | Effet de bord |
|---|---|---|---|---|
| `/api/depot` | `POST` | [`app/api/depot/route.ts`](../../app/api/depot/route.ts) | Fichier uploadé (multipart) | **Aucun** — pipeline pur, réponse JSON. `runtime = "nodejs"` |
| `/api/export` | `GET` | [`app/api/export/route.ts`](../../app/api/export/route.ts) | `DEMO_DOSSIER` (l. 2) | Aucun — télécharge un `ReviewPack` JSON |
| `/api/adjustments` | `GET`, `POST` | [`app/api/adjustments/route.ts`](../../app/api/adjustments/route.ts) | `adjustments-store` (mémoire) | **Écrit** dans la `Map` module-level |
| `/api/adjustments/[id]` | `DELETE` | [`app/api/adjustments/[id]/route.ts`](../../app/api/adjustments/%5Bid%5D/route.ts) | idem | Supprime une entrée |
| `/api/adjustments/history` | `GET` | [`app/api/adjustments/history/route.ts`](../../app/api/adjustments/history/route.ts) | idem | Aucun |
| `/api/adjustments/reset` | `POST` | [`app/api/adjustments/reset/route.ts`](../../app/api/adjustments/reset/route.ts) | idem | Purge le dossier |
| `/api/analytics/events` | `POST`, `GET` | [`app/api/analytics/events/route.ts`](../../app/api/analytics/events/route.ts) | `analytics-store` (mémoire, plafond 500) | **Écrit** dans le tableau module-level |
| `/api/normatif/search` | `GET` | [`app/api/normatif/search/route.ts`](../../app/api/normatif/search/route.ts) | `data/cycles/*.yml` via Fuse.js | Aucun |
| `/api/normatif/export` | `GET` | [`app/api/normatif/export/route.ts`](../../app/api/normatif/export/route.ts) | `data/cycles/*.yml` | Aucun |
| `/api/normatif/validate` | `GET` | [`app/api/normatif/validate/route.ts`](../../app/api/normatif/validate/route.ts) | `lib/audit-cycles/validation.ts` | Aucun |

Quatre routes déclarent `export const dynamic = "force-dynamic"` (les
`adjustments/*` et `analytics/events`) ; cinq déclarent `runtime = "nodejs"`.

---

## 3. Pages / composants → imports `DEMO_DOSSIER`

`DEMO_DOSSIER` est défini une seule fois : [`lib/demo/dataset.ts:1163`](../../lib/demo/dataset.ts).
**8 modules l'importent directement.**

| Fichier | Ligne d'import | Usage |
|---|---|---|
| [`app/dashboard/layout.tsx`](../../app/dashboard/layout.tsx) | 3 | Badges sidebar, raison sociale, SIREN, exercice (l. 12) |
| [`app/dashboard/synthese/page.tsx`](../../app/dashboard/synthese/page.tsx) | 6 | `const d = DEMO_DOSSIER` (l. 340) — **source unique de la page** |
| [`app/dashboard/cloisons/page.tsx`](../../app/dashboard/cloisons/page.tsx) | 4 | Fallback silos + libellé société (l. 29, 32) |
| [`app/dashboard/dossier/page.tsx`](../../app/dashboard/dossier/page.tsx) | 4 | `const d = DEMO_DOSSIER` (l. 8) |
| [`app/dashboard/tests/page.tsx`](../../app/dashboard/tests/page.tsx) | 4 | `const d = DEMO_DOSSIER` (l. 29) |
| [`app/api/export/route.ts`](../../app/api/export/route.ts) | 2 | `buildReviewPack(DEMO_DOSSIER, …)` (l. 9) |
| [`components/probant/RecentDossiers.tsx`](../../components/probant/RecentDossiers.tsx) | 7 | Card « dossier récent » (l. 94-102) |
| [`components/probant/risk/RiskMappingView.tsx`](../../components/probant/risk/RiskMappingView.tsx) | 10 | `allFindings(DEMO_DOSSIER)` fusionné avec le live (l. 185) |

Deux autres modules l'importent **à l'intérieur de la couche démo** — usage
légitime, à conserver : [`lib/demo/tour.ts:24`](../../lib/demo/tour.ts) et
[`lib/demo/scenarios.ts:3`](../../lib/demo/scenarios.ts).

À ne pas confondre avec `DEMO_DOSSIER_ID` (chaîne `"demo-dossier"`,
[`lib/server-store/types.ts:17`](../../lib/server-store/types.ts)), utilisé par
les 4 routes `adjustments`/`analytics`. Cette constante est **redéclarée en dur**
dans [`components/probant/risk/useRiskAdjustments.ts:41`](../../components/probant/risk/useRiskAdjustments.ts)
au lieu d'être importée → duplication silencieuse (P2-1).

---

## 4. Stockage navigateur

### 4.1 `sessionStorage` — 8 clés

| Clé | Déclarée dans | Écrite par | Lue par |
|---|---|---|---|
| `probant:live-findings` | [`CloisonsViewLive.tsx:12`](../../components/probant/CloisonsViewLive.tsx) | `DepotView.tsx:189`, `CycleUploadPanel.tsx:193` | `CloisonsViewLive.tsx:233`, `RiskMappingView.tsx` |
| `probant:live-fec` | [`CloisonsViewLive.tsx:14`](../../components/probant/CloisonsViewLive.tsx) | `DepotView.tsx:208` | `CloisonsViewLive.tsx:239` |
| `probant:live-meta` | [`CloisonsViewLive.tsx:16`](../../components/probant/CloisonsViewLive.tsx) | `DepotView.tsx:209` | `CloisonsViewLive.tsx:241`, `RecentDossiers.tsx:85`, `onboarding/page.tsx:65` |
| `probant:live-admissibilite` | [`CloisonsViewLive.tsx:18`](../../components/probant/CloisonsViewLive.tsx) | `DepotView.tsx:193` | `CloisonsViewLive.tsx:243`, `RiskMappingView.tsx` |
| `probant:live-rapprochement` | [`CycleUploadPanel.tsx:27`](../../components/probant/CycleUploadPanel.tsx) | `CycleUploadPanel.tsx:179` | `useDepositCoverage.ts:33` |
| `probant:risk-adjustments` | [`lib/risk-mapping/adjustments.ts:20`](../../lib/risk-mapping/adjustments.ts) | `useRiskAdjustments.ts:110` | `useRiskAdjustments.ts:100` |
| `probant:onboarding-params` | [`app/onboarding/page.tsx:41`](../../app/onboarding/page.tsx) | l. 186 | l. 172 |
| `probant_splash_seen` | [`components/probant/SplashScreen.tsx:19`](../../components/probant/SplashScreen.tsx) | l. 56 | l. 31 |

Les clés `probant:live-*` sont **redéclarées en dur** dans
[`RiskMappingView.tsx:54-55`](../../components/probant/risk/RiskMappingView.tsx)
au lieu d'être importées de `CloisonsViewLive.tsx` → seconde duplication (P2-1).

### 4.2 `localStorage` — 1 clé

| Clé | Fichier | Contenu |
|---|---|---|
| `probant_risques_sort_demo-dossier` | [`RiskMatrixHeatmap.tsx:118`](../../components/probant/risk/RiskMatrixHeatmap.tsx) | État de tri du tableau. Le `dossierId` est **figé dans le nom de la clé** (commentaire l. 117 : « pas de vraie multi-tenance ») |

Toutes les lectures/écritures sont enveloppées dans un `try/catch` silencieux :
aucune ne peut faire planter le rendu. C'est une propriété volontaire et
documentée dans chaque fichier.

---

## 5. Stores serveur en mémoire

| Store | Fichier | Structure | Durée de vie | Plafond |
|---|---|---|---|---|
| Ajustements de jugement | [`lib/server-store/adjustments-store.ts:23`](../../lib/server-store/adjustments-store.ts) | `Map<string, JudgementAdjustmentRecord>` module-level, clé `dossierId:cycleSlug:axe` | Process Next.js | Aucun |
| Historique d'ajustements | [`lib/server-store/adjustments-store.ts:26`](../../lib/server-store/adjustments-store.ts) | `AdjustmentHistoryEntry[]` module-level | Process Next.js | Aucun |
| Événements analytics | [`lib/server-store/analytics-store.ts:22`](../../lib/server-store/analytics-store.ts) | `AnalyticsEvent[]` module-level | Process Next.js | **500** (l. 19) |

Les trois fichiers documentent explicitement qu'il ne s'agit **pas** d'une
persistance durable. Aucune autre structure `Map`/tableau module-level à état
mutable n'a été trouvée hors de ces fichiers (les autres `new Map`/`new Set` du
dépôt sont locaux à une fonction pure).

---

## 6. Calculateurs présents dans `app/dashboard/synthese/page.tsx`

La page fait **825 lignes** et embarque son propre moteur de calcul et ses
propres composants SVG. Rien de tout cela n'est testé.

| Symbole | Ligne | Nature |
|---|---|---|
| `WSEV` | 35 | **Poids de gravité en dur** : `bloquant 25`, `majeur 8`, `mineur 2`, `informatif 0.5` |
| `findingInc` | 74 | Incidence en EUR : `|constate − seuil|`, `0` si l'unité ≠ EUR |
| `idxLevel` | 79 | **Seuils d'interprétation en dur** : ≥ 60 élevée, ≥ 40 notable, ≥ 20 modérée, sinon maîtrisé |
| `pol` / `arc` | 55 / 59 | Géométrie polaire des graphiques |
| `eur` / `eurFull` | 65 / 71 | Formatage monétaire `fr-FR` |
| `Gauge` | 94 | Jauge SVG |
| `Donut` | 125 | Répartition par gravité |
| `Radar` | 164 | Radar par cloison |
| `Flow` | 206 | Diagramme de flux cloison → gravité |
| `calc` (`useMemo`) | 384-408 | **Agrégation centrale** : `sevCount`, `famCount`, `incByClo`, `matrix`, `cloW`, `totalInc`, `bloquants`, et l'indice |
| — | 406 | **`idx = round(100 × W / (W + 52))`** — la constante `52` n'est ni nommée, ni sourcée, ni testée |
| `reviewPct` | 411 | **Figé à `0`** avec le commentaire « démo : aucun statut persisté » |
| `hubFindings` | 424-435 | Filtrage/tri du hub de constats |
| `verdictSub` | 444 | Phrase de verdict construite par concaténation |

> Un second jeu de poids `WSEV`, **différent en usage mais identique en
> valeurs**, existe dans [`lib/risk-mapping/types.ts:222`](../../lib/risk-mapping/types.ts)
> avec ses constantes de saturation `K_SEV = 25`, `K_DENS = 6`, `K_RISK = 4`,
> `K_STD = 4`, `ADJ_STEP = 12`. Celui-là **est** testé
> (`lib/risk-mapping/__tests__/scoring.test.ts`, 18 tests).

---

## 7. Poids et seuils codés en dur — inventaire complet

| Constante | Valeur | Fichier | Testé ? | Sourcé ? |
|---|---|---|---|---|
| `WSEV` (synthèse) | 25 / 8 / 2 / 0.5 | `app/dashboard/synthese/page.tsx:35` | ❌ | ❌ |
| Dénominateur d'indice | `52` | `app/dashboard/synthese/page.tsx:406` | ❌ | ❌ |
| Paliers `idxLevel` | 60 / 40 / 20 | `app/dashboard/synthese/page.tsx:79-83` | ❌ | ❌ |
| `reviewPct` | `0` | `app/dashboard/synthese/page.tsx:411` | ❌ | n/a |
| `WSEV` (risk-mapping) | 25 / 8 / 2 / 0.5 | `lib/risk-mapping/types.ts:222` | ✅ | Doctrine ISA citée en tête de `scoring.ts` |
| `K_SEV` | 25 | `lib/risk-mapping/types.ts:235` | ✅ | ❌ (heuristique assumée) |
| `K_DENS` / `K_RISK` / `K_STD` | 6 / 4 / 4 | `lib/risk-mapping/types.ts:238-244` | ✅ | ❌ |
| `ADJ_STEP` | 12 | `lib/risk-mapping/types.ts:250` | ✅ | ❌ |
| Exposants du composite | `R^0.9 · P^0.7 · (1−D)^0.6` | `lib/risk-mapping/scoring.ts:22` | ✅ | ❌ (marqué `isHeuristic`) |
| `FP_FIABILITE` | 1 / 0.6 / 0.3 | `lib/risk-mapping/scoring.ts:71` | ✅ | ❌ |
| `TAUX_PAR_BASE` | CA 0,5 % · bilan 1 % · RN 5 % | `lib/audit/materiality.ts:37` | ✅ (12 tests) | ISA 320 « simplifiée » (commentaire l. 64) |
| `SEUILS_INTERNES` | bilan 1,0 % · CA 0,5 % · variation CA 25 % · écart amort. 5 pts · écriture tardive 5 j · faisceau 3 signaux | `lib/referentiel/sources.ts:245-258` | ❌ | Déclaré **non opposable** (l. 242-244) |
| `MAX_ENTRIES_RETURNED` | 20 000 | `app/api/depot/route.ts:13` | ❌ | n/a |
| `MAX_EVENTS` | 500 | `lib/server-store/analytics-store.ts:19` | ❌ | n/a |
| `REFERENTIEL_VERSION` | `"2024-01-01"` | `lib/referentiel/sources.ts:16` | ❌ | n/a |
| `VERSION` des 3 registres | `"1.0.0"` | `lib/rules-engine/registries/*.ts:12-13` | ❌ | n/a |

---

## 8. Boutons sans handler métier

Recherche exhaustive sur les 83 occurrences de `<button` de `app/` et
`components/`. **4 boutons visibles n'ont ni `onClick`, ni `type="submit"`, ni
aucun autre gestionnaire** — ils affichent `cursor: pointer` et ne font rien :

| Libellé | Fichier | Ligne |
|---|---|---|
| « Générer la note de synthèse » | [`app/dashboard/synthese/page.tsx`](../../app/dashboard/synthese/page.tsx) | 529 |
| « Réinitialiser la simulation » | [`app/dashboard/synthese/page.tsx`](../../app/dashboard/synthese/page.tsx) | 533 |
| « Joindre un justificatif » | [`components/probant/CloisonsWorkspace.tsx`](../../components/probant/CloisonsWorkspace.tsx) | 530 |
| « Justificatif » | [`components/probant/FindingPanel.tsx`](../../components/probant/FindingPanel.tsx) | 219 |

**Cas limite distinct** : les boutons *Valider / Accepter / Écarter* possèdent
bien un `onClick`, mais la décision n'est stockée que dans un `useState` local
(`CloisonsWorkspace.tsx:823`, `FindingPanel.tsx:40`) — **perdue au moindre
rechargement**, et jamais envoyée à une API. Fonctionnellement, le workflow de
revue humaine n'existe pas encore. À traiter en **PR-07**.

---

## 9. État des modules `lib/`

| Module | Fichiers | Tests | Constat |
|---|---|---|---|
| `lib/canonical-model` | 6 + index | **1** fichier / 8 tests (`document.test.ts`) | `fec.ts`, `finding.ts`, `dossier.ts`, `taxonomy.ts` **non testés** |
| `lib/rules-engine` | `runner.ts`, `types.ts`, 3 registres | **0** | **15 règles au total** : 10 `hardLaw`, 3 `methodology`, 2 `internal`. Aucune n'a de test — alors que le README annonce « tests des règles » |
| `lib/fec` | `parser.ts` (5 exports) | **0** | Cœur d'ingestion FEC non testé : `detectSeparateur`, `parseMontant`, `parseFec`, `headerConformite` |
| `lib/balance` | `parse-xlsx.ts`, `types.ts`, `validate.ts` | **0** | `parseBalanceFile` charge `xlsx` **en dynamic import côté navigateur** (`parse-xlsx.ts:21`) ; appelé par `DepotView.tsx:229` |
| `lib/pdf` | `parse-liasse.ts` | **0** | `parseLiasseFile` via `pdfjs-dist` ; appelé par `DepotView.tsx:235` |
| `lib/rapprochement` | 27 fichiers | **2** / 23 tests | Moteur cycle-agnostique + 14 jeux de démo |
| `lib/referentiel` | `sources.ts` | **0** | **24** sources en TypeScript |
| `lib/risk-mapping` | 12 fichiers | **3** / 42 tests | Le module le mieux couvert |
| `lib/audit-cycles` | 6 fichiers | **4** / 30 tests | Chargement + validation des YAML |
| `lib/audit` | `materiality.ts` | **1** / 12 tests | ISA 320 simplifiée |
| `lib/evidence` | `hash.ts`, `export.ts` | **0** | Empreintes et `ReviewPack` non testés |
| `lib/demo` | `dataset.ts` (1204 l.), `scenarios.ts` (706 l.), `tour.ts` (393 l.) | **0** | 2 303 lignes de fixtures |
| `lib/server-store` | 3 fichiers | **0** | Stores mémoire |
| `lib/analytics` | `track.ts` | **0** | Fire-and-forget vers `/api/analytics/events` |

### 9.1 Deux registres normatifs concurrents

| Registre | Fichier | Entrées | Consommé par |
|---|---|---|---|
| TypeScript | [`lib/referentiel/sources.ts`](../../lib/referentiel/sources.ts) | **24** | Moteur de règles + `/dashboard/referentiel` |
| YAML | [`data/sources/*.yml`](../../data/sources) | **88** | `/normatif/*` via `lib/audit-cycles/loader.ts` |

`lib/referentiel/sources.ts:5-6` affirme être « la **SEULE** source de vérité des
références et citations ». **C'est factuellement faux** au commit audité : les
88 sources YAML alimentent 88 pages SSG `/normatif/sources/[slug]`. → **P1-1**.

---

## 10. Tests

| | Valeur |
|---|---|
| Fichiers de test | **11** |
| Tests | **115**, tous passants |
| Configuration | [`vitest.config.ts`](../../vitest.config.ts) — `environment: "node"`, `include: ["lib/**/*.test.ts", "lib/**/__tests__/**/*.test.ts"]` |

| Fichier | Tests |
|---|---|
| `lib/risk-mapping/__tests__/scoring.test.ts` | 18 |
| `lib/rapprochement/__tests__/engine.test.ts` | 14 |
| `lib/risk-mapping/__tests__/graph.test.ts` | 13 |
| `lib/audit/__tests__/materiality.test.ts` | 12 |
| `lib/risk-mapping/__tests__/attach.test.ts` | 11 |
| `lib/audit-cycles/__tests__/loader.test.ts` | 11 |
| `lib/rapprochement/__tests__/cycles.test.ts` | 9 |
| `lib/canonical-model/__tests__/document.test.ts` | 8 |
| `lib/audit-cycles/__tests__/validation.test.ts` | 8 |
| `lib/audit-cycles/__tests__/export.test.ts` | 6 |
| `lib/audit-cycles/__tests__/search.test.ts` | 5 |

**Le pattern `include` exclut de fait `app/` et `components/`** : aucun test ne
peut exister pour la Synthèse tant que ce pattern n'est pas élargi.

---

## 11. Dépendances à risque

Versions **réellement résolues** dans [`package-lock.json`](../../package-lock.json)
(`lockfileVersion: 3`) après le patch de PR-00.

| Paquet | Avant PR-00 | Après PR-00 | Sévérité | Statut |
|---|---|---|---|---|
| `next` | 15.5.19 | **15.5.23** | high | ✅ **Corrigé par PR-00**. Les 8 avis GitHub concernant Next étaient tous marqués `<15.5.21` ; 15.5.23 est le dernier patch de la branche 15.5 |
| `xlsx` | 0.18.5 | **0.18.5** | high | 🔴 **P0-1** — `fixAvailable: false`. Aucun correctif publié sur le registre npm |
| `js-yaml` | 4.3.0 | 4.3.0 | high | 🟠 **P1-2** — correctif disponible en 4.3.1 |
| `postcss` | transitif | transitif | high | 🟠 **P1-2** |
| `nanoid` | transitif | transitif | high | 🟠 **P1-2** |
| `sharp` | transitif (via `next`) | transitif | high | 🟠 **P1-2** |
| `@tailwindcss/postcss` | 4.3.1 | 4.3.1 | moderate | 🟠 **P1-2** |

`npm audit` rapporte **7 vulnérabilités (1 moderate, 6 high)** avant comme après
le patch Next : le correctif Next se répercute sur les avis `next` eux-mêmes mais
`npm audit` continue de signaler les paquets transitifs. Cette valeur est le
**baseline documenté** (voir `DECISION_LOG.md` § D-003).

### Détail `xlsx@0.18.5`

- Avis : *Prototype Pollution in sheetJS* (GHSA-4r6h-8v6p-xvw6) et *ReDoS*
  (GHSA-5pgg-2g8v-p4x9), plage vulnérable `*`, `fixAvailable: false`.
- Surface d'exposition réelle : [`lib/balance/parse-xlsx.ts:20-25`](../../lib/balance/parse-xlsx.ts),
  qui parse un fichier **fourni par l'utilisateur**, **dans le navigateur**
  (`await import("xlsx")`, `XLSX.read(buf, { type: "array" })`).
- **Aucun patch isolé trivial n'existe** : le registre npm ne publie aucune
  version corrigée. Le remplacement de bibliothèque modifierait la logique de
  parsing — hors périmètre de PR-00. → **blocage P0 documenté, porté par PR-03**
  (ADR-003 requis).

---

## 12. Configuration et outillage

| Élément | État au commit audité | Après PR-00 |
|---|---|---|
| [`next.config.ts`](../../next.config.ts) | `reactStrictMode`, `outputFileTracingIncludes: {"/**": ["./data/**/*"]}`, alias webpack `canvas: false` | **Inchangé** |
| [`tsconfig.json`](../../tsconfig.json) | `strict: true`, `target ES2022`, `moduleResolution: bundler`, alias `@/*` | **Inchangé** |
| Script de lint | `next lint` — **déprécié en 15.5, supprimé en 16** | `eslint` (ESLint CLI 9) |
| Configuration ESLint | **absente** — `npm run lint` échouait en exit 1 (`ESLint must be installed`) | [`eslint.config.mjs`](../../eslint.config.mjs) créé |
| `middleware.ts` | **absent** (racine et `app/`) | inchangé |
| Auth / proxy | **aucun** | inchangé |
| `.github/workflows/` | **absent** | [`ci.yml`](../../.github/workflows/ci.yml) créé |
| Champ `engines` dans `package.json` | **absent** | absent — **P2-3** |

### Avertissement de build persistant

```
⚠ Warning: Next.js inferred your workspace root, but it may not be correct.
We detected multiple lockfiles and selected the directory of
C:\Users\Ludo\pnpm-lock.yaml as the root directory.
```

Cet avertissement est apparu avant **et** après le patch. Il vient de
l'environnement de développement local (un `pnpm-lock.yaml` situé au-dessus du
dépôt), pas du dépôt lui-même. Il **n'apparaîtra pas** en CI GitHub Actions, où
le checkout est isolé. Correction possible : `outputFileTracingRoot` dans
`next.config.ts` → **P2-2**, non appliqué ici pour ne pas modifier la config de
build dans un PR de cartographie.

---

## 13. P0 / P1 / P2

### P0 — bloquants

| # | Sujet | Preuve | Statut | Porté par |
|---|---|---|---|---|
| **P0-1** | `xlsx@0.18.5` — prototype pollution + ReDoS sur fichier utilisateur, **sans correctif publié** | `package-lock.json` ; `npm audit` → `fixAvailable: false` ; usage en `lib/balance/parse-xlsx.ts:21` | 🔴 **Ouvert — blocage documenté** | **PR-03** (ADR-003) |
| **P0-2** | Next.js sur un patch de sécurité obsolète (15.5.19) | 8 avis GHSA `<15.5.21` | ✅ **Résolu par PR-00** → 15.5.23 | — |
| **P0-3** | Aucune CI — 8 PR structurants sans barrière de non-régression | `.github/` absent | ✅ **Résolu par PR-00** | — |
| **P0-4** | Trois sources de vérité concurrentes : `DEMO_DOSSIER` (8 imports), `sessionStorage` (8 clés), stores mémoire (3) | § 3, § 4, § 5 | 🔴 Ouvert | **PR-02** |
| **P0-5** | `/api/depot` matérialise le fichier entier en mémoire (`await file.text()`) **puis** parse dans la requête HTTP ; le plafond `MAX_ENTRIES_RETURNED` s'applique **après** parsing | `app/api/depot/route.ts:30-50` | 🔴 Ouvert | **PR-03** |
| **P0-6** | Lint inopérant : `npm run lint` sortait en **exit 1** | `ESLint must be installed: npm install --save-dev eslint` | ✅ **Résolu par PR-00** | — |

> La numérotation P0-1 → P0-5 est celle déjà fixée par
> [`docs/refonte/SUIVI_AVANCEMENT.md`](../refonte/SUIVI_AVANCEMENT.md) § 4.
> **P0-6 est ajouté par PR-00** : le lint inopérant n'avait pas été identifié
> lors de l'audit initial, faute d'exécution.

### P1 — importants

| # | Sujet | Preuve | Porté par |
|---|---|---|---|
| **P1-1** | Deux registres normatifs concurrents (24 sources TS vs 88 sources YAML) ; le fichier TS se déclare à tort « seule source de vérité » | § 9.1 | **PR-01** / **PR-04** |
| **P1-2** | 6 vulnérabilités résiduelles avec correctif disponible (`js-yaml`, `postcss`, `nanoid`, `sharp`, `@tailwindcss/postcss`) | `npm audit` | **PR-08** (hardening) |
| **P1-3** | Le moteur de règles (15 règles) et le parser FEC n'ont **aucun test** | § 9 | **PR-01** |
| **P1-4** | La Synthèse embarque son moteur de calcul dans le JSX (825 l.), avec `52`, `WSEV` et les paliers 60/40/20 non testés ni sourcés | § 6, § 7 | **PR-05** |
| **P1-5** | 4 boutons visibles sans handler métier + workflow Valider/Écarter non persisté | § 8 | **PR-06** (boutons) / **PR-07** (workflow) |
| **P1-6** | `vitest.config.ts` n'inclut que `lib/**` : `app/` et `components/` sont hors couverture par construction | § 10 | **PR-05** |

### P2 — à traiter en passant

| # | Sujet | Preuve |
|---|---|---|
| **P2-1** | Constantes dupliquées au lieu d'être importées : `DEMO_DOSSIER_ID` (`useRiskAdjustments.ts:41`), `LIVE_FINDINGS_KEY` / `LIVE_ADMISSIBILITE_KEY` (`RiskMappingView.tsx:54-55`) |
| **P2-2** | Avertissement de build « multiple lockfiles » — `outputFileTracingRoot` non défini |
| **P2-3** | Aucun champ `engines` dans `package.json` : la version de Node n'est contractualisée nulle part |
| **P2-4** | 9 avertissements ESLint résiduels (8 `no-unused-vars`, 1 `react-hooks/exhaustive-deps` dans `useRiskAdjustments.ts:173`) |
| **P2-5** | `lib/server-store/adjustments-store.ts:114-125` : l'historique ne porte pas de `dossierId` propre ; le filtre par dossier passe par les ajustements *encore* rattachés — un ajustement supprimé rend son historique invisible |

---

## 14. Divergences README ↔ code

| # | README | Réalité vérifiée |
|---|---|---|
| 1 | « **Les six écrans** » (l. 24) puis 6 puces | **7 routes** sous `/dashboard`. « Cartographie des risques » (`/dashboard/risques`, présente dans `Sidebar.tsx:21`) n'est pas listée |
| 2 | « `npm run test` # **tests des règles** (Vitest) » (l. 21) | **Aucun test** ne couvre `lib/rules-engine`. Les 115 tests portent sur `risk-mapping`, `rapprochement`, `audit-cycles`, `audit`, `canonical-model` |
| 3 | À faire : « **Formats XLSX/CSV de balance et PDF de liasse** » (l. 112) | Déjà implémentés : `lib/balance/parse-xlsx.ts`, `lib/pdf/parse-liasse.ts`, câblés dans `DepotView.tsx:229,235` |
| 4 | À faire : « Tests unitaires Vitest **par règle** » (l. 113) | Cohérent avec le constat 2 — mais contredit la promesse de la l. 21 |
| 5 | Tableau des couches (l. 9-13) | Ne mentionne ni `lib/rapprochement` (27 fichiers) ni `lib/risk-mapping` (12 fichiers), deux modules majeurs |
| 6 | « Stack » (l. 92) : « Next.js 15 » | Exact, mais la version de patch n'est pas contractualisée. Résolu : `^15.5.23` |
| 7 | Section « Démarrer » (l. 17-22) | N'indique pas `npm run lint` — qui, au commit audité, échouait |

Les points **1, 2, 3 et 7** sont des **contradictions factuelles** : ils sont
corrigés dans le README par ce PR. Les points 4, 5 et 6 sont des omissions ou
des imprécisions ; 5 est également corrigé.
