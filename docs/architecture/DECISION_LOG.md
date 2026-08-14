# PROBANT — Journal des décisions

> Décisions techniques prises pendant la refonte, avec leur justification et
> l'alternative écartée. Une décision inscrite ici n'est pas une ADR : les ADR
> (`docs/adr/`, ADR-001 → ADR-008) portent les choix d'architecture structurants.
> Ce journal porte les décisions **d'outillage et de discipline** — plus légères,
> mais qui doivent rester traçables.

Format : `D-nnn` · date · PR · décision · pourquoi · alternative écartée.

---

## D-001 — Patch de maintenance Next.js 15.5.19 → 15.5.23

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué

**Décision.** Passer de `next@15.5.19` à `next@15.5.23`, et resserrer la
déclaration de `package.json` de `^15.1.6` à `^15.5.23`.

**Pourquoi.**
- Version réellement résolue avant le patch : **15.5.19**
  (`package-lock.json`), alors que `package.json` déclarait `^15.1.6` — le
  plancher déclaré était de quatre mineures en retard sur le résolu, donc
  n'offrait aucune garantie de sécurité.
- `npm audit` remontait **8 avis GitHub** sur `next`, tous corrigés en
  **15.5.21** : GHSA-m99w-x7hq-7vfj, GHSA-89xv-2m56-2m9x, GHSA-68g3-v927-f742,
  GHSA-4633-3j49-mh5q, GHSA-4c39-4ccg-62r3, GHSA-p9j2-gv94-2wf4,
  GHSA-q8wf-6r8g-63ch, GHSA-955p-x3mx-jcvp.
- Les notes de version officielles de v15.5.21 confirment ces correctifs, plus
  GHSA-6gpp-xcg3-4w24 (contournement middleware/proxy).
- **15.5.23** est le dernier patch publié de la branche 15.5 : v15.5.22 rejette
  TypeScript ≥ 7.0 avec un message explicite, v15.5.23 porte des gardes de
  traversée de `ReplyServer` vers `FlightClient`. Deux patchs, aucun changement
  d'API.
- Vérification post-patch : `typecheck`, `test` (115/115), `build` (145 pages)
  tous verts ; la table des routes et le First Load JS sont **identiques**
  (`/dashboard/synthese` 137 kB, `/dashboard/risques` 207 kB).

**Alternative écartée.** Migrer vers Next.js 16 — hors périmètre, explicitement
interdit pour ce PR, et porteur d'un changement de majeure (notamment la
suppression de `next lint`) qui mérite sa propre ADR.

---

## D-002 — Migration du lint : `next lint` → ESLint CLI 9 (flat config)

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué

**Décision.** Remplacer le script `"lint": "next lint"` par `"lint": "eslint"`,
et créer `eslint.config.mjs` (flat config) via `FlatCompat`, en ajoutant
`eslint@9.39.5`, `eslint-config-next@15.5.23` et `@eslint/eslintrc@3` en
dépendances de développement.

**Pourquoi.**
- Au commit audité, `npm run lint` sortait en **exit 1** avec
  `⨯ ESLint must be installed: npm install --save-dev eslint` : **aucun lint
  n'était exécutable**. Ce n'était pas un lint permissif, c'était un lint absent.
  → P0-6.
- `next lint` est déprécié en 15.5 et **supprimé en Next.js 16**. La migration
  peut être faite dès maintenant sans changer de majeure, ce qui retire un
  obstacle à la future ADR Next 16.
- `eslint-config-next@15.5.23` déclare `eslint: "^7.23.0 || ^8.0.0 || ^9.0.0"` —
  ESLint 9 est un choix supporté, pas un pari.
- `FlatCompat` est le pont utilisé par `create-next-app` sur la branche 15, car
  `eslint-config-next` est encore publié au format eslintrc.

