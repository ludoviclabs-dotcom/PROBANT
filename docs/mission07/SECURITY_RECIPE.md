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

Les tests PostgreSQL, navigateur et les contrôles GitHub seront exécutés dans la CI jetable avant la livraison finale. Le fournisseur OIDC externe n'a pas été exercé localement. Aucun environnement de production n'a été activé.

## Reprise après les alertes CodeQL de la PR 57

Les résultats ci-dessus décrivent l’installation et les commandes locales initiales. Le job GitHub CodeQL avait terminé son analyse avec succès, mais le contrôle séparé Code scanning avait trouvé deux alertes élevées (16 et 17 sur refs/pull/57/merge). Une analyse exécutée n’est pas une absence d’alertes.

Après correction : 14 contrôles ciblés réussis localement (7 compatibilité, 7 provenance SBOM), incluant les courses de fichiers et séparateurs longs. Types/lint et audit sont vérifiés à nouveau. Le résultat serveur définitif doit être lu sur le contrôle Code scanning et les instances d’alertes de la révision corrigée, pour les PR 57 et 58 ; les huit jobs CI seuls ne suffisent pas. Aucun changement de production.
