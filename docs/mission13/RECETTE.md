# Mission 13 — Recette

Données **100 % synthétiques** (`lib/workpapers/__tests__/fiscal-fixtures.ts`) : exercice 2026, CA3 trimestrielles, régime réel normal. Une suite verte sur ces fixtures **n'autorise aucune mission réelle**.

## Cas de référence TVA — T2 2026, montants calculés à la main

| Grandeur | Calcul indépendant | Feuille |
|---|---|---|
| TVA collectée | 200 + 50 − 20 (avoir AV-2003) = 230,00 | 230,00 · case 16 = 230,00 · écart 0 |
| TVA déductible | 80 + 30 = 110,00 | 110,00 · case 23 = 210,00 (dont 100 de crédit reporté en case 22) · écart −100 |
| TVA nette | 230 − 110 = 120,00 | 120,00 · case 28 = 20,00 · écart +100 → exception `VAT.NET` |
| Pont | 120 − 100 (crédit du T1, pièce citée : case 22) = 20 | résidu 0 |
| Paiements | PAY-T2 = 20,00 | écart 0 |
| Crédit reporté | case 27 du T1 = 100 ; case 22 du T2 = 100 | écart 0 |
| Taux constatés | 200 ÷ 1 000 et −20 ÷ −100 → 20 % ; 50 ÷ 500 → 10 % ; 110 ÷ 550 → 20 % | origine affichée, jamais légale |

**Validation par un chemin indépendant.** `fiscal-vat-golden.test.ts` rejoue 9 cas golden de la gate de release TAX-10 :
- **chemin de la gate** : objets canoniques construits en mémoire ;
- **chemin de la feuille** : fichiers FEC, CA3 et inventaire, puis parseurs, approbation, gel et `evaluateVat`.

Les deux chemins donnent les mêmes montants (collectée, déductible, nette, déclarée, théorique), les mêmes résultats par contrôle, la même issue et le même niveau de preuve. Les empreintes des 21 cas golden restent inchangées.

## Matrice de recette TVA

| Cas exigé | Preuve |
|---|---|
| FEC seul | Niveau « FEC seul — signal », déclaration « absente » jamais lue comme zéro, pont inconnu, issue non concluante (`fiscal-vat.test.ts`, `fiscal-runtime.test.ts`) |
| Déclaration remplacée | Feuille T2 périmée, ancienne version conservée avec son SHA-256, réapprobation de l'ancienne refusée, révision sur les sources courantes. Une déclaration T3 ne périme pas le T2 ; un T1 corrigé le périme (`fiscal-runtime.test.ts`, E2E, intégration PostgreSQL) |
| Source expirée | T3 2026 partiellement couvert : rupture au 01/09/2026 (CGI art. 269 et 289, versions jusqu'au 31/08/2026). Contrôles bloqués ; source requise avec URL Légifrance et date de vérification (unitaire, runtime, E2E) |
| Période non couverte | Septembre 2026 mensuel non couvert, aucune version voisine substituée (unitaire). Millésime 2027 non publié : pièce conservée, moteur bloqué, millésimes publiés cités, millésime différent refusé (unitaire) |
| Profil inconnu | Moteur bloqué, montants « Inconnu », déclaration « non lue » (jamais « absente »), règles « profil à confirmer » (unitaire, runtime, E2E) |
| Avoir | Écriture d'avoir conservée en négatif (base −100, TVA −20, taux constaté 20 %), pièce trouvée (unitaire, E2E) |
| Crédit reporté | Continuité calculée ; un T1 à 90 donne un écart de 10 en exception (unitaire) |
| Ligne de déclaration → écritures → pièce | Case 16 → 3 écritures → pièce AV-2003, ligne 6 de l'inventaire ; Échap rend le focus (E2E) |
| Décision humaine citée | Note `VAT.NET` traitée en citant la case 27 de la CA3 T1 (pièce, version, ligne, zone) ; citation absente ou hors sources figées refusée (runtime, E2E) |
| Revue distincte | Auto-revue refusée (403) ; approbation et verrouillage par une autre identité (runtime, E2E, intégration PostgreSQL) |
| Autres taxes | Listées comme capacités séparées non couvertes (feuille, Synthèse, export) |

## Exécutions locales (2026-10-09)

- Suite unitaire complète : 1 339 réussis, 38 ignorés. Les tests PostgreSQL sont ignorés sans base jetable locale ; ils ne sont **pas exécutés** localement.
- Typecheck : OK. Lint : 7 avertissements préexistants, 0 erreur. `db:check` : 16 migrations, invariants valides. Build de production : OK.
- Chromium (Playwright, build de production) : `fiscal.spec.ts` 4/4, avec cockpit, accessibilité et gate fiscale 22/22. Captures 1440 / 1024 / 390 px et réduction des animations inspectées ; axe sans violation sérieuse ni critique.
- **Non exécuté localement** : `fiscal-durable.integration.test.ts` (PostgreSQL jetable de la CI).
