# Profil personnel local — lancer, arrêter, sauvegarder, restaurer (C07)

PROBANT s'exécute sur votre PC avec une base PostgreSQL qui lui est propre et des pièces qui restent sur le disque. Rien n'est envoyé à Vercel, à S3, à SQS ou à un fournisseur d'identité. Le site public garde ses scénarios de démonstration ; ce profil n'y active rien.

## Trois axes distincts

| Axe | Valeurs | Qui le décide |
|---|---|---|
| **Choix d'exécution** (`ExecutionProfile`, `lib/runtime/profile.ts`) | `browser_demo` démo navigateur (aucune chaîne durable) · `disposable_recipe` recette jetable (`PROBANT_*_DURABLE=disposable`, bases `*_ci` / `*_test`) · `personal_local` profil personnel (`PROBANT_RUNTIME_PROFILE=personal`, drapeaux `personal`) | l'environnement du serveur, posé par le lanceur |
| **Type de dossier** (`CapabilityMode`, contrat C01) | historique · scénario · local persistant | les données lues |
| **Type de relecture** (`ReviewKind`, `lib/auth/review-kind.ts`) | `distinct_identity` relecture par une autre identité · `personal` relecture personnelle nommée · `simulated_second_identity` simulation | le serveur, d'après l'identité authentifiée |

Un profil personnel n'ouvre une chaîne que si son drapeau vaut `personal` ; il refuse `disposable`. Une recette jetable garde exactement son comportement antérieur. Les quatorze drapeaux sont ceux des missions (Clients, Achats, Equity, Participations, Exceptionnel, Trésorerie, Immobilisations, Capitaux propres, Fiscal, Stocks, Provisions, Clôture, Paie/Congés — C12, Emprunts — C13).

## Dépendances effectivement nécessaires

| Dépendance | Version vérifiée | Rôle |
|---|---|---|
| Windows 10/11 | Windows 10 Pro 19045 | poste de l'utilisateur |
| Node.js | 24.14.0 | Next, lanceur, migrations |
| Dépendances npm | `npm ci` (lockfile du dépôt) | aucune dépendance ajoutée par C07 |
| PostgreSQL **17** (serveur et outils `initdb`, `pg_ctl`, `pg_dump`, `pg_restore`) | 17.11 (binaires EDB pour Windows x64) | base personnelle ; même version majeure que la CI (`postgres:17-alpine`) |
| Internet | seulement pour `npm ci` et le premier `next build` (polices `next/font`) | ensuite, tout fonctionne hors ligne |

Non nécessaires : Docker, WSL, S3, SQS, Lambda, fournisseur OIDC, compte Vercel, droits administrateur.

### Installer PostgreSQL 17 sans droits administrateur

1. Télécharger l'archive « binaries » Windows x86-64 de PostgreSQL 17 chez EnterpriseDB (distributeur listé par postgresql.org), par exemple `postgresql-17.11-5-windows-x64-binaries.zip` (≈ 380 Mo ; SHA-256 relevé lors de la recette C07 : `80379b2c04d51c30225532e0ae04509899141e9957ed096fe749d7fd9df8f82f`).
2. En extraire seulement les dossiers `pgsql\bin`, `pgsql\lib`, `pgsql\share` vers `%LOCALAPPDATA%\PROBANT\pgsql-17\` (pgAdmin et la documentation ne servent pas).
3. Vérifier : `& "$env:LOCALAPPDATA\PROBANT\pgsql-17\bin\postgres.exe" --version` affiche `postgres (PostgreSQL) 17.x`.

Aucun service Windows n'est installé : le lanceur démarre et arrête lui-même le serveur du profil. Une installation EDB classique (`C:\Program Files\PostgreSQL\17\bin`) convient aussi : elle est détectée, ou s'indique avec `--pg-bin`.

## Premier lancement (PowerShell, à la racine du dépôt)

```powershell
npm ci
npm run local:init -- --nom "Prénom Nom"
npm run local:start
```

- `local:init` crée le profil dans `%LOCALAPPDATA%\PROBANT\personnel` (ou `--home <dossier>`, ou `PROBANT_LOCAL_HOME`) : cluster PostgreSQL dédié (port 54329, écoute 127.0.0.1 seulement, authentification SCRAM, sommes de contrôle de pages), base `probant_personnel`, rôle applicatif sans superutilisateur, marqueur `probant_local.profile`, les 22 migrations, l'organisation locale. Le nom sert à la **relecture personnelle nommée**.
- `local:start` démarre PostgreSQL, vérifie que la base est bien celle du profil (nom, `data_directory`, marqueur), applique les migrations en attente (après une sauvegarde automatique), compile Next si le code a changé (`next build`, quelques minutes la première fois), démarre `next start` sur `http://127.0.0.1:3210`, puis ouvre un **lien de connexion à usage unique** (10 minutes).
- La page d'accueil du profil est `/local` : identité, type de relecture, base, migrations, liste des dossiers, création d'un dossier et liens vers chaque feuille de cycle.

