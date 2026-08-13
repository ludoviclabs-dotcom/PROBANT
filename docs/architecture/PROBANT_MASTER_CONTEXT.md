# PROBANT — Master Context

> **Statut** : produit par **PR-00** (cartographie + patch de maintenance + CI minimale).
> **Commit audité** : `e61ae741df1694a5beadb76ddaeee8cb7d79b0e6`
> **Date d'audit** : 13/08/2026
> **Portée** : aucune modification fonctionnelle. Aucun fichier de `app/`, `components/`
> ou `lib/` n'a été touché par ce PR.

Ce document est le **point d'entrée** de `docs/architecture/`. Il définit ce
qu'est PROBANT, ce que le dépôt contient réellement, et ce que les autres
documents de ce répertoire couvrent.

---

## 1. Ce qu'est PROBANT

PROBANT est une application Next.js (App Router) qui outille la **revue
analytique d'états financiers français**. Elle réunit aujourd'hui trois
ensembles fonctionnels distincts, tous présents dans le dépôt :

| Ensemble | Rôle | Racine du code |
|---|---|---|
| **Moteur d'analyse FEC** | Ingestion d'un FEC, exécution de règles, production de constats (`Finding`) rattachés à des cloisons comptables | `lib/fec`, `lib/rules-engine`, `lib/canonical-model` |
| **Base de connaissance normative** (« Audit Normatif 360 ») | 35 fiches de cycles d'audit + registre de sources, versionnées en YAML, lues côté serveur | `data/`, `lib/audit-cycles` |
| **Cartographie des risques** | Scoring heuristique par cycle (gravité / probabilité / détectabilité / exposition), graphe et heatmap | `lib/risk-mapping` |

Deux modules complémentaires s'y greffent : le **rapprochement multi-documents**
(`lib/rapprochement`, moteur cycle-agnostique) et la **matérialité ISA 320**
(`lib/audit/materiality.ts`).

### Ce que PROBANT n'est pas (constaté dans le code)

- Il n'y a **aucune base de données**. La seule « persistance » serveur est
  constituée de deux structures en mémoire process
  (`lib/server-store/adjustments-store.ts`, `lib/server-store/analytics-store.ts`),
  perdues à chaque redémarrage — les fichiers le documentent eux-mêmes.
- Il n'y a **aucune authentification, aucun middleware, aucun proxy**. Aucun
  fichier `middleware.ts` n'existe à la racine ni dans `app/`. `DEMO_USER_ID`
  (`lib/server-store/types.ts:14`) est une identité simulée.
- Il n'y a **aucun connecteur externe** ni appel réseau sortant vers un tiers.
  `lib/analytics/track.ts` poste uniquement vers la route interne
  `/api/analytics/events`.

---

## 2. Le mode DEMO SA

Le dossier de démonstration `DEMO_DOSSIER` (`lib/demo/dataset.ts:1163`) est
aujourd'hui la source principale de la restitution.

| Élément | Valeur mesurée |
|---|---|
| Raison sociale | `DEMO SA` |
| SIREN | `000000000` |
| Exercice | `2024` |
| Silos | **28** |
| Constats (`Finding`) | **41** |
| Cloisons déclarées (`CLOISONS`) | **7** |

*(Mesuré en exécutant `DEMO_DOSSIER` sous Vitest au commit audité.)*

**Ce mode doit être préservé tel quel.** Il est importé directement par 5 pages
et 2 composants (voir `CURRENT_STATE_MAP.md` § 3). La suppression de ces imports
est le travail de **PR-02**, pas de PR-00.

---

## 3. Invariants à respecter par toutes les PR suivantes

Ces invariants sont dérivés du code observé et des instructions de la refonte.

1. **Aucune citation normative inventée.** Toute source affichée doit exister
   dans `lib/referentiel/sources.ts` ou `data/sources/*.yml`, avec son
   identifiant. Le référentiel se déclare lui-même « à revoir avant production »
   (`lib/referentiel/sources.ts:4-13`).
2. **Aucune norme protégée reproduite en texte intégral.** Le code n'en contient
   pas aujourd'hui : `lib/referentiel/sources.ts:12` qualifie explicitement ses
   citations de « paraphrases fidèles destinées à l'affichage ».
3. **Séparation des trois registres de règles.** `hardLaw` (opposable),
   `methodology` (présomption d'audit), `internal` (heuristique non opposable) —
   `lib/rules-engine/registries/`. Le composite de risque est marqué
   `isHeuristic` (`lib/risk-mapping/scoring.ts:22-26`).
4. **« Non évalué » ≠ « 0 ».** Un cycle sans constat ni standard obligatoire a
   `composite = null`, jamais `0` (`lib/risk-mapping/scoring.ts:28-31`).
5. **Le mode démo reste fonctionnel sans base ni credentials.**

---

## 4. Carte des documents `docs/architecture/`

| Document | Contenu |
|---|---|
| `PROBANT_MASTER_CONTEXT.md` | Ce document — définition, invariants, index |
| `CURRENT_STATE_MAP.md` | **Cartographie vérifiée** : routes, sources de vérité, stockage navigateur, stores serveur, API, tests, dépendances à risque, P0/P1/P2 |
| `TARGET_ARCHITECTURE.md` | Architecture cible en deux plans (Knowledge Plane / Dossier Plane), en Mermaid. **Non implémentée.** |
| `DATA_FLOW.md` | Flux de données réels observés, du dépôt d'un fichier à la restitution |
| `PR_ROADMAP.md` | Séquence PR-00 → PR-08, critères de sortie, périmètre de PR-01 |
| `DECISION_LOG.md` | Décisions prises par PR-00, avec justification et alternative écartée |

Relation avec `docs/refonte/` : `PLAN_REFONTE.md` reste **le plan stable** et
`SUIVI_AVANCEMENT.md` **le tableau de bord d'exécution**. `docs/architecture/`
contient le **résultat vérifié** de la cartographie — c'est-à-dire les faits
confirmés par exécution au commit audité.

---

## 5. Convention de marquage

Ce répertoire distingue trois niveaux :

| Marqueur | Signification |
|---|---|
| *(non marqué)* | **Vérifié** : constaté dans un fichier cité, ou produit par une commande dont l'exit code est consigné |
| `UNVERIFIED` | Affirmation plausible mais **non confirmée** dans le dépôt à ce commit |
| `TODO` | Travail identifié, non réalisé, rattaché à une PR |

Aucune affirmation non marquée de ce répertoire ne doit être écrite sans chemin
de fichier à l'appui.
