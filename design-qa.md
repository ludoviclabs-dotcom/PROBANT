# Design QA — Mission 11

Résultat : **passé pour l'extension visuelle et les parcours locaux contrôlés**. La chaîne durable réelle demeure non validée sur infrastructure jetable. Cette appréciation ne signifie ni conformité juridique, ni certification d'accessibilité, ni reproduction à l'identique d'une maquette.

## Référence et comparaison

La référence observée est l'atelier Capitaux propres de PROBANT, exécuté en exception : `docs/probant-lots/mission11-captures/1440-reference-atelier.jpg`. La comparaison de deux captures réelles est `1440-design-comparison.jpg`, inspectée à sa résolution originale. Le contenu du nouvel écran est un dossier de mission ; celui de la référence est pédagogique. Les différences de structure sont donc intentionnelles. La direction graphite/bleu sombre du socle commun prévaut sur les surfaces claires de l'ancien atelier.

La feuille `/equity` est reliée à la Synthèse principale par `/equity/synthesis`. Elle conserve le contexte dossier/période/version, cinq onglets métier, un tableau central et un panneau de preuve. Les montants sont signés, en EUR et en chiffres tabulaires. Aucun ratio ni statut revu ne devient un feu vert juridique.

## Vérifications visuelles

| Surface | Observation |
| --- | --- |
| Typographie | Police Inter existante, labels et valeurs lisibles, montants alignés |
| Structure | Variation horizontale, décisions filtrables, détail en frise, panneau du PV à la page citée |
| Couleurs | Graphite, texte clair, accent bleu ; états nommés en texte, couleurs sobres |
| Pièces | PDF synthétique réel rendu par PDF.js, index/version et page affichés ; aucune fausse capture |
| Texte | Vote, effet, comptabilisation et paiement séparés ; inconnu/partiel explicites ; originaux absents du paquet annoncés |

Vues inspectées : 1440 × 900, 1024 × 900 et 390 × 900 CSS px, densité 1. Tables denses défilantes horizontalement, aucune colonne financière critique masquée. Vérifications du libellé long, cartographie incomplète, vide, erreur de session, absence de résultat et Synthèse. Réduction des animations contrôlée à 390 px : animation `none`. Les seules animations de la feuille sont une expansion et une mise en évidence de mouvement de 180 ms.

## Corrections contrôlées

- Le navigateur refusait l'intégration du PDF en iframe : le rendu utilise désormais les octets autorisés via PDF.js, sans modifier la politique globale d'encadrement des pages.
- Les actions DIST et « Consulter la preuve » étaient trop proches : actions séparées et empilées, également utilisables au tactile.
- Le retour du panneau restitue le focus sur DIST et la position de défilement. Escape testé dans le navigateur : focus DIST, position 936 px avant/après.
- Police commune réutilisée et lien vers l'atelier existant corrigé.

Aucun défaut P0/P1/P2 restant observé dans cette recette locale. Les parcours serveur de sauvegarde, conflit, auto-approbation et reprise sont couverts par les tests natifs préparés mais non exécutés ici. Les états correspondants sont implémentés ; leur validation visuelle intégrée attend PostgreSQL et les identités de recette.

## Preuves et limites

Les captures et `browser-qa.json` sont dans `docs/probant-lots/mission11-captures/`. Le rapport décrit les observations du build final ; le HTML exporté et son impression sur 12 pages sont inclus. Liens décision/mouvement/composante contrôlés séparément. La console sans erreur concerne uniquement les routes et interactions parcourues. Les originaux PDF du dossier ne sont pas inclus dans le paquet exporté. Aucune affirmation de fidélité 1:1 à une maquette, d'archivage certifié ou de recette durable en mémoire.
