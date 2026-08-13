# ADR-005 — Runtime d'ingestion durable

- **Statut** : accepté
- **Date** : 13 août 2026
- **Décision** : file Amazon SQS standard + worker AWS Lambda idempotent, état durable PostgreSQL

## Contexte

Le pipeline actuel vit dans une requête Next.js synchrone. Il charge le fichier entier, calcule un hash, parse, exécute les règles et renvoie jusqu'à 20 000 écritures. Il n'offre ni reprise, ni idempotence, ni concurrence bornée, ni historique d'état.

Le runtime doit traiter un flux S3 sans dépendre du navigateur ou de la durée de la requête d'upload. L'état métier reste dans PostgreSQL ; la file ne transporte que `jobId`, `organizationId`, `sourceDocumentId` et une version de message.

## Options évaluées

| Option | Durabilité/reprise | Maturité au 13/08/2026 | Bornage | Décision |
|---|---|---|---|---|
| `waitUntil` / traitement après réponse Vercel | Pas une file métier ; couplé à la durée/au déploiement de Function | Stable mais inadapté aux longs traitements | Limites de Function | Rejeté |
| Vercel Queues / Workflow | Au moins une fois, retries, visibilité et concurrence ; intégration Vercel excellente | Vercel Queues est encore **Beta** depuis février 2026 et n'a pas de DLQ native | Concurrence par consumer, lease extensible | Rejeté pour cette infrastructure critique ; réévaluable après GA |
| PostgreSQL comme file (`SKIP LOCKED`) | État durable mais la base métier devient aussi broker ; polling et reprises à opérer | PostgreSQL mature | Leasing applicatif | Rejeté comme mécanisme primaire ; conservé comme registre/reconciliateur |
| SQS standard + Lambda | Au moins une fois, visibility timeout, retries, DLQ et métriques CloudWatch ; doublons possibles | Services AWS établis | Concurrence réservée + contrôle transactionnel par organisation | Retenu |
| SQS + Fargate | Même file, durée sans limite stricte | Mature | Concurrence de tâches | Secours si le benchmark réel dépasse la fenêtre Lambda ; pas codé dans ce PR |

Sources : [Vercel Queues](https://vercel.com/docs/queues), [concepts Vercel Queues](https://vercel.com/docs/queues/concepts), [SQS avec Lambda](https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html), [guide AWS Lambda/Fargate](https://docs.aws.amazon.com/pdfs/decision-guides/latest/fargate-or-lambda/fargate-or-lambda.pdf).

## Flux retenu

1. Le client demande une intention d'upload avec `organizationId`, `dossierId`, nom, taille, MIME et clé d'idempotence.
2. Le serveur résout un contexte d'autorisation. Sans provider d'identité configuré ou si le dossier n'appartient pas à l'organisation : erreur fermée, aucune signature.
3. Une transaction crée/réutilise `source_documents` et `ingestion_jobs` grâce à `unique(dossier_id, idempotency_key)`.
4. `ObjectStorage` délivre une URL S3 pré-signée expirante et liée à la clé serveur, la taille/MIME et au checksum quand disponible.
5. Le navigateur envoie directement vers S3, puis appelle la finalisation avec l'identifiant du job. Le serveur fait `HEAD`, vérifie taille, MIME/checksum/métadonnées et marque `uploaded`.
6. Le job est publié dans SQS. `queue_published_at` et un reconciliateur republient les jobs `uploaded` non publiés ; un doublon est sans effet.
7. Lambda prend un lease logique en PostgreSQL, incrémente `attempt` et vérifie la limite `MAX_CONCURRENT_JOBS_PER_ORG`. La transition d'état conditionnelle empêche deux consommateurs de travailler simultanément le même job. Le lease est rafraîchi entre parsing, contrôles et snapshot ; un lease expiré est reclassé `failed/WORKER_LEASE_EXPIRED` sous verrou d'organisation puis peut être repris par la livraison SQS suivante.
8. Le worker lit le `ReadableStream` S3, calcule le SHA-256 complet pendant le flux, découpe via `TextDecoder`, parse ligne par ligne et insère par batch transactionnel. Après chaque batch, un checkpoint de ligne est durable.
9. Validation, contrôles et construction du snapshot utilisent les données persistées. Le snapshot est inséré de façon idempotente puis le job passe à `completed`.
10. Une erreur classée transitoire relâche le message pour retry. Une limite, incohérence MIME/extension/checksum, archive pathologique ou contenu suspect passe à `quarantined`. Une erreur déterministe passe à `failed`. Aucun détail sensible n'est placé dans SQS ou les réponses.

## Idempotence et états

- L'intention d'upload est idempotente par `(dossier_id, idempotency_key)`.
- Le SHA-256 complet devient l'identité de contenu ; le short hash reste un affichage uniquement.
- Chaque transition est un `UPDATE ... WHERE status IN (...)` explicite ; les transitions arrière sont interdites.
- Les insertions FEC utilisent la PK `(source_document_id, line_number)` et un conflit vérifié, jamais une duplication silencieuse.
- Les contrôles sont uniques par job/règle/version ; les snapshots par dossier/version/hash.
- SQS/Lambda étant « au moins une fois », l'idempotence en base est obligatoire. AWS recommande explicitement des consommateurs idempotents car un message peut être livré plusieurs fois.

## Bornes et observabilité

Les six limites demandées sont obligatoires dans le runtime persistant et proviennent de variables d'environnement validées : `MAX_UPLOAD_BYTES`, `MAX_FEC_LINES`, `MAX_LINE_BYTES`, `MAX_FIELD_BYTES`, `MAX_PARSE_DURATION_MS`, `MAX_CONCURRENT_JOBS_PER_ORG`. Il n'existe aucun défaut de production caché. Les valeurs recommandées proviennent du benchmark et sont consignées dans `docs/ingestion/INGESTION_LIMITS.md`.

Chaque changement d'état persiste dates, compteurs et `error_code`. Les logs structurés portent `requestId`, `jobId`, `organizationId`, état, tentative, durée et compteurs, jamais les lignes FEC. Alarmes minimales : âge du plus ancien message, DLQ non vide, taux d'échec/quarantaine, durée p95, backlog `uploaded`, jobs bloqués et saturation par organisation.

Les erreurs HTTP suivent `{ code, message, requestId, retryable, details }`. `details` est une liste de métadonnées validées (champ, limite, valeur observée), sans nom complet de personne, libellé d'écriture ni contenu de cellule.

## Seuil d'évolution

Si le benchmark/corpus réel montre que le p95 atteint 70 % de la durée maximale Lambda ou 70 % de sa mémoire configurée, le même consumer portable est empaqueté dans Fargate. Ce changement de runtime exige une mise à jour de l'ADR mais ne modifie ni le message, ni `ObjectStorage`, ni les tables métier.
