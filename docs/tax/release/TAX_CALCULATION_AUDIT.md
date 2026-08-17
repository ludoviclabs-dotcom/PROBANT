# TAX-10 — Audit A indépendant

## Verdict

**PASS_WITH_LIMITATIONS**

Les moteurs IS et TVA, l'arithmétique en centimes, la chaîne de revue et les exports TAX-09 passent les tests disponibles. Aucun P0 n'a été relevé. La contre-audit post-correction confirme que les hashes des fichiers et snapshots synthétiques sont désormais alignés, que les millésimes TVA 2025/2027 sont bloqués et que l'isolation organisationnelle de la revue est filtrée et gardée en base. Le parcours E2E ne traverse toutefois toujours pas le flux persistant annoncé.

**Constat bloquant explicitement un `GO` sans limitation : A-02.** Il reste compatible avec un `GO_WITH_LIMITATIONS` seulement si la release est présentée comme une validation du moteur sur objets canoniques et du cockpit de démonstration, sans revendiquer la chaîne d'ingestion/persistance complète.

Audit réalisé sur l'arbre de travail `tax09-clean` le 17 août 2026. Il s'agit d'une revue indépendante en lecture seule du code d'implémentation ; seul le présent rapport a été ajouté.

## Périmètre

- moteurs IS et TVA, arithmétique et règles de prudence ;
- fixtures synthétiques, 21 golden cases et propriétés TAX-10 ;
- exports et manifeste TAX-09 ;
- chaîne SHA-256, événements append-only et projection de snapshot ;
- migrations `review_events`, dépôt PostgreSQL, autorisation et isolation organisationnelle ;
- représentativité du parcours Playwright TAX-10.

## Méthode et preuves

Revue statique ciblée des modules suivants :

- `lib/tax/release/synthetic-fixtures.ts`, `golden-cases.ts` et `__tests__/release-gate.test.ts` ;
- `lib/tax/corporate-tax/*`, `lib/tax/vat/*` ;
- `lib/evidence/tax-package.ts`, `tax-review.ts`, `tax-types.ts` ;
- `lib/dossier/review.ts`, `review-repository.ts`, `postgres-repository.ts` ;
- `drizzle/0002_append_only_review_evidence.sql`, `0004_tax_review_evidence.sql` et leurs tests ;
- `app/api/dossiers/[dossierId]/review-events/route.ts`, composants de revue/export et `e2e/tax-release-gate.spec.ts`.

Commandes exécutées :

```text
npx vitest run --config vitest.config.mjs --configLoader runner
=> 62 fichiers, 687 tests passés

npx vitest run --config vitest.config.mjs --configLoader runner \
  lib/tax/release/__tests__/release-gate.test.ts \
  lib/tax/corporate-tax/__tests__ lib/tax/vat/__tests__ \
  lib/evidence/__tests__/tax-package.test.ts \
  lib/dossier/__tests__/review-events.test.ts \
  lib/dossier/__tests__/append-only-migration.test.ts
=> 9 fichiers, 120 tests passés

npm run typecheck
=> passé

npx eslint lib/tax/release lib/evidence lib/dossier/review.ts \
  lib/dossier/review-repository.ts
=> passé

npm run db:check
=> 7 migrations up, 17 tables, invariants valides
```

La contre-audit post-correction a ajouté les preuves ciblées suivantes :

```text
npx vitest run ... release-gate.test.ts engine.test.ts
=> 2 fichiers, 41 tests passés

npx vitest run ... review-events.test.ts append-only-migration.test.ts isolation.test.ts
=> 3 fichiers, 22 tests passés

npm run typecheck
=> passé

npm run db:check
=> 7 migrations up, 17 tables, invariants valides
```

Deux sondes ont en outre vérifié les 15 couples fichier/snapshot et exécuté la TVA 2025/2027 après correction.

Après cette revue, la gate globale a également rapporté : build de production passé, lint sans erreur (8 avertissements préexistants), **29 E2E passés et 1 scénario persistant ignoré**. Ce résultat confirme la stabilité du mode testé ; le scénario persistant ignoré ne lève pas A-02.

## Constats

### A-01 — PARTIELLEMENT RÉSOLU — résiduel P2 — Les fichiers synthétiques ne traversent pas encore le parseur

**Correction confirmée.** `buildSyntheticTaxFixtureSet` construit maintenant les fichiers avant les snapshots et transmet le SHA-256 exact du fichier comme `sourceHash`. Les champs portent le même `documentHash`. La sonde a obtenu `equal: true` pour les cinq snapshots documentaires de chacun des millésimes 2025, 2026 et 2027, soit 15/15 couples. Le test de release impose désormais explicitement ces égalités.

