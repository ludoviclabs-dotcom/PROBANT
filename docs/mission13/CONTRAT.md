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

## Sous-lot 2 — IS (livré)

### Données et identité

- **Une feuille par exercice** (`is.computation`). L'exercice identifie la feuille ; une période déclarative est refusée (`FX_CIT_PERIOD_IS_THE_EXERCISE`).
- **Sources.**
  - FEC de l'exercice (`fx_fec`) ;
  - liasse et 2065 (`fx_cit_return`), lues par le processeur fiscal existant, une tête par formulaire et par exercice : `fx_cit_return:<formulaire>:<début>:<fin>` ;
  - pièces justificatives (`fx_support`).

  Une déclaration de TVA ne périme jamais la feuille IS ; une liasse corrigée la périme. Une liasse déposée comme déclaration de TVA est refusée (`FX_DECLARATION_TYPE_MISMATCH`).
- **Population.** Les écritures du FEC portant une ligne de résultat (classes 6 et 7 du PCG, table interne `CIT_ACCOUNT_MAP` documentée), avec leur effet signé sur le résultat. Les écritures hors exercice sont exclues avec leur date.
- **Profil confirmé par une pièce citée** : régime (réel normal 2058-A ou simplifié 2033-B), intégration fiscale, chiffre d'affaires, libération et détention du capital. Une donnée absente reste inconnue. Si l'éligibilité au taux réduit est inconnue, ce taux n'est pas appliqué et l'impôt est seulement estimé (`REDUCED_RATE_ELIGIBILITY_UNKNOWN`, issue non concluante).
- **Millésime.** Il est égal à celui des formulaires figés (`FX_VINTAGE_MISMATCH` sinon). Un millésime ou un barème non publié bloque le moteur, sans aucun repli sur un millésime voisin.

### Résultat (schéma `fiscal-cit-result-1`)

- **Résultat comptable cadré.** Le résultat des classes 6 et 7 du FEC (après impôt), la charge d'IS 695, le résultat avant impôt et la dette 444 sont comparés au résultat déclaré (WA / WS, ou 312 / 314 en régime simplifié).
- **Base avant ou après impôt et pont fiscal documenté.** Résultat de départ, plus les réintégrations documentées, moins les déductions documentées, donne le résultat documenté. Le résidu est le résultat fiscal avant déficits déclaré (XI / XJ, ou 352 / 354) moins le résultat documenté.
  - Un seul retraitement d'IS comptabilisé est admis, en réintégration, et uniquement sur une base après impôt.
  - Toute autre combinaison est refusée : **double ajustement d'IS** (`FX_CIT_DOUBLE_TAX_ADJUSTMENT`), au gel comme à la configuration.
- **Retraitements documentés.** Chacun cite une pièce figée (ligne du FEC ou pièce justificative) et, le cas échéant, une source du registre (titre, URL, couverture, date de vérification). Le moteur reprend déjà les totaux déclarés (WR, XH) ; on distingue donc :
  - un retraitement qui **documente** la déclaration : il n'est jamais ajouté une seconde fois au calcul ;
  - une **correction proposée**, absente de la déclaration : elle entre dans le calcul comme ajustement confirmé. Elle exige une source du registre couvrant tout l'exercice (`FX_CIT_CORRECTION_SOURCE_REQUIRED`, `FX_CIT_SOURCE_UNKNOWN`, `FX_CIT_SOURCE_NOT_COVERED`).
- **Calcul du moteur** `computeCorporateTax` : étapes de la chaîne retenue, tranches du barème publié avec conditions et sources, IS brut. Le calcul est absent (et non nul) si le moteur est bloqué.
- **Rapprochements du moteur** : résultat fiscal déclaré, bases 2065, charge 695 et dette 444 comptabilisées.
- **Règles bloquées et source requise.** Exemple : exercice 2024, règle « Barème d’IS non publié pour l’exercice 2024 », dont la source requise précise que seuls les exercices 2026 sont publiés. La version applicable du CGI art. 219 n'est pas publiée pour cette période.

### Issue

Même règle que pour la TVA.
- **Incertitudes** : moteur bloqué, profil non confirmé, liasse absente, source non couverte, information manquante.
- **Exceptions** : résultat non cadré, résidu du pont, écart du moteur, correction proposée.

Les incertitudes deviennent des notes `missing_evidence`, créées dans la même écriture que l'exécution.

## Sources officielles

**Aucune règle, aucun taux, aucun barème et aucune source n'a été ajouté ni modifié par cette mission.** Le registre (`data/tax/*`, vérifié le 16/08/2026) est seulement lu.

Les ruptures qu'il contient restent des blocages explicites :
- versions de CGI art. 269 et 289 arrêtées au 31/08/2026 (recodification) ;
- CGI art. 271 effectif à compter du 21/02/2026 ;
- version de CGI art. 39 « à vérifier » : citée, jamais couvrante ;
- barème d'IS publié pour 2026 seulement ;
- millésimes de formulaires 2026 seulement.

Publier une version successeur exige de consulter la source officielle applicable et d'enregistrer, pour chaque version :
- titre, organisme, URL et article ;
- dates d'effet et date de consultation ;
- limites d'application.

C'est une décision humaine, hors de cette mission.
