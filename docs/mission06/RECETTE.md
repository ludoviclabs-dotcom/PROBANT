# Mission 06 — recette

## Exécution

- `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.
- `npm run test:e2e -- e2e/client-mission.spec.ts` : contrat de présentation dans Chromium, réponses serveur de fixture interceptées explicitement ; ce test ne prétend pas valider la durabilité.
- PostgreSQL localhost, base finissant par `_ci` ou `_test` : appliquer `npm run db:migrate`, puis `PROBANT_CLIENTS_TEST_DATABASE_URL=… npm test -- lib/workpapers/__tests__/clients-durable.integration.test.ts`.
- La CI existante applique les migrations sur son PostgreSQL 17 jetable et fournit l’identifiant du conteneur pour son redémarrage réel. Les sessions synthétiques passent par `DrizzleSessionStore` et le vrai `RequestAuthorizer`.

## Matrice attendue

| Scénario | Preuve |
| --- | --- |
| Compteurs sans anomalie, affectation unique ou explicite | Tests purs du programme |
| Procédure partielle : numérateur, dénominateur, exclusions | Test de couverture et rendu HTML |
| Revue conserve les résidus +10 / -10 et leur provenance | Tests purs, UI, Chromium et PostgreSQL |
| Écran / export : même état canonique et mêmes identités | JSON et manifeste vérifiés, HTML téléchargé dans Chromium, empreinte réponse HTTP PostgreSQL |
| Diagnostic distinct du paquet approuvé | Titres, noms et manifeste ; refus avant verrouillage |
| Source périmée visible ; ancienne décision inchangée | Remplacement PostgreSQL, Synthèse périmée, diagnostic permis, paquet approuvé refusé |
| Concurrence entre affichage et export | Empreinte obsolète → 409 sans fichier |
| Accès interdit, CSRF absent, session expirée | Routes réelles avec sessions serveur sur PostgreSQL |
| Rôle / snapshot / approbation transmis par navigateur | Corps strict → refus |
| Texte long, HTML hostile, Unicode et table multipage | HTML échappé, PDF relu par PDF.js, dernier marqueur présent et positions de texte au-dessus de la marge |
| Version / filtre demandés | Tests UI et lien ouvert dans Chromium |
| Focus et défilement après traitement | Composant + Chromium ; aucun déplacement du bouton avant accusé |
| Reprise | Redémarrage réel PostgreSQL et nouveau runtime ; recettes Mission 05 conservées |

Le contrat et les résultats réels sont consignés dans CONTRAT.md et VALIDATION.md. Ne pas qualifier les tests d’interface interceptés de recette authentifiée Vercel. La chaîne OIDC extérieure et la Preview avec base / IdP dédiés requièrent ces dépendances ; aucune activation production.
