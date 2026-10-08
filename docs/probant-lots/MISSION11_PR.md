# Mission 11 — proposition de PR locale

Titre : **Capitaux propres : dossier versionné de décisions, mouvements et preuves**

Une décision de distribution de 30 peut avoir une écriture de 25 et un paiement ultérieur distinct. La nouvelle feuille conserve ces trois faits, leurs dates et leurs pièces ; elle présente l’écart de −5 sans transformer la revue en opinion juridique. Le tableau de variation couvre les composantes déclarées au-delà du capital et conserve les deux jambes des transferts internes équilibrés.

Le parcours `/equity` relie imports approuvés, cartographie/convention, population et sélection figées, calcul `reviewEquity`, exceptions, jugement cité, revue distincte et verrouillage. `/equity/synthesis` restitue un programme fixe de quatre contrôles, les inconnus et les travaux périmés ; ses liens ouvrent la feuille à l’identité/version du point. Les exports existants fournissent diagnostic ou paquet approuvé, sources/version/localisateurs et index des originaux absents.

Le raccord serveur réutilise les sessions/permissions organisation-dossier, les transactions PostgreSQL, le contrôle de version et les reçus d’idempotence Clients. Seul l’adaptateur `equity.review` est ajouté. Le rôle et l’auteur ne proviennent pas des commandes du navigateur. Une source remplacée impose une révision ; l’ancienne décision reste conservée. Migration additive `0008_equity_dossier`, rollback refusé si des données Equity existent.

Validation locale : 107 suites réussies, 1 161 tests réussis ; 22 tests PostgreSQL ignorés, dont les 4 nouveaux scénarios Mission 11. Typecheck et build réussis. Lint : zéro erreur, sept avertissements préexistants. Manifeste de migrations vérifié. Le dépassement de délai d’un test Clients pendant le build parallèle a été levé par sa relance seule puis par la suite complète finale. Recette Chrome du build à 1440/1024/390 px, réduction des animations, PV à la page citée, focus/position au retour, libellé long, cartographie partielle, vide/erreur/aucun résultat, Synthèse et HTML imprimé sur 12 pages ; console sans erreur JavaScript. Captures et rapport sous `docs/probant-lots/mission11-captures/`.

Limites à conserver : aucune nouvelle règle juridique/comptable, EUR uniquement, période provisoire à corroborer, PDF indexé sans extraction automatique de décision, pièces originales absentes de l’export. Le PDF applicatif existant est limité à Latin-1 ; HTML/JSON conservent Unicode. Aucune assurance d’exhaustivité indépendante ni archivage certifié.

**Base locale :** `0c0b43186d7f9d3d2deadf24657e3508899b7ae6` (`codex/mission08-payables`). Branche : `codex/mission11-equity`. Ce diff porte uniquement Mission 11 au-dessus de cette base. `origin/main` observé : `fdf1c12e8c1240e891c86913908f3aefbe5f9720` ; les lots locaux précédents ne sont pas remplacés par main. Réconcilier cette chaîne et le main courant avant toute intégration distante.

Le parcours durable est désactivé par défaut et refusé en production Vercel. La démonstration locale est explicitement synthétique, en lecture seule. Aucun push, PR distante, merge, déploiement ni configuration distante effectués.
