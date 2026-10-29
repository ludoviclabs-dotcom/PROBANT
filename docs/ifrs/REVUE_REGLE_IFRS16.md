# Relecture de la règle `ifrs16.leases` 1.0.0 — à faire par l'utilisateur

État au 29/10/2026 : **à revoir** (`review_required`). Tant que cette relecture n'est pas consignée, aucune exécution réelle n'est possible : le registre de calcul bloque toute feuille réelle (`rule_not_applicable`). Les scénarios synthétiques et les tests restent possibles.

Cette relecture est un acte personnel et nommé (C00, D17). Elle est distincte de la relecture d'un dossier : valider la règle ne valide aucun dossier. Aucun outil ni aucune session ne la fait à ta place.

## Ce qui a été préparé

| Élément | Où | État |
|---|---|---|
| Fiche de règle | `lib/ifrs/leases/rule.ts` (`leaseRuleBasis`) | Paragraphes, sources, conventions internes, 10 cas de référence, 34 exclusions |
| Sources lues | [`SOURCES.md`](./SOURCES.md) | § 5-38, annexe A, B3-B42, C1 et les décisions IFRIC 09/2019 et 11/2019, **par extraction outillée et paraphrase** |
| Cas de référence | [`RECETTE_REFERENCE.md`](./RECETTE_REFERENCE.md), `recette/attendus_l16.json` | Le moteur rend les 10 fixtures de l'oracle au centime, et les valeurs exactes à 10⁻²⁰ près |
| Texte de l'Union européenne | Règlement 2023/1803 | **Non lu** : EUR-Lex renvoie une page vide (quatre essais au 29/10/2026). Seule la juridiction IASB est validable |

## Les quatre conditions à confirmer

1. **Lecture mot à mot** des paragraphes cités, sur le texte officiel IASB : § 5-8, 9-15, 18-27, 29-33, 36-38, annexe A (commencement, durée, paiements, paiements fixes, taux implicite, taux marginal, courte durée, coûts directs initiaux, avantages incitatifs, garantie de valeur résiduelle), C1. Vérifier que les paraphrases de `SOURCES.md` § 2 ne trahissent pas le texte.
2. **B9-B33** (identification et séparation des composantes) lus, et cohérents avec le dictionnaire : actif identifié, droit de substitution substantiel, avantages économiques, droit de diriger l'utilisation, composantes séparées. Voir [`DICTIONNAIRE_L16.md`](./DICTIONNAIRE_L16.md), champs `identifiedAsset`, `controlOfUse`, `serviceComponents`.
3. **Conventions internes acceptées comme telles**, jamais attribuées à IFRS 16 : virgule fixe à 40 décimales, arrondi au centime, publication par soldes, taux annuel effectif, calendrier mensuel, bornes de 1 à 120 mois, amortissement linéaire arrondi en cumul, reprise historique seulement si l'ouverture est cadrée au centime.
4. **Cas de référence examinés** : relire au moins F01, F03, F08 et F09 dans `recette/attendus_l16.json`, et leur traduction dans les tests du moteur (`lib/ifrs/leases/__tests__/engine.test.ts`).

## Consigner la relecture

Dans `lib/ifrs/leases/rule-review.ts`, remplacer `null` par :

```ts
export const LEASE_RULE_REVIEW: LeaseRuleReview | null = {
  reviewedBy: "Ton nom",
  reviewedAt: "2026-11-02T10:00:00.000Z",
  jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true },
};
```

Ensuite :
- la fiche devient `validated`, avec ton nom et la date ;
- la règle devient `validated` et l'exécution réelle s'ouvre, pour la seule juridiction IASB ;
- les tests qui vérifient l'état « à revoir » sont à mettre à jour dans le même commit relu : `lib/ifrs/shared/__tests__/contracts.test.ts`, `lib/workpapers/__tests__/lease-socle.test.ts` et `lib/workpapers/__tests__/lease-durable.integration.test.ts` ;
- passer aussi `data/ifrs/standards.yml` (`ifrs-16`) à `verified` et tenir `docs/knowledge/REVIEW_REQUIRED.md` à jour.

Une juridiction `EU_adopted` reste bloquée en réel (X33) tant que le texte de l'Union européenne n'est pas lu.
