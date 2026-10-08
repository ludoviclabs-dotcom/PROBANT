# Handoff — Mission 11 : décisions et mouvements de capitaux propres (2026-10-08)

**Base :** `0c0b43186d7f9d3d2deadf24657e3508899b7ae6`, branche locale `codex/mission08-payables`. **Livraison de code et preuves :** `ddf685c537dc5a90995375aca73b78eee46f47c7`, branche `codex/mission11-equity`, worktree `mission11`. Ce handoff est ajouté ensuite dans un commit documentaire. Diff limité à Mission 11 au-dessus de cette base ; aucun push, PR distante, merge, déploiement, activation ou modification de configuration distante.

Main observé au début : `fdf1c12e8c1240e891c86913908f3aefbe5f9720`. Vercel observé en lecture seule au début : déploiement `dpl_HnY7R2uYjy8px3RqYhSjwZrWpWXv`, READY, même SHA. Ce constat ne décrit pas une vérification de production après livraison. La chaîne locale des missions 05–08 est une dépendance de ce lot et n'a pas été remplacée par main. Réconcilier cette chaîne et le main courant avant une intégration distante.

## Résultat utilisable

Le moteur existant `reviewEquity` est réutilisé par un adaptateur fermé `equity.review`. La feuille traite une unité décision/mouvement : cartographie des composantes et comptes, soldes ouverture/clôture, GL, tableau de variation, registre de décisions, PV/actes et règlements. Capital, primes, réserves, report, résultat, écarts, subventions, provisions réglementées et autres composantes sont déclarés applicables ou exclus avec pièce/justification. Un regroupement unique du capital fournit la base mathématique du ratio existant ; aucun ratio ne vaut conclusion juridique.

La distribution synthétique votée 30, comptabilisée 25 expose un écart de −5 et un règlement ultérieur distinct. Le transfert interne de 20 conserve ses deux jambes et un effet total nul. PV absent, effet hors période, décision sans écriture dans la période, écriture sans décision et cartographie incomplète restent visibles. Une comptabilisation ultérieure documentée apparaît dans la frise/export sans changer le solde de clôture ni la comparaison de période. Une source partielle ou inconnue ne devient pas zéro.

| Niveau | Maturité et preuve |
| --- | --- |
| Contrat / calcul | 25 tests ciblés réussis : métier, preuves, dates, mapping, exclusions, invalidation, gardes d'accès, erreurs et export |
| Imports | CSV/PDF de recette réellement lus et hachés ; XLSX réutilise le parseur commun, sans recette Equity XLSX spécifique ; PDF indexé, décision lue/citée humainement |
| Restitution / Synthèse | Recette Chrome du build final à 1440/1024/390 px, reduced-motion ; 1 procédure / 4 contrôles, dénominateurs et exclusions |
| Diagnostic / impression | Écran et export concordants sur les données synthétiques ; HTML imprimé sur 12 pages ; sources/version/localisateurs et originaux absents indiqués |
| Commandes / persistance | Adaptateurs PostgreSQL, transactions, version, idempotence, auteur serveur et permissions réutilisés ; quatre scénarios natifs préparés, non exécutés |
| Revue réelle / usage autorisé | Non validés sur infrastructure jetable ; gate fermé ; aucune activation réelle ou production |

## Parcours visibles et fichiers à reprendre

- `/equity` : Population, Tests, Exceptions, Pièces et Revue ; tableau de variation horizontal, tri/filtres de décisions, frise vote/effet/écriture/paiement et panneau du PV à la page pertinente. Seuls expansion et mouvement sélectionné sont animés (180 ms ; désactivés en reduced-motion).
- `/equity/synthesis` : file de travail, quatre contrôles prévus, exclusions, sources et versions périmées ; liens d'identité typés `decision:`, `movement:`, `component:`, `row:`. L'accès est relié depuis `/dashboard/synthese`.
- `/equity?demo=1` et variantes `case=long` / `case=incomplete` : démonstration locale explicitement synthétique, en lecture seule. Elle ne sauvegarde ni ne revoit une mission réelle et reste séparée de DEMO SA et de l'atelier existant.
- `/api/workpapers/equity`, `/imports`, `/export` : accès/mutations et téléchargements autorisés côté serveur, auteur provenant des sessions serveur, pas d'autorité depuis un rôle du navigateur. Diagnostic distinct du paquet approuvé.

Réutiliser `EquityRuntime`, `WorkpaperService`, les ports `ClientsWorkpaperRepository`/`ClientsImports`, `RequestAuthorizer` et la frontière monétaire canonique. Ne pas ouvrir les autres moteurs synthétiques. Convention, sources, mapping, population, sélection, calcul et décisions sont versionnés. Accusé serveur requis avant « Sauvegardée » ; conflit avec comparaison du brouillon et de la version serveur, réessai avec la même clé d'idempotence. Auto-approbation refusée, préparation par son auteur, revue par une autre identité autorisée. Source remplacée : nouvelle révision sans réécrire la décision ancienne.

Migration additive `drizzle/0008_equity_dossier.up.sql` : seuls sept types de source ajoutés à la liste fermée existante. Down refuse un rollback avec des données Equity. Aucun nouveau stockage de secours ni deuxième état métier React.

