# PROBANT — suivi d'avancement de la refonte

> Tableau de bord d'exécution du plan décrit dans [`PLAN_REFONTE.md`](./PLAN_REFONTE.md).
> **Le plan ne bouge pas ; ce document bouge.** Toute PR de la séquence PR-00 → PR-08
> doit mettre à jour ce fichier dans le même commit que son travail.

| | |
|---|---|
| Dernière mise à jour | 14/08/2026 |
| État global | **PR-00 → PR-06 fusionnés · PR-07 en cours** — historique de revue et dossier de preuve reproductible |
| Prochaine action | Revue de PR-07, puis PR-04 (référentiel/crosswalks) — la revue métier R-01 à R-03 de [`docs/knowledge/REVIEW_REQUIRED.md`](../knowledge/REVIEW_REQUIRED.md) reste ouverte |

---

## 1. Comment utiliser ce document

1. Avant d'ouvrir une PR de la séquence, lire la ligne correspondante du § 3 et vérifier
   que ses **prérequis** sont `Fusionné`.
2. Pendant la PR, mettre à jour le statut, la branche et les cases du § 5.
3. À la fin de la PR, coller le bloc **PR GATE** rempli (§ 6) dans la description de la PR
   **et** ajouter une ligne au journal (§ 7).
4. Ne jamais marquer un contrôle vert sans l'avoir exécuté. `NON EXÉCUTÉ` est une réponse
   valide ; un faux vert ne l'est pas.

### Légende des statuts

| Symbole | Signification |
|---|---|
| ⬜ **À faire** | Pas commencé |
| 🟦 **En cours** | Branche ouverte, travail en cours |
| 🟨 **En revue** | PR ouverte, en attente de revue / CI |
| ✅ **Fusionné** | Mergé sur `main`, CI verte |
| 🟥 **Bloqué** | Dépendance ou décision manquante — voir § 4 |
| ⏸️ **Reporté** | Sorti du lot courant, décision consignée |

---

## 2. État de départ vérifié (baseline)

Constaté dans le dépôt au 13/08/2026, avant tout PR de la séquence.

| Élément | Valeur observée | Où |
|---|---|---|
| `next` résolu | **15.5.19** | `package-lock.json` |
| `next` déclaré | `^15.1.6` | `package.json` |
| `xlsx` résolu | **0.18.5** | `package-lock.json` — 🔴 P0 |
| `react` résolu | 19.2.7 | `package-lock.json` |
| Script de lint | `next lint` (déprécié en 15.5, supprimé en 16) | `package.json` |
| Répertoire `docs/` | **absent** avant ce dépôt | racine |
| Répertoire `.github/workflows/` | **absent** | racine |
| CI GitHub Actions | **aucune** | — |

Baseline de build reprise de l'audit (**valeurs de build Vercel, pas des métriques de terrain**,
à re-mesurer et à figer en PR-00) : 145 pages statiques ; `/dashboard/synthese` ≈ 137 kB de
First Load JS ; `/dashboard/risques` ≈ 207 kB.

---

## 3. Tableau de bord PR-00 → PR-08

