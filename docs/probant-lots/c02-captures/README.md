# Mission C02 — Captures réelles avant / après (Chromium, build de production)

Captures produites le 13/10/2026 sous Playwright, sur le build de production servi par `next start`, données exclusivement synthétiques (DEMO SA historique et scénarios `SYN-*` du laboratoire). Ni image générée, ni recette PostgreSQL. Format : JPEG qualité 70, page entière.

- `avant/` : main `ab8f991`, produit par un spec temporaire (non conservé) contre le build de production du même SHA.
- `apres/` : ce lot, produit par `e2e/c02-finition.spec.ts`, qui vérifie aussi le débordement global nul, le focus / Échap du volet et le contraste axe « serious / critical » sur le contenu des vues.

## Avant (`avant/`)

| Fichier | Contenu |
|---|---|
| `synthese-dossier-courant-{1440,1024,390}.jpg` | Onze paragraphes de liens vers les modules empilés avant le verdict ; bloc « Travaux du dossier » brut. |
| `synthese-synthetique-{1440,390}.jpg` | Même accumulation sur la synthèse d'un scénario. |
| `tests-vide-{1440,1024,390}.jpg` | Bandeau `bg-amber-50` clair hors thème, texte de méthode et actions longues avant les tests. |
| `tests-scenario-{1440,390}.jpg` | Scénario ouvert : UUID complet dans le titre, formulaire dans le bandeau clair. |

## Après (`apres/`)

| Fichier | Contenu |
|---|---|
| `synthese-dossier-courant-{1440,1024,390}.jpg` | Dossier, état des sources et action prioritaire en tête ; décision du moteur ; liste des cycles générée depuis le registre (état, étendue, écarts, prochaine action) avec la ligne « Clients et ventes » dépliée : exclusions, sources requises, accès, capacité par mode. À 390 px la table défile dans son cadre, sans débordement de page. |
| `synthese-scenario-{1440,1024,390}.jpg` | Synthèse d'un scénario : action prioritaire « Fournir la source requise » sur la feuille bloquée, cycles du scénario, puis travaux et exports. |
| `tests-vide-{1440,1024,390}.jpg` | Lanceur compact « Laboratoire de scénarios » dans le thème graphite : état, Nouveau, Mode et sauvegarde. Tests suggérés par constat ensuite. |
| `tests-vide-volet-{1440,1024,390}.jpg` | Volet « Mode et sauvegarde » ouvert au clavier (focus dans le volet, Échap le referme et rend le focus au bouton) : mode, sauvegarde, dossier actif, identifiant complet copiable. |
| `tests-scenario-{1440,1024,390}.jpg` | Scénario ouvert : identifiant court dans la ligne d'état, feuille Clients exécutée, identifiant copié depuis le volet. |
| `tests-scenario-bloque-{1440,1024,390}.jpg` | Feuille Trésorerie bloquée par une pièce manquante : seul ce message porte l'ambre sémantique (`--pb-warn`), avec le lien vers la source requise. |
| `tests-erreur-reprise-{1440,390}.jpg` | Journal local corrompu (checksum) : « Reprise refusée : DEMO_INTEGRITY_INVALID », ton d'erreur, remise à zéro explicite proposée. |
| `synthese-chargement-390.jpg` | Synthèse capturée avant hydratation (scripts retardés de 1,5 s) : rendu serveur sans débordement. |
| `tests-identifiant-long-390.jpg`, `synthese-identifiant-long-390.jpg` | Nom de dossier et identifiant volontairement démesurés injectés dans le DOM : le bandeau et le volet coupent ou replient sans élargir la page. |
| `tests-programme-long-1440.jpg`, `synthese-programme-long-{1440,390}.jpg` | Les dix scénarios exécutés d'affilée : compteur, liste complète des cycles, preuve des feuilles. |
| `tests-reduced-motion-1440.jpg` | `prefers-reduced-motion: reduce` : durée d'animation du volet ramenée à 0,001 ms. |