**Alternative écartée.** Rester sur `next lint` en installant simplement
`eslint` : ferait fonctionner le lint aujourd'hui, mais reconduirait un script
qui disparaît à la majeure suivante.

---

## D-003 — `npm audit` non bloquant en CI, avec baseline documenté

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué

**Décision.** L'étape `npm audit --audit-level=high` figure dans
`.github/workflows/ci.yml` mais se termine par `|| true` : elle est **exécutée et
visible dans le log, jamais bloquante**.

**Pourquoi.**
- Baseline mesuré au commit audité, avant comme après le patch Next :
  **7 vulnérabilités — 1 moderate, 6 high**.
- La plus grave, `xlsx@0.18.5`, est marquée **`fixAvailable: false`** par npm :
  aucune version corrigée n'est publiée sur le registre. Rendre l'étape bloquante
  interdirait **tout merge**, y compris celui des PR chargées de résoudre le
  problème.
- Les 6 autres ont un correctif disponible mais relèvent de PR-08 (hardening) :
  `js-yaml` (4.3.0 → 4.3.1), `postcss`, `nanoid`, `sharp`,
  `@tailwindcss/postcss`.

**Baseline à faire décroître, jamais croître.**

| Paquet | Sévérité | Correctif disponible | PR responsable |
|---|---|---|---|
| `xlsx@0.18.5` | high | **non** | PR-03 (remplacement + ADR-003) |
| `js-yaml@4.3.0` | high | oui (4.3.1) | PR-08 |
| `postcss` | high | oui | PR-08 |
| `nanoid` | high | oui | PR-08 |
| `sharp` | high | oui | PR-08 |
| `@tailwindcss/postcss` | moderate | oui | PR-08 |

**Alternative écartée.** Rendre l'audit bloquant dès PR-00 : mécaniquement
impossible tant que `xlsx` n'a pas de correctif, et l'ignorer par exception
(`--omit`, `.nsprc`) rendrait l'écart invisible — l'inverse du but recherché.

---

## D-004 — Désactivation de `react/no-unescaped-entities`

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué

**Décision.** La règle `react/no-unescaped-entities` est désactivée dans
`eslint.config.mjs`, avec justification en commentaire.

