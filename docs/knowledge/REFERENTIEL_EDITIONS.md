# Éditions du registre normatif du moteur

> Registre concerné : `SOURCES` et `SEUILS_INTERNES` de `lib/referentiel/sources.ts`.
> Journal : `REFERENTIEL_EDITIONS` de `lib/referentiel/edition.ts`.
> Mis en place le 14/10/2026, à la suite de la revue Codex de la PR #89.

## Ce qu'une édition identifie

Une édition identifie un **contenu** du registre. Ce n'est ni une date d'état du
droit (chaque source garde sa propre date d'effet) ni une attestation de
relecture : la limitation `source_review_required` de la Synthèse reste due.

| Élément | Valeur |
|---|---|
| Empreinte | SHA-256 du JSON canonique `{ sources, seuilsInternes }` (clés triées, `lib/synthesis/canonical.ts`, implémentation pure utilisable dans le navigateur) |
| Identifiant inscrit dans les snapshots (`Dossier.referentielVersion`), dans les liens (`reference=`) et dans `referenceSetVersion` | `ed<N>-<12 premiers caractères de l'empreinte>`, par exemple `ed2-cf23de34ea7f` |
| Libellé affiché | « éd. N » ; l'info-bulle donne l'empreinte et la date d'entrée du contenu |
| Contenu non déclaré dans le journal | `brouillon-<12 caractères>` : le poste ne revendique aucune édition |

Un snapshot existant garde l'identifiant sous lequel il a été produit. Un lien
qui porte un autre identifiant que le dossier est refusé par la garde existante
(`lib/dossier/client.tsx`).

## Ajouter une édition

1. Modifier `SOURCES` ou `SEUILS_INTERNES`.
2. Lancer `lib/referentiel/__tests__/edition.test.ts`. Le test échoue et donne
   l'empreinte du nouveau contenu.
3. Ajouter **à la fin** de `REFERENTIEL_EDITIONS` l'édition `N+1` : empreinte,
   date du changement du registre, motif, clés modifiées.
4. Ajouter la même paire `{ numero, empreinte }` à `EDITIONS_PUBLIEES` dans le
   test. Les éditions déjà publiées ne se modifient jamais.

## Identifiant antérieur « 2024-01-01 »

Avant le journal, `REFERENTIEL_VERSION` valait toujours `"2024-01-01"`. Six
contenus distincts l'ont porté sur main. Un snapshot qui porte cette valeur la
garde ; il est affiché « 2024-01-01 (antérieur) », sans contenu déterminable.

| Commit | Date | Entrées | Empreinte `{ sources, seuilsInternes }` |
|---|---|---|---|
| 644e92f | 29/06/2026 | 16 | `5a8c0693b1d19668b03894209d71117042cf45c2ca59a15bfd4eb1bf5979bec6` |
| 9549f83 | 29/06/2026 | 22 | `b183bdf9236956c36abfb46ac96211480de7e4b2e391b6e476bb7094eea04021` |
| ad3fd88 | 29/06/2026 | 22 | `87712fe797311b8f0f1e22be12f4c5cd97d82fcac2d1a0e9646a11c0bc3111b1` |
| 1f9cb2b | 29/06/2026 | 23 | `8b34bc7b7a3bf19beac2e05db66ebdbf59545361df62866a39c2a0095cb0a985` |
| d66d77a | 30/06/2026 | 24 | `acef171f2d35f38548ee5f4f5ddc658d7e4979fedf994c0e51396233591b89bd` |
| f0bc8f2 | 16/08/2026 | 27 | `cf23de34ea7f5e42e2242180bf2d2ee6b1fd5b1bb544fbe3eeab0473b191075f`, devenue l'édition 2 |

Méthode : `git show <commit>:lib/referentiel/sources.ts`, chargement du module,
puis `stableHash({ sources: SOURCES, seuilsInternes: SEUILS_INTERNES })`. Le
numéro d'édition 1 est réservé à cet identifiant antérieur.
