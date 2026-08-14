# Rapport d'accessibilité — PR-08

| | |
|---|---|
| Date | 14/08/2026 |
| Base SHA | `efd62e8f770af9418ffa8ff672e6241f7b92b0e2` |
| Référentiel | WCAG 2.1 niveau AA |
| Outil | axe-core 4.13 · Chromium 1.62 · pages assemblées, pas composants isolés |

---

## 1. Synthèse

| Contrôle | Statut | Résultat |
|---|---|---|
| Violations **critiques** sur les 7 pages mesurées | **PASS** | **0** — une corrigée dans ce lot |
| Violations **sérieuses** | **FAIL** | `color-contrast` sur 5 pages · 64 nœuds au total |
| Non-régression outillée | **PASS** | Dette gelée par page et par règle en CI |
| Alternative tabulaire sous chaque graphique | **PASS** | PR-06, revérifié |
| `prefers-reduced-motion` | **PASS** | PR-06, non modifié par PR-08 |
| Boutons sans nom accessible | **PASS** | Aucun — testé sur la Synthèse |

---

## 2. Ce qui a changé de méthode

PR-06 exécutait axe-core sur des **composants isolés**, avec zéro violation.
PR-08 l'exécute sur les **pages assemblées et servies par un build de
production**. La différence n'est pas de degré : un composant conforme placé
dans une grille ARIA mal formée produit une violation critique que le test de
composant ne peut pas voir.

C'est exactement ce qui s'est produit.

---

## 3. Défaut critique corrigé

| Élément | Détail |
|---|---|
| Règle | `aria-required-children` |
| Impact | **critique** |
| Page | `/dashboard/risques` |
| Composant | `components/probant/risk/RiskMatrixHeatmap.tsx` |
| Cause | Un `role="row"` contenait un `<div>` intermédiaire **sans rôle**, lui-même porteur du `role="rowheader"`. Or un `role="row"` n'accepte que des `rowheader` / `columnheader` / `gridcell` comme enfants **directs**. |
| Conséquence pour l'utilisateur | La première colonne de la matrice thermique — le nom du cycle — n'était pas annoncée comme en-tête de ligne. Un lecteur d'écran énonçait des scores sans dire de quel cycle il s'agissait. |
| Correction | `role="rowheader"` déplacé du bouton vers le conteneur direct de la ligne |
| Vérification | `/dashboard/risques` passe désormais sans aucune violation, critique ou sérieuse |

---

## 4. Défaut ouvert — contraste

**Statut : FAIL.** Assumé, chiffré, gelé, non corrigé dans ce lot.

### Mesure

| Page | Nœuds en violation |
|---|---:|
| `/dashboard/dossier` | 17 |
| `/dashboard/cloisons` | 15 |
| `/dashboard/synthese` | 13 |
| `/dashboard/referentiel` | 10 |
| `/dashboard/depot` | 9 |
| `/` | 0 |
| `/dashboard/risques` | 0 |
| **Total** | **64** |

### Cause racine

Un unique jeton de couleur du thème sombre, `--pb-text-faint`, et ses copies
littérales (`FAINT = "#5c6b82"`) dans les pages qui n'utilisent pas les
variables CSS.

| Premier plan | Fond | Ratio mesuré | Exigence AA (texte normal) |
|---|---|---:|---:|
| `#5c6b82` | `#0a0e14` (`--pb-bg`) | **3,57 : 1** | 4,5 : 1 |
| `#5c6b82` | `#111722` (`--pb-surface`) | **3,32 : 1** | 4,5 : 1 |
| `#5c6b82` | `#161d2b` (`--pb-surface-2`) | **3,12 : 1** | 4,5 : 1 |

À titre de comparaison, `--pb-text-muted` (`#8a99af`) atteint **6,20 : 1** sur
`--pb-surface` : le reste de la palette est conforme. Le défaut est circonscrit
à une valeur.

### Remédiation identifiée

Porter `--pb-text-faint` autour de `#7d8ca3` (**4,94 : 1** sur `--pb-surface-2`)
et propager la valeur aux constantes littérales `FAINT` des pages Synthèse et
Cloisons.

### Pourquoi ce n'est pas corrigé ici

Changer un jeton de couleur du thème modifie l'apparence de **toutes** les pages
du produit. C'est une décision de design, pas un correctif de durcissement, et
elle appartient au propriétaire du produit. La corriger silencieusement dans un
lot dont l'objet est la sécurité et la vérifiabilité aurait mélangé deux
natures de changement — exactement ce que le plan de refonte demande d'éviter
pour la migration Next 16.

Le correctif est un changement de trois valeurs, mesuré et prêt.

---

## 5. Garde-fou de non-régression

`e2e/accessibility.spec.ts` applique deux exigences distinctes :

| Impact | Seuil | Comportement |
|---|---|---|
| **critique** | **zéro, sans exception** | Toute violation critique fait échouer la CI |
| **sérieux** | dette gelée par page et par règle | Le compteur peut baisser, jamais monter |

Toute règle « serious » **autre que** `color-contrast` a une dette implicite de
zéro : une nouvelle catégorie de défaut fait échouer la CI immédiatement.

Ce dispositif a une propriété utile : corriger le contraste fera échouer la
suite tant que la baseline n'aura pas été abaissée. La dette ne peut pas être
oubliée.

---

## 6. Acquis de PR-06, revérifiés

| Contrôle | Statut | Vérification |
|---|---|---|
| Alternative tabulaire sous chaque graphique | **PASS** | `AccessibleChartTable` présent ; 11 tests de composants |
| `prefers-reduced-motion` respecté | **PASS** | PR-06, non modifié |
| Aucun bouton factice | **PASS** | E2E : tout bouton visible de la Synthèse porte un nom accessible |
| Régions nommées | **PASS** | 12 `region` avec `aria-label` sur la Synthèse |
| Navigation clavier | **NOT_TESTED** | Parcours clavier complet non automatisé — cf. § 7 |

---

## 7. Limites de cette campagne

| Limite | Portée | Conséquence |
|---|---|---|
| Un seul moteur, un seul navigateur | axe-core sur Chromium | axe couvre environ 30 à 50 % des critères WCAG. Un audit automatisé vert ne vaut pas une conformité. |
| Aucun test avec lecteur d'écran réel | NVDA, JAWS, VoiceOver | Les annonces effectives ne sont pas vérifiées, seulement la sémantique |
| Parcours clavier non automatisé | Ordre de tabulation, pièges de focus, raccourcis | À couvrir par une revue manuelle |
| Pas de test de zoom 200 % ni de reflow 320 px | WCAG 1.4.4 et 1.4.10 | PR-06 a vérifié 5 viewports sans débordement, mais pas le zoom texte |
| Modes forcés et contraste élevé | Windows High Contrast | Non testés |

Ces limites ne sont pas des échecs : ce sont les frontières exactes de ce que
cette campagne prouve. Une déclaration de conformité RGAA ou EN 301 549 exigerait
un audit manuel, hors périmètre de PR-08.
