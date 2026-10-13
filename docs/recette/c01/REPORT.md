# C01 — Raccordement du dossier et registre de capacités

Date : 13 octobre 2026. Branche locale : `codex/c01-context-capabilities`. Base de travail : C00 `963549987018173945e4222c8a38a27d1ceaf60d`. Base distante/diagnostic : `ab8f991e65b0ad93e6f9a21281010b680c868466`. Aucun push, fusion, déploiement, migration ou changement de dépendance.

## Cause et changements

| Avant | Après |
|---|---|
| Synthèse affiche DEMO SA 2024 mais son lien Clients ne transmet aucune identité/période. | Les liens transmettent le dossier, l’entité, l’exercice, le référentiel et le mode. Les dates réellement inconnues restent inconnues. |
| Sidebar, retours et liens des feuilles perdent la sélection. | Sérialiseur commun, composants de liens contextuels, mémorisation de la sélection par le service existant et retour au même dossier. |
| Exercice et période déclarative peuvent être représentés par un même champ opaque. | Exercice et période de procédure distincts ; clé annuelle du store conservée, mois TVA/paie porté séparément. |
| Un dossier explicitement indisponible laisse initialement DEMO SA visible. | Résolution attendue ; absence et incohérence d’exercice/référentiel expliquées, aucun repli sur DEMO SA. |
| Ancien manifeste annonce Stocks/ITGC « non implémentés » sans portée suffisante. | Disponibilité de l’atelier projetée du registre, capacités historiques/locales et exclusions expliquées séparément. |
| Listes de cycles, procédures et routes maintenues séparément. | Registre unique ; catalogues, contrat de clôture, manifestes, Sidebar et accès de Synthèse deviennent des projections. |
| Tables des sept familles lues directement par le store de clôture. | Adaptateurs de lecture partagés, mêmes tables/clés ; validation du scope et de la famille, aucune écriture. |
| Configuration de store, accès et travail peu distingués. | Implémentation, activation déclarée et observations dans le dossier séparées ; une lecture non effectuée reste non vérifiée. |
| Requête de capacités encore active au retour, alors qu’aucun store n’est activé. | Retour direct de la seule configuration publique, sans services d’identité/base inutiles ; annulation des requêtes obsolètes. |
| Programme Clients vide défilant mais inaccessible au clavier à 390 px. | Région nommée et focalisable ; défilement interne conservé et contrôlé au clavier. |

Le registre décrit 14 périmètres : les 13 cycles du journal existant et les Dettes financières historiques. Les 15 procédures outillées, les sept familles de stores, les 11 configurations de rapprochement et les 22 types de documents conservent leurs identifiants et leur périmètre. Il n’y a aucun moteur parallèle, aucune règle fiscale/comptable nouvelle et aucun calcul métier ajouté dans React.

## Livrables

- Contrat : `docs/mission-c01/CONTRAT.md`, avec cartographie des anciennes listes remplacées.
- Contexte : `lib/dossier/navigation-context.ts`, provider de dossier et liens contextuels.
- Registre : `lib/capabilities/registry.ts` et ses définitions déclaratives.
- Lecture : `lib/capabilities/store-readers.ts`, `read-model.ts`, `GET /api/dossier-capabilities` ; consommés aussi par le store de clôture existant.
- Interface : accès par lignes de cycle, panneau de contexte, retour, choix de dossier/exercice, initialisation explicite Clients et périmètre atelier.
- Méthode et preuves : `METHOD.md`, résultats structurés et captures de cette exécution, conservés séparément des rapports M20/C00.

## Contrôles

Version de code vérifiée : `748141fa201469479257a8daa3a090625ee466ab`. Résultats définitifs dans `RESULTS.json` :

- **56 tests ciblés réussis**, aucun échec ni test ignoré ; recontrôle des dix cas de contexte après prise en charge des anciens alias, sans les compter deux fois.
- **19 tests navigateur réussis**, aucun échec ni test ignoré, sur le build local final.
- **51 états stabilisés** aux largeurs 390 / 1024 / 1440 : aucun serious/critical, aucun débordement de page ; tables défilantes conservées, programme vide contrôlé au clavier.
- **Compilation, types et lint validés**, sept avertissements préexistants.
- **C00 préservé** : SHA et état identiques au départ, 313 preuves contrôlées par empreinte, aucun fichier suivi modifié.
 Les attendus de contexte, dates, scope, versions et projections sont détaillés dans `METHOD.md` ; ils ne sont pas déduits du résultat d’un nouveau calcul comptable.

Les premiers essais sont conservés : sept échecs dans `after` (attente de capacités et sélecteurs de test), diagnostic ciblé dans `diagnose`, puis un défaut serious de défilement clavier du programme vide dans `verified`. Ces essais ne sont pas comptés comme réussis. Les sélecteurs corrigés visent les rôles accessibles réels ; aucun timeout, règle axe ou tolérance n’est augmenté.

## Sources et limites

Sources lues : code actuel après C00, repositories et modèles de période existants, contrats Clients/TVA/Provisions/clôture et handoff du périmètre. Aucun choix interne n’est attribué à une norme. Les pièces synchronisées et le chantier C00 sont préservés.

Les tests de navigation sur feuilles persistantes interceptent les réponses HTTP avec les fixtures existantes ; ils ne prouvent pas une connexion PostgreSQL ou une identité utilisateur réelle. Les vues historiques et la configuration non sensible sont servies réellement par Next local. PostgreSQL, migration, lecteur d’écran et utilisateur réel restent **non vérifiés**.

L’activation et les permissions du socle existant restent requises pour l’utilisation persistante ; ce lot ne les ouvre pas. Le sélecteur propose les snapshots déjà disponibles dans l’organisation, sans fabriquer un exercice absent. Les dates proposées aux formulaires restent provisoires. Les montants et conclusions restent ceux des moteurs et versions existants.

Le libellé « Modifications non sauvegardées » demeure l’incident distinct C02. La qualification des indices/calculs historiques n’est pas reprise dans C01. Les limites Stocks (présence physique, stocks de tiers, dépréciation), ITGC (pas de moteur dédié), paie réelle/DSN et DCF sont explicites.

GitHub `main` était encore `ab8f991…` lors de la dernière lecture enregistrée dans `remote.json`. L’inspection Vercel C00 est référencée ; Vercel n’est pas redéployé ni réinspecté pour ce lot. Le diff C01 est local et ne change pas la version servie à distance.
