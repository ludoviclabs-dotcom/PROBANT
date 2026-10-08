# Mission 11 — contrat du dossier de décisions

Cette méthode interne de rapprochement n’implémente aucune règle juridique ou nouvelle prescription comptable. Les familles proposées sont une checklist à déclarer et à corroborer pour la forme sociale, la période et les sources du dossier. Aucun ratio ne conclut à la légalité.

Questions : les composantes pertinentes sont-elles cartographiées ? Le pont ouverture + mouvements = clôture est-il documenté ? Les décisions et leurs écritures se correspondent-elles ? Quels règlements sont distincts de la décision et de sa comptabilisation ?

Unité de population : décision du registre et mouvement du GL. Les soldes, le tableau de variation, les règlements et les pages de PV/actes sont des sources de corroboration. Sources limitées aux sept types equity_* ; données CSV/XLSX, pièces PDF indexées sans extraction automatique de décision. Mapping equity-dossier-1, EUR signé sans conversion implicite, dates civiles et identités explicites. Début, clôture, revue et date d’effet sont conservés séparément.

Programme fixe : quatre contrôles (pont de composantes, comparaison des décisions, rattachement des mouvements, citations de pièces). Les numérateurs, dénominateurs et exclusions restent visibles. Les comptes déclarés ne sont pas limités au compte 10. Une composante exclue nécessite un motif et une preuve ; toute famille absente, compte non cartographié ou source partielle empêche un total ferme. Un transfert interne doit comporter des mouvements sur au moins deux composantes et un total nul ; ses deux jambes restent visibles.

La magnitude votée est comparée à la magnitude comptabilisée sur une convention déclarée, avec une page de PV/acte et une date d’effet dans la période. Les règlements ne réécrivent aucun montant voté ni solde de clôture. Décision sans écriture, écriture sans décision, montant divergent, PV absent, effet hors période et non concluant sont des constats distincts. Un écart arithmétique n’est pas une anomalie validée. Une source manquante ne devient pas zéro.

L’auteur de préparation, des lectures, des traitements et de la revue provient du serveur. Chaque décision humaine cite un document du périmètre figé, son empreinte/version et sa ligne/page réelle. Revue distincte et verrouillage reprennent WorkpaperService. Mutation de convention invalide le calcul ; source remplacée exige une nouvelle révision ; l’ancienne décision reste conservée. Version transactionnelle, verrou dossier, reçus d’idempotence et stockage append-only reprennent la chaîne PostgreSQL Clients.

Le parcours réel est désactivé par défaut. PROBANT_EQUITY_DURABLE=disposable est réservé à une infrastructure jetable et refusé en production Vercel. Aucune persistance de secours en mémoire. La route demo, explicitement synthétique et en lecture seule, nécessite PROBANT_DEMONSTRATION_ENABLED=true et l’origine locale autorisée ; elle est refusée en production.

Recette exclusivement synthétique : vote 30 / comptabilisation 25 / paiement 25 ultérieur ; transfert interne 20 équilibré ; PV absent ; effet hors période ; décision sans écriture ; écriture sans décision ; capital/réserves incomplets ; compte hors cartographie. Aucun envoi, aucune écriture ni avis juridique automatique.

Les exports réutilisent EvidenceExportPackage : diagnostic et paquet approuvé distincts, HTML imprimable, PDF de la chaîne existante, JSON/CSV/manifeste. L’index décrit les pièces/version/localisateurs ; les originaux ne sont pas inclus. Le PDF de l’application reste un document standard Latin-1, sans archivage certifié ; HTML/JSON conservent Unicode.

## Assertions, risques et formats

Cette procédure interne instruit la complétude déclarée des composantes, le rattachement temporel, la correspondance décision/mouvement, la précision du pont et la traçabilité des pièces. Elle ne juge ni la validité juridique d’une décision ni l’exhaustivité d’un registre non corroboré. Risques visibles : décision non comptabilisée, mouvement sans décision documentée, montant divergent, pièce absente, mauvaise période ou cartographie partielle.

| Source | Champs et rôle |
| --- | --- |
| `equity_balances` | Identité de ligne, composante, compte, montant EUR signé, date exacte d’ouverture/clôture, nature `opening`/`closing` |
| `equity_ledger` | Identité du mouvement, composante/compte, date comptable, montant signé, décision liée, nature `decision`/`other`, date d’effet facultative, transfert identifié |
| `equity_variation` | Composante/compte, date dans la période, montant de variation signé ; corroboration du GL |
| `equity_decisions` | Identité de décision, date du vote, date d’effet obligatoire, montant en magnitude, sens `increase`/`decrease`/`transfer`/`none`, libellé |
| `equity_payments` | Identité, date de règlement, magnitude, décision affectée ; ne réécrit pas le vote ni les soldes |
| `equity_minutes`, `equity_acts` | Document versionné et page réelle ; lecture humaine et citation de la méthode/décision |

CSV/XLSX : colonnes sélectionnées explicitement, séparateur/format décimal/date déclarés, montants à la frontière monétaire canonique, identités uniques par source. Aucun taux de change implicite. Les exemples de colonnes `id/amount/date/component/account/decision/kind/effective/transfer/currency/description` sont reproductibles dans `equity-fixture.ts`. PDF : ≤ 3 Mio, ≤ 200 pages ; index des pages et empreinte des octets, sans reconnaissance automatique du vote. La limite HTTP multipart est 3,25 Mio ; état/Synthèse/exports sont bornés.

Cartographie : capital, primes, réserves, report à nouveau, résultat, écarts déclarés, subventions déclarées, provisions réglementées déclarées et autres composantes pertinentes. Le préparateur ajoute les comptes et les composantes pertinents ; une famille non applicable doit avoir une justification et une preuve. Ces catégories ne constituent pas une classification légale imposée à toutes les formes sociales.

Une sélection exclue reste dans le dénominateur et n’obtient pas un écart ferme. Un GL déclaré partiel conserve les lignes observées mais laisse le total comptabilisé par décision et son écart non concluants. Un registre partiel laisse une écriture orpheline non concluante. Les dates hors période ne deviennent pas des omissions courantes. Les ratios techniques sont inconnus lorsque capital/réserves/cartographie sont incomplets ; ils ne sont jamais une conclusion juridique.

## Dates d'écriture et regroupement du capital

La comparaison décision/comptabilisation porte sur les écritures de la période testée. La frise et le résumé humain conservent aussi les écritures liées postérieures, marquées « hors période testée ». Elles ne changent ni le solde de clôture ni l'écart calculé à cette clôture. Une décision sans écriture dans la période reste distincte d'une écriture ultérieure documentée.

Les comptes de capital déclarés sont regroupés dans une seule composante pour fournir la base arithmétique du ratio existant. Ce regroupement est un choix de présentation et de calcul, sans portée juridique. Réserves, report à nouveau, résultat, primes, subventions, provisions réglementées, autres composantes et intérêts minoritaires doivent être déclarés applicables ou exclus avec justification/pièce ; les intitulés ne constituent pas une classification légale automatique.

L'index technique d'un PDF utilise une date de clôture et un montant nul pour les lignes de pages. Ces valeurs permettent son import dans le modèle commun ; elles ne désignent ni la date du PV ni le montant voté et n'entrent pas dans les calculs. Le registre de décisions et la lecture humaine citée fournissent ces faits.
