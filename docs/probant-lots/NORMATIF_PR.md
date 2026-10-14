# Audit Normatif 360 — descriptif de PR prêt à examiner

Titre : Audit Normatif 360 lisible à 390 px, navigation vers la liste des cycles rétablie, tiroirs de navigation accessibles (Normatif et tableau de bord)

Base : `main` `ff3f9fb` (worktree propre au départ, branche `claude/competent-borg-3d6941`).

Sur les routes `/normatif/*`, `app/normatif/layout.tsx` (commit `fb43c8e`) affichait la navigation latérale de 240 px à toutes les largeurs, sans point de rupture. À 390 px, `<main>` ne faisait que 150 px de large. Le titre de `/normatif/sources/cc-capitaux-propres` tenait sur 9 lignes et le registre des sources défilait dans un cadre de 100 px pour 530 px de contenu. Le bandeau était rogné, et 5 des 7 routes débordaient à l'intérieur de `<main>` (jusqu'à 457 px pour l'URL Légifrance). Le document, lui, ne débordait jamais : un contrôle `scrollWidth > clientWidth` restait vert sur une page illisible. Mesures relevées sous Chromium à 390 × 900, sur le build de production de la base. L'utilisateur avait observé environ douze lignes et 92 px.

La navigation reprend le motif du tableau de bord (`app/dashboard/layout.tsx` et `components/probant/Sidebar.tsx`). Dès `md` (768 px), elle reste dans la grille. En dessous, elle devient un tiroir hors champ, ouvert par le bouton « Ouvrir la navigation » du bandeau (`aria-controls`, `aria-expanded`) et refermé par « Fermer la navigation », par Échap, par le voile ou à chaque navigation. Le tableau de bord ne gère pas le focus ; ici, la gestion reprend celle du tiroir de revue des Cloisons. À l'ouverture, le focus va sur « Fermer ». Tab et Maj+Tab restent dans le tiroir, et la colonne de contenu devient `inert`. À la fermeture, le focus revient au bouton. Si la fenêtre repasse à 768 px ou plus pendant que le tiroir est ouvert, il se referme. Sous 640 px, le bandeau passe sur deux lignes : le titre, qui ne contient aucun élément focalisable, prend la seconde. Seule la propriété `translate` est animée (200 ms) ; à la fermeture, `visibility` attend la fin du glissement. Avec Tailwind 4, `translate-x-*` pose `translate` et non `transform` : la `transition-[transform,visibility]` du tableau de bord n'anime donc rien, et une `visibility` encore animée à l'ouverture empêchait le focus. La règle globale `prefers-reduced-motion` neutralise la transition.

Une fois la colonne élargie, deux défauts de page sont devenus visibles à 390. Corrigés sans toucher au texte : l'URL du « Lien officiel » passe à la ligne (`[overflow-wrap:anywhere]`, icône `shrink-0` calée sur la première ligne, rendu inchangé à 1024 et 1440). Le tableau « Différences IFRS vs PCG » rognait trois de ses quatre colonnes (`overflow-hidden`) ; il défile maintenant dans un cadre focalisable (`overflow-x-auto`, `tabIndex={0}`, `role="region"`, convention du dépôt).

**Navigation client vers `/normatif/cycles`.** Défaut antérieur au lot, reproduit sur le build d'origine de `ff3f9fb` : un clic vers la liste des cycles, depuis la barre latérale, l'accueil ou le fil d'Ariane d'une fiche cycle, ne changeait ni l'URL ni le contenu, sans erreur. C'était 12 échecs sur 12 depuis la barre latérale. Passer d'un filtre à l'autre se figeait aussi, par exemple « Tous » depuis `?famille=…` chargée directement (6 / 6).

Mécanisme instrumenté dans le navigateur, sur le chunk compilé du routeur :
- La page lit `searchParams`, elle est donc rendue à la demande ; son préchargement automatique ne contient que la mise en page partagée.
- Au clic, `layout-router` récupère la page (`?_rsc`, 99 Ko complets) et l'applique par `ACTION_SERVER_PATCH`.
- La file d'actions se vide et l'état final pointe bien vers `/normatif/cycles`. Pourtant le rendu en flux de la nouvelle liste n'est plus relancé une fois arrivées les dernières lignes Flight : la transition ne se valide jamais.
- Le défaut dépend du minutage, et une instrumentation lourde le masque parfois.

La cause interne à React (`19.2.0-canary-0bdb9206` embarqué par Next 15.5.27, dernière 15.x) n'est pas démontrée. Correctifs :
- `app/normatif/cycles/loading.tsx` : une frontière neuve affiche « Chargement des cycles d'audit… », valide la navigation, puis le contenu la remplace. Résultat : 12 / 12, et 27 / 27 sur le spec répété trois fois.
- Les puces de filtre et « Réinitialiser » deviennent des liens de document (`<a href>`), car la frontière de `loading.tsx` est conservée d'un paramètre de recherche à l'autre. Une frontière Suspense dont la clé est dérivée du filtre ne donnait que 11 à 14 réussites sur 15, et une clé sur la grille ne changeait rien. Chaque filtre recharge donc cette page serveur, localement.
- `e2e/normatif-navigation.spec.ts` couvre les quatre points d'entrée, sans attente puis après préchargement, et les enchaînements de filtres. Il échoue sur l'état antérieur (5 échecs sur 9) et passe sur la branche.

**Tiroir du tableau de bord.** Il avait les défauts corrigés côté Normatif :
- l'ouverture ne déplaçait pas le focus, et Tab partait vers la page derrière le voile, car l'aside précède le bandeau dans le DOM ;
- rien n'était inerte, et Échap refermait sans rendre le focus ;
- le tiroir ne glissait pas : `transition-[transform,visibility]` alors que `translate-x-*` pose `translate`.

