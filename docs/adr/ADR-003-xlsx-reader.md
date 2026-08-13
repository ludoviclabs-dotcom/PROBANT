# ADR-003 — Lecteur XLSX

- **Statut** : accepté
- **Date** : 13 août 2026
- **Décision** : `read-excel-file` 9.x, dans un Web Worker côté navigateur

## Contexte

Le dépôt contient `xlsx@0.18.5`, dernière version du registre npm mais version obsolète de SheetJS CE. Cette version est concernée par les avis CVE-2023-30533 et CVE-2024-22363. Les versions CE corrigées sont distribuées depuis le CDN propre de SheetJS et non depuis le registre npm. Les imports actuels parsant des fichiers utilisateurs sur le thread UI doivent disparaître.

PROBANT lit des balances et des pièces tabulaires simples. Il ne modifie pas les styles, ne recalcule pas les formules et n'a pas besoin des formats historiques dans ce PR.

## Comparaison fonctionnelle et opérationnelle

| Critère | SheetJS CE 0.20.3 actuelle | ExcelJS 4.4.0 | read-excel-file 9.3.10 |
|---|---|---|---|
| Sécurité connue | Corrige les avis visant 0.18.5 ; distribution hors npm à épingler/vendorer | Aucun avis bloquant relevé lors de la revue, mais plusieurs dépendances anciennes/dépréciées dans l'installation d'essai | Aucun avis bloquant relevé lors de la revue ; surface volontairement plus petite |
| Licence | Apache-2.0 | MIT | MIT |
| Maintenance/distribution | CE maintenue sur infrastructure SheetJS ; npm reste à 0.18.5 | Dernière publication npm 4.4.0, écosystème large mais publication ancienne | 9.3.10 publié le 10/08/2026, API Node/browser/Worker dédiée |
| Empreinte mesurée | 7,5 Mo décompressés ; bundle min complet 952 Ko (mini 280 Ko) | 21,8 Mo décompressés ; bundle min 948 Ko | 2,5 Mo décompressés ; bundle min 48 Ko |
| Mémoire, classeur synthétique 50 001 × 10, 2,9 Mo | pic RSS 300,5 Mo | pic RSS 448,5 Mo | pic RSS 227,8 Mo |
| Temps sur le même fichier | 5,43 s | 3,39 s | 3,55 s |
| Web Worker | Possible par intégration applicative | Possible par intégration applicative | Export `read-excel-file/web-worker` documenté |
| Streaming | APIs de flux selon environnement ; la lecture XLSX reste contrainte par le ZIP | Lecteur XLSX streaming Node, pas équivalent dans le bundle navigateur | Décompression asynchrone et XML SAX ; résultat de feuille matérialisé, pas un flux ligne à ligne complet |
| XLSX | Oui | Oui | Oui |
| XLS legacy | Oui | Non | Non, rejet explicite `XLS_FILE_NOT_SUPPORTED` |
| Dates/nombres | Oui, options nombreuses | Oui, styles/valeurs riches | Dates par format ; `parseNumber` injectable pour les décimaux exacts |
| Formules | Valeur et formule, sans moteur de calcul CE | Formule et valeur mise en cache, sans recalcul complet | Lit la valeur pré-calculée ; cellule vide si elle manque |
| Fichiers malformés | Large compatibilité, donc surface de parsing large | Parseur ZIP/XML riche | Erreurs typées pour ZIP invalide, mauvais format et tableur incohérent |

Sources : [installation SheetJS CE](https://docs.sheetjs.com/docs/getting-started/installation/frameworks/), [avis SheetJS](https://cdn.sheetjs.com/advisories/), [ExcelJS](https://github.com/exceljs/exceljs), [licence ExcelJS](https://github.com/exceljs/exceljs/blob/master/LICENSE), [read-excel-file](https://github.com/catamphetamine/read-excel-file), [paquet npm read-excel-file](https://www.npmjs.com/package/read-excel-file).

### Protocole de mesure local

- Node 24, Windows, exécutions séquentielles avec `--expose-gc`.
- Workbook généré par le writer streaming ExcelJS : 50 000 lignes de données, 10 colonnes, 2 924 460 octets.
- Mesure `process.resourceUsage().maxRSS`, une exécution par lecteur.
- Ces chiffres sont comparatifs et non des limites de production ; le benchmark reproductible du dépôt fixe les recommandations de limites séparément.

## Décision

`read-excel-file` 9.x est retenu pour les XLSX simples. Il couvre les besoins réels, expose un chemin Worker officiel et réduit fortement la surface/bundle et la mémoire face aux alternatives mesurées. `xlsx@0.18.5` est supprimé du manifeste et du lockfile.

Règles d'intégration :

- `.xlsx` seulement ; `.xls` legacy est rejeté avec un code explicite et une demande de conversion, sans sniffing permissif ;
- tout XLSX traité dans le navigateur passe par un Web Worker, sans exception de taille cachée ;
- limites avant/durant décompression : octets uploadés, taille de ligne/cellule, durée, nombre de lignes et ratio d'expansion ZIP ;
- les formules ne sont jamais exécutées ; seule une valeur mise en cache est acceptée, sinon revue manuelle ;
- les nombres financiers transitent en chaîne décimale ou via un parseur décimal, jamais par une formule recalculée ;
- PR-03 ne publie qu'un consumer durable FEC et refuse donc XLSX sur cette API ; tout futur consumer XLSX durable devra parser dans son worker d'ingestion, jamais dans une Function interactive.

## Options rejetées

- **SheetJS CE actuelle** : couverture la plus large, notamment XLS, mais distribution non standard et surface inutilement large pour PROBANT. Une réévaluation est possible si XLS legacy devient un besoin accepté.
- **ExcelJS** : excellent pour l'écriture, les styles et le streaming Node, mais bundle et mémoire mesurés trop élevés pour le besoin de lecture simple ; publication npm ancienne.
- **Parser maison / autre bibliothèque** : aucun gain démontré face au coût de sécurité d'un parseur ZIP/XML financier supplémentaire.

## Réversibilité

L'adaptateur applicatif retourne uniquement des lignes tabulaires typées. Changer de lecteur exige de rejouer les fixtures adverses, le corpus de compatibilité et le benchmark, puis de mettre à jour cet ADR.
