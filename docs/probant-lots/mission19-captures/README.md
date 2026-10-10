# Mission 19 — Captures réelles (Chromium, build de production)

Captures produites le 10/10/2026 par `e2e/closing.spec.ts`, sous Playwright, sur le build de production servi par `next start`.

**Ce qu'elles montrent réellement.**
- Les appels `/api/workpapers/closing` sont routés vers le vrai `ClosingRuntime` et ses vrais handlers, sur le stockage mémoire de test, avec des données synthétiques.
- La feuille Provisions observée est réellement verrouillée par sa propre chaîne (Mission 16).
- Ce ne sont ni des images générées ni une recette PostgreSQL.
- Format : conversion PNG vers JPEG, qualité 72.

| Fichier | Contenu |
|---|---|
| `cl-programme-1440.jpg` | Bandeau « Des feuilles de cycle sont verrouillées, mais le dossier n'est pas complet » : 1 / 1 feuille verrouillée, 19 travaux restants, 4 pièces manquantes, aucune opinion. Registre des 13 indicateurs avec dénominateur, un segment par élément. Carte de couverture risques × assertions (NEP 500 §09) : ✕ sur R-03 · Évaluation et imputation, — sur R-07. Programme par risque, avec état, responsable, travaux et pièces, dernière action. Fiche P-03 ouverte : fil de traçabilité. |
| `cl-programme-1024.jpg`, `cl-programme-390.jpg` | Mêmes vues. À 1024 et 390 px, la fiche passe sous le programme. Les tableaux défilent dans leur cadre, sans débordement de page. |
| `cl-cycle-locked-1440.jpg` | Fiche P-01 : feuille de cycle observée (verrouillée, r1 v20, préparée par `preparer-pv`, revue par `reviewer-pv`, 7 éléments, 6 sources figées, empreinte de contenu). « Le dossier observe cette feuille ; il ne la recalcule pas, ne la revoit pas et ne la verrouille pas. » |
| `cl-reduced-motion-1440.jpg` | Réduction des animations : aucune animation du panneau ni du fil. Fiche P-05 revue par une autre personne. |
| `cl-pieces-1440.jpg` | File des pièces manquantes (4, de la plus ancienne à la plus récente) : deux pièces demandées, une population absente, une déclaration seule. Registre des pièces versionnées, avec empreinte SHA-256, et formulaire de dépôt. |
| `cl-anomalies-1440.jpg` | Totaux : corrigées 1 240,00 € ; non corrigées 3 000,00 € connus + 1 montant inconnu, jamais compté pour zéro. Tableau des anomalies. Contradiction C-01 en vis-à-vis (lettre d'affirmation / réponse de l'avocat), non résolue. Limite d'étendue à apprécier. |
| `cl-cloture-1440.jpg`, `cl-cloture-390.jpg` | Lecture par le signataire habilité. Travaux restants par famille, chaque élément précédé de sa procédure. Feuilles de cycle observées et validation refusée : bouton désactivé, « Validation impossible tant que des travaux restent ouverts ». |
| `cl-refus-1440.jpg` | Interaction réelle depuis la fiche P-03. Une pièce est déposée puis citée dans un test de fonctionnement : la troisième étape devient documentée. La conclusion « fonctionnement » est ensuite refusée par le serveur (« Pièce encore attendue pour cette procédure »), et le refus est expliqué dans la fiche. |
| `cl-journal-1440.jpg` | Journal : qui a fait quoi et quand, avec l'empreinte locale chaînée de chaque événement et le filtre par procédure. |
