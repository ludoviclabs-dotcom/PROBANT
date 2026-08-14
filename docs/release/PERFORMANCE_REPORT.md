# Rapport de performance — PR-08

| | |
|---|---|
| Date | 14/08/2026 |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |

> **Distinction appliquée dans tout ce document.**
> Une **valeur de build** décrit un artefact. Une **mesure de laboratoire**
> décrit un environnement contrôlé. Une **mesure de terrain** décrit
> l'expérience réelle des utilisateurs. Seule la troisième permet de conclure
> sur les Core Web Vitals, et elle exige du trafic. Ces trois natures ne sont
> jamais mélangées ci-dessous.

---

## 1. Cibles de release

Seuils « good » des Core Web Vitals, évalués au **75ᵉ percentile**.

| Métrique | Cible P75 | Statut | Valeur de terrain |
|---|---:|---|---|
| LCP | ≤ **2,5 s** | **NOT_TESTED** | Aucune — collecte active, trafic nul |
| INP | ≤ **200 ms** | **NOT_TESTED** | Aucune |
| CLS | ≤ **0,1** | **NOT_TESTED** | Aucune |

**Pourquoi `NOT_TESTED` et non `PASS`.** Le RUM est activé et fonctionnel, mais
aucun utilisateur n'a encore chargé une page en production. Un P75 calculé sur
zéro échantillon n'est pas une performance : c'est une absence de mesure. Le
critère de release « CWV reportés, même si trafic encore insuffisant » est
satisfait par la présence du dispositif et par ce rapport, pas par des chiffres
inventés.

---

## 2. Dispositif RUM — ce qui est en place

| Élément | Statut | Détail |
|---|---|---|
| Collecte | **PASS** | `components/probant/WebVitalsReporter.tsx`, monté dans `app/layout.tsx` |
| Métriques collectées | **PASS** | LCP (`largest-contentful-paint`), INP (`event` + `first-input`), CLS (fenêtre glissante 1 s / 5 s) |
| Technologie | **PASS** | `PerformanceObserver` natif — **aucun connecteur SaaS**, conformément à la contrainte produit |
| Transport | **PASS** | `navigator.sendBeacon` vers `/api/rum`, repli `fetch(keepalive)` ; un seul envoi, au passage en `hidden` |
| Endpoint | **PASS** | `app/api/rum/route.ts` — contrat Zod fermé, réponse 204 systématique |
| Agrégation | **PASS** | `lib/performance/web-vitals.ts` — P75 par interpolation linéaire, 16 tests |
| Robustesse | **PASS** | Une erreur de télémétrie ne perturbe jamais la session de travail |

### Ce qui ne peut pas fuiter par cette route

La route est volontairement **non authentifiée** : les CWV de la page d'accueil
doivent être mesurables avant toute connexion. Elle est donc conçue pour ne rien
pouvoir transporter d'identifiant :

- le nom de métrique appartient à une énumération de trois valeurs ;
- la valeur est bornée (`0` … `3 600 000`) ;
- **la page est réduite côté navigateur à l'une des huit valeurs de
  `MEASURED_PAGES`** avant l'envoi : `/dashboard/<uuid>/synthese` devient
  `autre`, jamais l'identifiant de dossier ;
- un lot est limité à 20 échantillons ;
- toute charge non conforme reçoit 204 sans être journalisée.

Testé par `lib/performance/__tests__/web-vitals.test.ts` :
`réduit toute autre route à « autre » — aucun identifiant ne fuit`.

### Volume minimal avant de conclure

`MINIMUM_SAMPLES = 30` par couple page × métrique. En deçà, `summarize()`
retourne `insufficientData: true` : la valeur est publiée, jamais présentée
comme concluante.

---

## 3. Pages mesurées

Les sept pages demandées sont couvertes par la classification RUM, par les
budgets Lighthouse et par les tests d'accessibilité.

| Page | Route | RUM | Lighthouse | axe |
|---|---|:--:|:--:|:--:|
| landing | `/` | ✅ | ✅ | ✅ |
| depot | `/dashboard/depot` | ✅ | ✅ | ✅ |
| synthese | `/dashboard/synthese` | ✅ | ✅ | ✅ |
| risques | `/dashboard/risques` | ✅ | ✅ | ✅ |
| cloisons | `/dashboard/cloisons` | ✅ | ✅ | ✅ |
| referentiel | `/dashboard/referentiel` | ✅ | ✅ | ✅ |
| dossier preuve | `/dashboard/dossier` | ✅ | ✅ | ✅ |

