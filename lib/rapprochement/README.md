# Module « Rapprochement & Retraitements »

Confronte **deux documents** comptables/d'audit (ex. balance âgée ↔ grand-livre,
inventaire ↔ comptabilité, relevés ↔ 512, CA3 ↔ TVA) et produit des **écarts
qualifiés et sourcés**, convertis en `Finding` du modèle canonique — donc rendus
tels quels dans Synthèse (N1), Cloisons (N2) et le RailPanel (N3). Aucun univers
parallèle, aucune nouvelle page de restitution.

## Architecture (cycle-agnostique)

```
types.ts        Types (DocumentLigne, RapprochementConfig, EcartRapprochement…)
engine.ts       Moteur pur 3 niveaux (total → groupe → granulaire), déterministe
qualify.ts      Qualifie chaque écart + rattache une source du registre
to-findings.ts  Écart → Finding (réutilise lib/audit/materiality, ISA 320)
build.ts        Assemble une SiloView (état + constats) — générique
adapters/       Normalisation des formats d'entrée (tabular = csv/xlsx)
demo/           1 fichier par cycle = 2 documents + 1 config
```

**Règle d'or** : aucune citation inventée. Chaque qualification pointe vers une
clé du registre `lib/referentiel/sources` (PCG, ISA, CGI…), versionné et revu.

## Cycles couverts (démo)

| Cycle | Documents rapprochés | Cloison | Source principale |
| :-- | :-- | :-- | :-- |
| Clients | Balance âgée ↔ grand-livre 411 | Bilan actif | PCG art. 214-17 / ISA 500 |
| Fournisseurs | Balance âgée frs ↔ grand-livre 401 | Bilan passif | ISA 500 |
| Stocks | Inventaire physique ↔ comptabilité 3x | Bilan actif | PCG art. 214-19 |
| Immobilisations | Tableau immo & amort. ↔ balance 2x/28x | Bilan actif | PCG art. 214-13 |
| Trésorerie | Soldes 512 ↔ relevés bancaires | Bilan actif | ISA 505 |
| Paie | Livre de paie / DSN ↔ comptabilité 64/43 | Résultat | ISA 500 |
| Capitaux propres | Tableau de variation ↔ comptabilité 10x | Bilan passif | ISA 500 |
| Fiscal (TVA) | Déclarations CA3 ↔ comptabilité 445 | TVA & fiscalité | CGI art. 271 |

## Ajouter un cycle

Aucune modification du moteur. Créer `demo/<cycle>.ts` :

```ts
export const CONFIG_X: RapprochementConfig = {
  cycleSlug: "...",          // lien vers la fiche lib/audit-cycles
  siloId: "rapprochement-x", // + entrée dans SILOS (taxonomy.ts)
  cloison: "...",
  cles: ["tiers", "montant", "periode"],
  toleranceEur: 500,
  detecterProvision: false,  // true uniquement pour les cycles à créances
  sources: { rapprochement_solde: "..." }, // surcharge de source au besoin
};
export const buildXRapprochementSilo = (th) =>
  buildRapprochementSilo(DOC_SOURCE, DOC_CIBLE, CONFIG_X, th, { dateReference });
```

Puis l'ajouter à `demo/index.ts` (`buildAllRapprochementSilos`) et à la taxonomie.

## Brancher des données réelles

Les documents de démo utilisent `format: "demo"` (lignes déjà normalisées). Pour
des fichiers réels :

- **csv / xlsx** : décoder en enregistrements puis `documentDepuisTableur(meta, rows, mappage)`
  (adapters/tabular.ts) → `DocumentSource`.
- **FEC** : le parser existant (`lib/fec`) fournit déjà des entrées normalisées
  exposant compte, tiers (CompAuxNum), pièce, dates et lettrage.
- **PDF / EDI** : extraction binaire hors périmètre de ce module (étape ingestion).

Tout `DocumentSource` (quelle que soit sa provenance) se rapproche via le même
moteur `rapprocher(source, cible, config)`.
