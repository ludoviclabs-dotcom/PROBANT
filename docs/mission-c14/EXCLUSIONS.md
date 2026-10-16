# Mission C14 — Bilan des exclusions encore pertinentes (15/10/2026)

Relecture, sur la base `bb919bf` + C14, des exclusions déclarées par le registre unique (`lib/capabilities/registry.ts`), par le dossier de clôture et par les contrats de mission. Chaque exclusion encore pertinente est affichée dans l'onglet « Synthèse des travaux » et dans l'export, pour les cycles présents dans le dossier.

## Exclusions devenues caduques

| Exclusion | Où | Pourquoi caduque | Traitement |
|---|---|---|---|
| « La paie (Mission 18) n'a pas de feuille durable observable » | Écran Clôture, `docs/mission19/CONTRAT.md` | C12 (PR #94) persiste `payroll.review` et `payroll.leave` dans la famille `hr`, lue par le dossier | Mention retirée de l'écran ; note ajoutée au contrat Mission 19 |
| « Synthèse et export Provisions non livrés » | Handoff Mission 16 | Restitution `operation=mission` à version exacte et export livrés (C14) | Route `/provisions/synthese`, registre 1.3.1 |
| Une procédure de cycle rattachée à une seule procédure du programme | `CL_ENGINE_ALREADY_LINKED` | Empêchait de couvrir deux périmètres | Remplacé par le rattachement par racine (`bind_sheet`, `CL_SHEET_ALREADY_BOUND`) |
| « La plus avancée est retenue, les autres restent listées » | Limite affichée par la fiche | Règle fautive (voir contrat § 1) | Remplacée par « seule la feuille rattachée compte » |

## Exclusions de capacité encore pertinentes

| Cycle | Exclusion | Raison |
|---|---|---|
| Clients | Aucune perte ou dépréciation déduite de l'âge seul | Aucune règle d'âge dans les moteurs |
| Achats | La sélection ne prouve pas l'exhaustivité des dettes absentes | Inchangé |
| Trésorerie | Caisse et VMP hors feuille bancaire | Inchangé |
| Immobilisations | Existence physique et valeur non certifiées | Inchangé |
| Stocks | Comptage transcrit (présence physique et exhaustivité non certifiées) ; stocks de tiers à part ; coûts déclarés non reconstitués ; aucune dépréciation automatique | Inchangé (C08) |
| Provisions | Aucune issue juridique déduite ; pièces confidentielles selon droits serveur | La restitution et l'export appliquent le masquage serveur ; la capacité confidentielle reste accordée à personne par défaut |
| Capitaux propres | Deux feuilles lues sans double compte ni migration ; aucune conclusion juridique ; autres fonds propres par termes contractuels déclarés | Inchangé (C09) |
| Participations | DCF complet et classement automatique absents | Inchangé |
| TVA et IS | Aucune liquidation ni conformité déclarée ; TVA mensuelle distincte de l'exercice IS | Une feuille TVA par période déclarative est une lignée distincte : à rattacher à sa propre procédure ou à écarter avec motif |
| Paie et personnel | Paie complète et DSN native absentes ; profil personnel local et habilitation RH dédiée requis | Inchangé (C12) ; une feuille Paie relue personnellement ne vaut pas revue professionnelle |
| Résultat exceptionnel | Qualification humaine par événement | Inchangé |
| Transversal et clôture | Aucune opinion générée ; cut-off : fait générateur documenté requis | Inchangé ; le marquage personnel n'est pas une validation |
| Systèmes d'information | Pas de moteur ITGC ; travaux manuels dans le programme | Inchangé |
| Dettes financières | ~~Pas de feuille persistante dédiée~~ — caduque depuis la fusion de C13 (PR #95) : feuille `loans.review` lue par le dossier ; exclusions du registre : emprunts simples en euros seulement | Mise à jour C15 (16/10/2026) : la ligne d'origine décrivait `main` avant la PR #95 |

## Exclusions motivées dans le dossier (journal)

Elles ne sont jamais déduites : chacune porte un auteur, une date et un motif.

| Nature | Effet sur les dénominateurs |
|---|---|
| Procédure non applicable motivée | Exclue des procédures applicables, mention « N procédure(s) non applicable(s) motivée(s) exclue(s) » |
| Couple couvert seulement par des procédures non applicables | Exclu des couples comptés, mention |
| Demande de pièce annulée motivée | Exclue des pièces attendues, mention |
| Feuille écartée du programme avec motif (C14) | Exclue des feuilles outillées, mention « N feuille(s) écartée(s) du programme avec motif » ; reste listée avec sa racine et sa version |

## Limites que C14 ne lève pas

- Les constats C05 de la carte des événements transversaux (C11) restent dans `/cutoff` : non versés dans le dossier.
- Les pièces binaires ne sont pas dans le paquet d'export du dossier.
- Les feuilles des familles dont la règle de fraîcheur ne regarde que les imports figés (Clients, Achats, Equity, Participations, Exceptionnel, Trésorerie, Paie) ne signalent pas une source **ajoutée** après le gel ; elles signalent une source **remplacée**.
