# TAX-10 — Tax readiness report

Date de décision : 2026-08-17
Décision : **GO_WITH_LIMITATIONS**

## Portée de la décision

La release est autorisée comme validation du **Tax Engine sur données synthétiques**, de ses objets canoniques, de la revue append-only TAX-09, des neuf exports et du cockpit fiscal de démonstration.

Elle n'est pas autorisée à se présenter comme la validation d'un parcours de production continu ou persistant entre création du dossier, dépôt, parsing, profil fiscal, calcul, revue, stockage du justificatif et manifeste.

## Résultats de la gate

| Gate | Résultat final |
|---|---|
| Corpus synthétique | 10 familles × 3 millésimes ; 30 fichiers hachés |
| Provenance documentaire | 15/15 couples fichier/snapshot ont le même SHA-256 |
| Golden cases | 10 IS + 11 TVA ; 21/21 snapshots figés par hash complet |
| Propriétés TAX-10 | déterminisme, permutation, entiers, absence d'entrée, période, sources, preuve TVA et taux réduit IS |
| Tests unitaires complets | **688/688 réussis**, 62 fichiers |
| Gate TAX-10 ciblée | **12/12 réussis** |
| TypeScript | réussi |
| ESLint | 0 erreur ; 8 avertissements préexistants |
| Migrations | `db:check` réussi ; 7 migrations, 17 tables, invariants valides |
| Build production | réussi ; 148 pages statiques générées |
| E2E TAX-10 | **6/6 réussis** |
| E2E complet | **29 réussis, 1 persistant ignoré** |
| QA visuelle | 5 viewports, erreur, clavier, console, réseau, Axe et reduced-motion testés |
| Audit A | `PASS_WITH_LIMITATIONS` |
| Audit B | `PASS_WITH_LIMITATIONS` |

La vérification Chrome DevTools a complété Playwright sur l'arbre d'accessibilité, la console et le réseau. Elle a permis de détecter puis corriger le `404` de favicon par `app/icon.svg`.

## Éléments livrés

- fixtures synthétiques FEC, balance, formulaires, factures, avis fiscal et paie pour 2025, 2026 et 2027 ;
- 21 golden cases exécutables et leurs empreintes attendues ;
- garde de millésime TVA empêchant toute citation de formulaire ou source hors période ;
- huit actions de revue, chaîne SHA-256, projection du snapshot et isolation organisation/dossier ;
- neuf artefacts TAX-09, note fiscale HTML/PDF et manifeste vérifiable ;
- parcours E2E et QA visuelle ;
- audits A et B indépendants.

## Limitations acceptées

1. **Parcours intégré non prouvé — P1.** Le dépôt/onboarding et le cockpit fiscal restent deux surfaces de démonstration ; ils ne propagent pas un même document et un même profil jusqu'au manifeste PostgreSQL.
2. **Ingestion non couverte — P2.** Les hashes de fichiers et snapshots concordent, mais les golden cases ne traversent pas les parseurs.
3. **Persistance non exécutée — P2.** Les triggers PostgreSQL sont présents et testés statiquement ; aucun PostgreSQL éphémère n'a exécuté les migrations, les rejets append-only et les attaques d'isolation.
4. **Justificatif de démonstration — P2.** La pièce rattachée est hachée et manifestée en mémoire, sans stockage ni récupération de ses octets.
5. **Réserve normative.** Les formulaires 2026 restent `review_required`. La réserve est désormais adjacente aux constats et exportée dans le manifeste.
6. **Couverture fiscale bornée.** IS/TVA 2025 et 2027 restent bloqués ; certaines sources TVA cessent de couvrir les périodes à compter du 1er septembre 2026.
7. **QA visuelle — P2.** Aucune violation Axe critique n'est admise, mais une dette de contraste `serious` du chrome partagé reste sous baseline.
8. **Propriétés bornées — P3.** Les snapshots complets sont figés, mais les permutations et valeurs générées ne constituent pas une campagne exhaustive.

## Motif de décision

`NO_GO` n'est pas retenu : aucun P0 n'a été trouvé, les 21 scénarios, les règles de prudence, les exports, les hashes, le manifeste et les six E2E TAX-10 passent.

`GO` n'est pas retenu : les audits A-02 et B-01 convergent sur l'absence de flux intégré persistant, et cette preuve est nécessaire avant toute revendication de préparation production.

La décision correcte est donc **GO_WITH_LIMITATIONS**, limitée au périmètre synthétique décrit ci-dessus.

## Conditions de passage à GO

- exécuter un seul E2E continu sur le même dossier, le même millésime et les mêmes hashes, du dépôt au manifeste ;
- appliquer les migrations sur PostgreSQL et prouver les rejets update/delete/fork/mélange d'organisation ;
- persister puis relire le justificatif et vérifier ses octets contre le hash manifesté ;
- faire traverser le corpus aux parseurs et comparer les snapshots produits aux oracles ;
- épingler les dates exactes des formulaires `review_required` ou conserver une limitation bloquante adaptée ;
- ramener la dette de contraste `serious` à zéro pour revendiquer la couverture WCAG correspondante.

## Rapports associés

- `TAX_GOLDEN_CASES.md`
- `TAX_SOURCE_AUDIT.md`
- `TAX_CALCULATION_AUDIT.md`
- `TAX_VISUAL_QA.md`
- `TAX_KNOWN_LIMITATIONS.md`
