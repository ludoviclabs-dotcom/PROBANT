# Limitations connues — release candidate PR-08

| | |
|---|---|
| Date | 14/08/2026 |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |

Ce document liste ce que la release **ne fait pas**, ne prouve pas, ou ne
prouve qu'en partie. Il est destiné à être lu avant une mise en production, et
opposable : une limitation absente d'ici serait une limitation cachée.

Classement par nature de risque, puis par gravité décroissante.

---

## 1. Ce qui n'est pas prouvé faute d'environnement

| # | Limitation | Effet | Comment la lever |
|---|---|---|---|
| L-01 | **Le pipeline d'ingestion durable n'a jamais été exécuté de bout en bout.** Upload direct → job → parsing → contrôles → snapshot → empreinte n'a pas d'exécution réelle attestée. | La chaîne la plus critique du produit est couverte par des tests unitaires, pas par un parcours réel. | Provisionner PostgreSQL + S3 + SQS + IdP, exécuter `PROBANT_E2E_PERSISTENT=1 PROBANT_E2E_DOSSIER_ID=… npm run test:e2e` |
| L-02 | **Aucune région Vercel, PostgreSQL ou S3 n'est prouvée.** Le script de vérification sort 7 `NOT_VERIFIED` sur 9 contrôles. | Impossible d'affirmer où résident les données ni si les trois plans sont proches. | `VERCEL_API_TOKEN=… DATABASE_REGION=… npm run verify:vercel -- --strict` |
| L-03 | **Le cloisonnement des variables Preview / Production n'est pas vérifié.** | Une Preview partageant `AUTH_SESSION_SECRET`, `OIDC_CLIENT_SECRET` ou `DATABASE_URL` avec la Production donnerait à toute branche ouverte un accès aux données réelles. Le contrôle existe, il n'a pas encore tourné. | Même commande que L-02 |
| L-04 | **Les limites de Functions ne sont pas configurées.** Ni `vercel.json` ni `vercel.ts` : durée et mémoire restent aux valeurs par défaut de la plateforme. | Une valeur par défaut n'est pas un choix documenté ; un job long peut être coupé sans que la limite ait été décidée. | Créer `vercel.ts` après mesure du corpus de benchmark |
| L-05 | **La protection de branche `main` n'est pas vérifiée.** Les règles sont prescrites, pas constatées. | Rien ne garantit aujourd'hui qu'un push direct sur `main` soit impossible. | `gh api repos/…/branches/main/protection` — cf. `BRANCH_PROTECTION.md` |
| L-06 | **Aucun smoke test Preview ni Production n'a été exécuté.** | Le comportement de l'artefact déployé n'est pas attesté, seulement celui du build local. | Exécuter la liste de 10 contrôles de `BRANCH_PROTECTION.md` § 4 |
| ~~L-07~~ | ~~CodeQL, secret scan et Lighthouse CI n'ont jamais tourné.~~ **LEVÉE le 14/08/2026** : les 8 jobs ont tourné verts sur la PR #41. CodeQL n'a remonté aucune alerte ; Lighthouse satisfait ses assertions LCP et CLS sur 7 URL × 3 exécutions. | — | Deux échecs ont précédé ce vert, tous deux dans la configuration de la CI, aucun dans le code — cf. `TEST_REPORT.md` § 8 |

---

## 2. Ce qui est mesuré mais insuffisamment alimenté

| # | Limitation | Effet | Comment la lever |
|---|---|---|---|
| L-08 | **Aucun Core Web Vital de terrain.** Le RUM est actif ; le trafic est nul. | LCP, INP et CLS au P75 sont `NOT_TESTED`. Le dispositif fonctionne, il n'a rien à agréger. | Déployer, atteindre 30 échantillons par page × métrique, reporter dans `PERFORMANCE_REPORT.md` |
| L-09 | **Aucun SLO chiffré d'ingestion.** Volontaire : le corpus de benchmark de PR-03 n'existe pas. | Impossible de s'engager sur « X lignes en Y secondes ». Toute valeur annoncée aujourd'hui serait inventée. | Construire le corpus, mesurer, puis décider |
| L-10 | **`job_error_rate` n'est pas pré-agrégé.** L'application émet `outcome` par métrique ; le taux se calcule côté collecteur. | Sans collecteur configuré, le taux n'existe nulle part. | Configurer un log drain et la requête d'agrégation |

---

## 3. Défauts ouverts, chiffrés

