# Mission 06 — résultats de validation

Date de validation : 2026-10-08. Base main `cc95c528eaa1db74aafa37cc42397310568f1a34`. PR brouillon : https://github.com/ludoviclabs-dotcom/PROBANT/pull/56. Production non activée.

Référence du code et des tests : `6a73a088093ef533f2db0513fd4b9c7134fc76bf`, [CI 37693011447](https://github.com/ludoviclabs-dotcom/PROBANT/actions/runs/37693011447). La mise à jour de ce document ne modifie pas le code testé.

## Exécuté

- Suite complète CI : **1 080 tests PASS**, dont **dix tests PostgreSQL 17 jetable** ; aucun test ignoré dans cette suite.
- Recette serveur : deux organisations, deux dossiers par organisation, sessions persistées et véritable autorisation serveur ; diagnostic avant revue, paquet approuvé refusé avant verrouillage, export après revue distincte, exception maintenue et version historique exacte.
- Refus inter-organisation / dossier, permission inadéquate, rôle ou approbation JSON fabriqués, CSRF absent et session expirée : vérifiés, y compris pour les exports et téléchargements.
- Rejeu, conflit concurrent et empreinte écran devenue obsolète : vérifiés. Une source remplacée est visible comme périmée ; diagnostic possible, paquet approuvé refusé ; ancienne décision intacte.
- HTML, manifeste et CSV téléchargés par des requêtes séparées à des instants différents : empreintes concordantes. Ordre différent des imports : mêmes JSON et manifeste.
- Redémarrage réel du conteneur PostgreSQL jetable puis nouveau runtime / connexions : reprise des versions, sources et identité. Les gardes append-only et la prolongation des sessions sont aussi vérifiées.
- Programme indépendant des anomalies, affectation explicite, couverture partielle avec numérateur / dénominateur / exclusions, preuve et version exactes, comparaison avant / après revue : PASS.
- HTML hostile échappé, texte long et Unicode conservés, table multipage et paragraphe dépassant une page PDF : PASS. PDF relu par PDF.js : dernier marqueur présent, texte de contenu au-dessus de la marge.
- Typecheck, lint et build : PASS localement et sur le code indiqué en CI ; sept avertissements de lint préexistants hors fichiers modifiés. Migrations reproductibles et aller-retour PostgreSQL, CodeQL, secret scan et fixtures d’ingestion : PASS.
- Suite locale : **1 070 PASS / dix PostgreSQL ignorés** faute de base locale. Dix-sept tests ciblés : PASS. Deux parcours Chromium locaux : PASS (réponses de fixture interceptées explicitement, pas une recette durable). Capture de la Synthèse inspectée.
- Preview Vercel du même commit : **READY**, environnement Preview (`target=null`) ; https://probant-99vnng7q6-ludovics-projects-159c139c.vercel.app. Métadonnées Git et état vérifiés par le connecteur Vercel ; aucune variable ou production modifiée.

Playwright / axe sur ce code en CI : **57 PASS / un ignoré**, dont les deux nouveaux parcours Clients. Le test ignoré est l’E2E FEC durable nécessitant S3 / SQS / IdP, décrit ci-dessous. Lighthouse, contrôle commun du socle, est encore en cours au moment de cette consignation ; aucun succès final annoncé pour ce job. Ces contrôles ne remplacent pas une recette authentifiée dans Vercel.

## Réserve bloquante du socle

L’audit CI échoue encore : **14 vulnérabilités (deux critiques, neuf élevées, trois modérées)**. Package et lockfile inchangés ; avis déjà présents dans la base Mission 05. Génération et publication du SBOM suivantes non exécutées car cet audit est bloquant. Aucun contrôle contourné et aucune mise à niveau majeure forcée. PR maintenue en brouillon.

## Non exécuté et limites

- Fournisseur OIDC extérieur et parcours authentifié complet dans une Preview Vercel avec base / IdP dédiés : dépendances de recette non provisionnées ; non exécutés. Les tests OIDC du socle passent ; les tests serveur de recette utilisent des identités synthétiques dans des sessions persistées et le véritable authorizer.
- E2E FEC durable du socle : non exécuté sans PostgreSQL / S3 / SQS / IdP dédiés ; indépendant de cette recette Clients PostgreSQL.
- Arrêt brutal Node au milieu d’une transaction et volumétrie aux bornes maximales : non exécutés.
- Validation PDF/A / archivage certifié : non exécutés. PDF standard Latin-1 ; HTML / JSON conservent Unicode.
- Originaux binaires absents du paquet ; index explicite et téléchargement séparé avec permission du même dossier.

Aucun fallback mémoire présenté comme durable. Aucun changement production. Aucune opinion automatique.
