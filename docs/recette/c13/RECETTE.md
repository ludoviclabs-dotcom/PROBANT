# Recette C13 — Emprunts

Date : 15 octobre 2026. Base `main` `172ddd7`. Données exclusivement synthétiques : packs `docs/recette/c13/pieces/{complete,simple}` (générés par `npx tsx scripts/c13-loan-packs.ts` depuis `lib/workpapers/loan-fixture.ts`). Taux, conventions, index et seuils sont des paramètres des contrats d'exemple, jamais des règles générales.

## Attendus fixés avant exécution

Calculés indépendamment du moteur TypeScript par `python -I docs/recette/c13/attendus.py` (fractions exactes, arrondi au centime une fois par intervalle, demi-centime éloigné de zéro). Exercice 01/01/2026 → 31/12/2026, revue au 15/02/2027.

| Contrat (convention) | Calcul | Attendu |
|---|---|---|
| C13-SIMPLE (30/360) — **recette du prompt** | 100 000 − 10 000 | **90 000,00** |
| | jours 30/360 du 01/01 au 01/02 (fin exclue) | 30 |
| | 100 000 × 3 % × 30 / 360 | **250,00** |
| | 90 000 × 3 % × 30 / 360 (mois suivants, intérêts courus du 01/12 au 01/01) | 225,00 |
| contre-épreuves | même mois en ACT/360 ; 01/01→31/01 en 30E/360 ; 01/01→31/01 en 30/360 | 258,33 ; 241,67 ; 250,00 |
| C13-VARIABLE (ACT/360, Euribor 3 mois synthétique + 1,20 %) | intérêts d'ouverture T4 2025 (index 2,050) | 1 661,11 |
| | T1 (2,000) / T2 (2,100) / T3 (2,150) | 1 600,00 / 1 626,63 / 1 626,61 |
| | T4 : index du 01/10/2026 absent | **bloqué** (jamais un zéro, aucun taux par défaut) |
| | pont 200 000 − 3 × 5 000 | 185 000,00 |
| C13-FRAIS (ACT/365F, 2,40 %, frais 120 par semestre) | intérêts d'ouverture S2 2025 | 1 451,84 |
| | S1 2026 (frais exclus) | 1 428,16 |
| | GL qui fusionne intérêts et frais | 1 548,16 → écart **+120,00** |
| | intérêts courus S2 2026 | 1 209,86 |
| C13-ATLAS (ACT/360 ; 2,00 % puis avenant 2,50 % au 01/07/2026) — recette Mission 14 | intérêts d'ouverture T4 2025 / T1 / T2 / T3 | 2 555,56 / 2 450,00 / 2 426,67 / 3 002,78 |
| | intérêts courus T4 2026 | 2 938,89 |
| | 500 000 − 4 × 10 000 ; GL 470 000 | attendu 460 000,00 ; **résidu +10 000,00** |
| C13-REMBOURSE (30E/360, 3 %) | intérêts d'ouverture 2025 ; 01/01→01/09 | 1 500,00 ; 1 000,00 |
| Cadrage | balance 168100 − GL des contrats du pack | **15 000,00** |
| | GL des intérêts courus 164800 | 6 013,75 (concordant) |

Cas qualitatifs : avance conditionnée (art. 316-1) → autres fonds propres, exclue des emprunts ; référence GL sans contrat → non concluant ; covenant lu avec définition et date → aucun ratio, aucune conformité ; garantie non lue → point à documenter ; échéance rattachée à la version remplacée après avenant → « échéancier modifié » ; source d'échéancier remplacée → feuille périmée, révision.

## Protocole

1. Tests du moteur (`lib/workpapers/__tests__/loans.test.ts`), de la passerelle (`loan-gate.test.ts`) et de l'écran (`components/probant/__tests__/loans.test.tsx`).
2. Recette PostgreSQL 17 jetable locale (`lib/workpapers/__tests__/loans-durable.integration.test.ts`, base `probant_test` sur 127.0.0.1:55432) : imports natifs approuvés, gel refusé s'il manque une source courante, calcul, autorité serveur, idempotence, concurrence, citations, relecture distincte (auto-relecture OIDC refusée), verrouillage, export et CSRF, reconnexion, échéancier remplacé → périmée → révision, relecture personnelle nommée du profil local, garde de retour arrière de la migration 0020.
3. Toutes les autres recettes PostgreSQL du dépôt, suite unitaire complète, `tsc --noEmit`, ESLint, `db:check`, `next build`.
4. E2E sur build de production (`e2e/c13-emprunts.spec.ts`) : exemple synthétique à 1440, 1024 et 390 px (débordement, axe WCAG 2.1 AA serious/critical, filtre par mois, panneau et retour clavier par Échap, mouvement réduit, export) ; parcours persistant sur un profil personnel local de recette (`%LOCALAPPDATA%\PROBANT\recette-c13\personnel`, ports 54369 / 3240) : import par l'écran, gel et calcul, conclusion citée, relecture personnelle nommée, verrouillage, export ; pack complet aux trois largeurs ; échéancier remplacé → périmée.

## Résultats (15/10/2026)

Tous les attendus ci-dessus sont retrouvés par le moteur (`loans.test.ts` 30 / 30, valeurs comparées à l'identique). Recette PostgreSQL Emprunts 6 / 6 ; toutes les recettes PostgreSQL du dépôt 59 / 59 ; suite unitaire 1 874 / 1 874 ; e2e C13 7 / 7 (exemple 5, profil local 2) ; suite e2e du dépôt 292 réussis, 7 ignorés faute de profil ou de dossier FEC (non vérifiés dans ce passage ; C07 et C13 local rejoués à part : 4 / 4 et 2 / 2).

Écart consigné pendant la recette : l'attendu T3 du contrat variable, d'abord estimé de tête à 1 626,56, vaut 1 626,61 au calculateur indépendant ; seul le calculateur fait foi. Le contrat remboursé a été redéfini avant exécution (intérêts annuels au 1er janvier : 1 500,00 d'ouverture au lieu d'un semestre).

Détail, défauts corrigés et captures : `docs/probant-lots/HANDOFF.md` (section C13), `docs/probant-lots/c13-captures`.
