# PROBANT

**Orchestrateur de conformité analytique des états financiers français.**

Ingestion FEC → détection d'anomalies par cloison → dossier de preuve opposable.
L'architecture impose une séparation stricte entre trois couches qui ne se
mélangent jamais :

| Couche | Rôle | Code |
|--------|------|------|
| **Socle normatif** | Règles opposables (LPF, PCG) et méthode (ISA, ISRE), versionnées et citées | `lib/referentiel` |
| **Moteur de constat** | Calcule, compare, classe, documente les écarts | `lib/rules-engine`, `lib/fec` |
| **Restitution** | Rend visible le calculé : silos, preuve, validation humaine | `app`, `components/probant` |

## Démarrer

```bash
npm install
npm run dev      # http://localhost:3000
npm run typecheck
npm run test     # tests des règles (Vitest)
```

## Les six écrans

- **Dépôt & ingestion** — dépose un FEC ; empreinte → parsing → validation
  réglementaire → moteur. Pipeline réel (`/api/depot`).
- **Synthèse** — distingue non-conformité réglementaire et signal analytique.
- **Revue par cloison** — *l'écran central*. Chaque catégorie comptable est un
  **silo** : l'élément financier reconstruit, la ligne en anomalie **entourée**
  et reliée par une **flèche annotée** au constat (montant, seuil, source
  officielle, explication, faisceau, workflow Valider/Écarter).
- **Dossier & preuve** — chaîne reconstituable par constat + export review pack.
- **Tests complémentaires** — procédures supplémentaires suggérées (ISA 330).
- **Seuils & référentiel** — sources versionnées + paramètres internes.

## Moteur de règles

Trois registres, jamais confondus (`lib/rules-engine/registries`) :

- `hardLaw` — admissibilité FEC (LPF art. A.47 A-1) et plan de comptes (PCG).
  Manquements **bloquants**.
- `methodology` — présomptions et procédures d'audit (ISA 240, 520, ISRE 2400).
- `internal` — heuristiques, ratios et matérialité propres à PROBANT (non opposables).

Chaque constat porte sa **source normative citée**, son **seuil**, son **écart**,
les **comptes/lignes FEC** concernés et une **chaîne de preuve**.

## Modèle de domaine

`lib/canonical-model` : `FecEntry` (18 rubriques A.47 A-1), `Finding`,
`Silo`/`Cloison` (mapping PCG des 8 classes), `Dossier`, `ReviewPack`.

## Mode démo

Sans base ni credentials : `lib/demo/dataset.ts` fournit la société fictive
**DEMO SA** avec des constats préchargés couvrant immobilisations, provisions,
chiffre d'affaires, CCA et stocks. Un bandeau « MODE DÉMO » l'indique.

## Audit Normatif 360

Second module, complémentaire au moteur d'analyse FEC : une **base de
connaissance normative** des cycles d'audit financier, accessible sous
`/normatif`. Données versionnées en **YAML** dans `data/` (lues côté serveur
via `lib/audit-cycles/`).

- **35 cycles d'audit** (`data/cycles/*.yml`) couvrant actif immobilisé, actif
  circulant, trésorerie, capitaux propres & financement, passif & engagements,
  compte de résultat et cycles transversaux. Chaque fiche : normes applicables,
  seuils, **matérialité** (toujours paramétrable, jamais imposée), ratios &
  bornes, procédures analytiques, tests de détail, matrice des risques
  (inhérent / contrôle / **fraude**), différences **IFRS vs PCG**, sources.
- **Registre de sources** (`data/sources/*.yml`) : ISA, NEP, IAS/IFRS, PCG/ANC,
  UE, Code de commerce, CGI, AFA/Sapin II — référencées par identifiant.
- **Méthodologie** (`data/methodology/*.yml`) : matérialité, échantillonnage,
  assertions, procédures analytiques, fraude, éléments probants.
- **Fiabilité** : chaque élément porte un statut (`OBLIGATOIRE`, `RECOMMANDE`,
  `BONNE_PRATIQUE`, `PARAMETRABLE`, `A_VALIDER`). Les pourcentages de matérialité
  sont systématiquement `BONNE_PRATIQUE` avec un caveat ISA/NEP. Un contrôle
  qualité (`lib/audit-cycles/validation.ts`, route `/api/normatif/validate`,
  tests Vitest) échoue si une borne chiffrée est marquée obligatoire sans source,
  si un cycle sensible n'a pas de risque de fraude, etc.
- **Recherche** (Fuse.js), **export** JSON / CSV / Markdown (`/normatif/export`),
  et **cross-link** depuis chaque fiche vers le silo PROBANT correspondant.

> Tout le contenu est en statut « revue requise » : **citations, paragraphes et
> seuils doivent être validés par un expert audit avant toute utilisation
> opposable.**

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · Zod · lucide-react.
Déployable sur Vercel.

## Refonte : plan et avancement

Une refonte structurée en neuf lots (PR-00 → PR-08) est planifiée. Deux documents,
deux rôles distincts :

- **[Le plan](docs/refonte/PLAN_REFONTE.md)** — audit de l'existant, architecture cible,
  roadmap, prompts d'exécution. Stable, ne se réécrit pas.
- **[L'avancement](docs/refonte/SUIVI_AVANCEMENT.md)** — statut de chaque PR, blocages P0,
  ADR en attente, checklist des livrables, journal. Mis à jour à chaque PR.

Index complet de la documentation : [`docs/`](docs/README.md).

## À faire ensuite

- Persistance (PostgreSQL via Drizzle) des dossiers et décisions humaines.
- Stockage des fichiers source et artefacts (Vercel Blob).
- Export PDF du review pack (le JSON est déjà disponible).
- Formats XLSX/CSV de balance et PDF de liasse.
- Tests unitaires Vitest par règle + non-régression sur FEC de référence.
- **Validation des citations et seuils du référentiel avant production.**