La logique est désormais partagée par les deux modules dans `components/probant/useNavDrawer.ts` :
- focus sur « Fermer la navigation » à l'ouverture, et Tab bouclé dans le tiroir ;
- Échap, et retour du focus au bouton du bandeau ;
- fermeture au passage à `md`.

Dans le tableau de bord, `components/probant/Sidebar.tsx` reçoit le bouton « Fermer » (sous 768 px seulement) et la transition `translate`. `app/dashboard/layout.tsx` rend `inert` la colonne de contenu et le bouton flottant « Importer mon FEC ». Le nouveau spec `e2e/dashboard-tiroir.spec.ts` couvre le tiroir au clavier et au pointeur, le redimensionnement, le glissement et le mouvement réduit : 12 / 12. Les captures avant et après de la Synthèse et de la Cartographie des risques, tiroir fermé, sont identiques au pixel à 390, 1024 et 1440. Captures dans `docs/probant-lots/dashboard-tiroir-captures/`.

**Arbre de la méthodologie.** Chaque niveau imbriqué de `ContentTree` réservait 160 px à sa clé. La plus étroite des 168 valeurs mesurait 120 px à 1440, 8 px à 1024 et 0 px à 768 et 640 : à 1024, 4 textes sortaient de `<main>`. Les lignes clé/valeur passent en `flex-wrap`, et la valeur reçoit une largeur minimale de 7rem : faute de place, elle passe sous sa clé. Les captures pleine hauteur sont identiques au pixel à 1440 et 390 ; à 1024, les valeurs redeviennent lisibles (`normatif-captures/methodologie-1024/`). La dette gelée `KNOWN_OVERFLOW` est retirée du spec, qui vérifie désormais à 1440, 1280, 1024, 768 et 640 : aucun texte hors colonne, aucune valeur de moins de 112 px à côté de sa clé.

Fichiers applicatifs : `app/normatif/layout.tsx`, `components/normatif/CycleSidebar.tsx`, `app/normatif/sources/[slug]/page.tsx`, `components/normatif/IFRSvsPCGPanel.tsx`, `app/normatif/cycles/loading.tsx`, `app/normatif/cycles/page.tsx` (puces de filtre), `app/normatif/methodologie/page.tsx`, `components/probant/useNavDrawer.ts`, `components/probant/Sidebar.tsx`, `app/dashboard/layout.tsx`. Aucun contenu modifié, aucun calcul.

Validation (build de production, Chromium) : `e2e/normatif-mise-en-page.spec.ts` couvre les 7 routes du module à 390, 1024 et 1440 px. Il relève puis vérifie :
- la largeur réelle de `<main>` ;
- l'absence de débordement du document **et de `<main>`**, et l'absence de texte hors de la colonne en dehors des cadres défilants ;
- les lignes du titre et la largeur des cadres de tableau ;
- la navigation en flux ou en tiroir, au clavier et au pointeur, y compris le redimensionnement tiroir ouvert ;
- la transition sous mouvement réduit ;
- la dette axe « serious », qui ne doit pas augmenter.

La phase « avant » a été rejouée sur le build de `ff3f9fb` dans un worktree détaché : 21 relevés. Phase « après » : 26 / 26. Relevés et captures dans `docs/probant-lots/normatif-captures/{avant,apres}/`, synthèse dans `comparatif-390.png`.

`accessibility`, `mission20-contrast` (aucun des deux ne couvre `/normatif` ; joués en non-régression, sorties redirigées) et `bordures-stratifiees` (couvre `/normatif`, la fiche `achats-charges-externes` et `/normatif/sources` aux trois largeurs ; captures redirigées hors du dépôt) : 48 / 48. Typecheck OK. Lint : 0 erreur, et les 7 avertissements sont ceux de la base. Suite unitaire : 1 698 réussis ; 51 ignorés, soit les 9 fichiers de recettes PostgreSQL « durable » sans base locale, **non vérifiés**.

| Route à 390 | `<main>` | Débordement interne de `<main>` | Lignes du titre | Cadre de tableau |
|---|---|---|---|---|
| `/normatif` | 150 → 390 px | 24 → 0 px | 3 → 1 | — |
| `/normatif/cycles` | 150 → 390 px | 24 → 0 px | 2 → 1 | — |
| `/normatif/cycles/achats-charges-externes` | 150 → 390 px | 71 → 0 px | 4 → 1 | IFRS / PCG rogné → 340 / 419 px défilant |
| `/normatif/sources` | 150 → 390 px | 0 → 0 px | 2 → 1 | 100 / 530 → 340 / 530 px |
| `/normatif/sources/cc-capitaux-propres` | 150 → 390 px | 457 → 0 px | 9 → 3 | — |
| `/normatif/methodologie` | 150 → 390 px | 195 → 0 px | 3 → 1 | — |
| `/normatif/export` | 150 → 390 px | 0 → 0 px | 2 → 1 | — |

À 1024 et 1440, les captures avant et après sont identiques au pixel sur les 7 routes. Seule exception : l'accueil à 1024, où 17 pixels diffèrent d'au plus 8 / 255 (anticrénelage). La dette axe « serious » est inchangée sur les 21 vues (fiche cycle `link-name` 5, méthodologie `scrollable-region-focusable` 1, ailleurs 0).

Limites :
- Lecteur d'écran **non vérifié**.
- Sous 640 px, l'ordre visuel du titre du bandeau diffère de l'ordre du DOM (non focalisable).
- Le cadre IFRS reste un arrêt de tabulation même quand il ne défile pas (1024, 1440).
- Pas de geste de balayage pour fermer les tiroirs.

Détail : `docs/probant-lots/HANDOFF.md`.

Aucun merge ni déploiement réalisés.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
