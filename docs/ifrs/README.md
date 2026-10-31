# IFRS 16 / IFRS 18 — plan versionné, lots C00, C01, C02, L16-01 à L16-06 et C03 (restreint à IFRS 16) réalisés

État au 31/10/2026 :
- **C00** : documentaire (contrats, périmètre, sources, attendus), restreint à IFRS 16.
- **C01** : socle local (virgule fixe, contrats communs, feuille `ifrs16.leases`, API, registre, migration `0022`).
- **L16-01**, partie serveur : dictionnaire fermé des sources, modèles CSV, qualification du portefeuille et couverture. L'interface attend C02.
- **L16-02** : moteur pur, égal à l'oracle au centime, branché sur la feuille.
- **C02** : page `/ifrs/locations` (bandeau de contexte, rail des étapes, matrice de complétude, inspecteur, scénario synthétique en lecture seule), entrée « Référentiels » du profil local.
- **L16-03** : cadrage des loyers sur la base PCG, contrat par contrat et ligne à ligne ; retraitement de clôture proposé (écritures, pont par poste), égal à l'oracle ; sélection et retrait par version attendue (logique pure) ; modèle d'export du journal.
- **L16-04** : poste visuel — rail en cinq étapes (Sources, Qualification, Calcul, Retraitements, Revue), ligne de synthèse du portefeuille, table paginée, graphiques dette / droit d'utilisation et principal / intérêts avec leurs tableaux, ponts dette et droit d'utilisation séparés, comparaison de deux versions exécutées, frise du contrat dans l'inspecteur.
- **L16-05** : synthèse de revue, résolution citée des points, relecture personnelle nommée et verrouillage à l'écran ; exports JSON, CSV et HTML imprimable avec manifeste (diagnostic ou revu, même empreinte métier) ; section « Travaux IFRS » du dossier de clôture (sélection pour une base déclarée, retrait, comptabilisation documentée par une pièce), jamais additionnée aux anomalies ; exemple d'exports dans [`exemples/l16-05/`](./exemples/l16-05/).
- **L16-06** : recette indépendante et charge. Le lot comprend :
  - une matrice exigences → tests ;
  - des propriétés contre l'oracle sur 200 contrats tirés par graine ;
  - neuf mutations détectées ;
  - la charge de 1 000 contrats × 120 mois et la capacité réelle mesurée ;
  - le parcours réel sur un profil local jetable, avec redémarrage.

  Il corrige la qualification quadratique et le premier enregistrement des politiques d'une feuille neuve. Verdict du 30/10/2026 : non opérationnel, avec deux blocages (relecture de la règle, capacité du store). **Verdict révisé le 31/10/2026 : opérationnel sur le périmètre V1 vérifié, pour la juridiction IASB et dans la capacité mesurée**, après la relecture de la règle par l'utilisateur et le parcours réel complet à l'écran ; voir le handoff § 1.
- **C03**, restreint à IFRS 16 (IFRS 18 reporté) : parcours croisé sur un profil jetable — détail d'un montant et sa preuve, sélection pour une base PCG dite pont partiel (`partial_bridge`), rejeu sans double montant, base déjà retraitée refusée, simulation sans effet sur les versions revues, version d'un contrat changée (seul ce contrat change), sauvegarde et restauration relues à l'identique ; limites IFRS 18 dites dans les exports et le registre ; non-régression et charge. Étapes P18 `hors_périmètre`.

**Exécution réelle ouverte depuis le 31/10/2026**, pour la juridiction IASB : la relecture personnelle nommée de la règle est consignée ([`REVUE_REGLE_IFRS16.md`](./REVUE_REGLE_IFRS16.md)). La juridiction de l'Union européenne reste bloquée tant que son texte n'est pas lu.

Un fichier de ce répertoire est une spécification ou un relevé ; seul le code et ses tests prouvent une fonctionnalité.

## Contenu