## Vérifications exécutées

Suite complète finale : **1 161 tests réussis, 22 ignorés ; 107 suites réussies, 1 ignorée**. Typecheck et build réussis. Lint : zéro erreur, sept avertissements préexistants. Manifeste contrôlé : 11 migrations montantes, 17 tables, invariants valides. Aucun SQL de migration exécuté sur une base dans cette livraison. Un test Clients existant a dépassé 5 secondes lors de l'exécution parallèle avec le build ; ses deux tests ont réussi seuls, puis la suite complète a été relancée sans build concurrent.

Captures réelles et rapport dans `docs/probant-lots/mission11-captures/` ; évaluation visuelle `design-qa.md`, contrat `MISSION11_CONTRACT.md`, titre/description prêts dans `MISSION11_PR.md`. Pas de maquette générée présentée comme capture. PV réel synthétique page 1/3 rendu, console sans erreur JavaScript sur les routes parcourues. Escape : focus DIST, position 936 px conservée. Liens décision/mouvement/composante contrôlés, libellé long, vide/erreur/aucun résultat et cartographie partielle. Comparaison avec l'atelier existant inspectée ; extension du parcours, aucune revendication de copie 1:1.

## Exactement ce qui reste non exécuté

PostgreSQL jetable absent, `PROBANT_CLIENTS_TEST_DATABASE_URL` non fourni ; Docker/psql indisponibles dans cette session. Les 22 tests natifs restent ignorés, dont ces quatre scénarios Mission 11 :

1. Imports CSV/PDF approuvés → cartographie → population/sélection figées → exécution → exceptions.
2. Identité serveur, citation exacte, deux organisations/quatre dossiers/deux rôles, accès transversal refusé, replay idempotent et concurrence transactionnelle.
3. Traitements cités → soumission → auto-approbation refusée → revue distincte/verrouillage ; exception conservée, paquet approuvé/PV/téléchargement protégés, expiration de session.
4. Déconnexion/reconnexion PostgreSQL (redémarrage Docker physique seulement si un identifiant de conteneur jetable est fourni), remplacement de source, export ancien invalidé et nouvelle révision préservant la revue précédente.

Ces tests utilisent des sessions serveur de recette initialisées avec un issuer/subject synthétique ; ils n'exécutent pas un échange OIDC avec un fournisseur externe. La connexion OIDC réelle, les sauvegardes/conflits/revues intégrés dans le navigateur, le redémarrage physique et l'application/rollback des migrations n'ont donc pas été validés ici. Aucun fallback mémoire n'est présenté comme durable.

Pour la suite : fournir une base locale jetable dédiée portant un nom finissant par `_test` ou `_ci`, appliquer les migrations existantes via `DATABASE_URL` pointant explicitement vers cette base, puis fournir la même URL dans `PROBANT_CLIENTS_TEST_DATABASE_URL` et exécuter le fichier `clients-durable.integration.test.ts` complet. Ne pas filtrer seulement les quatre tests Equity : ils dépendent du setup et de la séquence partagée. `PROBANT_CLIENTS_TEST_POSTGRES_CONTAINER` facultatif doit être l'identifiant hexadécimal du conteneur jetable autorisé. Aucun de ces prérequis n'a été activé ici.

L'interface réelle exige la configuration OIDC/session et les droits organisation/dossier existants. `PROBANT_EQUITY_DURABLE=disposable` est le gate explicite de recette, désactivé par défaut et refusé en production Vercel. Le serveur local laissé ouvert utilise uniquement `PROBANT_DEMONSTRATION_ENABLED=true` et l'origine `http://127.0.0.1:3198` ; le gate durable reste absent.

## Limites et dépendances du lot suivant

Méthode interne de rapprochement, EUR uniquement, période/formes/comptes déclarés à corroborer, aucune nouvelle règle juridique/comptable. Les pièces PDF sont indexées, sans extraction automatique du vote ; leur date/montant techniques d'index ne sont pas des faits de décision. Le PDF applicatif standard réutilisé conserve sa limite Latin-1 ; HTML/JSON gardent Unicode. Les originaux ne sont pas inclus dans le paquet et aucun archivage certifié n'est revendiqué. Une revue ne ferme pas les exceptions comme conformes.

Maturité : **pilote local cohérent, raccord durable préparé mais non validé sur PostgreSQL**. Les priorités suivantes sont la recette native ci-dessus, la réconciliation de la chaîne locale avec main et la qualification indépendante des sources/conventions. Toute future règle juridique devra être sourcée pour la forme sociale et la période avant implémentation. Le produit global n'est pas déclaré prêt.

---

Les handoffs ci-dessous sont conservés comme historique daté des lots 01/02. Leurs états « prompts suivants non exécutés » décrivent leur date de rédaction, pas la livraison locale actuelle.

# Handoff — lot 02 : fiabilité du dépôt historique (2026-10-03)

