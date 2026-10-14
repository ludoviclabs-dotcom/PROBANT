# Revue par cloison — descriptif de PR prêt à examiner

Titre : Revue par cloison — liste des silos lisible à 390, 1024 et 1440 px (panneau de revue en tiroir sous 1400 px)

Base : `main` `df94c1f` (fusion de la PR #79, dont ce lot préserve l'affichage des effets C05). La branche a été développée empilée sur la PR #79 (`38a698d`) ; l'arbre de `main` est identique à ce commit, la PR ne contient que ce lot.

Sur `/dashboard/cloisons`, le panneau de revue de 406 px (« Aucun constat sélectionné ») ne rétrécissait pas : il laissait 32 px à la liste des silos à 390 px (pour ≈ 453 px de contenu, `<main>` défilant 450 / 390) et 306 px à 1024 px, où les 28 lignes étaient rognées (« Immobilisat… », « 1 co… ») et les six cartes de constat ouvertes passaient sous « Analyser ». Le défaut figurait déjà dans les captures du lot bordures du 13/10.

Le panneau ne se range plus à droite qu'à partir de 1400 px de fenêtre, quand la liste garde ≥ 684 px et le silo ouvert ses connecteurs ; en dessous, « Analyser » ouvre le même panneau en tiroir modal (focus sur « Fermer », Tab piégé, Échap / voile / Fermer referment et rendent le focus à « Analyser »). La ligne de silo passe à la ligne — libellé et comptes, puis gravité et effet — sans jamais couper un poste d'effet C05 (« Résultat − 145 000 € », « effet non chiffré »). Le silo ouvert passe en une colonne sous 640 px et ses montants ne se coupent plus. Les menus de filtre s'ouvrent vers la gauche s'ils dépasseraient le bord droit (« Nature » faisait défiler `<main>` à 1024 px). Un seul fichier applicatif : `components/probant/CloisonsWorkspace.tsx` ; aucun calcul déplacé dans React.

Validation (build de production, Chromium, dossier démo) : `e2e/cloisons-mise-en-page.spec.ts` relève puis vérifie à 390, 1024 et 1440 px l'absence de débordement du document et de `<main>`, l'absence de texte rogné dans les 28 lignes et sous « Analyser », la largeur des lignes, la dette axe « serious » non aggravée (0 avant, 0 après), les menus de filtre ouverts, le panneau ancré (1440) ou en tiroir (1024, 390) au clavier, et la neutralisation de l'animation en mouvement réduit ; phase « avant » rejouée sur le build de la base (relevés et captures `docs/probant-lots/cloisons-captures/`). `components/probant/__tests__/cloisons-review-drawer.test.tsx` (tiroir, piège de focus, `aria-expanded`), `cloisons-effects.test.tsx` et `e2e/c05-effets-partages.spec.ts` (× 3 largeurs) restent verts, ainsi que `demo-journey`, `accessibility`, le typecheck et la suite unitaire complète (1 635 réussis ; 48 recettes PostgreSQL ignorées faute de base locale, non vérifiées). `partial-coverage` : un échec isolé de « la couverture partielle est affichée telle quelle », qui lit `/dashboard/synthese` avant chargement (défaut de délai antérieur, hors lot) ; 12 / 12 en relance.

| Largeur | Lignes de silo avant → après | Lignes rognées | `<main>` scroll / client |
|---|---|---|---|
| 390 | 32 px → 356 px | 28 → 0 | 450 / 390 → 390 / 390 |
| 1024 | 306 px → 730 px | 28 → 0 | 784 / 784 |
| 1440 | 722 px → 722 px (inchangé, panneau ancré) | 0 → 0 | 1200 / 1200 |

Limites : point d'ancrage calé sur la navigation de 240 px (requête de fenêtre) ; en tiroir, le voile masque la ligne signalée ; lecteur d'écran non vérifié ; captures C05 de l'en-tête à 390 non régénérées (ancienne marge de 26 px) ; en-tête « DEMO SA » et champ de recherche sans anneau de focus inchangés (hors lot). Détail : `docs/probant-lots/HANDOFF.md`.

Aucun merge ni déploiement réalisés.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
