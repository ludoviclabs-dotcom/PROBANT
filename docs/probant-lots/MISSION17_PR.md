# Mission 17 — descriptif de PR prêt à examiner

Titre : Résultat exceptionnel : revue versionnée par événement et pont de présentation

Le repérage des comptes 67/77 ne permettait pas de qualifier le résultat exceptionnel selon l’exercice ni de couvrir les événements comptabilisés ailleurs. La nouvelle route /resultat-exceptionnel, reliée à la Synthèse, examine le GL complet par événement, distingue pièces client et référence officielle et produit des propositions étayées. Les décisions motivées et citées alimentent un pont de présentation sans modifier le GL ; le comparatif garde la qualification historique et rend le changement de référentiel visible.

Le dossier vérifie la version du PCG et l’anticipation, bloque les qualifications non étayées, traite les catégories fiscales particulières, erreurs, capitaux propres, compensations d’exploitation et suites d’événements. Les contreparties du bilan sont visibles et conservées hors résultat. La revue distincte utilise les accès, transactions, imports, versions et contrôles d’intégrité existants. L’interface combine table d’événements, panneau animé, pont et chronologie ; clavier et réduction des mouvements pris en compte.

Validation après rebase : 34 tests dédiés, typecheck, lint sans erreur (7 avertissements préexistants), db:check valide 17 migrations et 17 tables. Compilation et recette Chrome précédentes consignées dans HANDOFF_MISSION17.md.

Limites : packs transcrits manuellement, PCG général couvert aux versions déclarées ; qualifications sectorielles, historiques hors 2024 et analyse spécifique des impôts restent bloquées. Démonstration interactive synthétique volatile, strictement locale. La chaîne durable est réservée à un environnement de recette jetable et fermée en production ; aucune migration ni activation réelle réalisée. Les tests PostgreSQL optionnels du dépôt sont ignorés faute de configuration de base jetable dans cette session. L’export est un diagnostic, sans signature ni opinion sur les comptes.

La PR cible `main`. Aucun merge ni deploiement realises.
