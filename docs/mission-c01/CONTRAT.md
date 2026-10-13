# C01 — Dossier, périodes et capacités

Date : 13 octobre 2026. Contrat interne de navigation et de lecture, version 1.0.0. Aucune nouvelle règle comptable, fiscale ou professionnelle.

## Identité canonique

`DossierNavigationContext` complète les identités existantes, sans changer leurs clés de stockage :

| Élément | Portée et règle |
|---|---|
| Organisation / dossier | Clés des repositories et du scope existants. L’organisation d’une lecture persistante vient de l’identité autorisée côté serveur. |
| Entité | Libellé et SIREN éventuellement absent. Les identifiants techniques restent dans les détails. |
| Exercice | Libellé, début et clôture. Un exercice décalé est conservé. Une date inconnue reste `null` ; le millésime seul ne prouve pas le 1er janvier. |
| Référentiel | Version du snapshot existant, pas un référentiel inventé à partir de l’année. |
| Mode | `historical`, `scenario`, `local_persistent`. Paramètre URL `dossierMode` pour éviter le conflit avec l’ancien `mode=live`. |
| Période de procédure | Nature `exercise`, `vat` ou `payroll`, début, fin, date de revue. Distincte de l’exercice. Les dates doivent être civiles, ordonnées et incluses dans l’exercice. |
| Identifiant de période du store | `periodId(AccountingPeriod)` existant : exercice et EUR. Le mois déclaratif TVA reste dans la feuille fiscale et ne remplace pas cette clé annuelle. |

Les paramètres du lien sont des repères de navigation, jamais une identité authentifiée, une méthode approuvée ou un résultat. Les dates proposées aux formulaires restent provisoires. Les données lues, leurs versions et les contrôles d’accès viennent des moteurs et des stores existants.

Le dossier historique DEMO SA possède un millésime et une clôture, mais pas de début/date de revue qualifiés dans son snapshot. Ses liens transmettent le dossier, l’entité, l’exercice et le référentiel ; l’absence de période de procédure est expliquée, sans fabriquer une période ni une feuille.

## Liens et changement d’exercice

`DossierContextLink` / `DossierContextAnchor` utilisent le snapshot actif sur le dashboard et le contexte du lien sur les feuilles. Le même sérialiseur dessert les menus, la Synthèse, les listes de travail, les retours, la connexion et la visite guidée. Les téléchargements API et les URL externes restent sous leur contrat existant.

Un lien serveur vers une autre clé dossier/période n’hérite pas d’un libellé d’entité ou d’exercice incompatible. Les liens de version gardent `id`, `version`, `rootId` et les filtres lorsqu’ils concernent le même scope. La période TVA explicite des liens fiscaux est conservée séparément ; un lien vers Clients rétablit la période de procédure annuelle.

Les liens explicites `scenario=…` ou `demo=1` ouvrent leur périmètre indépendant sans hériter de l’identité du dossier courant. Le provider mémorise la sélection explicitement résolue avec le service existant ; les retours historiques sans paramètres reprennent cette sélection, sans créer ou copier de dossier.

Le sélecteur « Dossier et exercice » propose les snapshots déjà présents dans le repository de session de l’organisation. Un changement explicite supprime les anciennes clés de feuille/version/preuve et la période déclarative. Il ne réécrit pas les versions et ne fabrique pas un dossier pour une année absente. Les feuilles sont remontées avec le nouveau contexte, évitant la conservation d’un résultat de l’ancien exercice dans l’état React.

Sur les parcours avec contexte canonique, les champs techniques d’identité du dossier sont en lecture seule : ils restent consultables/copiables dans la méthode et ne permettent pas de charger un autre dossier sous l’ancien en-tête. Les anciennes routes de saisie manuelle, sans contexte canonique, gardent leurs contrôles existants.

Le provider du dashboard attend la résolution du dossier. Un dossier demandé absent, ou un exercice/référentiel incompatible avec le snapshot lu, affiche une erreur ; DEMO SA n’est plus rendu comme substitut pendant cette résolution.

La résolution dépend uniquement des clés canoniques et des alias d’identité historiques. Modifier un filtre de vue (impôt, statut, preuve) conserve les composants montés et leur état ; cela ne sélectionne pas un nouveau dossier. Les changements d’exercice, de référentiel ou de période restent des changements de contexte, et les clés de contexte dupliquées restent invalides. Une Synthèse synthétique transmet explicitement le contexte du snapshot qu’elle affiche au registre de capacités, même sans provider de dashboard.

## Absence de feuille et atelier

Une entrée historique ou scénario vers un parcours persistant indique qu’aucune feuille persistante n’est rattachée à ces constats. Elle explique les sources et exclusions du cycle, propose la préparation explicite à partir des pièces locales et un accès distinct à l’atelier. Aucun résultat ni copie de DEMO SA n’est créé.

Une Synthèse Clients dont le serveur ne trouve aucune feuille propose « Initialiser explicitement la feuille Clients ». Le formulaire reprend le dossier et les dates connues. La création reste le bouton explicite et la commande existante, soumise aux permissions serveur. Ouvrir un lien ou charger une Synthèse n’écrit rien.

