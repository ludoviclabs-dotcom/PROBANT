# Mission 15 — captures réelles (Chromium, build de production)

Captures produites le 09/10/2026 par `e2e/stocks.spec.ts` (Playwright, build de production `next start`) :
- Les appels `/api/workpapers/stocks` sont routés vers le vrai runtime et les vrais handlers, sur le stockage mémoire de test, avec des données synthétiques.
- Ce ne sont ni des images générées ni une recette PostgreSQL.
- Conversion PNG → JPEG, qualité 72.

| Fichier | Contenu |
|---|---|
| `st-grid-1440.jpg`, `st-grid-1024.jpg`, `st-grid-390.jpg` | Grille de cases par site : REF-A −2 sélectionnée ; pont inventaire → clôture dans le panneau (98 contre 100) ; filtres par nature, site, lot et recherche ; total net et écarts bruts (REF-E compensé) |
| `st-table-1440.jpg` | Même résultat en tableau : compté, entrées, sorties, clôture reconstituée, théorique, écart, statut |
| `st-reduced-motion-1440.jpg` | Réduction des animations : aucune animation d'entrée des cases ni du panneau ; barres du pont visibles |
| `st-rollforward-1440.jpg` | REF-D, Entrepôt Sud : comptage du 20/12, + 10 − 5 = 45 ; BR-1001 ouvert jusqu'à sa pièce ; mouvement du jour du comptage hors période |
| `st-ownership-site-1440.jpg` | Dépôt Ouest non visité (NEP 501 § 06) ; écart de propriété REF-F ; stock de tiers REF-T présenté à part |
| `st-exceptions-1440.jpg` | Exceptions et incertitudes en notes, dont « Écarts compensés — REF-E » |
| `st-locked-1440.jpg` | Convention retenue et citée ; version approuvée et verrouillée par une autre identité |
| `st-no-movements-1440.jpg` | Inventaire décalé sans journal de mouvements : non concluant, quantités inconnues dans le pont |
| `st-valuation-1440.jpg`, `st-valuation-390.jpg` | Sous-lot 2. Cases : « Écart potentiel −24,00 € » (REF-A) et « Écart de prix +10,00 € » (REF-C). Panneau : coût documenté de 12,00 € (CMP, FA-501). Cadrage par compte : 371 et 331 cadrés, 321 +10,00 €, 1 800,00 € hors propriété exclus, 397 renvoyé à la revue de valeur. Total net −24,00 € pour 64,00 € bruts. |
| `st-valuation-table-1440.jpg` | Tableau quantité / coût / valeur : coût documenté, valeur reconstituée, valeur théorique, écart valorisé, écart de prix |
| `st-replaced-1440.jpg` | Feuille de comptage remplacée : travail périmé, version remplacée conservée avec son empreinte |
