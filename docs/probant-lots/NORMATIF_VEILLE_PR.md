# Audit Normatif 360 — charte papier, veille normative et infographies

Lot du 09/11/2026. Base : `main` f2dad09 (PR #107), worktree `cockpit-fiscalite-dashboard-1c1ba9`, branche
`claude/audit-normatif-navigation-design-e01261`. Non commité, non poussé.

## 1. Constat de départ (production, 09/11/2026)

- La landing présente la section « 04 · Audit Normatif 360 » dans l'ambiance **papier** de la charte. Tout lien vers
  `/normatif` (titre de la section, chaque cycle de l'index) ouvrait l'**ancienne interface sombre** : barre latérale
  violette, grilles de cartes arrondies, couleurs codées en dur (`#a78bfa`, `#eab308`, `#292207`…). La navigation
  elle-même fonctionnait (vérifié page par page sur probant.vercel.app) : c'est tout le module qui n'avait jamais été
  porté sur la nouvelle charte, si bien que chaque clic « ramenait » à l'ancien menu.
- Le registre des sources (créé en juin 2026) n'avait **aucune date de vérification**. Relevé des liens du 09/11/2026 :
  15 sources PCG/ANC et 25 fiches pointaient vers une page ANC en 404, la source H2A vers un domaine qui ne répond pas,
  les 18 NEP vers une page CNCC redirigée vers une 404, les 20 ISA vers une page IAASB qui refuse l'accès (403).

## 2. Ce qui change

### Interface (ambiance papier, `components/normatif/normatif.module.css`)
- **Châssis** (`app/normatif/layout.tsx`) : repère PROBANT, onglets du module (une ligne défilante sous 560 px, plus de
  tiroir), bandeau d'état toujours visible (expertise requise + état de la veille et son âge, calculé dans le navigateur).
- **Vue d'ensemble** : en-tête éditorial, recherche, avertissement, *État de la veille*, **index des cycles avec panneau
  d'aperçu** (survol ou clavier) et **matrice de couverture** cycles × référentiels (barres animées, repère de veille,
  colonne mise en avant au choix).
- **Cycles** : registre en lignes continues (filtres en liens de document, garde-fou du gel de navigation conservé).
- **Fiche cycle** : sommaire latéral suivi au défilement, bloc *Veille : ce que cette fiche ne reflète pas encore*,
  matérialité en trois marches (plein / tirets / pointillé), risques en trois colonnes, IFRS/PCG en registre ; les
  adresses officielles viennent du registre central.
- **Sources** : répartition animée par référentiel, registre filtrable avec trois colonnes de veille distinctes
  (vérification datée, lien, évolutions) ; fiche source avec sa veille.
- **Méthodologie, Export** : lignes sous filets ; rapport de validation restylé.
- **Veille** (nouvelle page `/normatif/veille`) : **frise animée** des évolutions par autorité et date d'effet, filet de la
  date d'arrêté, panneau de détail (règle d'effet, citation, preuve, ce qui est périmé, sources et cycles touchés), lien
  profond `?evolution=` ; liste chronologique sous 820 px ; cycles concernés ; file de revue ; méthode et limites.
- Force normative dessinée selon la charte (trait plein = obligatoire, tirets = recommandé/bonne pratique, pointillé =
  paramétrable, carré contour = à valider), jamais par la seule teinte. Animations finies, neutralisées sous
  `prefers-reduced-motion`.

### Moteur de veille (`lib/audit-cycles/veille.ts`, pur et testé)
- Données : `data/veille/veille.yml` (veille arrêtée au 09/11/2026, 67 évolutions sourcées) et
  `data/veille/link-check.json` (relevé HTTP, `npm run normatif:liens`).
- Trois contrôles jamais fondus en score : **vérification datée** (champ `verifiedAt` du registre, ou date du registre
  de connaissances `lib/knowledge/registry.ts` via `knowledgeSourceId`), **lien officiel**, **évolutions** (date d'effet
  jugée à la date d'arrêté ; intégration : à intégrer, en partie, intégrée, à surveiller).
- La file de revue ordonne sans additionner : évolution en vigueur non intégrée, puis lien mort, puis révision à venir,
  puis redirection / adresse absente, puis vérification manquante.

### Registre corrigé (sources vérifiées le 09/11/2026)
- **Adresses** : ANC (pages « Règlements de l'ANC » et « Plan comptable général »), H2A (référentiel normatif et page de
  chaque NEP), ISA (édition 2026 du Handbook IAASB), AFA (page des recommandations), EFRAG (statut d'adoption).
- **NEP** : titres officiels et article A. 821-xx du code de commerce relevés sur l'index H2A (NEP 200, 240, 315, 320,
  330, 501, 540, 560 avaient des titres paraphrasés ou anciens).
- **ISA** : « ISA 315 (révisée en 2019) », « ISA 250 (révisée) », ISA 570 et ISA 240 datées (versions révisées
  applicables aux périodes ouvertes à compter du 15/12/2026) ; résumé « transposé via les NEP » corrigé.
- **IFRS** : IAS 39 (couverture seulement), notes IFRS 18 sur IAS 1 et IAS 8, en-tête d'adoption UE (règlement
  2023/1803 modifié, avis EFRAG).
