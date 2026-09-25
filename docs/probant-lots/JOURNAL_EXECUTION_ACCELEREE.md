# Journal — reprise accélérée

## 2026-09-25 — préservation et nouvelle base

- Dépôt/remotes/statut contrôlés. `git fetch origin --prune` : `origin/main=cd21e0308e0d6eec604ec6be9814291cebea3b0a`.
- Branche d'archive `archive/probant-lots-ae-2026-09-25`, commit local `30c5255` ; 339 fichiers métier conservés. Cache npm volumineux exclu ; aucun secret ou `.env` ajouté. Aucun push.
- Worktree propre `C:\Users\Ludo\PROBANT\reprise-probant-lots-ae` créé exactement depuis ce `origin/main`, branche `fix/reprise-probant-lots-ae`. Dépendances installées hors ligne.

## Corrections prioritaires

- `25dfa32` QF-01 : montant français, distinction absent/zéro/invalide, refus d'une conclusion sur entrée illisible.
- `63b1e65` QF-02/03 : routes d'ingestion historiques autorisées côté serveur, organisation/dossier contrôlés, traversée de chemin refusée. La suppression des routes n'a pas été retenue pour préserver les usages.
- `23b6410` QF-13/19 : aucun fallback démo sur dossier sélectionné introuvable ; export serveur authentifié et borné.
- `979a969` QF-06 : canonicalisation UTF-16 indépendante des locales fr-FR/cs-CZ/lt-LT.
- `a22e479` QF-10 : plafond FEC par défaut aligné à 2 M de lignes sous limite d'upload, dépassement non contourné par parseur historique, job marqué failed avec code explicite. Test ciblé.

## Transposition A→E

- `46d2734` : contrats additifs, cycles techniques synthétiques, sélection/provenance, revue, export figé, tests. QF-11 : clés compte/tiers/actif distinctes ; QF-12 : base d'événement et comptabilisation comparables exigées, exposition dédoublonnée. Aucun changement de migration ni de moteur fiscal main.
- `a3b824b` : atelier de cycles synthétiques, manifeste des cinq états, référence au Guide V1.1, E2E configuré avec flags explicites.
- Tests ciblés : 20 suites/106 tests ingestion + noyau verts ; tests clients/immobilisations/achats ciblés verts.

## Gates et réserves

Méthodes/PBC réelles : `SOURCE REQUISE`. Nouvel atelier non raccordé à OIDC ni au dépôt durable de main : parcours réel désactivé. Les anciennes API ont été renforcées mais non supprimées. Aucune QA indépendante, aucun push/PR/déploiement.

## Validation finale

- Suite unitaire complète : **84 suites, 816 tests passés**.
- Typecheck : **passé** après retrait d'une dépendance E2E absente de main ; aucune dépendance ajoutée.
- Lint : **code 0**, sept avertissements préexistants dans des fichiers non touchés ; aucun nouvel avertissement.
- Build : **passé**, puis recontrôlé après fixation de `outputFileTracingRoot` au worktree ; 149 pages générées. Les sept mêmes avertissements subsistent.
- E2E Chromium : **32 passés, 1 ignoré** (pipeline persistant nécessitant une infrastructure dédiée). Atelier visuel synthétique à 390/768/1440 px passé.
- Sécurité et multi-locales ciblées : **5 suites, 54 tests passés**, couvrant isolation, routes, export, upload et hash canonique fr-FR/cs-CZ/lt-LT.
- QF-19 : garde ZIP existant réutilisé avant décompression XLSX du pipeline fiscal persistant ; 16 tests ciblés passés, dont une archive synthétique pathologique. Typecheck et lint ciblé passés.

Réserves non levées par cette mission : ancien taux de rapprochement main distinct du nouveau contrat non compensable ; effet fiscal inconnu dans la synthèse legacy ; limitation de débit distribuée ; E2E persistant non exécuté. Le nouveau parcours réel reste désactivé. Ces réserves ne sont pas présentées comme validées.
