# Mission 17 — reprise locale

Date : 9 octobre 2026. Branche isolée `codex/mission17-exceptional`, dossier de travail `mission17`. Départ : `a82ed3cdbfb371eeef180baf5efc29098e186c51` (origin/main). Déploiement de production Vercel inspecté en lecture seule : même SHA, état READY, `dpl_FiTXfB8SKTdMW2g9AJpsKsvuzaTP`. Les modifications de mission14 et les fichiers synchronisés sous sources n’ont pas été modifiés.

## Livraison
Route `/resultat-exceptionnel`, liée à la Synthèse, moteur partagé workpapers/Clients. Dossier de qualification versionné, événements et toutes leurs lignes de GL, recherche hors 67/77, distinctions de catégories et PCG/version/anticipation. Décision motivée et citée par écriture ; contrôle de totalité, pont avant/après, comparaison N−1 avec définition historique conservée. Pièces client et sources officielles distinctes. Exports diagnostic HTML/JSON, historique et revue distincte avec contrôle de version et d’empreinte. Le GL original reste intact.

Interface : table, panneau animé, navigation directe, pont animé et chronologie ; arrière-plan inerte, focus contenu, Échap et retour à l’événement, styles réduisant les mouvements. Les contreparties de bilan se lisent dans le panneau sans menu de reclassification inutile. Pas de menu déroulant de qualification.

## Vérifications effectuées
- Suite globale : 124 fichiers réussis, 4 ignorés ; 1 339 tests réussis, 35 ignorés. Exécutée avant les derniers renforcements des contreparties et de l’adoption explicite ; ces changements ont été vérifiés ensuite par les tests dédiés et la régression ciblée.
- Régression finale des moteurs partagés : 6 fichiers, 53 tests réussis (mission17, imports, population/sélection, workflow, cycle-review).
- Dernière recette dédiée : 2 fichiers, 34 tests réussis ; GL synthétique équilibré de 18 lignes, 8 événements, 2 candidats hors 67/77. Les sources passent par le vrai import CSV et l’approbation de mémoire existante.
- Typecheck : réussi sur le code final. Lint global : aucune erreur, 7 avertissements antérieurs hors fichiers de la mission. db:check : 16 migrations up, 17 tables, invariants valides. diff --check : réussi.
- Chrome : table et pont sur grand écran ; écran mobile émulé 390×844, largeur de document 390, sans débordement de page ; panneau animé, focus contenu et fermeture Échap avec retour au déclencheur ; séparation source officielle/pièce client ; une décision motivée de maintenance sauvegardée par POST serveur, version 3 et état « décision documentée ». Contrôle des règles CSS de réduction des mouvements. Pas de mesure d’accessibilité exhaustive.
- Compilation de production : réussie sur la dernière version, pages et API de la mission générées ; lint et vérification de types inclus. Aperçu relancé avec la version compilée en local, sans déploiement.

## Aperçu et reprise
Aperçu local : `http://127.0.0.1:3017/resultat-exceptionnel?demo=1`. Cas `unknown`, `old`, `complete`, `empty`, `long` via le paramètre case. Le cas complete fournit les pièces ; il ne prend aucune décision automatiquement.

Pour relancer l’aperçu depuis mission17 en PowerShell :

```powershell
$env:PROBANT_DEMONSTRATION_ENABLED='true'
$env:PROBANT_DEMONSTRATION_ORIGIN='http://127.0.0.1:3017'
npm.cmd run dev -- --hostname 127.0.0.1 --port 3017
```

Les sessions synthétiques sont volatiles et peuvent disparaître au redémarrage. Les dépendances utilisent la jonction node_modules existante vers mission05, aucun ajout de dépendance. En mission réelle, session OIDC et CSRF existants ; gate fermé par défaut, disposable seulement ; `0014_exceptional_review` ajoute uniquement les types documentaires à la table Clients et son rollback refuse les données présentes. Aucun accès métier réel ni migration appliquée.

## Limites et revue suivante
Consulter MISSION17_CONTRACT.md pour les sources officielles, dates d’effet, sections versionnées, limites professionnelles et schémas. Le GL complet est une déclaration du pack fourni, pas une preuve automatique d’exhaustivité externe. Des faits et une pièce liés ne garantissent pas à eux seuls la qualité du jugement humain. Référentiels sectoriels, historiques hors 2024 et analyse spécifique des impôts restent à documenter avec blocage de qualification. Le cas 2024 qualifie la maintenance en courant et une sortie d’immobilisation selon la nature historique de capital ; les autres catégories historiques exigent une analyse spécifique et restent bloquées. La chaîne PostgreSQL optionnelle n’a pas été exécutée faute de base jetable configurée ; aucune preuve de durabilité produite dans cette session. L’interface réelle et le runtime restent réservés à la recette autorisée.

