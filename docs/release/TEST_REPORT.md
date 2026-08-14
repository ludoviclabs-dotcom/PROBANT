# Rapport de tests — PR-08

| | |
|---|---|
| Date d'exécution | 14/08/2026 |
| Branche | `claude/release-candidate-prep-9779c7` |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |
| Machine | Windows 10 · Node v24.14.0 · npm 11.9.0 |

**Convention de statut** : `PASS` · `PASS_WITH_LIMITATIONS` · `FAIL` · `NOT_TESTED`.
Un contrôle non exécuté est écrit `NOT_TESTED`. Il n'est jamais écrit `PASS`.

---

## 1. Synthèse

| Contrôle | Commande | Statut | Résultat mesuré |
|---|---|---|---|
| Installation reproductible | `npm ci` | **PASS** | Lockfile et manifeste alignés |
| Lint | `npm run lint` | **PASS** | 0 erreur, 9 avertissements (préexistants) |
| Typage | `npm run typecheck` | **PASS** | Aucune sortie |
| Tests unitaires et d'intégration | `npm test` | **PASS** | **438 tests · 41 fichiers · 0 échec** |
| Build production | `npm run build` | **PASS** | 145 pages statiques générées |
| E2E Playwright | `npm run test:e2e` | **PASS_WITH_LIMITATIONS** | **18 passés · 1 ignoré** (parcours durable) |
| Accessibilité axe-core | inclus dans les E2E | **PASS_WITH_LIMITATIONS** | 0 critique · dette « serious » gelée |
| Audit de dépendances | `npm audit --audit-level=high` | **PASS** | **0 vulnérabilité** (7 avant PR-08) |
| Migrations aller-retour | job CI `migrations` | **NOT_TESTED** | Exige PostgreSQL ; non exécuté localement |
| CodeQL | job CI `codeql` | **NOT_TESTED** | S'exécute sur GitHub Actions uniquement |
| Secret scan | job CI `secret-scan` | **NOT_TESTED** | Idem |
| Lighthouse CI | job CI `lighthouse` | **NOT_TESTED** | Idem |

---

## 2. Tests unitaires — évolution

| | Avant PR-08 | Après PR-08 | Δ |
|---|---:|---:|---:|
| Fichiers de test | 30 | **41** | +11 |
| Tests | 259 | **438** | **+179** |

> Note : la mesure « avant » relevait 259 tests **et une erreur non gérée** — le
> module `jsdom` manquait dans l'arbre installé. PR-08 corrige aussi cela
> (`vitest.config.ts` résout `server-only` vers son module vide, comme Next.js
> le fait dans un Server Component).

### Suites ajoutées

| Fichier | Tests | Ce qu'il prouve |
|---|---:|---|
| `lib/auth/__tests__/jwt.test.ts` | 12 | Vérification JWS réelle : RS256/ES256/PS256 signés à la volée, refus de `alg:none`, de HS256, d'une charge modifiée, d'une clé de type incompatible |
| `lib/auth/__tests__/oidc-client.test.ts` | 23 | Flux complet contre un IdP factice : PKCE S256, cache de découverte, `iss`/`aud`/`azp`/`exp`/`nonce`, rotation de clés, temporisation anti-amplification |
| `lib/auth/__tests__/session.test.ts` | 28 | Scellement AES-256-GCM, attributs de cookie, expiration glissante **et** plafond absolu, CSRF, contrôle d'origine, `completeLogin` de bout en bout |
| `lib/auth/__tests__/isolation.test.ts` | 14 | **Tests négatifs inter-organisations** — voir § 3 |
| `lib/auth/__tests__/mfa.test.ts` | 7 | Politique `acr`/`amr`, régimes `required` / `audit_only`, configuration incomplète bloquante |
| `lib/auth/__tests__/roles.test.ts` | 12 | Matrice de permissions, alias `uploader` → `preparer`, rôle inconnu sans effet |
| `lib/security/__tests__/headers.test.ts` | 13 | CSP Report-Only par défaut, directives verrouillées, `unsafe-eval` absent en production |
| `lib/security/__tests__/upload-hardening.test.ts` | 16 | Neutralisation de nom de fichier, magic bytes, lecture d'en-tête sans matérialiser le flux |
| `lib/ingestion/__tests__/quota.test.ts` | 11 | Rate limit, quota volumétrique, fenêtres, non-consommation en cas de refus |
| `lib/observability/__tests__/logger.test.ts` | 12 | **Aucun libellé comptable dans les logs** — voir § 5 |
| `lib/performance/__tests__/web-vitals.test.ts` | 16 | Budgets P75, classification des pages, contrat d'ingestion RUM |

---

## 3. Tests négatifs d'isolation — exigence de release

Les quatre scénarios exigés sont couverts **nommément**, sur les deux chemins
d'authentification.

| Scénario exigé | Test | Statut | Code de refus |
|---|---|---|---|
| org A ne peut jamais lire dossier B | `refuse lecture du dossier d'une autre organisation` | **PASS** | `DOSSIER_NOT_FOUND` (403) |
| download cross-org interdit | `refuse téléchargement du ledger d'une autre organisation` | **PASS** | `DOSSIER_NOT_FOUND` |
| export cross-org interdit | `refuse export du dossier d'une autre organisation` | **PASS** | `DOSSIER_NOT_FOUND` |
| job cross-org interdit | `refuse job d'ingestion d'une autre organisation` | **PASS** | `DOSSIER_NOT_FOUND` |

