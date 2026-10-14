# Mission C06 — descriptif de PR prêt à examiner

Titre : Immobilisations — fin de plan d’amortissement : base restante, cumul antérieur et état du plan (règle 1.1.0, C06)

Base : `main` `e9f8b6d`.

`recalculateDepreciation` recevait coût, résiduel, durée et prorata, sans le cumul d’amortissement antérieur : il plafonnait la dotation au montant amortissable total. Exécutée sur la recette de ce lot, la fonction 1.0.0 recalcule 2 400 € pour un actif de 12 000 € amorti sur 60 mois dont le cumul d’ouverture atteint déjà 12 000 € (plan échu) : une dotation passée par erreur ne produisait aucun écart. Elle recalculait aussi 2 400 € au lieu de 1 200 € pour une dernière annuité saisie à 12/12, et ne détectait ni un cumul supérieur au montant amortissable, ni un plan révisé, ni une base modifiée par une dépréciation.

Le recalcul lit désormais le cumul d’ouverture du tableau Amortissements du registre (ligne sourcée ; absent = inconnu, jamais zéro) et situe le plan : début à la mise en service, fin = début + durée − 1 jour. La dotation attendue d’un plan linéaire d’origine inchangé vaut min(annuité, montant amortissable restant), 0 si le plan est échu avant l’ouverture (PCG art. 214-4, 214-12, 214-13). Les incohérences du cumul deviennent une exception distincte (`PLAN_ACCUMULATED_INCONSISTENT`). Les plans révisés (colonne facultative « début de segment »), les actifs dépréciés (art. 214-14, 214-17), les entrées sur un actif déjà inscrit et les cumuls absents sont isolés avec leur motif, sans confondre base restante et VNC. Les trois tableaux, leur cadrage GL et la VNC sont inchangés ; aucun seuil de 500 € ni durée par défaut.

Le résultat passe en `fixed-assets-result-2` (état du plan, segment, cumul et sa preuve, restant, annuité, plafond) ; règle, gabarit et programme passent en 1.1.0. Les feuilles 1.0.0 restent consultables, sont marquées périmées dans la synthèse ; toute commande autre que la révision (exécution, conclusion, soumission, revue, verrouillage) est refusée, une révision adopte le gabarit 1.1.0, et chaque contrôle de la synthèse porte la version de règle réellement appliquée (`WorkpaperService.revise`, garde de création alignée sur la version du gabarit). Le panneau de détail affiche plan et segment, entrées, formule, plafond, dotation attendue et écart.

Sources : PCG consolidé au 01/01/2026 (S1, empreintes identiques au résolveur C04) et Recueil 2024, édition du dossier de recette (PDF ANC lu le 14/10/2026, mêmes articles, même texte). Articles, dates d’effet, choix internes et justification : `docs/mission10/CONTRAT.md` § C06.

Validation : `lib/workpapers/__tests__/fixed-asset-plan.test.ts` (attendus posés à la main ; actif neuf, déjà amorti à 100 %, dernière annuité partielle et plafonnée, résiduel positif, cumul invalide, début post-clôture, plan révisé sans base validée, dépréciation, composant, cession, refus du début de segment, passage 1.0.0 → 1.1.0 par le runtime) 15/15 ; suites Immobilisations 128/128 ; suite unitaire complète 1 651 réussis, 0 échec, 48 recettes PostgreSQL ignorées (non vérifiées) ; typecheck, lint, build ; `e2e/c06-fin-de-plan.spec.ts` à 1440, 1024 et 390 avec `fixed-assets`, `demo-journey` et `accessibility` 23/23 (captures `docs/probant-lots/c06-captures/`).

Limites : segments révisés et actifs dépréciés bloqués tant que leur base et leur cumul de début de segment ne sont pas au contrat ; cohérence du cumul contrôlée aux bornes du plan, pas au calendrier théorique ; recettes PostgreSQL et lecteur d’écran non vérifiés.

Aucun merge ni déploiement réalisés.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
