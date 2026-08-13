# Documentation PROBANT

Point d'entrée de la documentation du dépôt.

## Refonte en cours

| Document | À quoi il sert |
|---|---|
| [`refonte/PLAN_REFONTE.md`](./refonte/PLAN_REFONTE.md) | **Le plan.** Audit de l'existant, architecture cible, roadmap PR-00 → PR-08, prompts d'exécution. Document de référence, stable. |
| [`refonte/SUIVI_AVANCEMENT.md`](./refonte/SUIVI_AVANCEMENT.md) | **L'avancement.** Statut de chaque PR, blocages P0, ADR en attente, checklist des livrables, journal. Mis à jour à chaque PR. |

Règle : le plan ne se réécrit pas pour refléter l'état d'exécution — c'est le rôle du suivi.

## Documentation à produire

Les répertoires ci-dessous sont prévus par le plan et seront créés par les PR
correspondantes. La checklist à jour se trouve au § 5 du suivi d'avancement.

| Répertoire | Contenu | PR |
|---|---|---|
| `docs/architecture/` | Master context, cartographie de l'existant, architecture cible, flux de données, roadmap, journal des décisions | PR-00 |
| `docs/adr/` | ADR-001 à ADR-008 | PR-02 → PR-08 |
| `docs/knowledge/` | Politique de sources, couverture normative, points à faire valider | PR-01, PR-04 |
| `docs/ingestion/` | Limites d'ingestion et résultats de benchmark | PR-03 |
| `docs/ux/` | Contrats de visualisation, règles d'accessibilité | PR-06 |
| `docs/evidence/` | Spécification du manifeste, formats d'export | PR-07 |
| `docs/release/` | Rapports de préparation à la release | PR-08 |