Contrôles complémentaires du même fichier :

- un contexte signé **authentique** (signature HMAC valide) qui revendique le
  dossier d'une autre organisation est refusé — la signature prouve l'origine,
  pas le périmètre ;
- un dossier absent de la liste accordée est refusé (`DOSSIER_FORBIDDEN`) ;
- une signature falsifiée et un contexte expiré sont refusés en 401 ;
- **un dossier inexistant et le dossier d'une autre organisation renvoient le
  même code** : sans cela, l'écart de réponse permettrait d'énumérer les
  dossiers du voisin ;
- séparation des rôles : `preparer` ne décide pas, `reviewer` ne dépose pas,
  `signer` ne fait ni l'un ni l'autre, `admin` cumule **sans franchir**
  la frontière d'organisation.

---

## 4. E2E — quatre parcours

| Parcours | Fichier | Statut | Détail |
|---|---|---|---|
| **1 — DEMO** : ouvrir → filtrer → constat → décision → note → export | `e2e/demo-journey.spec.ts` | **PASS** | 4 tests |
| **2 — FEC valide** : upload → job → qualité → synthèse → empreinte → décision → export | `e2e/fec-persistent.spec.ts` | **NOT_TESTED** | Ignoré : exige PostgreSQL + S3 + SQS + IdP |
| **3 — FEC invalide** : rejet explicable → diagnostic → aucun contrôle métier incohérent | `e2e/fec-rejection.spec.ts` | **PASS** | 3 tests |
| **4 — Dossier partiel** : couverture partielle → limitations → aucune conclusion excessive | `e2e/partial-coverage.spec.ts` | **PASS** | 4 tests |
| Accessibilité des 7 pages mesurées | `e2e/accessibility.spec.ts` | **PASS_WITH_LIMITATIONS** | 7 tests |

### Pourquoi le parcours 2 n'est pas simulé

Il aurait été possible de le faire passer en CI avec des adaptateurs factices.
Cela aurait produit une **fausse assurance sur la chaîne la plus critique du
produit** : upload direct, job durable, contrôles versionnés, snapshot,
empreinte. Le test est écrit, exécutable, et gardé par
`PROBANT_E2E_PERSISTENT=1` ; tant qu'aucun environnement provisionné ne
l'exécute, son statut reste `NOT_TESTED`.

### Ce que le parcours 1 a révélé

Le dossier de démonstration porte **une alerte bloquante d'admissibilité**. La
Synthèse masque alors volontairement son journal d'analyse et affiche
« Dossier non admissible ». Le test a donc été écrit sur le comportement réel :
le filtrage et la sélection d'un constat s'exercent sur `/dashboard/cloisons`.
Un test qui aurait exigé le journal sur la Synthèse aurait demandé la
suppression de ce garde-fou.

Un test dédié verrouille désormais ce comportement :
`le garde-fou d'admissibilité masque l'analyse au lieu de conclure`.

---

## 5. Non-fuite dans les logs — contrôle explicite

`lib/observability/__tests__/logger.test.ts` vérifie que le journal structuré ne
peut pas transporter de données comptables :

- 18 noms de champs interdits (`ecritureLib`, `compteLib`, `tiers`,
  `fournisseur`, `accessToken`, `cookie`, `email`, `subject`…) sont absents de
  l'allowlist ;
- un champ inconnu est **supprimé silencieusement**, pas sérialisé ;
- un champ connu dont la valeur ne respecte pas son format est également retiré ;
- une ligne FEC complète passée en paramètre ne laisse **aucune** trace dans la
  sortie (`ACME`, `1200,00` absents).

L'allowlist est fermée : ajouter une clé à un appel de log ne suffit pas à la
faire apparaître.

---

## 6. Défaut corrigé en cours de campagne

| Défaut | Détection | Correction |
|---|---|---|
| `aria-required-children` (**impact critique**) sur `/dashboard/risques` | axe-core E2E, absent des tests de composants PR-06 | `role="rowheader"` déplacé sur le conteneur direct du `role="row"` dans `RiskMatrixHeatmap.tsx` — un div intermédiaire sans rôle rompait la règle ARIA |

Les tests de composants de PR-06 passaient : ils testaient des composants
isolés, pas la page assemblée. C'est la valeur ajoutée de l'axe E2E.

---

## 7. Ce qui reste non testé, et pourquoi

| Élément | Statut | Raison | Levée |
|---|---|---|---|
| Parcours FEC durable | `NOT_TESTED` | Aucune infrastructure persistante | Provisionner un environnement, exécuter avec `PROBANT_E2E_PERSISTENT=1` |
| Migrations aller-retour | `NOT_TESTED` localement | Exige PostgreSQL 17 | Le job CI `migrations` l'exécute à chaque PR |
| CodeQL, secret scan, Lighthouse | `NOT_TESTED` localement | Actions GitHub | Première exécution de la CI sur la PR |
| Protection de branche | `NOT_VERIFIED` | Non lisible depuis le dépôt | `gh api …/branches/main/protection` — cf. [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) |
| Régions Vercel | `NOT_VERIFIED` | Aucun jeton d'API fourni | `npm run verify:vercel` avec `VERCEL_API_TOKEN` |
| Core Web Vitals de terrain | `NOT_TESTED` | Le RUM est activé, aucun trafic collecté | Cf. [`PERFORMANCE_REPORT.md`](./PERFORMANCE_REPORT.md) |
