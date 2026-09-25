# Recette ciblée — démonstrateur PROBANT intégré

Date : 2026-09-26. Réviseur : Claude (Opus 5.5), recette indépendante du lot livré par Codex.

## SHA examiné

- Branche locale `feat/probant-demo-integree`, **non poussée**, worktree `C:\Users\Ludo\PROBANT\demo-integree`.
- SHA examiné : `89e90c5bf41e143fb56c7c4d518b5706d54e26c2`, un commit au-dessus de `main` `482314aa4e7810c3f0ffb88ed0adb163668e176f`.
- Diff de livraison : 22 fichiers, +493 / −114.
- Le worktree appartient à l'utilisateur sandbox de Codex. Git a été lancé avec `-c safe.directory=…`, sans modifier la configuration globale.

**Architecture vérifiée :**
- L'atelier est entièrement exécuté dans le navigateur. `PUT /api/workpapers` est désormais fermé (503), comme GET et POST.
- L'état est un journal d'événements stocké dans `localStorage`, avec une somme de contrôle SHA-256 et une expiration à 7 jours.
- Le journal est rejoué de façon déterministe (horloge fixe, identifiants dérivés du scope) dans le dépôt de session du dossier.
- Aucune `Map` d'instance serveur n'est donc sollicitée : le parcours ne dépend pas de l'instance Vercel qui répond.

## Scénarios réellement exécutés

| # | Scénario | Moyen | Résultat |
|---|---|---|---|
| 1 | Tests `lib/workpapers` et `components/probant` du dépôt | `vitest --config vitest.config.mjs --configLoader runner` | 20 suites / 130 tests PASS, puis composants 2 / 21 PASS |
| 2 | 10 cycles × 3 scénarios (nominal, exception, donnée invalide) : création, soumission, approbation, verrouillage | Script hors dépôt appelant `appendDemoEvent` | 30/30 verrouillés |
| 3 | Rechargement simulé : journal sérialisé et désérialisé, rejoué depuis zéro | Même script | Hash du snapshot identique pour les 30 cas |
| 4 | Empreintes des octets exportés | `sha256` Node des chaînes JSON et Markdown, comparé au manifeste | Identiques pour les 30 cas |
| 5 | Modification après verrouillage | Événement `edit` | Cycle repassé en `executed` ; export refusé `STALE_REVIEW_EXPORT_BLOCKED` |
| 6 | Journal altéré, journal expiré, cycle créé deux fois | Même script | `DEMO_INTEGRITY_INVALID`, `DEMO_EXPIRED`, `DEMO_CYCLE_ALREADY_CREATED` |
| 7 | Dix cycles dans un même dossier, puis export unique | Même script | 10 prévues / 10 exécutées / 10 verrouillées ; 40 événements ; export d'environ 386 Ko |
| 8 | Parcours navigateur complet (voir ci-dessous) | Build de production de ce SHA, `next start`, Playwright Chromium 1440 px, hors dépôt | Sur le SHA d'origine : 5 passages, dont 3 complets réussis ; les 2 échecs sont des téléchargements annulés par le banc (voir « Blocages ») |

**Détail du parcours navigateur (scénario 8) :**
1. Ouverture d'un dossier synthétique dédié.
2. Cash en « exception », IS en « nominal », Clients en « donnée invalide » : exécution, soumission, approbation et verrouillage des trois cycles.
3. Navigation vers la Synthèse, puis rechargement de la page.
4. Export : téléchargement des trois fichiers et vérification de leurs empreintes contre le manifeste.
5. Ouverture d'un nouvel onglet, qui ne partage pas le stockage de session : reprise du dossier via le journal.
6. Altération du journal, puis rechargement.

**Constats du parcours navigateur :**
- Le compteur de Synthèse est identique avant et après le rechargement, et dans le nouvel onglet : « 3 prévues · 3 exécutées · 3 verrouillées · 3 non concluantes ».
- Le dossier exporté porte le même identifiant `SYN-…` et contient les 3 révisions verrouillées.
- L'empreinte du fichier JSON (100 762 octets) et celle du fichier Markdown correspondent au manifeste.
- Le journal altéré est refusé avec le message « Reprise refusée : DEMO_INTEGRITY_INVALID », et une remise à zéro explicite est proposée.
- Aucune erreur JavaScript de page.

**Observations par module (scénarios 2 et 7) :**

| Cycle | Nominal | Exception (visible dans le résultat) | Donnée invalide |
|---|---|---|---|
| Cash | Pont à 0,00 € | Écart de −0,10 €, erreur arithmétique de l'ERB | « Donnée invalide… aucune conversion en zéro » |
| Cut-off | Déjà rattaché, pas de double ajustement | Candidat 100,00 € | idem |
| Fournisseurs / RPNE | Paiements −240,00 € | Potentiellement omis 100,00 €, exposition unique | idem |
| Clients | 1 000 − 300 = 700 € | Écart de cadrage grand-livre / auxiliaire de 10,00 € | idem |
| Immobilisations | Brut 1 100 € | Clôture 1 090 € (écart de 10 €) | idem |
| Capitaux propres | Mouvements à 100 € | Clôture 90 € | idem |
| Achats | Base facture / événement non comparable → inconnu, aucune FNP inventée | Montant déjà rattaché 100 € | idem |
| Congés payés | 66,67 € / 66,67 € | 66,67 € / 50,00 € ; reliquat inconnu, sans extrapolation | idem |
| Participations | 40 × 25 % = 10 € | Comptabilisé −1 € ; valeur externe « SOURCE REQUISE » | idem |
| IS | Pont à 100 € ; impôt dû bloqué : « Millésime 2024 / exercice 2024 non couvert par le moteur IS » | **Identique au nominal** | idem |

