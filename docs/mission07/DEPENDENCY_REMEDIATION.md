# Remédiation des dépendances avant Mission 07

Date : 8 octobre 2026. Le traitement des dépendances précède les ajouts fonctionnels Clients.

L'audit de Mission 06 signalait 14 paquets vulnérables, y compris les paquets parents affectés par une dépendance transitive. Un nouvel audit officiel npm a signalé **15 paquets** : une nouvelle alerte Next.js concernait également la version 15.5.26. Le comptage n'est pas celui de 15 failles indépendantes.

## Traitements retenus

| Paquets affectés | Correction | Justification et contrôle pertinent |
|---|---|---|
| next | 15.5.27 ; eslint-config-next aligné sur 15.5.27 | Corrige les avis récents [GHSA-4jqv-mc3x-m676](https://github.com/advisories/GHSA-4jqv-mc3x-m676) et [GHSA-mcj8-r9mp-w47p](https://github.com/advisories/GHSA-mcj8-r9mp-w47p), sans migration vers Next 16. Construction et parcours navigateur à revérifier. |
| vitest, @vitest/mocker, tinypool | Vitest 5.0.3 et mocker 5.0.3 ; tinypool retiré de cette chaîne | Corrige [GHSA-82fw-gwwq-j7x9](https://github.com/advisories/GHSA-82fw-gwwq-j7x9) et les gadgets critiques Tinypool [GHSA-5gmw-xhrv-c9v3](https://github.com/advisories/GHSA-5gmw-xhrv-c9v3), [GHSA-85c8-ppgw-ccpr](https://github.com/advisories/GHSA-85c8-ppgw-ccpr). La migration exige Node >=22.12 ; Node 24 est utilisé localement et en CI. |
| braces, micromatch, fast-glob, @next/eslint-plugin-next, eslint-config-next | Retrait de fast-glob et de son arbre braces/micromatch pour son seul consommateur Next ; adaptateur local limité utilisant tinyglobby 0.2.17 | [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) ne dispose d'aucune version braces corrigée. L'adaptateur remplace le code vulnérable ; aucun filtrage des avis, aucune fausse version « corrigée ». |
| brace-expansion | 1.1.21, 2.1.7 et 5.0.12, dans leurs branches compatibles | Corrige les récursions et coûts quadratiques [GHSA-q2hr-2g5m-vwhr](https://github.com/advisories/GHSA-q2hr-2g5m-vwhr), [GHSA-qhr7-859c-m2p7](https://github.com/advisories/GHSA-qhr7-859c-m2p7), [GHSA-6j4f-fj2g-mc7p](https://github.com/advisories/GHSA-6j4f-fj2g-mc7p). |
| sharp | Override 0.35.5 minimum | Corrige la dépendance librsvg visée par [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w). La construction Next vérifie le chargement natif. |
| source-map-js | 1.2.2 | Corrige la validation des offsets [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q). |
| undici | 6.29.0 et 7.30.0, selon le consommateur | Conserve les branches majeures et supprime les versions affectées <=6.28.0 ou 7.0.0–7.29.0 de l'arbre ; couvre notamment [GHSA-rfgv-xxqx-mfg5](https://github.com/advisories/GHSA-rfgv-xxqx-mfg5) et [GHSA-w293-vg96-wgc3](https://github.com/advisories/GHSA-w293-vg96-wgc3). Les tests jsdom vérifient la compatibilité. |
| uuid, exceljs | Override UUID 11.1.1 ; ExcelJS 4.4.0 conservé | Corrige [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq). UUID 11 conserve l'entrée CommonJS v4 utilisée par ExcelJS ; les versions UUID plus récentes ne sont pas imposées. |

## Remplacement limité de fast-glob

Le paquet Next ESLint n'utilise fast-glob que dans son utilitaire get-root-dirs, via globSync(pattern, { onlyDirectories: true }). Dans le lock, c'est le seul consommateur transitoire de fast-glob. La dépendance de développement racine pointe vers le paquet local et l'override global fast-glob:$fast-glob aligne sa résolution. Le test refuse tout autre consommateur futur : l'adaptateur ne peut donc pas être étendu silencieusement à des API inconnues. Le réglage rootDir sous forme de tableau est décomposé par Next en appels individuels.

L'adaptateur tools/fast-glob-compat est un paquet privé du dépôt. Il expose cette seule API et refuse les autres options. Il emploie tinyglobby avec expandDirectories:false et la conservation des chemins absolus, puis normalise les séparateurs et barres terminales. Une vérification de répertoire traite les chemins littéraux, notamment le répertoire courant absolu. Un alias direct vers tinyglobby ne serait pas équivalent : il développerait les descendants d'un chemin littéral et renverrait des chemins relatifs pour un motif absolu.

Les motifs sont limités à 4096 caractères et 64 niveaux d'imbrication. Les motifs négatifs et NUL sont refusés. Le paquet ne contient aucune portion du parseur ou des marcheurs récursifs braces. Le [projet tinyglobby](https://github.com/SuperchupuDev/tinyglobby) documente son objectif de compatibilité avec fast-glob ; seules les opérations réellement utilisées sont admises ici.

Le test dependency-compat.test.ts couvre les chemins littéraux, absolus, relatifs, les accolades et motifs récursifs, les appels rootDir string/tableau au véritable plugin Next, et le déclenchement effectif de la règle no-html-link-for-pages. Il contrôle aussi l'absence de braces/micromatch dans le lock et l'identité réelle du remplacement résolu depuis le plugin, afin qu'une suppression de messages d'audit ne puisse satisfaire le contrôle.

## Migration du moteur de tests

[Vitest 5](https://vitest.dev/guide/migration/) accepte Vite 6.4, 7 et 8. Avec Vite 8, JSX est transformé par Oxc : la configuration utilise oxc.jsx.runtime=automatic, comme décrit par la [migration Vite 8](https://vite.dev/guide/migration.html). La version Vite 8.3.3 est verrouillée. Les comportements de mocks doivent être vérifiés par toute la suite, notamment le changement de valeur par défaut clearMocks. Aucune alerte n'est acceptée pour éviter une migration.

## Validation

Le test supplémentaire ExcelJS écrit puis relit un classeur contenant une barre de données étendue ; il vérifie les montants, la règle persistée et le UUID v4 x14Id généré. Ce parcours exerce réellement l'unique appel CommonJS UUID du code ExcelJS.

L'audit npm a renvoyé zéro alerte après les mises à jour. La validation définitive doit également confirmer une installation reproductible et les tests de compatibilité, types, lint, construction, recette navigateur et CI. Les résultats d'exécution sont consignés dans le rapport de recette Mission 07 ; aucune activation production n'est associée à cette remédiation.

## Nomenclature logicielle du remplacement local

Le générateur CycloneDX nomme le paquet local @probant/next-root-glob1.0.0, plutôt que son alias d’installation fast-glob. Il vérifie la concordance nom/version du manifest avec le lock et ajoute les SHA-256 de README.md, index.cjs et package.json, ainsi qu’une empreinte de leur index trié. Une modification locale du code change cette empreinte même si la version et le lock restent identiques. Les chemins doivent rester dans le paquet et le dépôt ; un écart est un échec explicite.

La suite dependency-sbom.test.ts vérifie la génération identique à SOURCE_DATE_EPOCH fixé, UUID11.1.1 et l’identité réelle de l’adaptateur, la variation du hash après changement de code, ainsi que le rejet d’un nom/version incohérent ou d’un fichier hors paquet. La commande CI doit utiliser npm run --silent sbom pour produire du JSON seul.

## Correction des deux alertes CodeQL de la PR 57

L’audit des dépendances à zéro ne couvrait pas les alertes du code local. L’analyse de la première version signalait js/file-system-race dans le générateur SBOM et js/polynomial-redos dans la normalisation des répertoires. Ces alertes ne sont ni ignorées ni supprimées.

Le générateur ouvre chaque source une seule fois, contrôle son type et lit ses octets avec le même FileHandle, puis ferme ce handle dans finally. Il refuse une modification en place détectée pendant la lecture (identité, taille, horodatages et longueur lue). Les options NOFOLLOW/NONBLOCK s’appliquent lorsqu’elles existent sur la plateforme. L’identité et le hash du manifest local reposent sur les mêmes octets ; le lock est également lu une seule fois pour le calcul et son empreinte. Les chemins et liens sortant du paquet restent refusés. Les sources du dépôt doivent rester stables pendant la génération : ce script ne fournit pas de snapshot transactionnel de l’ensemble du système de fichiers.

La suppression des barres terminales utilise un parcours linéaire, sans expression régulière à répétition non ancrée. Les racines de volume restent conservées. Les tests ajoutés exercent les longues séries de séparateurs, le remplacement du chemin après ouverture (code et manifest), la mutation en place, la fermeture sur échec, les répertoires et les liens hors paquet.

Références techniques : [FileHandle Node](https://nodejs.org/api/fs.html#class-filehandle), [requête CodeQL sur les courses de fichiers](https://codeql.github.com/codeql-query-help/javascript/js-file-system-race/).
