# C05 — Contrat des effets financiers : incidence, identité, doublons, fiscalité

Date : 14 octobre 2026. Contrat interne de mesure et de présentation partagé par le moteur de Synthèse (`lib/synthesis/engine.ts`, `exposure.ts`), la cartographie des risques (`lib/risk-mapping/scoring.ts`, `aggregate.ts`), les vues (`lib/visualization/build-datasets.ts`, `components/synthesis/ExposureWaterfall.tsx`) et les exports (note de synthèse, manifeste). Aucune règle comptable ou fiscale n'est tirée d'une norme : il s'agit d'un contrat de calcul et de restitution.

## 1. Ce qui est un effet, ce qui est un signal

| Objet | Définition | Contribue à l'exposition ? | Contribue à la priorité ? |
|---|---|---|---|
| Effet financier explicite | `financialEffect` porté par le constat : montant en centimes, sens, poste, assertion, cause, période, base | oui | oui (composante « effets explicites » de la gravité) |
| Signal mesuré en EUR sans effet | `mesure` en EUR avec un écart au seuil, sans `financialEffect` | **non** : son effet comptable est inconnu | oui, qualitativement (composante « signaux EUR », sans montant) |
| Signal en %, ratio, jours | idem, autre unité | non | via densité, faisceau, fiabilité |

L'ancienne incidence `abs(constaté − seuil)` en EUR est supprimée partout (`scoring.ts`, `aggregate.ts`). Reproduction : montant 100 000 / seuil 50 000 sans effet → exposition 0, signal listé dans `findingsWithoutEffect` et `eurSignalsWithoutEffect`, driver de gravité « Signaux EUR sans effet explicite ». Les scores de risque restent des indices internes (`isHeuristic`), jamais des probabilités calibrées.

## 2. Identité économique, version d'évaluation, empreinte de contenu

| Objet | Calcul | Rôle |
|---|---|---|
| Identité économique | `economicIdentity` explicite, sinon document source + écritures + période + poste + assertion + cause + sens | « même sous-jacent » |
| Version d'évaluation | `evaluationVersion` (entier) + `supersedesFindingId` (constat remplacé) | succession démontrée |
| Empreinte de contenu | hachage stable de identité + montant + sens + base + taux + qualification + version | « même contenu exact » |

Règles (politique `probant-exposure-aggregation` v2.0.0) :

| Cas | Traitement | Sortie |
|---|---|---|
| Même identité, même empreinte | répétition exacte : comptée une fois | membre `exact_repeat`, montant dans `exactRepeatsCents`, motif tracé |
| Même identité, contenus distincts, chaîne de versions démontrée (chaque version désigne la précédente, versions strictement croissantes) | dernière version retenue | membres `superseded` + `retained`, motif tracé |
| Même identité, contenus distincts, sans succession démontrée (ex. 100 et 120) | **conflit** : agrégation indéterminée | cluster `conflict`, `retainedCents: null`, bornes `[min, max]`, limitation `exposure_indeterminate` |
| Identités distinctes, même poste/période/document, écritures partiellement communes (L1/L2 et L2/L3), sans allocation par ligne | **indéterminé** : ni le maximum ni la somme ne décrit l'effet unique | cluster `indeterminate`, bornes `[plus grand membre, somme]`, détail conservé |
| Sens opposés dans un même groupe | aucune compensation | cluster `indeterminate`, direction `mixed`, bornes sans netting |
| Identités distinctes sans écriture commune | indépendants | clusters `determined`, additionnés par poste et sens |

Le maximum n'est jamais présenté comme une somme comptable : `determinedExposureCents` ne contient que les groupes déterminés ; `exposureBoundsCents` encadre le total avec les groupes indéterminés ; `aggregationStatus` le dit.

## 3. Étapes de l'effet, par poste et par sens

`stages[]` : une ligne par (poste, sens) — résultat, bilan actif, bilan passif, capitaux propres, présentation × augmentation / diminution. Jamais additionnés entre postes.

| Étape | Source | Alimente |
|---|---|---|
| `initialCents` | groupes déterminés non écartés | exposition initiale |
| `pendingCents` | statut de revue non clos | en attente d'arbitrage |
| `proposedCents` | statut `valide` / `confirmed` | ajustement proposé (non comptabilisé) |
| `correctedCents` | statut `corrige` / `corrected`, montant `correction.amountCents` (sinon effet entier) | correction comptabilisée |
| `residualCents` | effet − correction | anomalie résiduelle |

Un statut `corrected` n'alimente jamais une vue d'anomalies non corrigées : `uncorrectedSignedCents` = proposé + résiduel seulement. Un constat écarté ou remplacé (`superseded`) ne contribue à aucune étape.

## 4. Incidence fiscale et net

| Situation de l'effet d'ajustement | Impôt | Net du poste |
|---|---|---|
| taux explicite ET qualification `deductible` | `applyRatePct(montant signé, taux)` | connu si tous les effets du poste le sont |
| qualification `non_deductible` ou `reclassification` | 0, connu | idem |
| qualification `temporary_difference` | inconnu : réservé au moteur fiscal (C10, scénario avant/après) | inconnu |
| taux absent | inconnu | inconnu |
| taux explicite SANS qualification | inconnu : un taux ne qualifie pas la déductibilité | **aucun net validé** |

`tax.status` ∈ connu / partiel / inconnu ; `netByTarget[].netAfterKnownTaxCents` est `null` dès qu'un effet du poste est inconnu, et `partialNetKnownSubsetCents` est le sous-total partiel, nommé comme tel, sur les seuls effets qualifiés. Reproduction : +1 000 € validé sans taux → brut +1 000, impôt inconnu, net inconnu, limitation `tax_incidence_unknown`. Interface C10 : `taxIncidence { provider: "none", method: "before_after_is_scenario", pendingFindingIds }`.

## 5. Vues et exports

| Vue | Lecture |
|---|---|
| Élément de décision « Ajustement proposé (résultat) » | proposé signé sur le résultat ; net après impôt ou « inconnu » ; autres postes comptés, non additionnés |
| Waterfall « De l'exposition brute à l'effet net » | brut → répétitions exactes → groupes indéterminés (hors agrégat, bornes) → déterminé → écartés → en attente → proposé (résultat) → impôt (connu / partiel / inconnu, étape `null` si inconnu) → net sur le résultat après impôt (ou inconnu, sous-total partiel en note) |
| Note de synthèse §5 | agrégats, tableau par poste et sens, nets par poste, groupes non déterminés |
| Cartographie des risques | gravité : masse de gravité + effets explicites + signaux EUR (qualitatif) ; total page = effets explicites dédupliqués par constat |

## 6. Recette

| Cas | Preuve |
|---|---|
| Signal 100 000 / seuil 50 000 sans effet | `effects-c05.test.ts` › signal sans effet |
| Doublon exact | › identité, versions, empreinte |
| Deux montants divergents (100 / 120), avec et sans succession démontrée | idem |
| Chevauchement L1/L2 et L2/L3 ; chaîne L1/L2, L2/L3, L3/L4 | › chevauchements et sens |
| Sens opposés | idem ; `engine.test.ts` › sens opposés |
| +1 000 avec fiscalité inconnue ; taux sans qualification ; partiel ; non déductible | › fiscalité |
| Correction totale et partielle ; corrigé sans détail | › correction comptabilisée |
| Invariance à l'ordre d'entrée, absence de double comptage, mêmes résultats vues / export | › invariance ; `build-datasets.test.ts` ; `components.test.tsx` |