L’initialisation d’un dossier persistant absent et l’activation locale de l’authentification/base restent des capacités du socle existant : ce lot ne crée pas un nouvel utilisateur, un store navigateur de mission ou une copie persistante d’un exercice de démonstration.

## Registre unique et projections

Le registre `lib/capabilities/registry.ts` rassemble 14 périmètres : les 13 cycles du journal existant et les Dettes financières, présentes dans le rapprochement historique mais dépourvues de moteur durable dédié. Il contient les 15 procédures existantes, les routes, les sources et exclusions, les 11 configurations de rapprochement et les 10 exercices pédagogiques. Les constantes du journal restent compatibles ; aucun nouvel enum ni migration n’est imposé au journal.

Chaque capacité décrit séparément ses modes historique, scénario et local persistant. « Implémenté » qualifie le code et son périmètre. « Configuré » décrit l’activation serveur et l’URL de base déclarée ; ce n’est pas une preuve de connexion ou de droit. « Exécuté » exige une feuille effectivement lue dans le dossier/période, avec son résultat ; une feuille brouillon ne vaut pas exécution.

| Ancienne liste / consommateur | Projection actuelle |
|---|---|
| `availability.ts / MODULE_MANIFEST` | Atelier pédagogique du registre ; Stocks « absent de cet atelier », sans nier sa feuille locale. |
| `rapprochement/catalog.ts / AUDIT_CYCLES` | Configurations historiques référencées par les capacités, ordre historique conservé. |
| `rapprochement/catalog.ts / DOCUMENT_TYPES` | Sources déclaratives des configurations présentes dans le registre. |
| `closing-contract.ts / CL_CYCLES`, labels | Vocabulaire compatible du registre ; 13 valeurs inchangées. |
| `closing-contract.ts / CL_ENGINE_PROCEDURES`, IDs | 15 procédures du registre, mêmes IDs/familles/routes. |
| `closing-contract.ts / CL_FAMILIES` | Sept familles du registre. |
| Sidebar / `NAV` | `WORKFLOW_ROUTES`, icônes et comportements clavier existants conservés. |
| Liens manuels de Synthèse et `SyntheticSummary` | `CapabilityAccess`, lignes de cycle et détails alimentés par le registre. |
| Tables de cycle de `closing-store.ts` | Adaptateurs de lecture partagés, mêmes tables et mêmes clés. |

Les définitions déclaratives déplacées vers `reconciliation-definitions.ts`, `procedures.ts` et `workshop-definitions.ts` sont les entrées du registre. Elles ne sont pas des moteurs ou des listes concurrentes utilisées par les écrans. Les descriptions pédagogiques du guide restent distinctes des capacités d’exécution.

Stocks couvre quantités, mouvements intercalaires, coûts et revue de valeur documentée ; pas de présence physique certifiée ou de dépréciation automatique. ITGC n’a pas de moteur dédié : le programme de clôture accepte des travaux manuels documentés avec leurs exigences existantes. Paie réelle/RH, DSN native et DCF complet ne sont pas annoncés comme livrés.

## Lecture des stores

`store-readers.ts` lit les têtes des tables `clients_*`, `cash_*`, `fa_*`, `eq_*`, `fx_*`, `st_*`, `pv_*`, jointes aux versions par leurs clés existantes. Liste fermée de noms SQL ; aucune valeur de requête ne devient un nom de table. Chaque ligne est validée, doit correspondre à l’organisation/dossier/période demandé et à sa famille de procédure. Les versions remplacées restent stockées ; elles ne sont pas fusionnées avec les têtes courantes.

Le store de clôture utilise ces mêmes adaptateurs. `GET /api/dossier-capabilities` expose sans identité uniquement une configuration non sensible. Si aucun lecteur de store n’est activé, la requête avec scope retourne aussi cette seule configuration, sans construire les services d’identité/base et sans affirmer « aucune feuille ». Une lecture effective exige l’autorisation existante `dossier:read`, l’appartenance contrôlée par `RequestAuthorizer` et une session non expirée. Seules les familles activées sont lues, dans une transaction ; aucune feuille n’est créée/exécutée/revue. La réponse reste privée, non mise en cache et bornée à 10 Mio. Une panne n’est pas assimilée à « aucune feuille ». Le client annule les requêtes de lecture obsolètes lors du changement de contexte.

Les flags `PROBANT_*_DURABLE=disposable`, le refus existant en production, les permissions, les sources, les moteurs, les tables et les mécanismes de version restent ceux du code antérieur. Ce lot ne les active pas, ne lance pas de migrations et n’ajoute aucune dépendance à un programme de conformité cloud.

## Sources du contrat

Code actuel après C00 ; `docs/mission05/CLIENTS_FRAME_CONTRACT.md`, `docs/mission13/CONTRAT.md`, `docs/mission16/CONTRAT.md`, `docs/mission19/CONTRAT.md`, `docs/probant-lots/HANDOFF.md` ; repositories de dossier, scopes/périodes et stores existants. Les affirmations historiques des anciens rapports ne sont pas des contrôles réexécutés. Aucun nouveau choix interne n’est attribué à une norme.
