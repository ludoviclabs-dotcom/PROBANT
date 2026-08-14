# Audit des sources et de la plateforme — PR-08

| | |
|---|---|
| Date | 14/08/2026 |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |
| Statuts | `PASS` · `PASS_WITH_LIMITATIONS` · `FAIL` · `NOT_TESTED` · `NOT_VERIFIED` |

> **Règle appliquée dans tout ce document.**
> `NOT_VERIFIED` signifie « le fait n'a pas pu être prouvé par une source
> d'autorité ». Ce n'est ni un échec, ni un succès : c'est l'absence de preuve,
> écrite comme telle. En particulier, **aucune région de données n'est déduite
> d'un en-tête `x-vercel-id`** : cet en-tête nomme le point de présence qui a
> servi la requête, pas la région d'exécution de la Function, encore moins celle
> de PostgreSQL ou du stockage objet.

---

## 1. Chaîne d'approvisionnement npm

### 1.1 Résultat

| Mesure | Avant PR-08 | Après PR-08 |
|---|---:|---:|
| Avis `critical` | 0 | **0** |
| Avis `high` | 3 | **0** |
| Avis `moderate` | 4 | **0** |
| **Total** | **7** | **0** |

Commande : `npm audit --audit-level=high` — **PASS**, désormais **bloquante en CI**.

### 1.2 Traitement de chaque avis

| Avis | Sévérité | Origine réelle | Décision | Statut |
|---|---|---|---|---|
| `postcss` — XSS via `</style>` non échappé ; lecture arbitraire via `sourceMappingURL` (×2) | high | `postcss@8.4.31` **imbriqué sous `next`**, alors que le projet dépend directement de `postcss@8.5.26`, dernière version publiée | `overrides: { "postcss": "$postcss" }` — aligne l'arbre sur la version déjà présente | **PASS** |
| `sharp` — CVE-2026-33327, 33328, 35590, 35591 (libvips) | high | `sharp@0.34.5`, dépendance optionnelle de `next` pour `next/image` | `overrides: { "sharp": "^0.35.3" }` — bump mineur ; `npm run build` et 438 tests revérifiés | **PASS** |
| `esbuild` — le serveur de développement accepte toute requête cross-origin | moderate | `esbuild@0.18.20` sous `@esbuild-kit/*`, chaîne héritée de `drizzle-kit` | `overrides: { "esbuild": "^0.25.12" }` | **PASS** |

**Correctif refusé.** `npm audit fix --force` proposait de rétrograder
`drizzle-kit` de 0.31.10 à **0.18.1**. Une rétrogradation de treize versions
mineures de l'outil qui génère et applique les migrations est un risque
supérieur au défaut corrigé — d'autant que l'avis `esbuild` ne concerne que son
serveur de développement, jamais exécuté en CI ni en production. L'override
cible la dépendance transitive sans toucher à l'outil.

**Surveillance.** Les trois overrides sont un point de vigilance : chaque montée
de `next` doit vérifier qu'ils restent nécessaires et compatibles. La clé
`//overrides` de `package.json` renvoie ici et vers
[`ADR-009`](../adr/ADR-009-next-16-compatibility.md).

### 1.3 `xlsx` — blocage P0-1 du plan

| Contrôle | Résultat | Preuve |
|---|---|---|
| Présence de `xlsx` dans l'arbre installé | **absent** | `grep -c '"node_modules/xlsx"' package-lock.json` → `0` |
| Lecteur retenu | `read-excel-file@9.3.10` | ADR-003 |

**PASS** — le critère de release « aucun `xlsx` vulnérable connu » est satisfait,
non par une montée de version mais par le remplacement décidé en ADR-003.

### 1.4 SBOM

| Contrôle | Statut | Détail |
|---|---|---|
| Format | **PASS** | CycloneDX 1.5 |
| Composants inventoriés | **PASS** | **668** |
| Reproductibilité | **PASS** | Horodatage injecté par `SOURCE_DATE_EPOCH` ; empreinte SHA-256 du lockfile incluse dans les propriétés |
| Génération sans dépendance tierce | **PASS** | `scripts/generate-sbom.mjs` lit `package-lock.json` — un générateur tiers ajouterait une dépendance de chaîne d'approvisionnement à l'artefact qui documente la chaîne d'approvisionnement |
| Publication | **PASS** | Artefact CI, rétention 90 jours |

---

## 2. Runtime et framework

| Contrôle | Statut | Valeur mesurée |
|---|---|---|
| `next` installé | **PASS** | **15.5.23** — dernier patch publié de la branche 15 (`npm view next versions`) |
| Patch de sécurité plus récent disponible sur la branche 15 | **PASS** | Aucun |
| Migration Next 16 imposée par une vulnérabilité | **PASS** | Non — après traitement des overrides, plus aucun avis ne l'exige |
| `next lint` déprécié | **PASS** | Remplacé par ESLint CLI 9 en PR-00 |
| `params` asynchrones | **PASS** | 9 fichiers en `params: Promise<…>`, aucun usage synchrone restant |
| Node | **PASS** | v24.14.0 local, `node-version: 24` en CI |
| Blocage identifié pour Next 16 | **PASS_WITH_LIMITATIONS** | La fonction `webpack` de `next.config.ts` (alias `canvas: false` pour `pdfjs-dist`) n'est pas appliquée sous Turbopack — cf. ADR-009 |

