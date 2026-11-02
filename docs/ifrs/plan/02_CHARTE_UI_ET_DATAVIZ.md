# Charte graphique et grammaire d’interaction

Direction : un poste de travail financier sobre, moderne et investigable ; pas une grille de cartes de chiffres. Le vocabulaire et la mise en page prolongent la charte PROBANT existante.

## 1. Tokens de référence réellement présents

À réutiliser depuis `app/globals.css`, sans recopier des valeurs dans chaque composant. Si les tokens ont changé avant exécution, relever l’écart et préserver la charte courante.

| Rôle | Token actuel | Valeur observée |
|---|---|---|
| Fond graphite | `--pb-bg` | `#0a0e14` |
| Surface principale | `--pb-surface` | `#111722` |
| Surface secondaire | `--pb-surface-2` | `#161d2b` |
| Séparateurs | `--pb-border` | `#243044` |
| Texte principal | `--pb-text` | `#e6edf6` |
| Texte secondaire | `--pb-text-muted` | `#8a99af` |
| Accent d’action bleu | `--pb-accent` | `#5b9dff` |
| Méthode / nuance violette | `--pb-methodology` | `#a78bfa` |
| Avertissement | `--pb-warn` | `#f59e0b` |
| État positif | `--pb-ok` | `#22c55e` |

Inter pour l’interface ; JetBrains Mono pour identifiants, taux, versions et traces ; chiffres tabulaires alignés à droite. Hiérarchie proposée : titre 24–28 px, titre de section 18–20 px, texte 14–16 px, métadonnées 12–13 px. Pas de texte métier essentiel en 10 px. Ajuster après mesure du rendu.

Les nouvelles couleurs de séries sont des tokens locaux explicites : dette bleu, ROU violet, paiements cyan ; ajouter aussi styles de ligne et libellés. Vert = contrôle ou revue accompli, jamais « conforme à toutes les IFRS ». Rouge = blocage identifié ; une variation négative normale n’est pas une anomalie rouge. Tester les contrastes ; la présence de tokens ne démontre pas l’accessibilité.

## 2. Disposition commune

| Zone | Contenu | Comportement |
|---|---|---|
| Bandeau de contexte | Entité, exercice/période, référentiel/édition, mode, version active, statut de fraîcheur | Toujours identifiable ; ne pas confondre dossier démo et réel |
| Rail de parcours | Travail à faire, étape courante, étapes bloquées et nombre d’exceptions | Navigation libre vers les étapes déjà accessibles, pas de faux pourcentage de conformité |
| Espace central | Une visualisation principale et une table de travail reliée | La sélection et les filtres sont synchronisés ; périmètre affiché |
| Inspecteur latéral | Sources, hypothèses, règle, calcul et décision pour l’objet sélectionné | Panneau persistant sur grand écran, tiroir sur largeur réduite |
| Barre d’action contextualisée | Enregistrer, exécuter, soumettre/revoir, exporter selon état réel | Pas d’action de validation active sur données manquantes ou périmées |

1440 px : panneau de détail 360–420 px si lisibilité du centre conservée. 1024 px : inspecteur en tiroir. 390 px : sections empilées et vue synthétique du graphique ; table dans un défilement local annoncé et focalisable, jamais de débordement horizontal du document entier. Reprendre le comportement corrigé par PR #80 et #87, pas un deuxième système de tiroirs.

Les termes `navigation`, `filtre`, `sélection de lignes`, `périmètre d’exécution` et `version revue` désignent cinq choses différentes. Le contexte fixé ne change pas à l’ouverture d’un détail.

## 3. Grammaire visuelle IFRS 16

- **Matrice de complétude** : lignes = contrats, colonnes = pièces / qualification / durée / taux / échéancier / cadrage / revue. Cellules étiquetées, cliquables ; manquant, non applicable et confirmé distincts. Le statut agrégé n’est pas une moyenne qui masque un champ bloquant.
- **Frise contractuelle** : commencement, mensualités, fin, options examinées. Les options sont distinguées entre présentes, retenues et non retenues ; pas de prolongation automatique au glisser-déposer.
- **Courbes coordonnées** : dette et ROU net par période ; info-bulle accessible et détail tabulaire. Même devise et même population ; séries partielles marquées comme telles.
- **Barres de paiements** : principal et intérêts ; les loyers cash ne se confondent pas avec les charges de période.
- **Pont de variation** : ouverture, entrées, intérêts, paiements, clôture. Montrer séparément dette et ROU ; ne jamais mélanger leurs mouvements dans un seul total.
- **Comparaison de versions** : montant antérieur, montant courant, delta et causes factuelles. Pas d’attribution causale additive inventée si plusieurs paramètres changent simultanément.

