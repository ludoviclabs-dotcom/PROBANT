# Mission 13 — captures réelles (Chromium, build de production)

Captures produites le 2026-10-09 par `e2e/fiscal.spec.ts` (Playwright, build de production `next start`).
- Les appels `/api/workpapers/fiscal` sont routés vers les vrais handlers et runtime, sur le stockage mémoire de test, avec des données synthétiques.
- Ce ne sont ni des images générées ni une recette PostgreSQL.
- Conversion PNG → JPEG, qualité 72.

| Fichier | Contenu |
|---|---|
| `fx-vat-t2-1440.jpg`, `fx-vat-t2-1024.jpg`, `fx-vat-t2-390.jpg` | TVA T2 2026 : comparaison comptabilisé / déclaré / écart, pont explicatif, case 16 → écritures → pièce AV-2003 dans le panneau, taux constatés et leur origine, règles bloquées, contrôles du moteur |
| `fx-vat-reduced-motion-1440.jpg` | Expansion d'une ligne de déclaration avec réduction des animations (transition 0 s) |
| `fx-vat-source-expired-1440.jpg` | T3 2026 : contrôles bloqués, source requise (CGI art. 269 et 289, versions jusqu'au 31/08/2026, Légifrance, vérifié le 16/08/2026) |
| `fx-vat-profile-unknown-1440.jpg` | Profil inconnu : moteur bloqué, montants « Inconnu », déclaration « non lue » |
| `fx-vat-cited-decision-1440.jpg` | Exception `VAT.NET` traitée en citant la case 27 de la CA3 T1 (pièce, version, zone) |
| `fx-vat-locked-1440.jpg` | Version approuvée et verrouillée par une autre identité |
| `fx-vat-replaced-1440.jpg` | Déclaration T2 remplacée : feuille périmée, version remplacée conservée |
| `fx-synthesis-1440.jpg`, `fx-synthesis-390.jpg` | Synthèse fiscale : une ligne par impôt et par période, péremption, file de travail, versions remplacées, autres taxes non couvertes |
| `fx-cit-2026-1440.jpg`, `fx-cit-2026-390.jpg` | IS 2026 : résultat cadré FEC ↔ WA, pont documenté, retraitements avec pièce et source (CGI art. 39 « non couvrant » : version à vérifier dans le registre), calcul du moteur et tranches, rapprochements 2065 / 695 / 444 |
| `fx-cit-double-adjustment-1440.jpg` | Double ajustement d'IS signalé dans le formulaire, puis refusé par le serveur |