Base finale : `origin/main` **`83ba8638d260597af423d7426463aec0772f3bf0`**, PR #52, récupérée et intégrée localement sans conflit. Branche : `fix/historical-upload-reliability`. Lot 01 conservé et rebasé : `412e5677f01916d3c97a6141fd6185bdf05ce604` (ancien commit `ef7d4f0`). Code du lot 02 : `aeec05c67387d8f251b4f07d4c2aa38aef2340bb` ; ce handoff est livré ensuite dans un commit documentaire. Aucun push, PR, merge distant ou déploiement effectué.

Production vérifiée en lecture seule : déploiement Vercel `dpl_GQCbS5BWjP4hGCf9cykCXddgTjaY`, `READY`, alias `probant.vercel.app`, SHA **`83ba8638d260597af423d7426463aec0772f3bf0`**. Production = main ; les deux lots locaux ne sont pas en production.

## État de départ suivant

| Réserve | État | Preuve et parcours |
| --- | --- | --- |
| Tolérance issue des fixtures | Corrigé | `build-from-upload.ts` : tolérance technique explicite, 0 EUR par défaut ; toutes les lignes sélectionnées, signification inconnue sans seuil. Recette des onze cartes : un centime est détecté et affiché comme 0,01 EUR, même si la fixture utilise 500 EUR |
| Période / clôture implicites | Corrigé | `upload-contract.ts` réutilise `AccountingPeriod` et ses dates civiles ; la clôture confirmée passe au moteur. Période absente = diagnostic bloqué, 0 procédure exécutée/conclue, exercice « inconnue », aucune année courante inventée |
| Lettrage assimilé à une dépréciation | Corrigé | `qualify.ts`, `tabular.ts` : lettrage séparé ; l’ancienneté ne génère aucune estimation de perte ni dépréciation attendue. Test clôture explicite/ligne lettrée et tests Clients existants adaptés au sens corrigé |
| Taux fondé sur totaux nets | Corrigé | `engine.ts` : groupes univoques concordants / lignes importées. Les écarts bruts sont calculés par clé et signe, sans compensation entre signes ou groupes. +100/−100 face à zéro : nets égaux, brut 200 EUR, taux 0 % |
| Clés absentes / groupes multiples | Corrigé | Lignes conservées et référencées ; clé absente = non testable. Agrégation multiple concordante = ambiguë ; aucun rapprochement de lignes affirmé. Détails par bouton ou double clic : fichiers, lignes, montants signés, pièces/dates disponibles et empreintes |
| Compteurs depuis findings.length | Corrigé | Compteurs tirés des exécutions actives qualifiées. Un nominal sans finding compte une comparaison exécutée ; une qualification bloquée compte zéro. Export : une ligne de contrôle par exécution, y compris sans constat |
| Réimport / remplacement / revue ancienne | Corrigé | Identité dossier + cycle, version monotone, contrat 2.0.0. Modification de fichier/paramètres : précédent périmé et constats retirés des projections actives. Nouveau nominal : zéro ancienne exception. IDs des constats et documents propres à chaque version ; revue ancienne conservée dans l’historique, sans transfert |
| Pertes de mise à jour entre cycles | Corrigé en session | `updateSnapshot` et `DossierUpdateQueue` appliquent les transformations au dernier snapshot ; sélection, sauvegarde et revue sont sérialisées. Recette concurrente et E2E deux cycles → navigation → rechargement ; remplacer Clients préserve Fournisseurs |
| Assurance de couverture / promesses de stockage | Corrigé | Aucun contrôle après simple dépôt ; action explicite de comparaison. `cycleIdsCovered` vide, cartographie « comparés (dépôt limité) ». Synthèse plafonnée à une couverture partielle des documents fournis. Textes de dépôt, accueil, HTML et manifeste ne promettent ni archivage des originaux ni preuve opposable |
| Montant invalide distinct de zéro | Présent, renforcé et vérifié | Refus des montants absents/ambigus/non finis, sous-centime ou hors plage via la frontière monétaire existante. Zéro explicite accepté ; format « 12.500 » refusé. Aucun calcul de comparaison depuis un fichier illisible |
| Raccord durable des onze cartes | Manquant, blocage conservé | Le parcours historique utilise la session de l’onglet. Écriture/dépôt refusés sur dossier persistant ; son snapshot ne peut pas être sauvegardé par ce parcours. Ingestion FEC durable existante conservée |
| QA métier indépendante / usages opposables | Non vérifié | Données de recette synthétiques uniquement. Références normatives existantes toujours soumises à revue ; aucune nouvelle règle comptable ou fiscale créée |

Le regroupement existant est conservé : première clé de groupe configurée (tiers, compte ou pièce). La concordance univoque signifie une ligne A et une ligne B dans la tolérance technique ; elle ne prouve pas la complétude des documents. Un diagnostic peut contenir des écarts démontrés et des groupes non testables/ambigus, sans devenir une conclusion de cycle. Le signal d’ancienneté existant reste un appel à revue, pas une estimation de perte ni un seuil de signification. Les lignes sans dates exploitables ne permettent aucune conclusion d’ancienneté.

## Recette et validation finale

