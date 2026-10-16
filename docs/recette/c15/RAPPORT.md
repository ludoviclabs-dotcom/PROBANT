# Recette finale C15 — produit local intégré

Rapport unique de la mission C15 (16/10/2026). Usage visé : outil personnel sur le PC, données et pièces locales. Aucune infrastructure cloud n'entre dans le verdict ; rien n'a été poussé, fusionné ni déployé.

## 1. Cadre fixé avant exécution

| Élément | Valeur |
|---|---|
| SHA de départ | `e25a4ad` (`main` après la PR #97, C14 suite), checkout propre, worktree `cranky-merkle-522ab2`, branche `claude/recette-finale-controle-c85076` |
| Écart avec la base du diagnostic `ab8f991` | 101 commits, PR #73 à #97 : C00 à C09, C11 à C14, lots Cloisons, Normatif, éditions du référentiel. **C10 (IS millésimes et arrondis) n'est pas sur `main`** : la branche `claude/c10-is-millesimes-arrondis` pointe sur sa base `dad6b10` sans commit, et le chantier non commité décrit le 14/10 n'existe plus (aucun worktree, stash ni objet inaccessible ne contient `NON_ANNUAL_PERIOD_NOT_SUPPORTED`). Le moteur IS livré est `tax-05-corporate-income-tax-1.0.0`. |
| Profil local de recette | `%LOCALAPPDATA%\PROBANT\recette-c15` créé par `local:init` (PostgreSQL 17.11, port 54379, application 3250, 24 migrations, relecture personnelle nommée « Camille Recette ») |
| Base jetable des recettes PostgreSQL | cluster `initdb` dans le dossier temporaire de session, port 55432, base `probant_test` |
| Dossier de recette | `docs/recette/c15/` : attendus, pièces, états avant / après, captures, ce rapport |
| Attendus | `attendus.py` → `attendus.json`, Decimal, aucune importation du code, commités seuls (`6535ad1`, puis `35e96aa` pour M12 bis et les pièces) **avant** toute exécution des moteurs ; table lisible `ATTENDUS.md` |

## 2. Capacités livrées sur cette base

Registre des capacités 1.4.1 : 14 cycles du journal, 18 procédures outillées, 8 familles de stores. Ce que la recette a effectivement exercé :

| Capacité | Preuve C15 |
|---|---|
| Profil personnel local (lanceur, PostgreSQL du poste, session locale, relecture personnelle nommée) | Parcours réel P1–P4, arrêt / reprise avec nouveaux processus (§ 5) |
| Cadrage Clients `clients.frame` (imports approuvés, gel, calcul, preuve, écart, relecture, verrouillage, synthèse, export, révision) | Parcours réel sur le profil ; recette PostgreSQL jetable `clients-durable` |
| Dossier de clôture (programme, rattachement implicite, synthèse des travaux, marquage personnel, export 8 formats, validation refusée en solo) | Parcours réel ; `closing-durable` ; matrice M11 / M12 |
| Trésorerie, Immobilisations (fin de plan), Stocks (valeur bornée), Provisions, Capitaux propres, Fiscal (TVA / IS), Emprunts, ingestion FEC locale | Recettes PostgreSQL jetables (10 fichiers) ; matrice M7, M8, M9, M10 ; suite unitaire ; e2e de démonstration |
| Synthèse : populations qualifiées, matrice des constats, couverture des travaux, effets C05, net fiscal | Matrice M2 à M6 ; e2e de démonstration |
| Paie / Congés (C12) | Suite unitaire seulement dans ce passage (voir § 9) |
| IS 1.1.0 (arrondi de base 219 I, exercice non annuel, millésimes 2024–2025, scénario fiscal avant / après) | **Absente** (C10 non fusionnée) : deux cas de la matrice restent en échec déclaré |

## 3. Avant / après — défauts trouvés et corrigés dans le périmètre

| # | Défaut constaté (avant) | Cause | Correction (après) | Preuve |
|---|---|---|---|---|
| D1 | Note de synthèse : « Écritures analysées : 0/0 (ratio 0) » suivi de « aucun ratio n'est présenté » quand la population est absente — exactement le cas du rapport § 6.1 | `note.ts` lisait les scalaires historiques `entriesRatio` / `controlsRatio` (0 sans dénominateur) au lieu des populations qualifiées | La note décrit chaque population : ratio seulement avec un dénominateur qualifié, sinon « aucun ratio — population non dénombrée : aucun ratio » | `c15-matrice` M2, dont la note de la Synthèse de démonstration (échec reproduit avant, réussi après) |
| D2 | Écran Clients sur le profil personnel : « Recette jetable · identité serveur » ; Synthèse Clients : « MISSION · RECETTE JETABLE » ; Achats : « MISSION 08 · RECETTE JETABLE » | Libellés en dur antérieurs au profil C07 | Libellé du profil réel lu dans la réponse serveur (`executionProfile`) : « Mission · profil personnel local · identité serveur » | Parcours réel P1, P2 |
| D3 | Exports HTML / PDF de mission (Clients, Trésorerie, Fiscal, Immobilisations, Capitaux propres) : « Procédures de mission · infrastructure de recette jetable » sur le profil personnel — l'export décrivait mal son propre contexte | En-tête figé dans les cinq paquets | En-tête du profil d'exécution passé par chaque runtime ; « exécution serveur » si inconnu, jamais « recette jetable » par défaut | `c15-matrice` (contexte des exports) ; parcours réel (`clientHtmlProfile` = « profil personnel local ») |
| D4 | Lien ou rechargement de `/dossier-cloture?…&tab=synthese` : l'onglet « Synthèse des travaux » était perdu (retour sur « Programme ») alors que l'écran écrit lui-même `tab=synthese` dans l'adresse | Liste des onglets acceptés par la page sans `synthese` | `synthese` ajouté aux onglets acceptés | Parcours réel P1 (`aria-selected="true"` après rechargement) |
| D5 | Premier écran Clients ouvert depuis `/local` : « Aucune feuille chargée », dates cachées dans un volet replié | Volet fermé par défaut, message sans action | Volet ouvert quand l'adresse ne porte pas d'exercice ; message « saisissez le début, la clôture et la date de revue de l'exercice, puis chargez le cadrage » | Parcours réel P1, capture `p1-clients-premier-ecran-1440.jpg` |
| D6 | Synthèse des travaux : « Reste à faire : Rien de détecté » à côté de « Exceptions conservées » (lu comme « aucune exception ») | Libellé ambigu dans la colonne des travaux restants | « Aucun travail restant détecté — pas une attestation » | Captures `p1-cloture-synthese-1440.jpg` |
| D7 | Messages 503 Equity, Participations, Achats : « infrastructure de recette jetable requise » | Libellés antérieurs à C07 | « profil personnel local (npm run local:start) ou recette jetable requis », comme les autres familles | Revue de code |
| D8 | « 1 lignes » dans l'aperçu d'import Clients | Pluriel fixe | Accord du nombre | Capture `p4-feuille-r1-390.jpg` |
| D9 | `scripts/local/recette-c07.ts` attendait 22 migrations et « 12 chaînes » : échouait sur tout profil neuf depuis C12 / C13 (24 migrations, 14 chaînes) | Constante figée | Nombre lu par `migrationFiles()` du lanceur | Recette C07 rejouée (§ 7) |
| D10 | Documentation : relecture personnelle « pas encore admise » au dossier de clôture ; « 22 migrations » ; exclusion « Dettes financières sans feuille » caduque | Docs non mises à jour après C13 / C14 | `docs/local/RUNTIME_PERSONNEL.md`, `docs/mission-c14/EXCLUSIONS.md` (mention datée) | Vérifié par le parcours réel (validation refusée, marquage admis) |

Aucun calcul comptable ou fiscal n'a été déplacé ni ajouté dans React ; aucun moteur parallèle ; aucune tolérance modifiée ; aucun test existant retiré.

## 4. Matrice de recette du rapport du 12/10/2026

Exécutable : `lib/recette/__tests__/c15-matrice.test.ts` (lit `attendus.json`, appelle les moteurs livrés). Résultat : **23 réussis, 2 échecs déclarés** (`it.fails`, attendu inchangé, capacité absente).

| # | Cas | Attendu manuel | Résultat |
|---|---|---|---|
| M1 | Résidus compensés (GL 80 ; auxiliaire 100 − 20 ; âgée 90 − 10) | Totaux 80, écarts globaux 0 ; résidus C1 +10,00 / C2 −10,00 ; brut 20,00 ; « résidus non compensés » ; solde créditeur « à justifier » | Réussi (moteur et parcours réel) |
| M2 | Population absente / vide / contrôles seuls | Aucun ratio ni « 0 % », « 100 % », « 0/0 » ; état vide explicite ; 24/24 contrôles sans étendue d'écritures | Réussi après D1 |
| M3 | Constat qualitatif sans montant | Assertion « existence » conservée, montant inconnu, 1 dans la matrice des constats ; la matrice dit « cellule vide = aucun constat, pas assertion couverte » | Réussi |
| M4 | Signal EUR 100 000 / seuil 50 000 | Aucune incidence inférée, jamais 50 000 ; gravité indépendante du seuil de signification | Réussi |
| M5 | Effets 100 / 120, répétition, chevauchement | Conflit sans montant retenu ; répétition comptée une fois ; indéterminé [120 ; 220] | Réussi |
| M6 | +1 000 sans taux | Brut 1 000 ; impôt et net inconnus ; pas d'étape « impôt » ni « net » dans le waterfall | Réussi |
| M7 | Fin de plan (12 000, 60 mois) | Dotations 0 / 1 200 / 2 400 ; cumul de clôture ≤ 12 000 ; VNC 4 800 | Réussi |
| M8 | Stock coût 10, prix 2, sortie 5, 10 unités | Valeur actuelle −3 ; écart brut 130 ; perte bornée 100 ; complément 30 ; aucune provision | Réussi |
| M9 | IS annuel base 50 000 | PME 8 250 ; non éligible 12 500 | Réussi |
| M9 bis | Base 50 000,49 € (art. 219 I : arrondi à l'euro) | Base 50 000, impôt 8 250,00 | **Échec déclaré** : le moteur 1.0.0 calcule sur 50 000,49 → 8 250,12 (C10 absente) |
| M9 ter | Exercice de 18 mois | Refus ciblé ou plafond proratisé tracé | **Échec déclaré** : le moteur 1.0.0 calcule « computed » avec le plafond 42 500 non proratisé, sans limitation (C10 absente) |
| M10 | Millésime 2024 absent | Bloqué, impôt inconnu, `rate_schedule:2024:2024` requis, aucun repli sur 2026 | Réussi |
| M11 | Deux feuilles, même procédure, populations distinctes | Sans rattachement 0 / 1 ; B1 rattachée 1 / 1, B2 « à rattacher » | Réussi |
| M12 | Source remplacée après verrouillage | Feuille « source remplacée », empreinte de projection changée, export de l'ancienne empreinte refusé (409) | Réussi (matrice) et parcours réel P3 |
| — | Liens du registre | Chaque route, synthèse, mode, procédure et flux du registre mène à une page existante | Réussi |

## 5. Parcours réel persistant (profil personnel, navigateur réel)

`e2e/c15-parcours-local.spec.ts`, exécuté contre `next start` + PostgreSQL lancés par le lanceur (`PROBANT_E2E_LOCAL_HOME`, `PROBANT_E2E_BASE_URL`) : **4 / 4** sur le build final. Aucune fixture mémoire.

| Étape | Ce qui est vérifié |
|---|---|
| P1 | `/local` : création du dossier (raison sociale + exercice) → lien de travail Clients → premier écran explicite → dates → trois imports (aperçu conservé, mapping approuvé, « Source courante ») → gel → calcul : résultat serveur = M1 → table de décision et panneau de preuve (gauche 100,00 / droite 90,00, fichiers et SHA-256 des pièces = SHA-256 calculés sur les CSV du disque, convention « résidus non compensés ») → justification du point bloquant, conclusion, soumission → relecture personnelle nommée « Camille Recette » → verrouillage → dossier de clôture ouvert (risque R-01, procédure P-01 `clients.frame`, rattachement implicite, « Feuille verrouillée ») → validation professionnelle refusée (`CL_CLOSING_AUTHORITY_FORBIDDEN`) → onglet « Synthèse des travaux » conservé au rechargement → « dossier personnel terminé » avec ses limites → export JSON canonique = projection affichée |
| P2 | `local:stop` : ports 3250 et 54379 fermés, verrou `postmaster.pid` levé ; `local:start` sans recompilation ; nouveaux PID (Next 10600 → 17916, PostgreSQL 19632 → 28312) ; relecture : feuille (id, version 13, état, approbation), têtes de sources, octets des trois pièces, empreinte de mission, séquence / empreinte du journal et de la projection de clôture **identiques** ; **16 exports identiques octet pour octet** (Clients : JSON, HTML, PDF, manifeste, 4 CSV ; clôture : JSON, HTML, PDF, 4 CSV, manifeste) ; écran de la version verrouillée rouvert à l'identique |
| P3 | Balance âgée remplacée (C1 85,00) après verrouillage : alerte « Une source a été remplacée » ; version verrouillée lisible ; export diagnostic de cette version : « Travail périmé », « Source remplacée / périmée », « révision 1 · version 13 » ; paquet « approuvé » refusé (`EXPORT_APPROVED_CURRENT_LOCKED_REQUIRED`) ; dossier : « Source remplacée depuis le gel », 1 source remplacée, marquage personnel « périmé » ; révision r2 calculée = M12 bis (C1 +15,00, C2 −10,00, brut 25,00, net 5,00) ; r1 toujours lisible |
| P4 | `/local`, feuille r1, Synthèse Clients (panneau de preuve ouvert, identifiants longs dépliés), Synthèse des travaux : 1440 / 1024 / 390 — aucun débordement global, aucune violation axe serious / critical (WCAG 2.1 AA), focus conservé sur « Examiner les preuves de C1 » après Entrée, aucune animation en cours sous `reduced-motion` |

Formats d'export : les manifestes Clients (7 artefacts) et clôture (7 artefacts) décrivent exactement les octets servis (nom, taille, SHA-256), vérifié format par format. En-tête `X-Probant-Snapshot` = empreinte de l'état exporté. Preuves : `etat-avant.json`, `etat-apres.json`, `etat-invalidation.json`, captures `captures/p1-*`, `p3-*`, `p4-*`.

## 6. Recette visuelle 390 / 1024 / 1440

| Périmètre | Contrôle | Résultat |
|---|---|---|
| Écrans corrigés ou parcourus par C15 (`/local`, feuille Clients verrouillée, Synthèse Clients avec panneau de preuve et identifiants longs dépliés, Synthèse des travaux) | P4 : débordement global, axe WCAG 2.1 AA serious / critical, focus après action clavier, animations sous `reduced-motion` | 4 écrans × 3 largeurs : aucun défaut |
| Suite e2e complète sur build de production (mode démonstration, port dédié) : premier écran, actions, contexte permanent, erreurs et états vides, identifiant long et programme long (`c00-layout`, `c02-finition`), tiroirs et retour du focus (`dashboard-tiroir`, `normatif-*`, `cloisons-*`), contraste (`mission20-contrast`, `accessibility`), matrices et couverture (`c03-assertions`, `c05-effets-partages`), parcours historiques (`demo-journey`, `historical-upload`, `capitaux-propres`, `c09-capitaux-parcours`) | 1440 / 1024 / 390 selon chaque spécification | **302 réussis, 15 ignorés, 0 échec** (8,6 min). Les 15 ignorés sont les spécifications du profil local et du FEC persistant, rejouées à part (§ 7) |
| Narration des matrices | Matrice des constats : titre, résumé et méthode disent « constats, pas couverture » ; « Couverture des travaux » dit « aucune assertion réputée couverte sans travail, pièce et version » ; population manquante dite comme telle, sans ratio ; Synthèse des travaux : mêmes dénominateurs que le bandeau, la carte et l'export, relecture personnelle comptée à part | Conforme après D1 et D6 (lu à l'écran et dans les jeux de données) |

Observations visuelles non bloquantes (laissées en limites, § 10) : à 390 px, la table des décisions Clients défile horizontalement et le focus sur « Examiner les preuves » masque la colonne de la clé ; montants de la Synthèse Clients au format `10.00 EUR` ; texte de convention du moteur « clé account / clé party ».

## 7. Contrôles

| Contrôle | Avant (base `e25a4ad`) | Après (lot C15) |
|---|---|---|
| `tsc --noEmit` | sans erreur | sans erreur |
| ESLint | 0 erreur, 7 avertissements de la base | fichiers modifiés et nouveaux : 0 erreur, 0 avertissement |
| Suite unitaire (`vitest.config.mjs`, pool `forks`) | 1 923 réussis, **1 échec** (`provision-mission.test.ts`, export : délai de 5 s dépassé sous la charge de la suite complète), 62 ignorés (recettes PostgreSQL sans base) | 184 fichiers : **1 947 réussis, 2 échecs déclarés** (C10), 62 ignorés pour la même raison, **0 échec** ; le test Provisions passe sans changement de délai |
| Recettes PostgreSQL 17 jetables (`--project durable`, base neuve, 24 migrations) | 10 fichiers, 62 / 62 | 10 fichiers, 62 / 62 |
| Matrice C15 (`lib/recette/__tests__/c15-matrice.test.ts`) | M2 « note » en échec (D1 reproduit) | 23 réussis, 2 échecs déclarés |
| Parcours réel C15 sur le profil local (`e2e/c15-parcours-local.spec.ts`) | — | 4 / 4 (build final) |
| Suite e2e complète, build de production, mode démonstration | — | 302 réussis, 15 ignorés, 0 échec |
| `c07-profil-local.spec.ts` sur le profil C15 | — | 4 / 4 |
| `c13-emprunts.spec.ts`, parcours persistant sur le profil C15 | — | 2 / 2 (les 5 cas « exemple synthétique » affichent sur le profil personnel « Exemple synthétique non activé sur ce serveur », par conception ; ils passent sur le serveur de démonstration) |
| Recette C07 rejouée (`recette-c07.ts`) : chaîne Trésorerie, FEC persistant et reprise d'un dépôt interrompu, arrêt / relance, sauvegarde, restauration dans un nouveau profil | échouait sur un profil neuf (D9) | profil neuf `recette-c15-c07` : **42 / 42** ; sur le profil C15 déjà utilisé : 41 / 42, seul « sauvegarde » échoue parce qu'il compte 5 imports Trésorerie alors que les e2e C07 en avaient ajouté 20 (25) — hypothèse de profil neuf du script, restauration identique table par table |
| `next build` (par le lanceur, à chaque changement de code) | — | sans erreur |

Preuves : `etat-avant.json`, `etat-apres.json`, `etat-invalidation.json`, `c07-rejouee-profil-neuf/`, `c07-rejouee-profil-c15/`, `captures/`.

## 8. Règles et sources

C15 n'introduit aucune règle française nouvelle. Les attendus citent le rapport du 12/10/2026 (§ 6, § 11) et, pour l'IS, le CGI art. 219 I tel que lu par ce rapport ([S8]) : arrondi du bénéfice imposable à l'euro et taux réduit dans la limite de 42 500 € ; le barème 2026 du registre (`is-rate-schedules.json`, `cgi-art-219-v2026-02-21`) est inchangé. Les assertions NEP 500 §09, la règle Immobilisations 1.1.0 (C06), Stocks 1.1.0 (C08), les seuils NEP 450 (C14) sont ceux des lots qui les ont lus ; aucune source n'a été relue ni modifiée ici. Les pourcentages et seuils internes (politique 95 %, poids de gravité) restent des politiques PROBANT.

## 9. Non vérifié dans ce passage

- Paie / Congés sur le profil local (`c12-paie-locale.spec.ts`, `scripts/local/recette-c12.ts`) : la spécification attend le jeu et le nom de la recette C12 ; non rejouée. Moteurs couverts par la suite unitaire seulement.
- Immobilisations, Stocks, Provisions, Capitaux propres, Fiscal, Participations, Résultat exceptionnel **par l'écran sur le profil local** : non parcourus dans ce passage ; leurs chaînes durables sont vérifiées par les recettes PostgreSQL jetables (API réelle, stores PostgreSQL) et leurs écrans par la suite e2e de démonstration.
- `fec-persistent.spec.ts` (variables `PROBANT_E2E_PERSISTENT`) : non rejoué ; le dépôt FEC durable, sa reprise après interruption et sa synthèse sont vérifiés par la recette C07 rejouée (42 / 42).
- Lecteur d'écran réel (NVDA, Narrateur) : non testé ; seul axe-core l'a été.
- Données réelles : aucune ; tout est synthétique. Un succès ici n'autorise aucune mission réelle.
- PDF/A : non validé (PDF standard dérivé du HTML, mention portée dans chaque export).

## 10. Limites et extensions restantes

1. **C10 à relivrer (IS millésimes et arrondis).** Sur `main`, le moteur IS 1.0.0 : n'arrondit pas la base à l'euro (art. 219 I) ; **calcule sans avertissement un exercice de 18 mois avec le plafond 42 500 non proratisé** ; n'a que le barème 2026 (2024 et 2025 bloqués, ce qui est correct faute de source) ; l'incidence fiscale d'un ajustement reste « inconnue, hors couverture » faute de scénario avant / après. Le chantier C10 du 14/10 est perdu : il faut le refaire depuis ses sources, pas le simuler. Les deux cas M9 bis / ter restent en échec déclaré jusqu'à ce lot.
2. Les liens de travail de `/local` ne portent que le dossier : les dates de l'exercice se saisissent sur chaque feuille (l'exercice du dossier local est un texte libre). Le premier écran le dit désormais.
3. Synthèse Clients : format `10.00 EUR`, conventions « clé account / clé party » issues du moteur, table des décisions à colonne de clé non figée à 390 px ; style des écrans Clients antérieur à la charte des écrans récents (Trésorerie, clôture).
4. Le registre d'anomalies du dossier de clôture ne reprend pas les exceptions d'une feuille : elles y restent « Exceptions conservées » et se qualifient à la main ; la carte des événements (C11) ne projette rien sans feuille « Clients et ventes » ni Achats.
5. Scalaires historiques `entriesRatio` / `controlsRatio` du `SynthesisSnapshot` (0 sans dénominateur) : plus affichés nulle part, encore présents dans le JSON ; à retirer avec une version de schéma.
6. PDF non PDF/A ; pièces binaires hors des paquets d'export (téléchargement séparé, empreinte vérifiée).
7. Familles à règle « imports figés » : une source **ajoutée** après le gel n'est pas signalée (limite C14).
8. La vérification « sauvegarde » de `recette-c07.ts` compte 5 imports Trésorerie : elle suppose un profil neuf (échec attendu sur un profil déjà utilisé, voir § 7).
