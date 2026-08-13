# ADR-002 — Stockage objet des pièces sources

- **Statut** : accepté
- **Date** : 13 août 2026
- **Décision** : Amazon S3, derrière l'interface `ObjectStorage`

## Contexte

Les FEC et pièces déposées sont des éléments probants sensibles. Le navigateur doit les envoyer directement au stockage objet : aucune Function Vercel ne doit recevoir le corps complet via `request.formData()`. Le domaine ne doit dépendre ni de Vercel Blob ni du SDK AWS.

## Comparaison

| Critère | Vercel Private Blob | Amazon S3 |
|---|---|---|
| Upload direct | Token client délivré par le serveur, multipart transparent, jusqu'à 5 To | URL pré-signée `PUT` et multipart pré-signé ; le client ne reçoit aucune permission IAM |
| Confidentialité | Store privé, lecture/écriture authentifiée ; fonctionnalité **Beta** | Block Public Access, politiques IAM/bucket, chiffrement serveur et TLS ; service mature |
| Région | 20 régions ; région figée à la création | Région AWS choisie et figée à la création du bucket |
| Authentification workload | Token `BLOB_READ_WRITE_TOKEN` persistant côté serveur | Rôle IAM à privilège minimal ; depuis Vercel, échange OIDC contre des credentials AWS courts, sans secret AWS durable |
| Immutabilité | Refus d'écrasement par défaut au niveau SDK, mais pas de garantie WORM documentée | Versioning et politiques interdisant l'écrasement |
| Object Lock | Non documenté | WORM, rétention Governance/Compliance et legal hold ; requiert Versioning |
| Coût opérationnel | Très faible : produit intégré à Vercel | Plus élevé : compte AWS, IAM, lifecycle, observabilité et coûts S3 à piloter |
| Maturité | Private Blob est en Beta au 13/08/2026 | Service établi, cohérence forte après écriture dans toutes les régions |
| Gros fichiers | Upload client direct jusqu'à 5 To ; la lecture privée transite par une Function et Vercel déconseille généralement les fichiers privés > 100 Mo | Objet jusqu'à 5 To, multipart natif ; lecture directe par le worker dans la même région |

Sources : [Vercel Blob](https://vercel.com/docs/vercel-blob), [stockage privé Vercel Blob](https://vercel.com/docs/vercel-blob/private-storage), [uploads client Vercel Blob](https://vercel.com/docs/vercel-blob/client-upload), [SDK Vercel Blob](https://vercel.com/docs/vercel-blob/using-blob-sdk), [URL pré-signée S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/using-presigned-url.html), [multipart S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/mpuoverview.html), [S3 Object Lock](https://docs.aws.amazon.com/AmazonS3/latest/userguide/object-lock.html), [cohérence S3](https://docs.aws.amazon.com/AmazonS3/latest/userguide/Welcome.html), [OIDC Vercel](https://vercel.com/docs/oidc), [provider AWS OIDC Vercel](https://vercel.com/docs/oidc/reference).

## Décision

Amazon S3 est retenu. Pour un produit d'audit, la disponibilité de garanties WORM et la maturité priment sur l'intégration opérationnelle plus simple de Vercel Blob. Private Blob reste une option réévaluable lorsqu'il ne sera plus en Beta et s'il fournit une rétention immuable vérifiable.

Le domaine expose seulement :

- création d'un upload direct borné et expirant ;
- lecture d'un objet sous forme de `ReadableStream<Uint8Array>` ;
- lecture des métadonnées ;
- suppression seulement pour les objets non verrouillés et abandonnés.

L'adaptateur unique de ce PR est `S3ObjectStorage`. Les clés sont générées côté serveur et non dérivées du nom de fichier : `organizations/{organizationId}/dossiers/{dossierId}/documents/{documentId}/source`. Le navigateur ne choisit ni le bucket ni la clé. L'URL pré-signée est liée à la taille, au MIME déclaré et au checksum SHA-256 quand le navigateur peut le fournir.

Le bucket de production doit avoir Block Public Access, Versioning, chiffrement serveur, journalisation CloudTrail et Object Lock. La durée de rétention n'est pas codée en dur : elle relève d'une politique de conservation validée séparément. Aucun appel AWS ne doit apparaître dans le modèle canonique, le parseur ou le moteur de contrôles.

## Conséquences

- L'API d'initialisation vérifie le contexte d'organisation/dossier avant de signer.
- Une Function ne voit que les métadonnées d'upload, jamais le corps du gros fichier.
- Les credentials S3 du workload sont temporaires via OIDC en production ; les secrets statiques sont refusés par la configuration de production.
- Le mode persistant échoue fermé si contexte d'autorisation, PostgreSQL, bucket/région, rôle OIDC ou file de jobs manquent.
- Le mode démo n'instancie aucun adaptateur d'infrastructure.

## Réversibilité

Un autre fournisseur peut implémenter `ObjectStorage`, mais exige un nouvel ADR, un plan de copie vérifié par SHA-256 et une période de double lecture. Les identifiants persistés sont `provider`, `bucket`, `objectKey` et `versionId`, jamais une URL publique fournisseur.
