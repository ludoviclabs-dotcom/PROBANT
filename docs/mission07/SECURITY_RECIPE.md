# Recette sécurité — prérequis Mission 07

Date : 8 octobre 2026. Branche issue de main après intégration du cadrage et de la Synthèse (PR 56).

Le nouvel audit npm comptait 15 paquets affectés (les 14 préexistants et Next désormais signalé). Les corrections sont décrites dans DEPENDENCY_REMEDIATION.md. Aucun avis n'est ignoré ou retiré du rapport.

- Installation complète npm ci : réussie ; consommateur réel Next résout @probant/next-root-glob, pas un alias brut.
- npm audit : zéro vulnérabilité, tous niveaux.
- Suite locale après migration Vitest/Oxc : 1 076 tests réussis, dix tests PostgreSQL ignorés faute de serveur local.
- Contrôles ciblés : neuf réussis (compatibilité Next, classeur ExcelJS/UUID, inventaire SBOM et empreintes locales).
- Types et lint : réussis ; sept avertissements préexistants, aucune erreur.
- Construction Next 15.5.27 : réussie.

Le nombre de workers est borné à deux, avec isolation des fichiers conservée. Le chargement PDF à froid dispose d'un délai explicite de quinze secondes ; ses assertions de revue manuelle et d'absence d'OCR restent vérifiées. La configuration JSX utilise Oxc avec le moteur automatique React.

La CI95 de PR57 est terminée avec succès : tests PostgreSQL natifs avec redémarrage réel, navigateur, migrations aller-retour, audit/SBOM, CodeQL et recherche de secrets. La recette Clients complémentaire a ensuite exécuté 14 cas natifs et 1128 tests au total dans CI97, sans échec. Le fournisseur OIDC externe n'a pas été exercé localement. Aucun environnement de production n'a été activé.