| # | Limitation | Effet | Comment la lever |
|---|---|---|---|
| L-11 | **Contraste insuffisant — 64 nœuds sur 5 pages.** `--pb-text-faint` (`#5c6b82`) atteint 3,1 à 3,6 : 1 selon le fond, contre 4,5 : 1 exigé en WCAG AA. | Texte secondaire difficilement lisible. Non conforme AA sur ces éléments. | Porter le jeton à `#7d8ca3` (4,94 : 1) et propager aux constantes `FAINT` — décision de design, cf. `ACCESSIBILITY_REPORT.md` § 4 |
| L-12 | **`R-HL-006/007/008` classées `hardLaw` sans fondement établi.** Écart détecté en PR-01, moteur volontairement non modifié. | Trois règles présentées comme opposables sans que leur base légale ait été validée. | Revue métier — `docs/knowledge/REVIEW_REQUIRED.md` |
| L-13 | **Revue métier R-01 à R-03 ouverte.** | Portée par PR-04, non close. | PR-04 |
| L-14 | **9 avertissements ESLint préexistants** (imports non utilisés). | Aucun effet fonctionnel ; bruit de lecture. | Nettoyage sans risque, hors périmètre du durcissement |

---

## 4. Choix d'architecture assumés

Ce ne sont pas des défauts : ce sont des décisions qui ont une contrepartie, et
qui doivent être connues.

| # | Choix | Contrepartie | Décidé dans |
|---|---|---|---|
| L-15 | **La CSP démarre en `Report-Only`.** | Une injection de script ne serait pas bloquée tant que `CSP_MODE=enforce` n'est pas posé. La bascule doit suivre la lecture des rapports de `/api/security/csp-report`, notamment pour pdf.js et ses workers `blob:`. | PR-08 |
| L-16 | **`style-src` autorise `'unsafe-inline'`.** | Nécessaire à Tailwind et aux styles inline de Next.js. Le risque est borné par l'absence de `'unsafe-eval'` côté script et par `strict-dynamic`. | PR-08 |
| L-17 | **Une session porte une seule organisation.** | Un cabinet intervenant pour plusieurs entités devra se reconnecter pour changer de contexte. Le multi-appartenance exige un ADR distinct et un sélecteur explicite. | ADR-007 § 7 |
| L-18 | **Provisionnement d'utilisateur *just-in-time*.** | Aucun compte n'existe avant le premier login. Il n'y a pas d'écran d'invitation : le rattachement organisation/rôles doit être porté par l'IdP. | ADR-007 § 7 |
| L-19 | **Pas de SDK OpenTelemetry embarqué.** | Les métriques et logs suivent la convention de nommage OTel en `snake_case` et sont émis comme lignes structurées, mais aucun exporteur natif n'est fourni. Un collecteur doit les ingérer. | PR-08 |
| L-20 | **Migration Next 16 reportée à un PR-08b.** | Le blocage identifié est réel : l'alias `canvas: false` de `next.config.ts` n'est pas appliqué sous Turbopack. Aucune vulnérabilité n'impose la migration après traitement des overrides. | ADR-009 |
| L-21 | **Trois `overrides` npm maintiennent l'arbre à zéro avis.** | `postcss`, `sharp` et `esbuild` sont forcés au-delà de ce que déclarent leurs parents. Chaque montée de `next` doit revérifier leur nécessité et leur compatibilité. | ADR-009, `SOURCE_AUDIT.md` § 1.2 |
| L-22 | **Le contexte signé HMAC subsiste** pour les workers d'ingestion. | Quiconque détient `PROBANT_CONTEXT_HMAC_SECRET` peut forger un contexte. Le périmètre est borné : ce chemin n'obtient jamais « tous les dossiers de l'organisation » et l'appartenance de chaque dossier reste vérifiée en base. | ADR-007 § 6 |

---

## 5. Frontières de la vérification d'accessibilité

| # | Limitation |
|---|---|
| L-23 | axe-core couvre environ 30 à 50 % des critères WCAG. Un audit automatisé vert **n'est pas** une conformité. |
| L-24 | Aucun test avec lecteur d'écran réel (NVDA, JAWS, VoiceOver) : la sémantique est vérifiée, pas les annonces effectives. |
| L-25 | Parcours clavier complet, zoom 200 %, reflow 320 px et modes de contraste forcé : non testés. |
| L-26 | Un seul navigateur (Chromium). Aucune vérification Firefox ni WebKit. |

---

## 6. Hors périmètre, par décision explicite

| # | Sujet | Décision |
|---|---|---|
| L-27 | **Chantier administratif RGPD** | Hors périmètre du plan de refonte, décision consignée. Seule l'hygiène de plateforme est tenue : fichiers privés, contrôle d'accès, isolation démo/réel, absence de données comptables dans les logs, cache privé. |
| L-28 | **Module fiscal (IS / TVA)** | Reporté à PR-09+ |
| L-29 | **Signature PAdES et validation PDF/A** | ADR-008 : aucun export n'est étiqueté « PDF/A » sans passage par un validateur. Le PDF produit est un PDF standard, revendiqué comme tel. |
