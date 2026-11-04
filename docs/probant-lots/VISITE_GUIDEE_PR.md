# Visite guidée — nouvelle génération (« le fil de preuve »)

Branche : `claude/probant-demo-video-update-mcmgc0`, base `2b12b57` (main, après la PR #106). Non fusionnée, non déployée : prête pour revue.

## Demande

La démonstration jouée par `?guide=1&etape=0` (lien de la landing et du rail) datait de la PR #51 (26/09/2026). Depuis, la charte « Le grand livre rendu vivant » (PR #100, #101, #102), la Synthèse « Décision / Analyse / Exploration », le registre des cycles, le dossier de preuve et le référentiel ont changé. Demande : une visite plus moderne, plus interactive, plus « connectée », animée (effets, transitions, guidage, séquençage), qui montre les spécificités du projet.

La « vidéo » est la visite auto-jouée par-dessus le vrai produit. Elle est refaite ; une vidéo MP4 en est tirée par un script versionné (`npm run demo:video`) pour pouvoir la régénérer à chaque évolution.

## Constat de départ (captures `visite-guidee-captures/avant-*`)

| Défaut | Cause |
|---|---|
| Carte de narration à l'ancienne charte : bleu `#5b9dff`, coins de 16 px, ombres portées, halo pulsant infini, Inter | composants `components/demo/*` et `GuidedTour.tsx` restés hors charte après la refonte |
| « 35 cycles d'audit, scorés sur 4 axes » puis « scoré 35 cycles de risque » | la cartographie affiche **30 évalués · 5 non évalués** : la narration ne lisait pas le moteur |
| Fiche « Seuil actuel — CA × 0,5 % — ISA 320 » | le taux de 0,5 % est un **paramètre interne** du registre (page Référentiel), pas une exigence d'ISA 320 |
| Fiche « Écart DUPONT SA · Écart 0,00 € » à côté d'un cadre posé sur BERNARD & Cie | valeur figée sur un constat qui n'est plus le premier du silo vitrine |
| Particules dépôt → navigation jamais jouées | sélecteur `aside nav a` : le rail de la refonte est un `<nav>` hors `aside` |
| Matrice des risques plus haute que l'écran : cadre hors écran, carte et fiche qui se chevauchent | pas de bornage du cadre ni d'évitement entre carte et fiche |
| Verdict final serré (« 8 / 8 » sur deux lignes), « Moins de 2 minutes » | mise en page de cartes répétées ; promesse non mesurée |
| La visite se jouait sur le dossier ouvert, même s'il n'était pas DEMO SA | lancement avec le contexte courant, alors que la narration cite les chiffres de DEMO SA |

## Après (captures `visite-guidee-captures/apres-*`)

Parcours de ≈ 2 min (mesuré : 2 min 07 s du clic à la conclusion), en **cinq chapitres** encadrés d'une ouverture et d'une conclusion :

| | Écran | Ce qui est montré |
|---|---|---|
| Ouverture | — | trois registres jamais confondus (droit dur 11 · présomption d'audit 28 · paramètre interne 4 constats), traits plein / tirets / pointillé de la charte |
| I. Déposer | Dépôt | journal du moteur (empreinte, LPF A.47 A-1 · 1 alerte bloquante, 28 silos · 43 constats, seuil · paramètre interne), particules vers le rail ; ruban de contexte |
| II. Décider | Synthèse | verdict en une phrase et signal subordonné ; **moment « À vous »** : un clic sur un flux du Sankey filtre toute l'analyse ; marge du pont d'exposition (« aucun », 40 constats exclus, jamais comptés zéro) |
| III. Mesurer | Cartographie | 35 fiches, 4 axes, « non évalué » ≠ sûr ; simulateur ±30 % rejoué en direct puis remis ; graphe des cycles (fait de relation, pas propagation chiffrée) |
| IV. Prouver | Cloisons, Dossier | ligne en écart (9 500 €) reliée aux constats ; **moment « À vous »** : « Analyser » ouvre le panneau de revue ; la décision reste humaine ; complétude des 43 chaînes (0/43 décidées) |
| V. Fonder | Référentiel | 27 sources versionnées, éd. 3, seuils internes à part |
| Conclusion | — | le fil de preuve en une ligne continue : FEC → dossier → admissibilité → constats → seuil → écart → chaînes → référentiel → décision « à l'auditeur » ; 35 · 43 · 8 ; Importer mon FEC / Explorer / Rejouer |

Mise en scène :

- **Séquençage** : intertitre plein écran à chaque chapitre (numéro, titre Newsreader, filet de 2 px qui se trace), qui couvre la navigation ; **frise-lecteur** en bas : précédent / lecture-pause / suivant, horloge du script, un segment par chapitre large comme sa durée, rempli au fil de la lecture, cliquable.
- **Connecté** : chaque étape dépose un maillon (empreinte, seuil, écart…) qui s'allume sous son chapitre dans la frise ; la conclusion les relie en une ligne. Les fiches « artefact » sont reliées au cadre par un filet orthogonal qui se dessine et lisent leur valeur **dans la page affichée**.
- **Interactif** : deux moments « À vous » ; la cible reste cliquable (la capture s'ouvre autour du cadre), un compte à rebours dit quand la visite fera le geste ; sans geste, le curseur fantôme va cliquer lui-même. L'effet est laissé à l'écran ~2 à 3 s puis la visite repart.
- **Guidage** : cadre à filet de vérification et repères d'angle, trait de lecture qui balaie le cadre une fois, pastille « III.2 · Simulateur de seuil » (et glyphe de gravité quand le cadre porte un constat), curseur fantôme qui vise le milieu d'un tracé SVG.
- **Charte** : ambiance « instruments », Newsreader / Geist / IBM Plex Mono, plans graphite sans ombre portée, rayons 2 px, filets de 1 px, gravité par glyphe + libellé, animations finies.
- **Clavier** : Échap, ← →, Espace, Début, 1 à 5 (chapitres) ; focus visible ; le focus suit la carte sans quitter un bouton de la frise.
- **Mouvement réduit** : pas de voyage du curseur, pas de particules ni de balayage ; intertitres tenus 1,2 s sans fondu ; états finaux des traits.
- **390 px** : carte ancrée en bas au-dessus de la frise, cibles cadrées en haut, frise réduite aux numéros, fil vertical dans la conclusion, fiches jamais posées dans le cadre.

## Changements

Nouveaux : `components/demo/TourStage.tsx` (moteur), `TourFrieze.tsx`, `TourScenes.tsx`, `tour.module.css`, `lib/demo/tour-entry.ts` (entrée légère et miroirs verrouillés), `lib/demo/__tests__/tour.test.ts`, `e2e/guided-tour.spec.ts`, `scripts/demo/record-visite.mjs` (+ `npm run demo:video`).

Réécrits : `lib/demo/tour.ts` (script), `components/probant/GuidedTour.tsx` (ne fait plus que lire `?guide=1` et charge le moteur à la demande : la surcouche est un fragment séparé, absent des pages hors visite), `components/demo/{GhostCursor,DemoCallout,FecParsingProgress,DataParticles}.tsx` (charte, placement, sélecteur du rail). Supprimé : `components/demo/ScanLine.tsx` (l'effet vit dans le trait de lecture du cadre).

Ancres ajoutées, sans effet visuel : `data-tour` sur le verdict, le signal, la barre de filtre, la marge du pont, les compteurs de la cartographie, la complétude des chaînes, l'en-tête du référentiel (`PageIntro tourId`), le panneau de revue (rail et tiroir) ; `data-tour-read`, `data-tour-action="filter-clear"`, `data-tour-count` sur les flux du Sankey.

Ajustés : `DemoLauncher` (lance toujours sur DEMO SA : `?dossier=demo-sa-2024&organization=demo`), durée affichée « 2 min » (rail, landing), `app/globals.css` (keyframes de l'ancienne démo retirées ; pulsation de nœud sans halo, appliquée aux cercles et non au groupe translaté ; règle infinie sur une ancre disparue retirée).

Aucun calcul dans React : la visite ne calcule rien, elle cite `computeCounts`, `computeMateriality`, le registre normatif ou ce que la page affiche.

## Sources et discours

Aucune règle nouvelle. Corrections de discours : le taux de matérialité est nommé « paramètre interne du registre éd. 3 » (la page Référentiel le classe ainsi) ; ISA 320 n'est citée que pour la notion de seuil de signification. Les phrases décrivent ce que l'écran montre au moment où il est cadré (ex. « aucun » et « 40 constats exclus » dans la marge du pont, pas un « inconnu » qui n'y figure pas).

## Cas contrôlés

- **Unitaires** (`lib/demo/__tests__/tour.test.ts`, 16 tests) : attendus établis hors du script — valeurs lues à l'écran sur DEMO SA (empreinte `3863478135b7`, 43 / 2 / 19, 1 alerte, éd. 3), 6 340 000 × 0,005 = 31 700, 103 850 − 94 350 = 9 500, partition 11 + 28 + 4 = 43 ; chaque ancre citée existe dans le code ; ordre des chapitres ; marge des moments « À vous » ; un maillon par chapitre ; aucune phrase n'associe 0,5 % et ISA 320 ; durée annoncée = arrondi de l'estimation (< 2 min 30). Suite complète : 230 fichiers, 2 468 tests verts.
- **E2E, build de production** (`e2e/guided-tour.spec.ts`, 8 tests verts) : parcours complet à 1440, 1024 et 390 (cible trouvée, bonne route, carte et frise dans l'écran, aucun débordement horizontal) ; lanceur du rail ; clic du visiteur sur le Sankey puis filtre effacé en sortie ; geste automatique qui ouvre le panneau de revue ; Espace, « 3 », frise, Échap ; axe-core sur la surcouche (ouverture, Sankey, conclusion) : 0 violation critique ou sérieuse.
- **Non-régression E2E** : `landing`, `dashboard-navigation`, `synthese-refonte`, `accessibility`, `demo-journey`, `cloisons-mise-en-page`, `charte-pages`, `c03-assertions` : 101 verts. Captures de recette régénérées par ces specs restaurées (hors diff).
- **Navigateur** : parcours joué et inspecté image par image aux trois largeurs, en mouvement normal et réduit, console sans erreur ; vidéo de 2 min 18 s (landing comprise) enregistrée et relue.
- **Lint / typecheck** : `tsc --noEmit` propre ; `eslint` : 0 erreur, 5 avertissements préexistants hors de ce diff.

## Limites restantes

- **Dossier de la session** : lancer la visite sélectionne DEMO SA pour la session (comme « Ouvrir la démo DEMO SA ») ; un dossier importé se rouvre depuis « Reprendre un dossier » du Dépôt.
- **Ateliers serveur** (IFRS 16, dossier de clôture, feuilles de cycle) : hors parcours, car vides ou fermés en démonstration ; le registre des cycles de la Synthèse y mène.
- **Lecteur d'écran** : non vérifié (axe seulement). La carte est un dialogue non modal ; le tiroir de revue (≤ 1024 px) garde son propre piège de focus.
- **Vidéo** : non versionnée (≈ 15 Mo) ; `npm run demo:video` la régénère (ffmpeg requis). Sur ce poste, la version de Chromium installée diffère de `@playwright/test` : les e2e ont tourné avec une configuration locale hors dépôt pointant vers ce Chromium, et le script accepte `--chromium`.
- **15 e2e du profil local** (PostgreSQL) : non exécutés, inchangés par ce lot.

## Commandes

```bash
npm run lint && npm run typecheck && npm test
npm run build && npx playwright test e2e/guided-tour.spec.ts
PROBANT_DEMONSTRATION_ENABLED=true PROBANT_DEMONSTRATION_ORIGIN=http://127.0.0.1:3200 npx next start -H 127.0.0.1 -p 3200
npm run demo:video -- --base http://127.0.0.1:3200 --out probant-visite-guidee.mp4
```
