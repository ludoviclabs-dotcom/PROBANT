# Spécification du manifeste de preuve

Statut : version 1.0.0, applicable aux exports PROBANT PR-07.

## Objet

Le manifeste relie un dossier actif, ses documents sources, les versions de traitement, la chaîne de revue append-only, un snapshot de synthèse et les artefacts qui en dérivent. Il ne remplace ni le document source ni le journal d'événements : il en porte les identifiants et empreintes vérifiables.

Le manifeste est sérialisé en JSON canonique avant tout calcul d'empreinte : clés d'objets triées récursivement, tableaux dans leur ordre métier déterministe, aucune indentation, valeurs `undefined` omises, nombres non finis interdits, encodage UTF-8. L'algorithme est SHA-256 et les empreintes sont des chaînes hexadécimales minuscules de 64 caractères.

## Contrat minimal

```ts
interface EvidenceManifest {
  manifestVersion: "1.0.0";
  applicationVersion: string;
  dossierId: string;
  snapshotId: string;
  createdAt: string; // ISO 8601 UTC
  sourceDocuments: Array<{
    id: string;
    fileName: string;
    documentType: string;
    sha256: string;
    location: {
      provider: string;
      bucket?: string;
      key: string;
      versionId?: string;
    } | null;
    parserVersion: string | null;
  }>;
  parserVersions: Record<string, string>; // documentId -> version
  ruleSetVersion: string;
  referenceSetVersion: string;
  policyVersion: string;
  snapshotSha256: string;
  reviewEventsDigest: string;
  artifacts: Array<{
    id: string;
    format: string;
    fileName: string;
    mediaType: string;
    sha256: string;
    byteLength: number;
    derivedFrom?: string;
    validation?: object;
  }>;
  limitations: Array<{
    code: string;
    message: string;
    subjects: string[];
  }>;
}
```

Tous les champs ci-dessus sont obligatoires. Une information indisponible est représentée par `null`, une collection vide ou une limitation explicite; elle n'est pas supprimée silencieusement.

## Règles de construction

1. `dossierId` doit être celui du contexte actif et du snapshot. Un snapshot DEMO est exportable uniquement lorsque le contexte actif est DEMO.
2. `snapshotId` est adressé par contenu sous la forme `sha256:<snapshotSha256>`.
3. `sourceDocuments[].sha256`, `snapshotSha256`, `reviewEventsDigest` et `artifacts[].sha256` sont toujours complets. Aucun hash tronqué n'entre dans le manifeste.
4. `reviewEventsDigest` est le SHA-256 du JSON canonique de la liste ordonnée des `eventHash`. L'ordre est reconstruit depuis `previousEventHash`, pas depuis l'ordre d'arrivée du tableau.
5. Chaque artefact mentionné doit exister dans le paquet, avoir le `byteLength` déclaré et reproduire son SHA-256.
6. Le manifeste ne se référence pas lui-même dans `artifacts`, afin d'éviter une dépendance circulaire. Sa propre empreinte peut être stockée par le transport ou le registre de remise.
7. Le PDF est dérivé de l'artefact HTML, identifié par `derivedFrom`. Tant qu'aucun validateur n'a réussi, `validation.pdfA.status` vaut `not_validated`; le fichier reste nommé et présenté comme PDF standard.

## Chaîne de preuve

```text
document source + SHA-256 + localisation
  -> parser/version
  -> contrôle/version
  -> finding
  -> source normative/version
  -> review event + chaîne de hashes
  -> synthesis snapshot + SHA-256
  -> report artifact + SHA-256
```

Le JSON canonique conserve pour chaque constat les identifiants des documents résolus, les versions de parser, le contrôle et sa version, la référence normative et sa date d'effet, les événements de revue liés et le snapshot final. Lorsqu'un maillon ne peut pas être résolu, le constat reste exporté et une limitation `missing_evidence` est ajoutée.

## Artefacts version 1

| Format | Media type | Rôle |
|---|---|---|
| JSON canonique | `application/json` | Référence machine reproductible |
| Findings CSV | `text/csv;charset=utf-8` | Constats, contrôles, normes, preuves |
| Review events CSV | `text/csv;charset=utf-8` | Journal append-only et hashes |
| Controls CSV | `text/csv;charset=utf-8` | Contrôles/version et constats émis |
| Sources CSV | `text/csv;charset=utf-8` | Documents, SHA-256, localisation, parser |
| HTML | `text/html;charset=utf-8` | Lecture accessible et impression |
| PDF | `application/pdf` | Diffusion; dérivé du HTML |

## Vérification

Le bouton « Vérifier hash » et la CI doivent au minimum :

- recalculer le hash du snapshot hors `generatedAt`, `snapshotId` et `snapshotHash`;
- reconstruire et vérifier toute la chaîne `previousEventHash`/`eventHash`;
- recalculer chaque hash et taille d'artefact;
- vérifier que chaque format requis est référencé exactement une fois;
- refuser tout SHA-256 source incomplet;
- vérifier que le JSON du manifeste est canonique;
- afficher les preuves manquantes dans `limitations`.

## Évolution

Une modification incompatible impose une nouvelle `manifestVersion`. Ajouter un champ optionnel ne permet jamais de modifier rétroactivement un manifeste déjà remis : un nouveau snapshot, de nouveaux artefacts et un nouveau manifeste sont produits.

