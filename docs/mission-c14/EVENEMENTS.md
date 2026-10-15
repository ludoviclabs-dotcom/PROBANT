# C14 suite — effets des événements transversaux dans le dossier de clôture

Lot rédigé le 15/10/2026. Il lève la première réserve du contrat C14 (§ 6 : « les constats C05 de la carte des événements transversaux ne sont pas versés dans le dossier »).

**Base.** La C14 n'était pas commitée au démarrage : le lot part d'un instantané exact de sa copie de travail (`f8489b2`, parent `bb919bf`, worktree `cockpit-fiscalite-dashboard-1c1ba9`, pris sans toucher à son index). Une fois la C14 commitée, rejouer les commits du lot par `git rebase --onto <commit C14> f8489b2`. `main` a avancé depuis (`32df44d`, PR #95 Emprunts) : la fusion avec `main` reste celle de la C14.

## 1. Cause : avant / après

| Constat sur la base | Effet | Après le lot |
|---|---|---|
| Le dossier gardait ses seules anomalies journalisées ; la carte des événements (C11) calculait ses effets C05 à part, sur `/cutoff` | Un FNP, un PCA ou un avoir à établir compté par la carte n'apparaissait ni dans le bandeau, ni dans la synthèse, ni dans l'export du dossier | La projection du dossier liste, par événement, l'effet compté une fois, son étape C05 et les feuilles sources à leur version exacte, à côté des anomalies journalisées, sans les additionner |
| L'effet d'un événement ne portait que son montant et le nombre d'observations | Impossible de dire, sans recalcul, quelle observation portait le constat, ni à quelle étape C05 en était le groupe | Carte C11 **1.1.0** : chaque effet porte ses constats porteurs (procédure, run, version) et sa lecture C05 (`restrictExposure` : groupe, étape de revue, pont par poste et sens). Rien d'autre ne change dans la carte |
| Un cas suspendu (recette C11, cas 8) n'avait aucune trace hors de la carte | Le dossier ne pouvait pas dire « candidat suspendu, montant inconnu » | « Candidats sans effet compté » : suspendus, divergents ou lus seulement dans des feuilles périmées, montant **inconnu**, jamais zéro |

## 2. Lecture, sans recalcul

| Étape | Où | Ce qui est fait |
|---|---|---|
| Lecture de la carte | `lib/workpapers/payables-server.ts` (`readCutoffEvents`), `closing-server.ts` | Même activation (`PROBANT_PAYABLES_DURABLE`), même runtime, même autorisation que `GET /api/workpapers/payables?operation=events` ; TVA lue seulement si la chaîne fiscale est activée (règle C11 inchangée) |
| Moment de la lecture | `ClosingRuntime.events()` | Avant la transaction du dossier, jamais à l'intérieur : la ligne du dossier n'est verrouillée que par une connexion. Une carte d'un autre dossier ou d'une autre période n'est pas retenue ; une carte illisible est dite « non lue » avec son motif |
| Effets et étapes | `lib/workpapers/closing-events.ts` | Lecture de `effect.contributions`, `effect.exposure` et `bridge.stages` de la carte ; aucun montant, aucune étape, aucun sens recalculé |
| Feuilles sources | idem, `sourceOf` | Chaque observation est replacée dans sa **lignée** du dossier (une par racine, C14) : version lue courante, version antérieure ou révision antérieure ; affectation au programme (retenue par P-xx, à rattacher, écartée, hors programme) ; fraîcheur des sources lue par l'**adaptateur de la famille** (`closing-adapters.ts`, déjà appliqué à l'observation) |
| Dénominateurs | `evaluateClosing` → `denominators.events` | Un seul objet, calculé une fois avec les autres dénominateurs C14 ; `null` partout quand la carte n'est pas lue |
| Écrans et export | bandeau, carte de couverture, synthèse, export | Une seule phrase (`eventDenominatorText`) lue par les quatre ; l'export JSON/HTML/PDF/CSV porte le même bloc ; l'empreinte de la projection couvre l'empreinte de la carte (carte changée = export refusé, 409) |

## 3. Règles