Options utiles : `--port-pg`, `--port-app`, `--relecture distincte` (désactive la relecture de son propre travail), `--simulation` (ouvre une seconde identité de simulation), `--pg-bin <dossier bin>`.

## Usage courant

| Commande | Effet |
|---|---|
| `npm run local:start` | démarre (ou, si Next tourne déjà, redonne un lien de connexion) |
| `npm run local:stop` | arrête Next puis PostgreSQL (arrêt `fast` : transactions en cours annulées, base cohérente) |
| `npm run local:status` | état du profil, des processus, des migrations, dernière sauvegarde |
| `npm run local:login` | nouveau lien de connexion ; `-- --simulation` : lien de la seconde identité (simulation) |
| `npm run local:backup` | sauvegarde cohérente (`-- --label texte`) |
| `npm run local:restore -- <sauvegarde> --vers <dossier>` | restauration dans un **nouveau** profil |
| `npm run local:migrate` | migrations en attente, précédées d'une sauvegarde |

Pour un profil hors de l'emplacement par défaut : `npm run local:start -- --home "D:\PROBANT\profil"` (toutes les commandes acceptent `--home`).

## Fichiers du profil

```
%LOCALAPPDATA%\PROBANT\personnel\
  probant.local.json     configuration (modifiable : ports, nom, relecture, simulation, dossier bin)
  secrets.local.json     mots de passe PostgreSQL et secret de session (créés par local:init ; à ne pas diffuser)
  pgdata\                cluster PostgreSQL du profil
  pieces\                dépôts FEC (écriture unique, notice de taille/type/empreinte à côté de chaque pièce)
  sauvegardes\<date>\    base.dump, manifeste.json, pieces\
  logs\                  postgresql.log, pg_ctl.log, next.log
  run\etat.json          PID de Next pendant qu'il tourne
```

