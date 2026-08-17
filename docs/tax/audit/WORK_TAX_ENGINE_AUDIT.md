# Executive verdict

Verdict : OBJECTIF_PARTIELLEMENT_ATTEINT  
Distance avec un véritable Tax Review Engine utilisable : Importante.

FACT — PROBANT contient un noyau fiscal crédible : modèles canoniques, profils à trois états, règles structurées, calcul IS borné, réconciliations TVA/CFE, sorties prudentes, explications et paquet de preuve de démonstration. Dans le dossier de démonstration 2026, il évite notamment le faux raisonnement compte FEC donc réintégration certaine, ne présume pas le taux réduit quand le profil est inconnu, et ne confirme pas le droit à déduction de TVA sans pièce.

FACT — la production ne transforme toutefois pas les données d’un utilisateur en résultat fiscal. La page fiscalité appelle directement un dossier fictif construit en mémoire. Les actions de revue sont uniquement dans l’état React du navigateur et ne réexécutent pas le moteur. La chaîne document réel vers contrôle persisté vers finding vers décision humaine vers export probant est donc conçue dans le code, mais non observée comme fonctionnalité opérationnelle.

Les qualifications de ce rapport sont strictes :

- FACT — observé directement dans le code, l’UI de production, GitHub ou Vercel.
- SOURCE — établi par une source officielle identifiée.
- INFERENCE — déduction prudente à partir des faits.
- RECOMMENDATION — action proposée.
- UNVERIFIED — non vérifiable dans le périmètre.

# Périmètre observé

| Élément | Observation |
|---|---|
| Dépôt et branche | FACT — ludoviclabs-dotcom/PROBANT, branche main, commit audité a4b32d05377b5fdd0f7c30bda9e749e83302e946. Aucune branche ou PR n’a été fournie ; l’audit ne couvre pas une autre révision. |
| Production | FACT — https://probant.vercel.app/ sert ce commit au moment de l’audit. Les erreurs runtime agrégées Vercel sur 7 jours étaient nulles. Cela ne valide ni les règles fiscales ni les parcours non exercés. |
| UI fiscalité | FACT — la page production fiscalité affiche DEMO SA, exercice 2026, waterfall IS, rapprochements IS/TVA/CFE, données manquantes, revue et exports. |
| Données affichées | FACT — app/dashboard/fiscalite/page.tsx appelle getDemoTaxCockpitSource(). lib/tax/demo/demo-dossier.ts construit des entrées fictives et précise l’absence de persistance. |
| API fiscale de dossier | FACT — aucune route API fiscale dédiée n’a été observée. Les routes dossier inspectées couvrent notamment uploads, FEC, jobs, snapshots et revue générique. |
| Preview Vercel | UNVERIFIED — aucune URL de preview n’a été fournie. |
| CI | FACT — les checks GitHub du commit incluent lint, typecheck, test et build réussis, plus tests de fixtures et migrations. Ce résultat ne constitue pas une validation fiscale indépendante. |

# Architecture observée

## Promesse / architecture prévue versus implémentation observée

| Promesse | Implémentation observée |
|---|---|
| Données comptables + fiscales + profil + référentiel versionné | FACT — modèles TaxProfile, TaxPeriod, documents, champs, exécutions, rapprochements, ajustements et snapshots dans lib/tax et migrations Drizzle. FACT — le parcours production fiscal utilise seulement le dossier démo en mémoire. |
| Contrôles exécutables | FACT — catalogue de 9 contrôles, planner déterministe, moteurs IS/TVA/CFE. INFERENCE — aucune orchestration de dossier réel importé, planifié, exécuté et persisté n’est livrée sur le parcours observé. |
| Calcul IS | FACT — moteur IS détaillé, centimes entiers, barème structuré, rapprochements déclaratifs et comptables, périmètre explicite. |
| Constats et niveau de preuve | FACT — taxonomie de sorties et forces de preuve utilisées par le moteur et le cockpit démo. INFERENCE — pas de matérialité durable sur documents réels. |
| Données manquantes et travaux | FACT — planner et recommandations déterministes génèrent limitations et demandes de documents/profil. |
| Décision humaine append-only | FACT — tables et hash-chain existent. FACT — TaxReviewPanel conserve les événements dans un useState client ; un refresh les efface. |
| Synthèse, preuve, export | FACT — package JSON/CSV/HTML/PDF/manifeste construit côté client pour la démo. INFERENCE — lien opérationnel persistant Finding, synthèse, document, décision et export non démontré. |