- `lib/rapprochement/__tests__/historical-upload.test.ts` : **86 tests**, dont la même matrice pour **les onze cartes** : centime sans seuil, compensations entre clés, compensation dans un groupe, agrégation multiple, clé absente, période inconnue, nominal après réimport, montants ambigus/absents/infinis/sous-centime et zéro valide. Compléments : clôture/lettrage, deux mutations concurrentes, conservation de l’autre cycle, anciens compteurs non prouvés, qualification incohérente, Synthèse/export et blocage du dossier persistant.
- `components/probant/__tests__/historical-upload.test.tsx` : 3 tests de restitution, détails par bouton/double clic et diagnostic bloqué.
- `e2e/historical-upload.spec.ts` : **13 parcours réussis** sur le build final ; onze cartes, simple dépôt sans exécution, compensation, accès aux sources, réimport nominal, période/clé absentes, format ambigu et deux cycles après rechargement. Les dix E2E du lot 01 restent verts, IS bloqué inclus.
- Suite complète après intégration de PR #52 : **92 suites / 1 023 tests réussis**. Build final passé, 149 pages. Typecheck passé. Lint : zéro erreur, sept avertissements préexistants. `git diff --check origin/main..HEAD` propre.
- Navigateur complet sur ce build : **55 réussis, 1 ignoré** (FEC persistant : infrastructure synthétique dédiée absente). Serveur Playwright lié explicitement à `127.0.0.1`.

## Routes, primitives et fichiers partagés

| Route / primitive | Base à réutiliser |
| --- | --- |
| `/dashboard/depot?cycle=<id>` | Onze cartes et documents du `catalog.ts`, qualification, dépôt CSV/XLSX, bouton de comparaison, résultats et historique ; `CycleUploadPanel` |
| `/dashboard/cloisons` | Silos et constats actifs du même snapshot ; anciennes exceptions retirées lors de l’invalidation/remplacement |
| `/dashboard/risques` | `useDepositCoverage` lit les comparaisons actives ; indicateur documentaire limité, aucune couverture de cycle affirmée |
| `/dashboard/synthese` et `/dashboard/dossier` | Compteurs du snapshot, limitation des documents fournis, contrôle exporté même sans finding, diagnostics et versions périmées explicitement conservés dans le JSON/HTML |
| UI existante | Cartes, `fieldset`/labels natifs, badges textuels, `SeverityBadge`, tableau de groupes, boutons accessibles, `details` technique fermé ; variables `--pb-*` et chiffres `tnum` conservés |
| État et calcul | `AccountingPeriod`, frontière monétaire `legacyCents`, moteur `rapprocher`, qualification/conversion canonique existantes, `SiloView`, fournisseur de dossier et exports existants ; aucune recréation de moteur ou de design |

Fichiers partagés sensibles : `lib/dossier/client.tsx`, `snapshot-builder.ts`, `snapshot-state.ts`, modèle canonique du dossier, `lib/rapprochement/*`, `lib/synthesis/{engine,types,note}.ts` et `lib/evidence/{package,types,html}.ts`. Muter ce parcours avec **`updateSnapshot(current => ...)`**, jamais un snapshot capturé avant une opération asynchrone. La Synthèse passe moteur/politique en 1.1.0 ; les exécutions de dépôt utilisent leur contrat 2.0.0 et le parser tabulaire 2.0.0.

## Intégration et base précise pour la suite

Main a avancé depuis #51 vers #52 pendant le lot : référentiel et navigation responsive (`app/dashboard/layout.tsx`, `Sidebar`, `components/referentiel/*`, `view-model.ts`). Ces fichiers ne recoupent aucun fichier des lots 01/02 ; le fournisseur `ActiveDossierProvider` et les routes sont conservés. Ne pas rétablir l’ancien layout, ni les composants de référentiel supprimés. Le rebase et la recette complète sur **83ba863** sont déjà faits.

La branche narrative fiscale non fusionnée `feat/fiscalite-refonte-narrative` demeure indépendante ; aucun fichier `components/tax-cockpit/*` ou moteur fiscal modifié dans le lot 02. Sur un main ultérieur, vérifier en priorité les modèles/snapshots, le fournisseur de dossier et les exports avant de reprendre ces changements ; conserver leurs garde-fous d’identité, de version et d’isolation.

**Base du prompt suivant :** `fix/historical-upload-reliability`, avec PR #52 + lot 01 (`412e567`) + code lot 02 (`aeec05c`) + commit de ce handoff. Le patch du lot 02 se construit depuis **`412e5677f01916d3c97a6141fd6185bdf05ce604`** ; appliquer les lots 01 puis 02 si l’on repart de main. Réutiliser `UploadQualification`, `uploadExecutions`, `invalidateRapprochementInSnapshot` et `updateSnapshot` ; ne pas revenir à la tolérance de fixture, au comptage depuis findings ou au taux de solde net. Le raccord aux workpapers réels, la persistance durable de ces cartes et le paramétrage de signification restent des dépendances à traiter uniquement dans un lot qui les autorise. Les prompts 03–06 n’ont pas été exécutés.

---

# Handoff — lot 01 : contrat et restitution des résultats (2026-10-03)

