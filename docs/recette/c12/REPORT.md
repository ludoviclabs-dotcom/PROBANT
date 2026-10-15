# C12 — reprise locale Paie/Congés

Base : `172ddd7` (main, #93), chantier isolé `codex/c12-payroll-local`. Les modifications préexistantes des autres copies ont été préservées. Livraison locale uniquement.

## Avant / après

#70 conservait ses dossiers dans une session mémoire de trente minutes, avec quarante versions maximum. L'API réelle restait fermée et aucun store durable ne portait cette famille. C07 fournissait déjà profil personnel, PostgreSQL, session locale, relecture personnelle et sauvegarde.

C12 conserve les moteurs existants et leurs CSV qualifiés. La migration additive `0020_payroll_local` introduit la famille `hr` : sources et octets originaux immuables, approbations, têtes, versions de feuilles, reçus d'idempotence et archive locale. Un verrou PostgreSQL du dossier sérialise les requêtes, même depuis plusieurs processus. Une même clé rejouée a un seul effet ; une ancienne version est refusée.

La route `/paie-personnel` et les Congés utilisent la session C07, l'accès au dossier et l'habilitation RH serveur du propriétaire. Les deux procédures rejoignent le registre C01 et le lecteur commun utilisé par C14. La projection porte les états et versions, sans lignes CSV ni pseudonymes ; les données RH et leurs pièces restent dans le parcours dédié.

Les décisions mensuelles sont liées aux dépendances du groupe. Les périodes sans dépendance changée gardent leur revue. Le cadrage tient compte de son mois précédent ; une référence bancaire répétée peut concerner plusieurs mois. Les anciennes données et preuves sont conservées dans l'archive et l'export.

Les comparaisons de Congés exigent mêmes droits, unités et périodes, méthode applicable, bases et inclusions/exclusions qualifiées. Aucune estimation des droits restants, charge forfaitaire ou qualification comptable n'est produite automatiquement. Voir [sources et justification](SOURCES.md).

## Recette reproductible

1. Initialiser et démarrer un profil C07 isolé, en indiquant le dossier des binaires PostgreSQL 17 : `local:init`, puis `local:start -- --sans-navigateur --build`.
2. Lancer `node --import tsx scripts/local/recette-c12.ts <profil>`.
3. Lancer `node --import tsx scripts/local/verify-c12-storage.ts <profil>` pour le profil de recette situé sous `.c12-runtime`.
4. Pour le navigateur : définir `PROBANT_E2E_LOCAL_HOME` et `PROBANT_E2E_BASE_URL`, puis exécuter `e2e/c12-paie-locale.spec.ts`.

Les attendus sont fixés dans le script avant appel aux API : 48 − 50 = −2 ; 10 000 × 1/10 = 1 000 ; 11 000 × 1/10 = 1 100 ; maximum 1 100 pour les seuls droits documentés. Le script ne lit ni ne modifie un dossier existant de l'utilisateur ; il crée un dossier synthétique et ne contacte que l'origine loopback du profil fourni.

[REPRISE.json](REPRISE.json) conserve les contrôles, versions, empreintes et PID avant/après. Les secrets et codes de connexion n'y figurent pas. Le script arrête réellement Next et PostgreSQL, relance de nouveaux processus et compare les données canoniques, l'export et la pièce originale. L'ordre des clés JSON PostgreSQL est neutralisé pour comparer les données ; les fichiers exportés et pièces sont comparés octet pour octet.

## Vérifications finales

| Contrôle | Résultat |
| --- | --- |
| Recette HTTP, arrêt et nouveaux processus Next/PostgreSQL | **20/20**, données et version 13 identiques ; export et pièce identiques octet pour octet |
| PostgreSQL et lecteur commun C14 | **7/7** : famille hr lue, historique conservé, FK dossier/organisation, imports immuables, migration descendante refusée avec données, refus sans altération |
| Tests ciblés Paie/Congés, profil et registre | **40/40** |
| Dernière suite unitaire complète | **1 834 réussis, 1 échec de délai dans Cloisons** ; les **4/4** tests de ce fichier passent ensuite seuls, sans modifier le délai de cinq secondes |
| Navigateur, build de production | **4/4** : 390/1024/1440, ouverture/import/qualification/rechargement d'un nouveau dossier ; clavier/Échap et retour du focus ; pas de débordement global ; axe serious/critical **0** sur les pages contrôlées |
| Types, lint du périmètre et compilation de production | **Réussis** ; lint du périmètre sans avertissement, avertissements globaux antérieurs conservés |
| Migrations | **23** migrations montantes, invariants valides ; profil neuf avec la migration finale |
| Sauvegarde cohérente C07 | **76 tables**, dont les **7 tables hr** ; octets des imports RH dans la base sauvegardée |

Détails : [VALIDATION.json](VALIDATION.json), [REPRISE.json](REPRISE.json), [STOCKAGE.json](STOCKAGE.json), [SAUVEGARDE.json](SAUVEGARDE.json), [captures et mesures](captures/). Les sources et attendus sont reproductibles ; les données de recette sont synthétiques. Aucun test ignoré n'est compté comme vérifié.

Corrections de recette : frontière serveur/navigateur, restauration des relectures à l'écran, en-têtes de session des commandes UI, comparaison canonique JSONB, base absente restant inconnue. À 390 px, le libellé masqué du tableau est désormais positionné dans son conteneur de défilement ; la version reste visible. Aucun débordement n'est masqué par une règle globale.

L'artefact final a été recompilé, puis la recette, les quatre tests navigateur et la sauvegarde ont été réexécutés. L'accès Git du compte de sandbox Windows a reçu une exception limitée au checkout et à la commande ; aucun réglage Git global n'a été modifié.

## Limites

- CSV structurés uniquement ; identifiants pseudonymisés SYN, aucun nom/NIR. Aucun parseur DSN natif ni logiciel de paie.
- Les méthodes, fractions, éléments de rémunération et charges doivent être documentés par le dossier. Les références officielles n'attestent pas leur applicabilité au cas particulier.
- Qualification dette de personnel / estimation / provision déclarée avec justification, sans écriture comptable automatique. Droits restants inconnus sans méthode dédiée.
- Profil local du propriétaire uniquement ; seconde identité synthétique sans accès RH. Relecture solo explicitement nommée, aucune revendication de deux personnes réelles indépendantes.
- Archive limitée à 32 Mio : une nouvelle mutation trop volumineuse est refusée ; les données précédentes restent conservées. Les versions d'une ancienne démo mémoire doivent être réimportées, elles ne peuvent pas être inventées après son arrêt.
- Lecteur d'écran humain non vérifié. Aucun merge ni déploiement Vercel.
