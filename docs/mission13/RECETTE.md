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

## Cas de référence IS — exercice 2026, montants calculés à la main

| Grandeur | Calcul indépendant | Feuille |
|---|---|---|
| Produits (classe 7) | 500 + 1 000 + 500 − 100 (avoir) + 200 + 300 + 100 000 = 102 400 | — |
| Charges hors IS (classe 6) | 400 + 150 + 50 + 30 000 + 1 000 (pénalité) = 31 600 | — |
| Résultat avant impôt | 102 400 − 31 600 = 70 800 | 70 800,00 |
| IS comptabilisé (695) | 17 950 | 17 950,00 ; dette 444 = 17 950,00 |
| Résultat après impôt | 70 800 − 17 950 = 52 850 | 52 850,00 = WA → cadré |
| Pont après impôt | 52 850 + 17 950 (IS) + 1 000 (pénalité) = 71 800 | XI = 71 800 → résidu 0 |
| Pont avant impôt | 70 800 + 1 000 = 71 800 ; ajout de l'IS refusé | résidu 0 ; `FX_CIT_DOUBLE_TAX_ADJUSTMENT` |
| Impôt | capital partiellement libéré → taux réduit non éligible ; 71 800 × 25 % = 17 950 | IS brut 17 950 = charge = dette |
| Correction proposée | don de 2 000 : (71 800 + 2 000) × 25 % = 73 800 × 25 % = 18 450 | 73 800 / 18 450, écarts signalés |

**Validation par un chemin indépendant.** `fiscal-cit.test.ts` rejoue les 10 cas golden IS de la gate de release TAX-10 :
- **chemin de la gate** : objets canoniques construits en mémoire ;
- **chemin de la feuille** : liasse, 2058-B et 2065 écrites en fichiers puis lues par le processeur ; FEC pour la charge d'IS ; profil ; `evaluateCit`.

Les deux chemins donnent le même statut, la même issue, le même statut d'impôt, le même IS brut, la même base, le même résultat avant déficits et la même ventilation par tranche.

## Matrice de recette IS

| Cas exigé | Preuve |
|---|---|
| Résultat comptable cadré | FEC (classes 6 et 7) = WA ; écart affiché sinon (unitaire, runtime, E2E) |
| Base avant / après impôt | Les deux bases affichées ; pont recalculé selon la base choisie (unitaire, runtime, intégration PostgreSQL) |
| Retraitements documentés | Pièce figée citée (ligne du FEC, pièce justificative) ; source du registre avec URL et couverture ; « source non couvrante » pour une version à vérifier (unitaire, E2E) |
| Double ajustement d'IS refusé | Deuxième ajustement d'IS, ajustement d'IS en déduction ou sur base avant impôt : refus serveur (422) et alerte dans le formulaire (unitaire, runtime, E2E) |
| Profil confirmé | Profil non cité : « brouillon », moteur bloqué si le régime est inconnu ; éligibilité au taux réduit inconnue : impôt estimé, issue non concluante (unitaire, runtime) |
| Millésime couvert | Millésime 2024 conservé comme pièce, non lu ; substitution par 2026 refusée (unitaire) |
| IS 2024 maintenu bloqué | Barème 2024 absent : moteur bloqué, calcul absent, règle « barème non publié » avec sources ; même avec un millésime 2026 et sans liasse (unitaire) |
| Liasse absente | Résultat déclaré inconnu, jamais nul (unitaire) |
| TVA et IS cohabitent | Une CA3 ne périme pas l'IS ; une liasse corrigée le périme ; une liasse déposée comme TVA est refusée (runtime) |
| Revue distincte et verrouillage | Paquet IS approuvé exporté (runtime, intégration PostgreSQL) |

## Exécutions locales (2026-10-09)

- **Suite unitaire complète** : 1 362 réussis, 39 ignorés. Les tests PostgreSQL sont ignorés sans base jetable locale ; ils ne sont **pas exécutés** localement.
- **Contrôles statiques** :
  - typecheck : OK ;
  - lint : 7 avertissements préexistants, 0 erreur ;
  - `db:check` : 16 migrations, invariants valides ;
  - build de production : OK.
- **Chromium** (Playwright, build de production) : 86 réussis, 1 ignoré (parcours persistant). `fiscal.spec.ts` passe 5/5, en TVA et en IS. Captures 1440 / 1024 / 390 px et réduction des animations inspectées ; axe sans violation sérieuse ni critique. Voir `docs/probant-lots/mission13-captures/`.
- **Non exécuté localement** : `fiscal-durable.integration.test.ts` (TVA et IS, PostgreSQL jetable de la CI).
