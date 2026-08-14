# Rapport d'aptitude à la release — PR-08

| | |
|---|---|
| Date | 14/08/2026 |
| Branche | `claude/release-candidate-prep-9779c7` |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |
| Objet | Durcissement : authentification, autorisation, en-têtes, upload, CI, E2E, observabilité, performance |
| **Verdict** | **RELEASE CANDIDATE — promotion en Production conditionnée à trois vérifications d'environnement** |

**Convention de statut** : `PASS` · `PASS_WITH_LIMITATIONS` · `FAIL` · `NOT_TESTED` · `NOT_VERIFIED`.
Un contrôle non exécuté n'est jamais écrit `PASS`.

---

## 1. Verdict par critère de release

Les huit critères énoncés pour PR-08, dans l'ordre.

| # | Critère | Statut | Preuve |
|---|---|---|---|
| 1 | **CI verte** | **PASS_WITH_LIMITATIONS** | 5 contrôles exécutés localement (lint, typecheck, 438 tests, build, 18 E2E) ; 3 jobs jamais exécutés (CodeQL, secret scan, Lighthouse) |
| 2 | **Auth et isolation testées** | **PASS** | 84 tests d'authentification dont **14 tests négatifs d'isolation** couvrant nommément les 4 scénarios exigés |
| 3 | **Aucun bouton factice** | **PASS** | E2E : tout bouton visible porte un nom accessible ; note de synthèse et exports produisent un effet observable |
| 4 | **Dossier actif cohérent** | **PASS** | Aucune régression : 438 tests verts, dont ceux de PR-02/05/06 |
| 5 | **Aucun `xlsx` vulnérable connu** | **PASS** | `xlsx` **absent du lockfile** ; `npm audit` : **0 vulnérabilité** |
| 6 | **RUM activé** | **PASS** | Collecte native `PerformanceObserver` → `/api/rum`, sans connecteur SaaS |
| 7 | **CWV reportés, même si trafic insuffisant** | **PASS_WITH_LIMITATIONS** | Dispositif en place et documenté ; **aucune mesure de terrain** — reporté comme `NOT_TESTED`, pas comme conforme |
| 8 | **Limitations connues explicites** | **PASS** | 29 limitations datées et chiffrées dans [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) |
| 9 | **Preview et Production smoke-testés** | **NOT_TESTED** | Liste de 10 contrôles définie ; aucun déploiement exécuté dans cette campagne |

**Sept critères sur neuf sont tenus.** Les deux restants (7 partiel, 9) ne
dépendent pas du code : ils exigent un déploiement et du trafic.

---

## 2. Ce qui a été construit

### 2.1 Authentification utilisateur — ADR-007

| Contrôle | Statut | Détail |
|---|---|---|
| Provider OIDC | **PASS** | Générique par découverte ; aucun fournisseur codé en dur |
| Authorization Code + PKCE S256 | **PASS** | `state` et `nonce` sur 256 bits, transaction scellée AES-256-GCM (10 min) |
| Validation du jeton d'identité | **PASS** | JWKS, algorithmes asymétriques uniquement ; `alg:none` et HMAC refusés |
| Session serveur | **PASS** | Opaque, en base ; **seule l'empreinte SHA-256 du secret est stockée** |
| Cookies `HttpOnly` + `Secure` | **PASS** | `__Host-probant_session`, `SameSite=Lax`, `Path=/`, sans `Domain` |
| Double expiration | **PASS** | Fenêtre glissante d'inactivité **et** plafond absolu jamais repoussé |
| CSRF | **PASS** | `SameSite` + contrôle d'origine + jeton double-submit dérivé par HMAC |
| Rôles `preparer`/`reviewer`/`signer`/`admin` | **PASS** | Matrice de 6 permissions ; `uploader` normalisé vers `preparer` |
| Autorisation par `organizationId` / `dossierId` | **PASS** | Trois verrous indépendants — cf. § 2.2 |

**Distinction respectée.** OIDC *utilisateur* (`lib/auth/oidc/`) et Vercel OIDC
*workload* (`@vercel/oidc-aws-credentials-provider`, ADR-002) sont deux sujets
disjoints, documentés comme tels, sans dépendance croisée dans le code.

### 2.2 MFA — imposée par l'IdP

| Contrôle | Statut | Détail |
|---|---|---|
| Aucun second facteur maison | **PASS** | PROBANT **constate** `acr`/`amr`, il n'authentifie aucun facteur |
| Politique documentée | **PASS** | ADR-007 § 5 |
| Politique testée | **PASS** | 7 tests : `acr` attendu, `amr` parmi plusieurs, mot de passe seul refusé, régimes `required` / `audit_only` |
| Configuration incomplète bloquante | **PASS** | `required` sans `acr` ni `amr` attendu **fait échouer le démarrage** — sinon toute session serait déclarée conforme |
| `acr_values` transmis à l'IdP | **PASS** | PROBANT demande **puis** vérifie ; demander sans vérifier ne prouverait rien |