---

## 4. Baseline de build — mesurée le 14/08/2026

**Valeurs d'artefact**, à comparer d'une PR à l'autre. Elles ne disent rien de
l'expérience réelle.

| Route | Taille de route | First Load JS |
|---|---:|---:|
| `/dashboard/risques` | 42,3 kB | **209 kB** |
| `/dashboard/synthese` | 29,8 kB | 186 kB |
| `/dashboard/depot` | 2,14 kB | 184 kB |
| `/dashboard/cloisons` | 19,1 kB | 183 kB |
| `/dashboard/dossier` | 3,37 kB | 163 kB |
| `/dashboard/referentiel` | 6,17 kB | 109 kB |
| Partagé par toutes les pages | — | 103 kB |
| Middleware | — | 34,8 kB |

Pages statiques générées : **145**.

### Évolution depuis la baseline d'audit (13/08/2026)

| Route | Audit initial | 14/08/2026 | Δ |
|---|---:|---:|---:|
| `/dashboard/synthese` | ~137 kB | 186 kB | **+49 kB** |
| `/dashboard/risques` | ~207 kB | 209 kB | +2 kB |

L'écart sur la Synthèse s'explique par PR-05 et PR-06 : moteur de synthèse
déterministe et quatorze composants de restitution, livrés entre les deux
mesures. Il n'est **pas** imputable au durcissement de PR-08, dont le seul ajout
côté client est le collecteur RUM. Le middleware (34,8 kB) s'exécute côté
serveur et n'entre pas dans le First Load JS.

Aucun budget de bundle n'est fixé ici : en fixer un sans corpus de mesure
serait inventer une contrainte. Ces valeurs constituent la référence de
comparaison pour la prochaine PR.

---

## 5. Lighthouse CI — laboratoire

| Contrôle | Statut | Détail |
|---|---|---|
| Configuration | **PASS** | `lighthouserc.json`, 7 URL, 3 exécutions, preset desktop |
| Exécution | **NOT_TESTED** | Job CI `lighthouse` ; non exécuté localement |
| Assertions bloquantes | — | LCP ≤ 2 500 ms, CLS ≤ 0,1 |
| Assertions d'alerte | — | Score performance ≥ 0,8, TBT ≤ 200 ms |

**INP n'est pas asserté** : cette métrique n'est pas mesurable en laboratoire.
Son proxy TBT l'est, et c'est lui qui est surveillé. Asserter un INP de
laboratoire donnerait un chiffre sans signification.

---

## 6. Métriques métier — SLI

Émises comme lignes de log structurées (`lib/observability/metrics.ts`), sans
SDK de télémétrie embarqué.

| Métrique exigée | Identifiant | Statut | Point d'émission |
|---|---|---|---|
| ingestion duration | `ingestion_duration_ms` | **PASS** | Disponible via `measure()` |
| rows/sec | `parse_rows_per_second` | **PASS** | `rowsPerSecond(lineCount, durationMs)` |
| job error rate | `job_error_rate` | **PASS_WITH_LIMITATIONS** | Dérivé par le collecteur depuis `outcome` ; non pré-agrégé côté application |
| control duration | `control_duration_ms` | **PASS** | Disponible via `measure()` |
| snapshot duration | `snapshot_build_duration_ms` | **PASS** | Disponible via `measure()` |
| export duration | `export_duration_ms` | **PASS** | **Câblé** sur `POST /api/export`, succès et échec |

**Aucun SLO chiffré n'est déclaré.** Le plan de refonte l'interdit
explicitement tant que le corpus de benchmark de PR-03 n'existe pas : annoncer
« un FEC de X lignes passe en Y secondes » sans l'avoir mesuré serait inventer
une capacité.

---

## 7. Ce qu'il faut faire pour passer de `NOT_TESTED` à `PASS`

1. Déployer en Production et laisser le RUM collecter jusqu'à **30 échantillons
   par page et par métrique**.
2. Agréger les lignes `event=web_vital` du flux de logs avec `summarize()`.
3. Reporter les P75 obtenus dans le § 1, avec le nombre d'échantillons et la
   période d'observation — un P75 sans son volume n'est pas un résultat.
4. Exécuter le job Lighthouse CI et joindre `.lighthouseci`.
5. Construire le corpus de benchmark d'ingestion (PR-03) **avant** de proposer
   le moindre SLO chiffré.
