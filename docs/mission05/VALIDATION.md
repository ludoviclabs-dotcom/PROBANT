# Mission 05 — résultats de validation

Date : 2026-10-07. Base : main `11f99888b23c769fbc2b6c5da94b7faebb3951e8`. PR brouillon : https://github.com/ludoviclabs-dotcom/PROBANT/pull/55. Production : non activée.

## Vérifications exécutées

Référence serveur et recette : commit `e333a9549ddbc904906f1cc46f380223647be85f`, [CI 37683820862](https://github.com/ludoviclabs-dotcom/PROBANT/actions/runs/37683820862).

- Typecheck et lint : PASS ; sept avertissements de lint préexistants hors fichiers modifiés.
- Suite complète CI : **1 064 PASS**, dont **huit tests sur PostgreSQL 17 jetable**. Aucun test de cette suite ignoré en CI.
- Recette serveur : deux organisations, deux dossiers par organisation, préparation et revue ; imports approuvés, réimport identique sous un autre nom, population complète, calcul, exception, soumission, demande de correction, révision, revue distincte et verrouillage.
- Accès transversal, autorité JSON fabriquée, CSRF absent, auto-approbation même avec les deux rôles, note bloquante non résolue : refus vérifiés.
- Rejeu exact avec un seul effet, réutilisation de clé pour un autre contenu et conflit concurrent avec version serveur : vérifiés.
- Redémarrage réel du conteneur PostgreSQL jetable, recréation du runtime / des connexions et relecture des sources, versions et sessions : PASS. Prolongation de session et expiration vérifiées contre les vrais horodatages PostgreSQL.
- Téléchargements : octets identiques à l’original dans le périmètre autorisé ; refus inter-organisation / dossier et après expiration.
- Remplacement de source : invalidation des commandes et révision ; ancienne décision verrouillée inchangée. UPDATE / DELETE des versions et sources interdits par la base.
- Migrations : génération reproductible, contrôle statique, application et aller-retour descendant / remontant sur PostgreSQL : PASS.
- Build Next.js : PASS localement et en CI. CodeQL, secret scan et fixtures d’ingestion : PASS.
- Interface : trois tests PASS pour attente d’accusé, échec / rejeu réseau et comparaison de conflit conservant le brouillon. Chrome DevTools : écran initial local et refus de chargement sans session vérifiés. Messages de refus de la feuille traduits en français ; tests de composant et typecheck revalidés après cette édition.
- Suite locale : **1 056 PASS / huit ignorés** faute de PostgreSQL installé sur l’hôte. Un timeout d’export historique rencontré dans le premier lancement a disparu au contrôle isolé (86 PASS) puis dans la suite complète avec deux workers.

Les contrôles communs Playwright / axe et Lighthouse sont suivis dans la CI de la PR. Ils ne constituent pas une recette du nouveau parcours authentifié Vercel.

## Réserve bloquante du socle

Le job d’audit des dépendances échoue : **14 vulnérabilités rapportées, dont deux critiques, neuf élevées et trois modérées**. `package.json` et `package-lock.json` sont inchangés par ce lot : ces dépendances appartiennent à la base indiquée ci-dessus. L’étape SBOM suivante n’est pas exécutée car cet audit est bloquant. La PR reste en brouillon ; aucun contournement du contrôle ni mise à niveau majeure forcée n’a été effectué.

## Non exécuté

- Nouveau flux de connexion avec un fournisseur OIDC extérieur : aucun IdP de recette dédié provisionné. La recette utilise les sessions synthétiques créées par `DrizzleSessionStore`, le vrai `RequestAuthorizer`, les cookies et le contrôle CSRF. Les tests OIDC existants du socle passent.
- Chaîne complète authentifiée dans une Preview Vercel avec base et IdP dédiés : ces dépendances de recette ne sont pas configurées. Les Previews Git compilent ; aucun flag, secret ou environnement de production n’a été modifié.
- Arrêt brutal du processus Node au milieu d’une transaction et recette de volumétrie : non exécutés. La reprise PostgreSQL et la recréation du runtime sont exécutées comme décrit ci-dessus.

Aucun fallback mémoire présenté comme durable. Les autres moteurs et le cycle Clients complet restent fermés.