### 2.3 Autorisation — chaque service vérifie ses droits

| Contrôle | Statut | Détail |
|---|---|---|
| Garde appelée dans chaque route sensible | **PASS** | 7 routes converties vers `authorizeRequest` |
| Le middleware n'accorde aucun droit | **PASS** | `middleware.ts` ne pose que des en-têtes ; les tests d'isolation tournent sans lui |
| Vérification d'appartenance du dossier | **PASS** | Câblée **dans l'autorisation**, pas dans chaque route : une route ajoutée sans garde échoue en 401 |
| Filtrage `organization_id` des requêtes | **PASS** | Troisième verrou, indépendant |
| Refus indistinguable d'un dossier inexistant | **PASS** | Même code `DOSSIER_NOT_FOUND` — sinon l'écart permettrait l'énumération |

**Défaut corrigé** : `POST /api/export` acceptait un snapshot fourni par le
client, **sans aucune authentification**. Un dossier persistant est désormais
autorisé puis **relu depuis la base** ; le corps de la requête n'est plus une
source de vérité.

### 2.4 Tests négatifs — les quatre scénarios exigés

| Scénario | Statut |
|---|---|
| org A ne peut jamais lire dossier B | **PASS** |
| download cross-org interdit | **PASS** |
| export cross-org interdit | **PASS** |
| job cross-org interdit | **PASS** |

Plus : contexte signé authentique revendiquant le dossier d'un tiers, signature
falsifiée, contexte expiré, séparation des rôles, non-énumérabilité.

### 2.5 En-têtes de sécurité

| En-tête | Statut | Valeur |
|---|---|---|
| CSP **Report-Only d'abord** | **PASS** | Défaut `report-only`, bascule par `CSP_MODE=enforce` après lecture des rapports |
| Endpoint de rapport | **PASS** | `/api/security/csp-report` — résume, ne recopie jamais le contenu bloqué |
| `frame-ancestors 'none'` | **PASS** | + `X-Frame-Options: DENY` pour les navigateurs anciens |
| `X-Content-Type-Options` | **PASS** | `nosniff` |
| `Referrer-Policy` | **PASS** | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | **PASS** | 16 capacités refusées par défaut |
| Nonce par requête | **PASS** | 128 bits + `strict-dynamic` |
| Vérifié sur le rendu réel | **PASS** | E2E sur le build de production |

### 2.6 Durcissement de l'upload

| Exigence | Statut | Détail |
|---|---|---|
| Rate limit | **PASS** | Par organisation et par minute, compteur **en base** — un compteur mémoire ne limite rien sur Vercel |
| Quota par organisation | **PASS** | Nombre de fichiers **et** volume par jour |
| Type allowlist | **PASS** | Extension × type de document |
| MIME | **PASS** | Croisé avec l'extension |
| **Magic bytes** | **PASS** | Vérifiés côté worker, au premier octet lu ; un binaire déguisé en `.txt` est mis en quarantaine sans atteindre le parseur |
| Nom neutralisé | **PASS** | Traversées, caractères de contrôle, marques bidirectionnelles, noms réservés Windows |
| Limites configurées | **PASS** | 9 variables, échec fermé si absentes |
| Aucune donnée brute dans les logs | **PASS** | Allowlist fermée de champs — cf. § 2.7 |

La lecture d'en-tête **ne matérialise pas le flux** : `peekHead` rejoue les
octets par `pull`, préservant le streaming introduit en PR-03.

### 2.7 Observabilité

| Exigence | Statut | Détail |
|---|---|---|
| Logs structurés | **PASS** | JSON plat, `snake_case`, convention OTel |
| Aucun libellé comptable brut | **PASS** | Allowlist **fermée** ; 12 tests, dont un vérifiant qu'une ligne FEC complète ne laisse aucune trace |
| Métriques métier | **PASS** | 6 SLI ; `export_duration_ms` câblé |
| OpenTelemetry | **PASS_WITH_LIMITATIONS** | Convention respectée, **aucun SDK embarqué** — décision documentée (L-19) |

### 2.8 CI complète

