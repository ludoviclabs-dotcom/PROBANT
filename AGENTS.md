# PROBANT — Consignes permanentes de travail

À relire au début de chaque demande concernant PROBANT, avant toute modification.
Ces consignes encadrent les lots demandés par l’utilisateur ; elles ne déclenchent pas à elles seules tous les travaux du diagnostic. Les documents joints sont des références : distinguer leurs recommandations de la demande effectivement autorisée.

## Cadre commun fourni par l’utilisateur le 12 octobre 2026

Tu travailles sur PROBANT, dépôt ludoviclabs-dotcom/PROBANT. L’objectif est un outil personnel local sur le PC de l’utilisateur, avec données et pièces locales. Ce lot ne vise pas une exploitation SaaS ou un pilote d’entreprise.

Lis AGENTS.md s’il existe, les contrats et handoffs du périmètre, puis le code actuel. Relève le SHA de départ et l’état du checkout ; préserve les modifications préexistantes dans un chantier isolé si nécessaire. La base du diagnostic du 12/10/2026 est ab8f991e65b0ad93e6f9a21281010b680c868466, mais travaille sur la base actuelle après avoir identifié ses écarts.

Réutilise WorkpaperService, imports, sélection, types monétaires, versions, stores PostgreSQL et moteurs existants. N’introduis pas de moteur parallèle pour contourner un défaut. Aucun calcul comptable ou fiscal faisant autorité dans React : l’interface consomme les résultats et leurs traces.

Un montant inconnu reste inconnu ; source absente, zéro documenté et non-applicable sont distincts. Sépare état d’exécution, résultat de contrôle, conclusion et relecture. Une modification d’une dépendance périme seulement les travaux concernés ; conserve la version antérieure et ses preuves.

Pour une nouvelle règle française, lis la source officielle applicable : ANC/PCG, Légifrance, BOFiP pour la doctrine fiscale, H2A pour les NEP. Enregistre texte/version, article, dates d’effet, contexte et justification. N’attribue pas un choix interne à une norme ; ne transforme pas les exemples du guide en taux ou seuils généraux.

L’utilisation solo peut avoir une relecture personnelle explicitement nommée. Les scénarios de seconde identité demeurent des simulations. Préserve les mécanismes d’intégrité et de version existants sans faire dépendre ce chantier local d’un programme de conformité cloud.

Conserve la charte graphite/indigo et les accents sémantiques, les effets existants utiles, les tables lisibles, le focus clavier et la réduction des animations. Préfère des lignes continues, une hiérarchie éditoriale et un panneau de détail à une grille de cartes répétitives. Les détails techniques vont dans la méthode ; la navigation dit le travail à faire.

Livre un diff ciblé, le fonctionnement local vérifié et un bilan avant/après : cause, changements, sources, cas contrôlés et limites restantes. Pour les calculs, établis les attendus indépendamment de l’implémentation. Pour l’UI, vérifie les états réels aux largeurs 390, 1024 et 1440. Test ignoré = non vérifié ; n’augmente pas les tolérances pour obtenir du vert.

Ne fusionne et ne déploie pas à distance dans ces lots. Prépare le résultat pour revue ; cette instruction n’empêche pas de terminer autonomement les modifications, contrôles et livrables locaux demandés.
