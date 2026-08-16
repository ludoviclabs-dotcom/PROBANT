# TAX-01 — couverture du registre fiscal

## Objet et statut

Ce document décrit le registre de connaissance livré par TAX-01, vérifié le
16 août 2026. Le registre est exécutable au sens où ses JSON sont chargés, parsés
par Zod, validés sémantiquement et interrogeables. Il n'exécute aucun calcul
fiscal et ne crée aucun constat.

Les textes sont résumés en formulation originale. Les articles et paragraphes
sont référencés sans reproduction intégrale. Une notice ou un formulaire DGFiP
décrit une structure déclarative : il n'est jamais qualifié de loi et ne fonde
pas seul une règle obligatoire.

## Artefacts

| Couche | Emplacement | Contenu |
| --- | --- | --- |
| Sources | `data/tax/sources/official-sources.json` | Autorité, nature, URL canonique et aptitude à fonder une obligation |
| Versions | `data/tax/source-versions/official-source-versions.json` | Publication, effet, fin d'effet, statut et vérification |
| Formulaires | `data/tax/forms/form-vintages-2026.json` | Millésimes et cases utiles des 2058-A, 2058-B, 2033-B, 2065, CA3 et CA12 |
| Règles | `data/tax/rules/initial-rule-versions.json` | Versions déclaratives et spécifications de calcul non exécutées |
| Crosswalks | `data/tax/crosswalks/initial-crosswalks.json` | Liaisons cases–entrées et reports entre formulaires |
| Extensions | `data/tax/sources/extension-metadata.json` | C3S, CVAE, CFE et taxe sur les salaires, sans contrôle actif |
| Contrats | `lib/knowledge/tax-types.ts`, `tax-schemas.ts` | Modèles TypeScript et schémas Zod |
| Registre | `lib/knowledge/tax-registry.ts` | Chargement validé et requêtes par impôt, exercice et millésime |
| Garde-fous | `lib/knowledge/tax-validation.ts` | Validation normative, temporelle et de traçabilité |

## Hiérarchie d'autorité appliquée

| Nature | Usage dans le registre | Peut fonder seule une obligation ? |
| --- | --- | --- |
| Article du CGI sur Légifrance | Fondement normatif exact | Oui |
| BOFiP identifié et daté | Doctrine administrative et aide à l'interprétation | Oui seulement si la force et l'autorité déclarées restent cohérentes; les règles de ce lot l'utilisent principalement comme `interpretive` |
| Formulaire DGFiP | Cases, signes et relations du millésime | Non |
| Notice DGFiP | Aide de lecture du formulaire | Non |
| Page de service impots.gouv.fr ou URSSAF | Métadonnée et orientation | Non |
| Analyse secondaire | Contexte éventuel | Non; aucune n'est enregistrée dans le lot initial |

## Couverture IS

| Sujet | Référence officielle enregistrée | Couverture TAX-01 | Limitation |
| --- | --- | --- | --- |
| Résultat comptable vers résultat fiscal | CGI art. 38; 2058-A-SD 2026 | Structure d'entrées et relation de rapprochement `review_required` | Le formulaire décrit la relation; la qualification de chaque retraitement exige le dossier |
| 2058-A | Liasse 2050 à 2059-G 2026, page/tableau 2058-A | WA, WR, WS, XH, XI, XJ, XL, XN, XO | Date officielle de publication et date d'effet exactes du PDF non affichées dans l'artefact consulté |
| 2058-B | Même liasse, tableau 2058-B | K4, K4bis, K5, K6, YJ, YK, YN, YO | Le registre ne décide ni transfert ni droit au report |
| 2033-B | Liasse 2033 2026, tableau 2033-B | 312, 314, 316, 318, 322, 324, 352, 354, 360, 370, 372 | Les autres tableaux, dont le suivi détaillé 2033-D, ne sont pas encore structurés |
| 2065 | CGI art. 223; 2065-SD 2026 | Obligation déclarative et quatre localisateurs utiles | Certaines rubriques 2065 n'ont pas de code alphanumérique imprimé; elles reçoivent un localisateur sémantique explicite |
| Taux normal | CGI art. 219, I, deuxième alinéa | 25 % pour l'exercice 2026, source et période épinglées | Aucun calcul exécuté |
| Taux réduit | CGI art. 219, I-b | 15 %, plafond de 42 500 €, chiffre d'affaires et conditions de capital enregistrés | L'éligibilité doit être confirmée et tracée; aucun calcul exécuté |
| Déficits | CGI art. 209, I, troisième alinéa; 2058-B | Plafond légal de report en avant et roll-forward déclaratif séparés | Situations spéciales et changements d'activité hors périmètre |
| Charges et produits retraités | CGI art. 38 et art. 39 | Signal de qualification, sans classifieur automatique | Date de publication exacte de la version actuelle de l'art. 39 à confirmer |
| Provisions | BOI-BIC-PROV-20-10 du 12 septembre 2012 | Fiche interprétative et données requises | Aucune conclusion sans justificatifs et décision humaine |
| Amortissements | BOI-BIC-AMT-10-10 du 8 juin 2022 | Fiche interprétative et données requises | Aucun plan d'amortissement calculé |