- **AFA** : le registre affirmait l'inverse du texte ; les recommandations « ne créent pas d'obligation juridique »
  (§ 8) et sont « opposables à l'AFA » (§ 10) — PDF officiel lu.
- **PCG** : note de version (2024, ANC 2022-06, consolidée 2026, ANC 2026-04, ANC 2026-03) renvoyant au résolveur daté.

## 3. Résultat de la veille au 09/11/2026

| | Nombre |
|---|---|
| Évolutions relevées | 67 |
| Déjà applicables, pas (ou en partie) intégrées | 31 (dont 3 sans date d'effet) |
| À venir, pas intégrées | 12 |
| Intégrées dans ce lot | 12 |
| Projets à surveiller (sans effet juridique) | 12 |
| Fiches cycles touchées par une évolution déjà applicable non intégrée | 16 / 35 |
| Sources vérifiées sur page officielle datée | 27 / 90 (63 jamais vérifiées) |
| Liens morts après correction | 0 (83 joignables, 1 redirection IAS 8, 6 Légifrance refusant les robots) |

Évolutions les plus structurantes pour la légitimité du contenu :
- **ISA 570 (Revised 2024)** et **ISA 240 (Revised)** : applicables aux périodes ouvertes à compter du 15/12/2026.
- **NEP révisées** les 13 et 27/11/2024 (315, 330, 540, 520, 530, 550, 200, 300, 501), **NEP 600** révisée (2025),
  **NEP 230/250/620/700** absentes du registre ; programme H2A 2026 d'adaptation des ISA en « ISA-FR ».
- **ANC 2022-06** (résultat exceptionnel redéfini, exercices ouverts dès 2025) : la fiche « exceptionnel » garde
  l'ancienne définition. **ANC 2024-07** (autres fonds propres, 2026), **ANC 2026-04** (IS), **ANC 2026-03** (produits
  des ventes, 2027), **ANC 2026-01** (crypto-actifs, 2027).
- **IFRS 18** (remplace IAS 1, 2027, adoptée par le règlement (UE) 2026/338), IFRS 19 (adoption UE en attente),
  amendements IFRS 9/7, IAS 1 covenants, IAS 7/IFRS 7 financement fournisseurs, IFRS 16 cession-bail, IAS 12 Pilier 2.
- **UE / France** : seuils de taille (directive 2023/2775, décret 2024-152, seuils CAC D. 221-5 à 5 M€ / 10 M€ / 50),
  CSRD et ses reports (2025/794, Omnibus I 2026/470), Sapin II art. 17 modifié (2025).

## 4. Sources et méthode

- Lectures officielles du 09/11/2026 : IAASB (pages ISA 570 (Revised 2024), Handbook 2026), H2A (index du référentiel,
  page NEP 315), AFA (PDF des recommandations), EUR-Lex (règlement 2026/338), ANC (pages règlements et PCG) — faites
  dans le navigateur intégré ou par relevé HTTP identifié, sans contourner les refus des robots.
