# Mission 09 — contrat Trésorerie `cash.reconciliation@1.0.0`

Date : 2026-10-08. Base : `origin/codex/mission07-security` (`fce26de`, = main `fdf1c12` + Mission 07 Clients #58), fusionnée dans la branche `claude/tresorerie-pont-bancaire-5aa635`. Validation **technique** d’un contrat de calcul interne ; aucune règle comptable, fiscale ou professionnelle nouvelle, aucun seuil, aucune opinion.

Méthode interne (`authority: internal`) : la règle `cash.reconciliation@1.0.0` relie `reconcileCash` et `clearCash` (moteurs existants de `lib/workpapers/cash.ts`) à des sources importées, qualifiées et approuvées. La classification « banque / caisse / VMP » est un **paramètre déclaré par le mapping** (colonne nature), pas une déduction des numéros de compte du PCG.

## Questions professionnelles

1. Le solde du relevé à la clôture, ajusté des suspens de l’ERB, reconstitue-t-il le solde comptable (GL) de chaque compte bancaire ? (pont)
2. L’ERB fourni concorde-t-il avec ses sources indépendantes : solde banque de l’ERB = relevé, solde comptable de l’ERB = GL, arithmétique interne ? (écarts de source)
3. Les suspens de la clôture sont-ils apurés par des mouvements des relevés postérieurs d’une fenêtre documentée, corrigés par une pièce, ou restent-ils ouverts ? (apurement)

Assertions **visées, non validées** (`validation: proposed`) : existence et exhaustivité des soldes bancaires à la clôture, séparation des exercices des suspens. Risques visés : suspens anciens ou fictifs, chèques non débités durablement, écart de source masqué par une compensation. Risques **non couverts** par cet écran : relevés altérés de façon cohérente, comptes non déclarés au GL, lapping, confirmations bancaires.

## Sources, champs et formats

Mapping fermé `cash-reconciliation-1` (CSV/XLSX, 3 Mio, mapping explicite, signe ±1 par import, EUR). Chaque ligne porte banque, référence de compte et devise.

| Type | Base | Contenu | Refus explicites (code + ligne physique) |
| --- | --- | --- | --- |
| `cash_ledger` | `ledger_closing` | Une ligne par compte de trésorerie : compte GL (clé), solde comptable EUR, date = clôture, banque, référence, **devise du compte**, nature `banque`/`caisse`/`vmp` | date ≠ clôture, nature inconnue, devise non ISO, identité banque/compte dupliquée |
| `cash_statement` | `statement_closing` | Solde du relevé à la clôture par compte | devise ≠ EUR (`CASH_CURRENCY_UNSUPPORTED`), date ≠ clôture, doublon par compte |
| `cash_erb` | `reconciliation_statement` | Lignes `solde_comptable`, `solde_banque` (datées clôture) et suspens `remise_non_creditee` (> 0), `paiement_non_debite` (< 0), `autre_suspens` (≠ 0) datés ≤ clôture ; explication, pièce | signe incohérent (`CASH_ITEM_SIGN_INCONSISTENT`), suspens après clôture, solde dupliqué |
| `cash_settlements` | `subsequent_statement` | Mouvements des relevés postérieurs : crédit positif, débit négatif, clôture < date ≤ revue | hors fenêtre clôture → revue, montant nul |
| `cash_support` | `correction_support` | Pièces de correction postérieures rattachées à un compte | date > revue |

Toute ligne de relevé, d’ERB, de mouvement ou de pièce dont la banque/référence n’appartient pas à la population est **refusée** au gel (`CASH_ACCOUNT_UNKNOWN`, « mauvaise banque »), jamais ignorée. Chaque source garde ses propres en-têtes : l’identité est lue par document (`columnsByDocument`), jamais par libellé ni alias.

**Convention de signe** `cash-sign-1` : montants signés, positif augmente le solde comptable ; relevé + suspens = solde reconstitué. Validée par l’identité serveur qui fige les sources (`validatedBy`, `validatedAt`).

## Population, unité, période, exclusions

- Unité : **compte** = ligne du GL de clôture (`Population.unit = "account"`). Le dénominateur existe avant tout résultat.
- Exclusions motivées calculées par le serveur, visibles : nature caisse ou VMP (procédures distinctes, non couvertes par ce pont) ; devise du compte ≠ EUR (aucune conversion implicite). Sélection : tous les autres comptes, sans échantillon.
- Suspens : unité = ligne de suspens de l’ERB d’un compte testé ; exclusions du test par le préparateur, avec motif obligatoire (statut « non testé »).
- Période : clôture et date de revue de la feuille ; fenêtre ultérieure `début > clôture`, `fin ≤ revue`, couverture `documentée` (relevé postérieur importé et approuvé obligatoire) ou `incomplète`.

## Calculs (serveur uniquement)

Par compte testé, à partir des seules valeurs sources (jamais réécrites) :

- reconstitué = relevé + Σ suspens ; **écart du pont** = GL − reconstitué ;
- **écarts de source** : ERB comptable − GL ; ERB banque − relevé ; arithmétique ERB = comptable − banque − Σ suspens ; brut des suspens non expliqués.

Ces quatre grandeurs ne sont **jamais additionnées** entre elles ni entre comptes ; aucun total d’exposition.

Apurement (`clearCash`) : allocations règlement → suspens (même compte, même sens, montant > 0, cumul ≤ |règlement| et ≤ |suspens|, règlement daté dans la fenêtre documentée), corrections (pièce du même compte, datée ≤ revue, motif), exclusions motivées. Les apurements postérieurs ne modifient jamais les soldes ni l’ERB à la clôture (invariant vérifié par le schéma de résultat).

## États et sens textuel

| Statut | Sens affiché |
| --- | --- |
| Apuré | Intégralement retrouvé sur un relevé postérieur de la fenêtre documentée, par allocation validée ; clôture inchangée |
| Partiellement apuré | Une partie seulement retrouvée ; le reste demeure ouvert et à expliquer |
| Ouvert | Expliqué par l’ERB mais non retrouvé dans la fenêtre ; ni erreur ni régularité démontrée |
| Corrigé | Traité par une pièce de correction, pas par un mouvement bancaire ; clôture inchangée |
| Non testé | Fenêtre incomplète, exclusion motivée ou pont non calculable : aucune conclusion |
| Non expliqué | Aucune explication dans l’ERB, ou règlement daté avant la clôture alors que le suspens figure à l’ERB |

« Non expliqué » est l’état existant du moteur `clearCash`, conservé et affiché comme sixième statut plutôt que fondu dans « ouvert ».

Bloqué / inconnu / non concluant : relevé ou solde ERB absent → pont **non calculé** (`BRIDGE_SOURCE_MISSING`, montant inconnu, jamais zéro) ; fenêtre incomplète → apurement non testé (`WINDOW_INCOMPLETE`) ; source invalide → import ou gel refusé avec code et localisateur.

## Exceptions, preuves, jugement

Exceptions (contrôle, code, compte, cible, message, montant, preuves) : `BRIDGE_DIFFERENCE`, `ERB_BOOK_SOURCE_DIFFERENCE`, `ERB_BANK_SOURCE_DIFFERENCE`, `ERB_ARITHMETIC_DIFFERENCE`, `SUSPENSE_OPEN`, `SUSPENSE_PARTIALLY_CLEARED`, `SUSPENSE_UNEXPLAINED` ; incertitudes `BRIDGE_SOURCE_MISSING`, `WINDOW_INCOMPLETE`. Chaque exception devient une note bloquante à l’exécution ; sa résolution documente un traitement, elle ne retire pas l’exception du résultat.

Chaque montant est relié à sa ligne source (document versionné, ligne physique, empreinte, approbation). Le jugement humain porte sur l’explication des suspens ouverts, la conclusion, puis la revue par une **autre** identité autorisée et le verrouillage.

## Chaîne durable et sécurité

Tables `cash_*` dédiées (migration `0007_cash_reconciliation`, append-only par déclencheurs), même modèle que Clients : import approuvé → population figée → exécution versionnée → soumission → revue distincte → verrouillage ; verrou de dossier, comparaison de version, idempotence liée à l’acteur et au contenu ; source remplacée → travail périmé, ancienne décision intacte, nouvelle révision. Routes `/api/workpapers/cash` (lecture, commandes, téléchargement), `/imports`, `/export`. Corps stricts : aucun rôle, auteur, approbation ou résultat accepté du navigateur. Activation : `PROBANT_CASH_DURABLE=disposable`, fermée si `VERCEL_ENV=production`.

## Exemple synthétique de recette

Banque 90,00 + remise non créditée R1 15,00 − chèque non débité P1 5,00 = GL 100,00 ; écart du pont 0,00 ; ERB concordant. Relevés postérieurs : S1 +15,00 le 03/01/2025 alloué à R1 → R1 apuré ; P1 non retrouvé au 28/02/2025 → **ouvert, 5,00 restant**. Variante partielle : S1 = 10,00 → R1 partiellement apuré, 5,00 restant. Ce résultat concordant ne démontre pas l’authenticité des relevés.
