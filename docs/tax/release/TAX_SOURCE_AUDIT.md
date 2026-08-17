# TAX-10 — Audit B indépendant : fiscalité, sources et expérience utilisateur

Date de l'audit : 2026-08-17
Auditeur : revue indépendante B
Verdict : **PASS_WITH_LIMITATIONS**

## Périmètre

L'audit couvre :

- la prudence fiscale des résultats IS et TVA ;
- la couverture documentaire et normative des millésimes 2025, 2026 et 2027 ;
- les niveaux de preuve, les limitations et le rattachement des sources ;
- le langage du cockpit, de la note fiscale et des exports ;
- la navigation du parcours TAX-10 et la lisibilité des graphiques ;
- les interdictions TAX-09/TAX-10 : avis juridique, conformité globale, pénalités non étayées, PDF/A non validé et source omise.

Cet audit ne valide ni une déclaration réelle, ni l'exactitude d'une position fiscale hors des fixtures synthétiques. Il apprécie la capacité de la gate à soutenir une décision de release.

## Méthode et éléments examinés

La revue a combiné :

1. lecture du registre fiscal, de `TAX_SOURCE_COVERAGE.md`, de `TAX_REVIEW_REQUIRED.md` et de la taxonomie des sorties ;
2. inspection des fixtures, des 21 golden cases, des moteurs IS/TVA, du paquet de preuve, de la note fiscale et des composants du cockpit ;
3. exécution ciblée initiale de 45 tests : 12 release-gate, 9 preuve/export, 14 datasets cockpit et 10 composants/accessibilité ; tous passent ;
4. extraction directe des outcomes, niveaux de preuve, limitations et versions de sources des 21 golden cases ;
5. examen des résultats consolidés de la gate : **687/687 tests unitaires**, build de production réussi, **29 E2E réussis et 1 E2E persistant ignoré**, contrôle Axe réussi, console et réseau propres après ajout de l'icône.

La dernière contre-revue post-correction a réexécuté **51 tests ciblés** (12 release-gate, 29 moteur TVA et 10 preuve/export), tous réussis, puis a inspecté directement les snapshots TVA 2025/2027, le manifeste, la note fiscale générée et le dataset de capacité.

La revue finale des résiduels a ensuite réexécuté **24 tests** (14 datasets cockpit et 10 preuve/export), tous réussis, et contrôlé les chaînes effectivement rendues dans la note et les cellules/détails Source du cockpit.

## Couverture source et millésimes

| Sujet | Couverture observée | Appréciation |
|---|---|---|
| Corpus synthétique | Dix familles documentaires présentes pour 2025, 2026 et 2027, chacune hachée | Complet comme enveloppe technique ; ce ne sont pas des modèles officiels de formulaires |
| IS 2026 | Barème normal, taux réduit et déficits issus de versions officielles effectives ; formulaire 2058-A/2033-B encore `review_required` | Calcul protégé ; statut documentaire désormais explicitement limité dans le manifeste et la note |
| IS 2025/2027 | Aucun barème 2026 substitué ; calcul bloqué avec `UNSUPPORTED_RATE_SCHEDULE` | Conforme à l'exigence d'absence de repli silencieux |
| TVA mars 2026 | Sources CGI 269, 271, 287 et 289 couvertes ; CA3 2026 `review_required` | Rapprochements reproductibles ; réserve désormais explicite dans les exports |
| TVA après le 31 août 2026 | Les contrôles dépendant des articles 269/289 deviennent `missing_information` | Garde de transition correcte et explicitement testée |
| CA12 2026 | Période annuelle partiellement couverte ; outcome global `missing_information` | Prudence correcte |
| TVA 2025/2027 | Le moteur est exécuté : `blocked`, `missing_information`, preuve `insufficient`, limitation `UNSUPPORTED_VAT_FORM_VINTAGE` | Blocage et fenêtres exactes de sources vérifiés ; B-03 fermé |
| Sources secondaires | Aucune règle `mandatory` ne dépend d'une `secondary_analysis` | Conforme |
| Exports | Sources, versions, localisateurs, dates, statuts et URL sont exportés ; manifeste et hashes vérifiés | Aucune omission détectée dans les tests ciblés |

