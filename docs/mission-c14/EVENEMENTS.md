# C14 suite — effets des événements transversaux dans le dossier de clôture

Lot rédigé le 15/10/2026, en deux étapes. Il lève la première réserve du contrat C14 (§ 6 : « les constats C05 de la carte des événements transversaux ne sont pas versés dans le dossier »).

1. **Lecture** : la projection du dossier liste, par événement, l'effet compté une fois, son étape C05 et ses feuilles sources à leur version exacte.
2. **Décisions de revue** : le journal du dossier enregistre la correction (totale ou partielle) ou l'appréciation de chaque effet ; l'étape C05 en découle par la règle C05 elle-même.

**Base.** La première étape est partie d'un instantané de la copie de travail C14 non commitée (`f8489b2`). La C14 ayant été commitée entre-temps (branche `claude/synthese-unifie-cloture-465ac8`, PR #96, `2d368ac`, qui inclut `main` avec la C13), le lot a été rejoué dessus par `git rebase --onto` sans conflit ; la seconde étape part de cette base.

## 1. Cause : avant / après

| Constat sur la base | Effet | Après le lot |
|---|---|---|
| Le dossier gardait ses seules anomalies journalisées ; la carte des événements (C11) calculait ses effets C05 à part, sur `/cutoff` | Un FNP, un PCA ou un avoir à établir compté par la carte n'apparaissait ni dans le bandeau, ni dans la synthèse, ni dans l'export du dossier | La projection du dossier liste, par événement, l'effet compté une fois, son étape C05 et les feuilles sources à leur version exacte, à côté des anomalies journalisées, sans les additionner |
| L'effet d'un événement ne portait que son montant et le nombre d'observations | Impossible de dire, sans recalcul, quelle observation portait le constat, ni à quelle étape C05 en était le groupe | Carte C11 **1.1.0** : chaque effet porte ses constats porteurs (procédure, run, version) et sa lecture C05 (`restrictExposure` : groupe complet, étape de revue, pont par poste et sens). Rien d'autre ne change dans la carte |
| Aucune décision de revue n'était possible sur un effet d'événement | Étapes toujours « en attente » ; colonnes « corrigé » et « résiduel » toujours à zéro ; aucun travail restant | Commandes `correct_event_effect` (préparation) et `assess_event_effect` (revue) : étape « corrigé », « corrigé partiellement — reste résiduel » ou « non corrigé — apprécié » ; un effet sans décision est un travail restant, comme une anomalie non appréciée |
| Un cas suspendu (recette C11, cas 8) n'avait aucune trace hors de la carte | Le dossier ne pouvait pas dire « candidat suspendu, montant inconnu » | « Candidats sans effet compté » : suspendus, divergents ou lus seulement dans des feuilles périmées, montant **inconnu**, jamais zéro |
| La règle « étape de revue → part corrigée » de C05 était écrite dans la déduplication seule | Un lecteur de la projection aurait dû la réécrire | `reviewedCluster` (C05, `lib/synthesis/exposure.ts`) : règle unique, utilisée par la déduplication et par le dossier ; comportement C05 inchangé (95 / 95) |

## 2. Lecture, sans recalcul

| Étape | Où | Ce qui est fait |
|---|---|---|
| Lecture de la carte | `lib/workpapers/payables-server.ts` (`readCutoffEvents`), `closing-server.ts` | Même activation (`PROBANT_PAYABLES_DURABLE`), même runtime, même autorisation que `GET /api/workpapers/payables?operation=events` ; TVA lue seulement si la chaîne fiscale est activée (règle C11 inchangée) |
| Moment de la lecture | `ClosingRuntime.events()` | Avant la transaction du dossier, jamais à l'intérieur : la ligne du dossier n'est verrouillée que par une connexion. Une carte d'un autre dossier ou d'une autre période n'est pas retenue ; une carte illisible est dite « non lue » avec son motif. La même lecture sert à la décision et à la vue renvoyée |
| Effets et étapes | `lib/workpapers/closing-events.ts` | Lecture de `effect.contributions` et `effect.exposure` ; la décision du journal est appliquée au groupe C05 resté « en attente » par `reviewedCluster`, puis le pont est établi par `summarizeStages` (C05) ; aucun montant, aucun sens recalculé |
| Feuilles sources | idem, `sourceOf` | Chaque observation est replacée dans sa **lignée** du dossier (une par racine, C14) : version lue courante, version antérieure ou révision antérieure ; affectation au programme ; fraîcheur des sources lue par l'**adaptateur de la famille** (`closing-adapters.ts`) |
| Dénominateurs | `evaluateClosing` → `denominators.events` | Un seul objet, calculé une fois avec les autres dénominateurs C14 ; `null` quand la carte n'est pas lue |
| Écrans et export | bandeau, carte de couverture, onglet Anomalies, synthèse, export | Une seule phrase (`eventDenominatorText`) ; les formulaires de décision sont dans l'onglet « Anomalies et limites », la synthèse reste une lecture ; l'export JSON/HTML/PDF/CSV porte décisions et pièces ; l'empreinte de la projection couvre celle de la carte (carte changée = export refusé, 409) |

