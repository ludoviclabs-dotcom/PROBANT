## C14 — Synthèse des travaux et clôture locale unifiées

Base `main` `bb919bf` (après la PR #94, C12 Paie/Congés persistants), puis `main` `32df44d` (PR #95, C13 Emprunts) fusionné dans la branche : registre porté en 1.4.1, la feuille `loans.review` est lue par sa famille avec sa propre règle de sources. Le lot réutilise le dossier de clôture de la Mission 19 (PR #72) et les feuilles existantes, lues à leur version courante : aucun moteur de cycle n'est recalculé, aucune opinion n'est générée, aucune migration.

### Ce qui change

- **Une feuille par procédure du programme.** `bestObservation` retenait la feuille au rang d'état le plus élevé parmi toutes les racines : une feuille verrouillée couvrait silencieusement une autre population (deuxième compte bancaire, deuxième période de TVA) ou une révision plus récente (les stores durables gardent la révision verrouillée « courante »). Désormais : une lignée par racine, dont la feuille courante est la dernière révision ; rattachement explicite `bind_sheet` (entité, exercice, période, périmètre, run, révision, version, empreintes), implicite seulement pour une feuille unique ; « Feuille à rattacher » sinon ; révision ou population nouvelle → rattachement à confirmer ; lignée hors programme écartée avec motif (`exclude_sheet`), listée, hors dénominateur avec mention. Plusieurs procédures peuvent observer la même procédure de cycle.
- **Sources par adaptateur de famille.** La fraîcheur des sources suit la règle de chaque famille (`closing-adapters.ts`) : une source remplacée après le verrouillage rend la feuille « Source remplacée depuis le gel » et périme la validation.
- **Projection unique** (`closing-projection.ts`) : dénominateurs calculés une fois et lus par les indicateurs, la carte de couverture, le bandeau, l'onglet « Synthèse des travaux » et l'export (`operation=export`, JSON canonique, HTML, PDF, CSV, manifeste, conflit 409 si l'état a changé).
- **Parcours de dossier** : onglet « Synthèse des travaux » par cycle (feuille rattachée ou travaux manuels, résultats dont « non concluant », pièces, constats, reste à faire), autres feuilles listées, corrections / preuves nouvelles / anomalies résiduelles (vocabulaire C05, correction partielle), contradictions avec les déclarations reçues depuis, dates utiles, seuils documentés (NEP 450 §06, §07, §18 a ; aucun barème légal, aucune comparaison), exclusions encore pertinentes.
- **Mode solo** : relecture personnelle nommée admise et comptée à part ; « dossier personnel terminé » avec limites visibles, périmé par tout changement ; la validation professionnelle reste réservée à `dossier:sign` et à l'habilitation de clôture (accordée à personne par défaut).
- **Provisions** : synthèse de mission à version exacte (`/provisions/synthese`, `operation=mission`) et export diagnostic / approuvé, masquage confidentiel identique à la feuille (deux fuites antérieures corrigées : copie des lignes d'un calcul bloqué, totaux d'une source masquée).
- **Registre 1.3.1** : route de synthèse Provisions, portée locale du transversal ; mention « paie non observable » retirée (caduque depuis C12).

### Recette

Les 8 cas demandés (cycle verrouillé mais programme incomplet ; 2/7 procédures revues ; non applicable motivée ; population absente ; correction avec preuve nouvelle ; source remplacée après clôture ; Paie retrouvée après reprise ; deux feuilles même procédure sur périmètres distincts), le mode solo, les dates et seuils : attendus posés à la main dans `docs/mission-c14/RECETTE.md`. Contrat : `docs/mission-c14/CONTRAT.md`. Bilan des exclusions : `docs/mission-c14/EXCLUSIONS.md`.

### Contrôles

| Contrôle | Résultat |
|---|---|
| Recette C14 (`closing-c14.test.ts`, attendus manuels) | 9 / 9 |
| Recette Mission 19 (`closing-runtime.test.ts`, 2 attendus adaptés et consignés) | 18 / 18 |
| PostgreSQL 17 jetable local (`closing-durable` dont « Paie retrouvée après reprise », `provision-durable`) | 7 / 7 |
| Suite unitaire complète après fusion de `main` | 181 fichiers, 1 906 / 1 906 |
| E2E sur build de production (`closing.spec.ts`, `provisions.spec.ts`) à 1440 / 1024 / 390, axe WCAG 2.1 AA | 11 / 11 (avant fusion de la PR #95) |
| `tsc --noEmit`, ESLint, `next build` | sans erreur |

Captures : `docs/probant-lots/c14-captures/`.

### Limites

Constats C05 de la carte des événements transversaux (C11) non versés dans le dossier ; pièces binaires hors paquet d'export ; familles dont la règle ne regarde que les imports figés : source ajoutée après le gel non signalée .

🤖 Generated with [Claude Code](https://claude.com/claude-code)
