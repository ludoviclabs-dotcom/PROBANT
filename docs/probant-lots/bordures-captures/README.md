# Lot transversal « bordures » — captures et relevés avant / après (Chromium, build de production)

Produits le 13/10/2026 par `e2e/bordures-stratifiees.spec.ts` sous Playwright, contre le build de production servi par `next start` (`PROBANT_DEMONSTRATION_ENABLED=true`, données synthétiques DEMO SA). Format JPEG qualité 70 (captures longues recompressées à 50 après coup pour limiter le poids du dépôt). Aucune image générée.

- `avant/` : build de production de `main` `f846424` (règle `* { border-color }` hors couche), spec exécuté avec `BORDURES_PHASE=avant` (relevé seul, sans assertion de preuve).
- `apres/` : build de production de ce lot, spec exécuté avec ses assertions.
- `avant-simule/` : **simulation** — sur le build corrigé, la règle non stratifiée est réinjectée dans la page (`addStyleTag`) pour reproduire l'ancienne cascade au même cadrage que les captures longues « après ». Différence avec le vrai « avant » : les trois styles inline posés par C02 ont été retirés, donc l'accent de l'action prioritaire et l'ambre de la feuille bloquée n'y figurent pas.

## Fichiers

| Fichier | Contenu |
|---|---|
| `<vue>-<largeur>.jpg` | Vue au chargement, fenêtre 900 px de haut (identique avant / après). |
| `<vue>-<largeur>-long.jpg` | Même vue, fenêtre dépliée à la hauteur du contenu (plafond 4 000 px) : la zone principale défile dans son cadre, une capture « page entière » à 900 px ne montre que la ligne de flottaison. |
| `<vue>-<largeur>.json` | Relevé : chaque élément visible portant une classe de bordure colorée (`border-[#…]`, `border-[var(--pb-accent)]`, `border-amber-500/40`, …, variantes `hover:`/`focus:` exclues) avec ses largeurs et couleurs calculées ; `stillDefault` = nombre d'entre eux dont toutes les faces visibles restent à `--pb-border` (classe ignorée) ; dette axe « serious / critical » du document ; largeur de défilement. |
| `synthese-action-prioritaire-<largeur>.{jpg,json}` | Sonde C02 : `borderLeftColor` de la section « Action prioritaire » et attribut `style`. |
| `tests-bloque-<largeur>.{jpg,json}` | Sonde C02 : feuille Trésorerie bloquée (pièce manquante) dans le laboratoire, `borderLeftColor` / `borderTopColor` et attribut `style`. |

Vues : `synthese`, `tests`, `risques`, `cloisons`, `depot`, `dossier`, `fiscalite`, `normatif`, `normatif-cycle` (achats-charges-externes), `normatif-sources`, `onboarding` ; largeurs 1440, 1024, 390.

## Lecture

- Avant : `stillDefault` = nombre d'éléments relevés sur toutes les vues (la classe est ignorée partout) ; seules les sondes C02 portent l'accent et l'ambre, par style inline.
- Après : `stillDefault` = 0 partout ; les sondes portent les mêmes couleurs, sans attribut `style`.
- `onboarding-390` : largeur de défilement 448 px avant comme après (débordement préexistant, hors périmètre, non aggravé).
- `apres/fiscalite-390.json` a été relevé une seconde fois seul : la première passe (trois workers) l'avait mesuré avant le rendu de la pastille du bandeau (0 élément au lieu de 1).