## 3. Décisions de revue

| Élément | Règle |
|---|---|
| Ce que la décision vise | L'effet tel que le serveur le lit au moment de la commande : événement, montant compté une fois, sens, feuilles porteuses à leur version (« fondement », empreinte `basisHash`). Le navigateur renvoie l'empreinte qu'il a lue ; un effet changé depuis = conflit (409), jamais une décision reportée en silence. La carte étant lue avant la transaction du dossier, le serveur revérifie dans cette transaction que chaque feuille porteuse est encore la tête de sa lignée, à la version lue par la carte, sources en tête pour sa famille ; sinon, conflit (409) |
| Correction | Permission de préparation ; pièces du dossier, version courante, pas une déclaration de la direction seule (même règle que `correct_misstatement`) ; montant partiel facultatif, positif et strictement inférieur à l'effet compté une fois : le reste est résiduel. Statut C05 « corrige » |
| Appréciation | Permission de revue ; par une autre personne que les préparateurs des feuilles qui portent l'effet, ou en relecture personnelle nommée (C07), comptée à part comme condition de revue professionnelle ; seconde identité simulée : ne vaut pas appréciation. Statut C05 « valide » (non corrigé), affiché « Non corrigé — apprécié (anomalie résiduelle) » |
| Préséance | Une correction applicable prime ; une appréciation antérieure est alors « remplacée ». Une correction applicable ne se double pas et interdit l'appréciation (comme pour une anomalie) |
| Péremption | Une décision ne s'applique que si l'effet de la carte est celui vu à la décision et si ses pièces sont à jour ; sinon « à réexaminer », jamais effacée (le journal est append-only). Seul l'effet concerné change d'étape |
| Effet disparu | Décision « orpheline » listée, à réexaminer, sans blocage : aucune décision nouvelle n'est possible sur un effet absent |
| Carte non lue | Décisions conservées, « non vérifiables » ; si le dossier observe des feuilles Achats ou Clients et ventes exécutées, travail restant « carte non lue : effets inconnus » |
| Travaux restants | Effet en attente (`EVENT_EFFECT_UNTREATED`), décision à réexaminer (`EVENT_EFFECT_DECISION_STALE` ; une correction caduque bloque même si une appréciation tient), groupe indéterminé, carte non lue avec feuilles exécutées ; appréciation personnelle → condition de revue professionnelle. Indicateur « Effets d'événements traités » (n / effets comptés une fois) |
| Groupe déjà décidé par la carte | Si la carte porte un jour une étape C05 autre que « en attente », la décision du dossier n'est pas appliquée (« non appliquée ») et une nouvelle est refusée |

**Pièce « nouvelle ».** Une anomalie du journal a une date d'enregistrement : sa correction exige une pièce déposée après. Un effet de la carte n'en a pas dans le journal ; les sources des feuilles qui ont révélé le candidat ne sont jamais des pièces du dossier. La règle retenue (méthode interne) : une pièce du dossier, à sa version courante, corroborante ; si elle est remplacée, la correction est à réexaminer.

## 4. Règles et sources

| Règle | Nature | Fondement |
|---|---|---|
| Effet compté une fois par événement, groupe et pont lus dans la projection C05 de la carte | Reprise d'une règle existante | C05 (`restrictExposure`, `summarizeStages`) ; C11 (`transversal-events.ts`) |
| Étape de revue et part corrigée d'un groupe déterminé | Reprise d'une règle existante, factorisée | C05 (`reviewedCluster`, même règle que la déduplication) |
| Correction et appréciation d'un effet : mêmes exigences que pour une anomalie journalisée (pièces, montant partiel, revue par une autre personne ou relecture personnelle nommée) | Méthode interne | C14 (`correct_misstatement`, `assess_misstatement`) ; C07 (`review-kind`) ; NEP 450 citée pour le travail restant comme pour les anomalies C14 |
| Effets d'événements et anomalies journalisées : deux catégories, aucun total commun ; montants tenus par poste et par sens | Méthode interne | Socle commun ; C05 |
| Carte non lue, absente ou d'un autre dossier : effets inconnus (`null`), jamais zéro | Méthode interne | Socle commun |
| Fraîcheur comparée carte / dossier ; « non vérifiée » sans têtes de sources lues | Méthode interne | C14 (une lignée par racine, adaptateurs de famille) |