| Élément | Rôle |
|---|---|
| [`handoffs/C03.md`](./handoffs/C03.md) | **Où en est le chantier** : intégration restreinte à IFRS 16, parcours de référence → tests, non-régression, charge à la référence et à la cible, limites, note de revue et commandes, captures [`captures/c03/`](./captures/c03/) |
| [`BACKLOG.md`](./BACKLOG.md) | Améliorations hors périmètre, non réalisées, avec source, bénéfice et dépendances |
| [`handoffs/L16-06.md`](./handoffs/L16-06.md) | Recette L16-06 : verdict, matrice exigences → tests → résultats, propriétés et mutations, charge et capacité, parcours réel, blocages avant C03, captures [`captures/l16-06/`](./captures/l16-06/) |
| [`CAPACITE_LOCATIONS.md`](./CAPACITE_LOCATIONS.md) | Capacité de l'atelier : options mesurées, O1 + O2 faites (30 contrats de 120 mois au lieu de 9) ; cible au-delà à décider |
| [`recette/`](./recette/) | Oracle C00 et attendus aléatoires ([`proprietes_l16.py`](./recette/proprietes_l16.py)), résultats des mutations, mesures de charge ([`charge/`](./recette/charge/)), état du parcours réel |
| [`handoffs/L16-05.md`](./handoffs/L16-05.md) | Revue, exports et manifeste, travaux IFRS du dossier de clôture, inventaire des contrôles pour L16-06, captures [`captures/l16-05/`](./captures/l16-05/) |
| [`handoffs/L16-04.md`](./handoffs/L16-04.md) | poste visuel, vue de portefeuille serveur, graphiques et tableaux, comparaison de versions, captures [`captures/l16-04/`](./captures/l16-04/) |
| [`handoffs/L16-03.md`](./handoffs/L16-03.md) | cadrage PCG, retraitement de clôture et pont, sélection, contrat exposé à IFRS 18, recette avant / après, captures [`captures/l16-03/`](./captures/l16-03/) |
| [`handoffs/L16-02.md`](./handoffs/L16-02.md) · [`handoffs/L16-01.md`](./handoffs/L16-01.md) | Moteur, résultat, oracle ; dictionnaire, qualification et tableau cas → statut → cause → action |
| [`handoffs/C02.md`](./handoffs/C02.md) | Langage visuel : composants, API de sélection, contrats de branchement, captures [`captures/c02/`](./captures/c02/) |
| [`FICHE_RELECTURE_UTILISATEUR.md`](./FICHE_RELECTURE_UTILISATEUR.md) | Fiche de relecture de la règle point par point, texte UE, cible de capacité, décision IFRS 18 ; réponses reçues le 31/10/2026, reportées dans [`RAPPELS.md`](./RAPPELS.md) |
| [`RAPPELS.md`](./RAPPELS.md) | **Rappels en attente** : texte UE (PDF à fournir), décision IFRS 18 reportée ; rappels clos : relecture de la règle, cible de capacité |
| [`REVUE_REGLE_IFRS16.md`](./REVUE_REGLE_IFRS16.md) | Relecture nommée de la règle : consignée le 31/10/2026 (IASB) ; guide conservé |
| [`DICTIONNAIRE_L16.md`](./DICTIONNAIRE_L16.md) · [`modeles/`](./modeles/) | Dictionnaire des sources, modèles CSV et modèle d'export du journal de retraitement, produits depuis le code |
| [`handoffs/C01.md`](./handoffs/C01.md) | Socle C01 : livré, contrat des nouvelles données, décisions C01-D01 → D09, table d'erreurs, bilan des migrations, recette, contrat transmis à C02 et L16-01 |
| [`handoffs/C00.md`](./handoffs/C00.md) | Décisions D01 → D25, sources lues, non-vérifiés, contrat transmis à C01 |
| [`SCOPE_V1.md`](./SCOPE_V1.md) | Périmètre fermé de l'atelier Locations IFRS 16 et ses deux matrices (exigences, cas exclus) |
| [`CONTRAT_COMMUN.md`](./CONTRAT_COMMUN.md) | Noms stables, contrats de données, conventions de calcul, commandes et erreurs, rattachement au registre et à la clôture |
| [`SOURCES.md`](./SOURCES.md) | Sources IFRS 16, IFRIC et PCG effectivement lues, et état de la règle |
| [`RECETTE_REFERENCE.md`](./RECETTE_REFERENCE.md) | Fixtures et attendus établis avant le moteur, par l'oracle [`recette/attendus_l16.py`](./recette/attendus_l16.py) |
| [`plan/00_LIRE_D_ABORD.md`](./plan/00_LIRE_D_ABORD.md) | Point d'entrée du plan : résultat visé, ordre d'exécution obligatoire, convention de handoff |
| [`plan/`](./plan/) | Copie à l'identique des 20 documents : 4 documents racine, 4 prompts communs (C00 → C03), 6 prompts IFRS 16 (L16-01 → L16-06), 6 prompts IFRS 18 (P18-01 → P18-06) |
| [`ECARTS_e25a4ad_97bed70.md`](./ECARTS_e25a4ad_97bed70.md) | Écarts entre la base du plan et `main` au 29/10/2026, points que C00 doit trancher, séquence proposée |
| [`precontrole_attendus.py`](./precontrole_attendus.py) | Recalcul indépendant des chiffres de recette cités par le plan (22 attendus confirmés) ; ne remplace pas l'oracle de C00 |
| [`PLAN_SOURCE.sha256`](./PLAN_SOURCE.sha256) | Empreintes SHA-256 des 20 fichiers source |

## Provenance

- Source : dossier Dropbox `PROBANT - IFRS/PROBANT-IFRS-PROMPTS-2026-10-16/`, version 1.0 du 16/10/2026, rédigée sur `main` à `e25a4ad`.
- L'archive voisine `PROBANT-IFRS16-IFRS18-ARCHITECTURE-PROMPTS-2026-10-16.zip` contient les mêmes 20 fichiers (`diff -r` sans écart le 29/10/2026).
- Copie octet pour octet : UTF-8, fins de ligne LF. Le plan proposait `docs/ifrs-plan/` « par exemple » ; `docs/ifrs/plan/` est retenu pour réunir le plan, les contrats de C00 et les handoffs sous `docs/ifrs/`, où les prompts déposent leurs livrables.
- Contrôle de la source : depuis le dossier Dropbox, `sha256sum -c <dépôt>/docs/ifrs/PLAN_SOURCE.sha256`. Dans le dépôt, l'historique git fait foi : avec `core.autocrlf=true`, une extraction Windows peut passer les fichiers en CRLF et faire échouer ce contrôle sans que le contenu ait changé.

## Règles d'usage

- Le plan ne se réécrit pas pour refléter l'exécution, comme pour la refonte (voir [`docs/README.md`](../README.md)). Décisions, écarts et handoffs vont à côté : `docs/ifrs/*.md`, `docs/ifrs/handoffs/<ID>.md`.
- Un lot à la fois, dans l'ordre de `plan/00_LIRE_D_ABORD.md`, après lecture d'[`AGENTS.md`](../../AGENTS.md), des quatre documents racine et du handoff précédent.
- Les prompts n'autorisent ni push, ni PR distante, ni fusion, ni déploiement, ni migration de la base personnelle réelle.
- Commandes : celles de `package.json` (npm), notamment `typecheck`, `lint`, `test`, `db:check`, `test:e2e` et `local:*`.
