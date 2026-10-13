# Mission C02 — descriptif de PR prêt à examiner

Titre : Synthèse, Tests et laboratoire : espace professionnel raccordé à un registre de cycles ; état de sauvegarde exact

La Synthèse empilait onze paragraphes de liens vers les modules avant le verdict, et la page Tests ouvrait sur un bandeau ambre hors thème qui mélangeait entrée dans l'atelier, reprise de session et explications de méthode. Les deux écrans sont réorganisés : dossier, état des sources et action prioritaire d'abord, puis une liste continue des cycles générée depuis un registre unique (état, étendue, écarts, prochaine action ; exclusions, sources, accès et capacité par mode dans la ligne). Le laboratoire de scénarios devient un lanceur compact dans le thème graphite, actions Nouveau / Reprendre, volet « Mode et sauvegarde » accessible au clavier (focus, Échap) avec l'identifiant complet copiable ; l'ambre n'habille plus que les blocages.

Après fusion de `main` (PR #74, lots C00 et C01), les lignes de cycle (`lib/dossier/cycle-registry.ts`) sont projetées depuis le registre unique de capacités C01 (`lib/capabilities/registry.ts`) ; le module n'ajoute que la présentation (étendue, silos des constats historiques, libellés d'accès, limites héritées) et la projection d'un dossier (état, écarts, prochaine action). Les liens passent par `DossierContextLink` ; le panneau `CapabilityAccess` de C01 reste dans le volet « Méthode ». Aucun chiffre n'est recalculé dans React : les lignes consomment le résumé des feuilles et les constats du snapshot, sans somme entre catégories.

Incident M20-UI-03 corrigé : une feuille fraîchement chargée, verrouillée ou affichée en version exacte sans saisie n'est plus « non sauvegardée ». Le brouillon hydraté est comparé à sa base serveur (`lib/workpapers/draft-state.ts`) dans les feuilles Clients, Capitaux propres historique et Achats ; une vraie saisie, son annulation, l'accusé serveur et les conflits conservent leur libellé.

Validation : tests unitaires et de composants dédiés, typecheck, lint ; recette Playwright réelle sur le build de production aux largeurs 390, 1024 et 1440 (vide, dossier courant, scénario repris, erreur de reprise, chargement, identifiant long, programme long, réduction des animations), zéro débordement global, zéro violation axe « serious / critical » sur le contenu des vues modifiées. Captures avant / après dans `docs/probant-lots/c02-captures/`.

Limites : capacité « local persistant » affichée « configurée » dans la ligne de cycle sans vérification d'activation (lue par le panneau de capacités C01, C07) ; le chrome partagé (Sidebar, bandeau) garde la dette de contraste `--pb-text-faint` documentée, hors de ce lot ; recette PostgreSQL non exécutée localement (pas de base jetable sur ce poste). Aucun déploiement, aucune fusion.

La PR cible `main`. Aucun merge ni déploiement réalisés.