## Composants examinés

FACT — modèles et schémas : lib/tax/canonical.ts, lib/tax/schemas.ts, lib/tax/canonical-model/tax.ts.  
FACT — moteur IS : lib/tax/corporate-tax/engine.ts, types.ts, liasse.ts, waterfall.ts, findings.ts, arithmetic.ts.  
FACT — moteur TVA : lib/tax/vat ; CFE : rapprochement sans recalcul local complet.  
FACT — connaissance : data/tax/rates/is-rate-schedules.json, data/tax/forms/form-vintages-2026.json, lib/knowledge/tax-*.ts.  
FACT — UI/démo : app/dashboard/fiscalite/page.tsx, lib/tax/demo/demo-dossier.ts, components/tax-cockpit.  
FACT — persistance projetée : lib/tax/repository.ts, lib/tax/postgres-repository.ts, drizzle/0002 à 0004.  
FACT — preuve/revue : lib/evidence/tax-package.ts, lib/evidence/tax-review.ts, TaxReviewPanel.tsx.  
FACT — tests : TVA, planner, modèles et release gate avec golden cases synthétiques sous lib/tax/release.

# Sources et règles

## Référentiel et temporalité

FACT — les structures de connaissance portent autorité, nature, éditeur, URL canonique, version, publication, dates d’effet, millésime, statut et date de vérification. La couverture temporelle refuse le fallback vers une règle la plus proche.

FACT — le barème IS est machine-readable, choisi par exercice/millésime, et non défini dans l’UI. Les calculs utilisent basis points, centimes entiers et arrondi déterministe.

FACT — un seul schedule IS, 2026, a été observé. Les dossiers 2025 ou 2027 se bloquent faute de schedule au lieu de recevoir un taux courant ; c’est prudent mais non utilisable multi-exercices.

FACT — les millésimes 2026 2058-A, 2058-B, 2033-B, 2065, CA3 et CA12 sont marqués review_required dans form-vintages-2026.json. readDeclarationBoxes et getTaxFormVintage les rendent néanmoins utilisables par le calcul sans exiger effective.

INFERENCE — une référence explicitement non homologuée peut donc influencer une conclusion fiscale ; le statut de gouvernance est contourné au point d’exécution.

FACT — certaines recherches du registry utilisent une date de vérification fixe du 16 août 2026, différente de la période du dossier.

RECOMMENDATION — une règle ou un formulaire review_required doit rester visible mais bloquer le calcul normatif jusqu’à promotion versionnée, sourcée et auditée en effective.

## Sources officielles vérifiées

