# TAX-10 — QA visuelle

Date : 2026-08-17
Artefact testé : build Next.js de production
Commande : `npm run test:e2e:tax-release`

## Viewports

| Nom | Dimensions | Débordement horizontal | Rendu pleine page |
|---|---:|---|---|
| mobile compact | 320 × 568 | aucun | capturé par Playwright |
| mobile | 390 × 844 | aucun | capturé par Playwright |
| tablette | 768 × 1024 | aucun | capturé par Playwright |
| desktop | 1440 × 900 | aucun | capturé par Playwright |
| desktop large | 1920 × 1080 | aucun | capturé par Playwright |

La grille du cockpit utilise `minmax(min(340px, 100%), 1fr)` afin que les cartes restent contenues à 320 px.

## Contrôles transverses

| Contrôle | Résultat |
|---|---|
| Console | aucun message après correction de l'icône ; avertissement CSP report-only explicitement reconnu dans Playwright |
| Réseau | aucune requête non réussie sous Chrome DevTools ; préchargements RSC annulés volontairement exclus des pannes |
| État d'erreur | format `.exe` refusé avec message explicite |
| Navigation clavier | filtre TVA activable par focus + Entrée ; `aria-pressed` et URL synchronisés |
| Contrastes | aucune violation critique ; dette de contraste sombre bornée par la baseline existante |
| Reduced motion | media query `prefers-reduced-motion: reduce` émulée et parcours utilisable |
| Noms accessibles | formulaire de revue, pièces, exports et filtres exposés dans l'arbre d'accessibilité |

## Vérification indépendante Chrome DevTools

La procédure `chrome-devtools-mcp` a été exécutée après Playwright : navigation, snapshot de l'arbre d'accessibilité, liste console et liste réseau.

Elle a détecté un `404 /favicon.ico` absent des événements `requestfailed` de Playwright. L'ajout de `app/icon.svg`, puis une nouvelle construction de production, ramène la console à zéro message et toutes les requêtes listées à un statut réussi.

## Parcours E2E synthétique

Les six tests passent :

1. intention de nouveau dossier, dépôt d'une balance synthétique et onboarding ;
2. capabilities, contrôles et waterfall ;
3. décision append-only ;
4. rattachement d'un justificatif haché ;
5. note fiscale et exports ;
6. manifeste de neuf artefacts et digest des événements.

Le parcours durable PostgreSQL/S3/SQS/OIDC reste distinct et n'est pas simulé ; voir `TAX_KNOWN_LIMITATIONS.md`.

## Gate finale consolidée

Après les corrections de libellés et de statut des sources, le build de production a été reconstruit puis la suite Playwright complète a été relancée : **29 tests réussis, 1 test persistant ignoré**. Les six scénarios TAX-10 sont inclus dans ces 29 réussites. Le test ignoré reste conditionné par `PROBANT_E2E_PERSISTENT=1`.
