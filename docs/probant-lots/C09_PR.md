# Mission C09 — descriptif de PR prêt à examiner

Titre : Capitaux propres — parcours unique sur les deux feuilles, règle 1.1.0 (amendements, paiement, autres fonds propres ANC 2024-07, repères légaux datés) (C09)

Base : `main` `ff3f9fb`.

## Cause

Le cycle Capitaux propres avait **deux parcours sans lien** : `equity.review` (`/equity`, #62, tables `clients_*`) et `capitaux_propres.review` (`/capitaux-propres`, #65, tables `eq_*`).

- **Double compte.** Une même distribution saisie dans les deux apparaissait deux fois.
- **Deux entrées.** La navigation proposait une feuille et une « procédure parallèle ».

Sur le dossier de recette, le moteur `/capitaux-propres` de `ff3f9fb` (`docs/recette/c09/AVANT-capitaux-1.0.0.json`) donnait :

- **Décision amendée.** Une distribution exceptionnelle de 50 ramenée à 30 produisait deux votes et un faux écart de **+50**.
- **Dividende non payé.** Un dividende voté non payé n’affichait que « Aucun règlement rattaché ».
- **Autres fonds propres.** Ils étaient seulement exclus, sans qualification.
- **Juridique.** Aucun repère.

## Changements

- **Comparaison et choix** (`docs/mission-c09/COMPARAISON.md`).
  - Matrice : fonctionnalités, sources, événements, décisions, pièces, exports.
  - `/capitaux-propres` devient le parcours cible sur cinq critères, aucun n’étant sa date.
  - `/equity` reste lisible et poursuivable. Ses points forts (couverture déclarée, inventaire des composantes) sont portés en phase 2.
- **Vue commune** (`capitaux-parcours.ts`, `capitaux-parcours-http.ts`, route `GET /api/workpapers/capitaux-propres/parcours`, page `/capitaux-propres/parcours`).
  - Chaque feuille est lue par son runtime : drapeau, session, droits, version exacte.
  - Une décision porte l’effet par composante, le comptabilisé, le paiement, le PV cité et ses traces, avec un lien vers chaque feuille d’origine à sa version exacte et avec le contexte du dossier.
  - **Une même décision n’est comptée qu’une fois** : même PV (SHA-256) à la même page. Une ambiguïté est « à rapprocher », jamais additionnée.
- **Règle `capitaux_propres.review` 1.1.0**, résultat `capitaux-result-2`, travail `equity-2`.
  - **Décision amendée.** Colonne facultative « remplace », contrôlée à l’import. La ligne remplacée reste visible ; écritures et règlements sont rapprochés de la décision en vigueur.
  - **Paiement par décision** (voté, payé à la clôture et à la revue, reste).
  - **Présentation dettes / autres fonds propres.** Régime daté par le résolveur C04 (ANC 2024-07 de plein droit ou anticipé et cité, sinon texte antérieur). Classement par termes contractuels déclarés et cités, jamais par numéro de compte. Un instrument incertain rend le total inconnu.
  - **Repères légaux datés par forme sociale** (L232-10, L232-11, L223-42 / L225-248 / L227-1) : calculs arithmétiques et signaux « à examiner », sans alerte de dissolution ni délai.
  - **Feuilles 1.0.0.** Elles restent consultables. Toute commande autre que la révision est refusée (`EQ_RULE_REPLACED_REVISION_REQUIRED`).
- **Écrans.**
  - Formulaire du cadre (forme sociale, anticipation, instruments) dans `/capitaux-propres`.
  - Présentation et repères, partagés avec le parcours ; paiement et amendement dans le tableau des décisions.
  - Alerte 1.0.0 avec révision.
  - Liens vers le parcours unique depuis les deux feuilles.
- **Navigation.**
  - Une seule entrée de cycle (« Parcours Capitaux propres ») dans le registre des cycles ; la procédure parallèle est retirée.
  - Registre C01 1.2.0 : capacité et exclusions précisées.
- **Export de mission.** Il inclut le cadre, la présentation, les repères, le paiement et l’amendement.

Aucune migration de schéma : seuls des champs JSON changent. Aucune revue réécrite ; les versions 1.0.0 restent lues telles qu’enregistrées.

## Sources

**ANC.** Lus le 14/10/2026, PDF extraits avec pypdf, empreintes comparées au résolveur C04 :

- ANC 2024-07 (art. 1er et 6, `19288fed…`) ;
- PCG consolidé au 01/01/2026 (`b9e7a732…`) ;
- Recueil 2024 (`f608f78f…`) ;
- ANC 2022-06 (`aeaa05cf…`).

**Code de commerce.** Lu le 14/10/2026 sur Légifrance, avec le navigateur intégré : L232-10 (deux versions), L232-11, L232-12, L223-42 et L225-248 (avant et depuis le 11/03/2023), L227-1 (versions depuis le 21/07/2019).

**Non lu.** La disposition transitoire de la loi 2023-171 (vérification anti-robot, non contournée) : elle n’est pas appliquée.

Détail et choix internes : `docs/mission-c09/CONTRAT.md` § 3 et § 4.

## Validation

- **Recette C09** (`capitaux-c09.test.ts`, 17 cas). Attendus posés à la main dans `docs/recette/c09/RECETTE.md`. Les six cas du prompt sont couverts :
  - affectation sans mouvement global ;
  - distribution votée non payée ;
  - pièce absente ;
  - même PV dans deux parcours ;
  - décision amendée ;
  - classe d’instrument incertaine.

  Plus les variantes (registre sans colonne d’amendement, divergence entre parcours, PV ambigu, feuille 1.0.0 lue puis révisée au runtime avec refus 409 des autres commandes, anticipation sans pièce).
- **Modules purs** : présentation et repères légaux, 19 cas (`capitaux-presentation.test.ts`, `capitaux-legal.test.ts`).
- **Route unique** : 5 cas (`capitaux-parcours-http.test.ts`) — drapeaux, 401 et 403, version exacte, parcours indisponible.
- **Suites existantes** : `/capitaux-propres` 52 cas (attendus chiffrés de la Mission 11 inchangés), registres et dossier 152 cas.
- **Suite unitaire complète** (`--project unit --pool=forks`) : 1 739/1 739, sans test ignoré.
- **Recettes PostgreSQL** (projet `durable`, base jetable locale PostgreSQL 17.11) : 51/51, sans test ignoré.
- **E2E navigateur** (build de production) : `c09-capitaux-parcours.spec.ts` (parcours à 1440, 1024 et 390 ; clavier ; axe ; débordement ; animations réduites ; parcours sans `/equity` ; feuille 1.0.0 révisée ; formulaire du cadre jusqu’au calcul serveur) et `capitaux-propres.spec.ts`. Captures : `docs/probant-lots/c09-captures/`.

## Limites

- **Correspondance entre feuilles.** Elle repose uniquement sur le PV (empreinte et page). Une décision sans PV commun, à la même date d’effet qu’une décision de l’autre feuille, reste « à rapprocher » tant qu’une correspondance manuelle citée n’existe pas (phase 2).
- **Décisions de `/equity`.** Elles restent « non typées » : ce parcours ne qualifie pas le type.
- **Termes contractuels.** Ils sont déclarés et cités ; PROBANT ne lit pas les contrats. Le texte d’ANC 2024-07 ne prévoit pas de disposition propre de première application.
- **Repères légaux.** Ils sont arithmétiques ; les notions légales (bénéfice distribuable, capitaux propres retenus pour le test de la moitié, délais) restent juridiques.
- **Démonstration.** Le scénario historique (`lib/demo/scenarios.ts`) et la base de connaissance (`data/cycles/capitaux-propres.yml`) paraphrasent encore L232-10 et L225-248 : une tâche séparée est proposée.

Aucun merge ni déploiement réalisés.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
