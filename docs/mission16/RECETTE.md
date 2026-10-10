# Mission 16 — Provisions et engagements : recette

Exercice 2026, du 01/01/2026 au 31/12/2026 ; date de revue 31/03/2027.

Les données sont exclusivement synthétiques : `lib/workpapers/__tests__/provision-fixtures.ts`. Montants en euros.

Tous les montants ci-dessous ont été calculés à la main avant d'écrire le moteur.

## Cas de référence

| Événement | Cas de recette | État | Calcul | Résultat attendu |
|---|---|---|---|---|
| EV-01 Litige commercial n°1 (confidentiel) | Estimation documentée 80, provision 50 | Ouvert à l'ouverture | 30 + 20 − 0 − 0 = **50** = clôture déclarée 50. Estimation retenue 80 (scénario « Central », LET-AVOCAT-01). 80 − 50 = **+30** | **Différence à examiner +30,00 €**, montant connu, note « observation ». Ni anomalie validée ni correction. Scénarios bas 40 / central 80 / haut 120 affichés sans aucune probabilité multipliée. Annexe 50 = 50. |
| EV-02 Garanties clients | Reprise sans justificatif | Ouvert | 25 − 5 (utilisation, AV-GAR-05) − 10 (reprise M03, **aucune pièce**) = **10** = déclarée. Estimation 10 − 10 = 0 | **Justificatif manquant** : incertitude au montant connu de 10,00 €, « Reprise sans justificatif », avec le rappel de l'art. 323-12. Annexe 10 = 10. |
| EV-03 Caution bancaire filiale | Engagement hors grand livre | Nouveau | Aucune écriture, aucun pont ; engagement 200 au registre | **Sans écriture**, dans la population et dans la liste « Engagements et passifs sans écriture ». Annexe « engagement donné » 200 = 200. |
| EV-04 Litige fournisseur Beta | Risque clôturé | Clos le 30/06/2026 | 40 − 35 (utilisé) − 5 (repris) = **0** = déclarée 0 | **Clos, provision soldée**. Aucune estimation requise ; dénouement visible dans la chronologie (protocole PROTO-TRANS-04). |
| EV-05 Restructuration atelier Est | Estimation absente | Nouveau | 0 + 15 = **15** = déclarée | **Non concluant** : estimation absente, montant inconnu, jamais réputée égale à 15. |
| EV-06 Contentieux social n°6 (confidentiel) | Passif éventuel | Nouveau | Sans écriture ; estimation retenue 12 | **Écart avec l'annexe** : absent de l'annexe, à examiner (art. 322-5 et 832-13, sauf probabilité faible — jugement humain). |
| EV-07 Sinistre entrepôt janvier 2027 | Hors population | Né le 20/01/2027 | — | **Exclu avec motif** : né après la clôture. |

## Totaux et cadrage

| Compte | Ouverture registre = GL | Dotations | Utilisations | Reprises | Clôture calculée = GL | Pont GL |
|---|---|---|---|---|---|---|
| 1511 (EV-01, EV-04) | 30 + 40 = 70 | 20 | 35 | 5 | 50 + 0 = 50 | 70 + 20 − 35 − 5 = 50 ✓ |
| 1512 (EV-02) | 25 | 0 | 5 | 10 | 10 | 25 − 5 − 10 = 10 ✓ |
| 1522 (EV-05) | 0 | 15 | 0 | 0 | 15 | 15 ✓ |
| **Total** | **95** | **35** | **40** | **15** | **75** | 95 + 35 − 40 − 15 = 75 ✓ |

**Tableau par catégorie :**
- Risques (151) : ouverture 95, dotations 20, utilisées 40, non utilisées 15, clôture 60.
- Charges (152) : ouverture 0, dotations 15, clôture 15.

**Décompte de la population :**
- 7 événements ;
- 6 de l'exercice ;
- 1 exclu ;
- 2 sans écriture (EV-03, EV-06).

**Points en notes :** 4.
- 2 différences à examiner : EV-01 (+30) et EV-06 (annexe).
- 2 incertitudes : EV-02 (reprise) et EV-05 (estimation).
- Issue : **exceptions détectées**.

## Confidentialité

Le préparateur et l'identité « counsel » ont la capacité confidentielle ; le réviseur ne l'a pas.

Le réviseur reçoit une réponse JSON qui ne contient :
- ni « Client Alpha » ;
- ni l'obligation décrite ;
- ni les scénarios, ni l'estimation retenue 80, ni la différence +30 ;
- ni les libellés des pièces LET-AVOCAT-01, LET-PRUD-06, EST-PRUD-06 et LET-AVOCATS.

Il voit en revanche :
- la provision comptabilisée 50 ;
- le grand livre ;
- l'annexe.

La note « Estimation documentée ≠ provision » lui est masquée (montant inconnu).

Le téléchargement des originaux du registre et des estimations lui est refusé (403), alors que celui du grand livre et de l'annexe lui est servi.

L'identité habilitée voit la différence connue +30,00 €. Le `submittedHash` est identique pour les deux lecteurs.

## Matrice des tests

| Fichier | Couverture |
|---|---|
| `lib/workpapers/__tests__/provision-review.test.ts` (20) | Montants de recette ; sans journal, clôture inconnue ; pont et grand livre non cadrés ; compte absent du grand livre ; risque clos avec solde ; traitement incohérent ; décision sans pièce ; annexe (montant, rubrique, préjudice, ligne sans événement, annexe absente) ; avocats non obtenus ; estimations absentes ; refus de qualification ; localisation sans valeur confidentielle ; masquage du résultat. |
| `lib/workpapers/__tests__/provision-runtime.test.ts` (10) | Chaîne complète jusqu'au verrouillage ; citations ; sources requises ; estimation remplacée → feuille périmée → révision ; reconfiguration « avocats » ; aperçu refusé ; masquage par identité, y compris l'entrée du calcul ; téléchargements protégés ; notes d'événement confidentiel masquées ; autorisations, idempotence, conflit ; garde de recette et codes HTTP. |
| `lib/workpapers/__tests__/provision-durable.integration.test.ts` | PostgreSQL jetable, en CI seulement : persistance des six sources, calcul +30, revue masquée, verrouillage, append-only, inter-organisation, CSRF, original confidentiel refusé, reprise après reconnexion, source remplacée. |
| `e2e/provisions.spec.ts` (4) | Cases, fiche, pont animé et mise en évidence, filtres dans l'URL, tableau, liste sans écriture, 1440 / 1024 / 390 px, réduction des animations ; lecture masquée ; cadrage et exceptions ; préparation, revue et verrouillage dans l'interface ; axe sans violation grave ou critique. |