| PR | Objet | Prérequis | Statut | Branche / PR | Charge indicative | Risque |
|---|---|---|---|---|---:|---|
| **PR-00** | Cartographie + patch maintenance + **CI minimale** | — | ✅ Fusionné | [#30](https://github.com/ludoviclabs-dotcom/PROBANT/pull/30) | 0,5–1 j | Faible |
| **PR-01** | Gouvernance des sources et modèle de connaissance | PR-00 | ✅ Fusionné | [#31](https://github.com/ludoviclabs-dotcom/PROBANT/pull/31) (gouvernance) + [#37](https://github.com/ludoviclabs-dotcom/PROBANT/pull/37) (contenus) | 1,5–2,5 j | Moyen |
| **PR-02** | Dossier unique — fin de la divergence DEMO / réel | PR-00 | ✅ Fusionné | [#32](https://github.com/ludoviclabs-dotcom/PROBANT/pull/32) | 1,5–3 j | Élevé |
| **PR-03** | Ingestion, persistance, stockage objet, remplacement XLSX | PR-02 | ✅ Fusionné | [#36](https://github.com/ludoviclabs-dotcom/PROBANT/pull/36) | 4–7 j | **Très élevé** |
| **PR-04** | Référentiel PCG / NEP / IFRS et crosswalks | PR-01 | ⬜ À faire | — | 3–6 j + revue métier | Élevé |
| **PR-05** | Moteur de Synthèse déterministe | PR-03, PR-04 | ✅ Fusionné | [#38](https://github.com/ludoviclabs-dotcom/PROBANT/pull/38) | 3–5 j | **Très élevé** |
| **PR-06** | Cockpit, infographies, accessibilité | PR-05 | ✅ Fusionné | [#39](https://github.com/ludoviclabs-dotcom/PROBANT/pull/39) | 2–4 j | Moyen |
| **PR-07** | Revue append-only, manifeste, exports | PR-05 | 🟦 En cours | `codex/pr-07-review-evidence` | 3–5 j | Élevé |
| **PR-08** | Auth, hardening, E2E, observabilité, release | PR-06, PR-07 | ⬜ À faire | — | 2–4 j | Élevé |
| PR-09+ | Tax Compliance Engine (IS / TVA) | PR-07 | ⏸️ Reporté | — | non estimé | — |

Total indicatif PR-00 → PR-08 : **20,5 à 37,5 jours d'ingénierie** — estimation, pas engagement.

### Critères de sortie par PR

| PR | Le PR est terminé quand… |
|---|---|
| PR-00 | CI minimale verte sur `main`, lint direct opérationnel, cartographie des sources de vérité publiée, P0/P1/P2 documentés, **aucune** modification fonctionnelle du dashboard |
| PR-01 | Sources versionnées et validées par Zod, aucune confusion NEP/ISA ni IASB/adoption UE, `REVIEW_REQUIRED.md` exhaustif |
| PR-02 | Zéro import direct de `DEMO_DOSSIER` dans les pages métier, zéro lecture directe de `sessionStorage` dans les restitutions, une seule source de vérité, démo inchangée |
| PR-03 | Plus de `xlsx@0.18.5` dans le lockfile, upload direct vers le stockage objet, jobs idempotents, migrations reproductibles, mode persistant **fail-closed** sans identité, pagination du ledger |
| PR-04 | Les 35 cycles existants ne régressent pas, couverture documentée, aucune règle inventée, revue métier explicitement demandée là où nécessaire |
| PR-05 | Aucun calcul métier majeur dans le JSX, `même input ⇒ même snapshot hash`, exposition dédupliquée testée, limitations visibles |
| PR-06 | Aucune divergence graphique / snapshot, alternative tabulaire partout, `prefers-reduced-motion` respecté, aucun bouton factice |
| PR-07 | Historique append-only intact, hashes complets, manifeste complet, aucun label « PDF/A » non validé par un validateur |
| PR-08 | Auth et isolation inter-organisations testées, aucun `xlsx` vulnérable, RUM activé, limitations connues explicites, preview et production smoke-testés |

---

## 4. Blocages et décisions ouvertes

### P0 — à traiter immédiatement

| # | Sujet | État | Porté par | Détail |
|---|---|---|---|---|
| P0-1 | `xlsx@0.18.5` — pollution de prototype et ReDoS sur des fichiers externes. **`npm audit` : `fixAvailable: false`** — aucune version corrigée publiée | 🟥 **Ouvert — blocage documenté** | PR-00 (documentation ✅) → PR-03 (remplacement) | ADR-003 obligatoire avant remplacement |
| P0-2 | Next.js 15.5.19 — patch de sécurité plus récent disponible sur la branche 15.5 | ✅ **Résolu** — `15.5.23` | PR-00 | 8 avis GHSA corrigés en 15.5.21 ; **pas** de migration 16 |
| P0-3 | Aucune CI — sept PR structurants sans barrière de non-régression | ✅ **Résolu** | PR-00 | `.github/workflows/ci.yml` : `npm ci` → lint → typecheck → test → build |
| P0-4 | Trois sources de vérité (`DEMO_DOSSIER`, `sessionStorage`, stores en mémoire) | ⬜ Ouvert | PR-02 | Défaut fonctionnel majeur. Chiffré en PR-00 : **8** imports directs, **8** clés `sessionStorage`, **3** stores |
| P0-5 | `/api/depot` matérialise le fichier entier puis parse dans la requête HTTP | ⬜ Ouvert | PR-03 | Limite de volumétrie appliquée **après** parsing |
| P0-6 | `npm run lint` inopérant — ESLint non installé, sortie en **exit 1** | ✅ **Résolu** | PR-00 | `next lint` → ESLint CLI 9 (`eslint.config.mjs`) |

### Décisions d'architecture en attente (ADR)

| ADR | Sujet | Décidé dans | Statut |
|---|---|---|---|
| ADR-001 | Identité de dossier et routage (`dossierId`) | PR-02 | ⬜ À rédiger |
| ADR-002 | Stockage objet — Vercel Private Blob vs S3 + Object Lock | PR-03 | ✅ Rédigée (`docs/adr/ADR-002-object-storage.md`) |
| ADR-003 | Lecteur XLSX — SheetJS CE / ExcelJS / read-excel-file | PR-03 | ✅ Rédigée (`docs/adr/ADR-003-xlsx-reader.md`) |
| ADR-004 | Schéma PostgreSQL / Drizzle | PR-03 | ✅ Rédigée (`docs/adr/ADR-004-database-schema.md`) |
| ADR-005 | Runtime d'ingestion — jobs, retry, idempotence, limites | PR-03 | ✅ Rédigée (`docs/adr/ADR-005-ingestion-runtime.md`) |
| ADR-006 | Déterminisme de la Synthèse — canonical JSON, traces, hash | PR-05 | ⬜ À rédiger |
| ADR-007 | AuthN / AuthZ — OIDC, sessions, rôles, isolation | PR-08 (préparé en PR-03) | ⬜ À rédiger |
| ADR-008 | PDF/A et PAdES | PR-07 | ✅ Rédigée (`docs/adr/ADR-008-pdf-a-pades.md`) |

---

## 5. Livrables documentaires

Le plan liste les fichiers Markdown exacts à produire. Cocher au fur et à mesure.

### Architecture — PR-00

- [x] `docs/architecture/PROBANT_MASTER_CONTEXT.md`
- [x] `docs/architecture/CURRENT_STATE_MAP.md`
- [x] `docs/architecture/TARGET_ARCHITECTURE.md`
- [x] `docs/architecture/DATA_FLOW.md`
- [x] `docs/architecture/PR_ROADMAP.md`
- [x] `docs/architecture/DECISION_LOG.md`
- [x] `.github/workflows/ci.yml`

### ADR

- [ ] `docs/adr/ADR-001-dossier-identity-routing.md`
- [ ] `docs/adr/ADR-002-object-storage.md`
- [ ] `docs/adr/ADR-003-xlsx-reader.md`
- [ ] `docs/adr/ADR-004-database-schema.md`
- [ ] `docs/adr/ADR-005-ingestion-runtime.md`
- [ ] `docs/adr/ADR-006-synthesis-determinism.md`
- [ ] `docs/adr/ADR-007-authn-authz.md`
- [x] `docs/adr/ADR-008-pdf-a-pades.md`

### Connaissance — PR-01 / PR-04

- [ ] `docs/knowledge/SOURCE_POLICY.md` — non livré par PR-01 (cf. journal)
- [x] `docs/knowledge/COVERAGE_REPORT.md`
- [x] `docs/knowledge/REVIEW_REQUIRED.md`

### Ingestion, UX, preuve — PR-03 / PR-06 / PR-07

- [ ] `docs/ingestion/INGESTION_LIMITS.md`
- [ ] `docs/ux/VISUALIZATION_CONTRACTS.md`
- [ ] `docs/ux/ACCESSIBILITY_RULES.md`
- [x] `docs/evidence/MANIFEST_SPEC.md`
- [x] `docs/evidence/EXPORT_FORMATS.md`

### Release — PR-08

- [ ] `docs/release/READINESS_REPORT.md`
- [ ] `docs/release/SOURCE_AUDIT.md`
- [ ] `docs/release/TEST_REPORT.md`
- [ ] `docs/release/PERFORMANCE_REPORT.md`
- [ ] `docs/release/ACCESSIBILITY_REPORT.md`
- [ ] `docs/release/KNOWN_LIMITATIONS.md`

---

## 6. Bloc PR GATE — à remplir à chaque PR

À coller dans la description de chaque PR de la séquence, complété et honnête.

```text
PR GATE

Ne prétends jamais qu'un contrôle est vert sans l'avoir exécuté.

Commit/base SHA:
Files changed:

npm ci:            PASS / FAIL / NOT RUN
npm run lint:      PASS / FAIL / NOT RUN
npm run typecheck: PASS / FAIL / NOT RUN
npm test:          PASS / FAIL / NOT RUN
npm run build:     PASS / FAIL / NOT RUN

Tests ajoutés:
Tests supprimés:
Migrations:
Breaking changes:
Known limitations:
UNVERIFIED assumptions:

Manual verification performed:
Screenshots:
Vercel preview:
Rollback procedure:

Décision recommandée:
MERGE / DO NOT MERGE
```

---

## 7. Journal

Une ligne par événement structurant. Le plus récent en haut.

| Date | Événement | Réf. |
|---|---|---|
| 14/08/2026 | **PR-07** — événements de revue append-only chaînés par SHA-256, snapshots immuables, manifeste versionné et exports reproductibles (JSON canonique, 4 CSV, HTML accessible/imprimable et PDF dérivé sans revendication PDF/A). Garde de contexte DEMO/persistant, limitations de preuve, contrôles d'intégrité et migration PostgreSQL protégée par triggers. 274 tests au total ; build et rendu PDF vérifiés | branche `codex/pr-07-review-evidence` |
| 14/08/2026 | **PR-06** — restitution Synthèse refondée sur VisualizationDataset (`lib/visualization`) : 14 composants (décision/analyse/exploration, matrice FEC 18 zones, waterfall, heatmap cloison×assertion, pyramide normative, frise, chaîne de preuve), contrat « aucun composant ne recompte les findings » testé, alternative tabulaire sous chaque graphique, axe-core sans violation, reduced-motion, plus de compteur à zéro ni pulsation infinie, responsive vérifié à 5 viewports sans overflow. +25 tests (258 au total) | branche `claude/probant-synthese-ui` |
| 14/08/2026 | **PR-05** — moteur de Synthèse pur (`lib/synthesis`) : SynthesisSnapshot 5 dimensions sans score composite, exposition sur effets financiers EXPLICITES (fin de la présomption |constaté−seuil|), déduplication 5 étapes (clé stable, graphe, clusters, politique, ambiguïté→revue), centimes entiers, JSON canonique + SHA-256 pur (hash identique navigateur/Node vérifié), 8 limitations générées, note de synthèse déterministe sans LLM (bouton fonctionnel), verdict catégoriel — plus de « exploitable » sans couverture/admissibilité. Page Synthèse = projection du snapshot, calcul métier hors JSX. 39 tests moteur, 233 au total | branche `claude/probant-synthesis-engine` |
| 14/08/2026 | **PR-01** — plan de connaissance : `data/{fec,nep,ifrs,pcg,crosswalks,statistics}`, schémas Zod + 8 contrôles d'intégrité (`lib/knowledge`), 32 tests. **Les 18 zones du FEC sont vérifiées à l'article A47 A-1 et identiques à `FEC_COLUMNS`.** Écart majeur détecté : `R-HL-006/007/008` classées `hardLaw` sans fondement établi — **moteur non modifié**, écart documenté. 21 fichiers ajoutés, **0 modifié** | branche `claude/probant-knowledge-base-pr01` |
| 13/08/2026 | **PR-00** — cartographie vérifiée publiée (`docs/architecture/`, 6 documents), CI minimale créée, `next` 15.5.19 → **15.5.23**, `next lint` → **ESLint CLI 9**. Aucun fichier de `app/`, `components/`, `lib/`, `data/` modifié. P0-2, P0-3, P0-6 résolus ; **P0-1 (`xlsx`) reste un blocage documenté** — `fixAvailable: false` | branche `claude/probant-mapping-regression-b53f40`, base `e61ae74` |
| 13/08/2026 | Dépôt du plan de refonte et création de ce suivi | branche `claude/probant-refonte-document` |

---

## 8. Critère de réussite global

La refonte n'est pas terminée quand les graphiques sont plus beaux, mais quand chaque chiffre
du dashboard peut répondre à quatre questions :

1. **D'où vient-il ?** — document identifié, SHA-256, ligne ou page.
2. **Comment a-t-il été calculé ?** — trace de calcul, entrées, exclusions, arrondi.
3. **Quelle version de règle l'a produit ?** — `ruleSetVersion`, `referenceSetVersion`, `policyVersion`.
4. **Qu'est-ce qui pourrait rendre la conclusion incomplète ?** — limitations explicites.