| Règle | Nature | Fondement |
|---|---|---|
| Effet compté une fois par événement, étape et pont lus dans la projection C05 de la carte | Reprise d'une règle existante | C05 (`lib/synthesis/exposure.ts`, `restrictExposure`) ; C11 (`transversal-events.ts`) |
| Effets d'événements et anomalies journalisées : deux catégories, aucun total commun ; montants tenus par poste et par sens | Méthode interne | Socle commun ; C05 (« jamais additionnés entre actif, passif et résultat ») |
| Carte non lue, absente ou d'un autre dossier : effets inconnus (`null`), jamais zéro ; la lecture du dossier reste possible | Méthode interne | Socle commun (« un montant inconnu reste inconnu ») |
| Fraîcheur : la carte et le dossier comparés ; version courante sans têtes de sources lues = « non vérifiée » ; désaccord = « discordante », signalé et compté | Méthode interne | C14 (une lignée par racine, adaptateurs de famille) |
| Aucun blocage de clôture ajouté : le dossier ne porte aucune décision sur ces effets (lecture seule) ; la réserve est écrite dans les limites de la projection | Méthode interne | Demande du lot (lecture seule) |

**Sources.** Aucune règle comptable ou fiscale nouvelle n'est introduite : aucun texte officiel n'a été lu pour ce lot. Les qualifications (FAE, PCA, FNP, avoirs, textes ANC/PCG cités) restent celles de la carte C11, dont les sources sont tracées dans `docs/mission-c11/CONTRAT.md`.

## 4. Recette

Attendus posés à la main avant exécution, à partir de `docs/recette/c11/RECETTE.md` (pont C05 : hausse 1 000,00, baisse 3 500,00 ; 7 observations porteuses, 4 effets) et de son **cas 8** (FS-203 : FNP 400,00 suspendu par la RPNE non concluante). Le dossier de recette ouvre l'exercice C11 (01/04/2025 → 31/03/2026), avec Achats (P-01) et RPNE (P-02) au programme et Clients et ventes hors programme.

| Cas | Attendu à la main | Test |
|---|---|---|
| Recette C11 dans le dossier | 4 effets : FS-202 −1 000,00 (2 obs.), F-101 +1 000,00 (2), F-102 −2 000,00 (2), AV-106 −500,00 (1), tous « en attente » ; pont : baisse 3 500,00, hausse 1 000,00 en attente, 0 corrigé, 0 résiduel | `closing-c14-events.test.ts` |
| Dénominateurs | 11 événements (9 analysés + F-107, F-108 lus comme soldes ouverts), 19 observations (14 + 5), 7 porteuses, 4 effets, 1 candidat sans effet, 0 hors programme, 0 discordance — égaux à ceux de la carte elle-même | idem |
| Feuilles sources de F-102 | Achats RUN-ACH r1 v1 et RPNE RUN-RPNE r1 v1 « candidat », comptés, retenus par P-01 / P-02 ; Clients et ventes RUN-CLI r1 v1 « solde ouvert observé », non compté, hors programme | idem |
| Cas 8 | FS-203 : non concluant, candidat FNP, montant inconnu, aucun effet ; Achats « candidat 400,00 » non compté, RPNE « non concluant » (FENETRE_NON_COUVERTE) | idem |
| Cas 8 rendu concluant | RPNE « candidat d'omission » → effet FS-203 −400,00 compté (2 obs.) ; baisse 3 500,00 + 400,00 = **3 900,00** ; 9 porteuses ; 0 candidat sans effet | idem |
| À côté, jamais additionnés | Anomalie journalisée de 300,00 : totaux du dossier = 300,00 non corrigé, rien de plus | idem |
| Étape lue, pas redéduite | Carte où F-101 est corrigé 600,00 sur 1 000,00 → résiduel **400,00**, « corrigé » ; byStage : 3 en attente, 1 corrigé | idem |
| Une lignée par racine | RPNE révisée (r2 brouillon) : lecture r1 « révision antérieure », 4 lectures discordantes ; sans P-01, AV-106 (vu par Achats seul) = 1 effet hors programme | idem |
| Fraîcheur | Carte RPNE périmée : têtes non lues → « non vérifiée » ; têtes lues, sources en tête → « discordante » | idem |
| Carte non lue / absente / autre dossier | Dénominateurs `null`, motif affiché, lecture du dossier possible | idem |
| Export | JSON, CSV (« effet_evenement », « candidat_sans_effet »), HTML : mêmes dénominateurs et même phrase ; carte changée après lecture → 409 | idem |
| PostgreSQL (feuilles réelles Mission 08) | Le dossier lit, par `PayablesRuntime.cutoffEvents` + `eventMapRead` (composition du serveur durable), la carte de `operation=events` : même empreinte, mêmes nombres ; I-D 600,00 compté une fois sur Achats et RPNE, lus à la version courante de leur lignée, sources en tête ; I-G (paiement groupé non ventilé) sans effet compté ; autre organisation refusée (403) | `clients-durable.integration.test.ts` |
| Écran (build de production) | Même phrase dans le bandeau, la carte de couverture, la synthèse et l'export ; `/cutoff` affiche 11 événements, 7 observations avec candidat, 4 effets ; 1440 / 1024 / 390 px sans débordement de page ; dès 1024 px le tableau des effets tient sans défilement ; axe sans violation grave à 1440 | `e2e/c14-evenements-dossier.spec.ts` |