## Constats priorisés

### P0 — critique

Aucun constat P0.

### P1 — majeur, bloquant pour un `GO` sans réserve

#### B-01 — Le parcours E2E n'est pas une chaîne fonctionnelle continue

Le scénario dépôt/onboarding et le scénario cockpit/revue/export sont deux tests indépendants. Le premier dépose une balance puis sélectionne l'exercice **2024** dans un onboarding stocké en session ; le second ouvre directement le cockpit fiscal alimenté par la fixture canonique 2026. Le document déposé et le profil saisi n'alimentent donc pas les moteurs observés ensuite. La navigation et chaque segment sont testés, mais pas l'intégration demandée « créer dossier → déposer → compléter profil → exécuter → revoir → exporter ».

**Impact :** la gate prouve le moteur synthétique et l'interface de démonstration, pas la continuité dossier/profil/documents/snapshot. Elle ne peut soutenir un `GO` de parcours intégré ou persistant.
**Action requise :** ajouter un seul scénario séquentiel, sur un même dossier et le même millésime, qui vérifie les identifiants et hashes entre dépôt, profil, moteur, revue et manifeste. Le scénario PostgreSQL/stockage/identité peut rester une gate séparée, mais son absence doit rester une limitation de release.

### P2 — important, à corriger ou accepter explicitement

#### B-02 — CLOSED — La réserve `review_required` est visible dans les exports et au point de décision du cockpit

La correction ferme le défaut principal des exports :

- le manifeste contient une limitation dédupliquée `review_required_source` visant exactement `form-2033-liasse-v2026`, `form-2050-liasse-v2026`, `form-ca12-v2026` et `form-ca3-v2026` ;
- la section Constats de la note affiche `statut à valider (review_required)` sur la règle ;
- la section Limitations reprend la réserve et la section Sources traduit le statut ;
- le `sourceHash` du snapshot correspond au fichier synthétique exact.

Le cockpit résout désormais chaque `sourceVersionId` dans le registre et affiche le statut adjacent au constat, dans la cellule Source comme dans le détail : `[à valider]`, `[en vigueur]`, `[future]`, `[remplacée]` ou `[statut non résolu]`. Une sortie « Vérifié » citant un formulaire `review_required` expose donc la réserve au même point de lecture.

**Statut : CLOSED.** Le P1 initial et son résiduel cockpit sont levés ; la réserve normative reste, à juste titre, une limitation de la release et non un défaut de restitution.

#### B-03 — CLOSED — Les sources TVA publiées intersectent exactement la période

La correction exécute `reconcileVat` avec les fixtures 2025 et 2027. Les deux snapshots sont bloqués avec `outcome: missing_information`, preuve `insufficient` et limitation `UNSUPPORTED_VAT_FORM_VINTAGE`; aucune règle ni aucun montant n'est calculé à partir d'un formulaire voisin.

`assessSourceCoverage` ne publie plus que les versions dont la fenêtre intersecte la période. Vérification directe :

- 2025 ne cite plus `cgi-art-271-v2026-02-21` ;
- 2027 ne cite plus les versions 269/289 expirées au 31 août 2026 ;
- la propriété TAX-10 contrôle désormais `effectiveFrom <= period.endDate` et `effectiveTo >= period.startDate` pour chaque référence.

**Statut : CLOSED.**

#### B-04 — CLOSED — La carte distingue explicitement écarts et risques

La carte est renommée « Écarts et risques à qualifier » et son détail affiche séparément « écart(s) de rapprochement » et « risque(s) potentiel(s) à qualifier ». La valeur agrégée ne présente donc plus les écarts comme des risques.

**Statut : CLOSED.** Le badge court « Incohérence » reste une amélioration de wording possible, sans maintenir B-04 ouvert.

#### B-05 — CLOSED — Les enums de la note fiscale sont traduits

Les valeurs initialement relevées sont désormais traduites : `standard`, `real_normal`, `computed`, outcomes, niveaux de preuve, décisions et `review_required`. La note affiche notamment « régime standard », « réel normal », les libellés français des outcomes/preuves et « à valider (review_required) ».

