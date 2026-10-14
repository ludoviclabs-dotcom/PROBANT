# C05 — Contrat des effets financiers : incidence, identité, doublons, fiscalité

Date : 14 octobre 2026 (second passage le même jour : projection partagée, pont par poste et sens). Contrat interne de mesure et de présentation partagé par le moteur de Synthèse (`lib/synthesis/engine.ts`, `exposure.ts`), la cartographie des risques (`lib/risk-mapping/scoring.ts`, `aggregate.ts`), la revue par cloison (`components/probant/CloisonsWorkspace.tsx`), les vues (`lib/visualization/build-datasets.ts`, `components/synthesis/ExposureWaterfall.tsx`) et les exports (note de synthèse, export JSON qui embarque le `SynthesisSnapshot`). Aucune règle comptable ou fiscale n'est tirée d'une norme : il s'agit d'un contrat de calcul et de restitution.

## 0. Une seule projection

`projectExposure(findings, sourceDocument, statusOf)` (`lib/synthesis/exposure.ts`) est l'unique calcul des effets : collecte, déduplication, pont par poste et sens, fiscalité, net. `projectSnapshotExposure(snapshot)` l'applique à un `DossierSnapshot` avec les mêmes entrées que la Synthèse (constats, événements de revue, empreinte du document source). Un périmètre (cycle de risque, silo, cloison) se lit par `restrictExposure(exposure, findingIds)` : on choisit des groupes, on ne recalcule rien. Un groupe commun à deux périmètres figure dans chacun ; les sous-totaux de périmètres ne s'additionnent pas, seul le dossier entier est dédupliqué globalement.

| Consommateur | Lecture |
|---|---|
| Synthèse (moteur, waterfall, concentration, note, élément de décision) | `buildSynthesisSnapshot` → `projectExposure` |
| Cartographie des risques (gravité par cycle, agrégats de page) | `projectSnapshotExposure(snapshot).exposure` transmis à `buildCycleScores` / `buildPageAggregates` ; sans projection fournie, repli sur `projectExposure` des seuls constats (mêmes règles) |
| Revue par cloison (en-tête, lignes de silo) | `projectSnapshotExposure` dans `ActiveCloisons`, `restrictExposure` par silo |
| Export JSON | `synthesisSnapshot.exposure` (même objet) |

## 1. Ce qui est un effet, ce qui est un signal

| Objet | Définition | Contribue à l'exposition ? | Contribue à la priorité ? |
|---|---|---|---|
| Effet financier explicite | `financialEffect` porté par le constat : montant en centimes, sens, poste, assertion, cause, période, base | oui | oui (composante « effets explicites » de la gravité) |
| Signal mesuré en EUR sans effet | `mesure` en EUR avec un écart au seuil, sans `financialEffect` | **non** : son effet comptable est inconnu | oui, qualitativement (composante « signaux EUR », sans montant) |
| Signal en %, ratio, jours | idem, autre unité | non | via densité, faisceau, fiabilité |

L'ancienne incidence `abs(constaté − seuil)` en EUR est supprimée partout : `scoring.ts`, `aggregate.ts` (premier passage), puis « Exposition cumulée » et montant par silo de la revue par cloison (calculés dans React), `DossierCounts.incidenceParCloison` (paquet de revue) et `findingFinancialIncidence` (code mort) au second passage. Le prédicat `isEurSignalWithoutEffect` vit avec la projection et sert partout. Reproduction : montant 100 000 / seuil 50 000 sans effet → exposition 0, signal listé dans `findingsWithoutEffect` et `eurSignalsWithoutEffect`, driver de gravité « Signaux EUR sans effet explicite ». Les scores de risque restent des indices internes (`isHeuristic`), jamais des probabilités calibrées.

## 2. Identité économique, version d'évaluation, empreinte de contenu

