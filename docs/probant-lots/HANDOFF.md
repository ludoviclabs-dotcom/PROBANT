# Handoff — Mission C11 : Clients, achats, cut-off et TVA — événements transversaux (2026-10-15)

**Vérification préalable.** Aucune trace de C11 sur GitHub (PR #1 à #92, branches, commits) ni sur Vercel (déploiements jusqu'à `300829b`) : le lot n'avait pas été traité. Les Missions 07 et 08 (PR #58, #59) avaient livré les chaînes Clients et Achats/cut-off que ce lot raccorde.

**Base.** Worktree `cockpit-fiscalite-dashboard-1c1ba9`, branche `claude/clients-achats-cutoff-tva-881799`, SHA de départ `300829b` (`main` après la PR #91), checkout propre. Écart avec la base du diagnostic `ab8f991` : C00 à C09 et les lots Cloisons, Normatif, éditions du référentiel (PR #90) et en-tête Cloisons (PR #91) fusionnés depuis ; aucun n'avait touché la grille de cut-off, les sources Achats ni la feuille TVA, hormis le résolveur C04 (PR #76), réutilisé. C10 (IS) n'est pas sur `main` : modifications non commitées dans le worktree `quizzical-boyd-13e46a` ; C11 ne recoupe ses fichiers que sur `lib/workpapers/fiscal-runtime.ts` (méthode `vatObservations` ajoutée avant `mission`) et `docs/README.md` (section C11 ajoutée après C09) : conflits de fusion textuels possibles, sans recouvrement fonctionnel. Commits locaux `023bac3` (lot) et `783b7b1` (fusion de `main` après la PR #92) ; rien poussé, aucun merge ni déploiement.

## Cause

- La grille de cut-off ne citait aucun texte : ni l'édition de l'exercice, ni ANC 2026-03 (anticipation, champ contractuel). Le résolveur C04 laissait le champ contractuel non daté (Légifrance 403) et le recueil PCG 2024 « inaccessible ».
- Un avoir à cause antérieure produisait une « FAE » ou une « FNP » négative.
- Clients et ventes, Achats / RPNE et TVA ne partageaient aucun événement ; `/cutoff` ne lisait que les feuilles Achats ; quatre dates seulement (fait générateur, facture, comptabilisation, clôture) ; aucun paiement, aucune période TVA ; exigibilité « à qualifier ».
- La règle Revenu (C03) et le scénario STARTUP-CA-1 parlaient de « transfert du contrôle » (IFRS 15) et de « CCA » pour des produits constatés d'avance.

## Changements

Voir `docs/mission-c11/CONTRAT.md` (§ 1 avant / après, § 3 carte événement → procédures → sources → effets, § 4 dépendances d'invalidation, § 5 qualification TVA, § 7 sources lues).

## Sources

Lues le 15/10/2026, empreintes vérifiées contre le registre C04 : PCG 2024 (`f608f78f…`), ANC 2022-06 (`aeaa05cf…`), PCG consolidé 2026 (`b9e7a732…`), ANC 2026-03 (`59330e81…`) ; arrêté du 12/08/2026 (Légifrance, navigateur) ; CGI 269 et 271 (Légifrance) ; BOI-TVA-BASE-20-10, 20-20, 20-50-10 (BOFiP). **Écarts du registre fiscal consignés, non corrigés** (art. 269 : 01/01/2022 → 31/08/2026 au registre, 01/01/2023 → 31/12/2026 sur Légifrance ; art. 271 : aucune version avant le 21/02/2026 alors que le I-2 est identique depuis le 31/12/2023) : les corriger changerait la couverture du moteur TVA et la recette Mission 13.

## Cas contrôlés

| Contrôle | Résultat |
|---|---|
| Recette C11 (`c11-transversal-events.test.ts`) : texte applicable (exercices 2025-2026, 2026 avec et sans option, 2027 selon la date du contrat), moteur de cut-off réel sur les 8 cas, carte (dates, TVA, règlements, observations), pont C05, procédures C03, divergence, péremption | 33 / 33 |
| Raccord de la chaîne réelle Mission 08 (`c11-event-map-adapter.test.ts`) : D compté une fois 600 HT, G suspendu comme dans la synthèse Achats, feuille périmée hors effet | 2 / 2 |
| Résidus par clé et compensation globale (`c11-compensation.test.ts`) : net 0 masquant ±50 → brut 100 ; clé absente → partiel | 2 / 2 |
| Résolveur C04 (`french-gaap.test.ts`), dont 3 cas C11 | 17 / 17 |
| Recette PostgreSQL 17 jetable locale (`clients-durable` + `fiscal-durable`), dont le cas C11 `operation=events` (effet unique de D, reliquat de G, feuille Clients périmée par sa révision, refus inter-organisation, paramètres refusés) | 31 / 31 |
| Avant / après de la grille (`docs/recette/c11/AVANT-APRES-cutoff.json`, moteur 1.0.0 de `300829b` contre 1.1.0) | Factures : 8 résultats identiques ; avoir AV-106 : « FAE −500 » → « AAE −500 » ; texte cité en 1.1.0 |
| Suite Vitest complète sur `300829b` + C11 (avant fusion de la PR #92) | 1 870 / 1 875 ; les 5 échecs sont ceux de `main` corrigés par la PR #92 (éd. 3 du référentiel), sans lien avec C11 |
| Suite Vitest complète après fusion de `main` (`783b7b1`) | 182 fichiers, 1 880 / 1 880 (recettes PostgreSQL incluses, base jetable locale) |
| E2E sur build de production : `c11-carte-evenements.spec.ts` à 1440, 1024 et 390 px (clavier, focus du panneau, axe WCAG 2.1 AA, aucun débordement, mouvement réduit) et `payables.spec.ts` (dont `/cutoff` adapté à la carte) | 8 / 8 ; captures relues aux trois largeurs |
| `tsc --noEmit`, ESLint des fichiers modifiés ; `next build` de production après fusion | aucune erreur ; build OK |

Captures : `docs/probant-lots/c11-captures/cutoff-carte-{1440,1024,390}.jpg`.

Correction consignée de la recette : l'attendu du cas 8 a été révisé pendant le lot (voir `docs/recette/c11/RECETTE.md`, « Corrections consignées ») pour suivre la règle de la synthèse Achats : une procédure qui teste l'événement et ne conclut pas suspend l'effet.

## Limites restantes

- Acomptes encaissés avant la clôture et cause datée d'un avoir post-clôture : non sourcés dans la chaîne réelle (qualification partielle ou information requise, affichées comme telles).
- Option d'anticipation d'ANC 2026-03 non sourcée ; option pour les débits déclarée par facture (original à corroborer).
- Avoirs non importables comme événements de cut-off ; TVA sur avoirs (272, 267) non couverte ; prix variables, contrats à long terme, droits de retour non implémentés.
- Les constats C05 de la carte ne sont pas versés dans la Synthèse du dossier (lot C14).
- Écarts du registre fiscal (art. 269, 271) à corriger dans un lot dédié.

# Handoff — Audit Normatif 360 à 390 px, navigation vers la liste des cycles, tiroirs de navigation (2026-10-14)

**Base.** Worktree `probant-analysis-setup-41121f`, branche `claude/competent-borg-3d6941`, SHA de départ `ff3f9fb` (`main` après la PR #84 C08), checkout propre. Le module Normatif n'avait pas bougé depuis son introduction (`fb43c8e`). Fichiers applicatifs modifiés : `app/normatif/layout.tsx`, `components/normatif/CycleSidebar.tsx`, `app/normatif/sources/[slug]/page.tsx`, `components/normatif/IFRSvsPCGPanel.tsx`. La demande citait `NormatifSidebar` ; le composant réel s'appelle `CycleSidebar`. Aucun contenu modifié, aucun merge ni déploiement.

**Validation sur l'arbre intégré (`f206fd6` + ce lot, fusion `0a9ac6a`, suivie de `9187912`).** Les mesures avant/après ci-dessous ont été faites sur `ff3f9fb`. La PR #85 (C09) est arrivée dans `main` entre-temps. Une fois `main` fusionné, tout a été rejoué sur le build de production de l'arbre intégré :
- les trois specs du lot : 52/52 ;
- la suite e2e complète : 277 réussis, 5 ignorés (profil local C07 et FEC persistant, faute de variables d'environnement : non vérifiés), 1 échec ;
- la suite unitaire (`--pool=forks`) : 1 741 réussis et 51 ignorés (recettes PostgreSQL). Le pool par défaut est sorti en erreur de segmentation, comme déjà constaté dans ce dépôt ;
- typecheck OK, lint sans erreur (7 avertissements de la base).

Le seul échec, `e2e/tax-release-gate.spec.ts`, est **antérieur à ce lot**. Sur un build de `f206fd6` seul, dans un worktree détaché, il échoue 3 fois sur 18 exécutions. Le test dépose la balance juste après le clic « Nouveau dossier », sans attendre la navigation, et la vérification d'URL est déjà vraie avant le clic. Ce défaut est laissé hors lot.

## Cause

| Défaut | Où | Effet mesuré (Chromium, build de production de `ff3f9fb`, 390 × 900) |
|---|---|---|
| Navigation `w-60 shrink-0` toujours affichée, sans point de rupture | `app/normatif/layout.tsx`, `CycleSidebar` | `<main>` de 150 px sur les 7 routes (90 px utiles avec le `p-6` des pages). Titre de la fiche `cc-capitaux-propres` sur 9 lignes, registre des sources dans un cadre de 100 px pour 530 px, bandeau rogné (« Audit Normatif 360 » et le badge coupés). Débordement interne de `<main>` : 24 px (accueil, cycles), 71 px (fiche cycle), 195 px (méthodologie), 457 px (fiche source). Le document restait à 390 / 390 : `<main>` défile dans son cadre, d'où l'angle mort du contrôle `scrollWidth`. |
| URL insécable dans une ligne flex | `Row` de `app/normatif/sources/[slug]/page.tsx` | sortait de la carte, donc de `<main>`, à toute largeur étroite |
| Tableau dans un cadre `overflow-hidden` | `IFRSvsPCGPanel` | à 390, seule la colonne « Thème » restait visible ; « Traitement IFRS », « Traitement PCG » et « Impact audit » étaient rognées sans défilement possible |

## Changements

- **Mise en page** (`app/normatif/layout.tsx`, composant client comme `app/dashboard/layout.tsx`) : état `navOpen`, voile `z-[45] md:hidden`, bouton « Ouvrir la navigation » (`aria-controls="normatif-nav"`, `aria-expanded`, `md:hidden`), hauteur `h-dvh`, bandeau `px-4 md:px-6`. Gestion du focus reprise du `ReviewDrawer` des Cloisons. À l'ouverture, le focus va sur « Fermer la navigation » et Tab / Maj+Tab bouclent dans le tiroir. Ouvert, le tiroir rend la colonne de contenu `inert`. Il se ferme par Échap, le voile, « Fermer » ou un lien, et le focus revient alors au bouton du bandeau. Il se ferme aussi quand la fenêtre passe `md` (`matchMedia`, gardé pour jsdom). Sous `sm`, le titre du bandeau prend une seconde ligne (`order-last basis-full`, aucun élément focalisable) et le séparateur disparaît.
- **Navigation** (`CycleSidebar`) : `id="normatif-nav"`, mêmes classes de tiroir que `components/probant/Sidebar` (`max-md:fixed`, `z-50`, ombre, `invisible` fermé, donc hors de l'ordre de tabulation). Elle accepte `ref`, `open`, `onNavigate` (appelé par chaque lien) et `onClose` (bouton « Fermer », `md:hidden`). Seule la propriété `translate` est animée à l'ouverture ; à la fermeture, `translate` et `visibility` sont animées ensemble. Avec Tailwind 4, `translate-x-*` pose `translate` : la `transition-[transform,visibility]` reprise telle quelle n'aurait rien animé, et une `visibility` encore `hidden` au premier rendu rendait `focus()` inopérant (constaté en e2e).
- **Fiche source** : la valeur d'une ligne est `min-w-0 [overflow-wrap:anywhere]`. L'icône du lien officiel est `shrink-0`, calée sur la première ligne (`mt-[calc((1lh_-_0.75rem)/2)]`, même position qu'avec le centrage quand l'URL tient sur une ligne).
- **IFRS / PCG** : cadre `overflow-x-auto`, `tabIndex={0}`, `role="region"`, `aria-label`, comme `ModuleAvailability` et `WorkpaperPanel`.
- Charte graphite/indigo, accent violet du module et textes inchangés.

## Navigation client vers `/normatif/cycles` (second passage, même jour)

- **Défaut antérieur**, reproduit sur le build d'origine de `ff3f9fb` (sans les changements de mise en page) : un clic vers la liste des cycles, depuis la barre latérale, l'accueil ou le fil d'Ariane d'une fiche cycle, ne changeait ni l'URL ni le contenu, sans erreur (12 / 12 depuis la barre latérale). Le chargement direct fonctionnait, comme toutes les routes statiques du module. Passer d'un filtre à l'autre se figeait aussi, par exemple « Tous » depuis `?famille=ACTIF_IMMOBILISE` chargée directement (6 / 6) ; vers certaines familles, au hasard.
- **Constaté par instrumentation** (chunk compilé du routeur servi modifié par Playwright, sans toucher au build) :
  - La page lit `searchParams`, elle est donc dynamique (ƒ). Son préchargement automatique ne contient que l'arbre et le gabarit partagé (154 octets).
  - Au clic, `layout-router` récupère la page (`?_rsc`, 99 Ko complets, aucun `digest`) et dispatche `ACTION_SERVER_PATCH`. Le patch s'applique (`applyRouterStatePatchToTree` ≠ null) et le cache produit contient `rsc` pour `normatif`, `cycles` et `__PAGE__`.
  - React re-rend la page plusieurs fois, au fil des lignes Flight qui arrivent (cartes outlinées `$L…`, module client `Link`), puis s'arrête alors que toutes ces lignes finissent `fulfilled`. La file d'actions est vide et l'état pointe sur `/normatif/cycles` : la transition ne se valide jamais.
  - Un préchargement complet (`router.prefetch(…, { kind: "full" })`) corrige l'entrée (4 / 4) mais pas le passage de filtre à filtre. Le défaut dépend du minutage, et une instrumentation lourde le masque parfois.
  - Cause interne à React (`19.2.0-canary-0bdb9206-20250818`, embarqué par Next 15.5.27, dernière version 15.x) **non démontrée**. Aucun rapport identique trouvé (le plus proche : correctif de la file d'actions, issue next.js #86151).
- **Correctifs.**
  - `app/normatif/cycles/loading.tsx` : le segment se monte sous une frontière neuve, React valide la navigation en affichant « Chargement des cycles d'audit… », puis le contenu arrive par relance de la frontière.
  - Les filtres et « Réinitialiser » (`app/normatif/cycles/page.tsx`) deviennent des liens de document : la frontière de `loading.tsx` est conservée d'un paramètre de recherche à l'autre, car Next calcule la clé d'état sans les paramètres. Exception ESLint locale et justifiée pour « Réinitialiser ». Pistes écartées, mesurées : clé sur la grille (aucun effet), frontière Suspense dont la clé est dérivée du filtre (11 à 14 réussites sur 15).
  - Le test du tiroir de `e2e/normatif-mise-en-page.spec.ts` suit de nouveau « Cycles d'audit ».
- **Vérifié.** `e2e/normatif-navigation.spec.ts` (4 points d'entrée × clic immédiat / après préchargement, plus 7 enchaînements de filtres) : 27 / 27 avec `--repeat-each=3` sur la branche ; 5 échecs sur 9 sur l'état antérieur. Rejoués sur le build final avec `normatif-mise-en-page`, `accessibility`, `mission20-contrast` et `bordures-stratifiees` : 83 / 83. Typecheck OK, lint 0 erreur, avec les 7 avertissements de la base.
- **Limites.** Un changement de filtre recharge la page (perte de l'état client de la page, sans conséquence aujourd'hui). La cause React reste à confirmer et pourrait disparaître avec une montée de version de Next (16.x, hors lot) ; il faudra alors réévaluer le retour à `next/link` pour les filtres.

## Tiroir du tableau de bord et arbre de la méthodologie (troisième passage, même jour)

- **Tiroir du tableau de bord** (`components/probant/Sidebar.tsx`, `app/dashboard/layout.tsx`).
  - *Avant* : focus non déplacé à l'ouverture. Tab partait du bouton vers la page derrière le voile, car l'aside précède le bandeau. Rien n'était inerte, Échap ne rendait pas le focus, et le tiroir ne glissait pas (`transition-[transform,visibility]` alors que Tailwind 4 pose `translate`) : il apparaissait d'un coup, puis restait affiché 200 ms avant de disparaître.
  - *Changements* : hook partagé `components/probant/useNavDrawer.ts`, repris de la mise en page Normatif, qui l'utilise désormais aussi. Il gère le focus sur `[data-nav-close]`, la boucle de Tab, Échap, le retour du focus au bouton et la fermeture au passage à `md`. `Sidebar` accepte `ref` et `onClose`, avec un bouton « Fermer la navigation » en `md:hidden` et des transitions `translate` à l'ouverture, `translate, visibility` à la fermeture. La mise en page rend `inert` la colonne de contenu et le CTA flottant.
  - *Vérifié* : `e2e/dashboard-tiroir.spec.ts` (phase « avant » sur le build de la base, puis « après ») : 12 / 12. Synthèse et Cartographie des risques à 390, 1024 et 1440, tiroir fermé : identiques au pixel ; dette axe non aggravée.
- **Arbre de la méthodologie** (`app/normatif/methodologie/page.tsx`, `ContentTree`).
  - *Avant* : la plus étroite des 168 valeurs mesurait 120 px à 1440 et 1280, 8 px à 1024, 0 px à 768 et 640 (4 textes hors de `<main>` à 1024, valeurs coupées mot par mot, badges sortis des cartes).
  - *Changement* : ligne clé/valeur en `sm:flex-row sm:flex-wrap sm:gap-x-2`, valeur en `sm:min-w-[7rem]`. Sous 112 px de place, la valeur passe sous sa clé. Pas de requête de conteneur, donc pas de confinement.
  - *Vérifié* : captures pleine hauteur identiques au pixel à 1440 et 390. Le spec Normatif ne gèle plus la dette (`KNOWN_OVERFLOW` retiré) et vérifie, de 1440 à 640, aucun texte hors colonne et aucune valeur de moins de 112 px à côté de sa clé.
- **Contrôles du passage.**
  - Suite e2e complète sur le build final : 267 réussis, 5 ignorés (profil local C07 et FEC persistant, faute de variables d'environnement : non vérifiés), 0 échec. Les captures d'autres lots réécrites par la suite ont été restaurées, et les sorties `docs/recette/c00|c01/after` supprimées.
  - Suite unitaire : 1 698 réussis, 51 ignorés (recettes PostgreSQL).
  - Typecheck OK. Lint : 0 erreur, et les 7 avertissements de la base.

## Mesures avant / après (Chromium, build de production)

« Avant » : build de `ff3f9fb` dans un worktree détaché (jonction `node_modules`, retirée avant `git worktree remove`). « Après » : build de la branche. Relevés JSON et captures dans `docs/probant-lots/normatif-captures/{avant,apres}/`, synthèse dans `comparatif-390.png`.

| Route (390) | `<main>` | Débordement interne | Textes hors colonne | Lignes du titre | Cadres de tableau |
|---|---|---|---|---|---|
| `/normatif` | 150 → 390 | 24 → 0 | 3 → 0 | 3 → 1 | — |
| `/normatif/cycles` | 150 → 390 | 24 → 0 | 2 → 0 | 2 → 1 | — |
| `/normatif/cycles/achats-charges-externes` | 150 → 390 | 71 → 0 | 33 → 0 | 4 → 1 | rogné → 340 / 419 |
| `/normatif/sources` | 150 → 390 | 0 → 0 | 0 → 0 | 2 → 1 | 100 / 530 → 340 / 530 |
| `/normatif/sources/cc-capitaux-propres` | 150 → 390 | 457 → 0 | 1 → 0 | 9 → 3 | — |
| `/normatif/methodologie` | 150 → 390 | 195 → 0 | 15 → 0 | 3 → 1 | — |
| `/normatif/export` | 150 → 390 | 0 → 0 | 0 → 0 | 2 → 1 | — |

À 1024 et 1440, `<main>` mesure 784 et 1200 px avant comme après. Les captures sont identiques au pixel sur les 7 routes, sauf l'accueil à 1024 : 17 pixels diffèrent d'au plus 8 / 255 (anticrénelage). Dette axe « serious » identique sur les 21 vues : fiche cycle `link-name` 5, méthodologie `scrollable-region-focusable` 1, ailleurs 0.

## Tests exécutés (local, 2026-10-14)

| Vérification | Résultat |
|---|---|
| `e2e/normatif-mise-en-page.spec.ts` phase « avant » (build de `ff3f9fb`) | 21 relevés et captures ; assertions et tests du tiroir non joués par construction |
| `e2e/normatif-mise-en-page.spec.ts` phase « après », 7 routes × 1440 / 1024 / 390 : largeur de `<main>` ; aucun débordement du document ni de `<main>` ; aucun texte hors colonne hors cadres défilants ; titre ≤ 4 lignes et cadres ≥ 300 px à 390 ; navigation en flux (≥ 768) ou en tiroir fermé (390) ; icône du lien officiel ; dette axe non aggravée. Plus le tiroir au clavier (focus sur « Fermer », un tour de Tab et Maj+Tab sans sortir, `inert`, Échap rend le focus) et au pointeur (voile, « Fermer », lien qui navigue et referme), le passage 390 → 1024 → 390 tiroir ouvert et la transition sous mouvement réduit (0,2 s / < 0,01 s) | 26 / 26 |
| `e2e/accessibility.spec.ts`, `e2e/mission20-contrast.spec.ts` (ne couvrent pas `/normatif` ; sortie de mission20 redirigée puis supprimée), `e2e/bordures-stratifiees.spec.ts` (couvre `/normatif`, `/normatif/cycles/achats-charges-externes`, `/normatif/sources` × 3 largeurs ; captures redirigées hors du dépôt) | 48 / 48 |
| Suite unitaire complète | 1 698 réussis, 0 échec ; 51 ignorés (9 fichiers de recettes PostgreSQL « durable », sans base locale : **non vérifiés**) ; aucun test de composant ne couvre `components/normatif` |
| Typecheck | OK |
| Lint complet | 0 erreur ; 7 avertissements, identiques à la base (aucun dans les fichiers touchés) |
| Build de production (`next build`) | OK |

## Limites et maturité

- Lecteur d'écran : rôles et noms posés (`aria-controls`, `aria-expanded`, `aria-label`, `inert`) ; **non vérifié** avec NVDA ou VoiceOver.
- Sous 640 px, le titre du bandeau s'affiche sous le badge alors qu'il le précède dans le DOM. L'élément n'étant pas focalisable, seul l'ordre de lecture vocale diffère de l'ordre visuel.
- Le cadre IFRS / PCG est un arrêt de tabulation même quand il ne défile pas (1024, 1440), comme les autres cadres du dépôt.
- Les seuils du spec à 390 (titre ≤ 4 lignes, cadres ≥ 300 px) découlent de la colonne utile de 342 px. Relevé « avant » mesuré sous Windows ; les polices next/font sont embarquées, mais un écart de rendu sous Linux CI reste possible.

## Dépendances du lot suivant

- Aucune.

---

# Handoff — Mission C09 : parcours Capitaux propres unique (2026-10-14)

**Base.**

- Branche `claude/c09-capitaux-propres-parcours`, worktree `quizzical-boyd-13e46a`.
- SHA de départ `ff3f9fb` (`main` après la PR #84 C08), checkout propre.
- Écart avec la base du diagnostic `ab8f991` : C00 à C08 ont été fusionnés depuis. Aucun ne touchait les deux feuilles Capitaux propres, hormis :
  - les liens de contexte (C01) ;
  - le profil personnel (C07).

## Inventaire (avant)

- **Deux procédures.**
  - `equity.review` : `/equity`, #62, tables `clients_*`, règle 1.0.0, résultat `equity-result-1`.
  - `capitaux_propres.review` : `/capitaux-propres`, #65, tables `eq_*`, règle 1.0.0, résultat portant le même nom `equity-result-1`.
- **Navigation.** Le registre des cycles proposait la feuille et la « procédure parallèle ».
- **Moteur `/capitaux-propres`.**
  - Pas d’amendement.
  - Paiement présenté sans comparaison au vote.
  - Autres fonds propres exclus sans qualification.
  - Aucun repère juridique.
- **ANC 2024-07.** Le résolveur C04 le datait, mais aucun moteur ne le consommait.

## Cause et reproduction

Moteur de `ff3f9fb` exécuté sur le dossier C09 (`docs/recette/c09/AVANT-capitaux-1.0.0.json`) :

- **Amendement.** D-EXC-2 ressort en `amount_divergent` **+50** (20 comptabilisés contre −30 votés), et D-EXC-1 et D-EXC-2 sont comptées comme deux votes.
- **Dividende non payé.** D-DIV n’affiche que « Aucun règlement rattaché ».
- **Deux parcours.** Lus séparément, ils affichent deux fois les décisions communes.

## Changements

Voir `docs/mission-c09/COMPARAISON.md`, `docs/mission-c09/CONTRAT.md` et `docs/probant-lots/C09_PR.md`.

- **Vue commune** en lecture seule. Entrée unique `/capitaux-propres/parcours` ; dédoublonnage par PV (empreinte et page) ; liens vers chaque feuille à sa version exacte avec le contexte du dossier.
- **Règle `capitaux_propres.review` 1.1.0** :
  - amendements ;
  - paiement par décision ;
  - présentation dettes / autres fonds propres datée par le résolveur C04 ;
  - repères légaux datés.

  Une feuille 1.0.0 est consultable ; seule la révision est permise.
- **Écrans.**
  - Formulaire du cadre et des instruments.
  - Blocs présentation et repères, partagés avec le parcours.
  - Alerte 1.0.0.
  - Liens croisés entre les feuilles et le parcours.
- **Registres.** Registre des cycles réduit à une seule entrée Capitaux propres ; registre C01 passé en 1.2.0.
- **Export de mission** complété.

## Vérifié

- **Recette C09** : 18/18 (garde de règle au runtime et amendement postérieur à la clôture compris), attendus posés à la main (`docs/recette/c09/RECETTE.md`).
- **Modules purs** : 19/19.
- **Route du parcours** : 5/5.
- **Suites `/capitaux-propres` existantes** : 52/52, attendus Mission 11 inchangés hors texte juridique.
- **Registres, dossier et composants** : 152/152.
- **Suite unitaire complète** (`--project unit --pool=forks` ; la configuration par threads plante sur ce poste) : 1 739/1 739, sans test ignoré.
- **Recettes PostgreSQL** (`--project durable`, PostgreSQL 17.11 jetable, port 55432, base `probant_test`, variable `PROBANT_CLIENTS_TEST_DATABASE_URL`) : 51/51, sans test ignoré.
- **E2E** sur build de production : `c09-capitaux-parcours.spec.ts` (7 cas, trois largeurs) et `capitaux-propres.spec.ts` (5 cas). Captures : `docs/probant-lots/c09-captures/`.

## Pièges

- **Recettes PostgreSQL.** Elles lisent `PROBANT_CLIENTS_TEST_DATABASE_URL`, pas `DATABASE_URL`. Sans elle, les 51 cas sont ignorés.
- **Imports dans les fixtures.** Un fixture importé par un e2e Playwright ne doit pas utiliser `await import("../…")` : l’alias `@/` des modules chargés dynamiquement n’est pas résolu.
- **Légifrance.** Les pages `codes/article_lc` et `section_lc/<date>` se lisent dans le navigateur intégré. Les pages `/loda/` déclenchent une vérification anti-robot, à ne pas contourner.
- **Format des montants.** `eur()` produit « EUR » précédé d’une espace insécable, jamais « € ».

## Reste à faire (hors lot)

- **Phase 2 de la transition** : correspondance manuelle citée entre feuilles, portage de la couverture déclarée de `/equity`.
- **Textes paraphrasés** : alignement de `data/cycles/capitaux-propres.yml` et de `lib/demo/scenarios.ts` (HOLDING-CP-1) sur les articles lus (tâche proposée).

Aucun merge ni déploiement réalisés.

---

# Handoff — Mission C08 : valeur, coûts et périmètre Stocks (2026-10-14)

**Base.** Branche `claude/c08-stocks-valeur-bornes`, worktree `quizzical-boyd-13e46a`, SHA de départ `c5e717b` (`main` après les PR #82 C06 et #83 C07), checkout propre. Écart avec la base du diagnostic `ab8f991` : C00 à C07 et le lot Cloisons ont été fusionnés depuis ; aucun n'avait touché au moteur Stocks livré par #67. Aucun merge ni déploiement.

## Inventaire (avant)

- **Revue de valeur.** `stock-value-review.ts` : écart indicatif = (coût − (prix − sortie)) × quantité théorique, sans borne, comparé à la dépréciation de la ligne théorique. Valeur actuelle négative admise mais non signalée. Quantité théorique retenue même sur un écart de quantité, une référence non comptée ou des mouvements incomplets. Une référence absente du théorique était classée « coût absent ».
- **Coûts.** `stock-valuation.ts` : `costOf` prend le coût du lot, sinon la ligne sans lot, sans le dire. Méthode affichée « Coût moyen pondéré (PCG art. 213-34) » sans dire qu'elle est déclarée.
- **Totaux.** Revue : `reviewed`, `notReviewed`, un écart indicatif global. Aucune population des exclusions ni valeur de la part non revue.
- **Registre C01.** « Inventaire compté », « Présence physique non certifiée ».

## Cause et reproduction

Moteur de `c5e717b` exécuté le 14/10/2026 sur le dossier C08 (`docs/recette/c08/AVANT-1.0.0.json`) :

- REF-N (coût 10, prix 2, sortie 5, 10 unités) : écart **130,00** pour une valeur au coût de **100,00**, différence connue +130,00.
- REF-Q (6 comptées pour 10) : « gap » complet, différence connue +10,00.
- REF-L L2 : repli de coût non signalé.

## Changements

Voir `docs/mission15/CONTRAT.md` § C08 et `docs/probant-lots/C08_PR.md`.

- **Règle 1.1.0** et résultat `stocks-result-3`.
- **Trois montants par unité** : comparaison économique, perte de valeur de l'actif bornée à la valeur comptable de référence, complément à qualifier (`VALUE_EXCESS_TO_QUALIFY`, montant inconnu).
- **Quantité retenue et sa base**, avec estimation partielle (`VALUE_QUANTITY_UNRESOLVED`) et alternative sur la quantité reconstituée.
- **Base de jugement** rédigée côté serveur.
- **Coûts et hypothèses** : base `lot` / `reference` / `reference_fallback`, capacité `declared`.
- **Totaux par population** pour la revue et pour le sous-lot coûts.
- **Feuilles 1.0.0** consultables et périmées ; seule la révision est permise.
- **Interface** : tableau de revue, panneau de détail, cases, alerte 1.0.0.
- **Registre C01** passé en 1.1.0.

## Vérifié

- **Recette C08** : 12/12 (attendus posés à la main, `docs/recette/c08/RECETTE.md`).
- **Suites Stocks** : 64/64.
- **Suite complète** : 1 749/1 749, sans test ignoré. Les recettes PostgreSQL ont tourné sur un cluster jetable local (PostgreSQL 17.11 du poste, dossier temporaire, port 55432, base `probant_test`, migrations jusqu'à 0019).
- **Contrôles statiques** : typecheck, lint sans erreur, build de production.
- **E2E** : `c08-stocks-valeur.spec.ts` à 1440, 1024 et 390 (clavier, axe, débordement, animations réduites, registre C01) avec `stocks.spec.ts` et `c01-context.spec.ts`, 27/27. Captures : `docs/probant-lots/c08-captures/`.
- **Suite e2e complète** : 209 réussis. 3 échecs C01, sur l'ancien libellé du registre ; l'attente a été alignée et le cas repasse. 5 ignorés hors lot, non vérifiés : profil local C07 ×4 et dépôt FEC persistant ×1. Les captures des autres lots réécrites par la suite ont été restaurées.

## Limites restantes

- La borne retenue est la base au coût documenté. Un écart avec la valeur théorique déclarée est signalé dans la base de jugement, non arbitré.
- Le complément est à qualifier humainement : aucune estimation de passif, aucune provision.
- Pas de reconstitution CUMP / PEPS : les sources ne portent ni stock d'ouverture valorisé, ni entrées valorisées, ni sorties de l'exercice. La valeur d'usage, les contrats de vente ferme (214-23) et les positions globales (214-22) ne sont pas modélisés.
- La conservation d'une feuille 1.0.0 est prouvée au runtime (magasin mémoire), pas sur PostgreSQL. Les e2e n'utilisent pas de persistance.


# Handoff — Mission C07 : runtime personnel local persistant (2026-10-14)

**Base.** Branche `claude/local-persistent-runtime-ff20f9`, worktree `quizzical-boyd-13e46a`, SHA de départ `01150b5` (= `main` après la PR #81), checkout propre. Écart avec la base du diagnostic `ab8f991` : C00 à C05 et le lot Cloisons fusionnés depuis ; aucun lot n'avait touché aux drapeaux `disposable`, au stockage ni à l'identité. Aucun push, aucune PR distante, aucun déploiement ; rien n'est activé sur Vercel.

**Dépendance installée sur le poste, avec l'accord explicite de l'utilisateur** : binaires PostgreSQL 17.11 pour Windows (EDB, `postgresql-17.11-5-windows-x64-binaries.zip`, 381,5 Mo, SHA-256 `80379b2c…f82f`), extraits (bin, lib, share) dans `%LOCALAPPDATA%\PROBANT\pgsql-17`. Pas de service Windows, pas de droits administrateur.

## Inventaire constaté (avant)

| Chaîne (tables) | Drapeau | Construction | Pièces |
|---|---|---|---|
| Clients cadrage + ventes (`clients_`) | `PROBANT_CLIENTS_DURABLE` | `clients-server.ts` → `ClientsRuntime(getDatabase())`, SQL direct | `clients_imports.original_base64` (≤ 10 Mio) |
| Achats (`clients_`) | `PROBANT_PAYABLES_DURABLE` | `PayablesRuntime extends ClientsRuntime` | idem |
| Equity (`clients_`) | `PROBANT_EQUITY_DURABLE` | `EquityRuntime extends ClientsRuntime` | idem |
| Participations (`clients_`) | `PROBANT_INVESTMENT_DURABLE` | `InvestmentRuntime extends ClientsRuntime` | idem |
| Exceptionnel (`clients_`) | `PROBANT_EXCEPTIONAL_DURABLE` | `ExceptionalRuntime extends ClientsRuntime` | idem |
| Trésorerie (`cash_`) | `PROBANT_CASH_DURABLE` | `CashRuntime(PostgresCashDatabase)` | `cash_imports.original_base64` |
| Immobilisations (`fa_`) | `PROBANT_FIXED_ASSETS_DURABLE` | `FixedAssetRuntime(PostgresFixedAssetDatabase)` | `fa_imports` |
| Capitaux propres (`eq_`) | `PROBANT_CAPITAUX_DURABLE` | `EquityRuntime` de `capitaux-runtime.ts` | `eq_imports` (PV en PDF) |
| Fiscal TVA / IS (`fx_`) | `PROBANT_FISCAL_DURABLE` | `FiscalRuntime(PostgresFiscalDatabase)` | `fx_imports` |
| Stocks (`st_`) | `PROBANT_STOCKS_DURABLE` | `StockRuntime(PostgresStockDatabase)` | `st_imports` |
| Provisions (`pv_`) | `PROBANT_PROVISIONS_DURABLE` | `ProvisionRuntime(PostgresProvisionDatabase)` | `pv_imports` |
| Clôture (`cl_`) | `PROBANT_CLOSING_DURABLE` | `ClosingRuntime(PostgresClosingDatabase)`, lit les têtes des 7 familles | `cl_pieces.original_base64` (≤ 3 Mio) |
| Paie | aucun | en mémoire (`payroll-runtime.ts`) | — (lot C12) |

- Chaque garde n'acceptait que `=== "disposable"` hors `VERCEL_ENV=production` ; sans drapeau, 503 `*_DURABLE_DISABLED`, sans repli.
- Contrats de stockage : imports des feuilles en base (`insertImport` / `imports` / `download` avec contrôle SHA-256, tables append-only) ; dépôt FEC persistant par `ObjectStorage` (seule implémentation `S3ObjectStorage`) + SQS + Lambda ; chemin historique `PrivateObjectStore` (mémoire ou Vercel Blob).
- Identité : sessions créées uniquement par le rappel OIDC ; aucune voie locale. `SELF_APPROVAL_FORBIDDEN` par sujet ; « relecture personnelle » absente du code.
- Recettes jetables : 8 `*-durable.integration.test.ts`, base `*_ci` / `*_test` sur la boucle locale, sans migration ni nettoyage.
- Écrans de feuilles : « Mission · recette jetable » et « Mode réel — recette jetable » écrits en dur.

## Cause

Le seul mode durable des chaînes était la recette jetable ; le dépôt FEC durable exigeait S3, SQS et un IdP ; aucune identité locale ni relecture solo n'existait ; aucune sauvegarde ni restauration. Rien ne séparait le choix d'exécution, le type de dossier et le type de relecture.

## Changements

**Profil d'exécution** — `lib/runtime/profile.ts` : `browser_demo` / `disposable_recipe` / `personal_local`, `durableChainEnabled` (profil personnel : drapeau `personal` seulement, refus de `disposable`, de Vercel, d'une base non locale ou `*_ci` / `*_test`), libellés. Les 12 gardes `requireDisposable*` et `configuredProcedures` l'appellent ; comportement de la recette jetable inchangé.

**Identité locale** — `lib/auth/local/` : configuration serveur du profil, code de connexion à usage unique (`probant_local.login_codes`, empreinte seule, 10 min), `GET /api/auth/local` (boucle locale, origine canonique d'après `Host`, marqueur de la base revérifié) qui crée une session ordinaire `auth_sessions` émise par `probant-local:<profil>`. `RequestAuthorizer` n'accepte une session locale que pour le profil courant et en tire rôles, `reviewKind` et nom ; `SessionRecord.issuer` lu depuis `users.external_subject`. `/api/auth/session` expose profil, type de relecture et nom pour une session locale.

**Type de relecture** — `lib/auth/review-kind.ts` (`distinct_identity`, `personal`, `simulated_second_identity`, libellés, `canReviewRun`, `approvalLabel`, `reviewAuthor`). `policy.ts` : l'auto-relecture n'est admise que pour `personal`. `model.ts` : `Approval.kind` / `reviewerName` additifs, validés (auto-relecture ⇔ `personal` nommée). `service.ts` : l'approbation enregistre le type et le nom ; OIDC inchangé (aucun champ ajouté). Les 7 runtimes transmettent le type au principal et l'exposent, avec le profil d'exécution, dans leurs vues ; synthèses de mission, exports (5 paquets), panneaux de clôture et `WorkpaperPanel` nomment le type. Écrans : règle `canReview` alignée sur le serveur dans 11 espaces de feuilles, avis `ReviewKindNotice` avant toute décision, libellés « recette jetable » remplacés par le profil réel.

**Pièces et dépôt FEC sur le PC** — `lib/storage/local-object-storage.ts` : `LocalObjectStorage` (contrat `ObjectStorage`, autorisation scellée et éphémère, écriture unique, notice SHA-256, renvoi identique idempotent) ; `PUT /api/local/objects`. `lib/ingestion/local-runtime.ts` : file en processus et reprise depuis `ingestion_jobs` ; `createPersistentIngestionRuntime` bascule sur ce runtime dans le profil personnel. `provider: "local"` admis par `StoredObjectRef`, `source_documents.storage_provider` et la localisation des synthèses.

**Dossiers locaux** — `GET/POST /api/local/dossiers` (création de la ligne `dossiers` exigée par les clés étrangères, référence dérivée du contenu : un double envoi retrouve le même dossier), `GET /api/local/status`, page `/local` (contexte d'exécution, relecture, base, migrations, dossiers, création, liens vers les 12 feuilles).

**Lanceur Windows** — `scripts/local/probant-local.mjs` + `local-lib.mjs`, scripts `npm run local:init|start|stop|status|login|backup|restore|migrate`. Cluster PostgreSQL 17 dédié (127.0.0.1, SCRAM, sommes de contrôle), rôle applicatif non superutilisateur, marqueur `probant_local.profile`, vérification nom / `data_directory` / marqueur à chaque démarrage, sauvegarde « avant-migration » automatique, build de production seulement si l'application a changé, environnement de Next qui neutralise toute variable distante, sauvegarde cohérente (`pg_export_snapshot` + `pg_dump --snapshot` + manifeste table par table + pièces), restauration vérifiée dans un dossier distinct.

**Migrations** — `scripts/db/migration-utils.mjs` `atomicMigration` : l'inscription au registre est dans la transaction du fichier.

**Défaut antérieur corrigé** — `lib/ingestion/quota.ts` : `release` passait une `Date` brute dans un fragment SQL ; tout rejeu d'une intention d'envoi FEC échouait en 500.

**Garde-fous de test** — `lib/workpapers/__tests__/disposable-database.ts` : les 8 recettes jetables refusent une base qui porte le marqueur personnel.

**Documentation** — [`docs/local/RUNTIME_PERSONNEL.md`](../local/RUNTIME_PERSONNEL.md), [`docs/adr/ADR-012-profil-personnel-local.md`](../adr/ADR-012-profil-personnel-local.md), [`docs/recette/c07/`](../recette/c07/), `.env.example`, `README.md`, `docs/README.md`.

**Revue Codex PR #83 (corrigée)** — dossier de profil créé en `0700` et `secrets.local.json` en `0600` hors Windows (profil initialisé et restauré) ; la sauvegarde refuse une pièce dont les octets ne correspondent plus à l'empreinte enregistrée en base ou dans sa notice ; la restauration confine chaque clé du manifeste (non signé) aux dossiers source et cible avant toute lecture ou copie (`pieceFile`) ; le stockage local complète une pièce écrite sans notice si ce sont les mêmes octets, et la laisse intacte sinon. Vérifié sur le profil de recette : pièce altérée → sauvegarde refusée, original remis → acceptée ; manifeste avec `../../victim` → restauration refusée sans rien écrire. Scan de secrets : les URL PostgreSQL des tests sont assemblées, sans identifiants littéraux. Suite complète avec les recettes PostgreSQL : 1 721 / 1 721.

## Sources

Aucune règle comptable, fiscale ou d'audit nouvelle. Les limites d'ingestion du profil reprennent `docs/ingestion/INGESTION_LIMITS.md` ; les quotas d'envoi locaux (30/min, 500 fichiers et 2 Gio par jour) et la durée des sessions locales (4 h d'inactivité, 24 h au plus) sont des choix internes du profil, non normatifs. La règle de relecture distincte du journal de clôture (NEP 230 §08, Mission 19) n'est pas modifiée.

## Contrôles (local, 2026-10-14, données synthétiques)

| Vérification | Résultat |
|---|---|
| Recette de reprise `scripts/local/recette-c07.ts` (profil neuf : import → gel → exécution → relecture personnelle → verrouillage → export ; double commande ; conflit d'onglets ; FEC local ; arrêt / relance ; sauvegarde ; restauration) | **42 / 42** — [rapport](../recette/c07/REPORT.md) |
| `e2e/c07-profil-local.spec.ts` sur le profil démarré (390 / 1024 / 1440 ; axe ; débordement ; relecture ; deux onglets) | 4 / 4 sur le build final ; captures `docs/probant-lots/c07-captures/` |
| Recettes PostgreSQL jetables sur un cluster 17.11 local (`probant_test`, port 55432) : 8 chaînes + `local-ingestion.integration.test.ts` | 51 / 51 (9 fichiers), deux fois ; une première exécution lancée pendant un `next build` avait eu 1 échec non identifié (journal non conservé), non reproduit depuis — exécutées localement pour la première fois (jusqu'ici CI seulement) |
| Tests unitaires nouveaux : profil, connexion locale, relecture personnelle (chaîne Trésorerie complète en solo, simulation, OIDC inchangé), lanceur, stockage local, migrations atomiques | inclus ci-dessous |
| Suite unitaire complète (`--pool=forks`) | 1 669 réussis, 0 échec (51 recettes durables ignorées faute de variable, jouées à part ci-dessus) ; instabilité : `clients-sales-workspace.test.tsx` « compare le brouillon et le serveur… » a échoué 1 fois sur 3 exécutions complètes (libellé de conflit lu avant mise à jour), 3 / 3 isolé — test antérieur, composant non concerné par ce lot hors la règle `canReview` |
| Typecheck · lint | typecheck OK ; lint 0 erreur, 7 avertissements dans des fichiers non touchés |
| Build de production | OK (`next build` lancé par `local:start` : compilation, lint, types, 180 pages statiques) |
| Suite e2e existante (build de démo) | 199 réussis, 0 échec, 5 ignorés (les 4 tests C07 sans profil démarré, le parcours FEC persistant historique) ; captures des autres lots régénérées puis restaurées |

## Limites et maturité

- **Écran Dépôt** : le dépôt FEC durable n'y est proposé que pour un dossier qui a déjà une synthèse persistante ; un nouveau dossier local reçoit son premier FEC par l'API (`/api/dossiers/<id>/uploads`), comme dans la recette. Raccorder l'écran : lot distinct.
- **Clôture (`cl_*`)** : la relecture personnelle n'y est pas admise (règles NEP 230 §08 du journal inchangées) ; l'habilitation de clôture reste accordée à personne. Avec la simulation ouverte, la seconde identité peut relire, ses décisions portant son identifiant de simulation. Dépend de C14.
- **Paie** en mémoire (C12) ; **Emprunts** sans moteur durable (C13).
- Un seul serveur Next par profil : la reprise FEC est en processus, pas une file partagée.
- Binaires EDB sans signature Authenticode (empreinte du téléchargement HTTPS seulement).
- Ce qui reste **non vérifié** : lecteur d'écran, autres navigateurs, coupure de courant réelle, service Windows PostgreSQL, disque plein.
- Le profil personnel par défaut de l'utilisateur n'a pas été créé (il porte son nom) ; seuls les profils de recette existent dans `%LOCALAPPDATA%\PROBANT\recette-c07\` et peuvent être supprimés.

## Dépendances du lot suivant

- C09, C12, C13, C14 peuvent s'appuyer sur le profil personnel ; C14 doit décider de la relecture personnelle dans le journal de clôture.
- La PR C06 (`claude/c06-fin-plan-amortissement`), fusionnée dans `main` pendant la revue de ce lot (PR #82), touche aussi `fixed-assets/format.ts`, `fixed-asset-mission.ts`, `fixed-asset-runtime.ts` et `service.ts` : lignes distinctes ; la fusion de `main` n'a produit de conflit que dans ce handoff.

---

# Handoff — Mission C06 : fin de plan d’amortissement, base restante et état du plan (2026-10-14)

**Base.** `main` `e9f8b6d` (fusion de la PR #80, Cloisons). Branche `claude/c06-fin-plan-amortissement`, worktree `blissful-nash-5afb47`, checkout propre au départ. Écart avec la base du diagnostic `ab8f991` : C00 à C05 et le lot Cloisons fusionnés depuis ; le moteur Immobilisations (Mission 10, PR #61) n’avait pas changé. Dépendances du prompt : C04 (référentiel daté) et contrat de métriques C03, tous deux dans `main`. Contrat mis à jour : [docs/mission10/CONTRAT.md](../mission10/CONTRAT.md) (§ « C06 »). Aucune fusion, aucun déploiement.

## Cause

`recalculateDepreciation` (`lib/workpapers/fixed-assets.ts`) recevait coût, résiduel, durée et prorata, sans le cumul d’amortissement antérieur ni la fin du plan : la dotation était plafonnée au **montant amortissable total**. Le tableau Amortissements du registre portait pourtant ce cumul (ouverture, ligne sourcée) ; il n’était lu que pour le pont des mouvements. Conséquences, mesurées en exécutant la fonction 1.0.0 de `main` sur les entrées de la recette C06 :

| Actif | Situation | 1.0.0 (exécuté) | 1.1.0 | Effet |
|---|---|---|---|---|
| E-01 | 12 000, 60 mois, cumul d’ouverture 12 000, plan échu le 31/12/2023 ; 2 400 comptabilisés | 2 400 | **0** | l’erreur de dotation était masquée ; désormais écart +2 400 |
| L-02 | dernière annuité, cumul 10 800, prorata 12/12 | 2 400 | **1 200** (plafond) | faux écart −1 200 supprimé |
| I-01 | cumul 13 000 > montant amortissable 12 000 | 2 400 | inconnu, bloqué | incohérence du cumul signalée (excès 1 000) |
| M-01 | segment révisé déclaré au 01/01/2024, base non validée | 3 000 | inconnu, bloqué | segment isolé |
| D-01 | dépréciation 1 000 inscrite | 2 400 | inconnu, bloqué | la base modifiée n’est plus confondue avec brut − résiduel ni avec la VNC |
| N-01, L-01, R-01, B-01/TOITURE | neuf, dernière annuité 6/12, résiduel positif, composant | 1 800 · 1 200 · 2 000 · 3 000 | identiques | — |

## Sources

PCG — règlement ANC n° 2014-03, version consolidée au 1er janvier 2026 (S1 ; `pcg-2026-01-01` du résolveur C04) : copies locales issues de C04 dont les SHA-256 (`55c824b2…`, `b9e7a732…`) sont ceux enregistrés par le résolveur pour les deux URL officielles ANC. Édition du dossier de recette (exercice 2024) : Recueil des normes comptables 2024 (`pcg-2024`, noté « inaccessible » en C04), PDF ANC lu le 14/10/2026, 677 p., SHA-256 `f608f78f…82479303` — mêmes numéros et même texte pour les articles 214-4, 214-8, 214-9, 214-12, 214-13, 214-14, 214-17. Articles appliqués et choix internes : contrat § C06.

## Changements

- **Moteur** (`fixed-assets.ts`) : `recalculateLinearPlan` (trace du plan : début, fin, montant amortissable, cumul d’ouverture, restant, annuité, plafond, position dans le plan, incohérence) ; `recalculateDepreciation` en lit le montant et exige `priorAccumulated` (null = inconnu). `linearPlanEnd` : fin = début + durée − 1 jour.
- **Source** (`fixed-asset-sources.ts`) : colonne facultative « début de segment » des paramètres (plan révisé déclaré), refusée si mal formée, antérieure ou égale à la mise en service, ou postérieure à la clôture (`FA_SEGMENT_START_INVALID`) ; module resté compatible navigateur (aucun import serveur).
- **Revue** (`fixed-asset-review.ts`) : résultat `fixed-assets-result-2` (lit encore `-1`), `recalculation.plan` (état, segment, cumul et sa preuve, restant, annuité, plafond), exception `PLAN_ACCUMULATED_INCONSISTENT`, isolement des plans révisés, dépréciés, à base modifiée ou au cumul absent ; invariant de schéma « dotation = min(annuité, restant), 0 si échu ». Formule et limites réécrites ; comparaison versionnée incluant l’état du plan (sans les identifiants de preuve, propres à chaque exécution).
- **Versions** : règle, gabarit et programme 1.1.0 ; feuille 1.0.0 consultable, marquée périmée, toute commande autre que la révision refusée (`FA_RULE_REPLACED_REVISION_REQUIRED` : ni exécution, ni conclusion, ni soumission, revue ou verrouillage d’un résultat 1.0.0 — revue Codex PR #82) ; contrôles de la synthèse rattachés à la version de règle réellement appliquée ; `WorkpaperService.revise` peut adopter le gabarit courant de la même procédure ; garde de `create` : version de règle = version du gabarit (toutes les autres procédures restent en 1.0.0 / 1.0.0).
- **Écran** (`AssetDetailPanel.tsx`) : bloc « Plan et segment » (état, segment, cumul d’ouverture et sa ligne de registre, montant amortissable, restant, annuité × prorata, plafond, incohérence), « Dotation attendue (recalculée) », avis pour un résultat 1.0.0. Charte et puces existantes réutilisées.
- **Atelier synthétique** (`demo-cycles.ts`) : cumul d’ouverture transmis ; début du plan avancé de deux ans pour rester cohérent avec ses 300,00 de cumul (dotation inchangée : 180,00).

## Tests exécutés (local, 2026-10-14, données synthétiques)

| Vérification | Résultat |
|---|---|
| `lib/workpapers/__tests__/fixed-asset-plan.test.ts` (moteur sur exercice non calendaire, recette `FA_C06_CSV`, refus du début de segment, versions 1.0.0 → 1.1.0 par le runtime) | 15 / 15 |
| Suites Immobilisations, atelier synthétique, revue de cycle, composant | 128 réussis / 128 (9 fichiers) ; 3 ignorés : recette PostgreSQL durable, **non vérifiée** |
| Suite unitaire complète (`--pool=forks`) | 1 651 réussis, 0 échec ; 48 ignorés (8 fichiers de recettes PostgreSQL « durable », sans base locale : **non vérifiés**) |
| Typecheck · lint des fichiers touchés | OK · 0 problème |
| Build de production | OK, 180 pages |
| `e2e/c06-fin-de-plan.spec.ts` (1440, 1024, 390 : plan échu, plafond, cumul invalide, plan révisé, dépréciation ; débordements, axe, puce non rognée) + `e2e/fixed-assets.spec.ts` | 6 / 6 et 5 / 5 ; avec `demo-journey` et `accessibility` : 23 / 23 |
| Exécution de la fonction 1.0.0 de `main` sur les entrées de la recette (tableau ci-dessus) | 9 cas relevés, fichiers temporaires supprimés |

Captures : `docs/probant-lots/c06-captures/` (plan échu, plafond, cumul invalide, dépréciation × 3 largeurs).

## Limites et maturité

- Segments révisés (changement de durée, de résiduel, de méthode) et actifs dépréciés : isolés et bloqués ; leur recalcul exige une base de segment validée et le cumul depuis le début du segment, absents du contrat actuel.
- La cohérence du cumul est contrôlée aux bornes (supérieur au montant amortissable, non nul avant le début, plan échu non soldé, soldé avant terme) ; un cumul en avance ou en retard sur le calendrier théorique d’un plan en cours n’est pas mesuré, faute de convention de prorata temporis sourcée.
- Le prorata de l’exercice reste une donnée sourcée ; la fin du plan n’est utilisée que pour situer le segment.
- Sortie, sortie partielle, entrée sur actif inscrit, méthodes non linéaires, dérogatoire : hors recalcul avec motif (inchangé ou explicité).
- Recettes PostgreSQL durables (`fixed-asset-durable.integration.test.ts`) : non exécutées sans base locale — **non vérifiées**.
- Lecteur d’écran : non vérifié.

## Dépendances du lot suivant

- Segments révisés : ajouter au contrat la base validée et le cumul au début du segment, puis lever le blocage.
- C07 (runtime local persistant) : rejouer la recette 1.0.0 → 1.1.0 sur PostgreSQL.

---

# Handoff — Revue par cloison : liste des silos lisible à 390, 1024 et 1440 px (2026-10-14)

**Base.** Défaut relevé sur `main` `663ceb1` et dans les captures du lot bordures (`bordures-captures/apres/cloisons-390-long.jpg`, `cloisons-1024.jpg`). L'affichage C05 à préserver (`data-effects-summary`, « Résultat − 145 000 € », `cloisons-effects.test.tsx`, `e2e/c05-effets-partages.spec.ts`) n'existait au départ que sur la PR #79, alors ouverte : branche `claude/cloisons-silos-lisibles` **empilée** sur `origin/claude/risk-incidence-deduplication-2a5d3f` (départ `a392393`, rebasée sur `38a698d` — correctif de schéma de la revue Codex — en cours de lot, sans conflit). Worktree `blissful-nash-5afb47`, checkout propre au départ. Un seul fichier applicatif modifié : `components/probant/CloisonsWorkspace.tsx`. La PR #79 a depuis été fusionnée (`main` `df94c1f`, arbre identique à `38a698d`) : la PR de ce lot cible `main`. Aucune fusion, aucun déploiement manuel.

## Cause

| Défaut | Où | Effet mesuré (build de production, dossier démo) |
|---|---|---|
| Panneau de revue `width: 406; flexShrink: 0` dans un corps `display: flex` | corps de `CloisonsWorkspace` | zone utile 338 px à 390, 732 px à 1024 ; il restait 32 px et 306 px à la liste ; à 390 le panneau débordait : `<main>` défilait 450 / 390 (le document restait à 390 car `<main>` défile dans son cadre) |
| Ligne de silo entièrement insécable (libellé en ellipse, puce de gravité, effet `minWidth: 94`, tous `nowrap`) | bouton de ligne | ≈ 453 px incompressibles rognés par le cadre `overflow: hidden` : 28 lignes sur 28 à 390 et 1024 (« Immobilisat… », « 1 co… ») |
| Silo ouvert en deux colonnes quelle que soit la largeur | `SiloBody` | cartes de constat de 110 px (1024) et 28 px (390), titre passé sous « Analyser » (6 / 6) ; montants coupés sur trois lignes (« 40 / 000 / € », `formatEur` produit des espaces sécables) |
| Menu de filtre ancré à gauche | `FilterDropdown` | sonde à 1024 sur le build intermédiaire : menu « Nature » ouvert → `<main>` 837 / 784 ; la barre d'outils n'ayant pas changé, défaut antérieur par déduction (non mesuré sur la base) |

## Changements (`components/probant/CloisonsWorkspace.tsx`)

- **Corps** : liste pleine largeur, panneau de revue rangé à droite seulement à partir de 1400 px de fenêtre (`RAIL_DOCK_QUERY`, classes `min-[1400px]:`) ; la liste garde alors ≥ 684 px, donc un silo ouvert ≥ 620 px et ses connecteurs. En dessous, l'invite « Aucun constat sélectionné » disparaît et « Analyser » ouvre le **tiroir** `ReviewDrawer` (même patron que `FindingDrawer` : voile, `role="dialog"`, `aria-modal`, `pb-drawer-in`, rendu dans `document.body`) : focus sur « Fermer le panneau de revue », Tab / Maj+Tab restent dans le tiroir, Échap, voile ou Fermer referment et rendent le focus au bouton « Analyser » du constat (`data-finding-trigger`), y compris quand le tiroir a été ouvert depuis la ligne signalée de la reconstruction (non focalisable) ou après un redimensionnement depuis le rail ancré (revue Codex PR #80). Le contenu reste le `RailPanel` existant (mêmes décisions locales, aucun calcul ajouté). Marges latérales 16 px sous 640 px.
- **Ligne de silo** : libellé et comptes passent à la ligne (`overflowWrap: anywhere`) ; puce de gravité et effet forment un groupe qui suit le libellé quand la place le permet et passe dessous sinon ; chaque poste d'effet C05 (« Résultat − 145 000 € ») reste insécable, la liste des postes passe à la ligne entre deux postes ; « montant indéterminé » et « effet non chiffré » inchangés. `aria-expanded`, `type="button"`, `data-silo-row`.
- **Silo ouvert** : deux colonnes seulement quand le silo mesure ≥ 620 px (même mesure et même seuil que les connecteurs), sinon la reconstruction puis les constats ; une colonne tant que la largeur n'est pas mesurée. Un point de rupture `sm:` (640 px de fenêtre) laissait ≈ 200 px par colonne à 768 px, navigation visible (revue Codex PR #80). Montants de la reconstruction insécables.
- **Filtres** : le menu s'ouvre vers la gauche s'il dépasserait le bord droit de la fenêtre (et tient à gauche).
- Charte graphite/indigo et palette du composant conservées ; animations existantes inchangées, celle du tiroir neutralisée par la règle globale `prefers-reduced-motion`.

## Mesures avant / après (Chromium, build de production, dossier démo)

« Avant » : build de `a392393` (identique à la base de départ) ; « après » : build de la branche. Relevés JSON et captures dans `docs/probant-lots/cloisons-captures/{avant,apres}/`.

| Largeur | Phase | `<main>` scroll / client | Largeur des 28 lignes | Lignes rognées | Cartes sous « Analyser » | Largeur d'une carte | axe serious |
|---|---|---|---|---|---|---|---|
| 1440 | avant | 1200 / 1200 | 722 px | 0 | 0 / 6 | 314 px | 0 |
| 1440 | après | 1200 / 1200 | 722 px | 0 | 0 / 6 | 314 px | 0 |
| 1024 | avant | 784 / 784 | 306 px (contenu 453) | 28 | 6 / 6 | 110 px | 0 |
| 1024 | après | 784 / 784 | 730 px | 0 | 0 / 6 | 318 px | 0 |
| 390 | avant | **450 / 390** | **32 px** (contenu 453) | 28 | 6 / 6 | 28 px | 0 |
| 390 | après | 390 / 390 | 356 px | 0 | 0 / 6 | 328 px | 0 |

Document : aucun débordement global avant comme après (`<main>` absorbait le débordement). Filtres ouverts (sonde puis spec) : aucun débordement à 390, 1024, 1440 après le lot.

## Tests exécutés (local, 2026-10-14, données synthétiques)

| Vérification | Résultat |
|---|---|
| `e2e/cloisons-mise-en-page.spec.ts` phase « avant » (build de la base) | relevés et captures enregistrés, assertions non jouées par construction |
| `e2e/cloisons-mise-en-page.spec.ts` phase « après » à 1440, 1024, 768 et 390 : liste lisible (débordements, lignes rognées, cartes, texte des silos ouverts dans leur cadre, largeur, axe non aggravé, ancre de la visite et connecteur à 1024 / 1440, effets C05 sur les lignes), filtres ouverts, panneau ancré (1440, puis passage au tiroir par redimensionnement) ou tiroir au clavier (1024, 768, 390, ouverture par « Analyser » et par la ligne signalée), mouvement réduit | 13 réussis / 13 |
| `e2e/c05-effets-partages.spec.ts` (Synthèse, Cloisons, Risques × 390 / 1024 / 1440) | 9 / 9 (captures redirigées hors du dépôt) |
| `demo-journey`, `accessibility` (8 pages, dont cloisons), `partial-coverage` | tout vert sauf « la couverture partielle est affichée telle quelle », qui lit `/dashboard/synthese` avant chargement : échecs intermittents (12 / 12 puis 11 / 12 en relances × 3) — défaut de délai du spec, antérieur, hors `/dashboard/cloisons` |
| `components/probant/__tests__/cloisons-effects.test.tsx` (C05) | 1 / 1 |
| `components/probant/__tests__/cloisons-review-drawer.test.tsx` (tiroir, piège de focus, retour du focus y compris depuis la ligne signalée, voile, `aria-expanded`) | 4 / 4 |
| Suite unitaire complète (`--pool=forks`) | 1 635 réussis, 0 échec ; 48 ignorés (8 fichiers de recettes PostgreSQL « durable », sans base locale : **non vérifiés** ici) |
| Typecheck | OK |
| Lint des fichiers touchés | 0 erreur ; 1 avertissement antérieur (`ChevronDown` inutilisé) |
| Build de production (`next build`) | OK, 180 pages générées |
| Sonde ponctuelle (non versionnée, build intermédiaire avec la nouvelle mise en page, avant le correctif des menus) : menus de filtre et vue « Document annoté » | « Nature » ouvert à 1024 → `<main>` 837 / 784 (d'où le correctif, ensuite couvert par le spec) ; « Document annoté » : aucun débordement à 390, 1024, 1440 |

## Limites et maturité

- Le point d'ancrage (1400 px) est une requête sur la **fenêtre**, calée sur la navigation latérale de 240 px (`md` et plus) ; une requête de conteneur aurait suivi la largeur réelle, mais `container-type` impose une containment dont l'effet sur l'empilement des menus et du spotlight de la visite guidée n'a pas été évalué : écartée, la page n'utilisant que des points de rupture de fenêtre. Si la navigation change de largeur, revoir la constante.
- En mode tiroir, le voile masque la liste : la ligne signalée et son connecteur ne sont pas visibles en même temps que le panneau (compromis d'un tiroir modal). Pas de geste de balayage pour fermer.
- Lecteur d'écran : rôles et noms posés (`dialog`, `aria-modal`, `aria-label`, `aria-expanded`) ; **non vérifié** avec NVDA / VoiceOver.
- Captures C05 (`docs/probant-lots/c05-captures/cloisons-entete-390.jpg`) non régénérées : elles montrent l'ancienne marge de 26 px à 390 ; le spec C05 passe et ses captures ont été redirigées hors du dépôt pour ne pas modifier les preuves de la PR #79.
- Hors périmètre, inchangés : bloc « DEMO SA / SIREN » de l'en-tête aligné à droite sous le titre à 390 et 1024 ; champ de recherche sans anneau de focus (`outline: none`, antérieur) ; import `ChevronDown` inutilisé (avertissement lint antérieur) ; vue « Document annoté » (`FinancialDocumentViewer`) non retravaillée (sonde : aucun débordement aux trois largeurs).
- `e2e/partial-coverage.spec.ts` « la couverture partielle est affichée telle quelle » lit le texte de `/dashboard/synthese` sans attendre le chargement : un échec isolé observé (« Lecture du dossier sélectionné… »), 12 / 12 en relance ; défaut du spec, antérieur et hors lot.

## Dépendances du lot suivant

- Aucune : la PR #79 est fusionnée dans `main` (`df94c1f`).

---

# Handoff — Mission C05, second passage : projection des effets partagée (2026-10-14)

**Base.** `main` `663ceb1` (fusion de la PR #78 : C05 premier passage). Branche locale `claude/risk-incidence-deduplication-2a5d3f`, worktree `quizzical-boyd-13e46a`, checkout propre au départ. Écart avec la base du diagnostic `ab8f991` : C00 à C05 fusionnés depuis. Contrat mis à jour : [docs/mission-c05/CONTRAT_EFFETS.md](../mission-c05/CONTRAT_EFFETS.md) (§0 « Une seule projection »). Aucun push, aucun déploiement.

## Écarts constatés sur la base actuelle (C05 déjà fusionné)

| Écart | Où | Effet |
|---|---|---|
| Incidence inférée `Σ |constaté − seuil|` encore affichée, calculée dans React | `CloisonsWorkspace.tsx` (`computeExpo`) : « Exposition cumulée 2,29 M€ » et un montant par silo | l'écran de revue racontait une autre histoire financière que la Synthèse |
| Incidence inférée encore exportable | `DossierCounts.incidenceParCloison` (`computeCounts`, paquet de revue) ; `findingFinancialIncidence` (code mort) | idem, dans un type public |
| Projection non partagée | `lib/risk-mapping/scoring.ts`, `aggregate.ts` : somme des `financialEffect` par constat | répétitions exactes et versions remplacées comptées deux fois, conflits et chevauchements additionnés, constats écartés inclus, postes et sens additionnés ; le driver affichait pourtant « Même projection d'effets que la Synthèse » |
| Chiffre unique tous postes | waterfall (« Exposition brute / déterminée »), concentration (`byCloison`), note §5 | actif, passif et résultat, augmentations et diminutions dans un même montant |
| Pont non réconcilié | waterfall : conflit 100 / 120 → 220 − 120 = 100 ≠ déterminé 0 ; correction partielle → proposé 0, impôt −100, net 300 | la lecture en cascade ne tombait pas juste |
| Affichage | « − Constats écartés en revue  -0,00 € » (zéro négatif), double signe sur les déductions, note fiscale « taux explicite… » sans ajustement, rapport au seuil affiché plafonné (« 300 % du seuil (plafonné à 300 %) » pour 457 %) | lisibilité |

## Changements

**Projection unique** — `lib/synthesis/exposure.ts` : `projectExposure` (déplacement sans changement de règles de la section 4 du moteur : collecte, déduplication, étapes, fiscalité, net), `projectSnapshotExposure`, `reviewStatusMap`, `restrictExposure` (périmètre = groupes touchés, aucun recalcul), `summarizeStages` (pont par poste et sens lu membre par membre), `isEurSignalWithoutEffect`, ensembles de statuts (`CLOSED_REVIEW` y vit, le moteur le réexporte). Membres porteurs du poste et de la cloison ; groupes déterminés porteurs de `reviewStage` et `correctedCents`. `EffectStage` complété (détecté, répétitions, versions, hors agrégat, déterminé, écarté) ; invariants au centime documentés et testés. `byCloison` supprimé. Politique d'agrégation 2.1.0 (une répétition exacte aux décisions divergentes garde son rôle `exact_repeat`), moteur 1.2.0, schéma du snapshot 2.0.0 (structure d'`exposure` incompatible avec 1.0.0 ; revue Codex PR #79). `lib/synthesis/effect-labels.ts` : libellés partagés des postes et sens.

**Risques** — `scoring.ts` : gravité sur l'exposition initiale du **poste et sens le plus exposé** de la projection partagée (rapport exact au seuil affiché, contribution plafonnée à 300 %), autres postes listés non additionnés ; groupes indéterminés en driver « Effets à montant indéterminé » (bornes, aucun montant) et dans la composante qualitative ; `explicitEffectEur` supprimé ; driver de détectabilité reformulé (« écart mesuré… signal de détection, pas une anomalie chiffrée »). `aggregate.ts` : une projection pour tous les cycles, agrégat de page `effects` (projection du dossier entier) au lieu de `totalIncidenceEur`. `RiskMappingView.tsx` : transmet `projectSnapshotExposure(snapshot)`.

**Vues et exports** — `build-datasets.ts` : waterfall en ponts par poste et sens + « Effet sur le résultat » (anomalies non corrigées signées → impôt → net), réconciliés ; concentration « Exposition initiale (poste, sens) » ; aucun zéro négatif. `ExposureWaterfall.tsx` : intertitre par pont, lignes continues, déductions en valeur absolue (signe dans le libellé). `note.ts` §5 : pont par poste et sens en 12 colonnes, plus d'agrégat tous postes. `CloisonsWorkspace.tsx` / `ActiveCloisons.tsx` : en-tête « Exposition initiale par poste et sens » (+ groupes indéterminés, + signaux EUR sans effet chiffré), lignes de silo « Résultat − 145 000 € », « montant indéterminé » ou « effet non chiffré ». `dossier.ts`, `legacy-exposure-policy.ts` : incidence inférée supprimée.

## Routes et interactions visibles

- `/dashboard/synthese` : waterfall « De l'exposition détectée à l'effet net » (Résultat · diminution 457 000 €, Résultat · augmentation 18 000 €, effet sur le résultat 0 € tant que rien n'est arbitré), concentration par poste et sens, note §5.
- `/dashboard/cloisons` : en-tête et lignes de silo (plus d'« Exposition cumulée »).
- `/dashboard/risques` : panneau d'un cycle, axe Gravité (ex. Provisions : « Poste et sens le plus exposé : Résultat · diminution, exposition initiale 145 000 € contre seuil 31 700 € (ISA 320) — 457 % du seuil (contribution à l'indice plafonnée à 300 %) »).

## Tests exécutés (local, 2026-10-14, données synthétiques)

| Vérification | Résultat |
|---|---|
| `lib/synthesis/__tests__/effects-c05-shared.test.ts` (recette indépendante, projection partagée) | 15 réussis / 15 |
| `components/probant/__tests__/cloisons-effects.test.tsx` | 1 / 1 |
| Suites synthèse, visualisation, risques, composants de Synthèse, dossier | 204 réussis / 204 (19 fichiers) |
| Suite unitaire complète (`--pool=forks`) | 1 632 réussis, 0 échec ; 48 ignorés (8 fichiers de recettes PostgreSQL « durable », sans base locale : **non vérifiés** ici, la CI fait foi) |
| Typecheck | OK |
| Lint | 0 erreur, 7 avertissements préexistants hors lot |
| `e2e/c05-effets-partages.spec.ts` (Synthèse, Cloisons, Risques × 390 / 1024 / 1440) sur `next dev` | 9 / 9 serveur chaud ; premier passage à froid : 4 échecs de délai (« Lecture du dossier sélectionné… »), pas d'assertion fausse |
| Build de production (`next build`) | OK, 180 pages générées |
| Sur le build de production : `c05-effets-partages` (× 3 largeurs), `demo-journey`, `accessibility`, `c00-layout`, `c02-finition`, `c03-assertions` | 47 réussis / 47 (captures C02/C03 redirigées hors du dépôt, captures C05 régénérées) |


## Limites et maturité

- Un groupe commun à deux périmètres (cycles, silos, cloisons) figure dans chacun : les sous-totaux de périmètres ne s'additionnent pas ; seul le dossier entier est dédupliqué globalement (dit dans les résumés des vues).
- La gravité retient l'exposition initiale, corrections comprises (l'erreur a existé) ; ce n'est pas une vue d'anomalies non corrigées. Choix interne, non normatif.
- Le poste et sens le plus exposé comme objet de la gravité est un choix d'indice interne (heuristique, jamais une probabilité calibrée), qui évite d'additionner les deux jambes d'une même écriture.
- L'allocation par ligne d'écriture n'est toujours pas modélisée (chevauchements indéterminés) ; la différence temporaire attend C10 (`taxIncidence`).
- Le journal de clôture (Mission 19, `closing-evaluate.ts`) totalise des anomalies sans poste ni sens : modèle distinct, non touché.
- Défaut de mise en page antérieur, non corrigé ici : à 390 et 1024 px, la colonne des silos de la revue par cloison est écrasée par le panneau de détail (déjà visible dans les captures du 13/10) ; tâche distincte proposée.

## Dépendances du lot suivant

- C10 : brancher `taxIncidence` et, le cas échéant, l'impôt des postes de bilan.
- Producteurs d'effets : `economicIdentity`, `evaluationVersion` / `supersedesFindingId`, `correction`, `taxQualification`.

---

# Handoff — Mission C05 : incidence du risque, effets et doublons (2026-10-14)

**Base.** `main` `3b02468`. Branche locale `claude/c05-effets-doublons`, worktree `cockpit-fiscalite-dashboard-1c1ba9`. Contrat : [docs/mission-c05/CONTRAT_EFFETS.md](../mission-c05/CONTRAT_EFFETS.md). Aucun déploiement.

## Problème utilisateur, vue choisie, données, interactions

- **Problème.** `lib/risk-mapping/scoring.ts` et `aggregate.ts` inféraient une incidence `abs(constaté − seuil)` en EUR ; `lib/synthesis/exposure.ts` dédupliquait sur une clé sans montant (premier représentant conservé), agrégeait les chevauchements par un maximum, et `engine.ts` calculait un net en soustrayant un impôt partiel d'un ajustement complet, même sans taux.
- **Vue.** Une projection commune des effets explicites, lue par la Synthèse, la cartographie des risques, les vues et les exports : identité économique, version d'évaluation, empreinte de contenu ; groupes déterminés / en conflit / indéterminés avec bornes ; étapes par poste et par sens (initial, en attente, proposé, corrigé, résiduel) ; impôt et net connus, partiels ou inconnus.
- **Données.** `financialEffect` enrichi de champs optionnels (`economicIdentity`, `evaluationVersion`, `supersedesFindingId`, `taxQualification`, `correction`) ; statuts de revue bruts (`corrected` distinct de `confirmed`).
- **Interactions.** Aucune nouvelle interaction : l'élément de décision, le waterfall et la note changent de contenu ; une étape inconnue s'affiche « inconnu » sans barre.

## Changements

**Risques** — `scoring.ts` : `explicitEffectEur` et `isEurSignalWithoutEffect` remplacent `findingInc` ; gravité = 0,55·masse + 0,35·effets explicites / seuil + 0,10·signaux EUR (qualitatif, aucun montant) ; drivers renommés. `aggregate.ts` : total page = effets explicites dédupliqués par constat ; `eurSignalsWithoutEffect` listés. Indices internes, jamais des probabilités calibrées.

**Exposition** — `lib/synthesis/exposure.ts` (politique v2.0.0, `SYNTHESIS_POLICY_VERSION` aligné) : répétitions exactes comptées une fois si leurs décisions de revue concordent, sinon conflit explicite ; même identité à contenus distincts → dernière version démontrée (prédécesseur direct exigé, montants remplacés tracés dans `supersededVersionsCents`) ou conflit ; chevauchement partiel sans allocation → indéterminé avec bornes `[plus grand membre, somme]` ; sens opposés → aucune compensation. `engine.ts` : `stages[]` par poste × sens, `tax` (connu / partiel / inconnu), `netByTarget` (net `null` sans taux ET qualification, sous-total partiel nommé), `taxIncidence` (interface C10), limitations `exposure_indeterminate` et `tax_incidence_unknown`. `types.ts` : `ExposureDimension`, `ExposureClusterView` (statut, bornes, membres et rôles), `AggregationPolicy` refondus. `lib/canonical-model/finding.ts` : `TaxQualification`, `EffectCorrection`, champs C05.

**Vues et exports** — `build-datasets.ts` : « Ajustement proposé (résultat) » (net ou inconnu, autres postes non additionnés) ; waterfall avec répétitions exactes, versions remplacées, groupes indéterminés hors agrégat, impôt du poste résultat connu / partiel / inconnu, net sur le résultat après impôt (étape `null` = inconnu). `lib/visualization/types.ts` : `WaterfallStep.amountCents: number | null`. `ExposureWaterfall.tsx` : « inconnu » sans barre. `note.ts` : §5 par poste et sens, nets par poste, groupes non déterminés ; libellés des deux nouvelles limitations.

## Routes et interactions visibles

- `/dashboard/synthese` : élément « Ajustement proposé (résultat) », waterfall « De l'exposition brute à l'effet net », limites « Exposition indéterminée » / « Incidence fiscale inconnue », note de synthèse §5.
- `/dashboard/risques` : drivers de gravité « Effets financiers explicites vs seuil » et « Signaux EUR sans effet explicite ».

## Tests exécutés (local, 2026-10-14, données synthétiques)

| Vérification | Résultat |
|---|---|
| `lib/synthesis/__tests__/effects-c05.test.ts` (recette indépendante) | 23 (dont 4 issus de la revue Codex : branches de versions, chaîne à trois, décisions de revue divergentes, impôt limité au résultat) : signal 100 000 / 50 000 sans effet ; doublon exact ; 100 / 120 avec et sans succession ; L1/L2 + L2/L3 et chaîne à trois ; sens opposés ; postes et sens séparés ; +1 000 fiscalité inconnue ; taux sans qualification ; impôt partiel ; non déductible ; correction totale, partielle, sans détail ; invariance à l'ordre ; double comptage ; vues et export |
| Suites synthèse, visualisation, risques, composants | 148 réussis / 148 (9 fichiers) |
| Suite unitaire complète | 1 607 réussis / 1 612, 149 fichiers ; les 5 échecs sont des délais de 5 s dépassés hors lot (PV Capitaux propres, clavier Trésorerie, HTTP démo, estimation Provisions) ; 29 / 30 rejoués seuls, le dernier (Provisions, 9 s) ne tient le délai que seul dans son fichier ; la CI fait foi |
| Typecheck, lint | OK (7 avertissements préexistants hors lot) |
| Parcours Playwright sur le build de production | non rejoués localement : le contrôle « E2E Playwright · axe » de la CI fait foi |

**Non exécuté localement** : recettes PostgreSQL (CI).

## Limites et maturité

- L'allocation d'un montant par ligne d'écriture n'est pas modélisée : les chevauchements partiels restent indéterminés tant qu'elle manque ; les bornes et le détail sont conservés pour l'arbitrage.
- Différence temporaire et incidence fiscale incrémentale avant/après relèvent du moteur fiscal (C10) : `taxIncidence.pendingFindingIds` les expose, `provider: "none"` tant qu'il n'existe pas.
- Les poids de gravité (0,55 / 0,35 / 0,10) et les constantes de saturation restent des heuristiques internes documentées, non opposables.
- Les effets de démonstration (`lib/demo/dataset.ts`) portent un taux mais pas de qualification fiscale : leur net reste inconnu tant qu'une qualification n'est pas saisie (comportement voulu, aucun taux de démonstration promu en règle).

## Dépendances du lot suivant

- C10 : brancher `taxIncidence` sur le scénario d'IS avant/après et qualifier les effets.
- Producteurs d'effets (rapprochement, feuilles de cycle) : renseigner `economicIdentity`, `evaluationVersion` / `supersedesFindingId` et `correction` pour bénéficier des versions et des corrections partielles.

---

# Handoff — Lot transversal « bordures » : stratification de la règle `* { border-color }` (2026-10-13)

**Base.** `main` `f846424` (fusion de la PR #75, Mission C03). Branche `claude/quizzical-boyd-13e46a`, worktree `quizzical-boyd-13e46a`. Correction globale différée par C02 (voir plus bas « Défaut global constaté, non corrigé ici »). Aucun push, aucun déploiement.

## Cause

`app/globals.css` posait `* { border-color: var(--pb-border) }` hors de toute `@layer` (présent depuis le MVP, `644e92f`). Avec Tailwind v4 (`@import "tailwindcss"`, 4.3.3), les utilitaires vivent dans `@layer utilities` ; en cascade CSS, toute déclaration non stratifiée l'emporte sur une déclaration stratifiée quelle que soit la spécificité. Toute classe `border-<couleur>` de l'application (`border-amber-500/40`, `border-[#eab308]/40`, `border-[var(--pb-accent)]`, `border-l-[color:var(--pb-accent)]`, …) était donc compilée puis silencieusement neutralisée ; seul un style inline fonctionnait, ce que C02 avait fait pour l'action prioritaire et la feuille bloquée.

**Reproduction sur le build de production** (`next build` puis `next start`, Chromium Playwright, `getComputedStyle`) : CSS compilé de `main` → `*{border-color:var(--pb-border)}` après `:root`, hors `@layer`, utilitaires dans `@layer utilities` ; relevé « avant » ([bordures-captures/avant](bordures-captures/)) : sur 11 vues × 3 largeurs, **chaque** élément visible portant une classe de bordure colorée restait à `rgb(36, 48, 68)` (`--pb-border`) sur toutes ses faces (ex. Dossier & preuve : 87/87 à chaque largeur ; Cartographie des risques : 155/155 ; Synthèse : 28/28 ; Tests : 41/41). Les deux sondes C02 ne portaient leur couleur que par l'attribut `style` (`border-left-color: var(--pb-accent)` ; `border-left-color: var(--pb-warn)`).

## Changements

- `app/globals.css` : la règle est déplacée dans `@layer base { * { border-color: var(--pb-border); } }`, avec un commentaire expliquant pourquoi. Elle reste la valeur par défaut (elle suit le preflight Tailwind dans la même couche, donc l'emporte sur son `border: 0 solid`) et passe sous les utilitaires. CSS compilé vérifié : `…*{border-color:var(--pb-border)}}@layer components;@layer utilities{…`.
- `components/probant/DossierContextBar.tsx` : « Action prioritaire » — `style={{ borderLeftColor }}` retiré, classe `border-l-[color:var(--pb-accent)]`.
- `components/probant/CycleDemonstration.tsx` : feuille bloquée — `style={{ borderColor: color-mix(…), borderLeftColor }}` retiré, classes `border-[var(--pb-warn)]/50 border-l-[color:var(--pb-warn)]` (Tailwind compile l'opacité en `color-mix(in oklab, …)` ; l'ordre `border-color` puis `border-left-color` est vérifié dans le CSS compilé) ; message d'erreur — `style` retiré, classe `border-l-[color:var(--pb-warn)]` dans la branche `error`.
- `e2e/bordures-stratifiees.spec.ts` (nouveau) : inventaire des bordures colorées par vue et largeur (couleurs calculées, dette axe serious/critical, largeur de défilement, captures courtes et longues), sondes C02 sans style inline, et garde-fou « aucune classe de bordure colorée encore ignorée » ; `BORDURES_PHASE=avant` rejoue le relevé sans assertion de preuve.

Aucun autre composant modifié : les classes existantes se réactivent telles que leurs auteurs les ont écrites.

## Recensement des bordures qui se réactivent

Occurrences dans `app/` et `components/` (hors `border-[var(--pb-border)]`, 176 occurrences, visuellement sans effet), relevées par grep sur les jetons `border-[…]`, `border-amber`, `border-red`, `border-sky`, `border-current` et leurs variantes de face.

| Jeton | Occ. | Où (principaux) | Effet visible après |
|---|---|---|---|
| `border-[var(--pb-border-strong)]` | 28 | boutons secondaires, champs, `FindingDrawer`, `RecentDossiers` | contour un ton plus clair (#324563) |
| `border-[var(--pb-accent)]` et `/30 /40 /50 /60` | 36 | onglets actifs, étapes courantes, pastilles et boutons d'action (`CycleRegistryList`, `SimulationPanel`, `DocumentToolbar`, `RiskMappingView`, `normatif/*`) | accent indigo franc ou tamisé |
| `border-[var(--pb-border-soft)]` | 14 | `CycleRiskPanel`, `RiskMatrixHeatmap`, lignes de `CycleRegistryList` | contour plus discret (#1c2635) |
| `border-[#eab308]` et `/30 /40` | 9 | bandeaux d'avertissement normatif (`normatif/*`, `MaterialityPanel`, `DepotView`, `FindingDrawer`), gravité mineure | ambre tamisé sur fond `#292207` |
| `border-amber-500/40 /50`, `border-amber-600` | 6 | `CycleRiskPanel` (« Fichier manquant »), `RiskMappingView`, conflit `ClientFramingWorkspace` | ambre tamisé |
| `border-[#ef4444]` et `/30 /50`, `border-red-500(/60)` | 10 | gravité bloquante, erreurs de dépôt, validation des seuils (`CycleRiskPanel`), boutons de rejet | rouge sémantique |
| `border-[#22c55e]` et `/30 /40` | 6 | « Sourcé », succès de dépôt, boutons d'acceptation | vert sémantique |
| `border-[#3b82f6]` et `/30 /50` | 4 | pastille source du bandeau (`dashboard/layout`), gravité informative, bandeau `CloisonsViewLive` | bleu tamisé |
| `border-[#7f1d1d]`, `border-[#4c1d95]`, `border-[#075985]` | 3 | `FamilyBadge` (Obligatoire / Présomption d'audit / Paramètre interne), rendu sur Dossier & preuve, Tests, Cloisons | contour sombre de la famille |
| `border-sky-500/40`, `border-[#f97316]`, `border-[var(--pb-majeur)]/50`, `border-[var(--pb-ok)]/40`, `border-current`, `color-mix(…accent…)` | 6 | `CycleRiskPanel`, gravité majeure, `CycleRegistryList`, `ModeTabs`, `DepotView` | couleur du jeton |

Les variantes `hover:`/`focus:` (`hover:border-[var(--pb-border-strong)]`, `focus:border-[var(--pb-accent)]`, `hover:border-[#22c55e]`, …) deviennent aussi effectives : survol et focus des champs et boutons changent désormais de contour.

## Vérification aux largeurs 390 / 1024 / 1440 (build de production)

Vues relevées : Synthèse, Tests, Cartographie des risques, Revue par cloison, Dépôt, Dossier & preuve, Fiscalité, Normatif (accueil, cycle achats-charges-externes, sources), Onboarding.

| Contrôle | Résultat |
|---|---|
| Classe de bordure colorée encore ignorée (`stillDefault`) | 0 sur les 33 relevés (avant : 100 % des éléments relevés) |
| Sonde « Action prioritaire » | `borderLeftColor` `rgb(91, 157, 255)` aux trois largeurs, attribut `style` absent (avant : même couleur, par style inline) |
| Sonde « feuille bloquée » | `borderLeftColor` `rgb(245, 158, 11)`, faces latérales ambre à 50 % (`oklab(… / 0.5)`), `style` absent |
| Pastille source du bandeau (`border-[#3b82f6]/50`) | bleu à 50 % (avant : `--pb-border`) |
| Dette axe serious/critical (document entier) | identique avant / après sur chaque vue et largeur : 0 partout sauf `link-name` ×5 sur la page cycle normatif (préexistant, liens sans nom accessible, hors lot) ; aucune violation `color-contrast` ajoutée — les bordures ne portent pas de texte |
| `e2e/accessibility.spec.ts` (dette serious gelée) | 8/8 |
| `e2e/c02-finition.spec.ts` (dont `borderLeftColor` de la feuille bloquée) | 14/14 |
| `e2e/c03-assertions.spec.ts`, `e2e/demo-journey.spec.ts` | 6/6, 4/4 |
| `e2e/bordures-stratifiees.spec.ts` | 39/39 |
| Débordement horizontal | nul partout sauf Onboarding à 390 px : 448 px avant comme après sous Windows, 454 px sous Linux CI (préexistant, hors lot, gelé dans le spec via `KNOWN_OVERFLOW`) |
| Lint, typecheck, `next build` | OK |

Lecture visuelle des captures longues (après, et « avant simulé » au même cadrage) : les couleurs réactivées sont toutes des jetons de la charte ou des couleurs sémantiques déjà portées par le texte ou le fond de l'élément (pastille « Fichier manquant » ambre sur ambre, « Obligatoire » rouge sombre sous texte rouge, « Sourcé » vert, boutons d'action de la Synthèse en accent indigo tamisé, zone de dépôt et étape courante de l'Onboarding en accent, encart « analysé dans PROBANT » du normatif en accent à 30 %). Aucune bordure ne vient d'une palette étrangère au graphite/indigo et aux accents sémantiques ; les contours `--pb-border-soft` de la matrice des risques deviennent légèrement plus discrets que `--pb-border`, ce qui est leur intention.

**Non exécuté** : suite unitaire Vitest (aucun module TS/logique touché), recettes PostgreSQL, lecteur d'écran réel.

## Captures

[bordures-captures](bordures-captures/) : `avant/` (build de `main`, 900 px de haut), `apres/` (ce lot, courtes et longues), `avant-simule/` (règle réinjectée hors couche sur le build corrigé, captures longues), relevés JSON par vue et largeur, sondes C02. Lecture guidée dans son `README.md`. Poids : ≈ 20 Mo (66 captures longues pleine page) ; à élaguer si la revue le juge excessif.

## Limites et points de vigilance

- Les variantes `hover:`/`focus:` réactivées n'ont pas été capturées une à une ; elles n'introduisent que des jetons de la charte.
- `ClientFramingWorkspace` (`border-amber-600`, état de conflit) et les boutons d'acceptation/rejet de `FindingPanel` / `FindingDrawer` (états sélectionnés) n'ont pas été mis dans leur état coloré pendant la recette : couleurs sémantiques attendues, non vues.
- Les modules CSS (`equity.module.css`, `cash.module.css`) posent leurs `border-color` hors couche : inchangés, ils continuent de primer sur les utilitaires comme avant.
- Une passe parallèle (trois workers) a mesuré `fiscalite-390` avant le rendu de la pastille du bandeau ; le relevé a été refait seul (README des captures). Le garde-fou `stillDefault = 0` n'est pas sensible à cette course (un élément non rendu n'est pas compté).

## Dépendances du lot suivant

- Les futurs lots peuvent utiliser `border-<couleur>` directement ; les styles inline de bordure ne sont plus nécessaires (il n'en reste aucun dans les composants C02).
- `link-name` ×5 sur `/normatif/cycles/[slug]` et le débordement à 390 px de `/onboarding` sont à traiter par leur lot respectif.

---

# Handoff — Mission C04 : référentiel français et éditions du guide (2026-10-13)

**Base.** `main` `f846424` (fusion de la PR #75, Mission C03). Branche locale `claude/c04-referentiel-editions`, worktree `cockpit-fiscalite-dashboard-1c1ba9`. Registre des corrections : [docs/mission-c04/REGISTRE_CORRECTIONS.md](../mission-c04/REGISTRE_CORRECTIONS.md). Aucun déploiement.

## Problème utilisateur, vue choisie, données, interactions

- **Problème.** Le registre PCG (`data/pcg/requirements.yml`, 14/08/2026) écartait ANC 2024-07 « absent de la page consultée », laissait ANC 2026-03 et 2026-04 sans date d'effet, tandis que `exceptional-dossier.ts` codait en dur des dates plus récentes et la numérotation 513-5 / 531-5. `GUIDE_REFERENCE` annonçait une V1.1 de 138 pages dont le fichier est absent ; une V1.0 de 117 pages et un fichier de 120 pages circulent avec une autre pagination.
- **Vue.** Un résolveur partagé (`lib/knowledge/french-gaap.ts`) : par texte, adoption / homologation / publication / effet / première période / anticipation / champ contractuel ; par période, statut de chaque texte et numérotation d'article par sujet. Quatre couches nommées et séparées (source officielle normative, commentaire doctrinal, méthode interne, pièce de dossier).
- **Données.** PDF homologués de l'ANC lus le 13/10/2026 (empreintes SHA-256, pages), page officielle des règlements, annonce officielle d'effet de 2026-04 ; fichiers locaux du guide (empreintes, pieds de page).
- **Interactions.** Aucune nouvelle interaction : `ExceptionalWorkspace` affiche l'article résolu ; `ModuleAvailability` liste les éditions du guide ; l'export du dossier embarque le calendrier des textes.

## Changements

**Résolveur** — `lib/knowledge/french-gaap.ts` (nouveau) : `FRENCH_GAAP_TEXTS` (PCG 2024, ANC 2022-06, ANC 2024-07, PCG consolidé 2026, ANC 2026-03, ANC 2026-04), `resolveFrenchGaap({ startDate, closingDate, profile, anticipated })`, `applicableArticle(topic, …)`. Statuts : `mandatory`, `anticipation_elected`, `anticipation_available` (option non déclarée : texte non appliqué), `not_yet_applicable`, `superseded`, `out_of_scope_sector`, `unknown`. Une période est jugée à sa date d'ouverture ; la pièce d'adoption de l'option reste vérifiée par le moteur.

**Registre et données** — `data/pcg/requirements.yml` : en-tête corrigé (ANC 2024-07 réintégré avec l'explication de l'erreur de méthode ; renumérotation rattachée à la version), cinq exigences `verified` avec `adoptionDate`, `homologationDate`, `publicationDate`, `firstMandatoryPeriod`, `anticipation`, `contractualScope`, `numbering` (champs ajoutés à `PcgRequirementSchema`, `sha256` et `pages` ajoutés à `SourceRefSchema`). `lib/knowledge/registry.ts` : versions 2026-03 / 2026-04 `effective` (homologation 12/08/2026, JO 03/09/2026), source et version `anc-2024-07` ajoutées, exigences `*-pending` remplacées par `*-application`.

**Moteur** — `lib/workpapers/exceptional-dossier.ts` : dates et numérotation lues dans le résolveur (`frenchGaapText`), porte inchangée, `textId` ajouté au résultat. `fiscal-rules.ts` inchangé (registre fiscal distinct) ; la comptabilisation de l'impôt (515-1 → 542-1) est résolue par le sujet `income_tax`.

**Guide** — `lib/workpapers/availability.ts` : `GUIDE_EDITIONS` (V1.1 138 p. déclarée, fichier absent ; deux extraits locaux V1.1 ; V1.0 117 p. complète ; V1.0 120 p. signalée, introuvable), `GUIDE_REFERENCE.editionId` / `pagesVerified: false`. `components/probant/ModuleAvailability.tsx` : éditions listées, pages non vérifiées. `lib/workpapers/package.ts` : `frenchGaapTexts` (calendrier des textes, sans résolution d'applicabilité par défaut : option et profil ne sont connus que du pack de chaque feuille verrouillée) et `guide.editions` dans le manifeste.

**Docs** — `docs/knowledge/REVIEW_REQUIRED.md` (R-08, R-09 résolus, index mis à jour), `docs/knowledge/COVERAGE_REPORT.md` (passage corrigé), `docs/mission-c04/REGISTRE_CORRECTIONS.md`, `docs/probant-lots/C04_PR.md`.

## Tests exécutés (local, 2026-10-13, données synthétiques)

| Vérification | Résultat |
|---|---|
| `lib/knowledge/__tests__/french-gaap.test.ts` | 14 (bornes 2024/2025, 2025/2026, 2026/2027 ; 2026-04 clos avant / ouvert après le 04/09/2026 ; option absente, hors fenêtre, texte sans anticipation ; secteur ; période invalide ; empreintes) |
| Suites `lib/knowledge`, `exceptional.test.ts`, `components/probant` | 192 réussis / 192 (18 fichiers) |
| Suite unitaire complète | 1 593 réussis / 1 593, 148 fichiers, à froid |
| Typecheck, lint | OK (7 avertissements préexistants hors lot) |
| Vue `ModuleAvailability` (Synthèse) à 390 / 1440 | vérifiée en navigateur sur le serveur de développement : texte des éditions rendu dans le volet Méthode ; l'empreinte SHA-256 ne débordait plus après ajout d'`overflow-wrap: anywhere` au paragraphe (273/273 px à 375 px, document sans débordement global) |

**Non exécuté localement** : recettes PostgreSQL (CI). Build de production et Playwright : non rejoués (aucune route ni interaction nouvelle ; texte d'une carte modifié, vérifié en navigateur).

## Limites et maturité

- Aucune règle de classement (2024-07) ni de comptabilisation des produits (2026-03) n'est implémentée : seules dates, numérotation et applicabilité sont résolues.
- Recueil PCG 2024 non relu : la fenêtre d'ouverture 2024 du pack historique reste une méthode interne (Mission 17), déclarée comme telle.
- Arrêté du 12/08/2026 sur Légifrance non lu (403) : dates fondées sur les en-têtes des textes publiés par l'ANC. Entrée en vigueur de 2026-03 non énoncée par le texte : le champ contractuel n'est pas daté.
- Pagination de la V1.1 non vérifiable sans le fichier complet ; les extraits locaux n'ont pas de numéros de page d'origine.
- Le régime sectoriel reste hors périmètre (statut explicite, aucune numérotation).

## Dépendances du lot suivant

- C09 (capitaux propres / dettes) : consommer `applicableArticle("other_equity", …)` pour dater la présentation dettes / autres fonds propres.
- C05 : effets et doublons indépendants de ce lot.

---

# Handoff — Mission C03 : assertions, tests suggérés et couverture (2026-10-13)

**Base.** `main` `2c74e98` (fusion de la PR #73, Mission C02 ; contient C00 et C01). Branche locale `claude/c03-assertions-couverture`, worktree `cockpit-fiscalite-dashboard-1c1ba9`. Contrat de métriques : [docs/mission-c03/CONTRAT_METRIQUES.md](../mission-c03/CONTRAT_METRIQUES.md). Aucun déploiement.

## Problème utilisateur, vue choisie, données, interactions

- **Problème.** Dans `build-datasets.ts`, l'assertion d'un constat venait de `financialEffect` (les constats non chiffrés étaient « non qualifiés ») ; dans la page Tests, la procédure venait du seul `siloId` (toute créance Clients → compte 418) ; la couverture affichait « Substantielle » avec 0/0 écritures et 24/24 contrôles, le dénominateur des contrôles étant le nombre de règles ayant produit un constat.
- **Vue.** Matrice des constats cloison × assertions NEP 500 §09 (13 assertions, trois catégories, relues sur h2a-france.org le 13/10/2026), distincte d'une « Couverture des travaux » (procédures réalisées, pièces, versions) ; couverture de l'analyse par population qualifiée, sans ratio sans dénominateur ; page Tests avec régime et période, puis une réponse par constat (objectif, assertions, population, source, étapes ou « Procédure à définir »).
- **Données.** Règle et objectif du constat, effet financier explicite s'il existe, comptes, silo, lignes source, source normative portée par la règle ; `CalculationContext` qualifié (`entriesPopulation`, `controlsDenominatorBasis`) ; feuilles de travail du snapshot.
- **Interactions.** Composants existants ; sélecteur de régime sur la page Tests (ne modifie que les références) ; lien vers l'outil de la procédure lorsqu'il existe.

## Changements

**Assertions** — `lib/audit/assertions.ts` (nouveau). `resolveAssertions(finding)` : conformité du fichier (R-HL-*) → aucune assertion ; règle connue (`RULE_ASSERTIONS`, `RECONCILIATION_ASSERTIONS` pour `R-RAPPRO-<qualification>`) → assertions NEP 500 avec objectif et justification ; signaux analytiques et seuils internes (`SIGNAL_RULES`, écart `a_justifier`) → non résolue ; effet financier explicite (règle inconnue) → traduction de l'ancien vocabulaire ; sinon non résolue. Source NEP 500 §09 enregistrée (`NEP_500_SOURCE` : titre, organisme, URL, section, arrêté, date de lecture).

**Procédures** — `lib/audit/procedures.ts` (nouveau). `resolveProcedure(finding)` : titre, objectif, assertions, population (silo, comptes, lignes source), source du constat (jamais réécrite), étapes, ce qui reste au professionnel, références H2A, outil de l'application. Créance litigieuse → revue de recouvrabilité (compte 491, NEP 501 §07-08) ; produit non facturé → rattachement (compte 418) ; date FEC invalide → localiser, corriger à la source, revalider ; règle inconnue → « Procédure à définir » sans étape inventée. `regimeReferences` : audit (NEP 330, NEP 500) / examen limité (NEP 2410 §08, §17-18, tests de détail non requis) / non renseigné, avec rappel de l'exercice.

**Couverture** — `lib/canonical-model/dossier.ts` (`entriesPopulation`, `controlsDenominatorBasis`), `lib/synthesis/types.ts` (`CoveragePopulation`, statut `unqualified`, limite `coverage_unqualified`), `lib/synthesis/engine.ts` : une population par ligne (manquante, connue vide, non applicable, non qualifiée, non traitée, partielle, traitée) ; ratio seulement avec dénominateur dénombré ou déclaré ; `unqualified` dès qu'une population est manquante ou non qualifiée ; verdict « Couverture non qualifiée » (statut `insufficient_coverage`) ; trace avec `excludedItems`. Producteurs : démonstration → `missing` + `findings_only` (DEMO SA passe de « Substantielle » à « Non qualifiée ») ; dépôt FEC → `counted` ou `known_empty` + `catalog` (le service et le worker d'ingestion fournissent déjà le catalogue) ; dépôt historique de documents par cycle → `not_applicable` (écritures, sans FEC) + `declared` (contrôles), couverture « partielle » car limitée aux documents déposés. `lib/synthesis/note.ts` : libellés.

**Vues** — `lib/visualization/build-datasets.ts` : `coverage` par population (état, réalisé, dénominateur, ratio ou —, base) ; `riskHeatmap` devient la matrice des constats NEP 500 §09 (colonnes « Non résolue » et « Conformité du fichier » seulement si nécessaire, un constat compte dans chacune de ses assertions, source NEP citée) ; nouveau `workCoverage` (une ligne par feuille : assertions visées, état, travail exécuté / non concluant / bloqué, pièces, version, revue ; vide = « non établie ») ; élément de décision « Couverture » et prochaine action adaptés. `components/synthesis/WorkCoverageTable.tsx` (nouveau) ; `CoverageStackedBar` n'affiche ni ratio ni barre sans dénominateur qualifié ; Synthèse : la couverture des travaux suit le niveau décision et la matrice occupe toute la largeur du niveau analyse (jusqu'à 13 colonnes d'assertions, illisibles dans une carte de 372 px à 1440). `components/synthesis/tokens.ts` : `faint` aligné sur `--pb-text-faint` (#9aabc3, relevé par C00) ; l'ancien #5c6b82 donnait 3,2:1 sur les cartes (44 nœuds en défaut axe color-contrast dès que le contenu sous la ligne de flottaison est évalué). `RiskHeatmap` : au-delà de 50 % d'intensité, la cellule passe en texte sombre sur ≥ 78 % d'accent (le texte clair tombait à 3,3:1 sur les cellules les plus denses, 13 et 12 constats). `app/dashboard/tests/page.tsx` : régime et période, réponse par constat ; liens soulignés en permanence (axe « link-in-text-block », WCAG 1.4.1 : un lien dans un bloc de texte ne se distingue pas par la seule couleur).

## Routes et interactions visibles

- `/dashboard/synthese` : décision « Couverture : Non qualifiée » (DEMO SA), carte « Couverture de l'analyse » par population, « Couverture des travaux » (non établie sans feuille), « Matrice des constats · cloison × assertion (NEP 500 §09) ».
- `/dashboard/tests` : « Régime de la mission et période » (sélecteur, références H2A), « Réponse proposée par constat » avec `data-procedure-status`.

## Tests exécutés (local, 2026-10-13, données synthétiques)

| Vérification | Résultat |
|---|---|
| `lib/audit/__tests__/resolvers.test.ts` | 11 (assertions : qualitatif sans impact, deux constats Clients, conformité du fichier, signal interne, effet financier ; procédures : recouvrabilité ≠ 418, date FEC, à définir, population/source, références H2A, régimes) |
| `lib/synthesis/__tests__/coverage-populations.test.ts` | 10 (manquante, connue vide, non applicable, partielle, non qualifiée, DEMO SA, source absente ; travaux : aucun, non concluant/exécuté, bloqué) |
| Suites synthèse, visualisation, audit (`--pool=forks`) | 190 réussis / 190 (9 fichiers : synthèse, visualisation, audit, dépôt historique de rapprochement, composants Capitaux propres et Clients) |
| Suite unitaire complète | 1 578 réussis / 1 579, 147 fichiers (287 s) ; l'échec est un délai de 5 s dépassé dans `lib/workpapers/__tests__/fixed-asset-runtime.test.ts` (chaîne FA-1004, hors lot), 10/10 réussis rejoué seul ; une première passe concurrente au build avait aussi fait tomber deux tests de composants sur le même délai, 190/190 rejoués à froid |
| Typecheck, lint | OK |
| Build de production | OK (`next build`, 0 erreur) |
| `e2e/c03-assertions.spec.ts` (390 / 1024 / 1440, axe strict sur le contenu, viewport déplié à 8000 px pour qu'axe évalue aussi le contenu hors de la ligne de flottaison du conteneur défilant) | 6 réussis / 6 (Synthèse et Tests × 3 largeurs, 24 captures) |
| Parcours existants (`demo-journey`, `accessibility`, `c01-context`, `c02-finition`) | 37 réussis / 37 sur le build final (`c02-finition` 14, `accessibility` 8, `demo-journey` 4, `c01-context` 11) ; `demo-journey` attend désormais l'hydratation de la Synthèse avant de compter les boutons (le HTML serveur est le squelette : le compte à 0 était une course, pas un bouton factice) |

**Non exécuté localement** : recettes PostgreSQL (CI). Lecteur d'écran réel : NON VÉRIFIÉ.

## Captures

[c03-captures](c03-captures/) : Synthèse et Tests à 1440, 1024 et 390 px (vue au chargement, puis captures d'éléments : couverture de l'analyse, couverture des travaux, matrice des constats, créance litigieuse, procédure à définir), plus la page Tests en régime examen limité. Lecture guidée dans son `README.md`.

## Limites et maturité

- Les correspondances règle → assertions et règle → procédure sont des choix de méthode interne, justifiés dans le code et le contrat ; elles ne sont pas des normes. Les règles non listées restent « non résolue » / « à définir ».
- Le régime de la mission n'est pas porté par le dossier : il est choisi à l'écran et ne modifie que les références. La NEP 2410 lue concerne les comptes intermédiaires ; la norme d'examen limité des comptes annuels par un expert-comptable n'a pas été lue.
- La « procédure non applicable motivée » vit dans le programme de clôture (Mission 19) et n'est pas projetée dans la couverture des travaux de la Synthèse.
- Les dates d'application des textes à l'exercice ne sont pas lues sur les pages H2A : la page Tests le rappelle.

## Dépendances du lot suivant

- C05 : les effets et doublons restent ceux du moteur ; la matrice ne dépend plus du montant.
- C14 : projeter l'applicabilité motivée et les conclusions du programme de clôture dans la couverture des travaux.

---

# Handoff — Mission C02 : finition de Synthèse, Tests et du laboratoire de scénarios (2026-10-13)

**Base.** PR [#73](https://github.com/ludoviclabs-dotcom/PROBANT/pull/73), branche `claude/dashboard-socle-commun-0b7995`, ouverte sur `main` `ab8f991` puis **fusionnée avec `main` `97b298f`** (PR #74 : lots C00 et C01 de Codex) dans le commit de fusion `cb83680`. Descriptif de PR : [C02_PR.md](C02_PR.md). Aucun déploiement.

**Raccordement au registre C01 (après fusion).** C01 livre le registre unique `lib/capabilities/registry.ts` (14 périmètres : 13 cycles du journal + Dettes financières, 15 procédures, 10 exercices d'atelier, routes, sources, exclusions, modes), le contexte de navigation canonique (`DossierContextLink`, `navigationContext`) et le panneau `CapabilityAccess`. Ce lot s'y raccorde :
- `lib/dossier/cycle-registry.ts` ne redéclare plus les cycles : `CYCLE_REGISTRY` est projeté depuis `CAPABILITY_REGISTRY` (cycles, procédures, scénarios, routes, sources, exclusions, capacité par mode) ; le module n'ajoute que la présentation (étendue en une phrase, silos des constats historiques, libellés d'accès, limites héritées des anciens paragraphes) et la projection d'un dossier (état, écarts, prochaine action) ;
- tous les liens des composants C02 (`CycleRegistryList`, `DossierContextBar`, laboratoire, synthèse de scénario) passent par `DossierContextLink` : dossier, entité, exercice, référentiel et mode sont transmis (CTX-01 résolu par C01) ;
- `CapabilityAccess` (implémentation, configuration locale lue par `/api/dossier-capabilities`, travail observé) est conservé dans le volet « Méthode · capacités, disponibilité et limites par module », ouvert par défaut, sous la liste des cycles ; la synthèse de scénario lui transmet explicitement son contexte ;
- la capacité « local persistant » reste affichée « configurée — activation requise » dans la ligne de cycle ; l'activation réelle est celle que lit le panneau de capacités (C07).

## Problème utilisateur, vue choisie, données, interactions

- **Problème.** La Synthèse empilait onze paragraphes de liens et limites avant le verdict ; la page Tests ouvrait sur un bandeau `bg-amber-50` hors thème mêlant entrée dans l'atelier, reprise et méthode ; une feuille Clients chargée sans saisie annonçait « Modifications non sauvegardées » (M20-UI-03).
- **Vue.** Dossier, état des sources et action prioritaire en tête ; décision du moteur ; liste continue des cycles (état, étendue, écarts, prochaine action) avec détail dans la ligne ; méthode et disponibilité dans un volet replié. Lanceur compact « Laboratoire de scénarios » dans le thème, Nouveau / Reprendre, volet « Mode et sauvegarde ».
- **Données.** Snapshot actif (constats historiques par silo, admissibilité, empreinte FEC, documents), résumé des feuilles (`summarizeWorkpapers`), résultats des scénarios du laboratoire, verdict et prochaine action du moteur de Synthèse. Rien n'est recalculé dans React ; aucune somme de montants entre catégories.
- **Interactions.** Ligne de cycle dépliable (`aria-expanded`), lien d'action vers la feuille, la revue par cloison, la source requise ou la preuve verrouillée (`#wp-<id>`) ; volet du laboratoire au clavier (focus dans le volet, Échap rend le focus) ; identifiant complet copiable.

## Changements

**Registre et projection** — `lib/dossier/cycle-registry.ts` (nouveau).
- 13 entrées = `CL_CYCLES`. Chaque scénario du laboratoire est rattaché à un seul cycle (le cut-off, servi par la chaîne Achats, reste sous « Achats et fournisseurs » ; « Transversal » garde le lien `/cutoff`).
- `projectCycleRows` : état (`locked`, `review`, `executed`, `blocked`, `stale`, `findings`, `available`, `source_required`, `absent`), détail, écarts (exceptions des contrôles et constats par gravité, jamais additionnés), prochaine action typée (`proof`, `work`, `review`, `source`, `open`, `declare`). `sortCycleRows` met d'abord ce qui demande une action ; `priorityCycle` donne l'action prioritaire ; `projectSourceState` lit l'origine des données.
- Les textes de limite reprennent mot pour mot ceux des anciens paragraphes.

**Synthèse** — `app/dashboard/synthese/page.tsx`, `components/probant/DossierContextBar.tsx` (nouveau), `components/probant/CycleRegistryList.tsx` (nouveau), `components/probant/SyntheticSummary.tsx`.
- Les paragraphes d'accès (lignes 483–493) sont supprimés. Ordre : en-tête → bandeau dossier / sources / action prioritaire → décision → cycles → volet « Méthode · disponibilité et limites par module » (l'ancien `ModuleAvailability`, inchangé) → exports, revue, analyse, exploration.
- Table des cycles en `table-layout: fixed`, chiffres tabulaires (`tnum`), écarts alignés à droite, colonnes explicites ; à 390 px elle défile dans son cadre (`position: relative`, `role="region"` focusable), jamais la page.
- La Synthèse d'un scénario utilise les mêmes composants ; `ModuleAvailability` y reste visible (c'est la preuve des feuilles).
- `components/synthesis/DecisionHeader.tsx` : le détail des six éléments de décision passe de `--pb-text-faint` à `--pb-text-muted` (seules violations « serious » restantes dans le contenu de la vue).

**Tests et laboratoire** — `app/dashboard/tests/page.tsx`, `components/probant/CycleDemonstration.tsx` (réécrit, même export, même mécanique de journal vérifié / rejeu / exports).
- Lanceur : icône, titre, ligne d'état (« Aucun scénario ouvert » ou identifiant court + `n/10 cycles exécutés · k bloqués`), actions `Nouveau` (nom accessible « Nouveau scénario synthétique »), `Reprendre` (nom accessible avec l'identifiant), `Remise à zéro explicite`, `Mode et sauvegarde` (`aria-expanded` / `aria-controls`).
- Volet `#cycle-demo-info` (`role="region"`, `tabIndex=-1`) : mode, sauvegarde, dossier actif, identifiant complet en `<code>` + « Copier l'identifiant » (retour `role="status"`, refus du presse-papiers expliqué), période. Focus déplacé dans le volet à l'ouverture ; Échap le ferme et rend le focus au bouton.
- L'ambre n'habille que le message de blocage (`--pb-warn`, bordure gauche 3 px) et les refus (`data-tone="error"`, préfixe « Blocage · »).
- Liste des tests : en-tête de section, compteur, état vide explicite (scénario sans constat historique).

**État de sauvegarde (M20-UI-03)** — `lib/workpapers/draft-state.ts` (nouveau) : `sameDraft` (égalité structurelle, ordre des clés et `undefined` ignorés, `File` par nom et taille) et `saveStateLabel` (`idle` + propre → « Aucune modification en attente » ; lecture seule → « Lecture seule · aucune saisie » ; `saving` / `saved` / `failed` / `conflict` prioritaires).
- `ClientFramingWorkspace` : base = période, conclusion, commentaire, note de revue, brouillon ventes serveur, fichier, colonnes et format d'import ; `dirty()` ne fait plus que marquer la saisie. Sans feuille chargée : « Aucune feuille chargée ». Version exacte ou verrouillée : lecture seule.
- `EquityWorkspace` (historique `/equity`) et `PayablesWorkspace` : brouillon comparé à `draftOf(run)` / `unstamp(run)` ; le message « base serveur actualisée » après conflit est conservé.
- Les feuilles récentes (cash, immobilisations, fiscal, stocks, provisions, capitaux propres) comparaient déjà leur brouillon : inchangées.

**Mouvement** — `app/globals.css` : `pbPanelIn` (180 ms), `.pb-details` (chevron tourné, 150 ms). La règle `prefers-reduced-motion` globale les ramène à 0,001 ms.

## Routes et interactions visibles

- `/dashboard/synthese` : bandeau, décision, « Cycles du dossier » (ligne dépliable), « Méthode · disponibilité et limites par module ».
- `/dashboard/tests` : « Laboratoire de scénarios », volet « Mode et sauvegarde », tests suggérés par constat.
- Synthèse d'un scénario (`SYN-*`) : « Cycles du scénario », action prioritaire vers la source requise ou la preuve `#wp-<id>`.
- Parcours bref, du dossier à la preuve : Synthèse → action prioritaire « Fournir la source requise » (feuille bloquée) ou « Arbitrer n constats bloquants » → `/dashboard/cloisons` ; scénario : Tests → Exécuter → Soumettre → Approuver → Verrouiller → Synthèse → « Consulter la preuve verrouillée » → `#wp-<id>` dans les feuilles de travail.

## Tests exécutés (local, 2026-10-13, données synthétiques)

| Vérification | Résultat |
|---|---|
| Tests unitaires (`--pool=forks`, projet `unit`) | 1 529 réussis / 141 fichiers, dont 5 (`cycle-registry.test.ts`), 5 (`draft-state.test.ts`) et 5 (`clients-save-state.test.tsx`) nouveaux |
| Typecheck | OK |
| Lint | 0 erreur sur les fichiers du lot (avertissements préexistants hors lot inchangés) |
| Build de production | OK |
| `e2e/c02-finition.spec.ts` | 14/14 : 3 largeurs × (Synthèse dossier courant, Tests vide + volet, scénario repris + feuille bloquée + synthèse du scénario) ; erreur de reprise, chargement, identifiant long, programme long (10 scénarios), mouvement réduit. Débordement global nul partout ; axe « serious / critical » = 0 sur le contenu des vues |
| `e2e/phase-de.spec.ts`, `e2e/workpaper-results.spec.ts`, `e2e/demo-journey.spec.ts`, `e2e/accessibility.spec.ts` | 25/25 (3 + 10 + 4 + 8) ; la dette « serious » gelée de la Synthèse n'est pas aggravée |
| Après fusion avec `main` (C00 + C01) : `c02-finition`, `c01-context`, `phase-de`, `workpaper-results`, `demo-journey`, `accessibility` sur le build fusionné | 50/50 ; captures `apres/` régénérées sur ce build |

**Non exécuté localement** : les recettes PostgreSQL (`*.integration.test.ts`) — pas de base jetable sur ce poste ; elles tournent en CI. Un lecteur d'écran réel n'a pas été utilisé : NON VÉRIFIÉ.

## Captures

Avant / après dans [c02-captures](c02-captures/README.md) : 1440, 1024 et 390 px ; vide, dossier courant, scénario repris, feuille bloquée, erreur de reprise, chargement, identifiant long, programme long, réduction des animations.

L'inspection a fait corriger : la table des cycles trop étroite à 1024 px (largeurs de colonnes fixées) puis un chevauchement des compteurs d'écarts sur l'étendue (éléments insécables sans point de coupure, corrigé) ; le contraste des détails de décision ; les bordures sémantiques (ambre du blocage, accent de l'action prioritaire) écrasées par la règle globale `* { border-color }` non stratifiée, posées en style inline ; le ton d'erreur des refus du laboratoire.

## Limites et maturité

- Capacité persistante affichée « configurée » dans la ligne de cycle sans vérification d'activation ; l'activation réelle est lue par le panneau de capacités C01 (C07).
- Le chrome partagé (Sidebar, bandeau, lanceur de visite) garde la dette de contraste `--pb-text-faint` gelée par `accessibility.spec.ts` ; le contrôle strict de ce lot porte sur le contenu de `<main>`.
- **Défaut global constaté, non corrigé ici** : `app/globals.css` pose `* { border-color: var(--pb-border) }` hors de toute `@layer`. Une règle non stratifiée l'emporte sur les utilitaires Tailwind (stratifiés), si bien que toute classe `border-<couleur>` de l'application est silencieusement ignorée. Ce lot pose ses couleurs de bordure sémantiques en style inline (`borderLeftColor`) ; la correction globale (mettre la règle dans `@layer base`) relève d'un lot de finition transversal (C15) car elle réactive des couleurs de bordure partout.
- `ModuleAvailability` et `WorkpaperPanel` ne sont pas restylés : ils vivent dans le volet « Méthode » et la preuve.
- Le laboratoire reste une démonstration locale (journal dans le navigateur, sept jours, contrôle d'intégrité) ; aucune feuille n'est une opinion.

## Dépendances du lot suivant

- C01 (livré, fusionné) : si le registre reçoit un jour l'étendue et les silos par cycle, retirer `PRESENTATION` de `cycle-registry.ts`.
- C03 : les « tests suggérés par constat » restent choisis par `siloId` (MET-01).
- C07 : qualifier la capacité « local persistant » depuis l'activation réelle.

---

# Handoff — Mission 19 : dossier professionnel, contrôle interne et clôture (2026-10-10)

**Base.** `origin/main` `b9daf1b` : Missions 15, 16, 17 et 18 fusionnées. C'est aussi le dernier déploiement Production rapporté par GitHub à Vercel (état « success », 10/10/2026 01:46 UTC). Ce SHA a été lu par l'API GitHub des déploiements, pas en visitant le site.

**Branche locale.** `claude/dossier-mission19`, dans le worktree `probant-analysis-setup-41121f`. Elle n'est **pas poussée** et aucune PR distante n'est créée.

**Contrat et recette.**
- [docs/mission19/CONTRAT.md](../mission19/CONTRAT.md)
- [docs/mission19/RECETTE.md](../mission19/RECETTE.md)

## Changements métier

**Objectif : empêcher de présenter un ensemble de cycles comme un audit complet.**

**Programme de travail.**
- Il relie risques, assertions (NEP 500 §09, en trois catégories), procédures, sources et pièces.
- **Risque.** Il porte une évaluation humaine selon l'échelle du cabinet (méthode interne, sans valeur par défaut) ; un risque non évalué bloque la clôture.
- **Procédure.** Elle ne couvre que des assertions de ses risques.
- **Couple risque × assertion sans procédure applicable.** C'est un trou visible du programme, jamais un oubli silencieux.

**Feuilles de cycle outillées.** Les Missions 05 à 17 sont **observées** en lecture seule dans les sept familles de tables (`clients_`, `cash_`, `fa_`, `eq_`, `fx_`, `st_`, `pv_`) :
- état, version, révision, revue et assertions déclarées ;
- population et sources ;
- empreinte de contenu.

Le dossier ne recalcule, ne revoit et ne verrouille aucune feuille. Une feuille réalisée hors programme est une incohérence à rattacher.

**Travaux manuels traçables, sans moteur** : contrôles internes, confirmations, observation physique, estimations, événements postérieurs, autres procédures.
- **Qui et quand** : identité et heure fixées par le serveur.
- **Ce qui est enregistré** : date de réalisation déclarée ; sur quoi ; éléments examinés ; ce qui a été fait ; résultat.
- **Avec quelle preuve** : pièce, version, page ou zone, nature et empreinte, résolues par le serveur.
- **Travail sans pièce** : il reste visible dans la file des pièces manquantes et ne fonde aucune conclusion.

**Contrôle interne.**
- **Trois étapes distinctes** : description (conception), mise en œuvre (NEP 315 §34), test de fonctionnement (NEP 330).
- **Fonctionnement.** Il n'est jamais déduit. Un test exige description et mise en œuvre documentées.
- **Conclusion.** Elle précise sa portée : conception et mise en œuvre seulement (la limite « fonctionnement non testé » est alors affichée), ou fonctionnement.

**ITGC.** Ils ont leur propre périmètre (systèmes, processus, période) et leur méthode. Aucun travail ni aucune conclusion avant ce périmètre : une checklist ne vaut pas couverture.

**Déclarations de la direction.**
- Une déclaration est une pièce parmi d'autres.
- Elle ne fonde seule ni une conclusion, ni une correction, ni la résolution d'une contradiction.
- C'est une méthode interne, fondée sur la lecture de la NEP 580 §04. La NEP ne contient pas cette phrase.

**Revue et suivi.**
- **Points de revue.** Ils sont levés par la revue, reçoivent une réponse du préparateur, puis sont clos par une autre personne que l'auteur de la réponse.
- **Revue d'une procédure.** Ni l'auteur de la conclusion ni l'auteur d'un travail ne peut la revoir.
- **Anomalies.**
  - Une correction exige une **preuve nouvelle** : pièce déposée après l'anomalie, autre que celle qui l'a révélée.
  - Une anomalie non corrigée reçoit une appréciation humaine.
  - Un montant inconnu le reste, jamais zéro.
  - Aucun seuil de signification n'est appliqué.
- **Limites d'étendue.** Leur incidence est appréciée par le professionnel.
- **Contradictions.** Elles opposent deux pièces différentes et se résolvent en citant une pièce corroborante.

**Péremption.** Toute modification de la base d'une conclusion la rend périmée : procédure, risques, population, applicabilité, périmètre ITGC, travaux, ou nouvelle version d'une pièce citée.

**Clôture.**
- La vue liste les travaux restants et les contradictions par famille.
- **La validation de clôture** :
  - exige `dossier:sign` **et** une habilitation de clôture fournie par le serveur, **accordée à personne par défaut** ;
  - est refusée tant qu'un élément reste ouvert ;
  - fige le dossier ;
  - devient périmée si une feuille de cycle change ;
  - se lève par une réouverture motivée et tracée.
- **Aucune opinion d'audit n'est générée.**

**Journal.** Il est en ajout seul (`cl_events`, `cl_pieces` et `cl_command_receipts`, protégés par déclencheurs) et ses empreintes sont chaînées. C'est un contrôle d'intégrité local, ni une signature ni une preuve inviolable.

**Recette** (valeurs calculées à la main, détail dans [RECETTE.md](../mission19/RECETTE.md)) :
- **contrôle décrit mais non testé** (P-03) ;
- **procédure non applicable motivée** (P-08) ;
- **population absente** (P-04) ;
- **anomalie corrigée avec nouvelle preuve** (A-01, 1 240,00 €) ;
- **contradiction non résolue** (C-01 : lettre d'affirmation contre réponse de l'avocat) ;
- **cycle verrouillé mais dossier incomplet** : la feuille Provisions est réellement verrouillée par sa propre chaîne, 1 / 1. Pourtant :
  - 2 / 7 procédures revues ;
  - 4 / 13 couples risque × assertion avec une procédure revue ;
  - 19 travaux restants ;
  - validation refusée même au signataire habilité.

**Fichiers partagés modifiés.** Aucun moteur partagé de `lib/workpapers` n'est modifié. Les autres modifications sont des ajouts :
- `drizzle/migration-manifest.json` (+ 0019) ;
- `.env.example` (`PROBANT_CLOSING_DURABLE=`) ;
- un lien dans `app/dashboard/synthese/page.tsx` et dans `components/probant/SyntheticSummary.tsx`.

## Routes et interactions visibles

- **`/dossier-cloture`**, relié depuis `/dashboard/synthese` et la synthèse synthétique, avant la liste des cycles.
  - **Bandeau de vérité** : feuilles verrouillées, travaux restants, pièces manquantes, absence d'opinion.
  - **Registre de 13 indicateurs.** Chacun est une fraction, avec son unité, ses exclusions et un segment par élément réel. Un segment cliquable ouvre la procédure ou l'onglet concerné.
  - **Programme.**
    - Carte de couverture risques × assertions : ✓ revue, ◐ en cours, ✕ aucune procédure, — non applicable. Sélectionner une case met en évidence les procédures qui la couvrent.
    - Un couloir par risque : état, procédure, nature, assertions, responsable, travaux et pièces, dernière action (qui et quand).
    - Filtres : nature, état, responsable, recherche.
    - Éditeur du programme.
  - **Fiche de traçabilité** (panneau latéral). Elle présente :
    - le fil risques → population → périmètre ITGC → étapes et travaux → conclusion → revue ;
    - le reste à faire et les limites ;
    - les formulaires d'action selon les droits ;
    - le refus du serveur, expliqué dans la fiche.

    Échap rend le focus à l'élément d'origine.
  - **Pièces.** File des pièces manquantes, de la plus ancienne à la plus récente ; clôture d'une demande (reçue ou annulée motivée) ; registre des pièces versionnées avec leur empreinte ; dépôt.
  - **Anomalies et limites.** Totaux connus et inconnus, correction, appréciation, contradictions en vis-à-vis, incohérences détectées, limites d'étendue.
  - **Revue.** Points de revue et procédures en attente de revue.
  - **Clôture.** Travaux restants par famille, feuilles de cycle observées, validation ou réouverture (professionnel habilité).
  - **Journal.** Filtré par procédure, avec empreintes.
  - Le contexte (onglet, procédure, filtres) est conservé dans l'URL.
- **`/api/workpapers/closing`** (GET lecture et téléchargement, POST commande) et **`/api/workpapers/closing/pieces`** (dépôt multipart).
  - Fermés sans `PROBANT_CLOSING_DURABLE=disposable`, toujours refusés sur Vercel production.
  - Concurrence optimiste sur la tête du journal (409 avec la position courante) et idempotence par clé.

## Tests exécutés (local, 2026-10-10, données synthétiques)

| Vérification | Résultat |
|---|---|
| Tests unitaires (`--pool=forks`) | 1 512 réussis, dont 16 nouveaux (`closing-runtime.test.ts`) |
| Typecheck | OK |
| Lint | 0 erreur (7 avertissements préexistants, hors de ce lot) |
| `db:check` | 22 migrations valides |
| Build de production | OK (`/dossier-cloture` : 27,4 kB) |
| `e2e/closing.spec.ts` | 3/3, axe sans violation grave ou critique |
| Suite Chromium complète | 99 réussis, 1 ignoré, 0 échec |

**Non exécuté localement** : `closing-durable.integration.test.ts`, la recette PostgreSQL jetable. Ce poste n'a ni PostgreSQL ni Docker. Elle tournera en CI, dans le projet Vitest « durable ». Elle couvre :
- la lecture réelle des sept familles de tables ;
- les déclencheurs d'ajout seul ;
- la concurrence sous verrou de ligne ;
- la reprise après reconnexion.

## Captures

11 captures réelles dans [mission19-captures](mission19-captures/README.md) : 1440, 1024 et 390 px, réduction des animations, fiche de feuille verrouillée, pièces, anomalies, clôture refusée, refus du serveur, journal.

L'inspection a fait corriger :
- deux violations axe :
  - `aria-label` sur un `span` ;
  - `dd` portant un rôle `group` ;
- un débordement de page à 390 px (textes réservés aux lecteurs d'écran, en position absolue, hors du conteneur défilant) ;
- des en-têtes de la carte de couverture qui se chevauchaient ;
- des colonnes non alignées entre couloirs ;
- des travaux restants sans identifiant de procédure ;
- un refus serveur affiché loin du formulaire.

## Sources professionnelles consultées (10/10/2026)

| Source | Nature | Repères |
|---|---|---|
| Code de commerce, art. L821-53 et L821-11 (Légifrance, depuis le 01/01/2024) | Obligation légale | Certification ; NEP homologuées par arrêté |
| Arrêtés du 28/12/2023 (JORF 31/12/2023) et du 13/11/2024 (JORF 19/11/2024) | Obligation légale | Recodification ; NEP 315, 330 et 265 révisées. NEP 315 et 330 applicables aux exercices ouverts depuis le 19/11/2024. |
| NEP 230, 315, 330, 450, 500, 501, 505, 560, 580, 265, 700 (H2A) | Normes professionnelles | Voir le tableau du contrat |

**Fidélité de lecture.**
- **Lus mot à mot :** NEP 230 §03-04 et §08-09, NEP 580 §01, §04 et §13, NEP 265 §01-02, intertitres de la NEP 700.
- **Lus à travers une synthèse des pages H2A**, numéros à revérifier avant toute citation dans le produit : NEP 315, 330, 450, 500, 501, 505 et 560.

**Méthodes internes.** Elles sont nommées comme telles dans le contrat :
- déclaration seule ;
- preuve nouvelle ;
- revue par une autre personne ;
- ITGC sans périmètre ;
- péremption ;
- blocage de la clôture.

## Limites

- **Habilitation de clôture.** Elle n'est branchée sur aucune source réelle (inscription, mandat, IdP) et n'est accordée à personne dans le serveur durable.
- **Non modélisé :**
  - périodicité des tests de contrôles ;
  - communication des faiblesses ;
  - dates d'arrêté et de signature ;
  - seuil de signification ;
  - lettre d'affirmation structurée.
- **Paie.** Elle n'est pas observable (pas de feuille durable).
- **Responsable.** C'est une affectation déclarée, pas une identité vérifiée.
- **Plusieurs feuilles pour une même procédure.** La plus avancée est retenue ; les autres sont listées.
- **Non vérifié :**
  - la recette PostgreSQL, non exécutée localement ;
  - le lien NEP 315 / ISA 315 (2019) ;
  - les arrêtés de 2025-2026 (NEP 600, 911, 912, 9510), non lus.

## Maturité

Démontrable sur données synthétiques :
- programme, travaux manuels, revue et clôture sur stockage mémoire de test ;
- observation d'une vraie feuille Provisions verrouillée.

**Le produit n'est pas déclaré globalement prêt.** Une validation de clôture enregistrée n'est pas une opinion d'audit. Une suite verte n'autorise aucune mission réelle.

## SHA, base et diff

| Élément | Valeur |
|---|---|
| Base | `origin/main` `b9daf1b` (= dernier déploiement Production rapporté) |
| Branche | `claude/dossier-mission19`, local |
| Diff hors captures | 36 fichiers, +3 523 / −2 (handoff compris) |
| Captures | 11 JPEG et un README |

## Proposition de PR (non créée)

- **Titre** : `feat(dossier): Mission 19 — programme de travail, contrôle interne et clôture, sans opinion générée`
- **Cible** : `main`, depuis `claude/dossier-mission19`.
- **À relire en priorité** :
  - `lib/workpapers/closing-decide.ts` : règles et séparation des tâches ;
  - `lib/workpapers/closing-evaluate.ts` : états, indicateurs, blocages ;
  - `lib/workpapers/closing-store.ts` : lecture des sept familles par liste fermée ;
  - la migration `0019_closing_dossier`.

## Dépendances du lot suivant (Mission 20)

- Recette PostgreSQL en CI (`closing-durable.integration.test.ts`).
- Source réelle de l'habilitation de clôture (inscription, mandat, IdP, audit d'accès), avant toute activation, sur autorisation distincte.
- Feuille durable pour la paie, pour l'observer.
- Recette indépendante du parcours complet (Prompt 20).

---

# Handoff — Mission 16 : Provisions et engagements (2026-10-10)

**Base.** `origin/main` `cbd354b` (Missions 15, 17 et 18 fusionnées).

**Branche locale.** `claude/provisions-mission16`, dans le worktree `probant-analysis-setup-41121f`. Deux commits (code puis statistiques du handoff), **non poussés**, et aucune PR distante n’est créée.

**Mise à jour (10/10/2026).** Poussée sur autorisation explicite, corrigée après revue (`9ac58f9`), puis fusionnée dans `main` par la PR #71 (`b9daf1b`).

**Contrat et recette.**
- [docs/mission16/CONTRAT.md](../mission16/CONTRAT.md)
- [docs/mission16/RECETTE.md](../mission16/RECETTE.md)

## Changements métier

**Registre unique des risques et engagements.**
- **Population** : événements ouverts à l'ouverture, nouveaux et clos pendant l'exercice, avec ou sans écriture. Un événement né après la clôture ou clos avant l'ouverture est exclu avec son motif.
- **Unité de test** : l'événement (`pv_event`).
- **Sources** (6, tabulaires, mapping `provisions-1`) :
  - registre et grand livre 15, requis ;
  - mouvements, estimations et scénarios, annexe, pièces citables.

**Calculs, uniquement des ponts et comparaisons documentés.**
- Pont par événement : ouverture + dotations − utilisations − reprises = clôture calculée, comparée à la clôture déclarée.
- Estimation retenue − provision : différence **à examiner**, au montant connu.
- Événement / annexe : présence, montant et rubrique.
- Cadrage par compte 15 à l'ouverture, à la clôture, et pont du grand livre.
- Tableau des provisions par catégorie (art. 832-13).

**Ce que l'outil ne fait pas.**
- Aucune formule probabilité × montant.
- Aucune qualification d'obligation ni issue juridique déduite.
- Un inconnu reste inconnu : sans journal, sans estimation, sans annexe ou sans solde du grand livre, la valeur est inconnue, jamais zéro.

**Recette** (calculée à la main) :
- **EV-01** : estimation documentée 80 contre provision 50, soit **+30,00 € à examiner**.
- **EV-02** : reprise sans justificatif (10,00 €, incertitude).
- **EV-03** : engagement hors grand livre (200, sans écriture, annexe concordante).
- **EV-04** : risque clôturé (40 − 35 − 5 = 0).
- **EV-05** : estimation absente, non concluant.
- **EV-06** : passif éventuel absent de l'annexe.
- **EV-07** : hors population.
- **Totaux** : 95 + 35 − 40 − 15 = 75, égal au grand livre. Issue « exceptions détectées » (2 différences, 2 incertitudes).

**Jugement humain cité.**
- Préparation : déclaration sur les informations des avocats (NEP 501 §§ 07-08), pièce citée ou motif.
- Chaque point devient une note bloquante, traitée en citant une pièce figée et sa version.
- Revue par une autre identité sur l'empreinte soumise, puis verrouillage.

**Confidentialité.**
- Le registre et les pièces marquent la confidentialité. L'accès au contenu confidentiel est une capacité serveur distincte, jamais déduite d'un rôle général. **Par défaut, personne ne la détient** dans le serveur durable.
- Sans elle, le serveur **retire de la réponse** :
  - l'obligation, la contrepartie, la méthode et la décision ;
  - les scénarios, l'estimation et la différence ;
  - les libellés de pièces confidentielles ;
  - les lignes confidentielles des sources, y compris la copie conservée en entrée du calcul ;
  - les notes sensibles.
- Le téléchargement des originaux confidentiels est refusé (403).
- Les montants comptabilisés et publiés restent visibles. Les runs stockés et les empreintes ne changent pas.

**Fichiers partagés modifiés (ajouts seulement).**

| Fichier | Ajout |
|---|---|
| `lib/workpapers/model.ts` | `provisionWork`, unité `pv_event`, empreinte et validation |
| `lib/workpapers/service.ts` | adaptateur `provisions.register`, `configureProvisions`, preuves du résultat, révision |
| `lib/workpapers/selection.ts` | population `pv_event` |
| `lib/workpapers/imports.ts` | mapping `provisions` et types admis |

## Routes et interactions visibles

- **`/provisions`**, relié depuis `/dashboard/synthese` et la synthèse synthétique.
  - **Onglet Registre.** Il réunit :
    - le bandeau « Pont de provision » animé : chaque case de mouvement met en évidence les événements qui y contribuent ;
    - le registre en cases sur trois couloirs (ouverts, nouveaux, clos, plus le hors population), avec filtres par nature, type, état et recherche, et bascule Cases / Tableau ;
    - la liste « Engagements et passifs sans écriture ».
  - **Fiche latérale.** Elle présente :
    - l'obligation et la décision ;
    - le pont de l'événement ;
    - l'échelle estimation / écriture (scénarios, provision, crochet de différence) ;
    - l'annexe, les mouvements, la chronologie et les pièces.

    Échap rend le focus à la case.
  - **Autres onglets** : Pont et cadrage, Exceptions (traitement cité), Pièces (6 sources, versions conservées), Revue.
  - Le contexte (case, filtres, mise en évidence, vue, onglet) est conservé dans l'URL.
- **`/api/workpapers/provisions` et `/imports`** : fermés sans `PROBANT_PROVISIONS_DURABLE=disposable`, toujours refusés sur Vercel production.

## Tests exécutés (local, 2026-10-10, données synthétiques)

| Vérification | Résultat |
|---|---|
| Unitaires (`--pool=forks`) | 1 495 réussis, dont 30 nouveaux (20 moteur, 10 runtime) |
| Typecheck | OK |
| Lint | 0 erreur (7 avertissements préexistants hors périmètre) |
| `db:check` | 21 migrations valides |
| Build de production | OK |
| `e2e/provisions.spec.ts` | 4/4, axe sans violation grave ou critique |
| Suite Chromium complète | 95 réussis, 1 ignoré, 1 échec |

L'échec est `accessibility › depot`, un délai `networkidle` sur une page non modifiée. Relancé seul, il passe 8/8.

**Non exécuté localement** : `provision-durable.integration.test.ts` (PostgreSQL jetable). Il tournera en CI, dans le projet Vitest « durable ».

## Captures

10 captures réelles dans [mission16-captures](mission16-captures/README.md) : 1440, 1024 et 390 px, réduction des animations, lecture masquée, cadrage, exceptions, version verrouillée.

L'inspection a fait corriger quatre défauts :
- une fiche défilante non focalisable (axe) ;
- un cadenas non dimensionné ;
- un sélecteur de pièce chevauchant le bouton ;
- un montant de reprise affiché signé.

## Sources professionnelles consultées (10/10/2026)

| Source | Nature | Repères |
|---|---|---|
| Code de commerce, art. L123-20 (Légifrance, version du 01/01/2016) | Obligation légale | Prudence et passifs |
| PCG, règlement ANC 2014-03, version au 1er janvier 2026 (PDF officiel lu) | Obligation légale | Art. 321-1, 321-5, 321-6, 322-1, 322-2, 322-4, 322-5, 322-8, 323-2, 323-10, 323-12, 832-13, 832-14, 836-1, comptes 151 et 152 |
| NEP 540 (arrêté du 13/11/2024, JO du 19/11/2024 ; lue dans la reproduction CNCC) | Norme professionnelle | Estimations comptables |
| NEP 501 §§ 07-08 (H2A, arrêté du 27/11/2024) | Norme professionnelle | Informations des avocats |

Le reste relève de la méthode interne ou de paramètres utilisateur. Le détail, avec URL et limites, figure dans le contrat.

## Limites

- **Ce qui reste humain.** L'exhaustivité du registre n'est pas établie par l'outil : le cadrage avec le grand livre et l'annexe la signale seulement là où une différence apparaît. La significativité (832-14) et la faible probabilité (832-13) restent du jugement humain.
- **Ce qui n'est pas couvert.**
  - reclassement entre comptes ;
  - mouvement sans événement (refusé) ;
  - provisions pour retraite (324-1) ;
  - actualisation ;
  - remboursements attendus (323-8) ;
  - événements postérieurs à la clôture (hors population).
- **Confidentialité.**
  - Le serveur durable n'accorde la capacité confidentielle à personne. Le branchement sur une habilitation dédiée (IdP, groupe ou dossier) reste à valider.
  - Une note libre non rattachée à un événement n'est pas masquée.
  - Les reçus d'idempotence conservent la réponse complète côté serveur.
- **Non livré** : synthèse ni export Provisions.
- **Non vérifié** : recette PostgreSQL non exécutée localement ; texte du JO de la NEP 540 de 2024 non lu directement.

## Maturité

Démontrable sur données synthétiques, avec une chaîne de revue complète sur stockage mémoire de test. **Le produit n'est pas déclaré globalement prêt.** Une suite verte n'autorise aucune mission réelle.

## SHA, base et diff

| Élément | Valeur |
|---|---|
| Base | `origin/main` `cbd354b` |
| Branche | `claude/provisions-mission16`, deux commits locaux |
| Diff hors captures | 42 fichiers (handoff compris), +3 397 / −13 |
| Captures | 10 JPEG |

## Proposition de PR (non créée)

- **Titre** : `feat(provisions): Mission 16 — registre des risques et engagements relié au grand livre et à l'annexe, masquage confidentiel serveur`
- **Cible** : `main`, depuis `claude/provisions-mission16`.
- **À relire en priorité** :
  - les ajouts dans `lib/workpapers/{model,service,selection,imports}.ts` ;
  - la migration `0018_provision_workpapers` ;
  - `provision-review.ts` (calculs) ;
  - `provision-redaction.ts` et `provision-runtime.ts` (masquage, téléchargements).

## Dépendances du lot suivant

- Recette PostgreSQL en CI (`provision-durable.integration.test.ts`).
- Habilitation confidentielle dédiée (source, portée par dossier, audit d'accès) avant toute activation, sur autorisation distincte.
- Synthèse et export Provisions.
- Événements postérieurs à la clôture.
- Provisions pour retraite et actualisation, après vérification des sources.

---

# Handoff — Mission 15 : Stocks et inventaires, sous-lots 1 « quantités et mouvements », 2 « coûts et cadrage » et 3 « revue de valeur » (2026-10-09)

**Base.** `origin/main` `dc793e017e4661159e04f48cfa7b4187f24797ed` (PR #66, Mission 13, fusionnée).

**Branches locales**, dans le worktree `probant-analysis-setup-41121f` :
- `claude/stocks-mission15` : sous-lot 1, commit `c2a74e5` ;
- `claude/stocks-mission15-couts` : sous-lot 2, empilée sur le sous-lot 1, commit `747dd2f` ;
- `claude/stocks-mission15-valeur` : sous-lot 3, empilée sur le sous-lot 2 (commit suivant).

**Livraison.** Trois sous-lots séquentiels, livrés en local et proposés en trois PR distinctes, à fusionner dans l'ordre.

**Opérations distantes.** Aucun push, aucune PR distante, aucune fusion, aucun déploiement, aucune configuration distante, aucune activation réelle.

## Changements métier

**Feuille Stocks (`stocks.count`).** Elle établit, pour chaque référence / site / lot de stock propre, la quantité reconstituée à la clôture et la compare au théorique :
- pour un comptage antérieur ou à la clôture : compté + entrées − sorties ;
- pour un comptage postérieur : compté − entrées + sorties.

**Convention du jour de comptage.** Elle est choisie par le préparateur et citée depuis les instructions d'inventaire ; elle n'est jamais présumée.

**Sources.** Quatre sources versionnées : feuilles de comptage, état théorique, journal de mouvements avec sa période couverte déclarée, pièces citables. Toute ligne mal formée est refusée avec sa ligne, sa colonne et sa valeur.

**Ce qui n'est pas ajouté au stock propre.** Stock de tiers, consignations reçues ou déposées, transit, en-cours, références exclues et sites non visités sont présentés à part avec leur motif.

**Cas bloqués ou non concluants.**
- Unité incompatible (par exemple cartons contre unités) : bloqué, sans conversion.
- Mouvements absents ou incomplets : non concluant.
- Référence non comptée : inconnue, jamais zéro.

**Exceptions à expliquer.**
- Statut de propriété différent entre comptage et théorique : écart de propriété.
- Total net compensé : signalé (net et brut par référence).

**Ce que l'outil ne fait pas (sous-lot 1).** Aucune valeur monétaire : les notes portent un montant **inconnu**. Aucune présence physique certifiée, aucune dépréciation.

**Démonstration existante.** Le cycle « Stocks » de démonstration de `lib/rapprochement` (comparaison de montants) n'est pas modifié ni présenté comme test de quantité.

## Sous-lot 2 — coûts et cadrage

**Sources facultatives.**
- Coûts documentés par référence (et lot), avec la méthode déclarée et la pièce.
- Grand livre des comptes de classe 3 à la clôture.
- Colonnes valeur et compte dans l'état théorique.

Sans ces sources, aucune valeur n'est dérivée.

**Calcul.**
- **Écart de quantité valorisé** au coût documenté. C'est un **écart potentiel**, porté en montant connu sur la note. Recette : −2 × 12,00 = **−24,00 €**.
- **Écart de prix** : valeur théorique − quantité × coût (REF-C : +10,00 €).
- **Cadrage par compte** du stock détenu avec le grand livre (compte 321 : +10,00 €). Les stocks de tiers et consignations reçues valorisés sont exclus et signalés. Les comptes 39 sont renvoyés à la revue de valeur.
- **Total net et brut en valeur** : −24,00 € pour 64,00 € bruts.

**Incertitudes.** Coût manquant, unité du coût incompatible, cadrage incomplet. La valeur reste alors inconnue, jamais nulle.

**Méthodes de coût.** Les méthodes CMP, PEPS, identification spécifique, coût standard et prix de détail sont affichées par compte, jamais recalculées ni approuvées par l'outil.

**Garde à l'import.** Toute colonne nommée dans le mapping doit exister dans le fichier.

**Stockage.** Migration additive `0015_stock_costs_ledger` (contraintes de type élargies ; retour arrière refusé si des coûts ou des soldes existent).

**Interface.**
- Cases : écart potentiel et écart de prix affichés.
- Tableau : quantité, coût, valeur.
- Panneau : « Coût et valeur » avec la pièce.
- Carte « Coûts et cadrage » : barres état valorisé / grand livre et alternative tabulaire.

**Sources consultées.** PCG (règlement ANC 2014-03, version au 1er janvier 2026, texte officiel ANC) : articles 213-30 à 213-35, 214-22, et plan de comptes de la classe 3. Le détail figure dans `docs/mission15/CONTRAT.md`.

## Sous-lot 3 — revue de valeur

**Sources facultatives.**
- Hypothèses de valeur par référence (et lot) : prix de vente estimé, coûts de sortie explicites, nature, pièce et justification obligatoires, date du dernier mouvement facultative.
- Colonne de dépréciation comptabilisée dans l'état théorique.

Sans ces sources, la revue n'est pas lancée.

**Comparaison.**
- Valeur actuelle selon l'hypothèse = prix − coûts de sortie (PCG art. 214-6 et 214-22).
- Écart indicatif = (coût − valeur actuelle) × quantité théorique, quand la valeur actuelle est inférieure au coût (art. 214-5).
- L'écart indicatif est comparé à la dépréciation comptabilisée. **L'outil ne propose ni ne comptabilise aucune dépréciation** ; chaque différence appelle un jugement humain motivé et cité.
- Recette REF-C : 125,00 € contre 150,00 €, soit **−25,00 €** à apprécier.

**Autres résultats.**
- Dépréciation comptabilisée sans hypothèse : signalée.
- Cadrage du détail avec les comptes 39 : −20,00 €.
- **Rotation** : date du dernier mouvement affichée comme indice (art. 214-16). **Aucune dépréciation automatique sur la rotation.**

**Stockage.** Migration additive `0016_stock_value_review`.

**Interface.**
- Carte « Revue de valeur » avec alternative tabulaire.
- Cases « Valeur à apprécier ».
- Panneau : hypothèse, justification, pièce et indice de rotation.

## Routes et interactions visibles

**`/stocks`.** Grille de **cases** par site, une par référence / site / lot :
- couleur, icône et texte donnent la nature de l'écart (quantité, propriété, bloqué, non concluant, à part) ;
- mini-barres reconstitué / théorique ;
- filtres par nature, site, lot et recherche, avec bascule Cases / Tableau ;
- état dans l'URL : `item`, `site`, `lot`, `kinds`, `q`, `view`, `tab`.

**Panneau « Comptage et pièce ».**
- Pont inventaire → clôture en barres, avec son alternative tabulaire.
- Lignes de comptage, ligne théorique et mouvements, chacune ouvrant sa source puis sa pièce.
- Échap rend le focus à la case.

**Onglets.**
- Population : 15 unités, exclusions motivées.
- Exceptions : traitements cités.
- Pièces : import avec mapping explicite, approbation, versions remplacées conservées.
- Revue : convention citée, gel, calcul, conclusion, revue par une autre identité, verrouillage, révision.

**Accès et API.**
- Liens depuis `/dashboard/synthese` et le résumé synthétique. J'y ai aussi corrigé le libellé fiscal périmé « IS : sous-lot suivant ».
- API `/api/workpapers/stocks` et `/imports` : fermées sans `PROBANT_STOCKS_DURABLE=disposable`, toujours refusées en production.
- Migration additive `0014_stock_workpapers` (tables `st_*`, en ajout seul, retour arrière refusé si des données existent).

## Tests exécutés (local, 2026-10-09)

| Niveau | Résultat |
|---|---|
| Suite unitaire complète (`--pool=forks`) | Sous-lot 1 : 1 391 réussis. Sous-lot 2 : 1 403 réussis. Sous-lot 3 : 1 411 réussis. Chaque fois 42 ignorés (les 6 recettes PostgreSQL, dont Stocks). |
| Moteur et runtime Stocks | `stock-review` 17/17, `stock-valuation` 11/11, `stock-value-review` 7/7, `stock-runtime` 12/12 |
| Typecheck / build | OK / OK |
| Lint | 0 erreur, 7 avertissements préexistants |
| `db:check` | 19 migrations, invariants valides (18 pour le sous-lot 2, 17 pour le sous-lot 1) |
| Chromium (build de production) | Sous-lot 3 : 92 réussis, 1 ignoré ; `stocks.spec.ts` 6/6. Sous-lot 2 : 91 réussis. Sous-lot 1 : 90 réussis. Axe sans violation sérieuse ni critique. |

Les quantités de la recette ont été calculées à la main, puis comparées aux feuilles ; le détail est dans `docs/mission15/RECETTE.md`.

## Captures

16 JPEG réels dans `docs/probant-lots/mission15-captures/` : 1440, 1024 et 390 px, plus réduction des animations. Le README indique le contenu de chaque capture.

## Sources professionnelles consultées (09/10/2026)

- **Code de commerce, art. L123-12** (Légifrance, version en vigueur depuis le 21/09/2000) : obligation légale d'inventaire au moins une fois tous les douze mois.
- **NEP 501 §§ 03 à 06** (H2A, arrêté du 27/11/2024, JO du 30/11/2024) : norme professionnelle sur la présence à l'inventaire, les sites, une autre date avec les mouvements intercalaires, et les procédures alternatives.

Aucune ne fixe la formule de passage à la clôture : elle reste une **méthode interne**. Aucun seuil, aucune tolérance et aucune durée n'est encodé.

## Limites

- **PostgreSQL jetable non exécuté localement.** `stock-durable.integration.test.ts` tourne seulement en CI. Aucun échange OIDC réel n'a été vérifié.
- **Pas d'usage réel.** Activation réelle fermée. **Une suite verte sur fixtures synthétiques n'autorise aucune mission réelle.**
- **Quantités** : deux décimales au plus (colonne pivot du parseur tabulaire) ; aucune conversion d'unité, même documentée.
- **Dates de comptage** : une seule date par site ; un comptage tournant sur plusieurs jours n'est pas couvert.
- **Non couvert dans ce sous-lot** :
  - Synthèse de mission et paquet d'export Stocks : prévus au sous-lot 3 ;
  - valeur d'usage, contrats de vente ferme et positions globales sur matières (PCG art. 214-22 et 214-23) ;
  - **Synthèse de mission et paquet d'export Stocks** : non livrés, à prévoir dans un lot dédié ;
  - un coût différent par site ;
  - recalcul du coût moyen pondéré ou du premier entré, premier sorti, à partir des entrées ;
  - carte géographique : aucune localisation vérifiée.
- **Maturité** : démontrable sur données synthétiques, chaîne de revue complète en mémoire. **Produit non déclaré prêt globalement.**

## Propositions de PR (non créées)

1. **Sous-lot 1** : `feat(stocks): Mission 15 sous-lot 1 — quantités comptées, mouvements intercalaires et passage inventaire → clôture`. Branche `claude/stocks-mission15` vers `main` (`dc793e0`).
2. **Sous-lot 2** : `feat(stocks): Mission 15 sous-lot 2 — coûts documentés, écarts valorisés et cadrage avec le grand livre`. Branche `claude/stocks-mission15-couts`, à ouvrir **après la fusion du sous-lot 1**, ou vers la branche du sous-lot 1 en attendant. À relire en priorité : `lib/workpapers/stock-valuation.ts` et la migration `0015`.
3. **Sous-lot 3** : `feat(stocks): Mission 15 sous-lot 3 — revue de valeur sur hypothèses citées, sans dépréciation automatique`. Branche `claude/stocks-mission15-valeur`, à ouvrir après le sous-lot 2. À relire en priorité : `lib/workpapers/stock-value-review.ts` et la migration `0016`.

À relire en priorité :
- les ajouts dans les fichiers partagés `lib/workpapers/{model,service,selection,imports}.ts` ;
- la migration `0014` ;
- `lib/workpapers/stock-review.ts` (fenêtre de mouvements et statuts).

## Dépendances du lot suivant

1. **Sous-lots 2 et 3** : livrés (voir ci-dessus).
2. **Synthèse et export Stocks** : à ajouter dans un lot dédié, sur le modèle des Synthèses Trésorerie, Immobilisations et Fiscalité (paquet approuvé, index des sources, HTML, CSV). Analyse de valeur sur hypothèses justifiées et citées ; aucune dépréciation automatique sur la rotation ; Synthèse et paquet d'export.
3. **Recette PostgreSQL.** Exécuter `stock-durable.integration.test.ts` en CI.

---

# Handoff — Mission 13 : parcours fiscal harmonisé avec les feuilles, TVA puis IS (2026-10-09)

**Base.** `origin/main` `a82ed3cdbfb371eeef180baf5efc29098e186c51` (PR #65 fusionnée). Branche locale `claude/fiscal-tva-is-mission13`, dans le worktree `probant-analysis-setup-41121f`. Trois commits locaux, dans l'ordre séquentiel exigé :

| Commit | Contenu |
|---|---|
| `704ba15` | Sous-lot TVA |
| `6de103b` | Sous-lot IS |
| commit suivant | Documentation, recette, captures et ce handoff |

**Aucun push, aucune PR distante, aucune fusion, aucun déploiement, aucune configuration distante, aucune activation réelle.** Aucun travail d'un autre chantier n'a été écrasé.

## Changements métier

Les moteurs existants sont réutilisés tels quels : `reconcileVat` (TAX-06), `computeCorporateTax` (TAX-05), le processeur CA3 / CA12 / liasses et le registre fiscal. Il n'y a ni calcul parallèle dans React ni substitution du millésime le plus proche.

Les seules retouches de moteur et de processeur préservent le comportement : les empreintes des 21 cas golden TVA sont inchangées et les 56 tests d'ingestion passent.
- L'extraction pure `buildTaxDocumentSnapshot` permet de lire une pièce figée sans base de données.
- La table `VAT_CONTROL_SOURCE_REQUIREMENTS` est désormais exportée.

**TVA** (une feuille par entité, régime et période déclarative) :
- **sources** : FEC / grand livre, déclaration versionnée par période, factures, paiements, pièces ;
- **comparaisons** : comptabilisé, déclaré, écart ; un écart sans objet est signalé « Sans objet » ;
- **pont explicatif** : crédit reporté cité par sa case ;
- **paiements et continuité du crédit** ;
- **taux constatés**, avec leur origine, jamais présentés comme taux légaux ;
- **règles bloquées**, avec la source requise.

**IS** (une feuille par exercice) :
- résultat comptable cadré FEC ↔ WA ;
- base avant ou après impôt ;
- pont fiscal documenté, avec résidu sur XI ;
- retraitements cités (pièce et source du registre) ;
- correction proposée acceptée seulement si sa source couvre l'exercice ;
- double ajustement d'IS refusé ;
- profil confirmé par une pièce ;
- millésime égal à celui des formulaires ; IS 2024 maintenu bloqué.

**Invariants** :
- Un résultat inconnu reste inconnu, jamais zéro : moteur bloqué, déclaration absente ou non lue, liasse absente.
- Les autres taxes du registre (CFE, CVAE, C3S, taxe sur les salaires) restent des capacités séparées et ne sont jamais annoncées comme couvertes.

**Invalidation.** La période identifie la feuille.
- Les événements suivants rendent la feuille TVA périmée : déclaration remplacée, déclaration précédente corrigée ou ajoutée, nouvelle facture, paiement, pièce ou FEC.
- La déclaration d'une autre période ne la périme pas.
- Une CA3 ne périme pas l'IS ; une liasse corrigée le périme.

Contrat : `docs/mission13/CONTRAT.md`. Recette, cas de référence calculés à la main et matrice : `docs/mission13/RECETTE.md`.

## Routes et interactions visibles

- **`/fiscal`** : onglets TVA / IS, puis navigation par période (trimestres, exercice). Filtres : tout, bloqué, exceptions, pièces, revue, périmé.
  - Les lignes de déclaration ouvrent les écritures, puis la pièce, dans un panneau latéral ; Échap rend le focus.
  - Préparation : profil cité, explications, retraitements. Ensuite : exécution, traitements cités, conclusion, revue par une autre identité, verrouillage, révision.
  - État dans l'URL : `tax`, `period`, `item` (`L:`, `E:`, `R:`, `B:`, `A:`), `noteId`.
- **`/fiscal/synthese`** : une ligne par impôt et par période, péremption, file de travail, versions remplacées, autres taxes non couvertes. Exports diagnostic et approuvé.
- **API** : `/api/workpapers/fiscal`, `/imports`, `/export`. Prévisualisation puis approbation des imports ; idempotence ; contrôle de concurrence par version.
  - L'API est fermée sauf avec `PROBANT_FISCAL_DURABLE=disposable`, et refusée si `VERCEL_ENV=production`.
- **Liens** : depuis `/dashboard/synthese`, le résumé synthétique et le cockpit `/dashboard/fiscalite`.
- **Stockage** : migration additive `0013_fiscal_workpapers` (tables `fx_*`, append-only par trigger, down refusé si des données existent).

## Tests exécutés (local, 2026-10-09)

| Niveau | Résultat |
|---|---|
| Suite unitaire complète | 1 362 réussis, 39 ignorés (PostgreSQL) |
| Tests fiscaux TVA | `fiscal-vat` 13, `fiscal-vat-golden` 9 (cas de la gate rejoués par le chemin fichiers) |
| Tests fiscaux IS | `fiscal-cit` 18, dont 10 cas golden rejoués |
| Tests runtime | `fiscal-runtime` 11, `fiscal-runtime-cit` 5 |
| Typecheck / build | OK / OK |
| Lint | 0 erreur, 7 avertissements préexistants |
| `db:check` | 16 migrations, 17 tables, invariants valides |
| Chromium (build de production) | 86 réussis, 1 ignoré ; `fiscal.spec.ts` 5/5 (4 TVA, 1 IS), axe sans violation sérieuse ni critique |

**Validation indépendante des montants.**
- **TVA T2 2026** : collectée 230, déductible 110, nette 120 ; CA3 20 ; crédit reporté 100 ; résidu 0.
- **IS 2026** : avant impôt 70 800 ; WA 52 850 ; XI 71 800 ; 71 800 × 25 % = 17 950 = charge 695 = dette 444.

Ces montants ont été calculés à la main, puis comparés aux feuilles. Les cas golden de la gate de release passent par deux chemins indépendants et donnent des résultats identiques.

## Captures

`docs/probant-lots/mission13-captures/` contient 14 JPEG réels, produits par Chromium sur le build de production, à 1440, 1024 et 390 px, plus une capture en réduction des animations. Le README liste le contenu de chaque capture.

## Limites

- **PostgreSQL jetable non exécuté localement.** `fiscal-durable.integration.test.ts` (scénarios TVA et IS) est ignoré sans base dédiée. Aucun échange OIDC réel n'a été vérifié.
- **Activation réelle fermée** : drapeau désactivé et refusé en production. **Une suite verte sur fixtures synthétiques n'autorise aucune mission réelle.**
- **Registre non modifié** (vérifié le 16/08/2026, aucune règle évoluée par ce lot, donc aucune nouvelle consultation des sources officielles). Restent bloqués :
  - TVA à partir du 01/09/2026 (CGI art. 269 et 289 arrêtés au 31/08/2026) ;
  - IS 2024 et 2025 (barème 2026 seulement) ;
  - millésimes de formulaires autres que 2026.
  
  CGI art. 39 est cité avec une version « à vérifier » : non couvrant.
- **Formats** : les déclarations sont déposées dans la feuille en CSV, JSON ou XLSX (gabarits du processeur fiscal). La lecture PDF du processeur n'est pas branchée sur la feuille. EUR uniquement.
- **Périmètre** : aucune liquidation, aucun dépôt, aucune conformité déclarée ; la feuille constate des écarts sur le périmètre testé.
- **Maturité** : démontrable sur données synthétiques, avec une chaîne de revue complète en mémoire. **Produit non déclaré prêt globalement.**

## Proposition de PR (non créée)

**Titre** : `feat(fiscal): Mission 13 — feuilles TVA par période et IS par exercice raccordées aux moteurs`. Base `main` (`a82ed3c`), 3 commits ; diff `a82ed3c..HEAD` : 61 fichiers de code, +5 212 / −467, plus la documentation et les captures.

Points à relire en priorité :
- hunks additifs des fichiers partagés `lib/workpapers/{model,service,selection,imports}.ts` ;
- extraction `lib/ingestion/tax-document-snapshot.ts` ;
- `lib/tax/vat/coverage.ts` ;
- migration `0013`.

Avant fusion : CI complète, avec PostgreSQL jetable.

## Dépendances du lot suivant

1. Exécuter **complètement** `fiscal-durable.integration.test.ts` sur une base jetable `_test` / `_ci`, avec les migrations appliquées explicitement.
2. Faire publier par un humain les versions successeurs du registre, après consultation des sources officielles, si la TVA après le 31/08/2026 ou l'IS 2025 doivent être couverts : CIBS, barème 2025, millésimes, version de CGI art. 39.
3. Brancher la lecture PDF du processeur sur la feuille, si elle est requise.
4. Vérifier OIDC et les droits dans le navigateur avant toute activation, sur autorisation distincte.

---

# Handoff — Capitaux propres, feuille parallèle `/capitaux-propres` (2026-10-09)

**Base.** Branche `claude/capitaux-propres-cohabitation`, partie de `main` `5e49934` (Missions 08, 11 Codex `/equity` et 12 fusionnées). Elle reprend la Mission 11 développée par Claude (PR #63, devenue non fusionnable quand la PR #62 de Codex a été fusionnée). À la demande du propriétaire, elle **cohabite** avec `/equity` sans la modifier :
- noms dédiés (`capitaux-*`, `capitaux_propres.review`, `capitauxWork`, mapping `capitaux`) ;
- migration `0012_capitaux_propres` (tables `eq_*`) ;
- drapeau `PROBANT_CAPITAUX_DURABLE`.

`reviewEquity` (moteur partagé, contexte `equity.review`) est complété de façon additive. La composante ou le capital non établis (`null`) restent inconnus. Les tests de `/equity` restent verts.

**Contenu :**
- balance, écritures, tableau fourni, registre des décisions, règlements, PV en PDF versionnés par pièce ;
- carte art. 821-1 PCG ;
- décision / comptabilisation / paiement séparés ;
- transferts neutres ;
- lecture de PV et traitements citant pièce et version ;
- notes d'exécution en une seule version, budget des sources vérifié avant stockage ;
- feuille `/capitaux-propres` et Synthèse.

Contrat et recette : `docs/mission11/CONTRAT.md`, `docs/mission11/RECETTE.md`.

**À arbitrer.** Le produit propose deux feuilles Capitaux propres (`/equity` et `/capitaux-propres`). Le choix de la feuille cible, ou leur convergence, est une décision produit. **Maturité :** démontrable sur données synthétiques ; PostgreSQL jetable non exécuté localement ; activation réelle bloquée ; produit non déclaré prêt globalement.

---

# Publication et fusion autorisées (2026-10-09)

Le propriétaire demande explicitement une PR et sa fusion pour Mission 12. La base 464bdc7 est la tête de PR #62 et comprend les dépendances Missions 08 et 11, encore absentes de main. La PR Mission 12 vers main inclut cette base, avec validation CI complète et PostgreSQL avant fusion, puis vérification du déploiement Vercel automatique. Aucun gate durable de production ni configuration distante ne sera activé. Les comptes rendus locaux ci-dessous décrivent les états historiques datés.

---

# Handoff — Mission 12 : droits, distributions et valeur (2026-10-08)

**Base / HEAD local :** `464bdc7b886a18d4f0da5c2255b8400a02a204df`, intégration Mission 11/main conservant les lots précédents, Trésorerie et Immobilisations. **Branche :** `codex/mission12-investments`, worktree isolé `mission12`. Changements locaux non commités ; intention d’ajout utilisée uniquement pour rendre le diff complet. Aucun travail d’un autre chantier écrasé, aucun fichier sous sources/ modifié.

**Main / Vercel observés en lecture seule au début :** `b773f903e5f313b679c2b414d66f5eada1d2789f` ; déploiement `dpl_F6eA89uMSCdvrKMHvgS165tJ2TAX`, READY. Ce constat ne qualifie pas la production après livraison. Aucun push, PR distante, fusion, déploiement, changement de configuration distante ou activation réelle.

## Résultat métier

Le moteur existant `reviewInvestment` est complété, sans nouveau DCF. Droits applicables au titre, à la distribution et à la date ; prorata limité aux droits homogènes ; allocation préférentielle fournie, motivée et sourcée. Produit et encaissement séparés, toutes les dates GL/règlements originales conservées.

Distribution 40 × droits homogènes 25 % = 10 ; produit enregistré 9 → écart arithmétique −1. Allocation préférentielle documentée 12 → droit 12. Coût 100 / dépréciation 10 → base nette déclarée 90, valeur fournie 85 → −5. Le coût explicite aurait une autre comparaison, jamais substituée au net. Coût ou dépréciation requis absent : inconnu, pas zéro.

Valeur d’entreprise, fonds propres et détention distingués, nature d’origine conservée. Un modèle d’entreprise présenté comme détention, une autre date/base/devise/périmètre ou un modèle absent restent non comparables/source requise et non concluants. Hypothèses et scénarios externes fournis, différences de versions lisibles ; aucune conversion ni sélection favorable automatique. Classification et proposition comptable exigent une décision motivée, versionnée et citée ; aucun seuil universel de détention et aucune écriture automatique.

## Routes et interactions

- `/participations` et `/participations?demo=1` : Population / Tests / Exceptions / Pièces / Revue ; tri/filtres/recherche, détail droits/produit/valeur, versions, preuves document/pack/date/ligne/feuille/hash, scénarios, décision humaine. Navigation clavier, Escape et retour du focus. Défilement horizontal conservé ; libellé long complet accessible au clavier/tactile.
- Liaison depuis `/dashboard/synthese` et le résumé synthétique existant. Variantes `case=long` et `case=empty` ; fixtures synthétiques distinctes d’une mission réelle.
- `/api/workpapers/participations`, `/imports`, `/export`, `/demo` : autorisations organisation/dossier, sessions serveur/CSRF, auteur serveur, prévisualisation puis approbation d’import, freeze/configuration/exécution, résolution citée/conclusion/soumission/revue distincte/verrouillage/révision.
- Associations des sources explicites, modèle examiné et version comparée choisis humainement. Modifications pertinentes invalident résultat/notes/conclusion/approbation ; ajout/remplacement de source pertinente rend le run périmé. Historique préservé, idempotence/concurrence réutilisées.
- Succès affiché après accusé serveur ; conflits avec comparaison brouillon/serveur et réessai de même clé. Diagnostic HTML imprimable/JSON protégé ; index des sources uniquement, originaux absents, hash sans signature. Aucun paquet approuvé/certifié revendiqué.

## Maturité et vérifications

| Niveau | Preuve / limite |
| --- | --- |
| Contrat / calcul / guards | Suite complète : 1 267 tests réussis, 32 ignorés ; 117 suites réussies, 3 ignorées. Relance sans build concurrent après un timeout Tax Cockpit existant. |
| Recette ciblée finale | 33 tests réussis : 25 Mission 12, 5 gates, 3 interface. Ce nombre recoupe la suite complète ; les 3 tests UI ont été ajoutés après cette suite. |
| Types / lint / build | Typecheck et build finaux réussis ; lint zéro erreur, sept avertissements préexistants ; fichiers ajoutés/modifiés de l’ajustement final sans avertissement. 163 pages générées, route Participations 13.6 kB / 140 kB. |
| Imports | Sept CSV synthétiques réellement lus par previewImport, hachés et mappés ; exemples dans mission12-fixtures/. XLSX réutilise le parseur commun, sans recette Mission 12 XLSX spécifique. |
| Restitution | Chrome 1440/1024/390 px, reduced-motion réel, long/vide/erreur/aucun résultat/clavier/focus. Captures et rapport ui-qa.md ; défaut du libellé long corrigé et repris sur build final. |
| Migrations | 14 migrations montantes, 17 tables, invariants valides. Additive 0011_investment_review ; down refuse les données Investment existantes. Aucun SQL appliqué/rollback exécuté. |
| Durable / revue réelle | Adaptateur fermé préparé, quatre scénarios PostgreSQL ajoutés au harnais partagé mais ignorés sans base jetable. Aucun échange OIDC réel ni workflow authentifié intégré vérifié dans le navigateur. |
| Usage réel autorisé | Non activé ; gate PROBANT_INVESTMENT_DURABLE désactivé et refusé en production. Aucune conclusion sur la préparation globale du produit. |

Le serveur local de recette est laissé ouvert sur http://127.0.0.1:3212/participations?demo=1, avec gate de démonstration local exact et gate durable désactivé. Il ne constitue pas un déploiement.

## Livraison à examiner

Contrat complet : `MISSION12_CONTRACT.md`. Titre/description de PR prêts : `MISSION12_PR.md`. Diff textuel du lot au-dessus de la base : `../../../MISSION12-review.diff` depuis ce fichier, plus directement à la racine de l’espace de travail (`../MISSION12-review.diff` depuis le worktree). Les captures JPEG restent séparées du patch, dans `mission12-captures/` ; elles sont disponibles dans le worktree. Exemples : sept CSV dans `mission12-fixtures/`, générateur `scripts/mission12-fixtures.ts`.

Le lot s’appuie sur ClientsRuntime / WorkpaperService / modèle canonique et registre de calculs. Les gardes des autres moteurs restent fermés ; seuls sept types Investment et le contexte `investments.review` sont ajoutés. CSS Equity partagé conservé ; petit module Investment pour les largeurs et libellés. Tests et diff vérifiés, aucune modification de document synchronisé.

## Limites et dépendances suivantes

PostgreSQL jetable absent ; PROBANT_CLIENTS_TEST_DATABASE_URL non configuré, Docker/psql indisponibles. Les 32 tests ignorés comprennent les quatre cas Investment : imports→freeze→exécution ; scope/permissions/citations/idempotence/concurrence ; revue distincte/verrouillage/export/CSRF ; reconnexion/remplacement/révision/historique. Une session serveur synthétique du harnais n’est pas un échange OIDC réel.

Avant intégration/activation : réconcilier le main courant et les lots dépendants ; fournir une base locale dédiée finissant par `_test` ou `_ci`, appliquer les migrations sur cette base explicitement autorisée puis exécuter `clients-durable.integration.test.ts` **complet**, sans filtrer uniquement Investment (setup et séquence partagés). Vérifier connexion OIDC, sauvegardes/conflits/revues et droits dans le navigateur. Activation et opérations distantes requièrent toujours une autorisation distincte.

Pièces PDF et lecture humaine professionnelle hors de ce lot de packs CSV/XLSX préparés manuellement. EUR uniquement, aucune conversion devises ni pont EV→fonds propres→détention. Pas de nouvelle règle comptable/fiscale/professionnelle : méthode interne sur données fournies, à qualifier indépendamment avant usage réel. Absence d’originaux dans le diagnostic, archivage certifié et paquet approuvé non couverts.

---

# Intégration pour PR Mission 11 (2026-10-08)

À la demande explicite du propriétaire, la branche `codex/mission11-equity-main` intègre `origin/main` (`b773f903e5f313b679c2b414d66f5eada1d2789f`) et conserve Trésorerie/Immobilisations. La dépendance Mission 08, fusionnée par PR #59 dans `codex/mission07-security` mais absente de main, est incluse. Les contrats des adaptateurs restent fermés. Migrations nouvelles réordonnées après celles de main : `0009_payables_investigation` et `0010_equity_dossier` ; manifeste régénéré, 13 migrations. Les vérifications PostgreSQL/CI et Preview de cette intégration seront les preuves de fusion ; les limites locales historiques ci-dessous restent datées. Aucun gate durable de production n’est activé.

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

# Handoff — Mission 10 : Immobilisations, mouvements et recalcul documenté (2026-10-08)

**Base.** Branche locale `claude/immobilisations-mission10`, partie de `origin/main` `b8c7d7f` (PR #60 Trésorerie fusionnée le 2026-10-08 12:39 UTC ; Mission 07 incluse). **Mission 08 (achats/fournisseurs, Codex) n’est pas dans `main`** : elle reste sur `codex/mission07-security` (`eded0c7`). Production observée en lecture seule : déploiement GitHub « Production » `success` sur `b8c7d7f` (2026-10-08 12:41 UTC) ; le rattachement de l’alias `probant.vercel.app` à ce déploiement n’a pas été vérifié par l’API Vercel (**NOT_VERIFIED**, aucun jeton). Ce lot n’est pas en production. Aucun push, aucune PR distante, aucun déploiement, aucune variable distante modifiée.

**Conflits à prévoir avec la Mission 08.** Mêmes fichiers partagés que la Mission 09 : `lib/workpapers/{model,service,selection,imports,cycle-context}.ts`, `.env.example`, `drizzle/migration-manifest.json`, liens de `app/dashboard/synthese/page.tsx` et `SyntheticSummary.tsx`. Numérotation : `main` a `0007_cash_reconciliation`, ce lot ajoute `0008_fixed_assets` ; la Mission 08 porte `0007_payables_investigation` (doublon de numéro admis par `db:check`, mais à renuméroter ou ordonner explicitement lors de sa fusion). Les hunks Immobilisations sont additifs (unions `realAdapter`, `Population.unit = "asset"`, `CycleContext.procedure`, champ `fixedAssetWork`).

| Point | État | Preuve |
| --- | --- | --- |
| `fixedAssetMovements`, `recalculateDepreciation`, `frameFixedAssets` raccordés à des sources qualifiées | Livré | `fixed-asset-sources.ts`, `fixed-asset-review.ts` ; 16 tests métier ; atelier synthétique inchangé (70 tests `demo-cycles`) |
| Population actif / composant ; en cours, mis en service, sortis distingués ; actifs complexes exclus avec motif | Livré | Population `asset`, traitements `credit_bail`, `reevaluation`, `financier`, `devise`, `autre_complexe` |
| Brut, amortissements et dépréciations en ponts séparés ; VNC arithmétique | Livré | Invariants du schéma de résultat ; mention à l’écran et à l’export |
| Recalcul sur paramètres documentés et applicables ; aucune durée, seuil ou prorata implicite | Livré | Méthodes documentées (aucune par défaut) ; causes de blocage affichées |
| Changement de méthode → comparaison versionnée | Livré | `configure` retire le résultat ; avertissement ; comparaison serveur avant → après, y compris entre révisions |
| Recette 100 + 20 − 10 / 109, en cours, sortie partielle, résiduel incohérent, méthode absente, mise en service après clôture, écart −1 expliqué, source manquante bloquante | Livré | `docs/mission10/RECETTE.md` (matrice) |
| Chaîne durable (import → figé → exécution → revue distincte → verrouillage) | Code et tests runtime livrés ; **PostgreSQL non exécuté localement** | `fixed-asset-runtime.test.ts` (stockage de test) ; `fixed-asset-durable.integration.test.ts` écrit, ignoré sans base |
| Synthèse et export | Livré | `/immobilisations/synthese`, paquet diagnostic / approuvé |
| Interface | Livré | `/immobilisations` ; captures 1440 / 1024 / 390 + reduced-motion inspectées ; axe sans violation sérieuse / critique |
| Existence physique, perte de valeur, dépenses à immobiliser, méthodes non linéaires | Hors périmètre, affiché comme tel | Bandeau de périmètre, programme `outOfScope` |

Contrat métier : `docs/mission10/CONTRAT.md` ; validation et matrice : `docs/mission10/RECETTE.md`. Activation de recette : `PROBANT_FIXED_ASSETS_DURABLE=disposable` (refus si `VERCEL_ENV=production`), migration `0008_fixed_assets` à appliquer sur la base jetable.

**Maturité.** Démonstrable et testé localement sur données synthétiques ; chaîne durable prête pour la recette PostgreSQL de la CI ; **activation réelle bloquée** (pas d’infrastructure de recette exécutée, pas de QA métier indépendante, méthode interne non validée par un professionnel). Le produit n’est pas déclaré prêt globalement.

**Lot suivant.** Exécuter la CI (PostgreSQL 17 jetable) dès qu’un push est autorisé ; intégrer la Mission 08 dans `main` (renumérotation de migration, unions partagées) avant ou après ce lot. Mission 11 (capitaux propres) peut réutiliser le patron « sources qualifiées + résultat à invariants + runtime à port de stockage + harnais » ; le magasin de test `MemoryCashDatabase` est générique et réutilisé ici.

---

# Handoff — Mission 09 : Trésorerie, pont bancaire et apurement (2026-10-08)

**Base.** Branche locale `claude/tresorerie-pont-bancaire-5aa635`. Point de départ : `origin/codex/mission07-security` `fce26de` (= main `fdf1c12` + PR #58 Clients et ventes), fusionné localement (`cef6e0e`). Attention : **PR #58 a été fusionnée dans `codex/mission07-security`, pas dans `main`** ; production = `fdf1c12` (déploiement GitHub « Production » `success` du 2026-10-08 04:12 UTC, lu en lecture seule) et ne contient ni la Mission 07 ni ce lot. Aucun push, aucune PR distante, aucun déploiement, aucune variable distante modifiée.

**Mission 08 en parallèle (Codex).** Fichiers partagés susceptibles de conflit : `lib/workpapers/{model,service,selection,imports,cycle-context}.ts`, `.env.example`, `drizzle/migration-manifest.json` et le numéro de migration `0007` (renuméroter le second lot fusionné), liens de `app/dashboard/synthese/page.tsx` et `SyntheticSummary.tsx`. Les hunks Trésorerie sont additifs (unions `realAdapter`, `Population.unit = "account"`, `CycleContext.procedure`, champ `cashWork`) ; la chaîne durable Trésorerie utilise ses propres tables `cash_*` et ne touche ni `clients_*` ni le runtime Clients.

| Point | État | Preuve |
| --- | --- | --- |
| `reconcileCash` / `clearCash` sur sources qualifiées | Livré | `cash-sources.ts`, `cash-reconciliation.ts` ; 19 tests métier, moteur historique inchangé (8 tests) |
| Population des comptes, banque / compte / devise, nature, conventions de signe | Livré | Exclusions motivées caisse, VMP, devise ; identité lue par document ; refus « mauvaise banque » avec localisateur |
| Écarts de source distincts de l’écart du pont ; clôture jamais réécrite | Livré | Invariants du schéma de résultat, tests avant / après apurement |
| Fenêtre, règlements, allocations, corrections, exclusions | Livré | Statuts apuré / partiel / ouvert / corrigé / non testé / non expliqué, sens textuel |
| Chaîne durable (import → figé → exécution → revue distincte → verrouillage) | Code et tests runtime livrés ; **PostgreSQL non exécuté localement** | `cash-runtime.test.ts` (runtime réel, stockage de test) ; `cash-durable.integration.test.ts` écrit, ignoré sans base |
| Synthèse et export | Livré | `/tresorerie/synthese`, paquet diagnostic / approuvé, 5 tests + Chromium |
| Interface | Livré | `/tresorerie` ; captures 1440 / 1024 / 390 + reduced-motion inspectées ; axe sans violation sérieuse / critique |
| Caisse, VMP, devises, confirmations bancaires | Hors périmètre, affiché comme tel | Bandeau de périmètre, programme `outOfScope` |

Validation et matrice détaillée : `docs/mission09/RECETTE.md` ; contrat métier : `docs/mission09/CONTRAT.md`. Activation de recette : `PROBANT_CASH_DURABLE=disposable` (refus si `VERCEL_ENV=production`), migration `0007_cash_reconciliation` à appliquer sur la base jetable.

**Maturité.** Démonstrable et testé localement sur données synthétiques ; chaîne durable prête pour la recette PostgreSQL de la CI ; **activation réelle bloquée** (pas d’infrastructure de recette exécutée, pas de QA métier indépendante, méthode interne non validée par un professionnel).

**Lot suivant.** Exécuter la CI (PostgreSQL 17 jetable) dès qu’un push est autorisé ; fusionner d’abord `codex/mission07-security` dans `main` puis rebaser ce lot et la Mission 08 (renumérotation de migration) ; Mission 10 (immobilisations) peut réutiliser le patron « port de stockage + runtime + harnais » de ce lot.

---

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