Les deux derniers résiduels sont couverts par `USER_LABELS` : `estimated` devient « estimé » et `reconcile` devient « rapprochement disponible ». La note générée ne contient plus ces codes bruts.

**Statut : CLOSED.** Un mapping exhaustif typé reste une amélioration de robustesse, sans constat utilisateur ouvert sur le corpus audité.

#### B-06 — La gate de contraste accepte encore une dette `serious`

La QA vérifie l'absence de violation critique, mais tolère une baseline pouvant atteindre dix occurrences de contraste. La limitation est documentée comme dette du chrome sombre partagé. Elle concerne notamment des métadonnées et notes de source en petite taille ; elle ne doit pas être présentée comme une conformité WCAG complète.

**Action :** inventorier les nœuds exacts, relever le contraste des jetons concernés et faire tendre la gate vers zéro violation `serious`.

### P3 — amélioration

#### B-07 — CLOSED — Le cockpit expose la version et le statut de chaque source

Les cellules Source et les détails des constats affichent désormais la version, le statut traduit et le localisateur. La vérification directe retrouve notamment `form-2050-liasse-v2026 [à valider]` et les versions CGI `[en vigueur]`, dans les deux niveaux de restitution.

**Statut : CLOSED.** Les URL restent accessibles dans la note et les exports ; rendre les références du cockpit cliquables demeure une amélioration ergonomique, sans masquer le statut ni la version.

## Langage, interface et graphiques

Points satisfaisants :

- aucun avis juridique ni label global « conforme » n'a été relevé ;
- la note précise sa portée et l'absence de validation PDF/A ;
- aucune pénalité n'est calculée, et cette exclusion est visible ;
- une pièce absente de PROBANT n'est jamais assimilée à une absence de dépôt auprès de l'administration ;
- le taux réduit IS reste à zéro dès qu'un critère de chiffre d'affaires, capital ou détention manque ;
- la déduction TVA sans justificatif n'obtient pas le niveau « FEC + déclaration + facture » ;
- les montants indisponibles restent « non disponible », jamais zéro ;
- les candidats hors cumul sont visuellement séparés dans le waterfall ;
- les graphiques disposent d'un résumé accessible et d'une alternative tabulaire ; la couleur est doublée par du texte ;
- filtres, matrice, popover de méthodologie, revue et exports sont accessibles au clavier dans les tests ciblés.

Réserves ouvertes : B-06 relève de la perception et non du calcul. B-02, B-03, B-04, B-05 et B-07 sont fermés.

## Limitations à porter dans la décision de release

Une release `GO_WITH_LIMITATIONS` doit au minimum annoncer explicitement :

1. l'absence de parcours E2E persistant et de continuité réelle entre dépôt/onboarding et cockpit ;
2. le statut `review_required` des formulaires et relations 2026 concernés ;
3. l'absence de calcul IS 2025/2027 et le caractère explicitement bloqué de la TVA 2025/2027 ;
4. la rupture de couverture TVA à compter du 1er septembre 2026 pour les contrôles dépendants ;
5. les taux TVA seulement observés, jamais qualifiés de taux légaux ;
6. l'absence de PDF/A validé, de pénalités et d'avis juridique ;
7. la dette de contraste et le caractère en mémoire de la revue de démonstration.

## Verdict Audit B

**PASS_WITH_LIMITATIONS** pour une release synthétique, non persistante et explicitement bornée.

- Les garde-fous fiscaux principaux, les calculs prudents, la traçabilité des sources, les niveaux de preuve, les exports et la lisibilité des graphiques sont suffisamment démontrés.
- **B-01 reste le constat bloquant pour un `GO` sans réserve** et pour toute présentation de cette gate comme validation d'un parcours intégré de production.
- B-02, B-03, B-04, B-05 et B-07 sont fermés ; B-06 reste une limitation visuelle P2.
- Si B-01 ou le statut `review_required` des formulaires ne sont pas repris dans le rapport de readiness et dans la décision, le verdict Audit B devient **FAIL**.
