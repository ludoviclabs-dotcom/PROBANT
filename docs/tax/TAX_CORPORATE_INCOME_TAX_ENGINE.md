# TAX-05 — moteur d'impôt sur les sociétés

## Objet et frontière

TAX-05 exécute le calcul que TAX-04 se contentait de planifier : passage du
résultat comptable au résultat fiscal, imputation des déficits, ventilation par
taux et impôt brut, puis confrontation à la déclaration et à la comptabilité.

Le moteur **propose**. Il ne liquide pas l'impôt, ne télétransmet rien et ne
qualifie aucune non-conformité.

### Périmètre

| Couvert | Hors périmètre |
| --- | --- |
| Société française à l'IS, mono-entité | Groupes fiscalement intégrés |
| Réel normal (2058-A) et réel simplifié (2033-B) | Pilier 2 |
| Un exercice, millésime publié | Contribution exceptionnelle grandes entreprises |
| Taux normal et taux réduit PME | Crédits d'impôt complexes |
| Report en avant des déficits | Intérêts de retard et pénalités |

Un cas hors périmètre produit une `TaxLimitation` explicite et un snapshot
`blocked` : jamais un calcul dégradé silencieux.

## Chaîne de calcul

```text
résultat comptable            WA / WS      (2058-A)   ou 312 / 314 (2033-B)
  + réintégrations confirmées WR                      ou 316/318/322/324
  − déductions confirmées     XH
  = résultat fiscal avant déficits         comparé à XI / XJ
  − déficits imputés          XL           plafond CGI art. 209, I
  = base imposable                         comparé à XN / XO
  → ventilation par tranche                comparé à la 2065
  → impôt brut
```

Les retraitements **candidats** (issus des comptes) sont calculés et affichés
mais n'entrent jamais dans la chaîne retenue.

## Provenance des taux

Les taux ne sont pas dans le code. `data/tax/rates/is-rate-schedules.json` porte,
par exercice et millésime :

- chaque tranche avec son taux en points de base, son plafond de base en centimes
  et ses conditions machine-vérifiables ;
- la règle de plafonnement du report déficitaire ;
- pour chaque élément, la règle TAX-01 et la version de source qui l'ancrent.

`lib/knowledge/tax-rate-schedule.ts` refuse de démarrer si une tranche cite une
règle ou une version de source absente du registre. Un changement de millésime
est donc un **ajout de donnée**, pas une modification de moteur ; un millésime
absent reste absent, sans repli sur le barème voisin.

### Conditions : évaluées sur le fait qu'elles désignent

Chaque condition porte un `profileInput`. Le moteur résout ce fait dans une table
explicite (`PROFILE_FACTS`) et vérifie que son type correspond à l'opérateur. Un
fait absent de la table, d'un type incompatible, ou non renseigné dans le profil
rend la condition `unknown` — **jamais** satisfaite par substitution d'un autre
fait. Un barème ne peut donc pas accorder un taux sur une condition que le moteur
n'a pas réellement vérifiée.

Si aucune tranche applicable ne peut absorber la base imposable, le moteur émet
la limitation `TAXABLE_BASE_NOT_ALLOCATABLE` et bloque : il n'attribue pas le
reliquat d'office à la dernière tranche.

## Règles de prudence appliquées

| Règle | Mise en œuvre |
| --- | --- |
| Les taux viennent du registre | Barème injecté ; aucun littéral de taux dans `lib/tax/corporate-tax/` |
| Taux réduit seulement si toutes ses conditions sont renseignées | `evaluateEligibility` ; une condition `unknown` ⇒ tranche non appliquée |
| Une condition inconnue produit `missing_information` | `REDUCED_RATE_ELIGIBILITY_UNKNOWN` + `taxImpactStatus: "estimated"` |
| Un compte ou un libellé ne produit qu'un candidat | `origin.kind === "ledger"` ⇒ `status: "candidate"`, vérifié aussi par le schéma |
| Une réintégration confirmée exige source et preuve | Rejet à la construction et au parsing |
| Aucun intérêt ni pénalité | Note `NO_INTEREST_NO_PENALTY` ; seul l'impôt brut est produit |
| Aucune compensation silencieuse | Bénéfice et perte déclarés ensemble ⇒ blocage, pas de net |
| Chaque ligne porte son signe et sa source | `sign`, `signedAmountCents`, `origin`, `sourceRefs` par ligne |