| Objet | Calcul | Rôle |
|---|---|---|
| Identité économique | `economicIdentity` explicite, sinon document source + écritures + période + poste + assertion + cause + sens | « même sous-jacent » |
| Version d'évaluation | `evaluationVersion` (entier) + `supersedesFindingId` (constat remplacé) | succession démontrée |
| Empreinte de contenu | hachage stable de identité + montant + sens + base + taux + qualification + version | « même contenu exact » |

Règles (politique `probant-exposure-aggregation` v2.1.0 ; 2.0.0 au premier passage) :

| Cas | Traitement | Sortie |
|---|---|---|
| Même identité, même empreinte, mêmes décisions de revue | répétition exacte : comptée une fois | membre `exact_repeat`, montant dans `exactRepeatsCents`, motif tracé |
| Même identité, même empreinte, décisions de revue divergentes (ex. confirmée / écartée) | **conflit** : aucune décision n'est retenue par l'ordre des identifiants | cluster `conflict`, motif « décisions de revue divergentes », limitation (revue Codex PR #78) ; politique 2.1.0 : la répétition garde son rôle `exact_repeat` (contenu compté une fois), le contenu unique est `conflicting` |
| Même identité, contenus distincts, chaîne de versions démontrée (chaque version désigne son **prédécesseur direct**, versions strictement croissantes ; deux branches issues d'une même version ne sont pas ordonnées) | dernière version retenue | membres `superseded` + `retained`, montant remplacé dans `supersededVersionsCents`, motif tracé |
| Même identité, contenus distincts, sans succession démontrée (ex. 100 et 120) | **conflit** : agrégation indéterminée | cluster `conflict`, `retainedCents: null`, bornes `[min, max]`, limitation `exposure_indeterminate` |
| Identités distinctes, même poste/période/document, écritures partiellement communes (L1/L2 et L2/L3), sans allocation par ligne | **indéterminé** : ni le maximum ni la somme ne décrit l'effet unique | cluster `indeterminate`, bornes `[plus grand membre, somme]`, détail conservé |
| Sens opposés dans un même groupe | aucune compensation | cluster `indeterminate`, direction `mixed`, bornes sans netting |
| Identités distinctes sans écriture commune | indépendants | clusters `determined`, additionnés par poste et sens |

Le maximum n'est jamais présenté comme une somme comptable. Les scalaires `grossDetectedExposureCents`, `determinedExposureCents`, `exposureBoundsCents`, `reviewedExposureCents`… sont des **volumes en valeur absolue, tous postes et sens confondus** : contrôles de cohérence du pipeline, tracés, jamais affichés comme un montant ; aucune vue ni aucun export ne les présente plus (second passage). `byCloison`, qui additionnait postes et sens d'une même cloison, est supprimé.

## 3. Étapes de l'effet, par poste et par sens

`stages[]` (`summarizeStages`) : une ligne par (poste, sens) — résultat, bilan actif, bilan passif, capitaux propres, présentation × augmentation / diminution — lue membre par membre (rôle, poste et sens du membre) puis groupe par groupe (étape de revue du représentant, portée par le groupe : `reviewStage`, `correctedCents`). Jamais additionnés entre postes ni entre sens. Invariants au centime :

`détecté − répétitions exactes − versions remplacées − hors agrégat = déterminé` ; `déterminé − écarté = initial` ; `initial = en attente + proposé + corrigé + résiduel`.

| Étape | Source | Alimente |
|---|---|---|
| `detectedCents` | tous les effets explicites | effets détectés |
| `exactRepeatsCents` | membres `exact_repeat` | déduction « répétitions exactes » |
| `supersededCents` | membres `superseded` | déduction « versions remplacées » |
| `undeterminedCents` | membres `conflicting` / `overlapping` | hors agrégat (bornes dans le groupe) |
| `determinedCents` | représentants des groupes déterminés | exposition déterminée |
| `dismissedCents` | déterminés écartés en revue | déduction « écartés » |
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
| Waterfall « De l'exposition détectée à l'effet net » | un pont par poste et sens : détecté → répétitions exactes → versions remplacées → groupes indéterminés (hors agrégat, bornes et constats en note) → écartés → **exposition initiale** → en attente → correction comptabilisée → **anomalies non corrigées** (proposé + résiduel) ; puis « Effet sur le résultat » : anomalies non corrigées du résultat, signées (seul objet où les sens d'un poste se combinent) → impôt **du poste résultat** (connu / partiel / inconnu, `null` si inconnu) → net après impôt (ou inconnu, sous-total partiel en note). Chaque pont se réconcilie au centime ; les déductions portent leur signe dans le libellé, montant en valeur absolue, jamais de « −0,00 € » |
| Concentration par cloison | exposition initiale par poste et sens (« Résultat − 312 000,00 € »), groupes indéterminés comptés, « — » sans effet |
| Note de synthèse §5 | pont par poste et sens (12 colonnes), nets par poste, groupes non déterminés avec bornes |
| Revue par cloison | en-tête : exposition initiale par poste et sens + groupes indéterminés + nombre de signaux EUR sans effet ; ligne de silo : effets du silo, « montant indéterminé » ou « effet non chiffré » |
| Cartographie des risques | gravité : masse de gravité + **poste et sens le plus exposé** (exposition initiale de la projection partagée, rapport exact au seuil, contribution plafonnée à 300 %) + signaux à effet comptable inconnu (signaux EUR sans effet et groupes indéterminés, qualitatif) ; agrégat de page `effects` = projection du dossier entier (`ScopedExposure`), plus de `totalIncidenceEur` |

Gravité et corrections : la gravité retient l'exposition initiale, correction comprise (une erreur corrigée a existé et renseigne le risque du cycle) ; un constat écarté en sort. Ce n'est pas une vue d'anomalies non corrigées.

## 6. Recette

| Cas | Preuve |
|---|---|
| Signal 100 000 / seuil 50 000 sans effet | `effects-c05.test.ts` › signal sans effet |
| Doublon exact ; répétitions exactes aux décisions de revue divergentes | › identité, versions, empreinte |
| Deux montants divergents (100 / 120), avec et sans succession démontrée ; branches v2 → v1 et v3 → v1 (conflit) ; chaîne v1 → v2 → v3 (versions remplacées tracées) | idem |
| Chevauchement L1/L2 et L2/L3 ; chaîne L1/L2, L2/L3, L3/L4 | › chevauchements et sens |
| Sens opposés | idem ; `engine.test.ts` › sens opposés |
| +1 000 avec fiscalité inconnue ; taux sans qualification ; partiel ; non déductible ; impôt du waterfall limité au résultat | › fiscalité |
| Correction totale et partielle ; corrigé sans détail | › correction comptabilisée |
| Invariance à l'ordre d'entrée, absence de double comptage, mêmes résultats vues / export | › invariance ; `build-datasets.test.ts` ; `components.test.tsx` |
| Second passage — projection partagée : signal sans effet (gravité indépendante du seuil) ; doublon exact compté une fois en gravité ; 100 / 120 en conflit sans montant en gravité, en succession 120 seulement ; L1/L2 + L2/L3 + indépendant ; postes et sens distincts (gravité sur 100 €, ni 210 € ni 60 €) ; sens opposés sur mêmes écritures ; +1 000 fiscalité inconnue dans waterfall, décision et note ; correction partielle (pont 1 000 − 600 = 400, impôt 100, net 300) et totale ; constat écarté ; deux cycles touchant le même groupe ; invariance à l'ordre (waterfall, gravité, agrégats, concentration) ; constat transmis deux fois | `effects-c05-shared.test.ts` |
| Revue par cloison : plus de cumul d'écarts, exposition par poste et sens | `components/probant/__tests__/cloisons-effects.test.tsx` |
| Parcours réel 390 / 1024 / 1440 (Synthèse, Cloisons, Risques) | `e2e/c05-effets-partages.spec.ts`, captures `docs/probant-lots/c05-captures/` |