Références principales : [CGI art. 38](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000051203585),
[CGI art. 209](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048847486),
[CGI art. 219](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000053542939),
[CGI art. 223](https://www.legifrance.gouv.fr/loda/article_lc/LEGIARTI000034387974),
[liasse 2050](https://www.impots.gouv.fr/formulaire/2050-liasse/liasse-fiscale-du-regime-reel-normal-en-matiere-de-bic-et-dis),
[liasse 2033](https://www.impots.gouv.fr/formulaire/2033-sd/liasse-bicsi-regime-rsi-tableaux-ndeg-2033-sd-2033-g-sd) et
[2065-SD](https://www.impots.gouv.fr/formulaire/2065-sd/impot-sur-les-societes).

## Couverture TVA

| Sujet | Référence officielle enregistrée | Couverture TAX-01 | Limitation |
| --- | --- | --- | --- |
| CA3 | 3310-CA3-SD 2026 | 08, 16, 19, 20, 22, 23, 25, TD, 27, 28, 32 | Relations `review_required`; aucune qualification transactionnelle |
| CA12 | 3517-S-SD 2026 | 16, 19, 20, 22, 23, 24, 26, 28, 29, 33, 51, 54, 56 | Régime simplifié et transition 2027 à revalider avant activation future |
| TVA collectée et exigibilité | CGI art. 269; BOI-TVA-BASE-20-10 | Règle de qualification temporelle, sans calcul | La nature de l'opération et les dates du dossier sont indispensables |
| TVA déductible | CGI art. 271; BOI-TVA-DED-40-20 | Conditions d'entrée et exigence de justificatif | Aucun coefficient, prorata ou exclusion complexe calculé |
| Factures | CGI art. 289; BOI-TVA-DECLA-30-20-10 | Obligation documentaire et données requises | Transition législative du 1er septembre 2026 non activée dans ce lot |
| Régimes et périodicités | CGI art. 287; BOI-TVA-DECLA-20-20-10-10 | Profil et période requis avant sélection | Le registre ne déduit jamais le régime à partir du seul FEC |

Références principales : [CGI art. 269](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000044983827),
[CGI art. 271](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000053545646),
[CGI art. 287](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048826856),
[CGI art. 289](https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000048827413),
[CA3](https://www.impots.gouv.fr/formulaire/3310-ca3-sd/tva-et-taxes-assimilees-regime-du-reel-normal-mini-reel) et
[CA12](https://www.impots.gouv.fr/formulaire/3517-s-sd/tva-et-taxes-assimilees-et-regime-simplifie).

## Extensions en métadonnées

| Impôt | Source officielle | Statut | Ce qui n'est pas disponible |
| --- | --- | --- | --- |
| C3S | [URSSAF — C3S](https://www.urssaf.fr/accueil/autre/contribution-c3s.html) | `metadata_only` | Règles légales versionnées par paragraphe, formule et contrôle |
| CVAE | [DGFiP — fiche CET/IFER 2026](https://www.impots.gouv.fr/sites/default/files/media/3_Documentation/depliants/pro_fiche_cet-ifer_2026.pdf) | `metadata_only` | Trajectoire législative complète et moteur millésimé |
| CFE | [BOI-IF-CFE-10-20-20](https://bofip.impots.gouv.fr/bofip/266-PGP.html/identifiant=BOI-IF-CFE-10-20-20-20260429) | `metadata_only` | Bases locales, délibérations, exonérations et contrôle |
| Taxe sur les salaires | [DGFiP — déclaration et paiement](https://www.impots.gouv.fr/professionnel/questions/comment-declarer-et-payer-ma-taxe-sur-les-salaires-ts) | `metadata_only` | Assujettissement, assiette, taux, périodicité et contrôle |

## Garanties du validateur

Le validateur sémantique refuse :

- une règle ou une référence vers une source/version absente ;
- une règle de taux sans date d'effet et sans exercice fiscal ;
- une case dont `formVintage` est absent ou différent du formulaire parent ;
- deux versions actives/futures d'un même `ruleCode` dont les périodes et portées se chevauchent ;
- une obligation fondée sur une source secondaire, une notice, un formulaire ou une simple page de service ;
- une formule sans expression, étapes, références de paragraphes et exigence de trace ;
- une version ou une règle future marquée `effective` à la date de validation.

Ces garanties portent sur l'intégrité du registre. Elles ne valident ni une
déclaration réelle, ni le bien-fondé fiscal d'une opération.

