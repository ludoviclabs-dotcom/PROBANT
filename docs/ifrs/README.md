# IFRS 16 / IFRS 18 — plan versionné, non exécuté

État au 29/10/2026 : **aucun lot exécuté.** Le dépôt ne contient ni code, ni route, ni migration, ni capacité, ni règle IFRS 16 ou IFRS 18. `lib/ifrs/`, les routes `/ifrs/*`, `docs/ifrs/handoffs/` et les livrables de C00 (`CONTRAT_COMMUN.md`, `SCOPE_V1.md`, `SOURCES.md`, `RECETTE_REFERENCE.md`) restent à produire. Un fichier de ce répertoire est une spécification ou un relevé, jamais la preuve d'une fonctionnalité.

## Contenu

| Élément | Rôle |
|---|---|
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
