# Limites d'ingestion

## Règle de configuration

Le runtime persistant refuse de démarrer si l'une de ces variables manque ou n'est pas un entier strictement positif :

- `MAX_UPLOAD_BYTES`
- `MAX_FEC_LINES`
- `MAX_LINE_BYTES`
- `MAX_FIELD_BYTES`
- `MAX_PARSE_DURATION_MS`
- `MAX_CONCURRENT_JOBS_PER_ORG`

Il n'existe aucun défaut de production dans le code. Les valeurs ci-dessous sont un point de départ mesuré, à valider sur l'infrastructure cible avec les latences S3/PostgreSQL et le corpus client réel.

## Benchmark du 13 août 2026

Commande reproductible :

```text
npm run benchmark:ingestion -- --lines=250000
npm run benchmark:ingestion -- --lines=250000 --materialize
```

Environnement : Windows, Node 24.14.0. FEC synthétique UTF-8, 18 colonnes, lots de 1 000 lignes. La variante `materialize` conserve les objets en mémoire pour simuler les contrôles historiques actuels ; elle ne mesure pas PostgreSQL, S3 ou le moteur de règles.

| Lignes | Octets | Mode | Durée | Débit | Pic RSS |
|---:|---:|---|---:|---:|---:|
| 10 000 | 1 166 868 | flux / lots libérés | 138 ms | 72 464 lignes/s | 86 MiB |
| 100 000 | 11 966 871 | flux / lots libérés | 1 813 ms | 55 157 lignes/s | 88 MiB |
| 250 000 | 30 416 871 | flux / lots libérés | 5 862 ms | 42 648 lignes/s | 122 MiB |
| 250 000 | 30 416 871 | matérialisation contrôles | 4 406 ms | 56 741 lignes/s | 310 MiB |

Le temps inférieur de la dernière ligne est une variation d'exécution ; la métrique déterminante est le pic mémoire.

## Recommandation initiale, non automatique

| Variable | Recommandation de préproduction | Justification |
|---|---:|---|
| `MAX_UPLOAD_BYTES` | `134217728` (128 MiB) | Plus de 4 × le FEC 250k mesuré, tout en restant très inférieur à la limite S3 single PUT de 5 Gio |
| `MAX_FEC_LINES` | `250000` | Plus grand corpus exécuté dans ce benchmark ; ne pas augmenter sans test contrôles + DB |
| `MAX_LINE_BYTES` | `262144` (256 KiB) | Enveloppe défensive très supérieure aux lignes du corpus ; bloque une ligne pathologique avant accumulation |
| `MAX_FIELD_BYTES` | `65536` (64 KiB) | Enveloppe défensive ; test adverse présent, à confronter aux libellés réels |
| `MAX_PARSE_DURATION_MS` | `300000` (5 min) | Environ 51 × la durée du parse 250k local ; laisse la marge au réseau et aux insertions sans approcher les 15 min Lambda |
| `MAX_CONCURRENT_JOBS_PER_ORG` | `2` | Deux matérialisations 250k représentent environ 620 MiB hors DB/règles ; limite initiale prudente par tenant |

Ces recommandations ne constituent pas une capacité certifiée. Avant production : mesurer S3 → parse → insert → contrôles → snapshot, répéter au moins 20 fois, conserver p50/p95/p99, et vérifier que p95 reste sous 70 % de la mémoire et de la durée du runtime (seuil d'évolution ADR-005).

## Limites XLSX futures

Les limites locales du mode démo sont distinctes et ne sont jamais reprises par le runtime persistant. PR-03 n'expose pas de consumer durable XLSX. Avant d'en ouvrir un, son déploiement devra définir une taille décompressée maximale et un ratio de compression maximal ; une archive ZIP64 ou dépassant ces seuils devra être mise en quarantaine avant parsing.

## Changement

Tout changement de limite de production est une modification de configuration auditée avec : ticket, auteur, date, environnement, résultats du benchmark, impact mémoire/durée/DB et plan de retour arrière. La hausse de `MAX_FEC_LINES` implique obligatoirement de rejouer le mode `--materialize` tant que les contrôles historiques consomment un tableau complet.
