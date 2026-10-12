# PROBANT — Mission C00 : version locale de travail

**Date : 13 octobre 2026 (Europe/Paris).** Les constats distants initiaux ont commencé le 12 octobre ; les essais et l'inspection finale ont été poursuivis après minuit.

**Résultat : les quatre familles de correctifs M20 sont intégrées et vérifiées localement.** Le chantier indépendant `mission-c00`, branche `codex/c00-integration`, part de `main` au SHA `ab8f991e65b0ad93e6f9a21281010b680c868466`. Le **code effectivement compilé et vérifié** est `b03072a33c39f0710ec4770fff713f453a031d26`. Le manifeste de livraison externe identifie aussi le SHA final incluant ce rapport. Aucune fusion, publication GitHub, PR distante ou opération de déploiement n'a été réalisée.

## Matrice demandée

| Correctif | Existant retrouvé | Intégré C00 | Reproduit sur la base puis contrôlé | Encore absent |
|---|---|---|---|---|
| Clients / identifiants longs | Oui, diff et checkout M20 | Oui : `ClientFramingWorkspace`, `WorkpaperPanel` | Pièces et identifiants source complets : largeur 650 px pour fenêtre 390 px avant, 390 px après | Aucun correctif C00 manquant |
| Programme de 128 procédures | Oui, CSS et régression M20 | Oui : limites de grille et défilement propre des bandes | 903 px pour 390 ; 1247 px pour 1024 avant. Après : 390 et 1024. Panneau et clavier contrôlés | Aucun correctif C00 manquant |
| Contraste global et couleurs locales | Oui, partiel : token et couleurs M20 ; trois compléments C00 nécessaires | Oui : M20 + accueil, libellés Risques et index Référentiel | Défauts serious avant ; une première intégration M20 laisse 4 états historiques en échec ; zéro serious/critical après complément sur 24 états historiques + 9 états Clients/programme/détail | Aucun défaut serious/critical dans les états contrôlés ; aucune affirmation exhaustive sur tous les états du produit |
| Adaptateur fast-glob / Next sur Windows | Oui, code et régressions existantes | Oui : résolution depuis le volume, résultat absolu/relatif conservé | 3 échecs sur 7 avant, 7/7 après ; consommateur réel Next et règle de liens internes actifs | Aucun correctif C00 manquant |
| « Modifications non sauvegardées » | Aucun correctif M20 ; incident M20-UI-03 déclaré ouvert | Non, réservé à C02 | Libellé initial encore visible dans les captures de la version verrouillée | Oui, traitement C02 restant |

## Causes et changements

Les identifiants de source ne pouvaient pas couper une ligne dans les conteneurs Clients et Feuilles de travail. `min-w-0` et `overflow-wrap:anywhere` limitent leur largeur sans tronquer les identifiants ni cacher les tables.

Le minimum intrinsèque des cellules d'indicateur et des enfants de grille laissait les 127 segments applicables du programme étendre la page. Le correctif borne ces enfants et donne aux bandes leur propre défilement. Les tables et la carte de couverture gardent leurs conteneurs défilants ; la flèche clavier produit un défilement effectif lorsque la carte dépasse son conteneur. Le panneau s'ouvre sur P-219 et Échap rend le focus au déclencheur.

Le token `--pb-text-faint` et plusieurs couleurs locales étaient trop sombres ; l'opacité du libellé de durée réduisait encore le contraste. Le token passe à `#9aabc3`, les couleurs locales concernées s'y rattachent et l'opacité fautive est retirée. La première intégration exacte du diff M20 passe 15 tests sur 16, mais révèle quatre états historiques encore en échec. Trois corrections C00 complètent donc M20 : footer de l'accueil et titre de l'index Référentiel rattachés au token, libellé de criticité Risques utilisant la couleur lisible déjà calculée par `compositeTextColor` pour le chiffre voisin. Le libellé gris avait notamment un ratio axe 2,06 sur fond composite `#9c4e1b` ; l'index était à 3,57. Aucune couleur sémantique de fond ni aucun score n'est modifié. Graphite, accent et effets utiles sont conservés. Les captures ont été inspectées aux trois largeurs ; les états transitoires sont stabilisés avant axe.

Sur Windows, tinyglobby ne retrouvait pas certains motifs qualifiés par lecteur ou remontant hors du dossier courant. L'adaptateur existant résout ces motifs depuis la racine du volume, puis restitue la forme attendue. API, limite de 4096 caractères, imbrication de 64 niveaux, refus des NUL/négations/options étrangères et dépendance tinyglobby restent inchangés. Aucun moteur comptable, store, règle fiscale, montant, contrat métier ou migration n'est modifié. La relecture React du diff confirme que les changements sont limités aux classes et couleurs : aucun hook, calcul comptable ou flux réseau n'est ajouté dans React.

## Résultats exécutés pour C00