**Résiduel.** Les golden cases consomment toujours les snapshots fabriqués directement ; aucun parseur ne relit les dix fichiers synthétiques. La provenance cryptographique est réparée, mais la gate ne valide pas encore la fidélité `fichier → parsing → snapshot → calcul` et ne détecterait pas une dérive de parsing ou de normalisation.

Action recommandée : ajouter séparément un test d'intégration des processeurs sur ce corpus. Ce résiduel n'est plus classé P1, car l'identité cryptographique demandée est maintenant prouvée.

### A-02 — P1 — Le parcours E2E n'est pas un flux fiscal persistant de bout en bout

Le scénario Playwright ouvre trois surfaces indépendantes : dépôt, onboarding, puis cockpit fiscal. Il téléverse une balance en mémoire, sélectionne l'exercice **2024**, puis ouvre `/dashboard/fiscalite`, qui reconstruit toujours `getDemoTaxCockpitSource()` côté serveur. Le document déposé et le profil saisi ne deviennent donc pas les entrées des contrôles affichés.

La revue et le justificatif du cockpit sont eux aussi conservés dans l'état React, avec acteur et identifiants de démonstration. Le scénario ne traverse ni l'API authentifiée de revue, ni `DrizzleReviewEventRepository`, ni les tables TAX-09, ni la reprise après rechargement. Il vérifie correctement le comportement de la démo, pas le flux annoncé `créer dossier → déposer → profiler → calculer → revoir → exporter`.

Action requise avant un `GO` sans limitation : ajouter un E2E connecté à un PostgreSQL de test et à un stockage synthétique, réutiliser un millésime 2025/2026/2027, puis prouver que les documents déposés et le profil persistent jusqu'au manifeste.

### A-03 — RÉSOLU — La TVA bloque les millésimes de formulaire non publiés

Le mapping TVA déclare maintenant son millésime 2026. Le moteur interroge le registre par formulaire et millésime avant toute lecture ; en l'absence de publication, il produit `UNSUPPORTED_VAT_FORM_VINTAGE`, `status: blocked` et `outcome: missing_information`. `readVatDeclaration` n'attache la référence du formulaire 2026 que lorsque le millésime correspond.

Le test de propriété exécute désormais réellement `reconcileVat` pour 2025 et 2027 et vérifie le blocage ainsi que l'absence de référence `form-ca3-v2026`. La sonde indépendante reproduit les deux blocages et aucune exécution de contrôle n'a lieu. A-03 est clos.

### A-04 — RÉSOLU SOUS RÉSERVE A-05 — L'isolation organisationnelle de `review_events` est imposée dans les chemins audités

La correction couvre les trois couches relevées :

- `loadReviewEvents` reçoit maintenant le `DossierContext`, joint `dossiers` et filtre l'organisation du dossier ainsi que celle de l'événement ;
- les lectures internes, la recherche du finding et la validation des justificatifs reprennent le même contexte organisationnel ;
- la migration 0004 ajoute un trigger `BEFORE INSERT` qui compare l'organisation de l'événement à celle du dossier et lève `REVIEW_EVENT_ORGANIZATION_SCOPE_MISMATCH` ;
- le down supprime proprement le trigger et la fonction.

Les événements historiques `organization_id IS NULL` restent lisibles sans réécriture, tandis qu'une action fiscale nouvelle exige une organisation. Les tests ciblés et `db:check` passent. A-04 est clos au niveau applicatif et DDL ; l'exécution réelle du trigger sur PostgreSQL reste couverte par la réserve distincte A-05.

### A-05 — P2 — Les migrations append-only ne sont pas appliquées sur un PostgreSQL réel dans cette gate

`append-only-migration.test.ts` vérifie la présence de chaînes SQL. `db:check` vérifie le manifeste et les invariants statiques. Aucun test de cette gate n'applique les migrations up/down sur une base PostgreSQL puis ne tente réellement un `UPDATE`, un `DELETE`, un fork, une organisation étrangère ou une restauration.

La DDL lue est cohérente : triggers d'interdiction, unicité de racine/prédécesseur, formats de hash et ajout nullable préservant les événements antérieurs. L'absence d'essai PostgreSQL laisse toutefois non prouvés le déploiement réel et les interactions entre contraintes.

Action recommandée : test d'intégration éphémère PostgreSQL couvrant migration, append concurrent, rejet update/delete/fork, isolation et down contrôlé.

### A-06 — P2 — Le justificatif E2E n'est ni persisté ni récupérable depuis le manifeste