**Sources.** Aucune règle comptable ou fiscale nouvelle : aucun texte officiel n'a été lu pour ce lot. Les qualifications (FAE, PCA, FNP, avoirs, textes ANC/PCG) restent celles de la carte C11 (`docs/mission-c11/CONTRAT.md`) ; la NEP 450 n'est citée que comme dans le contrat C14.

## 5. Recette

Attendus posés à la main avant exécution, à partir de `docs/recette/c11/RECETTE.md` (F-101 FAE +1 000,00 ; F-102 PCA −2 000,00 ; AV-106 avoir à établir −500,00 ; FS-202 FNP −1 000,00 ; pont : hausse 1 000,00, baisse 3 500,00 ; 7 observations porteuses, 4 effets) et de son **cas 8** (FS-203 : FNP 400,00 suspendu). Le dossier de recette ouvre l'exercice C11 (01/04/2025 → 31/03/2026), avec Achats (P-01) et RPNE (P-02) au programme et Clients et ventes hors programme.

### Lecture (`closing-c14-events.test.ts`)

| Cas | Attendu à la main |
|---|---|
| Recette C11 dans le dossier | 4 effets en attente : FS-202 −1 000,00 (2 obs.), F-101 +1 000,00 (2), F-102 −2 000,00 (2), AV-106 −500,00 (1) ; pont du dossier = pont de la carte ; 4 travaux restants « en attente » |
| Dénominateurs | 11 événements, 19 observations (14 analyses + 5 soldes ouverts), 7 porteuses, 4 effets, 1 candidat sans effet, 0 décision — égaux à ceux de la carte |
| Feuilles sources de F-102 | Achats RUN-ACH r1 v1 et RPNE RUN-RPNE r1 v1 « candidat », comptés, retenus par P-01 / P-02 ; Clients et ventes RUN-CLI r1 v1 « solde ouvert », non compté, hors programme |
| Cas 8 / rendu concluant | FS-203 sans effet, montant inconnu ; RPNE « candidat d'omission » → effet −400,00, baisse **3 900,00** |
| Lignée, fraîcheur, carte non lue, export | Révision r2 : 4 lectures discordantes ; têtes non lues → « non vérifiée » ; carte non lue → `null` ; export 409 si la carte change |

### Décisions (`closing-c14-event-decisions.test.ts`)

| Cas | Attendu à la main |
|---|---|
| Correction partielle de F-101 | 600,00 corrigés sur 1 000,00 → résiduel **400,00** ; pont hausse : 0 en attente, 600,00 corrigé, 400,00 résiduel ; baisse inchangée (3 500,00 en attente) ; 3 travaux restants ; indicateur 1 / 4 ; totaux des anomalies inchangés (0) |
| Course carte / dossier | RPNE déjà en révision 2 dans le dossier → appréciation de FS-202 refusée (409) ; AV-106, porté par Achats seul, accepté ; source Achats remplacée depuis le gel → AV-106 refusé (409) ; rien de journalisé pour les refus |
| Refus | Effet lu périmé → 409 ; montant partiel 1 000,00, 1 200,00, 0,00, −100,00 → refusés ; déclaration de la direction seule → refusée ; événement sans effet → inconnu ; préparateur qui apprécie → 403 ; carte non lue → refusé ; rien de journalisé |
| Appréciation | FS-202 par le relecteur et AV-106 en relecture personnelle → baisse : **2 000,00** en attente, **1 500,00** apprécié non corrigé ; AV-106 en condition de revue professionnelle ; relecteur préparateur des feuilles → refusé |
| Péremption ciblée | Pièce citée remplacée → correction de F-101 à réexaminer, FS-202 intacte ; nouvelle correction sur la v2 → s'applique ; RPNE retirée pour F-101 → effet changé (1 observation), décision à réexaminer, ancienne empreinte refusée (409) ; AV-106 retiré de la carte → décision orpheline, sans blocage, 3 effets comptés |
| Carte illisible | Décision conservée « non vérifiable » ; 3 feuilles exécutées observées → travail restant « carte non lue » |
| Export | F-102 corrigé 1 500,00 → résiduel 500,00 dans le JSON ; HTML « Correction partielle 1 500,00 € — s'applique » ; CSV : pièce de correction |