Les imports des feuilles de cycle (Clients, Trésorerie, Immobilisations, Capitaux propres, Fiscal, Stocks, Provisions, Emprunts) et les pièces de clôture sont conservés dans PostgreSQL, octets originaux compris (`original_base64`, empreinte SHA-256 vérifiée à chaque téléchargement) : ils sont donc sur le PC et dans chaque sauvegarde. Les dépôts FEC durables vont dans `pieces\` par l'adaptateur `LocalObjectStorage` (même contrat `ObjectStorage` que S3) et sont traités dans le serveur local ; un dépôt interrompu reprend depuis l'état PostgreSQL au démarrage suivant (premier affichage de `/local`, puis chaque minute).

## Identité et relecture

- Le profil n'a pas de mot de passe ni de fournisseur OIDC : le lien de connexion porte un code aléatoire de 256 bits dont seule l'empreinte est en base, consommé une fois. Il ouvre une session serveur ordinaire (`auth_sessions`, cookie `__Host-`, jeton CSRF), émise par `probant-local:<profil>`. Une session d'un autre profil (par exemple après restauration) est refusée.
- Rôles et type de relecture viennent de la configuration du serveur, jamais d'une étiquette envoyée par le navigateur.
- **Relecture personnelle nommée** (par défaut) : vous pouvez approuver votre propre feuille ; l'approbation enregistre `kind: "personal"` et votre nom, les écrans et les exports affichent « Relecture personnelle nommée — Nom (identité) ». Ce n'est pas une revue par une autre personne. Hors profil local, la règle `SELF_APPROVAL_FORBIDDEN` est inchangée.
- **Seconde identité de simulation** (`"simulation": true`) : identité `simulation-seconde-identite`, rôle relecteur seul ; chaque approbation qu'elle donne est enregistrée et affichée comme simulation.
- Le dossier de clôture (`cl_*`) garde ses propres règles de relecture distincte (NEP 230 §08) : la relecture personnelle n'y est pas encore admise (lot C14). L'habilitation de clôture et l'accès confidentiel des provisions restent accordés à personne, comme auparavant.

## Sauvegarde et restauration

- **Cohérence** : la sauvegarde ouvre une transaction `REPEATABLE READ`, exporte son instantané (`pg_export_snapshot`) et lance `pg_dump --snapshot` sur ce même instantané ; le manifeste (nombre de lignes et empreinte de contenu de chaque table publique) et l'inventaire des pièces sont calculés dans la même transaction. Le dump est relu par `pg_restore --list`, son SHA-256 est inscrit au manifeste, chaque pièce copiée est revérifiée.
- **Restauration** : toujours dans un dossier distinct, jamais sur, dans ou autour du profil courant (refus explicite). Elle vérifie le dump et les pièces contre le manifeste, crée un nouveau cluster (ports du profil source + 10 par défaut), restaure, attribue un **nouvel identifiant de profil** (les anciennes sessions et liens ne s'y appliquent pas), recompte chaque table et compare au manifeste ; tout écart fait échouer la commande et laisse le dossier pour examen. Le profil restauré se démarre avec `npm run local:start -- --home "<dossier>"`, à côté du profil courant.
- Copiez le dossier `sauvegardes\` sur un autre support pour vous prémunir d'une panne du disque : la sauvegarde locale protège contre l'erreur, pas contre la perte du PC.

## Migrations locales

- `local:start` et `local:migrate` comparent le registre `_probant_migrations` aux fichiers `drizzle/` ; s'il y a des migrations en attente sur une base déjà migrée, une sauvegarde « avant-migration » est prise d'abord.
- Chaque fichier de migration et son inscription au registre sont validés dans la même transaction (`atomicMigration`, `scripts/db/migration-utils.mjs`) : une coupure laisse la migration appliquée et inscrite, ou ni l'une ni l'autre.
- Les migrations descendantes (`*.down.sql`) ne sont jamais lancées par le lanceur ; elles servent à l'aller-retour de la CI sur sa base jetable.

## Garde-fous : jamais une base de test, jamais un test sur la base personnelle

- Le lanceur refuse une base `*_ci` / `*_test`, un `data_directory` différent de celui du profil (autre serveur sur le port), une base sans marqueur ou au marqueur d'un autre profil.
- Le serveur refuse le profil personnel sur Vercel, avec une base non locale ou de recette (`personalProfileIssues`).
- Les neuf recettes PostgreSQL jetables des feuilles (`*-durable.integration.test.ts`, Emprunts compris depuis C13) refusent toute base portant le marqueur `probant_local.profile`, quel que soit son nom.

## Erreurs fréquentes

| Message | Cause | Que faire |
|---|---|---|
| `PostgreSQL 17 introuvable` | binaires absents ou ailleurs | installer (voir plus haut) ou `--pg-bin "<dossier bin>"` |
| `Le port PostgreSQL 54329 est déjà utilisé` / `Le port 3210 est déjà utilisé` | autre programme sur le port | l'arrêter, ou changer `postgres.port` / `app.port` dans `probant.local.json` |
| `Le serveur sur ce port n'utilise pas le cluster du profil` | un autre PostgreSQL écoute sur le port du profil | ne jamais forcer : arrêter cet autre serveur ou changer de port |
| `Connexion refusée par PostgreSQL` | serveur arrêté entre deux commandes | `npm run local:status`, puis `local:start` |
| `Mot de passe refusé par PostgreSQL` | `secrets.local.json` remplacé ou d'un autre profil | restaurer le fichier d'origine ; sinon restaurer une sauvegarde dans un nouveau dossier |
| `PostgreSQL n'a pas démarré` | voir `logs\pg_ctl.log` et `logs\postgresql.log` (cluster verrouillé, disque plein, antivirus) | corriger la cause ; ne pas supprimer `pgdata\postmaster.pid` à la main si un `postgres.exe` du profil tourne |
| `Next ne répond pas` | erreur de démarrage | voir `logs\next.log` ; `local:start -- --build` pour forcer une recompilation |
| `next build a échoué` au premier lancement hors ligne | polices `next/font` non téléchargeables | relancer une fois connecté à Internet |
| Page `/local` « Connexion locale requise » | lien expiré (10 min), déjà utilisé, ou session d'un autre profil | `npm run local:login` |
| Feuille : `*_DURABLE_DISABLED` | serveur lancé hors du lanceur, ou drapeau retiré | relancer avec `npm run local:start` |
| `Restauration refusée : la cible …` | dossier cible = profil courant, dedans, autour, ou non vide | choisir un dossier vide distinct |

## Limites connues

- Les binaires EDB du zip ne portent pas de signature Authenticode : seule l'empreinte SHA-256 du téléchargement HTTPS a été relevée.
- La page Dépôt (`/dashboard/depot`) n'accepte le dépôt FEC durable que pour un dossier qui possède déjà une synthèse persistante ; le premier dépôt d'un nouveau dossier passe aujourd'hui par l'API (`/api/dossiers/<id>/uploads`), comme dans la recette C07. Raccorder l'écran est un lot distinct.
- Paie/Congés disposent du store local C12 (CSV pseudonymisés, relecture personnelle et export avec pièces) ; Emprunts a sa feuille durable `/emprunts` depuis C13 (emprunts simples en euros ; voir `docs/mission-c13/CONTRAT.md`).
- Un seul serveur Next par profil : le traitement FEC local est en processus, sans file partagée entre plusieurs serveurs.
- Lecteur d'écran non vérifié sur la page `/local`.
