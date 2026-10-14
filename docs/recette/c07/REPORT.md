# Rapport de recette C07 — reprise du profil personnel local

Exécution du 14/10/2026 (04:04 UTC, 4ᵉ passage, profil neuf créé par `local:init`), Windows 10 Pro 19045, Node 24.14.0, PostgreSQL 17.11. Méthode : [METHOD.md](./METHOD.md). Résultats bruts : [RESULTATS.json](./RESULTATS.json), journaux [journal-recette.log](./journal-recette.log), [journal-lanceur.log](./journal-lanceur.log) (codes de connexion masqués), [journal-init.log](./journal-init.log).

**42 contrôles sur 42 réussis.** Les trois premiers passages ont échoué sur des défauts corrigés ensuite, détaillés plus bas.

## Avant arrêt

| Contrôle | Résultat |
|---|---|
| Connexion | lien à usage unique → session `local-session`, relecture `personal`, nom affiché ; même lien rejoué → 401 |
| Profil | `personal_local`, 12 chaînes ouvertes, base `probant_personnel`, PostgreSQL 17.11, 22 migrations |
| Dossier créé deux fois en parallèle | un seul dossier (201 puis 200) |
| Import Trésorerie | 5 pièces ; empreinte serveur = SHA-256 du fichier sur disque |
| Population figée | 1 compte (512100) ; 3 exclusions motivées (USD, caisse, VMP) |
| Exécution | relevé 90,00 + 15,00 − 5,00 = 100,00 = GL ; écart 0,00 ; R1 `cleared`, P1 `open` ; `exceptions_detected` — conforme à l'attendu fixé avant exécution |
| Double commande simultanée (même clé) | 200 / 200, version 12 → 13, une seule note |
| Rejeu séquentiel / même clé autre contenu | 200, version 13 inchangée / 409 `IDEMPOTENCY_KEY_REUSED` |
| Conflit entre onglets | 409 `STALE_WORKPAPER_VERSION`, version attendue 13, serveur 14 ; saisie de B conservée, A non écrite |
| Relecture personnelle nommée | `kind: personal`, `actorId = preparedBy = proprietaire-local`, nom « Camille Martin (recette C07) » |
| Verrouillage, export | version 19 verrouillée ; JSON 159 818 o, HTML 30 987 o, PDF 29 907 o, manifeste 7 086 o ; l'export affiche « Relecture personnelle nommée — Camille Martin (recette C07) (proprietaire-local) » |
| Pièce téléchargée | octets identiques à l'original (SHA-256 `43198dd2…`) |
| FEC n° 1 (200 écritures doublées) | deux intentions simultanées → un seul job ; envoi vers `PUT /api/local/objects` ; job `completed` ; synthèse `persistent`, source `local:` ; fichier sur disque identique ; envoi d'autres octets sur la même autorisation → 422, original intact |
| FEC n° 2 (300 écritures doublées) | octets reçus, finalisation non faite (état `uploading`) au moment de l'arrêt |

## Arrêt puis relance

| Contrôle | Résultat |
|---|---|
| Arrêt | Next (PID 16812) et postmaster (PID 20000) absents, port 3210 fermé, `postmaster.pid` supprimé (arrêt propre) |
| Relance | Next PID 11540, postmaster PID 14460 (nouveaux processus) ; build déjà à jour, réutilisé |
| Feuille | même version 19 verrouillée, même approbation (identique champ à champ) |
| Sources et pièces | mêmes têtes de sources ; les 5 pièces relues octet pour octet |
| Synthèse et exports | même empreinte de synthèse (`b1cc04a8…`) ; JSON, HTML, PDF et manifeste identiques octet pour octet |
| FEC | même synthèse persistante (`bee65d26…`) ; dépôt n° 2 repris : même job, renvoi des mêmes octets accepté sans remplacement, `completed`, nouvelle synthèse |

## Sauvegarde et restauration

