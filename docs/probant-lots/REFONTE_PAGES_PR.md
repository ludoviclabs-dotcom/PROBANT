# Refonte des pages — Landing et Synthèse (charte « Le grand livre rendu vivant »)

Branche de travail : `claude/probant-redesign-pages-1d8be1`, base `8f1f50d` (main). Non fusionnée, non déployée, non commitée : prête pour revue.

## Demande et références

Reproduire à l'identique le projet de refonte fourni par l'utilisateur pour la landing (`/`) et la Synthèse (`/dashboard/synthese`), à partir de quatre maquettes : *Charte*, *Landing*, *Synthèse*, *Planches*. Les maquettes sont des références visuelles : leurs chiffres sont fabriqués (société fictive, résultat comptable, taux d'IS, nombre d'écritures). Toute valeur affichée vient donc du moteur et du snapshot réels du dossier ; ce que le moteur ne sait pas reste inconnu à l'écran.

## Avant / après

| | Avant | Après |
|---|---|---|
| Landing | page d'accueil sur la charte sombre historique | ambiance « papier » : en-tête, hero avec flux FEC de DEMO SA, trois couches, revue par cloison rejouée, chaîne de preuve à onglets, index normatif tiré des 35 cycles YAML, pied de page avec versions réelles |
| Châssis `/dashboard/*` | `Sidebar` de 240 px + tiroir sous 768 px, bandeau de contexte propre à la Synthèse | rail (184 px, 216 px dès 1200) dès 760 px, barre basse sous 760 px, ruban de contexte unique (dossier, exercice, identité, FEC, sources, feuilles, action prioritaire), bandeau « Mode démo » |
| Synthèse | une page de 767 lignes, 16 composants, tuiles | trois niveaux de lecture (Décision, Analyse, Exploration) en lignes continues : verdict, signal subordonné, trois mesures, registre des cycles, Sankey cloison → gravité piloté par un filtre croisé, pont d'exposition par poste et sens, mosaïque cloison × assertion NEP 500 §09, concentration par cycle, code-barres du FEC, cinq accordéons d'exploration, chaîne de preuve avec décision, méthode repliée, limites toujours affichées |
| États | texte brut pendant le chargement et en erreur | chargement, vide (dossier sans source), erreur de résolution et « FEC propre » (aucun constat) dans la même langue visuelle |
| Variantes | — | `?variante=B` : même contenu, composition en tableau de mesures (comme la planche B) |

## Cause du chantier et principe de mise en œuvre

Les pages historiques mélangeaient calcul, mise en forme et styles en ligne. Règle suivie : **aucun calcul comptable ou fiscal dans React**. `lib/synthese-view/*` ne fait que mettre en forme les sorties de `buildSynthesisSnapshot` et de `buildSynthesisDatasets` (comptages de constats, positions, libellés) ; les montants restent des centimes entiers du moteur, formatés par `lib/format/fr.ts`. Les ponts d'exposition reprennent les étapes du moteur par poste et par sens, jamais additionnées ; un montant inconnu s'affiche « inconnu » (pas de barre, pas de zéro).

## Écarts volontaires à la maquette (et pourquoi)