| Contrôle | Résultat neuf | Preuve |
|---|---|---|
| Adaptateur et consommateur Windows | 7 passés, 0 échec, 0 ignoré | `after-final/dependency.json`, `after-final/dependency.log` ; comparaison `before/dependency.json` |
| Compilation locale Next | Réussie, 180 pages statiques ; types et lint du build acceptés | `after-final/build.log`, `after-final/server.json` (BUILD_ID et PID propre) |
| Lint complet indépendant | 0 erreur, 7 avertissements préexistants | `after-final/lint.log`, `after-final/static-exits.json` |
| Types indépendants | Code 0 | `after-final/typecheck.log`, `after-final/static-exits.json` |
| Navigateur local / régressions sélectionnées | 16 passés, 0 échec, 0 ignoré, 0 flaky | `after-final/browser.json`, `after-final/browser.log`, `after-final/exit.json` |
| Contraste strict stabilisé | 33 états : 24 pages/largeurs historiques, 3 Clients, 3 programmes, 3 panneaux ; zéro serious/critical | `after-final/historical-axe.json`, fichiers `clients-*.json` et `programme-*.json` |
| Préservation M20 | 111 empreintes identiques ; état Git initial identique | `m20-preservation.json`, `RESULTS.json` |
| Connectivité Git locale | Code 0, limite d'historique source rétablie | `git-connectivity-repaired.log` |

Les cas existants relancés couvrent mission Clients, version exacte, export HTML, accusé de sauvegarde, focus, allocations, refus et expiration, dossier incomplet, pièces, contradictions, clôture refusée, journal, chargement retardé, erreur 503 et récupération. Les résultats historiques M20 (1514 unitaires, 48 PostgreSQL, 102 navigateurs) ne sont **pas** présentés comme exécutés pour C00.

Les premiers essais sont conservés : configuration de test corrigée après une option non supportée ; fixture Clients d'abord sans pièces liées ; sélecteur initial captant un texte JSON caché ; fermeture automatique du serveur Playwright bloquée sous Windows. Le cas de référence UI avant correction est `before-final/` (2 succès et 5 échecs attendus), avec les mêmes assertions finales que `after-final/`. La première intégration `after/` (15 succès et un échec de contraste) et `contrast-investigation/` restent consultables. Les autres logs servent à la traçabilité et ne sont pas additionnés comme des succès. Les assertions de largeur et de contraste n'ont pas été assouplies.

## Mesures avant / après

Largeur globale du document, en pixels ; fenêtres 390/1024/1440 × 900. Les débordements internes des tables restent permis et contrôlés.

| État | Fenêtre | Avant | Après |
|---|---:|---:|---:|
| clients | 390 | 650 | 390 |
| programme | 390 | 903 | 390 |
| programme-detail | 390 | 903 | 390 |
| clients | 1024 | 1024 | 1024 |
| programme | 1024 | 1247 | 1024 |
| programme-detail | 1024 | 1247 | 1024 |
| clients | 1440 | 1440 | 1440 |
| programme | 1440 | 1440 | 1440 |
| programme-detail | 1440 | 1440 | 1440 |

À 1440 px, le programme initial restait dans la fenêtre ; les segments des indicateurs ne disposaient toutefois pas de leur propre conteneur défilant. La régression vérifie désormais celui-ci en plus de la largeur globale. Les captures sont réelles, issues du navigateur ; aucun visuel généré n'est utilisé comme preuve.

## Sources et limites

Pack local **M20 / `PROBANT-M20-RECETTE.zip`**, rapport `PROBANT-MISSION-20-RAPPORT-COMPLET.md`, daté du **10/10/2026**, sections 1, 2 et 4 (Markdown sans pagination) ; diff `MISSION20-review.diff` ; preuves `docs/recette/mission20/EVIDENCE.md`, `HANDOFF.md`, `versions.json`. Présence, chemins et empreintes sont consignés dans [inventory.json](inventory.json). Les neuf fichiers fonctionnels intégrés sont identiques, après normalisation des fins de ligne, au correctif M20 retrouvé. La méthode complète et les commandes sont dans [METHOD.md](METHOD.md).

La nouvelle inspection GitHub et Vercel demeure en lecture seule : `main` et l'alias `probant.vercel.app` correspondent encore à `ab8f991e65b0ad93e6f9a21281010b680c868466`, déploiement `dpl_DeA6RJ2H6c4hwq3cir2eumrXqdy1`, READY. Ils ne servent pas le code C00 vérifié. Voir [remote-inspection-final.json](remote-inspection-final.json). Cette métadonnée ne constitue pas une recette fonctionnelle distante.

La présentation Clients/dossier utilise les fixtures, moteurs et handlers existants, avec HTTP explicitement intercepté. Elle ne démontre pas une persistance PostgreSQL, un échange d'identité réel ou l'usage de dossiers réels. Aucun paramètre, migration ni script d'infrastructure M20 n'est rejoué. Le scénario de seconde identité est une simulation. La persistance, le FEC distant et le lecteur d'écran réel restent **NON VÉRIFIÉS PAR C00**. Le libellé C02 reste ouvert. Aucun nouveau calcul ou règle française ne nécessite de nouvelle source officielle dans ce lot.

Pour le lot suivant, partir du checkout `mission-c00` / `codex/c00-integration`, relever son HEAD et son état Git, puis relire AGENTS.md et ce rapport. Ne pas repartir de `main` en perdant les correctifs locaux.
