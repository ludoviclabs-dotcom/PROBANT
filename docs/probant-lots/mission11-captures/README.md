# Preuves de recette — Mission 11

Captures réelles de Chrome sur le build local Next, données exclusivement synthétiques. La démonstration ne sauvegarde ni n’approuve une mission réelle. Les vues de travail ont été inspectées à 1440 × 900, 1024 × 900 et 390 × 900 CSS px, densité 1. Le défilement de la page laisse 1430/1014 px de contenu sur ordinateur ; les tables denses conservent leur propre défilement horizontal.

- `1440-decisions-pv.jpg`, `1024-decisions-pv.jpg`, `390-decisions-pv-reduced.jpg` : décision DIST, filtre Montant divergent, véritable page 1 du PDF synthétique téléchargée et rendue. Vote 30, comptabilisation 25, différence −5, règlement 25 ultérieur.
- `390-cartographie-incomplete.jpg` : capital/réserves incomplets, total non concluant.
- `390-libelle-long.jpg` : libellé long importé depuis le CSV de recette.
- `390-sans-resultat.jpg`, `390-vide.jpg`, `390-erreur.jpg` : recherche sans résultat, feuille non préparée, session absente.
- `390-synthese.jpg` : compteurs depuis 1 procédure / 4 contrôles.
- `1440-export-imprimable.jpg`, `diagnostic.html`, `diagnostic-impression.pdf` : diagnostic de la même version, imprimé dans Chrome sur 12 pages. Ce PDF est une preuve de recette de l’impression HTML ; il ne certifie ni la conservation ni le paquet approuvé.
- `1440-reference-atelier.jpg` : écran PROBANT existant, atelier Capitaux propres exécuté en exception. Référence du vocabulaire et des états, pas maquette à recopier ni procédure de mission.
- `1440-design-comparison.jpg` : comparaison côte à côte des deux captures réelles, extension du parcours et direction du socle explicites.
- `browser-qa.json` : observations de la recette du build final. Escape restitue le focus DIST et la position 936 px ; animation désactivée avec reduced-motion ; aucune erreur JavaScript observée. Le lien vers `/equity/synthesis` depuis la Synthèse principale est présent après rendu. Les liens distincts de décision, mouvement et composante ouvrent leur point attendu.

Les scénarios de commandes et sauvegarde durables, conflit serveur, revue réelle et reprise PostgreSQL n’ont pas été exécutés dans le navigateur. Ils dépendent de l’infrastructure et des identités de recette décrites dans le handoff ; les tests natifs correspondants restent ignorés.