| Sujet | Source officielle | Conséquence |
|---|---|---|
| Taux IS | SOURCE — [CGI, article 219](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000046868562), [BOFiP IS-LIQ-20-10](https://bofip.impots.gouv.fr/bofip/2062-PGP.html/identifiant%3DBOI-IS-LIQ-20-10-20230621) | FACT — 25 %, 15 %, 42 500 € et 10 M€ du schedule 2026 correspondent aux références vérifiées. |
| Déficits | SOURCE — [CGI, article 209](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048847486) | FACT — le plafond général de 1 M€ + 50 % de l’excédent est codé. |
| TVA déductible | SOURCE — [CGI, article 271](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053545646) | FACT — le moteur demande des factures et n’infère pas le droit à déduction sur FEC seul, ce qui est cohérent. |
| CA3 | SOURCE — [3310-CA3-SD, millésime 2026](https://www.impots.gouv.fr/formulaire/3310-ca3-sd/tva-et-taxes-assimilees-regime-du-reel-normal-mini-reel) | FACT — le millésime officiel existe ; UNVERIFIED — chaque mapping de case PROBANT. |
| CA12 | SOURCE — [3517-S-SD, millésime 2026](https://www.impots.gouv.fr/formulaire/3517-s-sd/tva-et-taxes-assimilees-et-regime-simplifie) | FACT — le millésime officiel existe ; UNVERIFIED — chaque mapping de case PROBANT. |
| Liasse | SOURCE — [liasse réel normal](https://www.impots.gouv.fr/formulaire/2050-liasse/liasse-fiscale-du-regime-reel-normal-en-matiere-de-bic-et-dis) et [2033-SD](https://www.impots.gouv.fr/formulaire/2033-sd/liasse-bicsi-regime-rsi-tableaux-ndeg-2033-sd-2033-g-sd) | UNVERIFIED — audit case à case des 2058-A/B, 2033-B et 2065 contre PDF/notices. |

# Tax Engine

## Tax Profile

FACT — le profil représente régime IS/TVA, dates, groupes, CA, capital, détention, établissements et paramètres vérifiés.  
FACT — true, false et unknown sont distincts. Capital ou détention unknown empêchent de conclure au taux réduit ; le moteur renvoie une limitation plutôt qu’une hypothèse.  
FACT — le planner transforme les inconnues en demandes de profil/documents.  
LIMITATION / FACT — aucun parcours utilisateur réel de création, confirmation, historique et sélection d’un profil fiscal n’a été observé.  
INFERENCE — modèle solide, intégration produit prototype.

## Formulaires fiscaux

| Formulaire | Metadata | Parser réel | Modèle canonique | Input calcul | Rapprochement | UI | Evidence |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2058-A | FACT oui | UNVERIFIED / non observé | FACT oui | FACT oui | FACT oui | FACT démo | FACT démo |
| 2058-B | FACT oui | UNVERIFIED / non observé | FACT oui | FACT partiel | FACT partiel | FACT indirect démo | FACT démo |
| 2033-B | FACT oui | UNVERIFIED / non observé | FACT oui | FACT oui, borné | FACT oui | FACT démo | FACT démo |
| 2065 | FACT oui | UNVERIFIED / non observé | FACT oui | FACT rapprochement | FACT oui | FACT démo | FACT démo |
| CA3 | FACT oui | UNVERIFIED / non observé | FACT oui | FACT oui | FACT oui | FACT démo | FACT démo |
| CA12 | FACT oui | UNVERIFIED / non observé | FACT oui | FACT oui | FACT oui | FACT démo | FACT démo |

FACT — le processeur explicitement observé pour ces éléments est demo-fixture. Les migrations OCR/champs relus ne prouvent pas l’extraction de fichiers réels ni sa mise en production.

# Vérification

## Contrôles catalogue

Le catalogue explicite contient neuf définitions. Les 25 contrôles exécutés du cockpit mélangent ces définitions avec des sorties internes de moteurs ; le dénominateur doit être renommé.

| Contrôle | Classe | Test et données | Règle, période, version | Preuve | Conclusion maximale |
|---|---|---|---|---|---|
| IS.RECONCILIATION.2058A | RECONCILIATION | Cases 2058-A, profil, période | Mapping millésime + calcul IS | Liasse acceptée, champs utilisables | Cohérence/écart arithmétique, non qualification légale autonome |
| IS.RECONCILIATION.2033B | RECONCILIATION | 2033-B, profil, période | Mapping 2033-B | Liasse acceptée | Écart, sous réserve de cases non lisibles |
| IS.RATE.REDUCED.ELIGIBILITY | REQUIRES_EXTERNAL_EVIDENCE | CA, capital, détention, groupe | Schedule IS, art. 219 | Profil confirmé et pièces societaires | Éligible, non établie ou inconnue ; jamais présumée |
| IS.COMPUTATION.RESULT_AND_TAX.2058A | DETERMINISTIC + RECONCILIATION | 2058-A/B, 2065, FEC IS optionnel | Formules et schedule exacts | Déclarations et FEC pour écarts | Calcul borné et différence, pas fraude/non-conformité confirmée |
| IS.COMPUTATION.RESULT_AND_TAX.2033B | DETERMINISTIC + RECONCILIATION | 2033-B, 2065, profil | Mapping simplifié | Déclarations acceptées | Calcul borné ; blocage si déductions indisponibles |
| CFE.NOTICE.RECONCILIATION | RECONCILIATION | Avis CFE, comptes | Avis/période | Avis et comptabilité | Écart d’avis, pas recalcul CFE |
| VAT.FORM.CA3.RECONCILIATION | RECONCILIATION | FEC, CA3, profil | Mapping CA3/période | FEC et CA3 | Cohérence/écart, pas droit à déduction certain |
| VAT.FORM.CA12.RECONCILIATION | RECONCILIATION | FEC, CA12, profil | Mapping CA12/période | FEC et CA12 | Cohérence ou manque |
| VAT.DEDUCTIBLE.SUPPORT | REQUIRES_EXTERNAL_EVIDENCE | FEC et pièces | Article 271 | Factures/justificatifs | Inconclusif ou demande de preuve, jamais déduction confirmée par FEC seul |

FACT — sorties TVA additionnelles observées : TVA nette, collectée/déductible, bases et TVA par taux, CA3/CA12, crédit, autoliquidation, comptes TVA anormaux, pièces manquantes/doublons, décalage de période et taux inhabituel.

| Famille moteur | Classe | Conclusion maximale |
|---|---|---|
| Bases, TVA théoriques, TVA nette, rapprochement déclaration | RECONCILIATION | Écart chiffré ou concordance comptable-déclarative |
| Taux inhabituel, compte anormal, doublon, décalage, écriture sans pièce | ANALYTICAL_SIGNAL | Signal à examiner, non dette fiscale établie |
| Pièce TVA déductible absente | REQUIRES_EXTERNAL_EVIDENCE | Information insuffisante / demande de facture |
| Candidat de retraitement issu du FEC | ANALYTICAL_SIGNAL | Candidat visible, exclu du résultat retenu |
| Inputs insuffisants | NOT_CONCLUSIVE | missing_information, inconclusive ou review_recommendation |

## Réintégrations et déductions

FACT — CorporateTaxLedgerObservation transforme comptes/libellés en candidats, jamais directement en ajustements confirmés.  
FACT — un ajustement confirmé doit posséder source, preuve et événement de revue ; le moteur refuse une confirmation fondée sur le seul ledger.  
FACT — le candidat de 3 000 € du dossier démo reste hors chaîne retenue et n’altère pas le résultat fiscal de 505 650 €.  
FACT — les statuts de calcul sont surtout candidate et confirmed. Un cycle utilisable proposed puis dismissed/rejected, persistant et avec effet de calcul, n’est pas observé.  
INFERENCE — les totaux importés de 2058-A sont appelés confirmed parce qu’ils viennent de la déclaration. Ils doivent être distingués d’une qualification juridique confirmée par un réviseur.  
CONCLUSION — le garde-fou contre compte X donc non déductible est bon ; la boucle décision humaine/provenance durable est incomplète.

# Calcul

## Chaîne IS

| Étape | Inputs et formule | Manque / limite |
|---|---|---|
| Résultat comptable | 2058-A WA/WS ou 2033-B | FACT — blocage si manque, pas de zéro implicite |
| Réintégrations | WR/mapping + ajustements confirmés | FACT — FEC candidat séparé ; qualification exhaustive non modélisée |
| Déductions | XH/mapping + ajustements confirmés | FACT — limitation si les déductions ne sont pas lisibles |
| Résultat avant déficits | Arithmétique en centimes | FACT — perte distincte de zéro |
| Déficits imputables | Déclaré + stock + plafond | FACT — cycle de stock incomplet |
| Base imposable | Plancher à zéro | FACT — explicite |
| Ventilation des taux | 15 % prouvé, solde 25 % | FACT — unknown ne devient pas éligible |
| IS brut | Somme de tranches | FACT — arrondi déterministe |
| Déclaration | 2058 et 2065 | FACT — rapprochement, pas conformité certaine |
| Comptabilité | Charge/dette FEC | FACT — différence expliquable par crédits/contributions |

FACT — le moteur exclut explicitement groupe fiscal, Pillar Two, contributions exceptionnelles, crédits complexes, intérêts/pénalités et plusieurs cas particuliers. Cette délimitation est saine seulement si elle est toujours visible et bloquante.

## Taux d’IS

FACT — taux, seuils et règles sont des données structurées avec source et version, pas des chaînes UI.  
FACT — aucun fallback de taux le plus proche ; schedule exact par exercice/millésime.  
FACT — conditions observées : CA, capital libéré, détention, groupe, période. unknown reste unknown.  
FACT — dossiers 2025/2027 : UNSUPPORTED_RATE_SCHEDULE.  
CONCLUSION — versionnement mécanique bon ; couverture effective insuffisante.

## Déficits

FACT — ouverture K4 et transfert K4bis de 2058-B sont lus lorsque présents ; imputation 2058-A comparée au plafond.  
FACT — absence de stock/imputation ne devient pas zéro ; dépassement devient un signal, sans substitution silencieuse.  
FACT — les cases 2058-B K5, YJ et YK sont déclarées dans le référentiel mais non utilisées pour vérifier intégralement imputation, déficit de période et clôture.  
INFERENCE — la relation stock initial + déficit période - imputation = stock final n’est pas réellement contrôlée. Origine/millésime des déficits, report en arrière, changement d’activité ou de contrôle et autres exceptions ne sont pas gérés.  
CONCLUSION — calcul du plafond MVP, pas gestion robuste de stock fiscal.

# Réconciliation

FACT — la démo rapproche résultat avant/après déficits, bases normal/réduit et IS brut. L’écart de charge IS de 24 850 € est affiché comme incohérence comptable-déclarative, non comme non-conformité.

FACT — la TVA collectée est comparée. La TVA déductible est non disponible sans factures ; l’UI distingue donc absence de preuve et montant nul.

FACT — CFE se limite à rapprocher l’avis ; base locative, taux local et délibérations sont explicitement hors modèle.

INFERENCE — ces rapprochements sont utiles pour une revue, mais non accessibles à un vrai dossier utilisateur dans le flux observé.

# Détection

FACT — taxonomie : passed, confirmed_non_compliance, reconciliation_difference, potential_tax_risk, missing_information, inconclusive, review_recommendation.  
FACT — le moteur IS MVP exclut confirmed_non_compliance ; les écarts restent prudents.  
FACT — direct, derived, corroborated et insufficient sont des forces de preuve exploitées dans les moteurs et l’UI démo.  
FACT — le cockpit démo montre 21 passed, 1 difference, 1 missing information, 2 inconclusive/review recommendation et 0 anomalie confirmée.  
INFERENCE — la taxonomie est réellement fonctionnelle dans la démo, pas seulement une enum ; elle n’est pas encore prouvée sur données réelles persistées.

# Couverture

FACT — le planner distingue eligible, not applicable, missing inputs, ready, running, concluded, inconclusive et failed.  
FACT — il génère des demandes de 2058-A/2033-B/2065/CA3/CA12/avis, profil et facture par conditions déterministes.  
INFERENCE — le libellé 25 contrôles exécutés confond contrôles catalogue et sorties internes.  
RECOMMENDATION — publier des dénominateurs distincts : éligibles, non applicables, impossibles faute de données, planifiés, exécutés, conclus et non conclus. Ne jamais résumer en aucune anomalie lorsque rien n’a pu être exécuté.

# Explicabilité

## Chaîne de preuve

| Remontée | Évaluation | Motif |
|---|---|---|
| UI vers snapshot, réconciliation, finding démo | PARTIAL | FACT — montants, catégorie, limitation, méthode et hash sont affichés/exportables |
| Finding vers TaxControlExecution, règle versionnée, source | PARTIAL | FACT — modèles et références existent ; INFERENCE — la démo ne persiste pas l’exécution |
| Source vers input, document réel, ligne/case, pièce durable | BROKEN pour le produit réel | FACT — données démo, demo-fixture, pièces/revue non persistées |
| Chaîne de preuve de démonstration | PARTIAL | FACT — manifeste et hashes existent ; LIMITATION — pas dossier client durable |

## Frontière autorité / conclusion

FACT — hardLaw, methodology et internal désignent la nature de la règle et sont séparés de taxType, outcome, evidence strength et severity.  
FACT — le rapprochement charge IS est méthodologique et qualifie ses limites.  
INFERENCE — la séparation est saine. Le terme confirmed appliqué à un total déclaré reste à clarifier.

# Analyse proposée

| Proposition | État | Évaluation |
|---|---|---|
| Fournir 2058-A/2033-B/2065/CA3/CA12/avis | OPERATIONAL dans la démo | FACT — dérivée des entrées manquantes du planner |
| Confirmer capital, détention, régime, période, CA | OPERATIONAL dans la démo | FACT — dérivée de unknown, sans présomption |
| Rattacher facture TVA | OPERATIONAL dans la démo | FACT — dérivée de l’absence de justificatif |
| Examiner écriture, écart, taux inhabituel | PARTIAL | FACT — signal/demande déterministes ; pas de work item persistant assigné |
| Corriger puis recalculer/clôturer | MISSING | FACT — une revue ne réinjecte pas un input validé dans le moteur |

# UX

FACT — la démo sépare décision, calcul, analyse et exploration ; waterfall, tableaux, méthodes, sources, états non disponibles et actions sont lisibles.  
FACT — l’utilisateur voit profil, période, documents, montants, écarts, limitations et action suivante.  
FACT — actions observées : confirmer, écarter, demander preuve, corriger, remplacer, non applicable, inconclusif, attacher pièce.  
FACT — aucune action rouvrir n’a été observée ; l’historique fiscal est client-only.  
INFERENCE — malgré le label DEMO, l’UI peut faire croire qu’un dossier est chargé/sauvegardé car elle affiche actions et exports de production.  
RECOMMENDATION — afficher près des actions/export l’état de persistance, l’origine des documents, le dernier snapshot et les limites de périmètre.

## Infographies

| Visualisation | Évaluation | Motif |
|---|---|---|
| Accounting vers Tax waterfall | USEFUL | Explicite ajustements, déficits, taux, candidats exclus |
| Tax control coverage | USEFUL | Critique si dénominateurs et impossibilités sont séparés |
| Tax risk matrix | OPTIONAL | Peut suggérer une probabilité non calculée |
| Tax reconciliation | USEFUL | Montre un écart sans le transformer en faute |
| Tax missing data panel | USEFUL | Transforme l’inconclusif en tâche |
| Evidence graph | USEFUL | À condition que chaque lien mène à une pièce réelle |
| Tax rule timeline | OPTIONAL | Utile au multi-millésime, secondaire avant ingestion/persistance |

# Evidence

FACT — la toolbar offre JSON, CSV, HTML, PDF, manifeste et vérification ; PDF standard, sans validation PDF/A annoncée.  
FACT — le package démo inclut profil, période, calculs, rapprochements, findings, règles/sources, limitations, revue et hashes selon le format.  
FACT — attacher une pièce lit le fichier dans le navigateur et calcule des métadonnées/hash ; aucun upload serveur n’est observé dans ce flux.  
INFERENCE — bon démonstrateur de dossier de preuve, non export fiscal final durable d’un client.  
UNVERIFIED — stockage immuable, signature, conservation, accès multi-utilisateur, horodatage opposable, récupération après session.

# Review

FACT — migrations et fonctions prévoient événement de revue / hash-chain avec contraintes dossier/organisation.  
FACT — TaxReviewPanel emploie un tableau React et un acteur reviewer-demo, sans appel de persistance dans le flux observé.  
FACT — une décision ne réexécute pas l’IS et ne transforme pas durablement un candidat en ajustement confirmé/écarté.  
CONCLUSION — fondation append-only pensée : oui ; workflow fiscal append-only opérationnel : non.

# Exports

| Capacité | État |
|---|---|
| JSON, CSV, HTML, PDF, manifeste, vérification hash | FACT — disponibles pour la démo et construits côté client |
| Profil, période, sources, versions, calculs, constats, limitations, décisions, hashes | FACT — présents à divers degrés dans le package démo |
| Dossier client durable et pièces référencées | UNVERIFIED / non observé |
| PDF/A, scellement, archivage, piste d’audit après refresh | UNVERIFIED / non observé |

# Tests

FACT — tests de schémas, planner, repository, moteur TVA et release gate observés.  
FACT — 10 golden cases IS et 11 TVA synthétiques : zéro ajustement, réintégration, déduction, perte, déficit, taux réduit prouvé/non prouvé, liasse incohérente, charge IS divergente, CA3/CA12, facture manquante, avoir, crédit, autoliquidation, période décalée, régime TVA inconnu.  
FACT — CI GitHub du commit audité réussie.  
INFERENCE — bon socle de non-régression du comportement implémenté, non preuve de mapping officiel exhaustif, d’extraction de documents réels, de règles 2025/2027 ou de persistance/reprise après revue.  
RECOMMENDATION — ajouter cas anonymisés réels, PDF/OCR corrigés, mutation tests de règles/millésimes, et tests de chaîne de preuve durable.

# Matrice de maturité

Échelle : 0 absent ; 1 concept/documentation ; 2 prototype ; 3 fonctionnel borné ; 4 robuste ; 5 proche production.

| Capacité | Note | Justification |
|---|---:|---|
| Ingestion comptable | 2 | FEC/modèles/fixtures existent ; liaison tax cockpit réelle non observée |
| Ingestion fiscale | 1 | Metadata/canonical model ; parser réel non observé |
| Tax Profile | 2 | Schéma robuste ; parcours dossier réel absent |
| Registre fiscal | 3 | Sources/règles structurées, coverage ; couverture limitée |
| Versionnement | 3 | Sélection bornée ; seulement 2026 et forms review_required actives |
| Control Planner | 3 | Déterministe ; non orchestré sur dossier réel |
| IS calculation | 3 | Fonctionnel dans scope démo 2026 |
| Deficits | 2 | Plafond et unknown ; stock/origine incomplets |
| Reduced rate | 3 | Conditions et inconnues correctement gérées |
| Tax reconciliation | 3 | IS/TVA/CFE utiles, démo-only |
| Tax Findings | 2 | Taxonomie/factory ; persistence end-to-end non observée |
| Evidence strength | 3 | Exploitée ; documents réels non intégrés |
| Coverage | 3 | Planner/UI ; dénominateurs à clarifier |
| Missing data handling | 4 | Refus de conclure et actions très bons |
| Review workflow | 1 | Éphémère, pas de recalcul |
| Synthesis integration | 2 | Modèles prévus, chaîne opérationnelle non démontrée |
| Evidence chain | 2 | Manifeste/hash démo, pas dossier réel |
| Exports | 2 | Multi-format démo client |
| UX | 3 | Lisible, frontière démo/persisté insuffisante |
| Visualisations | 3 | Utiles, dépendantes de la vraie chaîne |
| Tests métier | 3 | Structurés, majoritairement synthétiques |
| Golden cases | 3 | Bon socle, pas validation exhaustive |
| Explainability | 3 | Forte en démo, incomplète sur pièces/décisions réelles |

# Objectif initial vs résultat réel

| Question | Réponse | Motif |
|---|---|---|
| PROBANT sait-il vérifier ? | PARTIAL | Oui pour relations bornées de démo ; non comme service des données utilisateur |
| Sait-il calculer ? | YES_WITH_LIMITATIONS | IS 2026 structuré, scope étroit, forms non homologuées, déficits partiels |
| Sait-il rapprocher ? | YES_WITH_LIMITATIONS | IS/TVA/CFE prudents, démo-only |
| Détecte-t-il sans sur-interpréter ? | YES_WITH_LIMITATIONS | Bons garde-fous FEC/TVA ; sémantique confirmed à corriger |
| Sait-il dire qu’il ne sait pas ? | YES_WITH_LIMITATIONS | unknown/missing/inconclusive réels ; pas workflow durable |
| Propose-t-il la prochaine analyse ? | YES_WITH_LIMITATIONS | Recommandations déterministes, sans suivi ni recalcul |
| Peut-on comprendre et vérifier pourquoi ? | YES_WITH_LIMITATIONS | Très lisible dans la démo, pas traçable durablement aux pièces réelles |

# Gaps

1. FACT — page fiscale production = dossier démo en mémoire, pas dossier utilisateur.
2. FACT — formulaire review_required utilisable dans le calcul.
3. FACT — déficits sans cycle de stock complet ni origine.
4. FACT — revue éphémère, sans réouverture ni effet de recalcul.
5. FACT — planner, exécution, finding, synthèse, preuve et export non démontrés dans une même chaîne persistée.
6. INFERENCE — ces gaps empêchent toute confiance suffisante dans une conclusion sur les propres données d’un client.

# P0 / P1 / P2 / P3

| Priorité | Problème | Impact utilisateur | Impact métier | Fichiers/modules concernés | Complexité | Dépendances | Critère de sortie |
|---|---|---|---|---|---|---|---|
| P0 | Cockpit démo sans ingestion/exécution réelle | Ne peut fournir ses données | Promesse principale non livrée | page fiscalité, demo, API dossier, ingestion, postgres repository | Élevée | Auth, stockage, DB, parsers | Dossier réel produit plan, exécutions et snapshot persistés sans données démo |
| P0 | Forms review_required utilisées | Calcul sur mapping non homologué | Risque fiscal/gouvernance | form-vintages, declaration-reading, registry | Moyenne | Homologation et sources | Non effective bloque toute conclusion normative, promotion auditée |
| P0 | Revue client-only sans rerun | Décisions/pièces perdues | Pas de piste d’audit | TaxReviewPanel, review, APIs, DB, moteur | Élevée | Identité, DB, storage | Événement durable, reopen, pièce hashée, décision liée au finding, nouveau snapshot |
| P0 | Déficits incomplets | Imputation/stock non vérifiables | Risque IS direct | engine IS, liasse, 2058-B, golden cases | Élevée | Règles d’exception et inputs | Ouverture + période - imputation = clôture, origine/millésime, limitations/tests |
| P0 | Chaîne planner/exécution/finding/evidence incomplète | Couverture ambiguë | Cockpit non fiable | planner, repository, models, cockpit, exports | Élevée | P0 ingestion/persist | Chaque résultat lié à TaxControlExecution durable, métriques distinctes |
| P1 | Parsers réels non observés | Upload non vérifiable | Risque de mapping manuel | processors, ingestion, declaration reading | Élevée | OCR/revue/source docs | Formulaire importé produit case/page/confiance/revue avec tests PDF |
| P1 | Pas de couverture IS 2025/2027 | Années hors service | Non déployable portefeuille | schedules, registry, source coverage | Moyenne | Veille/homologation | Version effective exacte 2025-2027 ou blocage documenté |
| P1 | Cycle candidat/proposé/confirmé/écarté incomplet | Revue non aboutie | Confusion déclaration/hypothèse/décision | adjustments, review, engine, UI | Moyenne | P0 review/rerun | États, auteur, preuve, règle et effet de calcul visibles |
| P1 | Export démo navigateur | Dossier non récupérable | Conservation insuffisante | tax package, API export, storage | Moyenne | P0 persistence | Export serveur immuable par snapshot, manifest vérifiable et pièces liées |
| P2 | UX démo/persistence et dénominateurs ambigus | Surconfiance | Adoption/risque réviseur | cockpit | Faible à moyenne | P0 data chain | État réel visible, métriques de couverture drill-down |
| P2 | Corpus de tests synthétique | Régressions de mapping | Risque fiscal évolution | release, fixtures, CI | Moyenne | P1 parsers | Cas réels anonymisés, mutation tests, certification de règles |
| P3 | Groupes, crédits, Pillar Two, CFE local complet | Couverture élargie | Extension marché | engines/registry/profile | Très élevée | P0-P2, données externes | Chaque extension a scope, preuve, tests d’or |

# Verdict final

OBJECTIF_PARTIELLEMENT_ATTEINT — distance Importante.

FACT — PROBANT dépasse une maquette visuelle : il incarne un futur noyau de Tax Review Engine, particulièrement prudent sur les inconnues, la TVA déductible et les candidats de retraitement.

FACT — il n’est pas encore observé comme produit capable de prendre les propres données d’un utilisateur et de les mener jusqu’à une décision/revue/export durable et vérifiable.

INFERENCE — la distance est importante non parce que le calcul est absent, mais parce que les maillons qui rendent un calcul défendable professionnellement — ingestion réelle, versions homologuées, persistance, décisions à effet, déficits complets et chaîne de preuve — ne sont pas opérationnels ensemble.

RECOMMENDATION — ne pas présenter PROBANT comme Tax Review Engine opérationnel avant clôture des P0. Positionnement fidèle aujourd’hui : démonstrateur avancé d’un noyau de Tax Review Engine, avec moteurs IS/TVA/CFE bornés et explicables, non prêt pour dossiers fiscaux réels.
