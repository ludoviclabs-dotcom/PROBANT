# ADR-009 — Matrice de compatibilité Next.js 16

- **Statut** : accepté
- **Date** : 14 août 2026
- **Décision** : rester sur Next.js **15.5.23** pour PR-08 ; la migration vers Next 16 fait l'objet d'un **PR-08b séparé**, non conditionné à la release
- **Décidé dans** : PR-08

## 1. Contexte et déclencheur

Le plan de refonte demande explicitement de **ne pas mélanger une migration majeure avec le durcissement de release**, la migration augmentant fortement le diff au moment précis où l'on cherche à stabiliser.

Deux questions distinctes se posaient :

1. **Sommes-nous sur le dernier patch de sécurité de la branche 15 ?**
2. **Une vulnérabilité connue force-t-elle la montée en version majeure ?**

### État vérifié au 14/08/2026

| Fait | Valeur | Comment vérifié |
|---|---|---|
| `next` installé | **15.5.23** | `node -e "require('next/package.json').version"` |
| Dernier patch publié de la branche 15 | **15.5.23** | `npm view next versions --json` |
| Dernière version majeure publiée | 16.3.1 | `npm view next versions --json` |
| Avis de sécurité `high`/`critical` dans l'arbre | **0** | `npm audit --audit-level=high` |

**Réponse 1 : oui.** PROBANT est déjà sur le dernier patch de la branche 15.5 ; aucune montée corrective n'était disponible.

**Réponse 2 : non — plus maintenant.** `npm audit` proposait initialement `next@16.3.1` comme unique correctif pour trois avis `high`. L'analyse a montré que la remontée ne venait pas de Next lui-même :

| Avis | Origine réelle | Traitement retenu |
|---|---|---|
| `postcss` — 3 avis (XSS `</style>`, lecture arbitraire via `sourceMappingURL`) | `postcss@8.4.31` **imbriqué sous `next`**, alors que le projet dépend directement de `postcss@8.5.26` (dernière version publiée) | `overrides: { "postcss": "$postcss" }` — aligne l'arbre entier sur la version déjà présente |
| `sharp` — CVE-2026-33327/33328/35590/35591 (libvips) | `sharp@0.34.5`, dépendance optionnelle de `next` pour `next/image` | `overrides: { "sharp": "^0.35.3" }` — bump mineur, `npm run build` vérifié |
| `esbuild` (dev server) — `moderate` | `esbuild@0.18.20` sous `@esbuild-kit/*`, chaîne héritée de `drizzle-kit` | `overrides: { "esbuild": "^0.25.12" }` |

Résultat : **7 avis → 0**, sans changer de version majeure. `npm audit --audit-level=high` est donc devenu **bloquant** en CI.

> La suggestion `npm audit fix --force` proposait aussi de **rétrograder** `drizzle-kit` de 0.31.10 à 0.18.1 pour résoudre `esbuild`. Une rétrogradation de treize versions mineures d'un outil de migration est un risque supérieur au défaut qu'elle corrige ; l'override cible la dépendance transitive sans toucher à l'outil.

## 2. Matrice de compatibilité

Statuts : ✅ déjà conforme · ⚠️ à traiter dans PR-08b · ❓ non vérifié, à mesurer par un spike.

