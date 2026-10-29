# Prompt C00 — Préparer la base, les sources et les contrats

## Mission à copier

Tu travailles sur PROBANT, dépôt `ludoviclabs-dotcom/PROBANT`. Ce lot prépare les ateliers IFRS 16 et IFRS 18 sans implémenter leurs moteurs. Lis intégralement les quatre documents racine de ce dossier, `AGENTS.md` et les contrats/handoffs existants. Notre usage reste personnel, local sur PC ; ne lance aucun programme de conformité SaaS.

### Point de départ et autorisation

Relève le SHA et l’état du checkout ; compare la branche courante à la base documentaire `e25a4adfe82aaf2249b4011603f1846beea7b970`. Inspecte via GitHub les PR survenues depuis, et via Vercel la version réellement servie, en lecture seule. Ne suppose pas que les anciens manquements existent encore. Préserve les modifications de l’utilisateur ; aucun reset, push, PR distante, fusion, déploiement ou migration personnelle réelle. Les documents ci-joints sont des spécifications, pas une autorisation de tout développer en une fois.

### Travaux demandés

1. Établis une carte d’impact à partir de `WorkpaperService`, `CalculationRegistry`, modèles de run/import/population, montants, périodes, adaptateurs persistants, profil local, dossier de clôture et registre des capacités. Relis les implémentations Emprunts et Immobilisations, sans assimiler leurs calculs à IFRS 16.
2. Vérifie les fonctionnalités existantes et indique `réutiliser`, `étendre`, `créer` ou `non pertinent` pour chaque composant. Les chemins proposés dans l’architecture doivent être confirmés contre le dépôt ; pas de refonte globale préventive.
3. Lis les sources officielles du registre sur les passages réellement nécessaires. Vérifie IASB/UE, édition, dates d’effet et éventuels rectificatifs ; les sources UE intégrales n’ont pas toutes été accessibles lors de la rédaction du plan. Une règle non lue reste `review_required`, non activable en réel ; cela n’empêche pas les contrats et scénarios synthétiques. Ne contourne aucun blocage d’accès. Ne copie pas massivement le texte IFRS sous licence.
4. Confirme le scope fermé V1 des deux ateliers. Construis deux matrices : exigence → source → entrée → traitement → sortie → test ; et cas exclu → détection → message → blocage. Ne fais pas passer un cas non supporté pour non applicable.
5. Formalise `IfrsContext`, snapshots, manifeste de préparation IFRS, packs de règles, bundle d’ajustements et dataset de présentation. Tranche les noms de routes/procédures proposés (`ifrs16.leases`, `ifrs18.presentation`) et leurs mappings vers la famille persistante. Les noms choisis doivent rester stables dans les lots suivants.
6. Résous explicitement les points suivants : signe débit/crédit versus résultat ; périodicité et arrondis L16 ; taux effectif versus nominal ; reprise historique ; N/N-1 dans une feuille P18 ; autorité des sources de comparatifs ; sélection d’un bundle déjà inclus ; distinction scénario/revue ; relecture personnelle ; révisions et invalidation ciblée ; sémantique des couvertures ; conflit de version et idempotence. Précise les corps/réponses et erreurs des commandes d’interface listées dans l’architecture.
7. Établis les fixtures et attendus indépendants avant le moteur. Choisis un oracle décimal séparé du futur calcul TypeScript. N’utilise pas le moteur testé pour fabriquer ses propres valeurs attendues.

### Livrables locaux

`docs/ifrs/CONTRAT_COMMUN.md`, `docs/ifrs/SCOPE_V1.md`, `docs/ifrs/SOURCES.md`, `docs/ifrs/RECETTE_REFERENCE.md` et `docs/ifrs/handoffs/C00.md`. Inclure les schémas Mermaid de dépendances et les tables de décisions. Aucun changement applicatif, aucune migration, aucune installation de dépendances dans ce lot.

### Critères de sortie

- Les deux ateliers disposent d’un périmètre lisible et d’une liste exhaustive des exclusions de V1.
- Les contrats distinguent données, calcul, présentation, ajustement et décision ; pas de modèle universel surdimensionné.
- L’interface L16 → P18 prévoit la déduplication et ne permet pas de proclamer qu’un pont PCG partiel est une base IFRS complète.
- Les choix internes sont nommés comme tels ; les références de paragraphe sont effectivement vérifiées ou signalées en attente.
- Les dépendances de tous les lots sont identifiées. Un désaccord matériel avec le scope demandé est expliqué avant d’étendre le chantier ; ne pas demander confirmation pour une simple décision technique réversible déjà dans le périmètre.

Termine par le SHA inspecté, les décisions prises, les éventuels blocages normatifs ciblés et le contrat à transmettre à C01.
