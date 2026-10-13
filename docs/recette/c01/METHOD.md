# Méthode de recette C01

Le chantier `mission-c01`, branche `codex/c01-context-capabilities`, part de C00 `963549987018173945e4222c8a38a27d1ceaf60d`. La base distante constatée au démarrage est toujours `ab8f991e65b0ad93e6f9a21281010b680c868466`. Le checkout C00 n’a aucun changement suivi ; ses preuves non suivies sont conservées. La copie C01 possède ses propres sources, index et builds. Les dépendances installées de C00 sont partagées par jonction ; aucun changement de code de paquet, de dépendance ou installation n’est effectué. Les caches temporaires des outils sont exclus de l’inventaire de préservation.

## Attendus indépendants

- Un exercice du 01/04/2024 au 31/03/2025 garde ces bornes dans les allers-retours ; il ne devient pas une année civile.
- Le mois TVA de décembre 2024 garde ses bornes propres, incluses dans l’exercice, tout en conservant la clé annuelle du store existant.
- Le contexte historique DEMO SA ne possède pas de début d’exercice/date de revue qualifiés : aucune date ou feuille n’est déduite de son seul millésime.
- Changer de dossier/exercice retire les clés de feuille, version, racine, preuve et période déclarative de l’ancien dossier ; les données ne sont pas fusionnées.
- Les valeurs du journal existant restent 13 cycles, 15 procédures et 7 familles de stores. Le rapprochement garde 11 configurations et 22 types de documents, dans leur ordre antérieur. Le registre expose en plus le périmètre historique Dettes financières sans ajouter de valeur au journal.
- Un stock compté, ses mouvements et coûts font partie de la feuille Stocks existante. L’absence de Stocks dans l’atelier ne vaut pas absence de son moteur local.
- Une configuration activée ne vaut ni accès autorisé, ni connexion réussie, ni travail exécuté. Une lecture désactivée ou en panne reste non vérifiée.
- Chaque requête SQL de lecture porte organisation, dossier et période ; aucun nom de table n’est fourni par la requête et aucune écriture SQL n’est nécessaire.

Il n’y a aucun nouveau calcul comptable/fiscal dans C01. Les calculs des fixtures de présentation proviennent des moteurs existants ; ils servent à peupler les états de navigation, sans constituer une nouvelle validation de leurs règles métier.

## Contrôles techniques

Tests dédiés : sérialisation/validation du contexte, dates civiles, mois TVA/paie distincts, liens de version/retour/connexion, collision `mode=live`, changement de scope, projection du registre, sept adaptateurs SQL, configuration distincte de l’exécution, refus de lignes hors scope et statuts d’authentification de la nouvelle route de lecture.

Régressions existantes : repositories et cohérence inter-pages des dossiers, Synthèse Clients et runtime de clôture. Les tests PostgreSQL durables ne sont pas lancés : ils ne sont pas présentés comme vérifiés.

La compilation Next et la vérification de types/lint restent celles du dépôt. Le runner de build suit son propre processus et utilise un seul worker de génération, via le paramètre d’environnement lu par Next 15.5.27 installé ; les vérifications ne sont pas désactivées. Les premiers essais de compilation et les essais interrompus sont conservés avec leurs journaux ; ils ne remplacent pas la compilation finale de la version présentée.

## Contrôles navigateur

Un seul serveur Next de production est lancé directement, sous contrôle du runner C01, sur `127.0.0.1:3121`. Le runner refuse un port occupé et une phase de preuves déjà utilisée. Il enregistre PID, version Node et build ID, puis arrête son propre serveur. Aucun serveur ni déploiement existant n’est réutilisé.

Les tests C01 utilisent les fixtures Clients existantes avec preuves rattachées par `linkImportedEvidence`, puis les projections serveur existantes. Les requêtes snapshot/session/feuilles sont explicitement interceptées. Deux snapshots de recette, exercice 2024 et exercice 2025, simulent des réponses du socle ; ils ne prouvent ni l’accès à un utilisateur réel, ni une intégration PostgreSQL. Les parcours historiques, les ressources et le nouveau point de lecture de configuration sont servis réellement par Next.

Parcours vérifiés aux largeurs 390, 1024 et 1440 : Synthèse → Clients → panneau de preuve → version de feuille → retour ; changement d’exercice vers une feuille absente et initialisation ; Stocks historique avec sources/exclusions ; disponibilité de l’atelier. Un dossier absent et un exercice incompatible vérifient l’absence de repli sur DEMO SA.

Les régressions navigateur C00/M20 sont réexécutées à partir de leurs fichiers existants : identifiants longs Clients, 128 procédures dont 127 applicables, récupération après erreur/chargement, huit pages historiques et contraste. Leurs noms historiques identifient le test réutilisé ; les résultats appartiennent à cette exécution C01, pas aux rapports M20.

Chaque état mesuré attend le réseau stabilisé et les polices chargées, avec réduction des animations. Les captures et résultats axe WCAG AA sont conservés. Tout serious/critical et tout débordement de page est un échec ; les tables gardent leur défilement interne. Les timeouts, tolérances et règles d’audit ne sont pas assouplis. Lecture d’écran, utilisateur réel et PostgreSQL restent non vérifiés.
