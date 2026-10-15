# Mission C14 — Synthèse des travaux et clôture locale unifiées

Contrat de conception, rédigé le 15/10/2026. Base `main` `bb919bf` (après la PR #94, C12 Paie/Congés persistants). Le lot réutilise le dossier de clôture de la Mission 19 (PR #72 : `closing-contract`, `closing-store`, `closing-cycles`, `closing-evaluate`, `closing-decide`) et les feuilles existantes, lues à leur version courante. Aucun moteur de cycle n'est recalculé.

## 1. Cause : avant / après

| Écart constaté sur `bb919bf` | Effet | Après C14 |
|---|---|---|
| `bestObservation` retenait la feuille au rang d'état le plus élevé parmi **toutes** les racines d'une procédure de cycle | Deux comptes bancaires (deux racines) : la feuille verrouillée du compte B1 couvrait silencieusement le compte B2 en cours | Une **lignée par racine** (`sheetLineages`) ; une procédure du programme couvre **une** lignée, par rattachement explicite (`bind_sheet`) ou implicite seulement si une seule lignée est observée par une seule procédure ; sinon « Feuille à rattacher » |
| Les stores durables ne marquent pas « remplacée » une révision verrouillée : la révision 1 verrouillée et la révision 2 en brouillon coexistent | Le rang d'état retenait la révision 1 : un verrouillage ancien couvrait la nouvelle population | La feuille courante d'une lignée est la dernière révision ; les révisions antérieures restent listées, sans effet ; un rattachement enregistré sur la révision 1 devient « à confirmer » (`SHEET_REVISED`) |
| Une procédure de cycle ne pouvait être rattachée qu'à une seule procédure du programme (`CL_ENGINE_ALREADY_LINKED`) | Impossible de couvrir deux périmètres d'une même procédure (deux banques, deux périodes de TVA) | Plusieurs procédures peuvent observer la même procédure de cycle ; une feuille n'est rattachée qu'une fois (`CL_SHEET_ALREADY_BOUND`) ; une lignée hors programme s'écarte avec motif (`exclude_sheet`) |
| L'observation ignorait les sources : une source remplacée après le verrouillage ne changeait ni l'état ni l'empreinte de la feuille | Une validation de clôture restait « validée » sur une feuille périmée dans son cycle | Adaptateurs par famille (`closing-adapters.ts`) : la règle `*SourcesCurrent` de chaque famille, lue sur ses têtes de sources ; la feuille passe « Source remplacée depuis le gel », la validation et le marquage personnel deviennent périmés |
| Paie et Congés (C12) lus par la famille `hr`, mais l'écran affirmait « La paie n'a pas de feuille durable observable » | Mention fausse depuis la PR #94 | Paie et Congés listés comme les autres familles ; mention retirée |
| Dénominateurs recomptés séparément par les indicateurs, le bandeau et la carte | Rien ne garantissait l'égalité | Un objet `denominators` calculé une fois par `evaluateClosing`, lu par les indicateurs, la carte de couverture, le bandeau, la synthèse et l'export |
| Revue « par une autre personne » seule admise | En profil solo, aucune procédure ne pouvait être relue ni le dossier terminé | Relecture personnelle nommée (C07) admise et enregistrée comme telle ; elle ne compte jamais comme revue professionnelle (`professionalGaps`) ; marquage « dossier personnel terminé » avec limites visibles, distinct de la validation |
| Correction d'anomalie : tout ou rien | Une correction partielle ne laissait aucune trace du reste | Montant corrigé facultatif ; étapes C05 : en attente, appréciée (résiduelle), corrigée (preuve nouvelle), corrigée partiellement (reste résiduel), correction à réexaminer |
| Restitution et export Provisions absents | Le parcours spécialisé n'avait ni synthèse ni paquet | `operation=mission` à version exacte, export diagnostic / approuvé (JSON, CSV, HTML, PDF, manifeste), masquage confidentiel identique à la feuille |

## 2. Projection unique (`lib/workpapers/closing-projection.ts`)

`projectDossier()` est calculée par le serveur à chaque lecture, à partir de l'évaluation et du journal de la même transaction ; son empreinte `hash` nomme l'état exporté.

| Bloc | Contenu |
|---|---|
| `denominators` | Procédures (déclarées, applicables, non applicables, revues par une autre personne, relues personnellement, conclues) ; couples risque × assertion (comptés, exclus, revus, relus, en cours, sans procédure) ; feuilles outillées (applicables, verrouillées, à rattacher) ; lignées (retenues, à rattacher, écartées, hors programme, révisions antérieures, non concluantes, sources remplacées) |
| `cycles[]` | Par cycle, dans l'ordre du registre : risques et couples ; une ligne par procédure du programme : état, base de revue, **feuille rattachée** (entité, exercice, période, périmètre, racine, run, révision, version, empreinte, résultat dont « non concluant », fraîcheur des sources, approbation) ou travaux manuels (étapes, résultats, population, conclusion, revue), pièces, anomalies, contradictions, points ouverts, reste à faire, limites ; **autres feuilles listées** (à rattacher, écartées avec motif, hors programme, révisions antérieures) |
| `findings` | Anomalies avec étape C05, montant relevé, part corrigée, reste résiduel, preuve nouvelle et pièces d'origine ; contradictions (dont déclarations de la direction reçues depuis, qui ne les closent pas) ; limites d'étendue |
| `dates` | Exercice, ouverture, premier et dernier travail (dates déclarées), dernière pièce, dernière approbation d'une feuille retenue, dates déclarées (`set_milestone`), marquage personnel, validation. Aucune échéance légale calculée |
| `thresholds` | Seuils documentés (`set_threshold`) avec leur source NEP 450 et l'avertissement « pas un barème légal » |
| `completion` | Validation professionnelle, marquage personnel, travaux restants communs, conditions de revue professionnelle non remplies |
| `exclusions` | Procédures non applicables motivées, couples non applicables, demandes annulées motivées, feuilles écartées motivées, limites de capacité des cycles présents (registre unique) |

**Écrans qui la lisent.** Bandeau (`ClosingVerdict`, `data-testid="cockpit-denominators"`), carte de couverture (`matrix-denominator`), onglet « Synthèse des travaux » (`synthesis-denominator`), export (`GET /api/workpapers/closing?operation=export&format=…&snapshot=<hash>`, 409 si l'état a changé, revérification après rendu, permission `download`).

## 3. Règles

| Règle | Nature | Fondement |
|---|---|---|
| Une procédure du programme couvre une seule lignée de feuille (racine) ; plusieurs lignées exigent un rattachement explicite ; l'état le plus avancé ne choisit jamais | Méthode interne | Socle commun C14 |
| Le rattachement enregistre entité, exercice, période de la feuille, périmètre déclaré, run, révision, version, empreintes de contenu et de population | Méthode interne | Socle commun C14 |
| Une nouvelle révision ou une nouvelle population de la lignée rattachée rend le rattachement « à confirmer » ; une autre lignée non rattachée bloque la clôture si une feuille de la même procédure est déjà retenue | Méthode interne | Socle commun C14 |
| Une lignée hors programme s'écarte avec motif ; elle reste listée et sort du dénominateur des feuilles, avec mention | Méthode interne | Socle commun C14 |
| La fraîcheur des sources d'une feuille suit la règle de sa propre famille | Reprise des règles existantes | `fixedAssetSourcesCurrent`, `provisionSourcesCurrent`, `stockSourcesCurrent`, `equitySourcesCurrent`, `fiscalSourcesCurrent` ; « chaque import figé est une tête » pour Clients, Achats, Equity, Participations, Exceptionnel, Trésorerie, Paie |
| Une feuille verrouillée garde un résultat non concluant ; il est exposé, jamais reformulé | Méthode interne | Socle commun |
| Relecture personnelle nommée : admise en profil solo (identité serveur `reviewKind = personal`, nom affiché), comptée à part, jamais comme revue par une autre personne ; seconde identité simulée : ne vaut pas relecture | Méthode interne | C07 (`lib/auth/review-kind.ts`) |
| Dossier personnel terminé : relecture personnelle nommée requise ; enregistre les travaux restants et conditions de revue professionnelle comme limites visibles ; périmé par tout événement postérieur ou changement de feuille ; ne fige rien ; ne vaut ni revue professionnelle ni validation | Méthode interne | Socle commun C14 |
| Correction partielle : montant de même signe, strictement inférieur à l'anomalie connue ; refusée sur un montant inconnu ; le reste est une anomalie résiduelle | Méthode interne | Vocabulaire C05 (`lib/synthesis/exposure.ts`) |
| Une déclaration de la direction reçue après une contradiction est listée en regard ; elle ne la résout ni automatiquement ni seule | Méthode interne | Lecture de la NEP 580 §04 (Mission 19) |
| Seuils : seuil de signification, de planification, montant des anomalies manifestement insignifiantes ; montants, base et pourcentage sont des paramètres du dossier ; aucune comparaison automatique ; planification ≥ signification = incohérence factuelle | Norme (définitions) et méthode interne (montants) | NEP 450 §06, §07, §18 a) — arrêté du 28/12/2023, JO du 31/12/2023 |
| Dates déclarées : faits saisis avec auteur et pièce ; aucune échéance légale calculée | Paramètre utilisateur | — |
| Aucune opinion générée ; la validation professionnelle reste réservée à `dossier:sign` et à l'habilitation de clôture du serveur, accordée à personne par défaut | Obligation légale et méthode interne | Inchangé (Mission 19) |

## 4. Sources lues

| Source | Éditeur | URL | Passages | Version / date | Lecture |
|---|---|---|---|---|---|
| NEP 450 — Évaluation des anomalies relevées au cours de l'audit | H2A | https://h2a-france.org/normes/evaluation-des-anomalies-relevees-au-cours-de-laudit/ | §04 (anomalie significative), §05, §06 (seuil de signification), §07 (seuil de planification, inférieur au seuil de signification), §08, §18 a) (documentation du montant des anomalies manifestement insignifiantes) | Homologuée par arrêté du 28/12/2023, JO du 31/12/2023 (art. A. 821-71 C. com.) | Lue le 15/10/2026 ; aucune valeur, base ni pourcentage n'y figure |

La page H2A de la NEP 320 n'a pas été trouvée à l'adresse attendue (404) : les définitions retenues sont celles de la NEP 450 en vigueur. Aucune autre règle française nouvelle n'est introduite : la fraîcheur des sources, la relecture personnelle et les étapes d'anomalie reprennent des règles existantes du dépôt.

## 5. Journal : nouveaux événements

`bind_sheet`, `exclude_sheet`, `set_milestone`, `set_threshold`, `mark_personal_complete` (types texte du journal append-only `cl_events` : **aucune migration**). `review_procedure`, `close_review_point`, `assess_misstatement`, `assess_limitation` portent un `kind` / `reviewerName` facultatif (forme historique inchangée pour une autre identité). `correct_misstatement` porte un `correctedAmount` facultatif. Un journal antérieur se replie à l'identique (recette Mission 19 : 53 événements, 19 travaux restants, indicateurs inchangés).

## 6. Hors périmètre

- ~~Les constats C05 de la carte des événements transversaux (C11) ne sont pas versés dans le dossier.~~ Levé par le lot « C14 suite » (`docs/mission-c14/EVENEMENTS.md`) : effets lus dans la carte, à leur étape C05, à côté des anomalies journalisées et sans total commun ; aucune décision de revue sur ces effets n'est encore portée par le dossier.
- Pas d'export des pièces binaires dans le paquet du dossier (téléchargement séparé, même permission).
- La synthèse principale `/dashboard/synthese` (instantané navigateur) n'est pas recalculée : elle continue de projeter le registre ; le dossier durable est lu sur `/dossier-cloture`.
