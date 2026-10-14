# ADR-012 — Profil personnel local : PostgreSQL du poste, pièces sur disque, identité locale

- **Statut** : proposé (lot C07, à relire)
- **Date** : 14 octobre 2026
- **Décision** : un troisième choix d'exécution, `personal_local`, qui réutilise PostgreSQL/Drizzle, les stores des chaînes, `WorkpaperService`, le contrat `ObjectStorage` et les sessions serveur existantes ; aucun second modèle de données.

## Contexte

Les douze chaînes durables ne s'ouvraient qu'avec `PROBANT_*_DURABLE=disposable`, sur une base de recette jetable (CI, base `*_ci`). Le dépôt FEC persistant exigeait S3, SQS, Lambda et un fournisseur OIDC (ADR-002, ADR-005, ADR-007). Le besoin retenu le 12/10/2026 est un outil personnel sur le PC de l'utilisateur, avec ses données et ses pièces locales, repris après redémarrage, sans exploitation SaaS.

## Décision

1. **Profil** (`lib/runtime/profile.ts`) : `browser_demo`, `disposable_recipe`, `personal_local`. Le profil personnel exige `PROBANT_RUNTIME_PROFILE=personal`, un identifiant de profil, une base PostgreSQL sur la boucle locale dont le nom n'est pas `*_ci` / `*_test`, et l'absence de Vercel. Il n'ouvre une chaîne que si son drapeau vaut `personal`. Le comportement de la recette jetable est inchangé.
2. **Base** : un cluster PostgreSQL 17 créé et piloté par le lanceur (`scripts/local/probant-local.mjs`), écoute 127.0.0.1, rôle applicatif propriétaire de la base, marqueur `probant_local.profile` hors des migrations partagées. Les migrations existantes s'appliquent telles quelles ; leur inscription au registre devient atomique avec le fichier (utile partout).
3. **Pièces** : les imports des feuilles restent dans leurs tables (`original_base64`, déjà locales dès que PostgreSQL l'est). Les dépôts FEC utilisent `LocalObjectStorage`, implémentation de `ObjectStorage` : autorisation d'envoi scellée, bornée et éphémère vers `PUT /api/local/objects`, écriture unique, notice SHA-256 ; `StoredObjectRef.provider` admet `local`, persisté dans `source_documents.storage_provider`.
4. **Traitement** : `LocalIngestionJobQueue` remplace SQS par le traitement en processus ; la reprise lit `ingestion_jobs` (`uploaded`, actif au bail expiré, échec transitoire) au premier usage puis chaque minute. Le processeur, ses états et son idempotence sont inchangés.
5. **Identité** : pas d'IdP. Le lanceur écrit l'empreinte d'un code à usage unique ; `/api/auth/local` le consomme et crée une session ordinaire émise par `probant-local:<profil>`. `RequestAuthorizer` accepte ces sessions seulement pour le profil courant ; rôles et type de relecture viennent de la configuration du serveur.
6. **Relecture** : `ReviewKind` (`distinct_identity`, `personal`, `simulated_second_identity`). La politique des feuilles admet l'approbation de son propre travail seulement pour `personal`, enregistrée avec le nom ; une seconde identité synthétique produit des décisions marquées simulation.
7. **Sauvegarde/restauration** : `pg_dump --snapshot` sur l'instantané exporté par la transaction qui calcule le manifeste ; restauration dans un dossier distinct, nouveau profil, comparaison table par table.

## Conséquences

- Aucun réglage Vercel ni production n'est modifié ; sans `PROBANT_RUNTIME_PROFILE=personal` le code se comporte comme avant.
- Les exports et écrans nomment le type de relecture quand il est enregistré ; les approbations antérieures gardent leur forme.
- La relecture personnelle n'est pas étendue au journal de clôture (`cl_*`), dont les règles de relecture distincte restent celles de la Mission 19 (lot C14).
- Un seul serveur Next par profil ; la reprise FEC n'est pas une file distribuée.

## Alternatives écartées

- **SQLite / PGlite** : seconde architecture de base, divergence de SQL (triggers, `jsonb`, verrous consultatifs) avec les stores existants.
- **Réutiliser la base de recette** : détruite et réinitialisée par la CI ; interdit par le lot.
- **Service Windows PostgreSQL (installeur)** : possible, mais exige des droits administrateur ; le lanceur accepte ce cas via `--pg-bin` sans l'imposer.
- **Vercel Blob / S3 en local** : contraire à l'exigence « pièces sur le PC ».
