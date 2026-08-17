# Formats d'export du dossier de preuve

Les exports sont produits à partir du `DossierSnapshot` actif. Le contexte actif
(`demo`, `session` ou `persistent`) et son `dossierId` sont vérifiés avant toute
génération afin d'empêcher l'export du dossier DEMO lorsqu'un autre dossier est
sélectionné.

## Formats

| Format | Contenu | Encodage et stabilité |
|---|---|---|
| JSON canonique | Snapshot, événements de revue et manifeste | UTF-8, clés triées récursivement, tableaux dans leur ordre métier, sans espace superflu |
| CSV findings | Constats et statut de revue courant | UTF-8, en-tête stable, champs échappés selon RFC 4180 |
| CSV review-events | Historique append-only complet et hashes de chaîne | UTF-8, ordre de chaîne, listes sérialisées en JSON canonique |
| CSV controls | Contrôles, versions et résultats | UTF-8, en-tête stable |
| CSV sources | Documents, SHA-256, localisation et parseur | UTF-8, en-tête stable |
| HTML | Dossier lisible, accessible et imprimable | HTML sémantique en français, tableaux légendés, styles d'impression intégrés |
| PDF | Dérivé textuellement du même HTML | PDF standard ; **ne porte jamais le label PDF/A sans validation externe réussie** |

## Nommage et intégrité

Le préfixe de fichier est `probant-<siren>-<exercice>-<hash12>`, où `hash12`
est un raccourci réservé au nom. Les contenus et le manifeste conservent
toujours les SHA-256 complets sur 64 caractères hexadécimaux.

Chaque artefact est décrit dans `manifest.artifacts` par son nom, son type MIME,
sa taille, son SHA-256 complet et, pour le PDF, son état de validation
d'archivage. Le manifeste suit [`MANIFEST_SPEC.md`](./MANIFEST_SPEC.md).

## Extension fiscale TAX-09

Le paquet fiscal spécialisé ajoute les neuf artefacts déterministes documentés
dans [`TAX_EVIDENCE_EXPORTS.md`](../tax/TAX_EVIDENCE_EXPORTS.md). Il réutilise la
sérialisation canonique, SHA-256, `ReviewEvent`, la dérivation HTML → PDF et les
règles de cloisonnement du paquet général. Son manifeste porte la version
`1.0.0-tax`; il ne revendique jamais PDF/A sans validation enregistrée.

## Règles de reproductibilité

- Le JSON canonique constitue la représentation de référence avant hash.
- Une nouvelle décision de revue ajoute un événement, produit un nouveau
  snapshot et change les exports ; aucun événement antérieur n'est réécrit.
- Les dates incluses dans un package proviennent du snapshot et du contexte de
  génération fourni, jamais de lectures implicites répétées de l'horloge.
- Une preuve absente reste visible dans `limitations` et n'est pas masquée à
  l'export.
- Les cellules commençant comme une formule de tableur (`=`, `+`, `-`, `@`) sont
  préfixées par une apostrophe afin que les champs libres restent du texte.

La stratégie PDF/A et PAdES est détaillée dans
[`ADR-008-pdf-a-pades.md`](../adr/ADR-008-pdf-a-pades.md).
