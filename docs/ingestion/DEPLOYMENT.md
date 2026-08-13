# Déploiement du pipeline d'ingestion

## Prérequis persistants

Le mode persistant est volontairement fail-closed. Il requiert simultanément :

- PostgreSQL migré avec `npm run db:migrate` et un `DATABASE_POOL_SIZE` explicitement dimensionné ;
- un bucket S3 privé dans la région choisie, Block Public Access, Versioning, chiffrement et Object Lock activés ;
- CORS S3 limité au domaine PROBANT, aux méthodes `PUT`, aux en-têtes signés `content-type`, `x-amz-checksum-sha256` et `x-amz-meta-*` ;
- une queue SQS standard avec DLQ et redrive policy ;
- le worker Lambda `workers/ingestion-lambda.handler`, event source mapping SQS avec partial batch response ;
- un rôle IAM Lambda lecture S3, SQS et accès réseau PostgreSQL ;
- un rôle IAM Vercel assumable par OIDC, limité à `s3:PutObject`/`s3:HeadObject` sur le préfixe du bucket et `sqs:SendMessage` ;
- une passerelle d'identité produisant les en-têtes signés `x-probant-auth-context` et `x-probant-auth-signature` ;
- toutes les limites de `INGESTION_LIMITS.md` et `DIRECT_UPLOAD_TTL_SECONDS`.

Une requête sans contexte signé, une signature expirée, un dossier hors périmètre ou une configuration manquante ne produit ni URL S3 ni job. Les credentials AWS statiques sont refusés sur Vercel : `AWS_ROLE_ARN` et l'OIDC Vercel sont utilisés.

## Flux et reprise

L'initialisation crée le document/job avant la signature. Après le `PUT` direct, la finalisation fait `HEAD`, vérifie taille, MIME et métadonnées, puis publie le job. Si la publication échoue, le job reste `uploaded` et la finalisation idempotente peut être rejouée. Déployer `workers/ingestion-reconciler.ts` comme Lambda planifiée : elle republie les jobs `uploaded` dont `queue_published_at` reste nul. L'événement planifié fournit explicitement `batchSize` (1 à 500), afin que ce débit soit choisi par l'exploitation et non caché dans le code.

SQS délivre au moins une fois. La PK des lignes, les contraintes uniques de contrôles/snapshots et les transitions conditionnelles rendent le consumer rejouable. Configurer la DLQ après un nombre de tentatives validé par l'exploitation ; aucune valeur n'est imposée ici.

## Observabilité minimale

- logs structurés sans contenu FEC : `jobId`, `organizationId`, état, tentative, durée, compteurs ;
- alarmes CloudWatch : âge du message le plus ancien, messages DLQ, erreurs Lambda, throttling et durée p95 ;
- requêtes PostgreSQL : jobs `uploaded` non publiés, jobs actifs au lease expiré, taux `failed`/`quarantined`, durée par état ;
- corrélation HTTP via `requestId` retourné dans chaque erreur.

## Mode démo

Sans aucune variable DB/AWS/auth, les fixtures et snapshots de démonstration restent disponibles. Aucune connexion PostgreSQL, S3 ou SQS n'est ouverte tant qu'une route persistante n'est pas appelée.