1. **Pont d'exposition** : la maquette montre une cascade « résultat comptable → effets → IS à 25 % → résultat ajusté ». Le dossier n'a ni résultat comptable ni taux d'IS qualifié : l'application affiche les étapes réelles du moteur (effets détectés, écartés, exposition initiale, en attente d'arbitrage, corrigé, non corrigé) et l'effet net « inconnu » tant que le taux et la qualification manquent.
2. **Couverture** : « non qualifiée » (population et dénominateur manquants) au lieu de « 2 840 écritures lues ».
3. **Chiffres** : 21 constats bloquants ou majeurs et un signal de 82 (maquette : 19 et 81) — valeurs du moteur 1.2.0 sur DEMO SA.
4. **Mosaïque** : 11 colonnes d'assertions (NEP 500 §09, y compris « non résolue » et « conformité du fichier ») au lieu de 8.
5. **Rail** : 8 écrans (la Fiscalité existe) au lieu de 7 ; la liste vient du registre de capacités.
6. **Ruban** : « clôture 31/12/2024 » quand le dossier ne porte pas de date de début (aucune période reconstituée).
7. **Sankey à 390 px** : il défile horizontalement dans son cadre (région focalisable) ; une rangée de boutons à bascule double le filtre au clavier.

## Fichiers

Nouveaux : `app/fonts.ts`, `app/tokens.css`, `components/charte/*`, `components/instruments/*` (rail, barre basse, ruban, bandeau démo, portes de chargement/erreur), `components/landing/*`, `components/synthese/*`, `components/evidence/evidence.module.css`, `lib/format/*`, `lib/synthese-view/*`, `lib/synthesis/versions.ts`.

Modifiés : `app/page.tsx`, `app/dashboard/layout.tsx`, `app/dashboard/synthese/page.tsx` (réduit à `<SyntheseView />`), `app/globals.css` (import des jetons), `lib/dossier/client.tsx` (rendus de repli optionnels `loading` / `failure`), `lib/demo/tour.ts` (flux du Sankey choisi par hauteur rendue), `lib/synthesis/engine.ts` (versions extraites), `components/evidence/*` (restyle), `components/probant/{DemoLauncher,OnboardingCta,SyntheticSummary}.tsx`, `components/referentiel/{ReferentielEdition,StrataScene}.tsx`.

Supprimés : `components/probant/Sidebar.tsx`, `components/probant/DossierContextBar.tsx` (remplacés par le châssis), `e2e/dashboard-tiroir.spec.ts` (le tiroir n'existe plus ; remplacé par `e2e/dashboard-navigation.spec.ts`).

À noter pour le diff : `lib/dossier/client.tsx` est versionné en CRLF dans `HEAD` ; `git diff` brut paraît réécrire tout le fichier, `git diff --ignore-cr-at-eol` montre les neuf lignes réellement modifiées. À stager avec `git -c core.autocrlf=false add lib/dossier/client.tsx` pour ne pas normaliser les fins de ligne.

## Source des règles et des contenus

Aucune nouvelle règle française n'a été introduite : la refonte ne calcule rien de nouveau. Les libellés d'assertion viennent de la NEP 500 §09 déjà portée par `lib/audit` ; la frise des référentiels est dérivée des dates d'effet des sources enregistrées ; l'index normatif de la landing est dérivé des YAML de `data/cycles`. Édition du référentiel affichée : `ed3-9f821c321285` (éd. 3).

## Cas contrôlés

- **Tests unitaires** : 44 (modèles de vue : verdict, Sankey, pont, mosaïque, concentration, code-barres, journal, chaîne, limites) + 10 (formats fr-FR, période) + 13 (page complète sur le dossier DEMO SA : verdict, absence de ratio sans dénominateur, signal non opposable, aucun mot de certification, mosaïque recomptée, volet et focus, filtre croisé, chaîne et décision, erreur d'écriture, variante B, état vide). Suite complète : 2010 réussis, 4 échecs au premier passage sous charge (Trésorerie, Provisions — fichiers non touchés), réussis isolément (19/19).
- **Typecheck et lint** : `tsc --noEmit` propre ; `eslint` sans erreur (6 avertissements préexistants).
- **Navigateur, build de production**, aux largeurs 1440, 1024 et 390 : DEMO SA complet (verdict, filtre croisé par flux, volet de cellule, chaîne de preuve, décision puis annulation, avancement 1/43, accordéons, méthode), dossier « FEC propre » (aucun constat : chaque graphique dit ce qui manque, la couverture reste « non qualifiée »), dossier sans source, erreur de résolution, variantes A et B, aucun débordement horizontal du document.
- **E2E** (Playwright, build de production, suite complète des 42 fichiers) : 331 réussis, 15 ignorés, 8 échecs au premier passage — tous résolus ensuite : 3 specs d'ancien registre mis à jour (`c01-context`, `c08-stocks-valeur`), 4 tests `cloisons-mise-en-page` en dépassement de délai sous charge (13/13 réussis hors charge, captures redirigées), et un échec de lecture instantanée du DOM dans mon spec `landing` (attente ajoutée, trois passages verts). Nouveaux : `landing`, `synthese-refonte`, `dashboard-navigation`. Mis à jour : `demo-journey`, `partial-coverage`, `c01-context`, `c03-assertions`, `c05-effets-partages`, `c08-stocks-valeur`, `bordures-stratifiees`, `accessibility` (dette axe de la Synthèse ramenée de 13 à 0). Axe sérieux/critique : 0 sur la Synthèse et son châssis aux trois largeurs ; la recette a fait corriger un `role="img"` sans nom, six zones défilantes non focalisables et un recouvrement de la scène 3D du Référentiel à 1024 px (cf. ci-dessous). Aucune tolérance n'a été augmentée.
- **Texte attendu par les anciennes recettes** : « Travaux par cycle » devient « Registre des cycles du dossier » ; « Générer la note de synthèse » devient « Télécharger la note de synthèse » (fichier Markdown) ; les exports s'ouvrent depuis « Exporter le dossier de preuve » ; le journal de revue vit dans « Méthode ». Les specs ont été mises à jour sans toucher aux tolérances.

## Régression trouvée et corrigée pendant la recette

Le rail (184 px à 1024) donne 840 px de contenu au lieu de 784 px dans l'ancien châssis : la scène 3D du Référentiel vivant (`StrataScene`) restait « côte à côte » avec son volet et sa dalle de 380 px recouvrait la colonne des millésimes (contraste 1,65). La base flexible de la scène passe de 380 à 540 px (136 + 380 + marge) : elle passe à la ligne avant de se faire recouvrir.

## Limites restantes

- **Composants hérités devenus orphelins**, conservés pour garder le diff ciblé (leurs tests existent encore) : `components/synthesis/{AdmissibilityCard,DataQualityMatrix,CoverageStackedBar,WorkCoverageTable,RiskHeatmap,ExposureWaterfall,ReviewProgressBar,FindingConcentrationChart}`, `components/knowledge/{NormativePyramid,StandardsTimeline}`, `components/evidence/EvidenceFlow`, `components/probant/SplashScreen`. Nettoyage à décider séparément.
- **Lecteur d'écran** : non vérifié (axe seulement, comme les recettes précédentes).
- **15 tests e2e ignorés, donc non vérifiés** : ils exigent le profil personnel local et PostgreSQL (`c07-profil-local` ×4, `c12-paie-locale` ×4, `c13-emprunts` ×2 persistants, `c15-parcours-local` ×4, `fec-persistent` ×1). Aucun profil n'existe sur ce poste (`npm run local:status`) et je n'en ai pas créé. Le cas d'un dossier local persistant sans constat a été contrôlé par un dossier injecté en session (voir « Cas contrôlés »), pas par ces parcours.
- **Captures versionnées** (`docs/probant-lots/*-captures`, `docs/recette/*`) : les specs de recette les régénèrent ; elles ont été restaurées à leur état antérieur, aucune n'est dans ce diff.
- **Polices** : Newsreader, Geist et IBM Plex Mono via `next/font/google` ; un build sans accès réseau ni cache de polices échouerait.
- **Fenêtre masquée** : dans le volet navigateur de l'application desktop, un onglet masqué ne fait pas avancer les animations (premier cliché vide) ; sans effet pour un utilisateur.

## Commandes

```bash
npm run lint && npm run typecheck && npx vitest run --pool=forks
npm run build && npx playwright test
```
