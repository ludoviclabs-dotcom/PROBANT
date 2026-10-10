# Mission 16 — captures réelles (Chromium, build de production)

Captures produites le 10/10/2026 par `e2e/provisions.spec.ts` (Playwright, build de production `next start`) :
- les appels `/api/workpapers/provisions` sont routés vers le vrai runtime et les vrais handlers, sur le stockage mémoire de test, avec des données synthétiques ;
- ce ne sont ni des images générées ni une recette PostgreSQL ;
- conversion PNG → JPEG, qualité 72.

| Fichier | Contenu |
|---|---|
| `pv-register-1440.jpg` | Pont animé de l'exercice : 95 + 35 − 40 − 15 = 75, égal au grand livre. Registre en trois couloirs (ouverts, nouveaux, clos) plus les événements hors population. Cases avec nature d'écart, icône et cadenas. EV-01 sélectionné, fiche ouverte : obligation, contrepartie, décision et pont de l'événement. Liste « Engagements et passifs sans écriture ». |
| `pv-register-1024.jpg`, `pv-register-390.jpg` | Mêmes vues : à 1024 px, la fiche passe sous le registre ; à 390 px, aucun débordement de page. Échelle estimation / écriture (scénarios 40 / 80 / 120, provision 50, crochet de la différence +30), chronologie et pièces. |
| `pv-table-1440.jpg` | Registre en tableau : ouverture, dotations, utilisations, reprises, clôture calculée, estimation retenue, différence, annexe, statut. |
| `pv-reduced-motion-1440.jpg` | Réduction des animations : aucune animation des cases ni de la fiche. |
| `pv-masked-1440.jpg`, `pv-masked-390.jpg` | Lecture par le réviseur sans habilitation confidentielle. Bandeau explicatif. Champs « Masqué — habilitation confidentielle requise » retirés par le serveur. Montants comptabilisés conservés. Original confidentiel non proposé au téléchargement. |
| `pv-ledger-1440.jpg` | Cadrage par compte 15 (1511, 1512, 1522 cadrés ; pont du grand livre nul) et tableau des provisions par catégorie (art. 832-13). |
| `pv-exceptions-1440.jpg` | Quatre points en notes : différence +30,00 €, reprise sans justificatif (10,00 €, non signé), estimation absente, passif éventuel absent de l'annexe. Champs de traitement cité. |
| `pv-locked-1440.jpg` | Déclaration « informations des avocats obtenues et citées » ; version approuvée et verrouillée par une autre identité. |