**Pourquoi.**
- Premier passage d'ESLint sur le dépôt : **60 problèmes, dont 50 erreurs**.
  Les **50 erreurs** sont toutes cette même règle, déclenchée par les apostrophes
  du texte français en JSX (« l'auditeur », « d'audit », « n'est pas »).
- Les corriger imposerait d'éditer le **texte affiché à l'utilisateur** dans une
  vingtaine de fichiers de `app/` et `components/` — c'est-à-dire de modifier la
  restitution dans un PR dont le critère d'acceptation est explicitement
  « **aucune modification fonctionnelle du dashboard** ».
- Après désactivation : **0 erreur, 9 avertissements**, `npm run lint` en exit 0.
  Les 9 avertissements (8 `no-unused-vars`, 1 `react-hooks/exhaustive-deps` dans
  `components/probant/risk/useRiskAdjustments.ts:173`) sont conservés visibles →
  P2-4.

**À réexaminer en PR-06** (revue UX / accessibilité), qui pourra décider d'un
passage systématique aux apostrophes typographiques « ’ » — un choix de
typographie, pas de lint.

**Alternative écartée.** Échapper les 50 apostrophes : diff massif, hors
périmètre, et risque non nul d'altérer un libellé affiché.

---

## D-005 — Node 24 en CI, sans champ `engines`

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué (partiellement)

**Décision.** `.github/workflows/ci.yml` fixe `node-version: 24`. **Aucun champ
`engines` n'a été ajouté** à `package.json`.

**Pourquoi.**
- Node 24 est la version utilisée localement pour produire les résultats
  consignés dans ce PR (v24.14.0) et le runtime par défaut de Vercel : la CI
  reproduit l'environnement réel plutôt qu'un troisième.
- Ajouter `engines` contraindrait l'installation de tous les contributeurs sur
  la foi d'un seul environnement observé — décision qui mérite d'être prise
  explicitement, pas glissée dans un PR de cartographie. → **P2-3**, à trancher
  en PR-08.

**Alternative écartée.** Une matrice multi-versions (18/20/22/24) : coût de CI
sans bénéfice tant qu'aucune contrainte de compatibilité n'est établie.

---

## D-006 — Aucune correction de code dans PR-00

**Date** : 13/08/2026 · **PR-00** · **Statut** : appliqué

**Décision.** Aucun fichier de `app/`, `components/`, `lib/` ou `data/` n'est
modifié par ce PR, y compris pour des défauts pourtant identifiés et prouvés :
constantes dupliquées (P2-1), 4 boutons sans handler (P1-5), calculs métier dans
le JSX (P1-4).

**Pourquoi.** La CI créée par ce PR est **la barrière de non-régression** des
huit PR suivantes. Elle doit être installée sur un état de code **inchangé**,
sinon elle valide un état qu'elle n'a jamais observé auparavant, et toute
régression ultérieure deviendra impossible à imputer.

`git status` au terme du PR ne montre que : `package.json`, `package-lock.json`,
`eslint.config.mjs`, `.github/workflows/ci.yml`, `README.md`, `docs/`.

**Alternative écartée.** Corriger « en passant » les P2 triviaux : brouille la
frontière entre cartographie et refactor, et fait perdre la valeur de référence
du commit.

---

## D-007 — Socle durable PR-03 renvoyé vers quatre ADR spécialisés

**Date** : 13/08/2026 · **PR-03** · **Statut** : appliqué

**Décision.** Les choix structurants de PR-03 sont conclus dans les ADR-002 à
ADR-005 : Amazon S3 privé derrière `ObjectStorage`, `read-excel-file` dans un
Web Worker pour XLSX, PostgreSQL + Drizzle et SQS standard + Lambda. Le mode
persistant échoue fermé sans identité/configuration ; le mode démo ne crée
aucun client d'infrastructure.

**Pourquoi.** Ces décisions ont des cycles de révision différents et exigent
des comparaisons traçables (stockage, licence/sécurité XLSX, schéma et runtime).
Le journal d'architecture conserve ici leur articulation ; les métriques,
sources, alternatives et seuils de réexamen restent dans les ADR dédiés.

`xlsx@0.18.5` est retiré du manifeste et du lockfile. La baseline `npm audit`
reste à 7 alertes transitives (4 moderate, 3 high) dans Next/Sharp/PostCSS et
l'outillage Drizzle ; leurs corrections automatiques imposent des mises à jour
majeures hors périmètre et restent visibles dans la CI pour PR-08.

---

## D-008 — Historique de revue chaîné et PDF sans revendication d'archivage

**Date** : 14/08/2026 · **PR-07** · **Statut** : appliqué

**Décision.** Chaque décision de revue est un événement immuable dont le hash
SHA-256 couvre le contenu canonique et le hash de l'événement précédent. Une
correction ajoute un événement et un snapshot ; les `UPDATE` et `DELETE` sont
interdits par le dépôt applicatif et par des triggers PostgreSQL. Le PDF produit
est explicitement un PDF standard avec un état `not_validated` dans le
manifeste.

**Pourquoi.** La reproductibilité exige de pouvoir reconstituer l'ordre des
décisions, détecter une rupture ou une bifurcation de chaîne et relier chaque
export au snapshot exact. Une extension ou un label PDF/A ne démontre pas la
conformité : cette revendication ne sera autorisée qu'après passage réussi d'un
profil explicite dans veraPDF, selon l'ADR-008.

**Alternative écartée.** Conserver uniquement le dernier statut sur le finding,
ou présenter le PDF courant comme PDF/A sur la base de métadonnées déclaratives :
ces deux options détruisent une partie de la preuve au lieu de la vérifier.