| Sujet | Next 15.5.23 (état actuel) | Attendu en Next 16 | Statut | Coût estimé |
|---|---|---|---|---|
| React | 19.2.x | React 19 requis | ✅ | nul |
| `next lint` | Supprimé au profit d'ESLint CLI 9 (PR-00) | `next lint` retiré | ✅ | nul |
| `params` / `searchParams` asynchrones | 9 fichiers utilisent déjà `params: Promise<…>`, **aucun** usage synchrone restant | API asynchrone | ✅ | nul |
| **Configuration `webpack` dans `next.config.ts`** | `webpack: (config) => …` neutralise le module Node optionnel `canvas` requis par `pdfjs-dist` | Turbopack devient le bundler de build ; la clé `webpack` n'est plus appliquée | ⚠️ **bloquant** | 0,5–1 j |
| `pdfjs-dist` + worker | Import dynamique côté navigateur, worker `pdf.worker.min.mjs` | À revalider sous Turbopack | ❓ | mesure requise |
| `eslint-config-next` | `^15.5.23` | Doit suivre la version majeure | ⚠️ | trivial |
| Middleware (en-têtes CSP) | `middleware.ts` avec `NextResponse.next({ request })` | À revalider | ❓ | mesure requise |
| Baseline de build | 145 pages, First Load JS partagé 103 kB | À recomparer après migration | ❓ | mesure requise |
| Tests (438) et E2E (18) | Verts | Doivent rester verts sans adaptation de sélecteurs | ❓ | mesure requise |

### Le point dur identifié

Le seul blocage **vérifié dans le dépôt** est l'alias `canvas: false` posé via la fonction `webpack` de `next.config.ts`. `pdfjs-dist` référence `canvas`, module Node optionnel inutile côté navigateur ; sans neutralisation, le bundle échoue. Sous Turbopack, cette configuration n'est pas prise en compte et doit être réexprimée (option Turbopack équivalente, ou suppression de la dépendance au module par un import plus étroit).

Ce point ne se résout pas « en changeant le numéro de version » : c'est précisément le genre de diff qu'il ne faut pas mêler à un lot de durcissement.

## 3. Décision

1. **PR-08 reste sur Next 15.5.23.** Aucune vulnérabilité connue ne l'impose, et la branche 15 reçoit encore ses correctifs.
2. **PR-08b, séparé**, portera la migration Next 16, avec ce périmètre et cet ordre :
   1. spike de bundle : réexprimer l'alias `canvas` sous Turbopack, revalider `pdfjs-dist` et son worker ;
   2. montée `next` + `eslint-config-next` ;
   3. revalidation complète : 438 tests, 18 E2E, axe, Lighthouse, migrations ;
   4. comparaison de la baseline de build (nombre de pages, First Load JS) avant/après ;
   5. déploiement Preview et smoke test avant toute promotion en Production.
3. **Critère de déclenchement de PR-08b** — l'un des trois suffit :
   - un avis `high`/`critical` apparaît sur la branche 15 sans correctif de patch ;
   - la branche 15.5 sort de support ;
   - une fonctionnalité produit exige explicitement Next 16.

Aucun des trois n'est réuni au 14/08/2026.

## 4. Conséquences

- Les `overrides` de `package.json` deviennent un point de surveillance : chaque montée de `next` doit vérifier qu'ils restent nécessaires et compatibles. La clé `//overrides` du manifeste renvoie vers ce document et vers `SOURCE_AUDIT.md`.
- `npm audit --audit-level=high` étant bloquant en CI, l'apparition d'un nouvel avis force une décision explicite plutôt qu'une dérive silencieuse.
- La dette de migration est **datée et chiffrée**, pas implicite : elle figure dans `docs/release/KNOWN_LIMITATIONS.md`.

## 5. Ce que cet ADR ne décide pas

- **Le calendrier de PR-08b** : dépend des critères de déclenchement ci-dessus, pas d'une date.
- **L'adoption de Turbopack en développement** : indépendante de la version majeure, à évaluer séparément.
- **Le passage de `sharp` en dépendance directe** : l'override suffit tant que `next/image` reste le seul consommateur.

## Références

- [`PLAN_REFONTE.md`](../refonte/PLAN_REFONTE.md) — « ne pas mélanger migration majeure et durcissement »
- [`SOURCE_AUDIT.md`](../release/SOURCE_AUDIT.md) — justification ligne à ligne des overrides
- [`KNOWN_LIMITATIONS.md`](../release/KNOWN_LIMITATIONS.md) — dette datée
