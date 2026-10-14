# Méthode de recette C07 — runtime personnel local persistant

Date : 14 octobre 2026. Poste : Windows 10 Pro 19045, Node 24.14.0, PostgreSQL 17.11 (binaires EDB, `%LOCALAPPDATA%\PROBANT\pgsql-17`). Données exclusivement synthétiques (`docs/recette/c07/pieces/`).

## Profils utilisés

| Profil | Emplacement | Rôle |
|---|---|---|
| Profil personnel **de recette** | `%LOCALAPPDATA%\PROBANT\recette-c07\personnel` (ports 54329 / 3210), nom « Camille Martin (recette C07) », simulation ouverte | créé par `local:init`, piloté uniquement par le lanceur |
| Profil restauré | `%LOCALAPPDATA%\PROBANT\recette-c07\restauration` (ports 54339 / 3220) | créé par `local:restore` depuis la sauvegarde du profil de recette |
| Cluster jetable des recettes PostgreSQL | dossier temporaire de session, port 55432, base `probant_test` | exécution des huit `*-durable.integration.test.ts`, jamais le profil personnel |

Le profil personnel par défaut de l'utilisateur (`%LOCALAPPDATA%\PROBANT\personnel`) n'a pas été créé : il revient à l'utilisateur, avec son nom.

## Attendus fixés avant exécution

Fixture « pont bancaire » (identique aux tests unitaires Trésorerie) : relevé 90,00 + remise non créditée R1 15,00 − chèque non débité P1 5,00 = 100,00 = solde GL du compte 512100 ; écart 0,00. R1 est apurée par S1 (15,00 le 03/01/2025, dans la fenêtre documentée du 01/01 au 28/02/2025) ; P1 reste ouverte (aucun débit de −5,00 dans la fenêtre ; S2 vaut −40,00). Population : 1 compte retenu ; 3 exclus avec motif (devise USD, caisse, VMP). Résultat : `exceptions_detected` avec un suspens ouvert.

Dépôt FEC : fichiers synthétiques équilibrés (n ventes 411000 / 707000, `JournalCode|…|Idevise`), 200 puis 300 écritures doublées ; le traitement doit aboutir à `completed` et à une synthèse persistante dont la source porte le fournisseur `local`.

Reprise : après arrêt de Next et de PostgreSQL et relance de **nouveaux** processus (PID différents), la feuille garde la même version verrouillée, la même approbation, les mêmes sources courantes, les mêmes octets de pièces (SHA-256), la même empreinte de synthèse et des exports identiques octet pour octet ; la synthèse FEC garde la même empreinte ; le dépôt interrompu reprend sans nouvel envoi.

## Protocole (`npx tsx scripts/local/recette-c07.ts complete --home … --restore …`)

1. `local:start` (build de production si le code a changé) ; relevé des PID de Next et du postmaster.
2. Connexion par lien à usage unique (`local:login`) ; rejeu du même lien → 401.
3. Dossier créé deux fois en parallèle → un seul dossier.
4. Trésorerie : import des cinq pièces (aperçu puis approbation), création, gel de la population, configuration, exécution ; contrôles des montants.
5. Double commande : même note envoyée deux fois **simultanément** avec la même clé d'idempotence, puis rejouée, puis réutilisée avec un autre contenu.
6. Conflit entre onglets : B enregistre la version v+1, A envoie encore `expectedVersion = v` → 409 avec la version serveur ; la saisie de B est conservée, celle de A n'est pas écrite.
7. Conclusion, traitement du point bloquant, soumission, **relecture personnelle nommée**, verrouillage ; export approuvé (JSON, HTML, PDF, manifeste) ; téléchargement d'une pièce.
8. Dépôt FEC n° 1 complet (double intention avec la même clé → un seul job ; second envoi sur la même autorisation → refusé, original intact) ; dépôt n° 2 reçu mais non finalisé.
9. `local:stop` : plus de processus Next ni PostgreSQL, port fermé, `postmaster.pid` supprimé (arrêt propre).
10. `local:start` : nouveaux PID ; relecture complète (version, sources, cinq pièces, synthèse, exports) ; synthèse FEC inchangée ; reprise du dépôt n° 2 (même job, sans nouvel envoi) → `completed`, nouvelle synthèse.
11. `local:backup` ; tentative de restauration sur le profil courant → refusée ; `local:restore` vers un dossier distinct → comparaison table par table au manifeste ; relecture du profil courant (inchangé) ; démarrage du profil restauré sur d'autres ports, relecture complète et exports identiques ; arrêt.

Les contrôles d'interface (390, 1024, 1440, axe WCAG 2.1 AA serious/critical, débordement, relecture personnelle dans la feuille, conflit entre deux onglets) sont joués par `e2e/c07-profil-local.spec.ts` contre le profil de recette démarré.

## Ce qui n'est pas vérifié ici

Lecteur d'écran (NVDA), autre navigateur que Chromium, coupure de courant réelle pendant une migration (l'atomicité est établie par construction et par test de la forme SQL), disque plein, PostgreSQL installé comme service Windows (seuls les binaires ont été utilisés).