- Deux recherches déléguées (normes d'audit ; IFRS, UE, droit français) sur pages et PDF officiels, chaque fait avec
  adresse lue, date et citation courte ; contrôlées par sondage (NEP 315, ISA 570, AFA, IFRS 18, index H2A).
- Reprises datées du dépôt : `lib/knowledge/french-gaap.ts` (PDF ANC lus le 13/10/2026), `lib/knowledge/registry.ts`.
- Aucun choix interne n'est attribué à une norme ; les citations sont limitées à de courts extraits.

## 5. Cas contrôlés

- `lib/audit-cycles/__tests__/veille.test.ts` (18 cas, attendus établis à la main : 365 / 366 jours, bornes de date
  d'effet, qualification HTTP, rangs de la file, exposition, validation) ; `view.test.ts` (index 01→35, matrice sans
  référence orpheline) ; `veille-donnees.test.ts` (veille réelle cohérente, aucun lien mort).
- `e2e/normatif-mise-en-page.spec.ts` : 8 routes × 1440 / 1024 / 390 (ambiance papier, h1, aucun débordement, onglet
  courant visible, axe sans « serious »), frise et liste de la veille, lien profond, matrice, mouvement réduit.
- `e2e/normatif-navigation.spec.ts` : gel de navigation vers `/normatif/cycles` (onglets, accueil, fil d'Ariane, veille).
- Exécutés sur le build de production (après la revue de vérification, § 7) : 98 / 98 sur `normatif-mise-en-page`,
  `normatif-navigation`, `landing` et `bordures-stratifiees`. Suite unitaire : 2 494 / 2 495 ; l'échec restant
  (`capitaux-propres.test.tsx`, lecture d'un PV, PDF/jsdom) est intermittent sous charge et passe seul, sans lien avec ce lot.
  Premier passage : 11 échecs, corrigés et non contournés — contraste de l'encre tertiaire sur le second plan
  (4,46:1, porté à 5,04:1 sur les surfaces du module), libellés « (nouvel onglet) » positionnés en absolu qui
  élargissaient la page des sources à 899 px à 390 px, et un sélecteur ambigu dans le test.
- Captures : `docs/probant-lots/normatif-captures/papier/` (relevé JSON et image par route et par largeur).

## 6. Limites restantes

- Les fiches cycles ne sont **pas réécrites** : intégrer ISA 570/240 révisées, les NEP 2024, ANC 2022-06/2024-07/2026-03,
  IFRS 18 reste une revue experte. La veille dit précisément quoi et où.
- 63 sources n'ont pas de lecture officielle datée ; le relevé HTTP n'en tient pas lieu.
- La veille ne se met pas à jour seule : relancer `npm run normatif:liens` et compléter `data/veille/veille.yml`. Au-delà
  de 90 jours, son âge passe en signal dans le bandeau.
- Points non lus (voir `limits` de chaque évolution) : jour d'approbation IAASB d'ISA 570/240, transposition française
  d'Omnibus I, carve-out européen d'IAS 39, date d'effet de la NEP 9510.
- Cibles tactiles : les marqueurs de la frise font 28 px de haut (frise dense, 2,5.8 AA respecté à 24 px) et les bascules
  de la charte 32 px ; sous 820 px de contenu, la liste (lignes de 48 px) remplace la frise.
- Les libellés de `applicableStandards` copiés dans chaque fiche (ex. « ISA 315 (révisée) ») ne sont pas harmonisés avec
  le registre central, dont les libellés ont été corrigés : seule l'adresse officielle est lue dans le registre.
- La navigation du module (onglets) défile avec la page ; un onglet collant est une amélioration possible.
- `loadVeilleReport()` est calculé deux fois par page (châssis et page) : sans effet mesurable aujourd'hui (données
  locales), à mettre en cache si le registre grossit.

## 7. Revue de vérification (09/11/2026, après la première livraison)

Parcours de 97 pages sur le build de production (8 routes × 1440 / 1024 / 390, 35 fiches × 1440 / 390) : console,
requêtes, débordements, identifiants en double, hiérarchie des titres, cibles tactiles, contraste, puis lecture des
captures. Défauts trouvés et corrigés :

| Défaut | Correction |
|---|---|
| À 1024 et 390 px, le panneau de détail de la veille restait hors écran après un clic (2 499 px sous la liste à 390) ; à 1440 il défilait hors de vue | Panneau collant côte à côte ; empilé, amené à l'écran et focalisé, avec un lien « Retour aux évolutions » ; test à trois largeurs |
| Même évolution numérotée 05 dans la liste des cycles et 01 dans l'index et sur la landing | La liste reprend la numérotation et l'ordre de l'index (`buildCycleIndex`) |
| Clés YAML brutes dans la méthodologie (« PRINCIPLE », « NAME », « INVESTIGATIONTRIGGER ») | Libellés français, repli lisible pour une clé inconnue |
| Filet de la date d'arrêté qui traverse les libellés de la frise | Fond sur le libellé (une règle `background: none` plus bas l'écrasait : corrigé) |
| Légende de la répartition des sources sans lien avec les segments | Sept remplissages partagés (plein, tons, hachures, pointillé, contour) |
| « arrêtée au 9 novembre (arrêtée aujourd'hui) », « 31 évolutions déjà applicables » (3 sans date, 6 partielles) | « arrêtée au … (aujourd'hui) » ; « en vigueur à reprendre » |
| Repères de matrice détachés de leur cellule ; points « aucune » en encre pleine | Repère en ligne après le nombre ; points en encre tertiaire |
| Annonce vocale de tout le panneau à chaque choix | Seul le titre est annoncé (`aria-live` ciblé) |
| Liste de recherche refermée avant le clic sous Safari (pas de focus sur un lien cliqué) | `mousedown` neutralisé sur la liste |
| Titre d'onglet générique sur tout le module | `metadata` du châssis et titres par page, y compris fiches et sources |
| Cibles tactiles < 44 px (sommaire, liens « texte officiel », puces de sources, fil d'Ariane, liens de silo) | Hauteur minimale de 44 px |
| Captures prises pendant l'animation (frise vide) | Le spec attend la fin des animations |
| Code mort : `useNavDrawer.ts` (dernier appelant supprimé), commentaire renvoyant à `RiskMatrix`, adresse du script de liens se déclarant « Mozilla » | Supprimé, corrigé, identité honnête (`PROBANT-veille/1.0`), mêmes réponses des sites |

Contrôles sans défaut : 0 erreur console, 0 requête en échec, 0 identifiant en double, un seul h1 par page, aucun saut
de niveau de titre, aucun débordement horizontal ; les 12 évolutions marquées « intégrées » sont bien reflétées dans
le registre (20 ISA sur le Handbook 2026, 17 NEP avec article et page H2A, plus aucune ancienne adresse).
