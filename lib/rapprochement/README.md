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
  toleranceEur: 0,          // technique uniquement ; aucun seuil de signification
  detecterProvision: false,  // signal d’ancienneté uniquement, aucune perte depuis l’âge
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

## Dépôt historique — contrat v2

Les onze cartes réutilisent ces moteurs. `build-from-upload.ts` fixe séparément
la tolérance technique (0 EUR par défaut), sans importer les 500 EUR des
fixtures. Toutes les lignes sont sélectionnées ; la signification reste inconnue
sans seuil fourni. Les montants invalides, ambigus, sous-centime ou hors plage
sont refusés par la frontière monétaire existante.

`engine.ts` conserve les lignes sans clé, mesure les écarts bruts par clé et par
signe et distingue groupes univoques, écarts, groupes multiples ambigus et lignes
non testables. Le taux représente des lignes univoques concordantes, pas un
rapprochement de totaux nets ni une assurance d’exhaustivité.

L’entité, la période civile et les bases de comparaison sont confirmées dans
`upload-contract.ts`. Une qualification absente conserve seulement un diagnostic
bloqué ; aucune année courante n’est inventée. La clôture explicite est transmise
au moteur pour l’ancienneté. Le lettrage reste indépendant de la dépréciation.

Le snapshot versionne les exécutions par dossier et cycle, périme les anciennes
versions dès modification et retire leurs constats actifs. Les mutations de
session passent par `updateSnapshot` et sa file séquentielle. Ce parcours utilise
la session de l’onglet, sans archivage des fichiers originaux ni raccord durable
pour ces cartes. Les dossiers persistants restent bloqués sur ce parcours.
