# ADR-004 — Schéma PostgreSQL et migrations

- **Statut** : accepté
- **Date** : 13 août 2026
- **Décision** : PostgreSQL + Drizzle, schéma code-first et migrations SQL versionnées

## Contexte et principes

La session navigateur et les `Map` serveur ne sont pas une persistance. PostgreSQL devient la source durable des métadonnées, écritures, contrôles, constats, revues et snapshots. Le modèle canonique reste la forme métier ; Drizzle est l'adaptateur de persistance.

La solution d'identité n'est pas encore arrêtée dans l'architecture. Ce PR ne crée donc ni `users` ni `memberships`. Les événements conservent un `actor_external_id` opaque fourni par un contexte d'autorisation configuré. Un futur ADR d'identité introduira les tables et FK sans réinterpréter l'historique.

Drizzle documente le schéma TypeScript comme source des migrations, générées puis appliquées avec `drizzle-kit generate` et `drizzle-kit migrate`. Les migrations appliquées sont journalisées dans `__drizzle_migrations`. Sources : [schéma Drizzle](https://orm.drizzle.team/docs/sql-schema-declaration), [migrations Drizzle](https://orm.drizzle.team/docs/migrations), [index et contraintes](https://orm.drizzle.team/docs/indexes-constraints).

## Tables et contraintes

Toutes les PK sont des UUID générés par l'application. Tous les timestamps sont `timestamptz`. Les montants FEC sont stockés en `numeric(20,2)` et non en flottants.

| Table | PK et colonnes structurantes | FK / uniques / index | Suppression |
|---|---|---|---|
| `organizations` | `id`, `name`, `created_at` | `unique(name)` seulement si le nom devient un identifiant métier : non retenu dans ce PR | `RESTRICT` tant que des dossiers existent |
| `dossiers` | `id`, `organization_id`, `external_ref`, `status`, `created_at`, `updated_at` | FK org ; `unique(organization_id, external_ref)` ; index `(organization_id, updated_at desc)` | org → dossiers `RESTRICT` ; archivage logique |
| `source_documents` | `id`, `dossier_id`, nom/MIME/taille, `sha256`, emplacement objet/version, statut, parser | FK dossier ; `unique(dossier_id, sha256)` ; `unique(storage_provider, storage_bucket, storage_key, storage_version_id)` ; index dossier/statut | dossier → documents `CASCADE`; l'objet est géré par politique de rétention séparée |
| `ingestion_jobs` | `id`, `source_document_id`, état, `attempt`, `idempotency_key`, versions, compteurs et dates | FK document ; `unique(dossier_id, idempotency_key)` ; index `(organization_id, status, created_at)` et `(source_document_id, created_at desc)` | document → jobs `CASCADE` |
| `fec_entries` | PK composite `(source_document_id, line_number)`, colonnes FEC normalisées | FK document ; index compte, écriture, date dans le périmètre dossier/document | document → lignes `CASCADE` |
| `control_executions` | `id`, `ingestion_job_id`, `rule_id`, `rule_version`, statut, mesures/dates | FK job ; `unique(ingestion_job_id, rule_id, rule_version)` ; index job/statut | job → exécutions `CASCADE` |
| `findings` | `id`, `dossier_id`, `control_execution_id`, famille/sévérité/statut, charge utile canonique JSONB | FK dossier et exécution nullable ; `unique(dossier_id, finding_key)` ; index dossier/statut, dossier/sévérité | dossier → findings `CASCADE`; exécution supprimée → `SET NULL` pour préserver la revue |
| `finding_entries` | PK composite `(finding_id, source_document_id, line_number)` | FK finding et FK composite vers `fec_entries` ; index `(source_document_id, line_number)` | finding/document/ligne → lien `CASCADE` |
| `review_events` | `id`, `finding_id`, états avant/après, acteur opaque, commentaire, date | FK finding ; index `(finding_id, created_at)` et `(actor_external_id, created_at)` | finding → événements `CASCADE`; l'application interdit l'édition/suppression directe |
| `synthesis_snapshots` | `id`, `dossier_id`, `source_document_id`, version/hash, JSONB canonique, date | FK dossier/document ; `unique(dossier_id, snapshot_version)` et `unique(dossier_id, snapshot_hash)` ; index dernier snapshot | dossier → snapshots `CASCADE`; document → `RESTRICT` |
| `report_artifacts` | `id`, `dossier_id`, `snapshot_id`, emplacement objet/version, SHA-256, type, date | FK dossier/snapshot ; `unique(dossier_id, sha256, artifact_type)` ; index dossier/date | dossier → artefacts `CASCADE`; snapshot → `RESTRICT` |

`organizations`, `dossiers` et `source_documents` portent toujours l'organisation directement ou par FK vérifiable. Les requêtes de repository filtrent par `organization_id` même lorsque l'ID primaire est connu, pour empêcher une confusion inter-tenant.

## États et intégrité

Les états d'ingestion sont un enum PostgreSQL : `created`, `uploading`, `uploaded`, `fingerprinting`, `parsing`, `validating`, `running_controls`, `building_snapshot`, `completed`, `failed`, `quarantined`.

Contraintes supplémentaires :

- `attempt >= 0`, compteurs `>= 0`, tailles `>= 0` ;
- SHA-256 en hexadécimal complet de 64 caractères ;
- `completed_at` obligatoire seulement pour les états terminaux ;
- un document terminé a un SHA-256 complet et une taille observée ;
- le statut courant d'un finding est une projection ; `review_events` est l'historique append-only ;
- les réponses d'API paginent `fec_entries` par curseur stable `(line_number, source_document_id)`.

## Migrations et rollback

- `lib/db/schema.ts` est la source de vérité ; le SQL généré dans `drizzle/` est commité et relu.
- CI exécute une migration depuis une base vide puis vérifie qu'une seconde génération ne produit aucun diff.
- Aucun `drizzle-kit push` en production.
- Chaque migration a une section de rollback documentée. Les migrations additives se compensent par un script `down.sql` relu ; une migration destructive suit **expand → backfill vérifié → contract** et n'est jamais annulée par perte de données automatique.
- Le rollback applicatif précède le rollback de schéma. Les données ajoutées restent lisibles par l'ancienne version jusqu'à la phase contract.
- La migration initiale peut être annulée seulement sur une base déclarée vide/non-production ; sinon restauration point-in-time.

## Conséquences

Le repository persistant échoue fermé sans `DATABASE_URL` et contexte d'autorisation. Le mode démo n'ouvre aucune connexion. La suppression d'un dossier est une opération administrative distincte ; l'UI ordinaire archive et ne cascade jamais silencieusement des preuves.
