# Mission 05 — recette

Base : main `11f99888b23c769fbc2b6c5da94b7faebb3951e8`. Travail isolé dans `codex/mission05-clients-durable`. Date : 2026-10-07.

## Exécution

La suite `lib/workpapers/__tests__/clients-durable.integration.test.ts` utilise **PostgreSQL réel**, les migrations existantes plus 0005, `DrizzleSessionStore`, `RequestAuthorizer`, les routes spécialisées et `WorkpaperService`. Deux organisations, deux dossiers par organisation, deux rôles métier ; une session cumulant ces deux rôles pour tester spécifiquement l'auto-approbation. Données intégralement synthétiques.

La suite reste ignorée si `PROBANT_CLIENTS_TEST_DATABASE_URL` manque. Elle refuse un hôte autre que localhost et une base dont le nom ne se termine pas par `_ci` ou `_test`. La CI existante fournit son conteneur PostgreSQL 17 jetable et applique les migrations avant les tests. Aucune base de production ni variable Vercel n'est lue ou modifiée pour cette recette.

Commandes :

1. `npm ci`
2. Sur une base PostgreSQL jetable locale : `DATABASE_URL=… npm run db:migrate`
3. Avec cette même base : `PROBANT_CLIENTS_TEST_DATABASE_URL=… npm test -- lib/workpapers/__tests__/clients-durable.integration.test.ts`
4. `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`, `npm run db:check`

Les scripts pnpm du socle peuvent exécuter les mêmes commandes ; le dépôt fournit actuellement un package-lock npm.

## Scénarios couverts

- Import, aperçu et mapping approuvé par identité serveur, population complète, calcul versionné avec résidus bruts +20 EUR / net zéro.
- Cloisonnement entre organisations et dossiers, permission de préparation refusée au relecteur.
- Rôle, acteur et approbation fabriqués dans le JSON refusés ; CSRF absent refusé.
- Rejeu avec une seule version créée ; clé réutilisée avec contenu différent refusée.
- Commandes concurrentes : une sauvegarde et un 409 portant la version serveur.
- Auto-approbation refusée même lorsque le préparateur dispose aussi du rôle de relecteur.
- Note bloquante non résolue : approbation refusée ; demande de correction, révision, résolution, soumission, approbation distincte et verrouillage.
- UPDATE / DELETE de versions ou sources refusés par PostgreSQL.
- Fermeture de toutes les connexions puis nouveau runtime / nouveau magasin de sessions : reprise des versions, sources et identité depuis la base.
- Téléchargements autorisés dans le périmètre, refusés transversalement et après expiration.
- Source remplacée : commandes invalidées et nouvelle révision sans réécriture de la décision verrouillée.

Les tests de composant vérifient attente d'accusé, échec réseau et rejeu avec la même clé, comparaison concurrente et reprise explicitement choisie. Les tests unitaires vérifient le registre fermé, le périmètre exclu et le refus de l'autorité navigateur.

## Limites de la recette

La reprise testée ferme les connexions et recrée le runtime applicatif ; elle ne redémarre pas le serveur PostgreSQL. Aucun fournisseur OIDC extérieur n'est provisionné : les sessions de test sont créées par le magasin serveur avec des identités synthétiques, puis résolues par le vrai authorizer. Le flux de connexion OIDC reste couvert par les tests existants du socle, pas par une nouvelle recette avec un IdP externe.

La recette Vercel authentifiée avec une base dédiée et un IdP dédié n'est pas exécutée sans ces dépendances. Pas de production. Les résultats effectivement exécutés et les réserves sont consignés dans VALIDATION.md.

