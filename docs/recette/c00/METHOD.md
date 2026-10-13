# C00 — Méthode et périmètre

Le chantier `mission-c00`, branche `codex/c00-integration`, est une copie Git indépendante de la base actuelle de `main`, vérifiée par le connecteur GitHub : `ab8f991e65b0ad93e6f9a21281010b680c868466`. Les références distantes sont consultées en lecture seule. Aucun push, aucune fusion et aucun déploiement ne font partie de C00.

## Origine des corrections

Le rapport local `mission20-review/PROBANT-MISSION-20-RAPPORT-COMPLET.md` est daté du 10 octobre 2026, sections 1, 2 et 4. Le diagnostic fourni est daté du 12 octobre 2026. Le rapport, le diff `mission20-review/MISSION20-review.diff`, son exemplaire dans `package/`, le checkout `mission20` et les preuves `mission20/docs/recette/mission20` ont été retrouvés. `inventory.json` conserve chemins, présence et empreintes SHA-256. Les neuf fichiers fonctionnels C00 du diff archivé sont identiques au diff actuel du checkout M20.

Les consignes du rapport concernant un pilote ne sont pas une demande d'exécution. C00 conserve le cadre personnel local exprimé par l'utilisateur. Les résultats historiques M20 restent attribués à leur rapport ; les comparaisons finales C00 utilisent `before-final/` et `after-final/`, avec `before/dependency.json` pour la régression Windows initiale. Les essais intermédiaires restent conservés séparément, notamment la première intégration M20 (`after/` : 15 succès, un échec de contraste) et ses détails (`contrast-investigation/`).

L'audit aux trois largeurs révèle trois compléments nécessaires au diff M20 : couleur locale de l'accueil, titre de l'index Référentiel et libellé de criticité Risques. Les deux premiers utilisent le token corrigé ; le troisième réutilise `compositeTextColor`, le calcul de couleur d'interface déjà appliqué au chiffre voisin. Les fonds sémantiques, scores et seuils métiers ne changent pas. Les détails axe publiés conservent le HTML et les raisons de l'échec, puis la mesure finale exige toujours zéro serious/critical.

## Préservation

Le checkout M20 n'est ni réinitialisé ni nettoyé. `m20-preservation.json` enregistre l'état Git et les empreintes des 111 fichiers modifiés/non suivis présents au départ, y compris les preuves. La copie C00 possède son propre `.git` et son propre `node_modules` installé depuis le lock existant, hors réseau (`npm ci --offline --ignore-scripts --no-audit --no-fund`). Le paquet local `fast-glob` pointe vers le véritable adaptateur de C00, pas celui de M20.

## Vérifications

Les attendus sont indépendants du CSS : largeur globale au plus égale à 390, 1024 ou 1440 pixels ; identifiants SHA-256 complets ; 128 procédures dont 127 applicables dans la fixture existante ; aucun défaut axe serious/critical ; maintien du défilement interne des tables, du clavier et de la réduction des animations. Aucun seuil de contraste ou de largeur n'est assoupli.

- `dependency-compat.test.ts` est exécuté sur Windows avant/après : globSync borné, motifs absolus/relatifs/accolades/récursifs, consommateur réel `@next/eslint-plugin-next`, règle de liens internes et résolution du paquet. Le test ExcelJS déjà présent dans le même fichier est conservé.
- Les régressions M20 de contraste et de programme long sont reprises. Les sorties sont redirigées vers C00 ; la première est étendue aux trois largeurs.
- `c00-layout.spec.ts` emploie `clientMissionFixture`, `createClosingHarness`, `buildRecipe` et les handlers existants. Il complète la fixture légère Clients avec les liens `linkImportedEvidence` utilisés par `WorkpaperService.addEvidence` et par la commande serveur de gel, puis recalcule les empreintes de soumission/revue de cette simulation. Il observe la version verrouillée et ses identifiants sources complets, ainsi qu'un programme de 128 procédures et son panneau de détail, à chaque largeur. Tous les montants et identifiants sont conservés sans raccourcissement.
- Le navigateur utilise une compilation locale Next et Chrome, sur `127.0.0.1:3120`, après stabilisation réseau et chargement des polices. Les réponses des parcours Clients/dossier sont explicitement interceptées : il s'agit d'une vérification de présentation, pas d'une nouvelle preuve de persistance ni d'identité réelle. Les pages historiques emploient le mode de démonstration explicite du dépôt.
- Les régressions existantes Clients/ventes, mission Clients et dossier sont également sélectionnées sur la version corrigée.

La configuration C00 refuse la réutilisation d'un serveur inconnu. Le lanceur `c00-browser.mjs` vérifie que le port dédié est libre, crée directement son propre processus Next (sans shell/npm intermédiaire), enregistre son PID et son BUILD_ID, puis arrête ce processus à la fin. Cela évite le blocage de fermeture automatique Playwright observé lors du premier essai Windows ; aucun contrôle produit n'est contourné. Elle ne configure ni PostgreSQL, ni migrations, ni session persistante, ni S3/SQS/OIDC. Aucun script `mission20-postgres` ou `mission20-resume` n'est repris. Le scénario PostgreSQL M20 n'est pas sélectionné : il reste non vérifié par C00, sans être compté comme un succès ou comme un nouveau test exécuté.

## Commandes reproductibles

Depuis le chantier C00, avec les dépendances locales installées :

```powershell
node node_modules/next/dist/bin/next build
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/vitest/vitest.mjs run --config vitest.config.mjs --configLoader native --project unit --maxWorkers 1 lib/security/__tests__/dependency-compat.test.ts
$env:PROBANT_C00_PHASE = "verification-c00-001"
node scripts/recette/c00-browser.mjs e2e/c00-layout.spec.ts e2e/mission20-design.spec.ts e2e/mission20-contrast.spec.ts e2e/client-mission.spec.ts e2e/clients-sales.spec.ts e2e/closing.spec.ts
```

Le chargeur natif est celui déjà documenté pour l'environnement Windows M20 ; les tests conservent leurs assertions et les consommateurs réels. Les comptes finaux et codes de sortie sont consignés dans le rapport C00. Le lanceur refuse de réécrire une phase déjà enregistrée ; choisir un nom nouveau, ou omettre PROBANT_C00_PHASE pour obtenir un nom daté automatiquement. Les logs initiaux ou les relances ne sont jamais effacés.

## Limites

Le libellé initial « Modifications non sauvegardées » (M20-UI-03) reste un incident distinct de C02. Aucun moteur, contrat comptable, montant, règle française ou migration n'est modifié. C00 n'ajoute donc aucune source normative. Le lecteur d'écran réel, la persistance, les dossiers réels et l'environnement distant ne sont pas validés par ces tests de présentation. Les textes ISO ne sont pas concernés.
