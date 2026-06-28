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

## Stack

Next.js 15 (App Router) · TypeScript strict · Tailwind CSS 4 · Zod · lucide-react.
Déployable sur Vercel.

## À faire ensuite

- Persistance (PostgreSQL via Drizzle) des dossiers et décisions humaines.
- Stockage des fichiers source et artefacts (Vercel Blob).
- Export PDF du review pack (le JSON est déjà disponible).
- Formats XLSX/CSV de balance et PDF de liasse.
- Tests unitaires Vitest par règle + non-régression sur FEC de référence.
- **Validation des citations et seuils du référentiel avant production.**
