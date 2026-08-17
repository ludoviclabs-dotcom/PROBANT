# TAX-REM-01 — sécurité des entrées et des calculs IS / TVA

## Baseline

- SHA : `8362fc62f3dd5b03b62a96d67695a741d2bcbd72`
- branche : `codex/tax-rem-01-calculation-safety-v2`
- audit Cowork : absent de la baseline ; conformément à TAX-REM-01 V2, l'audit Work et les reproductions imposées ont servi de spécification.

## Défauts initiaux et reproduction

Les tests positifs permanents ont été écrits puis exécutés avant la correction dans `lib/tax/__tests__/tax-rem-01.reproduction.test.ts`.

Résultat baseline : 12 tests exécutés, 7 échecs et 5 succès. Les échecs reproduisaient notamment :

- WA absente / WS à zéro et WA à zéro / WS absente concluaient `computed` ;
- un WS portant `amountCents < 0` et `sign=negative` concluait `computed` et pouvait devenir un bénéfice ;
- un calcul bloqué exposait encore `grossTaxCents=0` ;
- la lecture déclarative ne distinguait pas `valid`, `normalized_with_warning`, `invalid` et `missing` ;
- le bucket TVA d'autoliquidation convertissait une base absente en zéro, puis calculait un théorique et un écart certains.

Après correction, le fichier contient 13 tests et passe intégralement.

## C-1 — invariant des montants déclaratifs

### Cause racine

`amountCents` acceptait des entiers négatifs dans le modèle canonique. Le moteur appliquait ensuite le sens économique de la case de perte en faisant `-amountCents`, ce qui transformait une valeur déjà négative en bénéfice.

### Invariant retenu

- `amountCents` est une magnitude entière sûre, positive ou nulle ;
- le signe natif éventuellement lu est conservé dans `field.sign` ;
- les cases imprimées alternatives de bénéfice/perte restent orientées par leur rôle dans le mapping du formulaire ;
- le moteur n'applique jamais une seconde fois le signe natif à la magnitude ;
- une valeur négative arrivant par la frontière d'ingestion est convertie en magnitude absolue avec `DECLARATION_AMOUNT_SIGN_NORMALIZED`, reçoit `sign=negative`, passe en `needs_manual_review` et n'est pas exploitable automatiquement ;
- une valeur canonique négative injectée en contournant la frontière est `invalid` et bloque le calcul.

La frontière de lecture expose explicitement `valid`, `normalized_with_warning`, `invalid` ou `missing`. Aucune normalisation n'est silencieuse.

### Avant / après

- avant : `WS=-5 000 000`, `sign=negative` pouvait produire `+5 000 000` ;
- après : le schéma canonique rejette la valeur ou la frontière l'explicite et impose une revue ; le moteur ne calcule aucun IS ;
- une perte canonique valide conserve un résultat négatif et un `grossTaxCents` réel égal à zéro.

## H-1 — absence WA / WS

### Cause racine

La lecture du résultat comptable utilisait `profit?.amountCents ?? 0` et `loss?.amountCents ?? 0`. La présence de la case était donc perdue avant la décision.

### Comportement corrigé

- WA absente / WS zéro : bloqué ;
- WA zéro / WS absente : bloqué ;
- WA et WS absentes : bloqué ;
- WA et WS présentes à zéro : résultat nul calculable ;
- WA non nulle seule : bénéfice calculable ;
- WS non nulle seule : perte calculable.

Les cas indisponibles produisent `ACCOUNTING_RESULT_UNAVAILABLE`, `status=blocked`, un outcome non positif, `taxImpactStatus=not_computed`, aucune tranche et `grossTaxCents=null`. Les diagnostics de présence, lisibilité, millésime et invariant sont conservés dans la limitation.

## H-4 — base TVA absente

### Cause racine

L'agrégation par taux utilisait `baseAmountCents ?? 0`. Une TVA sans base rattachable créait ainsi un bucket à base zéro, une TVA théorique zéro et une différence égale à toute la TVA comptabilisée.

### Comportement corrigé

- une base absente reste `null` dans le bucket ;
- `vatTheoreticalCents`, `differenceCents` et le total théorique restent `null` si un bucket collecté est incomplet ;
- `base_not_linked` reste présent sur la transaction ;
- `VAT.THEORETICAL.BY_RATE` produit `missing_information` et la limitation `VAT_THEORETICAL_BASE_UNAVAILABLE` ;
- une note demande le rattachement à la base HT ou à la pièce, sans qualifier l'absence d'incohérence certaine ;
- une base réelle zéro avec taux connu produit explicitement un théorique et un écart nuls ;
- une base positive conserve le calcul nominal.

## Tests ajoutés ou renforcés

- WA seule, WS seule, WA/WS absentes, chacune absente avec l'autre à zéro, toutes deux à zéro ;
- bénéfice, perte, gros montant et déterminisme ;
- montant canonique négatif incohérent et normalisation tracée à l'ingestion ;
- base TVA absente, zéro, positive, taux connu avec base absente, TVA sans base et autoliquidation partielle ;
- assertions sémantiques du golden `vat-reverse-charge` avant actualisation du hash ;
- contrats de sortie bloqués avec `grossTaxCents=null`.

## Golden cases

