# Captures C03 — assertions, tests suggérés et couverture

Prises par `e2e/c03-assertions.spec.ts` sur le build de production (données synthétiques DEMO SA, mode démonstration), 13 octobre 2026. Débordement horizontal global nul et axe-core strict (serious/critical = 0) vérifiés sur le contenu de chaque vue avant la capture.

| Fichier | Vue | Ce qu'elle prouve |
|---|---|---|
| `synthese-1440.jpg`, `synthese-1024.jpg`, `synthese-390.jpg` | `/dashboard/synthese`, vue au chargement | Décision « Couverture : Non qualifiée » dans le verdict ; dossier, sources et action prioritaire en tête. |
| `synthese-couverture-analyse-{1440,1024,390}.jpg` | carte « Couverture de l'analyse » | Écritures : population manquante ; contrôles : dénominateur non qualifié ; aucun pourcentage ni barre, la base du dénominateur est dite. |
| `synthese-couverture-travaux-{1440,1024,390}.jpg` | carte « Couverture des travaux » | Sans feuille exécutée : « non établie », aucune cellule réputée couverte. |
| `synthese-matrice-constats-{1440,1024,390}.jpg` | « Matrice des constats · cloison × assertion (NEP 500 §09) », pleine largeur | Colonnes = assertions NEP 500 présentes (plus « Non résolue » et « Conformité du fichier » si nécessaire) ; le constat qualitatif des titres compte en « Évaluation et imputation · solde » ; une cellule vide signifie « aucun constat ». |
| `tests-creance-litigieuse-{1440,1024,390}.jpg` | article « Créance litigieuse échue non dépréciée » | Objectif recouvrabilité, assertion « Évaluation et imputation · soldes », population 411/416/491, source PCG art. 214-17, revue de recouvrabilité documentée (NEP 501 §07-08), pas le test du 418. |
| `tests-procedure-a-definir-{1440,1024,390}.jpg` | article d'un signal analytique (honoraires) | Assertion non résolue, « Procédure à définir » sans étape inventée. |
| `tests-1440.jpg`, `tests-1024.jpg`, `tests-390.jpg` | `/dashboard/tests`, vue au chargement | Régime non renseigné et exercice rappelés ; une réponse par constat : créance litigieuse → revue de recouvrabilité (pas le 418), titres non dépréciés → dossier de valeur, date FEC hors format → localiser / corriger / revalider sans assertion ; « Procédure à définir » explicite. |
| `tests-examen-limite-1440.jpg`, `tests-examen-limite-1024.jpg`, `tests-examen-limite-390.jpg` | `/dashboard/tests`, régime « examen limité » | Les références passent à la NEP 2410 (§08, §17-18) avec la mention que les tests de détail ne sont pas requis ; le nombre de constats ne change pas. |

État « avant » : voir `../c02-captures/apres/synthese-dossier-courant-1440.jpg` (couverture « Substantielle » 0/0 et 24/24, matrice par effet financier) et `../c02-captures/apres/tests-vide-1440.jpg` (procédure par silo), produites sur la base `2c74e98`.