Ces invariants sont vérifiés **deux fois** : à la construction de chaque pièce, et
sur le snapshot complet, que `finalize()` fait passer par
`CorporateTaxSnapshotSchema` avant de le rendre. Un snapshot qui violerait « base
intégralement ventilée », « impôt = somme des tranches » ou « pas de
non-conformité confirmée » ne sort jamais du moteur.

## Contrats livrés

| Contrat | Rôle |
| --- | --- |
| `CorporateTaxComputationEngine` | Calcul déterministe, tracé et rejouable |
| `CorporateTaxSnapshot` | Résultat figé, hashé, validé par `CorporateTaxSnapshotSchema` |
| `TaxReconciliationLine` | **Réutilisé** du modèle canonique ; produit par le moteur pour chaque comparaison |
| `CorporateTaxFindingFactory` | Traduit le snapshot en `TaxFindingDetails` rattachés à un contrôle du catalogue |
| `CorporateTaxNote` | Note explicative ; une note `method` exige une citation |

## Jeu de données du waterfall

`snapshot.waterfall.steps` expose les neuf étapes dans l'ordre de la
spécification. `runningTotalCents` suit la chaîne **retenue** (éléments confirmés
seulement) ; les étapes proposées portent leur magnitude dans `deltaCents` et
laissent le cumul inchangé. La borne incluant les candidats est exposée à part
par `proposedTaxResultCents`.

## Exactitude en centimes

Tous les montants sont des entiers de centimes. Les produits `base × taux`
passent par `bigint` : au-delà de quelques centaines de millions d'euros, le
calcul en `number` sortirait de la plage sûre. L'arrondi est celui déclaré par
le barème (`half_up_cent`), donc tracé et non implicite.

## Tests golden

`lib/tax/corporate-tax/__tests__/engine.golden.test.ts` couvre les douze
scénarios exigés — bénéfice sans retraitement, perte, taux réduit éligible,
éligibilité inconnue, passage partiel, réintégration, déduction, déficit, liasse
incohérente, FEC et liasse différents, formule sans donnée, changement de
millésime — plus la provenance des taux, l'arrondi, le déterminisme et le régime
simplifié. Chaque scénario impose le montant exact en centimes à chaque étape.

## Dette connue (TAX-05.1)

- les **codes de case** (`WA`, `WS`, `WR`, `XH`, `312`…`372`) restent dans
  `liasse.ts`. Ils sont validés contre le millésime publié — une case inconnue du
  millésime produit une limitation — mais un millésime qui renommerait ses cases
  exigerait une modification de code, pas seulement de donnée ;
- `PROFILE_FACTS` ne couvre que les trois faits utiles au taux réduit. Un barème
  futur citant un autre fait obtiendra `unknown` jusqu'à ce que le fait soit
  ajouté à la table ;
- `engine.ts` dépasse 1 500 lignes ; l'extraction de `deficit.ts` et
  `rate-allocation.ts` est identifiée mais volontairement différée.

## Ce que TAX-05 ne fait pas

- aucune persistance ni API : `CorporateTaxSnapshot` reste en mémoire (TAX-08) ;
- aucun rattachement à un `Finding` générique : `TaxFindingDetails` est produit,
  la cloison et le silo restent du ressort de TAX-07 ;
- aucune lecture du FEC : les observations comptables sont fournies par l'appelant
  via `ledgerObservations`, ce qui préserve la discipline « candidat seulement ».
