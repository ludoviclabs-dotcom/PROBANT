# Reprise différentielle sur main — état courant 2026-09-25

La transposition A–E décrite ci-dessous a été fusionnée dans la PR #50 et publiée sur `main` au commit `482314aa4e7810c3f0ffb88ed0adb163668e176f`. Elle n'est pas reprise une seconde fois. La finalisation du démonstrateur intégré se fait sur la branche locale `feat/probant-demo-integree`, issue de ce `main`, sans publication distante à cette étape. Les choix du tableau suivant sont conservés comme historique daté de la reprise initiale.

Le nouveau travail raccorde les dix cycles à un dossier synthétique dédié, puis à la synthèse et à l'export du même dossier. Le journal local du navigateur remplace la dépendance à une `Map` serverless pour ce parcours, sans prétendre à une persistance réelle. L'IS demeure bloqué pour l'exercice 2024 non couvert. Les gates d'activation réelle listées ci-dessous ne sont pas levées.

## Historique de décision — 2026-09-25 avant PR #50

Date : 2026-09-25. Base distante vérifiée après `git fetch origin --prune` : `cd21e0308e0d6eec604ec6be9814291cebea3b0a`. Ancien travail conservé sans suppression dans `archive/probant-lots-ae-2026-09-25` (`30c5255`). Reprise : `fix/reprise-probant-lots-ae`.

| Bloc A→E | Classement | Décision |
| --- | --- | --- |
| Authentification OIDC, cloisonnement, dépôt/ingestion durable, moteur fiscal, migrations 0000–0004 | DÉJÀ FOURNI PAR MAIN | Conservés ; aucune migration de l'archive copiée. |
| Canonicalisation, synthèse, export, dossier et revue historiques | À ADAPTER | Correctifs ciblés QF-01/02/03/06/13/19 ; projection de feuilles ajoutée, sans fusion des mesures anciennes. |
| Monnaie exacte, périodes, imports versionnés, calculs, population/sélection, revue, cycles Cash à IS | À TRANSPOSER | Noyau additif `lib/workpapers` et tests ; mode synthétique seulement. |
| Atelier, disponibilité, pédagogie, export figé | À ADAPTER | Interface raccordée ; cinq états affichés ; Guide V1.1/138 pages, non normatif. |
| Ancienne authentification simulée ou fallback démo sur dossier réel, anciennes références Guide V1.0 | À ABANDONNER | Aucune reprise ; démo opt-in, sans données réelles. |
| Anciennes API de dépôt et surfaces non reliées aux contrats de travail | À CORRIGER AVANT TRANSPOSITION | Routes historiques renforcées sans suppression ; API réelle des nouvelles feuilles désactivée. |

Gates d'activation non inventés : méthodes/PBC applicables, adaptateur durable et autorisation OIDC du nouveau parcours, règles normatives validées. L'ancien arbre reste récupérable via la branche d'archive ; il n'a pas été fusionné globalement.
