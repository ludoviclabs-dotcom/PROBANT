# Mission 10 — contrat Immobilisations `fixed_assets.review@1.1.0` (1.0.0 : Mission 10 ; 1.1.0 : C06)

Date : 2026-10-08. Base : `main` `b8c7d7f` (PR #60 Trésorerie fusionnée ; Mission 07 incluse ; Mission 08 encore sur `codex/mission07-security`). Validation **technique** d’un contrat de calcul interne : aucune règle comptable, fiscale ou professionnelle nouvelle, aucune durée, aucun seuil de capitalisation, aucun prorata ni valeur résiduelle par défaut, aucune opinion.

Méthode interne (`authority: internal`) : la règle `fixed_assets.review@1.0.0` raccorde les trois moteurs existants de `lib/workpapers/fixed-assets.ts` à des sources importées, qualifiées et approuvées :

- `fixedAssetMovements` (et son pont par tableau, désormais exporté sous `movementBridge`) : un pont **par actif et par tableau**, Brut, Amortissements et Dépréciations séparés ;
- `recalculateDepreciation` : recalcul linéaire, seulement sur méthode documentée et paramètres sourcés ;
- `frameFixedAssets` : cadrage registre → GL par compte. Sans export du module « immobilisations », l’appel se fait avec `module = null` et rapproche directement registre et GL ; aucun module n’est fabriqué.

Modifications des moteurs, toutes additives : contexte réel dédié (`assertFixedAssetsContext`, procédure `fixed_assets.review`), éligibilité d’une méthode réelle (`fixedAssetMethodEligible` : identifiant, version, source citée, base, auteur, validité à la clôture, preuve vérifiée), `module` facultatif dans `frameFixedAssets`. L’atelier synthétique reste inchangé (86 tests `demo-cycles` et `fixed-asset-review` verts).

## C06 — fin de plan d’amortissement (règle 1.1.0, 14/10/2026)

**Défaut corrigé.** En 1.0.0, `recalculateDepreciation` recevait coût, résiduel, durée et prorata, mais pas le cumul d’amortissement antérieur : il plafonnait à la base totale. Actif 12 000, résiduel 0, 60 mois, cumul d’ouverture 12 000 → 2 400 recalculés au lieu de 0 ; une dotation comptabilisée par erreur sur un plan échu passait sans écart.

**Sources lues.**

| Texte | Version / empreinte | Articles | Effet | Utilisation |
| --- | --- | --- | --- | --- |
| PCG — règlement ANC n° 2014-03, version consolidée au 1er janvier 2026 (S1, `pcg-2026-01-01` du résolveur C04) | PDF ANC 183 p., SHA-256 `55c824b2…806fc1e` (URL `recueil/2026`) et `b9e7a732…3ff2766e` (URL `Reglements/Recueils`), identiques aux empreintes du résolveur | 214-1, 214-4, 214-6, 214-8, 214-9, 214-11 à 214-14, 214-17 | édition consolidée applicable à compter du 01/01/2026 | règles ci-dessous |
| Recueil des normes comptables françaises 2024 (édition du dossier de recette, exercice 2024 ; `pcg-2024` du résolveur C04, « inaccessible » lors de C04) | PDF ANC 677 p., modifié le 20/03/2024, SHA-256 `f608f78f…82479303`, lu le 14/10/2026 | 214-4, 214-8, 214-9, 214-12, 214-13, 214-14, 214-17 | édition consolidée 2024 | même numérotation et même texte que l’édition 2026 pour ces articles |

**Règles appliquées (citées, non étendues).** Montant amortissable = valeur brute − valeur résiduelle (art. 214-4) ; l’amortissement commence à la date de début de consommation des avantages, généralement la mise en service (art. 214-12) ; répartition systématique du montant amortissable selon le plan (art. 214-13 ; dotation conforme au plan à la clôture, art. 214-11) ; toute modification significative de l’utilisation prévue et toute dotation ou reprise de dépréciation modifient le plan ou la base amortissable **de manière prospective** (art. 214-14, 214-17) ; VNC = brut − amortissements cumulés − dépréciations (art. 214-6) ; composants à plans propres (art. 214-9) ; amortissements dérogatoires en provisions réglementées (art. 214-8).

**Choix internes (non normatifs), assumés comme tels.** Le cumul antérieur est l’ouverture du tableau Amortissements du registre (ligne sourcée) ; absent, il reste inconnu. La fin du plan est calculée « début + durée en mois − 1 jour », un jour absent du mois d’arrivée étant ramené à son dernier jour ; elle situe le segment et ne sert jamais à calculer un prorata, qui reste une donnée sourcée. Un plan révisé ou déprécié n’est pas recalculé dans ce lot : il est isolé avec son motif.

**Calcul 1.1.0 (plan d’origine inchangé).** A = coût − résiduel ; C0 = cumul d’ouverture ; R = A − C0 ; annuité = A × 12 ÷ durée × n ÷ d (arrondi au centime, demi supérieur) ; fin = mise en service + durée − 1 jour. Dotation attendue = 0 si le plan est échu avant l’ouverture, sinon min(annuité, R). Incohérences du cumul (exception `PLAN_ACCUMULATED_INCONSISTENT`) : C0 > A ou C0 ≠ 0 pour un plan qui commence dans l’exercice (dotation inconnue, recalcul bloqué) ; plan échu non soldé (reliquat A − C0 signalé, dotation 0) ; montant amortissable soldé avant la fin du plan (dotation 0).

**État du plan** (résultat `fixed-assets-result-2`, champ `recalculation.plan`) : `unchanged` (recalculé), `revised` (segment déclaré par la colonne « début de segment » des paramètres : bloqué, base du segment non validée), `impaired` (dépréciation inscrite au registre : bloqué, la VNC n’est pas la base restante), `base_changed` (entrée ou reclassement de l’exercice sur un actif déjà inscrit : exclu), `unknown` (dépréciations ou cumul d’ouverture absents : bloqué). Le segment porte début, fin, origine, méthode, version et source citée.

**Couverture du premier lot.** Couverts : plans linéaires d’origine inchangés, fin de plan, dernière annuité, plafond au restant, composants inscrits comme unités. Exclus ou bloqués avec motif : changement de durée, de résiduel ou de méthode (segment révisé), dépréciation, entrée ou reclassement sur un actif inscrit, sortie et sortie partielle, méthodes non linéaires, amortissement dérogatoire et durée d’usage fiscale. Aucun seuil de 500 €, aucune durée par défaut.

**Versions.** Règle et gabarit 1.1.0, programme 1.1.0. Les feuilles 1.0.0 et leurs résultats `fixed-assets-result-1` restent consultables ; la synthèse les marque périmées ; toute commande autre que la révision (exécution, configuration, notes, conclusion, soumission, revue, verrouillage) est refusée (`FA_RULE_REPLACED_REVISION_REQUIRED`) ; une révision adopte le gabarit 1.1.0. Les contrôles d’une feuille portent la version de règle avec laquelle leur résultat a été calculé (1.0.0 pour une feuille ancienne). La comparaison versionnée montre le passage 1.0.0 → 1.1.0 actif par actif.

## Questions professionnelles

1. Pour chaque actif ou composant et chaque tableau, l’ouverture plus les mouvements de l’exercice reconstituent-ils la clôture du registre ? (ponts)
2. Le registre à la clôture concorde-t-il, compte par compte, avec le GL / la balance ? (cadrage)
3. Les entrées et sorties brutes sont-elles appuyées par une pièce du même actif, de même nature, montant et date ? (pièces)
4. La dotation comptabilisée concorde-t-elle avec un recalcul fondé sur une méthode documentée et des paramètres sourcés ? (recalcul)

Assertions **visées, non validées** (`validation: proposed`) : exhaustivité et exactitude des mouvements ; évaluation (dotation conforme à la méthode documentée). Risques visés : mouvement non saisi ou mal saisi, sortie non comptabilisée, écart registre / GL, dotation erronée. **Non couverts** : existence physique (inventaire), indices de perte de valeur et valeur actuelle, recherche de dépenses à immobiliser, méthodes non linéaires, crédit-bail, actifs réévalués, financiers ou en devise.

## Sources, champs et formats

Mapping fermé `fixed-assets-1` (CSV/XLSX, 3 Mio, colonnes nommées explicitement, signe ±1 par import, EUR). Une ligne = un montant.

| Type | Base | Contenu | Refus explicites (code + ligne physique) |
| --- | --- | --- | --- |
| `fa_register` (requis) | `asset_register` | Un mouvement d’un tableau d’un actif/composant : identifiant de ligne, montant, date, actif, composant facultatif, famille, tableau (`brut`, `amortissement`, `depreciation`), mouvement (`ouverture`, `entree`, `sortie`, `reprise`, `reclassement`, `cloture`), statut (`en_cours`, `en_service`, `sorti`), compte GL, traitement (`standard` ou motif d’exclusion), libellé et pièce facultatifs | signe (`FA_MOVEMENT_SIGN_INVALID`), reclassement nul, hors exercice, ouverture non datée du début, clôture non datée de la clôture, reprise hors dépréciations, double ouverture/clôture, statut/famille/traitement ou compte incohérents pour un même actif, valeurs inconnues |
| `fa_ledger` (requis) | `ledger_closing` | Un compte : solde signé débit positif à la clôture, tableau du compte | date ≠ clôture, tableau inconnu, compte déclaré pour un autre tableau que dans le registre (`FA_LEDGER_TABLE_MISMATCH`) |
| `fa_parameters` (conditionnel) | `depreciation_parameters` | Un actif : montant = valeur résiduelle, date = mise en service, référence de méthode, durée en mois, prorata n/d ; facultatif (C06) : début du segment en cours si le plan a été révisé | résiduel négatif, durée mal formée, prorata mal formé ou n > d, doublon, actif inconnu (`FA_ASSET_UNKNOWN`), début de segment mal formé, antérieur ou égal à la mise en service ou postérieur à la clôture (`FA_SEGMENT_START_INVALID`) |
| `fa_support` (conditionnel) | `movement_support` | Une pièce : référence, montant ≥ 0, date ≤ revue, actif, nature (`acquisition`, `cession`, `mise_en_service`) | nature inconnue, montant négatif, date après la revue, actif inconnu |

Une valeur **vide** de durée, de prorata ou de méthode n’est pas refusée à l’import : elle reste « SOURCE REQUISE » au calcul. Une valeur **mal formée** est refusée. Un tableau absent pour un actif n’est jamais réputé nul.

**Convention de signe** `fa-sign-1`, validée par l’identité serveur qui fige les sources : registre positif dans le sens de chaque tableau ; GL débit positif ; au cadrage, le brut est comparé tel quel, amortissements et dépréciations en valeur opposée.

## Méthodes documentées

Le préparateur documente chaque méthode : identifiant (référencé par les paramètres), version, nature `linear` ou `not_covered`, libellé, **source citée** (politique du client, décision), validité, base amortissable. Le serveur horodate l’auteur ; une méthode inchangée garde son auteur d’origine. Aucune méthode n’est proposée par défaut. Une méthode `not_covered` exclut explicitement ses actifs du recalcul avec motif.

**Changement de méthode** : la commande `configure` retire le résultat courant (état `ready`), l’écran signale la modification en attente, une **exécution explicite** est requise ; le serveur compare ensuite le recalcul à la dernière version exécutée de la même lignée (`compareFixedAssetRecalculations`, méthode / entrées / recalcul avant → après, variation calculée côté serveur). Une source de paramètres remplacée rend la feuille périmée ; la révision suivante est comparée à la révision précédente.

## Population, unité, période, exclusions

- Unité : **actif ou composant** (`Population.unit = "asset"`), une entrée par actif du registre figé, mesurée au brut de clôture. Un actif sans brut de clôture est refusé (`FA_GROSS_CLOSING_REQUIRED`), jamais compté à zéro.
- Sélection : tous les actifs au traitement `standard` ; exclusions motivées par le serveur (crédit-bail, réévaluation, financier, devise, autre complexe). Le cadrage registre → GL porte, lui, sur **tous** les actifs du registre (ils partagent les comptes).
- Période : début d’exercice, clôture et date de revue de la feuille ; mouvements datés dans l’exercice ; pièces au plus tard à la revue (la mise en service peut être postérieure à la clôture).

## Calculs (serveur uniquement)

- Pont par actif et par tableau : attendu = ouverture + entrées − sorties − reprises ± reclassements ; **écart = clôture observée − attendu**. Les trois tableaux ne sont jamais additionnés. VNC = brut − amortissements − dépréciations, présentée comme différence arithmétique.
- Pont par famille : sommes des seuls actifs calculés, avec dénominateur (`computedUnits / inScopeUnits`), écart net **et** écarts bruts non compensés.
- Cadrage : registre converti (convention `fa-sign-1`) − GL, par compte ; compte présent d’un seul côté ou registre incomplet → non rapprochable.
- Pièces : registre − pièce (montant) ; date comparée séparément.
- Recalcul (1.1.0) : (coût − résiduel) × 12 ÷ durée × prorata n/d, arrondi au centime demi supérieur, **plafonné au montant amortissable restant = coût − résiduel − cumul d’ouverture**, 0 si le plan est échu avant l’ouverture ; coût = brut de clôture ; **écart = dotation comptabilisée (entrées du tableau Amortissements) − dotation recalculée**. En 1.0.0, le plafond était la base totale (voir § C06).

## États et sens textuel

| Domaine | États |
| --- | --- |
| Tableau d’un actif | Calculé · Incomplet (ouverture, clôture ou tableau absent) · Exclu (actif complexe) |
| Pièce d’un mouvement | Pièce concordante · Montant différent · Date différente · Pièce absente |
| Recalcul | Recalculé · Bloqué (source ou paramètre requis ou incohérent) · Non applicable (en cours sans paramètres, sorti, mise en service postérieure) · Exclu (méthode non couverte, sortie partielle, actif complexe) |
| Contrôle | Exceptions détectées · Non concluant · Aucune exception sur le périmètre testé |

Causes de blocage du recalcul, affichées telles quelles : paramètres absents ; méthode absente ; méthode non documentée ; méthode non applicable à la clôture ; durée ou prorata absents ; tableau Brut incomplet ; pièce de mise en service absente ou date divergente ; statut « en cours » incompatible avec une mise en service antérieure à la clôture ; résiduel supérieur au coût ; (1.1.0) cumul d’ouverture absent ; dépréciations non établies ou inscrites ; segment révisé déclaré sans base validée ; cumul incohérent avec le plan.

## Exceptions, preuves, jugement

Exceptions : `MOVEMENT_DIFFERENCE`, `FRAME_DIFFERENCE`, `SUPPORT_AMOUNT_DIFFERENCE`, `SUPPORT_DATE_DIFFERENCE`, `RECALCULATION_DIFFERENCE`, `PLAN_ACCUMULATED_INCONSISTENT` (1.1.0). Incertitudes : `TABLE_INCOMPLETE`, `FRAME_SCOPE_INCOMPLETE`, `SUPPORT_MISSING`, `RECALCULATION_BLOCKED`. Chacune devient une note bloquante à l’exécution ; sa résolution **documente** l’explication (ex. « écart −1,00 : mise au rebut non saisie, PV R-17 ») sans retirer l’exception du résultat. Chaque montant est relié à sa ligne source (document versionné, ligne physique, empreinte, approbation). Jugement humain : explication des écarts, conclusion, revue par une **autre** identité, verrouillage.

## Chaîne durable et sécurité

Tables `fa_*` dédiées (migration `0008_fixed_assets`, append-only par déclencheurs), même modèle que Clients et Trésorerie : import approuvé → population figée → exécution versionnée → soumission → revue distincte → verrouillage ; verrou de dossier, comparaison de version, idempotence liée à l’acteur et au contenu ; source remplacée → travail périmé, ancienne décision intacte, révision. Routes `/api/workpapers/immobilisations` (lecture, commandes, téléchargement), `/imports`, `/export`. Corps stricts : aucun rôle, auteur, approbation ou résultat accepté du navigateur. Activation : `PROBANT_FIXED_ASSETS_DURABLE=disposable`, refusée si `VERCEL_ENV=production`.

## Exemple synthétique de recette C06 (`FA_C06_CSV`)

Exercice 2024, méthode LIN-2024, attendus posés à la main : N-01 neuf (12 000, 01/04/2024, 60 mois, 9/12) → 1 800 ; E-01 déjà amorti à 100 % (plan échu le 31/12/2023) → 0, comptabilisé 2 400 → **écart +2 400** ; L-01 dernière annuité 6/12 → 1 200 ; L-02 même plan 12/12 → 2 400 plafonnée à 1 200 ; R-01 résiduel 2 000 → 2 000 (restant 2 500) ; I-01 cumul 13 000 > 12 000 → bloqué, cumul incohérent (excès 1 000) ; P-01 mise en service 10/02/2025 → non applicable ; M-01 segment révisé déclaré au 01/01/2024 → bloqué ; D-01 dépréciation 1 000 → bloqué ; B-01/TOITURE composant (120 mois) → 3 000 ; X-01 sorti → non applicable. Cadrage registre → GL sans écart sur 2154, 2315, 28154 et 2915.

## Exemple synthétique de recette

Exercice 2024, revue au 31/03/2025. A-001 (presse, matériel industriel) : ouverture 100,00 + entrée 20,00 (FAC-001) − sortie 10,00 (CES-001) = 110,00 attendu ; clôture 109,00 → **écart −1,00**, à expliquer ; sortie partielle → recalcul exclu. A-002 : 60,00 × 12 ÷ 60 × 12/12 = 12,00 recalculé = 12,00 comptabilisé. A-003 : méthode absente → bloqué. A-004 : en cours, mise en service le 10/02/2025 → non applicable. A-005 : résiduel 50,00 > coût 45,00 → bloqué. T-001 : réévalué → exclu. Cadrage : huit comptes, aucun écart. Sans GL : gel refusé, `FA_SOURCES_REQUIRED`. Aucun de ces résultats ne démontre l’existence physique ni la valeur des biens.
