# Recette visuelle Mission 12 — 2026-10-08

Route inspectée : http://127.0.0.1:3212/participations?demo=1 ; build Next final, données exclusivement synthétiques. Interface reliée à la Synthèse. Aucun Figma ou raster cible fourni ; aucune revendication de copie 1:1. Identité et composants du parcours Equity existant réutilisés, CSS partagé inchangé.

## Preuves réelles

| Fichier | Dimensions / état |
| --- | --- |
| 1440-detail.jpg | 1440 × 1000, tableau et détail Orion, build final |
| 1024-detail.jpg | 1024 × 1000, ordinateur compact, build final |
| 390-tableau.jpg | 390 × 844, émulation mobile/tactile, build final |
| 390-tableau-defilant.jpg | 390 × 844, colonnes de droite, avant l’ajustement des libellés |
| 1440-libelle-long-avant.jpg | 1440 × 1000, défaut initial de compression des colonnes |
| 1440-libelle-long.jpg | 1440 × 1000, défaut corrigé, disclosure Libellé complet |
| 1440-reduced-motion.jpg | 1440 × 1000, build final, préférence reduce réellement active |
| 1440-scenarios-versions.jpg | 1440 × 1000, scénarios dans le panneau, avant ajustement visuel |
| 1440-vide.jpg | 1440 × 1000, aucune feuille de recette |
| 1440-erreur-session.jpg | 1440 × 1000, session absente/expirée, rechargement et connexion proposés |

Captures Chrome du code exécuté, aucune image générée. Densité 1 pour les captures finales. Les premières captures desktop utilisaient resize_page ; les finales utilisent une émulation explicite pour garantir la taille, notamment 390 px (la fenêtre Windows a un minimum de 500 px).

## Contrôles

- Orion : droit attendu 10, produit 9, écart −1 ; coût 100, dépréciation 10, base nette 90. Encaissement du 2025-01-12 séparé du GL du 2024-12-31.
- Atlas : allocation préférentielle documentée 12 ; Vega/Nova : non comparable et non concluant ; Lyra : source requise et non concluant.
- Scénarios 70/85/120 et différences v1 110 → v2 85 visibles ; aucune sélection favorable automatique ; décision comptable requise.
- Tri inversé : Vega en première ligne ; filtre Source requise : seule Lyra. Recherche sans correspondance : 0 distributions affichées, dénominateur conservé à 10, message explicite.
- ArrowRight passe de Tests à Exceptions ; Home retourne Population. Escape restitue le bouton Orion et le contexte du tableau : défilement horizontal 604 px conservé lors du contrôle initial, retour à la position d’ouverture 790 px.
- Libellé de 687 caractères : le défaut initial comprimait la colonne Droits. Correction : colonnes fixes [210,170,125,115,125,145,170], titre limité visuellement à trois lignes et libellé complet disponible dans un disclosure. Tab atteint Libellé complet ; Enter l’ouvre et le referme, texte de 687 caractères conservé.
- Largeurs finales : document 1430 px pour viewport 1440 ; 1014 pour 1024 ; 390 pour 390. Tableau 1060 px dans conteneurs 978/659/356 px ; défilement horizontal conservé, aucune colonne retirée. Panneau sous le tableau sur mobile.
- Reduced-motion : contrôle Chrome headless jetable séparé via son protocole natif local, sans Playwright ni changement des préférences utilisateur. reduced-motion.json : matchMedia true, animationName none, durée effective 0.001 ms, cinq distributions et scénarios accessibles. Script reproductible scripts/mission12-motion-qa.mjs, Chrome jetable exposé uniquement sur 127.0.0.1:9227 ; processus fermé après contrôle.
- Diagnostic HTML : réponse 200, text/html ; présence des scénarios, dates originales, non-concluant et indication Originaux absents / sans signature.
- Console : aucune erreur JavaScript de la page constatée. Message navigateur CSP préexistant : upgrade-insecure-requests ignoré en report-only. Les réponses de refus de session ne constituent pas une panne du calcul.

## Évaluation visuelle

Typographie : Inter existante, hiérarchie conservée, montants tabulaires avec signes et EUR ; libellés longs désormais lisibles sans déformer le tableau. Espacement : contexte/nav/tableau/panneau, surfaces sobres, défilement dense intentionnel. Couleurs : graphite et bleu PROBANT, badges textuels ; échantillons de contraste sur fond principal 16.39:1 (texte), 8.88:1 (secondaire), 13.59:1 (badge). Ceci n’est pas un audit exhaustif d’accessibilité. Images : aucune nouvelle image décorative ; captures sans montage. Contenu : attendu/enregistré/encaissement et coût/net distincts, état non concluant explicite, traces lisibles hors JSON.

Résultat de la recette locale : réussi après correction du défaut de libellé. Revue authentifiée, sauvegarde/conflit et permissions intégrés au navigateur réel non exécutés sur PostgreSQL ; les trois tests d’interface utilisent une session/réponse serveur simulée. Maturité durable et usage réel ne sont pas déduits de cette recette.