Base : `main` / `origin/main` `6bb8f3e6a5d4bcfdb316639b844e214bf59e849b` (PR #51). Travail local : `fix/workshop-result-contract`. Aucun push, PR, merge ou déploiement. Le SHA de production constaté en Mission 00 était identique ; aucun nouveau contrôle Vercel pendant ce lot.

## État utilisable

| Point | État | Preuve / portée |
| --- | --- | --- |
| Classification par sous-contrôle | Corrigé | `demo-assessment.ts`, `result-contract.ts`, `demo-cycles.test.ts` : résultat fondé sur les statuts métier ou différences nommées des moteurs existants ; aucune recherche de montant non nul dans un JSON |
| Donnée invalide / source ou méthode absente | Corrigé | Calcul concerné bloqué, compteur de procédures exécutées à zéro ; diagnostic exportable sans revue ni verrouillage ; `calculation-evidence.test.ts` prouve aussi que les paramètres invalides n'appellent pas le calcul |
| Exception et partie non concluante | Corrigé | Exception conservée dans le sous-contrôle, incertitude conservée séparément ; revue et verrouillage ne changent pas le résultat |
| IS | Présent, bloqué | Cadrage comptable testable ; impôt non calculé, profil/sources/paramètres/raccord requis et millésime 2024 non couvert. Soumission/approbation/verrouillage refusés ; diagnostic seul exportable |
| Restitution atelier / Synthèse / export | Corrigé | Résumé partagé « Test exécuté / Résultat / Incertitude / Prochaine action », badges textuels, sous-contrôles, prérequis et liens vers la source ; JSON en détail fermé ; transition de contour 500 ms, neutralisée en reduced-motion, aucun montant animé |
| Modification d'un travail verrouillé | Présent et vérifié | Nouvelle révision sans approbation, ancienne projection périmée, export refusé jusqu'à nouvelle revue ; remplacement atomique après verrouillage de la nouvelle version |
| Reprise après Synthèse / rechargement | Corrigé | Dernier cycle travaillé et paramètres réellement exécutés restaurés depuis le journal ; `browser-demo.test.ts` et les dix E2E |
| Journal et paquet v1 | Périmés explicitement | Journal/préfixe et résultat/paquet v2. Pas de requalification silencieuse ; ancien journal exige remise à zéro explicite. Résultats anciens exclus des compteurs courants et de l'export |
| Raccord réel / QA métier indépendante | Manquant / non vérifié | L'atelier reste synthétique ; API réelle et persistance durable restent désactivées. Ce lot ne certifie aucune méthode juridique/fiscale ni donnée de mission |

Disponibilité du module, mode, prérequis, exécution, résultat, revue, verrouillage et péremption sont des dimensions distinctes. Une fonctionnalité peut être disponible avec une exécution bloquée par ses entrées. Pour l'IS, le cadrage peut être exécuté et montrer une exception tout en laissant **la procédure IS bloquée et non concluante**. Les compteurs de procédures, de sous-contrôles et d'exceptions viennent des résultats, jamais du nombre de findings. Les neuf autres procédures peuvent être revues avec une conclusion partielle explicite.

## Recette des dix modules

Nominal = concordance du sous-contrôle visé, sans prétendre conclure les parties non testées. Les tests vérifient les valeurs/statuts suivants, pas seulement `completed` ni un changement de hash.

| Module | Sous-contrôle visé | Nominal → exception attendue |
| --- | --- | --- |
| Cash | Concordance GL / relevé / ERB | Écart du pont 0,00 → −0,10 EUR |
| Cut-off | Rattachement à clôture | Déjà traité → candidat FNP synthétique, à qualifier |
| Fournisseurs / RPNE | Passif sur paiement affecté | Comptabilisé dans la période → omission candidate ; second paiement toujours non affecté |
| Clients | GL / auxiliaire et propagation à balance âgée | Écart brut 0,00 → 10,00 EUR ; confirmations et recouvrabilité non conclues |
| Immobilisations | Pont brut | Écart 0,00 → −10,00 EUR ; recalcul sans dotation comparable non concluant |
| Capitaux propres | Pont du capital | Écart 0,00 → −10,00 EUR ; événement et conclusion juridique non conclus |
| Achats | Ligne / allocation facture | Écart première ligne 0,00 → 0,10 EUR ; cut-off sur la même base HT reste déjà traité |
| Congés | Indemnité / comptabilisé sur mêmes droits | Écart 0,00 → 6,67 EUR ; comparaison des méthodes reste comparable ; aucune extrapolation aux droits restants |
| Participations | Dividende attendu / comptabilisé | Écart 0,00 → −1,00 EUR ; modèle de valeur absent |
| IS | Cadrage comptable, sans calcul de l'impôt | Écart 0,00 → 10,00 EUR ; moteur IS toujours bloqué |

`lib/workpapers/__tests__/demo-cycles.test.ts` : 70 cas, soit nominal, exception, invalidité, preuve absente, méthode absente, revue/verrouillage et modification pour chaque module. Pour IS, les cas de revue/verrouillage démontrent le **refus**, puis une nouvelle révision reste bloquée ; aucun verrouillage IS artificiel.

`components/probant/__tests__/workpaper-results.test.tsx` : 40 cas de concordance atelier/Synthèse/JSON/Markdown (nominal, exception, invalidité, preuve absente × 10). `e2e/workpaper-results.spec.ts` : dix parcours réels dans Chromium, retour Synthèse, résultat sémantique et lecture du JSON téléchargé, revue/invalidation ou refus IS, diagnostic invalide, preuve manquante puis correction. `e2e/phase-de.spec.ts` : reprise et export à 390/768/1440 px.

## Parcours et primitives à conserver

| Route / fichier | Usage dans le lot |
| --- | --- |
| `/dashboard/tests` → `CycleDemonstration` | Créer le dossier SYN, scénarios, corriger un blocage, préparer/revoir/verrouiller, journal v2 |
| `/dashboard/synthese` → `SyntheticSummary` / `ModuleAvailability` | Même dossier, mêmes résultats, compteurs, projection et export ; un paquet préparé pour un autre hash n'est pas proposé au téléchargement |
| `WorkpaperResult` / `WorkpaperPanel` | Primitive commune de restitution ; détail technique, provenance, montants exacts et pédagogie conservés |
| `/dashboard/depot` | Lien vers les sources requises ; ancien `CycleUploadPanel` et moteurs de dépôt hors lot 01 |
| `/dashboard/fiscalite` | Lien vers profil/sources/prérequis IS ; moteurs et design du cockpit inchangés |
| `/api/workpapers` | Réel désactivé ; adaptateur démonstratif opt-in cohérent : entrée invalide = bloqué en télémétrie, diagnostic exportable, correction par nouvelle révision |

La branche `origin/feat/fiscalite-refonte-narrative` reste à `b0ed9f28841cc409759c4d52d2cb1e1ec954ce21`, un commit devant main : `app/layout.tsx`, cockpit fiscal, projections du cockpit et ses E2E. Ces fichiers ne sont pas modifiés par le lot 01. Fichiers communs à coordonner dans les prochains lots : `lib/canonical-model/calculation.ts`, `lib/workpapers/{model,calculations,policy,browser-demo,mission-summary,package}.ts`, composants d'atelier/Synthèse et `app/globals.css`. Ne pas recopier les anciennes attentes « donnée invalide completed » ni les journaux v1.

## Validation locale

- Suite complète **finale** (`npm test`) : **89 suites / 928 tests réussis**, dont 205 tests du noyau de feuilles et de sa restitution.
- `npm run typecheck` : passé, zéro erreur.
- `npm run build` final : passé, 149 pages générées.
- Lint complet : code 0, sept avertissements préexistants hors diff ; aucun nouvel avertissement ciblé.
- E2E complet après correction de reprise : **42 réussis / 1 ignoré**, dont les dix modules et les trois viewports. Le cas FEC durable ignoré exige une infrastructure dédiée et n'est pas déclaré réussi.
- E2E final ciblé après les derniers gardes (`npm run test:e2e -- e2e/workpaper-results.spec.ts e2e/phase-de.spec.ts --workers=2`) : **13 réussis**, dix modules et trois tailles d’écran.
- `git diff --check` : aucune erreur.

Les premiers échecs de build/téléchargement venaient du réseau de l'environnement (polices Google et CDN Chromium). Build effectué avec les accès autorisés ; Chromium obtenu depuis son stockage Google officiel. La première recette navigateur a révélé le retour systématique au cycle Clients : corrigé, puis suite complète réussie. Aucune action sur la production.

**Lot 01 uniquement terminé et validé localement.** Les prompts suivants doivent réutiliser le contrat v2 et les règles de projection existantes ; aucun raccord réel, nouveau moteur ni refonte de design n'est inclus ici.

---

# Historique jusqu'à la PR #51

# Handoff — état courant du démonstrateur intégré (2026-09-25)

La PR #50 de reprise A–E est fusionnée et publiée sur `main` au commit `482314aa4e7810c3f0ffb88ed0adb163668e176f`. Le présent lot est préparé localement sur `feat/probant-demo-integree`, sans push, PR, merge ni déploiement. Les décisions de reprise ci-dessous restent l'historique du 25/09/2026 avant fusion.

Parcours de revue locale : `/dashboard/tests` → ouverture explicite d'un dossier `SYN-…` → dix cycles → travaux et exceptions ou limites → revue simulée → verrouillage → `/dashboard/synthese` du même dossier → export JSON, Markdown et manifeste. Le journal est versionné, contrôlé par empreinte et rejoué localement après rechargement ; expiration à sept jours et remise à zéro explicite. Il ne s'agit ni d'une preuve inviolable ni d'une persistance de production. Aucune donnée réelle admise. Les anciens constats de DEMO SA ne sont pas transposés silencieusement.

Cash, Cut-off, Fournisseurs/RPNE, Clients, Immobilisations, Capitaux, Achats, Congés payés et Participations utilisent leurs moteurs existants avec fixtures synthétiques ; les sorties non concluantes demeurent non concluantes. IS présente le pont et les gates, mais le calcul de l'impôt est bloqué pour le millésime 2024 du dossier. Les sources et méthodes de mission réelles restent `SOURCE REQUISE`. Le fichier Guide V1.1/138 pages n'est pas présent dans ce dépôt ; seule sa référence et son empreinte figurent dans le code. Le PDF V1.0/120 pages signalé dans la conversation n'a pas été substitué.

Réserves encore ouvertes : QA métier indépendante, méthodes/PBC réelles, adaptateur durable autorisé pour l'atelier réel, E2E persistant avec infrastructure dédiée, millésimes et sources fiscales couverts, points QF-08/09/14–21 historiques décrits ci-dessous. Le manifeste décrit séparément la maturité fonctionnelle, le mode synthétique, l'état du travail et sa conclusion. Le résultat de validation de ce lot est à lire dans la section finale du présent document.

Validation locale du lot : `npm test` 87 suites / 853 tests réussis ; `npm run typecheck` réussi après correction d'un test ; `npm run lint` code 0, sept avertissements préexistants hors fichiers modifiés ; `npm run build` réussi, 149 pages générées. Le premier `npm run test:e2e` a affiché les 32 succès et un cas FEC persistant ignoré, puis son serveur intégré a bloqué la sortie du processus. Une seconde exécution contre le même build, avec serveur local séparé, a terminé avec code 0 : **32 réussis, 1 ignoré**, dont les trois nouveaux parcours à 390/768/1440 px. Le cas ignoré n'est pas déclaré réussi. `git diff --check` ne relève aucune erreur.

## Historique de la reprise A–E avant fusion

Référence `origin/main` : `cd21e0308e0d6eec604ec6be9814291cebea3b0a`. Archive récupérable : `archive/probant-lots-ae-2026-09-25` (`30c5255`). Branche de reprise : `fix/reprise-probant-lots-ae`. Aucun merge ni déploiement ; branche proposée en PR de revue, sans activation réelle.

Main conservé : OIDC/isolation, ingestion durable, moteur fiscal, migrations 0000–0004, synthèse/export historiques. Transposé : noyau de feuilles, cycles synthétiques A→E, revue et projection, export figé, atelier et disponibilité. Corrigés : QF-01/02/03/06/10/11/12/13 et partie de QF-19. QF-04/05 traités par l'archive et la nouvelle base. QF-22 : références pédagogiques V1.1/138 pages ; aucune règle dérivée des exemples.

La nouvelle API réelle de feuilles reste volontairement **désactivée** : l'adaptateur OIDC + persistance durable n'est pas livré. Le canal de démonstration est opt-in, synthétique, volatile et affiche les rôles simulés. Méthodes et PBC de mission : `SOURCE REQUISE`. Les anciens parcours demeurent sous les contrôles main renforcés ; ne pas les présenter comme certifiés sans QA.

À vérifier en QA indépendante ultérieure : QF-08/09 métriques historiques main hors nouveau noyau ; QF-14 effet fiscal inconnu dans la synthèse legacy ; QF-15/16 déduplication/couverture sur cas métiers réels ; QF-17 paquet de preuve sur livrables réels ; QF-18 visibilité générale ; QF-19 limite de débit distribuée ; QF-20/21 couverture et rendu détaillés. Le préflight XLSX est ajouté et testé ; les autres points ne sont pas déclarés clos par la seule transposition. QF-07 est couvert par la recette synthétique reproductible, mais le scénario de dépôt persistant est ignoré sans infrastructure dédiée.

## Validation finale

Unitaires : 84 suites/816 tests passés avant le dernier garde XLSX ; ses 16 tests ciblés passent ensuite, dont une nouvelle non-régression. Typecheck passé. Lint : code 0, sept avertissements préexistants dans des fichiers non modifiés ; lint ciblé XLSX sans avertissement. Build final passé après le garde et la fixation de la racine de traçage au worktree. E2E : 32 passés, 1 ignoré faute d'infrastructure persistante. Sécurité + multi-locales ciblées : 5 suites/54 tests passés. Aucune QA indépendante réalisée.

Commits locaux de reprise : `25dfa32`, `63b1e65`, `23b6410`, `979a969`, `a22e479`, `46d2734`, `a3b824b`, `5e0b28f`, `e607a0e` ; handoff figé sur la branche locale. Fichiers modifiés regroupés : `lib/rapprochement/*`, `lib/canonical-model/*`, `lib/workpapers/*`, `lib/synthesis/*`, `lib/evidence/*`, `lib/ingestion/*`, `lib/dossier/*`, `lib/security/export-text.ts`, `app/api/{export,ingestions,workpapers}/*`, `app/dashboard/{tests,synthese}/page.tsx`, `components/probant/{CycleDemonstration,CycleTechnicalPanel,ModuleAvailability,WorkpaperPanel}.tsx`, `e2e/phase-de.spec.ts`, `playwright.config.ts`, `next.config.ts` et les quatre documents de ce dossier. Liste exacte : `git diff --name-only origin/main..HEAD` dans le worktree.

Statut : **implémentation démonstrative terminée, activation réelle et QA métier encore requises**. Ne pas utiliser de données réelles ni déployer.

## Validation finale de la branche — 2026-09-25

Périmètre validé : `fix/reprise-probant-lots-ae` à `940f120926a48364bf240fff2577d208cce2173c`, comparé à `origin/main` `cd21e0308e0d6eec604ec6be9814291cebea3b0a`. Aucun code modifié pendant cette validation ; chaque commande de validation demandée a été exécutée une seule fois.

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Unitaires complets | `npm test` | 86 suites, 821 tests passés |
| TypeScript | `npm run typecheck` | Passé, 0 erreur |
| Lint | `npm run lint` | Code 0, 0 erreur, 7 avertissements préexistants hors diff |
| Build | `npm run build` | Passé, 149 pages générées |
| Navigateur | `npm run test:e2e` | 32 passés, 1 ignoré : dépôt FEC persistant sans infrastructure dédiée |
| QF-01/02/03/06/13/19 | `npm test -- lib/rapprochement/__tests__/cycles.test.ts lib/ingestion/__tests__/legacy-routes.test.ts lib/auth/__tests__/isolation.test.ts lib/synthesis/__tests__/canonical.test.ts lib/dossier/__tests__/snapshot-hash-locale.test.ts lib/dossier/__tests__/repositories.test.ts lib/evidence/__tests__/export-route.test.ts lib/ingestion/__tests__/service.test.ts lib/ingestion/__tests__/xlsx-guard.test.ts lib/security/__tests__/upload-hardening.test.ts` | 10 suites, 79 tests passés |

Contrôles de périmètre : `git diff --check origin/main..HEAD` sans erreur ; aucune migration modifiée, ni nouveau fichier de cache, artefact volumineux ou donnée binaire ajouté. La branche ne contient pas de fichier de secret suivi ; le `.env.example` préexistant a ses valeurs secrètes vides, et une recherche de signatures courantes de clés n'a rien trouvé. Les ajouts de tests et de démonstration sont synthétiques. Un dossier réel sélectionné mais introuvable produit une erreur, et l'API des nouvelles feuilles reste fermée hors démonstration explicitement activée ; le contexte sans dossier sélectionné conserve la démo identifiée comme telle.

**Verdict au moment de cette validation : NO-GO pour push/activation réelle.** `GET /api/ingestions/[id]` recherchait le job avant l'authentification, révélant potentiellement son existence. Ce point est corrigé dans le commit `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` décrit ci-dessous. Le parcours FEC persistant E2E reste ignoré sans infrastructure dédiée. Le nouvel atelier réel est volontairement désactivé ; les réserves métier et de sécurité listées plus haut restent à examiner avant activation.

Commits à relire, dans l'ordre (hashes complets) :

1. `25dfa323108fe506f9f01ec5fe24cfb2fc8c9d60` — montants invalides ;
2. `63b1e65256562214f6ce6bfa172ed1f8c05745c4` — portée serveur des routes historiques ;
3. `23b64103292ee7db2885dd20d6160937c1edaf08` — fallback démo et export ;
4. `979a969a3d9d858c7782e60fa7c79822132a38eb` — hash canonique multi-locales ;
5. `a22e479355f5e1a87bd5c89924f36ecf4c4ec8b` — limites FEC ;
6. `46d27345afd86e1928e8c64a4bfbfcf4ab393bf1` — noyau et cycles synthétiques ;
7. `a3b824b3ed462ffb4db052e832ae85621358bb29` — atelier et disponibilité ;
8. `5e0b28f3c8565ecbc0b70cd85dd72aeee676a906` — documentation de reprise ;
9. `e607a0ed6cf978bd29c676ae0c9b769f313a5985` — garde XLSX ;
10. `e3e2ef3af1ac668c7775758727797bbe8bed470a` — références du handoff ;
11. `93917c1df5a1af98988b5ba5823e6a45fd7aaf85` — montants ambigus ;
12. `940f120926a48364bf240fff2577d208cce2173c` — hash de dossier indépendant de la locale.
13. `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` — authentification avant lecture des jobs d'ingestion et réponses uniformes hors périmètre.

Revue humaine du diff : depuis `C:\Users\Ludo\PROBANT\reprise-probant-lots-ae`, exécuter `git diff --stat origin/main...HEAD` puis `git diff origin/main...HEAD`.

## Correctif préalable à la PR — 2026-09-25

Le commit `52b9d57a976b1f3624df8497b7ccd6e742ab46e9` authentifie les accès `GET /api/ingestions/[id]` et `POST /api/ingestions/[id]/process` avant toute lecture du job. Après authentification, un job absent, d'une autre organisation ou d'un dossier non autorisé répond uniformément 404. Tests ciblés `legacy-routes` et `isolation` : 2 suites, 20 tests passés. Typecheck passé, lint ciblé sans avertissement, `git diff --check` sans erreur. Ces contrôles complètent la validation intégrale ci-dessus, exécutée avant ce correctif localisé ; la suite intégrale n'a pas été relancée.

**Verdict : GO pour une PR de revue uniquement ; NO-GO pour activation réelle ou déploiement.** Avant toute mise en production : exécuter l'E2E persistant dans un environnement synthétique dédié, arbitrer les autres réserves ouvertes et réaliser la QA indépendante. Aucune donnée réelle ni QA métier indépendante n'a été utilisée.
