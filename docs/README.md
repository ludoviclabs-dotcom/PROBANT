# Documentation PROBANT

Point d'entrée de la documentation du dépôt.

## Refonte en cours

| Document | À quoi il sert |
|---|---|
| [`refonte/PLAN_REFONTE.md`](./refonte/PLAN_REFONTE.md) | **Le plan.** Audit de l'existant, architecture cible, roadmap PR-00 → PR-08, prompts d'exécution. Document de référence, stable. |
| [`refonte/SUIVI_AVANCEMENT.md`](./refonte/SUIVI_AVANCEMENT.md) | **L'avancement.** Statut de chaque PR, blocages P0, ADR en attente, checklist des livrables, journal. Mis à jour à chaque PR. |

Règle : le plan ne se réécrit pas pour refléter l'état d'exécution — c'est le rôle du suivi.

## Profil personnel local — C07

| Document | À quoi il sert |
|---|---|
| [`local/RUNTIME_PERSONNEL.md`](./local/RUNTIME_PERSONNEL.md) | **Lancer PROBANT sur son PC** : PostgreSQL 17 local, `npm run local:init` / `local:start` / `local:stop`, sauvegarde, restauration, migrations, erreurs fréquentes sous Windows |
| [`adr/ADR-012-profil-personnel-local.md`](./adr/ADR-012-profil-personnel-local.md) | Décision : profil d'exécution `personal_local`, pièces sur disque, identité locale, relecture personnelle nommée |
| [`recette/c07/`](./recette/c07/) | Méthode, résultats et preuves de reprise après arrêt et redémarrage |

## Stocks — valeur bornée et périmètre — C08

| Document | À quoi il sert |
|---|---|
| [`mission15/CONTRAT.md`](./mission15/CONTRAT.md) § C08 | Règle Stocks 1.1.0 : perte de valeur bornée à la valeur comptable, complément à qualifier, quantité retenue, coûts déclarés, sources PCG lues et choix internes |
| [`recette/c08/`](./recette/c08/) | Attendus calculés à la main et reproduction du moteur 1.0.0 (`AVANT-1.0.0.json`) |

## Capitaux propres — parcours unique — C09

| Document | À quoi il sert |
|---|---|
| [`mission-c09/COMPARAISON.md`](./mission-c09/COMPARAISON.md) | Matrice des deux parcours (`/equity`, `/capitaux-propres`), choix motivé du parcours cible, stratégie de transition et correspondance documentée pour une reprise |
| [`mission-c09/CONTRAT.md`](./mission-c09/CONTRAT.md) | Vue commune et dédoublonnage par PV, règle Capitaux propres 1.1.0 (amendements, paiement, autres fonds propres ANC 2024-07, repères légaux), sources lues et choix internes |
| [`recette/c09/`](./recette/c09/) | Attendus calculés à la main et reproduction du moteur 1.0.0 (`AVANT-capitaux-1.0.0.json`) |

## Clients, achats, cut-off et TVA — événements transversaux — C11

| Document | À quoi il sert |
|---|---|
| [`mission-c11/CONTRAT.md`](./mission-c11/CONTRAT.md) | Dates de raisonnement, carte événement → procédures → sources → effets, dépendances d'invalidation, grille de cut-off 1.1.0 (texte applicable, avoirs), qualification TVA fermée, sources lues et écarts du registre fiscal |
| [`recette/c11/`](./recette/c11/) | Huit cas avec attendus comptables et fiscaux posés à la main, pont C05 et procédures C03 attendus |

## Emprunts — chaîne livrée — C13

| Document | À quoi il sert |
|---|---|
| [`mission-c13/CONTRAT.md`](./mission-c13/CONTRAT.md) | Chantier Mission 14 retrouvé et porté (ce qui est gardé, ce qui change), sources du pack, population, calculs, taux et révisions sourcés, covenants sans ratio, postes de bilan selon le texte applicable, autres fonds propres par le moteur C09, exclusions nommées, attendus |
| [`recette/c13/`](./recette/c13/) | Attendus recalculés indépendamment (`attendus.py`), packs synthétiques et protocole de recette |

## Synthèse des travaux et clôture locale — C14

| Document | À quoi il sert |
|---|---|
| [`mission-c14/CONTRAT.md`](./mission-c14/CONTRAT.md) | Avant / après, projection unique du dossier (dénominateurs partagés par la carte, le bandeau et l'export), rattachement des feuilles par racine, adaptateurs de sources, mode solo, seuils NEP 450 |
| [`mission-c14/RECETTE.md`](./mission-c14/RECETTE.md) | Dénominateurs calculés à la main, 8 cas demandés et cas complémentaires, corrections consignées |
| [`mission-c14/EXCLUSIONS.md`](./mission-c14/EXCLUSIONS.md) | Bilan des exclusions caduques et encore pertinentes |

## Architecture — produit par PR-00

Cartographie **vérifiée par exécution** au commit `e61ae74`, architecture cible et roadmap.

| Document | À quoi il sert |
|---|---|
| [`architecture/PROBANT_MASTER_CONTEXT.md`](./architecture/PROBANT_MASTER_CONTEXT.md) | Point d'entrée : ce qu'est PROBANT, invariants, convention de marquage |
| [`architecture/CURRENT_STATE_MAP.md`](./architecture/CURRENT_STATE_MAP.md) | Routes, sources de vérité, stockage navigateur, stores serveur, API, tests, dépendances à risque, **P0/P1/P2** |
| [`architecture/TARGET_ARCHITECTURE.md`](./architecture/TARGET_ARCHITECTURE.md) | Knowledge Plane / Dossier Plane, en Mermaid. **Non implémentée.** |
| [`architecture/DATA_FLOW.md`](./architecture/DATA_FLOW.md) | Les trois chemins de données réels et leurs points de fusion |
| [`architecture/PR_ROADMAP.md`](./architecture/PR_ROADMAP.md) | Séquence PR-00 → PR-08 et **périmètre exact de PR-01** |
| [`architecture/DECISION_LOG.md`](./architecture/DECISION_LOG.md) | Décisions d'outillage de PR-00 (D-001 → D-006) avec alternatives écartées |

## Documentation à produire

Les répertoires ci-dessous sont prévus par le plan et seront créés par les PR
correspondantes. La checklist à jour se trouve au § 5 du suivi d'avancement.

| Répertoire | Contenu | PR |
|---|---|---|
| ~~`docs/architecture/`~~ | ✅ **Livré par PR-00** — voir la section ci-dessus | PR-00 |
| `docs/adr/` | ADR-001 à ADR-008 | PR-02 → PR-08 |
| `docs/knowledge/` | 🟦 **Partiellement livré par PR-01** — [`COVERAGE_REPORT.md`](./knowledge/COVERAGE_REPORT.md) et [`REVIEW_REQUIRED.md`](./knowledge/REVIEW_REQUIRED.md) publiés ; `SOURCE_POLICY.md` reste à écrire | PR-01, PR-04 |
| `docs/ingestion/` | Limites d'ingestion et résultats de benchmark | PR-03 |
| `docs/ux/` | Contrats de visualisation, règles d'accessibilité | PR-06 |
| `docs/evidence/` | Spécification du manifeste, formats d'export | PR-07 |
| `docs/release/` | Rapports de préparation à la release | PR-08 |