### PostgreSQL (`clients-durable.integration.test.ts`, feuilles réelles de la Mission 08)

Le dossier lit la carte par `PayablesRuntime.cutoffEvents` + `eventMapRead` (composition du serveur durable) : même empreinte, mêmes nombres ; I-D 600,00 compté une fois sur Achats et RPNE ; I-G sans effet compté. Puis : ouverture du dossier, appréciation d'I-D par le relecteur (empreinte périmée refusée, 409) → étape « apprécié non corrigé », 600,00 au pont, plus de travail restant pour I-D, un événement `assess_event_effect` dans `cl_events`.

### Écran (`e2e/c14-evenements-dossier.spec.ts`, build de production)

À 1440, 1024 et 390 px : même phrase dans le bandeau, la carte de couverture, la synthèse et l'export ; `/cutoff` affiche les mêmes nombres. Parcours de décision depuis l'onglet Anomalies : correction partielle de F-101 par le préparateur (pièce citée), puis appréciation de FS-202 par le relecteur → « 2 en attente, 1 apprécié(s) non corrigé(s), 1 corrigé(s) » dans les cinq lectures ; dès 1024 px le tableau des effets tient sans défilement ; axe sans violation grave à 1440.

Contrôle des tests : cinq mutations volontaires font échouer la recette (toute observation déclarée « comptée » ; étape forcée « en attente » ; péremption de l'effet ignorée ; décision non appliquée au groupe C05 ; revérification des feuilles porteuses retirée).

### Exécutions (15/10/2026)

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit`, ESLint des fichiers touchés | Propres |
| Vitest ciblé C05 + C11 + C14 + lot (12 fichiers) | 179 / 179 |
| Vitest complet (`--pool=forks`, sans base) | 183 fichiers et 1 923 tests réussis ; 10 fichiers et 62 tests ignorés, soit exactement les recettes PostgreSQL sans URL de base (exécutées à part, ligne suivante) ; aucun échec. Le pool `threads` par défaut s'arrête en erreur de segmentation sur ce poste |
| PostgreSQL 17 jetable (cluster du scratchpad, 24 migrations) | Projet `durable` complet : 10 fichiers, 62 / 62 (dont les deux tests du lot) |
| `next build` puis Playwright (port 3147) | Lot 6 / 6 et `closing.spec.ts` 6 / 6 sur le build final ; `c11-carte-evenements.spec.ts` 3 / 3 sur le build précédent (seuls le style et l'affichage du formulaire d'appréciation du dossier ont changé depuis) |

Captures : `docs/probant-lots/c14-evenements-captures/` (synthèse et décisions à 1440, 1024 et 390 px).

## 6. Limites restantes

- **Deux lectures, pas une transaction.** La carte est lue juste avant la transaction du dossier, par son propre runtime. Une feuille modifiée entre les deux lectures apparaît comme « lecture discordante » ; une décision est refusée (409) si une feuille porteuse a avancé ou si une source a été remplacée (revérification dans la transaction du dossier, revue de PR #97) ; l'export de l'état précédent aussi. Les deux lectures ne sont pas atomiques : une feuille qui n'existait pas à la lecture de la carte n'est pas un effet de la carte.
- **Comptabilisation non vérifiée par l'outil.** « Corrigé » signifie qu'une correction est documentée par une pièce du dossier ; l'outil ne relit pas le FEC pour constater l'écriture.
- **Pas de décision « écarté ».** C05 connaît l'étape « écarté » ; le dossier ne l'offre pas (un candidat erroné se traite dans sa feuille de cycle, qui le fait disparaître de la carte).
- **TVA hors effet.** L'effet est comptable (poste résultat) ; la période de TVA et les règlements restent sur `/cutoff`.
- **Recette d'écran sur magasin mémoire.** Le navigateur lit le vrai `ClosingRuntime` et la vraie carte C11, pas PostgreSQL ni OIDC ; la composition PostgreSQL est vérifiée par la recette durable ; `closing-server.ts` (`server-only`) n'est vérifié que par le typage et le build.
- **Tableaux voisins.** Les tableaux des onglets Pièces et Programme ont une zone de défilement non focalisable au clavier (même défaut que celui corrigé ici pour les anomalies) : hors périmètre, non modifiés.
