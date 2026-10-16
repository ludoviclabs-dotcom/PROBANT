## C15 — Recette finale et contrôle de la finition

Base `main` `e25a4ad` (après la PR #97). Recette du produit local intégré sur un profil personnel réel (PostgreSQL 17 + `next start` lancés par le lanceur), attendus posés à la main et commités avant toute exécution. Rapport unique : `docs/recette/c15/RAPPORT.md`.

### Constat principal

**C10 (IS millésimes et arrondis) n'est pas sur `main`** et son chantier non commité n'existe plus. Le moteur IS livré (1.0.0) n'arrondit pas la base à l'euro et calcule sans avertissement un exercice de 18 mois avec le plafond de 42 500 € non proratisé. Les deux cas restent en échec déclaré dans la recette (`it.fails`, attendu inchangé) ; C15 ne simule pas ce lot.

### Défauts corrigés

- Note de synthèse : plus de « Écritures analysées : 0/0 (ratio 0) » pour une population non dénombrée (cas du rapport § 6.1, présent sur le dossier de démonstration).
- Profil personnel : écrans Clients / Achats et exports HTML / PDF de mission (Clients, Trésorerie, Fiscal, Immobilisations, Capitaux propres) nomment le profil réel au lieu de « recette jetable ».
- Dossier de clôture : l'onglet « Synthèse des travaux » survit au rechargement ; « Reste à faire » ne dit plus « Rien de détecté » à côté d'exceptions conservées.
- Feuille Clients ouverte depuis `/local` : dates visibles et consigne explicite ; « 1 ligne ».
- Recette C07 rejouable sur un profil neuf (24 migrations, 14 chaînes) ; documentation du profil et bilan C14 à jour.

Aucun calcul déplacé dans React, aucun moteur parallèle, aucune tolérance modifiée, aucun test retiré.

### Recette

| Contrôle | Résultat |
|---|---|
| Matrice du rapport du 12/10/2026 (`lib/recette/__tests__/c15-matrice.test.ts`) | 23 réussis, 2 échecs déclarés (C10) |
| Parcours réel sur le profil local (`e2e/c15-parcours-local.spec.ts`) : dossier → imports → gel → calcul → preuve → écart → relecture personnelle → verrouillage → synthèse → export → arrêt / reprise → invalidation → écrans 390 / 1024 / 1440 | 4 / 4 ; 16 exports identiques octet pour octet après redémarrage de Next et PostgreSQL ; manifestes conformes aux octets servis |
| Suite e2e complète, build de production | 302 réussis, 15 ignorés (profil local, FEC persistant), 0 échec |
| Spécifications du profil local C07 / C13 | 4 / 4 et 2 / 2 |
| Recette C07 rejouée (reprise, FEC, sauvegarde, restauration) | profil neuf 42 / 42 |
| Suite unitaire et recettes PostgreSQL jetables | voir le rapport § 7 |
| `tsc --noEmit`, ESLint des fichiers modifiés, `next build` | sans erreur |

Rien n'est déployé. Données exclusivement synthétiques.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