Le composant lit les octets du fichier pour produire un SHA-256, puis ne conserve que des métadonnées en mémoire (`location: null`). Le contenu n'est ni stocké, ni exporté comme artefact, ni relié à une clé de stockage récupérable. Le test E2E confirme uniquement que l'identifiant apparaît dans `sourceDocuments` du manifeste.

La liaison constat ↔ identifiant ↔ hash existe pendant la session, mais une recharge fait disparaître la pièce et un tiers ne peut pas recharger ses octets pour vérifier le hash.

Action recommandée : réserver ce composant au mode démo de façon explicite et tester en parallèle la persistance/lecture de la pièce via le service de documents du dossier.

### A-07 — PARTIELLEMENT RÉSOLU — résiduel P3 — Les propriétés génératives restent étroites

**Correction confirmée.** Chacune des 21 définitions golden porte désormais un `expectedSnapshotHash` SHA-256 complet et commité. La gate exige l'égalité exacte du hash canonique pour les dix snapshots IS et les onze snapshots TVA, en plus des statuts, outcomes et montants pivots. Une dérive sur les traces, sources, limitations ou autres champs canoniques modifie le hash et fait échouer le scénario. Le contre-test ciblé passe : 1 fichier, 12 tests, dont les 21 oracles exacts.

**Résiduel.** La permutation TVA se limite à l'inversion d'un petit FEC nominal ; le contrôle « aucun montant flottant » inspecte principalement les propriétés suffixées `Cents`/`BasisPoints`. Ce sont de bonnes régressions déterministes, mais pas une campagne générative couvrant plusieurs tailles, permutations et valeurs limites.

Action recommandée : ajouter plusieurs permutations/générations bornées, valeurs limites et noms de champs monétaires contrôlés par schéma. La faiblesse initiale des oracles golden est close ; seul ce résiduel de profondeur des propriétés reste classé P3.

## Points passés

- Les dix familles documentaires existent pour 2025, 2026 et 2027, sont marquées synthétiques et ont des hashes de fichier déterministes.
- Les dix cas IS et onze cas TVA demandés sont présents et exécutables.
- L'arithmétique IS utilise `bigint` pour produits, sommes et différences, rejette les centimes non entiers/non sûrs et n'applique le taux réduit que si tous les critères sont démontrés.
- L'absence de déclaration IS bloque le calcul ; la liasse contradictoire n'est pas arbitrée silencieusement.
- La TVA ne qualifie pas un taux observé comme taux légal et ne donne plus le niveau de preuve « déclaration + facture » lorsqu'une pièce déductible manque.
- La garde centrale TVA rabat les résultats concluants sur `inconclusive` lorsqu'il n'existe ni FEC ni déclaration exploitable.
- L'ordre inverse des lignes FEC du cas nominal produit le même hash TVA.
- Les huit actions fiscales sont typées, intégrées au hash et projetées dans un nouveau snapshot sans mutation de l'ancien.
- La chaîne de revue détecte hash altéré, fork, doublon et discontinuité ; les écritures du dépôt sont sérialisées par verrou de dossier et transaction.
- L'API de revue prend l'acteur et l'organisation du principal authentifié, pas du corps de requête.
- Le paquet fiscal est déterministe, contient neuf artefacts, vérifie hashes/tailles/références et ne revendique pas PDF/A sans validation.
- Le constructeur d'export rejette les mélanges d'organisation/dossier sur les objets fiscaux qu'il reçoit.

## Limites de l'audit

- Aucun avis juridique ou validation fiscale matérielle des montants n'est fourni par cet audit.
- Les sources normatives et formulaires n'ont pas été revérifiés sur Internet ; l'audit porte sur leur usage et leur versionnement dans le code.
- Le build de production et Playwright n'ont pas été relancés par l'Audit A ; ils relèvent de la gate globale/QA visuelle. Le test E2E a été revu statiquement.
- Aucune base PostgreSQL, stockage objet ou fournisseur OIDC réel n'a été démarré.

## Conclusion Audit A

Le cœur de calcul présente de bonnes garanties de prudence, d'exactitude entière et de déterminisme, confirmées par 687 tests. L'append-only et l'export sont correctement structurés au niveau applicatif. Les corrections A-01, A-03 et A-04 lèvent le risque de hash divergent, le mélange de formulaire TVA et le défaut de filtrage organisationnel relevés initialement. Le niveau de preuve de la **release gate** reste néanmoins inférieur à celui d'un flux de production, car l'E2E ne traverse pas la persistance et les migrations ne sont pas exécutées sur PostgreSQL. Verdict final Audit A inchangé : **PASS_WITH_LIMITATIONS**.