Contrôle des tests : deux mutations volontaires (toute observation déclarée « comptée » ; étape forcée « en attente ») font échouer la recette ; le cas « fraîcheur » échoue avec la première rédaction de la règle (corrigée pendant le lot : sans têtes de sources lues, une carte périmée était déclarée discordante).

### Exécutions (15/10/2026)

| Contrôle | Résultat |
|---|---|
| `tsc --noEmit`, ESLint des fichiers touchés | Propres |
| Vitest ciblé C11 + C14 + lot (6 fichiers) | 77 / 77 (base : 68 ; + 9 du lot) |
| Vitest complet (`--pool=forks`, sans base) | 1 867 réussis, 54 ignorés (recettes PostgreSQL, sans URL de base), 2 échecs hors périmètre sous charge (`cash-reconciliation.test.tsx` clavier, `clients-sales-workspace.test.tsx`) : 9 / 9 isolés, aucun import des modules touchés. Le pool `threads` par défaut s'arrête en erreur de segmentation sur ce poste |
| PostgreSQL 17 jetable (cluster du scratchpad, migrations 0001 → 0020) | `clients-durable` 28 / 28 (dont le test du lot), `closing-durable` 4 / 4 |
| `next build` puis Playwright (port 3147) | Lot 3 / 3 ; non-régression `closing.spec.ts` 6 / 6 et `c11-carte-evenements.spec.ts` 3 / 3 |

Captures : `docs/probant-lots/c14-evenements-captures/` (synthèse à 1440, 1024 et 390 px).

## 5. Limites restantes

- **Aucune décision de revue sur ces effets.** La carte ne porte que des étapes « en attente » : le dossier n'enregistre ni correction ni appréciation d'un effet d'événement (lecture seule demandée). Les colonnes « corrigé » et « résiduel » ne bougeront qu'avec une décision C05 portée par la carte ou un journal dédié (lot suivant).
- **Deux lectures, pas une transaction.** La carte est lue juste avant la transaction du dossier, par son propre runtime : une feuille modifiée entre les deux lectures apparaît comme « lecture discordante » et l'export de l'état précédent est refusé (409), mais les deux lectures ne sont pas atomiques.
- **Pas de blocage de clôture.** Un effet en attente ne bloque ni la validation ni le marquage personnel ; il figure dans la synthèse, l'export et les limites de la projection.
- **TVA hors effet.** L'effet est comptable (poste résultat) ; la période de TVA et les règlements restent sur `/cutoff`.
- **Recette d'écran sur magasin mémoire.** Le navigateur lit le vrai `ClosingRuntime` et la vraie carte C11, mais pas PostgreSQL ni OIDC. La lecture sur PostgreSQL est vérifiée par la recette durable avec la même composition ; le module `closing-server.ts` lui-même (`server-only`) n'est vérifié que par le typage et le build.
- **Lignes « Clients et ventes » sur PostgreSQL.** Dans les données de la Mission 08, les observations Clients et ventes portent sur des événements sans candidat : le dossier ne les liste pas (il ne liste que les effets et les candidats). Le cas « révision antérieure » est vérifié sur magasin mémoire.
