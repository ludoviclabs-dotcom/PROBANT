# Mission 13 — Contrat : TVA puis IS, raccorder les moteurs fiscaux

Date : 2026-10-09. Base : `main` `a82ed3c` (Missions 08 à 12 fusionnées). Sous-lot 1 : TVA. Sous-lot 2 : IS.

## Problème utilisateur

Un auditeur doit rapprocher la TVA d'une période déclarative, puis l'IS de l'exercice, sur les vraies sources du dossier. Il passe par la chaîne de feuille de travail (import, approbation, gel, exécution, décision citée, revue distincte, verrouillage). Les moteurs utilisés sont ceux qui existent déjà (TAX-05, TAX-06).

Jusqu'ici, le cockpit `/dashboard/fiscalite` n'exécute ces moteurs que sur un dossier de démonstration. Le rapport de release TAX-10 retenait ce point comme limite P1 : aucun parcours intégré, du document à la revue.

## Principes non négociables

- **Aucun calcul fiscal nouveau.** La TVA est rapprochée par `reconcileVat` (TAX-06) et l'IS est calculé par `computeCorporateTax` (TAX-05).
- **La feuille ne fait que des soustractions** entre sorties du moteur et cases déclarées : écart, pont, paiements, continuité du crédit. Elles sont calculées côté serveur et jamais dans React.
- **Pas de millésime voisin.** Le millésime vient de la déclaration et du choix humain ; s'ils diffèrent, la feuille refuse (`FX_VINTAGE_MISMATCH`). Un millésime non publié bloque le moteur.
- **Aucune règle ajoutée.** Aucun taux, seuil, barème ni source n'est créé. Les règles bloquées affichent la source requise telle que le registre la connaît : titre, éditeur, URL, versions, dates d'effet, date de vérification.
- **Taux constatés.** Un taux est TVA ÷ base d'une même écriture. Il n'est jamais présenté comme un taux légal approuvé, car aucun barème légal de TVA n'est publié dans le registre.
- **Inconnu n'est pas zéro.** Une déclaration absente reste « absente » et un moteur bloqué n'a calculé aucun montant. Une valeur non lue reste « Inconnu ».
- **Autres taxes.** CFE, CVAE, C3S et taxe sur les salaires restent des capacités séparées, que la feuille liste explicitement comme non couvertes.
- **Pas de feu vert.** Aucune liquidation, télétransmission ou conformité déclarée. Le meilleur libellé possible est « Aucun écart sur le périmètre testé — aucune liquidation ni conformité déclarée ».

## Sous-lot 1 — TVA (livré)

### Données

Les clés de version (têtes de source) sont les suivantes :

| Source | Lecture | Clé de version (tête) |
|---|---|---|
| FEC / grand livre (`fx_fec`) | Parseur FEC historique (`lib/fec/parser.ts`). Une ligne illisible ou une écriture déséquilibrée bloque l'import. | `fx_fec` |
| CA3 / CA12 (`fx_vat_return`) | Processeur fiscal existant (`buildTaxDocumentSnapshot`, extrait sans changement de comportement de `processTaxDocument`) | `fx_vat_return:<début>:<fin>` |
| Inventaire des factures (`fx_invoices`) | Tableau qualifié | `fx_invoices` |
| Paiements au Trésor (`fx_vat_payments`) | Tableau qualifié, avec la période payée | `fx_vat_payments` |
| Pièces justificatives (`fx_support`) | Tableau qualifié | `fx_support` |

Une feuille dépend du FEC, des inventaires, de sa déclaration et de celle de la période précédente (crédit reporté).
- Une déclaration remplacée pour la même période rend la feuille périmée ; l'ancienne version est conservée.
- Une déclaration pour une autre période ne la rend pas périmée.
- Une déclaration précédente corrigée la rend périmée.

### Identité, profil et période

- **Une feuille = une période déclarative.** Mensuelle, trimestrielle ou annuelle, en mois civils entiers compris dans l'exercice. Cette période identifie la feuille et ne change jamais. Pour une autre période, on crée une autre feuille ; la navigation se fait par impôt et par période.
- **Profil.** Régime, groupe et SIREN sont confirmés par une pièce figée citée. Un régime inconnu ou non cité laisse le profil en « brouillon » : le moteur bloque au lieu de supposer.
- **Population.** Ce sont les écritures du FEC qui portent une ligne de TVA, selon la table interne 4457 / 4456 de `DEFAULT_VAT_ACCOUNT_MAP`. Les écritures hors période déclarative sont exclues avec leur date ; la sélection est reconstruite par le serveur.

### Résultat (schéma `fiscal-vat-result-1`)

- **Comparaison** comptabilisé / déclaré / écart, pour la collectée, la déductible, la nette et le crédit.
- **Pont explicatif.** Net comptabilisé, plus les explications humaines citant une pièce figée, donne le net expliqué ; le résidu est le net déclaré moins le net expliqué. Si le moteur est bloqué ou la déclaration absente, le pont est inconnu.
- **Paiements.** Somme des paiements rattachés exactement à la période, comparée à la TVA nette due déclarée.
- **Crédit reporté.** Case 27 (CA3) ou 51 (CA12) de la déclaration précédente, comparée à la case 22 (CA3) ou 24 (CA12) de la période.
- **Lignes de déclaration.** Chaque case porte son rôle (lu dans `VAT_FORM_MAPPINGS`) et les écritures liées ; chaque écriture renvoie à ses lignes FEC et à sa pièce d'inventaire (trouvée, absente ou inventaire non fourni).
- **Taux constatés**, avec leur origine : écritures, comptes de base et de TVA.
- **Contrôles du moteur.** L'écart n'est présenté que pour deux grandeurs de même nature (`VAT_COMPARABLE_CONTROLS`).
- **Règles bloquées et source requise** (`fiscal-rules.ts`).
- **Exceptions.** Elles deviennent des notes bloquantes, toutes écrites dans une seule version. Les incertitudes (moteur bloqué, FEC seul, profil non confirmé, source non couverte, information manquante) sont distinguées des écarts.

### Issue de la feuille

| Situation | Issue |
|---|---|
| Moteur bloqué | Non concluant |
| Au moins un écart (moteur, pont, paiement, crédit) | Exceptions détectées |
| Incertitude seule, ou moteur `missing_information` / `inconclusive` | Non concluant |
| Sinon | Aucun écart détecté |

### Chaîne durable

- Tables `fx_*` (migration `0013_fiscal_workpapers`), append-only par trigger.
- Revue par une autre identité, verrouillage, révision.
- Idempotence, contrôle de concurrence par version (CAS), budget de sources vérifié avant stockage.
- Parcours ouvert seulement avec le drapeau `PROBANT_FISCAL_DURABLE=disposable`, et refusé si `VERCEL_ENV=production`.

## Sous-lot 2 — IS

Voir la section IS de ce contrat lorsqu'elle est livrée. Le dispatch `fiscal-review.ts` et le champ `fiscalWork` sont déjà conçus pour l'ajouter sans toucher aux fichiers partagés.