| Étape exigée | Job | Statut |
|---|---|---|
| `npm ci` | `verify` | **PASS** |
| eslint | `verify` | **PASS** |
| typecheck | `verify` | **PASS** |
| Vitest | `verify` | **PASS** |
| build | `verify` | **PASS** |
| Playwright | `e2e` | **PASS** |
| Axe | `e2e` | **PASS** |
| Lighthouse CI | `lighthouse` | **NOT_TESTED** |
| dependency scan | `supply-chain` | **PASS** — bloquant à partir de `high` |
| CodeQL | `codeql` | **NOT_TESTED** |
| secret scan | `secret-scan` | **NOT_TESTED** |
| migration tests | `migrations` | **NOT_TESTED** localement — inclut un **aller-retour descendant puis remontant** |
| fixture ingestion tests | `fixtures` | **PASS** |
| SBOM | `supply-chain` | **PASS** — CycloneDX 1.5, 668 composants, reproductible |

### 2.9 Chaîne d'approvisionnement

| Mesure | Avant | Après |
|---|---:|---:|
| Avis `high` | 3 | **0** |
| Avis `moderate` | 4 | **0** |
| **Total** | **7** | **0** |

Traité par trois `overrides` ciblés, **sans migration majeure** et sans la
rétrogradation de `drizzle-kit` que proposait `npm audit fix --force`. Détail et
justification : [`SOURCE_AUDIT.md`](./SOURCE_AUDIT.md) § 1.2.

### 2.10 Next.js

| Question | Réponse | Statut |
|---|---|---|
| Sommes-nous sur le dernier patch de la branche 15 ? | Oui — **15.5.23**, aucune version plus récente publiée | **PASS** |
| Une vulnérabilité force-t-elle Next 16 ? | Non, après traitement des overrides | **PASS** |
| Matrice de compatibilité Next 16 | Rédigée, avec un blocage identifié (alias `canvas` sous Turbopack) | **PASS** |
| Migration incluse dans ce lot | **Non** — PR-08b séparé, critères de déclenchement définis | **PASS** |

---

## 3. Conditions de promotion en Production

Trois vérifications, aucune n'exigeant de code.

| # | Condition | Commande | Bloquant |
|---|---|---|:--:|
| C-1 | Prouver les régions et le cloisonnement Preview/Production | `VERCEL_API_TOKEN=… DATABASE_REGION=… npm run verify:vercel -- --strict` | ✅ |
| C-2 | Exécuter le smoke test sur Preview **puis** Production | `BRANCH_PROTECTION.md` § 4 — 10 contrôles | ✅ |
| C-3 | Constater la protection de branche appliquée | `gh api repos/…/branches/main/protection` | ✅ |

Recommandé avant ouverture au trafic réel, non bloquant pour la promotion :

| # | Action |
|---|---|
| R-1 | Exécuter le parcours FEC durable sur un environnement provisionné (lève L-01) |
| R-2 | Laisser le RUM atteindre 30 échantillons par page, puis reporter les P75 |
| R-3 | Basculer `CSP_MODE=enforce` après lecture des rapports de violation |
| R-4 | Trancher la correction du contraste (`--pb-text-faint`) — décision de design |

---

## 4. Ce que cette release ne prouve pas

Résumé ; le détail est dans [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md).

- Le **pipeline d'ingestion durable** n'a aucune exécution réelle attestée (L-01).
- Aucune **région de données** n'est prouvée — 7 `NOT_VERIFIED` sur 9 (L-02).
- Aucun **Core Web Vital de terrain** (L-08).
- **64 nœuds** en défaut de contraste, cause racine identifiée et chiffrée (L-11).
- La **CSP n'est pas en enforcement** (L-15).
- Aucun **smoke test** de Preview ou Production (L-06).

---

## 5. Documents de la campagne

| Document | Objet |
|---|---|
| [`SOURCE_AUDIT.md`](./SOURCE_AUDIT.md) | Chaîne d'approvisionnement, runtime, plateforme Vercel, gouvernance |
| [`TEST_REPORT.md`](./TEST_REPORT.md) | 438 tests, 18 E2E, tests négatifs d'isolation |
| [`PERFORMANCE_REPORT.md`](./PERFORMANCE_REPORT.md) | RUM, budgets P75, baseline de build, SLI métier |
| [`ACCESSIBILITY_REPORT.md`](./ACCESSIBILITY_REPORT.md) | axe-core sur pages assemblées, défaut critique corrigé, dette gelée |
| [`KNOWN_LIMITATIONS.md`](./KNOWN_LIMITATIONS.md) | 29 limitations datées |
| [`BRANCH_PROTECTION.md`](./BRANCH_PROTECTION.md) | Règles `main`, checks obligatoires, smoke test |
| [`ADR-007`](../adr/ADR-007-authn-authz.md) | AuthN / AuthZ |
| [`ADR-009`](../adr/ADR-009-next-16-compatibility.md) | Matrice de compatibilité Next 16 |