| Contrôle | Résultat |
|---|---|
| Sauvegarde | instantané exporté partagé par `pg_dump` et le manifeste ; 69 tables ; 2 pièces FEC copiées et revérifiées ; dump 342 283 o relu par `pg_restore --list` ([manifeste](./manifeste-sauvegarde.json)) |
| Restauration sur le profil courant | refusée (« la cible est le profil courant ; la cible existe et n'est pas vide ») |
| Restauration vers `recette-c07\restauration` | nouveau profil `d2c21c37…`, ports 54339 / 3220 ; 69 tables et 2 pièces identiques au manifeste, aucune différence ([rapport](./rapport-restauration.json)) |
| Profil courant après restauration | inchangé : mêmes version, sources, pièces, synthèse, exports |
| Profil restauré démarré à côté | mêmes version, sources, pièces, synthèse ; exports identiques octet pour octet à ceux du profil d'origine |

`export-avant.html` est conservé ; les copies relevées après reprise, après restauration et sur le profil restauré avaient le même SHA-256 (`ed1648a2…`) et n'ont pas été gardées.

Un rejeu réseau a eu lieu : la connexion qui suit la restauration a trouvé une connexion keep-alive fermée par le serveur pendant la pause (`ECONNRESET` avant toute réponse) ; le client de recette a renvoyé la même requête une fois, comme prévu, et l'a consigné.

## Écrans (Chromium, `e2e/c07-profil-local.spec.ts`, profil de recette démarré)

| Parcours | 390 | 1024 | 1440 |
|---|---|---|---|
| `/local` connecté : contexte, avis de relecture personnelle, création de dossier, 12 liens de travail ; aucun débordement ; axe WCAG 2.1 AA serious/critical : 0 | réussi | réussi | réussi |
| `/local` sans session : « Connexion locale requise », aucune donnée | réussi | réussi | réussi |
| Trésorerie en attente de revue : « Mission · profil personnel local · identité serveur », « Mode réel — profil personnel local », avis de relecture personnelle, bouton d'approbation ; aucun débordement ; axe : 0 | réussi | réussi | réussi |
| Deux onglets : la sauvegarde de l'onglet périmé ouvre « Une autre modification a été sauvegardée » et garde sa saisie | — | — | réussi |

Captures : [`docs/probant-lots/c07-captures/`](../../probant-lots/c07-captures/).

## Défauts trouvés par les passages précédents et corrigés

| Passage | Constat | Cause | Correction |
|---|---|---|---|
| 1ᵉʳ `init` | lanceur bloqué après « PostgreSQL démarré » | `spawnSync` attend la fermeture des tubes, hérités par `postgres.exe` | `pg_ctl start` écrit dans `logs/pg_ctl.log`, sans tube |
| recette 1 | connexion en boucle 303 | derrière `next start`, `request.url` porte un autre nom local que la barre d'adresse | l'origine visitée est lue dans l'en-tête `Host` (test ajouté) |
| recette 2 | intention FEC rejouée → 500 | **défaut antérieur** : `DrizzleUploadQuotaStore.release` passait une `Date` brute au pilote ; tout rejeu d'intention échouait (chemin persistant jamais exécuté, « NOT_TESTED ») | comparaisons typées `eq(...)` ; recette PostgreSQL `local-ingestion.integration.test.ts` : échoue avant, passe après |
| recette 3 | reprise FEC : nouvelle autorisation d'envoi après relance | comportement normal du service (intention non finalisée) ; mais un renvoi des mêmes octets était refusé (écriture unique) et aurait bloqué l'écran Dépôt | renvoi des mêmes octets idempotent ; d'autres octets toujours refusés (test ajouté) |
| recette 3 | « fetch failed » après la restauration | connexion keep-alive réutilisée après la pause | client de recette : un rejeu de la même requête, consigné |

## Non vérifié

Lecteur d'écran ; Firefox / Edge ; coupure de courant réelle ; PostgreSQL installé comme service Windows ; dépôt FEC par l'écran Dépôt (il exige aujourd'hui une synthèse persistante préexistante, voir les limites du handoff).
