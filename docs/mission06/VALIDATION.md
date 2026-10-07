# Mission 06 — validation

Date : 2026-10-07. Base main `cc95c528eaa1db74aafa37cc42397310568f1a34`. Production non activée.

## Exécuté localement

- Suite complète : 1 070 tests PASS ; dix tests PostgreSQL ignorés faute de base locale. Ils sont prévus sur le service jetable de la CI existante.
- Dix-sept tests ciblés de Synthèse, export, versions et sauvegarde : PASS.
- Lint : PASS, sept avertissements préexistants hors fichiers modifiés.
- Typecheck et build : résultats finaux à consigner après achèvement.
- Recette Chromium du nouveau parcours : résultat à consigner après exécution.

## Infrastructure jetable et Preview

Résultats de CI et métadonnées Vercel à consigner sur le commit livré. Aucun test durable ne sera annoncé exécuté sans résultat de PostgreSQL réel.

## Réserves et non exécuté

- Fournisseur OIDC extérieur et parcours authentifié complet dans une Preview Vercel avec base / IdP dédiés : dépendances de recette non provisionnées ; non exécutés. Les tests OIDC du socle passent dans la suite ; les tests serveur de recette utilisent des sessions synthétiques persistées et le véritable authorizer.
- Arrêt brutal Node au milieu d’une transaction, volumétrie aux bornes maximales et certification PDF/A : non exécutés.
- Pièces binaires absentes du paquet exporté, téléchargement séparé autorisé seulement dans le périmètre du dossier. HTML / JSON conservent Unicode ; PDF standard Latin-1.
- L’audit des dépendances était bloquant sur la base Mission 05 : 14 avis (deux critiques, neuf élevés, trois modérés). Package et lockfile inchangés. Aucun contrôle contourné ; PR à conserver en brouillon si cet audit reste en échec.

Aucun fallback mémoire présenté comme durable. Aucun changement production. Aucune opinion automatique.