---

## 3. Plateforme Vercel

Vérification automatisée : `npm run verify:vercel` (`scripts/verify-vercel.mjs`).
Exécution du 14/08/2026, **sans jeton d'API** :

```text
NOT_VERIFIED  vercel.function_regions        API Vercel non interrogée (VERCEL_API_TOKEN et/ou VERCEL_PROJECT_ID absents)
NOT_VERIFIED  vercel.postgres_region         Aucune variable DATABASE_REGION déclarée
NOT_VERIFIED  vercel.object_storage_region   AWS_REGION et/ou S3_PRIVATE_BUCKET absents
NOT_VERIFIED  vercel.region_proximity        Au moins une des trois régions n'est pas prouvée
NOT_VERIFIED  vercel.production_env          API Vercel non interrogée
NOT_VERIFIED  vercel.preview_env_isolation   API Vercel non interrogée
PASS          vercel.private_cache           5 routes privées répondent en no-store
NOT_VERIFIED  vercel.function_limits         Ni vercel.json ni vercel.ts
PASS          vercel.mode                    Mode démo : aucune infrastructure persistante configurée
```

### 3.1 Détail par exigence

| Exigence | Statut | Ce qui est vérifié, ou pourquoi ça ne l'est pas |
|---|---|---|
| **Function regions** | **NOT_VERIFIED** | Lisible uniquement via l'API Vercel (`serverlessFunctionRegion`). Sans jeton, aucune preuve. Ne **jamais** déduire d'un `x-vercel-id`. |
| **Postgres region** | **NOT_VERIFIED** | Le script exige une variable `DATABASE_REGION` déclarée. Il refuse volontairement de la deviner depuis le nom d'hôte de `DATABASE_URL` : plusieurs fournisseurs exposent un routeur global qui ne dit rien de la localisation des données. |
| **Object storage region** | **NOT_VERIFIED** | `AWS_REGION` + `S3_PRIVATE_BUCKET` absents en local. Même déclarés, ils prouvent la configuration du workload, pas la localisation effective du bucket — celle-ci se confirme côté AWS. |
| **Proximité** | **NOT_VERIFIED** | Non évaluable tant qu'une des trois régions reste non prouvée. Le script refuse de conclure sur une base partielle. |
| **Variables Preview / Production** | **NOT_VERIFIED** | Le script vérifie 21 clés obligatoires en Production **et** l'absence de secrets partagés entre Preview et Production (`AUTH_SESSION_SECRET`, `OIDC_CLIENT_SECRET`, `DATABASE_URL`). Une Preview partageant les secrets de Production est un défaut de cloisonnement : toute branche ouverte y accéderait. |
| **Cache privé** | **PASS** | 5 routes privées vérifiées dans le dépôt : snapshot, ledger, review-events, export, session — toutes en `private, no-store`. |
| **Limits functions** | **NOT_VERIFIED** | Ni `vercel.json` ni `vercel.ts` : durées et mémoire restent aux valeurs par défaut de la plateforme. **Une valeur par défaut n'est pas un choix documenté.** |
| **Mode demo / persistent** | **PASS** | Le script échoue si une infrastructure persistante est configurée **sans** identité utilisateur — le mode persistant doit échouer fermé (ADR-007). |

### 3.2 Comment lever ces `NOT_VERIFIED`

```bash
VERCEL_API_TOKEN=… VERCEL_PROJECT_ID=… VERCEL_TEAM_ID=… DATABASE_REGION=… \
  npm run verify:vercel -- --json --strict
```

Le résultat doit être joint à ce document, daté, avant toute promotion en
Production.

---

## 4. Gouvernance du dépôt

| Contrôle | Statut | Détail |
|---|---|---|
| CI présente et complète | **PASS** | 8 jobs — cf. `.github/workflows/ci.yml` |
| Protection de branche `main` | **NOT_VERIFIED** | Non lisible depuis le dépôt. Règles prescrites et commande de vérification dans [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) |
| `CODEOWNERS` | **NOT_TESTED** | Fichier proposé, non créé — décision d'organisation |
| Smoke test Preview | **NOT_TESTED** | Liste de 10 contrôles définie ; aucun déploiement Preview exécuté dans cette campagne |
| Smoke test Production | **NOT_TESTED** | Idem |

---

## 5. Sources normatives du produit

Périmètre inchangé par PR-08 : la gouvernance des sources relève de PR-01/PR-04.
Rappel de l'état, pour que ce document soit lisible seul.

| Élément | Statut | Référence |
|---|---|---|
| Les 18 zones réglementaires du FEC | **PASS** | Vérifiées à l'article A47 A-1, identiques à `FEC_COLUMNS` (PR-01) |
| Écart `R-HL-006/007/008` classées `hardLaw` sans fondement établi | **FAIL** | Ouvert — `docs/knowledge/REVIEW_REQUIRED.md`, moteur non modifié |
| Revue métier R-01 à R-03 | **NOT_TESTED** | Ouverte, portée par PR-04 |

Ces points ne sont **pas** des régressions de PR-08 : ils sont rappelés ici
parce qu'un rapport de release qui les tairait donnerait une image incomplète de
l'état des sources.
