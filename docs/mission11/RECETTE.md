# Mission 11 — recette Capitaux propres : décisions et mouvements

> **Cohabitation (2026-10-09).** Une autre implémentation de la Mission 11 (Codex, PR #62 : `/equity`, `equity-dossier`, migration `0010_equity_dossier`) a été fusionnée dans `main` pendant la revue de la PR #63. À la demande du propriétaire, cette feuille est portée **à côté** d’elle, sans la modifier : branche `claude/capitaux-propres-cohabitation`, base `main` `5e49934`. Renommages :
> - fichiers `lib/workpapers/capitaux-*.ts`, `components/probant/capitaux-propres/`, `e2e/capitaux-propres.spec.ts` ;
> - procédure et règle `capitaux_propres.review@1.0.0` (programme `capitaux_propres.program`), champ `capitauxWork`, clé de mapping `capitaux` ;
> - migration `0012_capitaux_propres` (tables `eq_*` inchangées), drapeau `PROBANT_CAPITAUX_DURABLE`.
>
> Le moteur partagé `reviewEquity` et son contexte `equity.review` sont ceux de `main`, complétés de façon additive : ouverture ou clôture `null` = composante inconnue, capital ou réserves `null` = rapports inconnus. Les tests de la version Codex restent verts. Le produit compte donc deux feuilles Capitaux propres, à arbitrer.

Date : 2026-10-08, portage le 2026-10-09. Développée sur `claude/capitaux-propres-mission11` (PR #63, base `b773f90`), puis portée sur `claude/capitaux-propres-cohabitation` (base `main` `5e49934`) à la demande du propriétaire. Aucun déploiement ni changement de variable distante.

## Ce qui est livré

| Couche | Livrable | Fichiers |
| --- | --- | --- |
| Moteur (complété) | `reviewEquity` en contexte réel dédié `capitaux_propres.review` ; composante incomplète inconnue (jamais nulle) ; rapports inconnus si capital ou réserves non établis ; comparaison selon le contexte | `lib/workpapers/equity.ts`, `cycle-context.ts` |
| Sources qualifiées | Mapping fermé `equity-1`, 5 sources tabulaires et PV / actes en PDF versionnés par pièce (pages comptées par le serveur, chiffrement refusé) ; refus avec ligne / colonne / valeur ; transfert déséquilibré refusé dès l’import | `capitaux-sources.ts`, `capitaux-minutes.ts` |
| Calcul | Cartographie des composantes (art. 821-1 PCG, repère), pont par composante, transferts internes neutres, tableau fourni ↔ reconstitué, décision / comptabilisation / paiement, écriture sans décision, effet hors période, PV lus ; rapports arithmétiques ; résultat `equity-result-1` à invariants | `capitaux-review.ts` |
| Chaîne durable | Tables `eq_*` append-only, têtes de source par pièce de PV, runtime à port de stockage, commandes strictes, citation pièce / version résolue par le serveur, idempotence, verrou, péremption, révision | `drizzle/0012_capitaux_propres.*`, `capitaux-store.ts`, `capitaux-runtime.ts`, `capitaux-commands.ts`, `capitaux-http.ts`, `capitaux-adapter.ts`, `app/api/workpapers/capitaux-propres/**` |
| Synthèse / export | Programme fermé `capitaux_propres.program@1.0.0` (5 contrôles), file de travail avec liens vers la décision ou l’écriture, « Aucune conclusion juridique » ; paquet diagnostic / approuvé (HTML, PDF, JSON, manifeste, 4 CSV) | `capitaux-mission.ts`, `lib/evidence/capitaux-mission-package.ts` |
| Interface | `/capitaux-propres` (feuille) et `/capitaux-propres/synthese`, reliées depuis `/dashboard/synthese`, la Synthèse de l’atelier, les feuilles Trésorerie et Immobilisations | `components/probant/capitaux-propres/**`, `app/capitaux-propres/**` |

Fichiers partagés modifiés (hunks additifs) : `model.ts` (champ `capitauxWork`, unité `decision_movement`, `NoteCitation` facultative sur une note et sa résolution), `service.ts` (adaptateur réel `capitaux_propres.review`, `configureCapitaux`, citation transmise à `resolveNote`), `selection.ts` (population décisions et mouvements), `imports.ts` (mapping `equity`), `cycle-context.ts`, `.env.example`, `drizzle/migration-manifest.json`, liens de navigation dans `app/dashboard/synthese/page.tsx`, `SyntheticSummary.tsx`, `CashReconciliationWorkspace.tsx`, `FixedAssetsWorkspace.tsx`, `FixedAssetMissionSynthesis.tsx`.

## Écran

- **Contexte** : dossier, organisation, exercice, date de revue, mode, identité serveur, version de feuille, état de sauvegarde annoncé après accusé serveur. Onglets Population · Tests · Exceptions · Pièces · Revue (flèches, Début / Fin).
- **Population** : cartographie des treize rubriques (fournie / non fournie / exclue avec motif — rien n’est réputé nul), population figée décisions (`D:`) et mouvements (`M:`) avec dates de décision, comptables et d’effet, sources qualifiées (PDF compris), gel des sources courantes.
- **Tableau de variation horizontal** : une ligne par composante, une colonne par nature, ouverture, clôture attendue, clôture observée, écart ; total des capitaux propres (inconnu si une composante est incomplète) ; vues « Reconstitué / Fourni / Écarts » (groupe radio, flèches) ; colonne Composante figée au défilement horizontal. **Expansion d’une composante** (comptes, mouvements de l’exercice) et **mise en évidence du mouvement sélectionné** : les deux seules animations, neutralisées en réduction des mouvements.
- **Frise des décisions** : exercice puis « après clôture » jusqu’à la revue ; une décision par jalon (organe, date, lignes, PV, statut le plus sévère, date d’effet si différente) ; alternative tabulaire ; liste verticale sur mobile.
- **Décision sans écriture · écriture sans décision · montant divergent** : trois listes avec compte, chacune menant à la décision (et son PV) ou au mouvement mis en évidence ; aucune décision n’est déduite d’un montant.
- **Décision, comptabilisation et paiement** : une ligne par ligne de décision ; voté, comptabilisé, payé, écart (comptabilisé − voté), statut, PV et lecture.
- **Panneau PV à la page pertinente** : pièce, fichier, version, SHA-256, page et résolution citées ; transcription du registre ; **rendu réel de la page** du PDF versionné sur demande (pdf.js, original servi sous la permission de téléchargement), agrandissement, couche texte non interprétée ; validation de la lecture (texte libre, citation résolue par le serveur) ou retrait ; écritures rattachées et règlements. Échap ramène à l’élément d’origine ; aucune animation d’ouverture.
- **Rapports arithmétiques** (capitaux propres / capital, réserves / capital) avec le texte « Aucune règle juridique n’est implémentée… ».
- **Exceptions** : traitement d’une exception seulement avec une **pièce figée citée** (et une page pour un PV) ; conclusion ; revue distincte et verrouillage.

## Résultats d’exécution (locaux, 2026-10-08)

| Contrôle | Commande | Résultat |
| --- | --- | --- |
| Suite unitaire complète | `npx vitest run --pool=forks` | 115 fichiers réussis, 4 ignorés ; **1 306 tests réussis, 35 ignorés** sur la base `5e49934` (tous PostgreSQL, sans base locale, dont 3 pour cette feuille ; les tests `/equity` de la version Codex restent verts). Pool `forks` retenu (segfaults intermittents du pool `threads` sur ce poste, cf. Missions 09–10) |
| Métier Capitaux propres | `lib/workpapers/__tests__/capitaux-review.test.ts` + `equity.test.ts` | 16 + 3 réussis (recette, états inconnus, refus avec localisateur, lectures citées, PDF, contexte réservé) |
| Atelier synthétique (non-régression) | `lib/workpapers/__tests__/demo-cycles.test.ts` | 70 réussis, inchangés |
| Chaîne serveur | `lib/workpapers/__tests__/capitaux-runtime.test.ts` | 10 réussis (runtime et handlers réels, stockage **de test** en mémoire) |
| Synthèse / export | `lib/workpapers/__tests__/capitaux-mission.test.ts` | 2 réussis (programme, liens, HTML échappé, CSV neutralisé, PDF) |
| PostgreSQL jetable | `lib/workpapers/__tests__/capitaux-durable.integration.test.ts` | **NON EXÉCUTÉ** localement (3 ignorés : ni PostgreSQL ni Docker sur le poste) ; prévu pour le service PostgreSQL 17 de la CI |
| Composants | `components/probant/__tests__/capitaux-propres.test.tsx` | 6 réussis (jsdom, handlers réels ; rendu de page PDF non testé en jsdom) |
| Types | `npm run typecheck` | 0 erreur |
| Lint | `npm run lint` | 0 erreur ; 7 avertissements préexistants hors diff |
| Migrations | `npm run db:check` | 12 migrations, invariants valides |
| Build | `npm run build` | Réussi ; `/capitaux-propres` 21,9 kB, `/capitaux-propres/synthese` 5,3 kB |
| Navigateur Capitaux propres | `npx playwright test e2e/capitaux-propres.spec.ts` | 5 réussis (axe WCAG 2.1 AA sans violation sérieuse ni critique ; page du PV rendue par pdf.js dans Chromium) |
| Navigateur complet | `npx playwright test --workers=2` | Sur la base `5e49934` : **79 réussis, 1 ignoré** (FEC durable, préexistant), 2 échecs. Le premier était une attente de libellé de rapport, alignée sur le moteur partagé. Le second, un délai `waitForLoadState` d’`accessibility.spec.ts` sous charge, repasse seul. Relance des deux fichiers : 13 réussis |

Recette navigateur : les requêtes de la page sont routées vers le **vrai** `EquityRuntime` et ses handlers sur le stockage de test en mémoire. Les mutations traversent le code serveur réel (schémas stricts, contrôles, idempotence), mais ce n’est **pas** une recette de persistance, d’OIDC externe ni de PostgreSQL.

### Matrice de la recette demandée

| Cas | Attendu | Preuve |
| --- | --- | --- |
| Distribution votée 30, comptabilisée 25 | Voté −30, comptabilisé −25, payé 25 présentés séparément ; écart +5,00 (comptabilisé − voté) après lecture validée du PV page 3 ; `AMOUNT_DIVERGENT`, note bloquante ; sans lecture : « Lecture requise », aucun écart | Tests métier / runtime / composants, Chromium, captures `eq-decision-pv-*` |
| Transfert interne neutre | T1 (affectation) et T2 (incorporation) : lignes listées, total 0,00, effet sur le total 0,00 ; transfert déséquilibré refusé à l’import avec ligne et référence | Tests métier, runtime (refus `EQ_TRANSFER_UNBALANCED`), Chromium |
| PV absent | D3 : « PV absent : la pièce « PV-AGE-2024-12 » n’est pas fournie » ; lecture impossible, aucun montant comparé ; `PV_MISSING` ; registre absent → aucune « écriture sans décision » inventée | Tests métier / composants, Chromium, capture `eq-timeline-lists-*` |
| Effet hors période | E07 / E08 comptabilisées le 20/12/2024, effet au 10/01/2025 : `EFFECT_OUTSIDE_PERIOD`, décision « Effet hors période » ; décision postérieure (AGO 2025) : aucune écriture attendue | Tests métier, Chromium |
| Capital et réserves incomplets | Clôture du capital et réserve légale absentes : composantes « Incomplète », écart « Inconnu », total « Total non calculé », rapports inconnus, contrôle Pont non concluant 6/8 | Tests métier, Chromium, capture `eq-incomplete-1440.png` |
| Décision humaine citant la pièce et la version | Lecture : pièce, version, page résolues par le serveur ; traitement : refusé sans citation (400), hors sources figées (`EQ_CITATION_SOURCE_REQUIRED`), page hors PV (`EQ_CITATION_PAGE_INVALID`) ; jugement sans citation refusé ; citation reprise dans le paquet | Runtime, composants, Chromium, capture `eq-cited-decision-1440.png` |
| Résultats reliés à la Synthèse sans feu vert juridique | Libellés de résultat sans « conforme » ; « Aucune conclusion juridique » ; liens exacts vers la décision (`item=D:…`) ou l’écriture (`item=M:…`) de la version | Tests Synthèse, Chromium, capture `eq-synthesis-1440.png` |

Autres propriétés vérifiées :
- **Données et calcul :**
  - écriture sans décision (E09 −4) jamais appariée à la décision sans écriture (D4 −5) ;
  - tableau fourni : cellule absente non lue comme nulle ;
  - écart de pont −1 isolé, clôture jamais réécrite ;
  - compte rattaché à deux composantes refusé ;
  - date d’effet absente refusée, jamais déduite.
- **Sources :** PDF illisible, sans signature ou à champs inattendus refusés ; original du PV téléchargé identique octet pour octet.
- **Autorité et chaîne serveur :**
  - corps portant un auteur, une page ou un rôle refusé (400) ;
  - lecture modifiée → résultat retiré ;
  - PV ajouté après le gel → périmé, commande refusée (409), révision ;
  - idempotence, conflit de version, session expirée (401), autre organisation (403).
- **Export :** HTML hostile échappé, formules CSV neutralisées.
- **Écran :** aucun débordement global à 1024 et 390 px ; animations neutralisées en réduction des mouvements.

### Captures

Produites par Playwright sur le build de production local (`PROBANT_CAPTURES_DIR=docs/mission11/captures`), inspectées, conservées hors Git (`*.png` ignoré) : `eq-decision-pv-1440.png`, `eq-decision-pv-1024.png`, `eq-decision-pv-390.png`, `eq-pv-zoom-1440.png`, `eq-reduced-motion-movement-1440.png`, `eq-timeline-lists-1440.png`, `eq-timeline-lists-390.png`, `eq-statement-differences-1440.png`, `eq-cited-decision-1440.png`, `eq-incomplete-1440.png`, `eq-blocked-source-1440.png`, `eq-synthesis-1440.png`, `eq-population-1440.png`.

L’inspection a conduit à corriger :
- chevron décoratif CSS inclus dans le nom accessible des composantes (« ▸ Capital ») ;
- hauteur maximale qui masquait l’expansion et le total ;
- jalons de la frise superposés, et débordement du dernier jalon à 1024 px ;
- page du PV illisible dans le panneau étroit (ajout de l’agrandissement) ;
- légendes de tableaux tronquées ;
- couverture de la Synthèse débordant sur la colonne voisine, et empreintes débordant à 390 px ;
- total inconnu étalé dans une cellule chiffrée ;
- mouvements illisibles dans le panneau.

## Non exécuté et limites

- **Infrastructure non exécutée :** PostgreSQL jetable, OIDC externe, Preview Vercel (aucune infrastructure locale ; aucun push). La recette `capitaux-durable.integration.test.ts` s’exécutera dans la CI existante (migration `0012` appliquée par `npm run db:migrate`).
- **Règles juridiques :** aucune n’est implémentée (réserve légale, capitaux propres inférieurs à la moitié du capital, conditions de distribution) : chacune devrait être sourcée pour la forme sociale et la période. Les rapports sont arithmétiques.
- **Carte des composantes :** rubriques de l’art. 821-1 PCG (règlement ANC 2024-07) utilisées comme repère de cartographie. La version applicable à l’exercice 2024 de la recette n’a pas été relue ligne à ligne. Les autres fonds propres sont exclus avec motif.
- **Lecture d’un PV :** c’est une validation humaine de la transcription. Ni l’authenticité, ni le quorum, ni la régularité ne sont démontrés.
- **Paquet et PDF :** PDF standard (Latin-1), sans PDF/A ; originaux (PV compris) absents du paquet. Le rendu de page dépend de pdf.js côté navigateur ; aucune extraction de texte n’alimente un montant.

## Proposition de PR (non créée)

Titre : **Capitaux propres : décisions, mouvements et PV versionnés sur sources qualifiées**

Base : `main` (`5e49934`, Missions 08, 11 Codex et 12 incluses). Remplace la PR #63, devenue non fusionnable après la fusion de la PR #62 ; cohabite avec `/equity`.

> Complète `reviewEquity` avec un vrai dossier de décisions : balance, écritures, tableau de variation fourni, registre des décisions, règlements et PV / actes en PDF versionnés.
>
> - **Composantes :** les treize rubriques de l’art. 821-1 PCG servent de carte, sans limiter le cycle au compte 10. Composante incomplète inconnue, jamais nulle ; autres fonds propres exclus avec motif.
> - **Unité :** décision et mouvement, avec dates d’effet explicites. Décision, comptabilisation et paiement restent séparés ; la feuille recherche les décisions sans écriture, les écritures sans décision, les montants divergents et les effets hors période.
> - **Transferts internes :** équilibrés dès l’import, sans effet sur le total. Rapports arithmétiques exacts, sans conclusion juridique ; aucune règle juridique codée.
> - **Décisions humaines citées :** la lecture d’un PV cite la pièce, la version et la page (résolues par le serveur) ; le traitement d’une exception exige une pièce figée citée.
> - **Chaîne durable dédiée :** tables `eq_*`, migration `0012`, append-only. Revue distincte, verrouillage, péremption (y compris un PV ajouté), Synthèse et export diagnostic / approuvé.
> - **Écran `/capitaux-propres` :**
>   - tableau de variation horizontal (expansion d’une composante, mouvement mis en évidence) ;
>   - frise des décisions ;
>   - panneau PV rendant la page citée ;
>   - listes de rapprochement ;
>   - clavier et réduction des animations.
>
> Recette locale : 1 306 tests unitaires réussis / 35 ignorés (PostgreSQL) ; Chromium 79 réussis / 1 ignoré, deux échecs corrigés ou non reproduits à la relance. **Non exécuté** : PostgreSQL jetable, OIDC externe, Preview.
>
> 🤖 Generated with [Claude Code](https://claude.com/claude-code)