Les gates du moteur fiscal sont respectées : `taxEngine.status = "blocked"`, `calculationVersion = null`, et aucun impôt n'est inventé.

**Séparation des données fictives et réelles.**
- La Synthèse ne bascule sur le composant synthétique que si trois conditions sont réunies : `organizationId = "SYNTHETIC-DEMO"`, un identifiant `SYN-…` et `demoMode`.
- Le port d'import synthétique refuse tout autre scope.
- Le snapshot est enregistré sous le contexte `SYNTHETIC-DEMO`, distinct de DEMO SA et des dossiers réels. Ce point est vérifié par lecture, et l'E2E du lot le couvre.
- Aucun fichier utilisateur ne peut entrer dans l'atelier.

## Corrections

**Aucune correction conservée.** Le SHA livré reste inchangé ; seul ce rapport est ajouté.

Un correctif de l'utilitaire de téléchargement a été tenté : lien attaché au document et révocation de l'URL blob à 60 s au lieu de 1 s. Il **n'a pas réduit** les annulations (3 sur 6 après correctif). Le même motif, isolé de l'application sur une page vierge, est annulé 2 fois sur 20 par ce banc. Le défaut n'étant pas imputable à PROBANT, le correctif a été retiré, et `.next` a été reconstruit sur le SHA d'origine.

## Contrôles non exécutés

- **Suite unitaire complète, lint global et E2E `npm run test:e2e` du dépôt** : non relancés, car aucun code n'a été conservé. Le handoff du lot rapporte 87 suites / 853 tests, typecheck, lint à 0 erreur et E2E 32 réussis / 1 ignoré. Ces résultats ne sont pas horodatés par SHA, mais ils figurent dans le commit examiné lui-même.
- **Build :** exécuté trois fois (code 0), la dernière fois sur le SHA d'origine.
- **Navigateurs :** ni Firefox, ni Safari, ni mobile réel pour le parcours complémentaire. Les largeurs 390 et 768 px sont couvertes par l'E2E du lot, non rejoué.
- **Aperçu Vercel :** aucun déploiement, conformément au mandat. Le comportement en preview n'est donc pas observé, seulement déduit de l'absence d'état serveur.
- **Guide V1.1 :** les pages citées pour Clients (65–69), Immobilisations (85–88) et Capitaux propres (61–64) correspondent aux débuts de chapitre de la V1.1 relevés lors de la QA finale consolidée (extraction du PDF désigné). Cash, Cut-off et Fournisseurs affichent « non disponibles », alors que la V1.1 contient ces chapitres (ch. 14 p. 80, ch. 12 p. 70) : incomplétude pédagogique mineure.

## Blocages restants et réserves

Aucun P0 ni P1 confirmé dans le périmètre.

| Sévérité | Constat | Effet |
|---|---|---|
| P2 | Une « donnée invalide » donne une exécution `completed` (résultat `invalid_input`, issue `inconclusive`) qui peut être approuvée, verrouillée et exportée | La présentation est honnête (« non calculable, aucune conversion en zéro »). Le contrat réserve toutefois ce cas à une exécution `blocked`. |
| P2 | Le classifieur de l'atelier est figé à `inconclusive` | La Synthèse affiche « N non concluantes » même quand une exception est calculée ; l'exception n'apparaît que dans la table du résultat. |
| P3 | Le scénario « Exception » est sans effet pour IS | Cohérent avec le blocage du moteur IS, mais le sélecteur ne le signale pas. |
| P3 | Pages du guide non renseignées pour Cash, Cut-off et Fournisseurs | Pédagogie incomplète. |
| Banc | Téléchargements blob annulés par intermittence sous Playwright / Chromium Windows, reproduits hors application | Automatiser l'export demande un banc stabilisé (vérifier le contenu généré plutôt que le fichier téléchargé). |
| Limite assumée | Journal local signé mais non inviolable ; expiration à 7 jours ; propre à chaque navigateur | Documenté dans l'interface, dans le manifeste et dans `MODULE_MANIFEST` (Nouveaux parcours réels : « désactivé »). |

## Verdict

**GO_PREVIEW.** Le démonstrateur peut être publié en preview : parcours complet vérifié du dossier synthétique à l'export, continuité après rechargement et entre onglets, absence d'état serveur, cohérence du dossier et de la période entre l'atelier et la Synthèse, empreintes exactes des octets exportés, modification après verrouillage bloquante, gates IS respectées, séparation fictif / réel.

**Ce verdict n'autorise aucune mission réelle.** Le nouveau parcours réel reste désactivé : ni adaptateur durable, ni autorisation OIDC, ni méthodes ou PBC de mission validés.