Exemple d’investigation : cliquer une cellule « taux non justifié » filtre les contrats ; cliquer le contrat ouvre les termes ; cliquer l’hypothèse ouvre la preuve exacte. Le bouton de retour restaure filtres, sélection et position.

## 4. Grammaire visuelle IFRS 18

- **Matrice de classement** : nature économique × catégorie IFRS 18, nombres de lignes et montants. Chaque cellule donne accès aux lignes ; afficher la population non classée à part.
- **Compte de résultat vivant** : lignes et sous-totaux stables, N/N-1, montants signés ; clic sur une rubrique = composition et sources. Ce n’est pas un éditeur libre de montants.
- **Pont IAS 1 → IFRS 18** : tableau de réconciliation par rubrique, compositions liées et surbrillance de redistribution. Pas de Sankey en V1. Une extension ultérieure devrait traiter les signes sans largeur négative ni solde net masquant des montants opposés.
- **Pont MPM** : cascade du sous-total IFRS comparable vers la mesure de direction, éléments signés, effets fiscaux et preuve ; une MPM ne remplace pas le résultat dans le compte de résultat.
- **Comparatifs et révisions** : changements de présentation distincts des changements de valeur ; filtres N/N-1 cohérents ; un manque de comparatif n’est pas une variation égale au montant N.

La vue de traçabilité est **bornée à l’objet sélectionné**, de type montant → lignes contributrices → documents. Pas de graphe global de centaines de milliers de nœuds. Aucun besoin de 3D pour ce scope.

## 5. Interactions et motion design

- Sélection liée entre graphique/table/inspecteur ; un filtre local est réversible, visible et réinitialisable. Les filtres partagés peuvent être encodés dans l’URL sans données sensibles ni contenu de pièces.
- Sauvegarde explicite pour les jugements et mappings ; retour de succès lié à une version serveur. État sale et avertissement de navigation ; conflit = choix explicite après rechargement, pas écrasement automatique.
- Transitions courtes de 120–180 ms pour ouverture, focus et changement de sélection ; chiffres statiques dès la valeur reçue. Pas de compteurs animés donnant l’impression d’un montant recalculé en continu.
- Chargement avec squelette de géométrie stable ; progression fondée sur des lots réellement traités. Erreur exploitable avec cause et action possible ; pas de spinner infini.
- Un scénario synthétique reste étiqueté `simulation non revue`. La comparaison de versions exécutées est incluse ; le simulateur paramétrique interactif est hors V1. Comparer ne remplace ni l’exécution officielle ni les hypothèses approuvées.
- Respecter `prefers-reduced-motion` et supprimer les animations non indispensables. Aucune information uniquement au survol, à la couleur ou au glisser-déposer.

## 6. Microcopie obligatoire

Employer : « calculable sur ce périmètre », « données à compléter », « classement proposé », « source remplacée », « à réexaminer », « retraitement sélectionné », « relecture personnelle », « export diagnostic ».

Éviter : « conforme IFRS », « conversion terminée » pour un pont partiel, « corrigé » pour une simple proposition, « 100 % couvert » sans dénominateur, « aucune MPM » sans population de communications examinée, « aucune incidence fiscale » faute de calcul fiscal.

## 7. États à dessiner et vérifier

Vide initial ; import en traitement ; import rejeté ; données partiellement qualifiées ; calcul bloqué ; résultat déterminé ; périmètre partiel ; aucune ligne après filtre ; calcul long ; reprise après arrêt ; conflit de version ; source remplacée ; revue personnelle ; version verrouillée ; export diagnostic ; export revu ; échec d’export. Chaque état doit avoir un texte de cause et, si possible, une prochaine action.

Recette : captures des états réels à 390/1024/1440 px, parcours clavier, ordre de focus, fermeture et restitution du focus des tiroirs, contraste, zoom 200 %, mouvement réduit et alternative tabulaire de chaque graphique. Vérifier les longues références, montants négatifs, valeurs très élevées, libellés de 120 caractères et taux à plusieurs décimales. Un outil automatisé ne suffit pas à déclarer une conformité d’accessibilité exhaustive.