Le comportement baseline de `vat-reverse-charge` était : base collectée absente transformée en zéro, TVA théorique zéro, écart artificiel et outcome `reconciliation_difference`.

Le comportement attendu et désormais testé est : base/théorique/écart `null`, signal `base_not_linked`, contrôle `missing_information`, recommandation de rattachement et absence d'écart certain.

Hashes IS modifiés :

- `is-inconsistent-return` : `305438429f9c8fe134a64b2c924ca67ecad9ed18bf077fcc17c329deb30c6c93` → `786df5411eafb9101c29731585ce708f9bacbaa6bf8f7b383434050fe95937c9` ;
- `is-missing-declaration` : `2f7b76e5b8843bd15490605c5ba6795eabff6d83a38bf1f184745962d1036c3a` → `4fe975b0b3e2ef33a7eaeb04c2a339018838009ced9cbf8336977cdd44121fae`.

La modification commune des hashes TVA provient du statut explicite ajouté aux diagnostics de lecture déclarative inclus dans le snapshot canonique. Le changement de contenu propre à `vat-reverse-charge` inclut en plus la propagation de `null` et le nouvel outcome prudent.

| Golden TVA | Ancien hash | Nouveau hash |
|---|---|---|
| `vat-ca3-exact` | `e08d210e2d042897008a261d40288aef1452ce55960ba8f5a4b62d4e959de5ea` | `88c4ec92cb0bb488d0c56b72880aa67205e1732e75dc715c512548cfa383f7b1` |
| `vat-collected-difference` | `0fd499a7a59ec2f4828ee461833288c0fbff89626b1e7bccb9496e454ed96710` | `b749943833d068f15e67504b9cdc899ed5acde755da42c53aefcb8b6b2687f43` |
| `vat-deductible-difference` | `f496194c47c58a059a4f58a7b6c62d5bf35fe8612a60a23a7ae692ae40925def` | `9b103ecb76a9cd3a280ae2757ca4990d5b80d85c66b583a000581cd63063196f` |
| `vat-missing-invoice` | `77a105ad2e2a4e45e74712b08460366e8d4a15cd02fff3b2dedca19865b39ef4` | `b9344478b7a54e4b05ff82de1a687b6c40eab0993ce1ebaba6e87438bfda5ebc` |
| `vat-multiple-rates` | `8d4e61e210bba208cda29aa939f48b08c6facbee2bda7116b4e543b5aa16ab3d` | `3b8232a13122f88c8491568d63d17acb01238ef57bf622deb04895e6e2200332` |
| `vat-credit-note` | `c2a16b99c0968a3be9dc856c31d483da569c1e36d8d9dc457015e9dfe2a972c5` | `1e72e3a91175ec5fedeb9e0f84f7e821ff14d173bbd19484a0151e64c3e3cab8` |
| `vat-credit` | `89a65fb7384ec12a859aaa99331c1463f7aba4bfce1a31618c2def0497db5e52` | `72aad40c7ada3953301781961d357e171055f57d2c76d9b9a21f5956baa27ef9` |
| `vat-reverse-charge` | `464678b7ec3ecd75283b162d9d6c3a122096d760985023f335e096377ae7e91b` | `2637163f6180a1b33cbf83b05f837be89d8c70f4ba0ae2ac09445f5f7b57c58c` |
| `vat-shifted-period` | `21e9f32db9ace5bf9484278e08345e54bb2689485742ed7af69a4459af7bd73a` | `b1b0010d2a52fce6d7d2b600c3a55a4129e0e52e1ceb16927c899ebace05cdd5` |
| `vat-ca12` | `ab6424ff262c0185b0dcc7f50c7ff587fa990d010e94387bda2c76c717cf3248` | `55fdb178c82b2ad8f79e03c4c9803c557bcef3e3afe5f4f3f6e4491449ce784f` |
| `vat-unknown-regime` | `b3b9e1ff51faaec0dcaac2c692df6d5087200c7154d237de7464af84f4bc7e3d` | `c54c15c93b1a4738aae6755fee7d7562b3e28ba38cba56f9c6aaf456ce114f3a` |

## Limitations restantes

- les formulaires 2026 restent `review_required` ; leur statut normatif n'a pas été modifié dans cette remédiation ;
- la normalisation d'un signe natif requiert une revue humaine et n'est volontairement pas réactivée automatiquement ;
- les cases de perte imprimées comme magnitudes sont orientées par le mapping WA/WS ou 312/314, tandis que `field.sign` conserve le signe natif ;
- aucun autre sujet fiscal ou produit n'est corrigé par cette branche.

## Fichiers modifiés

- modèle et schémas : `lib/canonical-model/tax.ts`, `lib/tax/schemas.ts` ;
- ingestion et lecture : `lib/ingestion/tax-document-processor.ts`, `lib/tax/declaration-reading.ts` ;
- IS : moteur, types, schéma, preuve et tests corporate ;
- TVA : agrégation par taux, moteur, datasets, types, schéma et tests ;
- release : assertions et hashes des golden cases ;
- documentation : ce rapport et `docs/tax/audit/CONVERGED_TAX_ENGINE_REMEDIATION.md`.

`data/tax/forms/form-vintages-2026.json` n'est pas modifié.
