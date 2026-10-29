# Registre documentaire et matrice de contrôle normative

Date de consultation : 16 octobre 2026. Ce registre guide la future implémentation ; il ne constitue pas une attestation de conformité. Les spécifications de produit, seuils techniques et hypothèses de recette sont internes, pas des exigences IFRS.

## 1. Hiérarchie des sources et accès réel

| ID | Source | Utilisation / état de lecture |
|---|---|---|
| S16 | [IFRS 16, texte IASB publié dans l’édition 2026](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs16.html) | Texte primaire ; passages relatifs aux exemptions, évaluation et suivi consultés ; l’édition « issued » peut contenir des dispositions à effet futur |
| S16-R | [IFRIC, taux d’emprunt marginal, septembre 2019](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/agenda-decisions/2019/ifrs-16-lessees-incremental-borrowing-rate-september-2019.pdf) | Décision d’agenda primaire lue ; ne pas confondre explication d’application et nouveau taux réglementaire |
| S16-D | [IFRIC Update, novembre 2019](https://www.ifrs.org/news-and-events/updates/ifric/2019/ifric-update-november-2019/) | Complément sur durée/conditions résiliables à relire dans le lot de qualification ; pas de « durée du bail français » déduite automatiquement |
| S18 | [IFRS 18, texte IASB publié dans l’édition 2026](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs18.html) | Texte primaire ; catégories, activités principales, MPM et transition consultées |
| S18-A | [IFRS Foundation, page officielle IFRS 18](https://www.ifrs.org/issued-standards/list-of-standards/ifrs-18-presentation-and-disclosure-in-financial-statements/) | Synthèse officielle : effet pour exercices ouverts à compter du 01/01/2027, application anticipée permise |
| UE18 | [Règlement UE 2026/338 du 13 février 2026](https://eur-lex.europa.eu/eli/reg/2026/338/oj) | Adoption identifiée dans l’index officiel ; restitution intégrale HTML/PDF bloquée par une vérification JavaScript dans cette session. Ne pas prétendre avoir contrôlé chaque paragraphe de l’annexe UE |
| UE16 | [Règlement UE 2023/1803, socle de compilation IFRS](https://eur-lex.europa.eu/eli/reg/2023/1803/oj) | Référence de départ, à relire dans sa version applicable et avec ses modifications ; non contrôlée intégralement pour ce dossier |
| FR26 | [ANC, Recueil PCG janvier 2026](https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/recueil/2026/Recueil-PCG-Janvier-2026.pdf) | Source primaire ; art. 212-5 relatif au crédit-bail vérifié p. 40 du PDF ; ne pas étendre ce seul article à toute comparaison PCG–IFRS |
| GUIDE | `Guide de formation Audit(1).pdf`, V1.0, passage 2.2 p. 14 du PDF et glossaire p. 18 | Source fournie, pédagogique : retraitements transactionnels et exemple IFRS 16 ; pas une spécification de calcul |
| REPO | [PROBANT à e25a4ad](https://github.com/ludoviclabs-dotcom/PROBANT/tree/e25a4adfe82aaf2249b4011603f1846beea7b970) | Code et métadonnées des PR #75–97 ; comportement existant, pas autorité normative |

Le lien UE16 est fourni comme référence à contrôler, non comme une lecture intégrale déjà effectuée. Réactualiser les textes, dates d’effet, éventuels rectificatifs, juridiction et amendements avant de valider un `RulePack`. L’accès public à une page n’accorde pas un droit général de redistribution du texte IFRS : conserver références, liens et paraphrases courtes, pas une copie massive du corpus sous licence dans l’application.

## 2. Matrice de lecture IFRS 16

| ID de contrôle proposé | Passage à lire | Exigence de travail dans le projet |
|---|---|---|
| L16-QUAL | S16 §9–16 et B9–B33 | Questionnaire et jugement sourcés, périmètre locatif isolé |
| L16-EXEMPT | S16 §5–8, annexe A, B3–B8 | Politique d’exemption qualifiée ; aucune exclusion sur seuil monétaire universel |
| L16-TERM | S16 §18–21, B34–B41 ; S16-D | Durée retenue et options justifiées ; limites V1 visibles |
| L16-RATE | S16 §26 ; S16-R | Nature, unité, date et justification du taux approuvé |
| L16-INITIAL | S16 §22–28 | Paiements et composantes initiales inventoriés, y compris celles exclues de V1 |
| L16-SUBSEQ | S16 §29–38 | Suivi, amortissement et charge d’intérêt ; coût et méthodes documentés |
| L16-CHANGE | S16 §39–46 | Détecter et bloquer les événements non couverts, pas les ignorer |
| L16-OUTPUT | S16 §47–60 et dispositions applicables de présentation | Sorties chiffrées et limites d’annexe ; pas de note exhaustive annoncée |
| L16-PCG | FR26, plan de comptes applicable et articles pertinents | Sources françaises distinctes ; 612/613 sont des indices de recherche, pas une règle d’exhaustivité |

L’exemple du guide évoque la valeur d’un bureau et des loyers sur cinq ans. La valeur du bureau ne constitue pas, à elle seule, la valeur de la dette ou du droit d’utilisation. Ne pas injecter ce montant dans le moteur sans lien avec les flux et composantes retenus. Un exemple numérique reste explicitement synthétique.

## 3. Matrice de lecture IFRS 18

| ID de contrôle proposé | Passage à lire | Exigence de travail dans le projet |
|---|---|---|
| P18-APPLY | S18 C1–C3 ; UE18 | Date, première application et base de comparaison explicites |
| P18-SCOPE | S18 §47–51 et B30–B41 | Qualifier les activités principales avant toute règle de classement |
| P18-CAT | S18 §47–68 et compléments B42–B76 | Classification documentée ; cas hors V1 détectés ; aucune catégorie déduite d’IAS 7 |
| P18-TOTAL | S18 §69–74 | Sous-totaux adaptés au profil couvert, montants signés et identités de somme testées |
| P18-NATURE | S18 §41–43, §75–85 | Agrégation/désagrégation et présentation par nature ; limites des champs et rubriques |
| P18-MPM-ID | S18 §117–120 et B113–B131 | Inventorier et qualifier les candidats MPM ; critères, exceptions et conclusion motivée |
| P18-MPM-NOTE | S18 §121–125, B132–B142 | Rapprochement, impôts, NCI, changements et comparatifs documentés |
| P18-TRANS | S18 C2–C6 | Réconciliation comparative annuelle par rubrique ; ne pas substituer une simple variation N/N-1 |

Le rapprochement annuel de transition concerne la présentation antérieure IAS 1 et la présentation IFRS 18 du comparatif. Il est distinct du pont de mesure PCG–IFRS. Les mesures de direction ne doivent pas être assimilées à tous les KPI ni classées sur leur nom commercial.

## 4. Fiche minimale d’une règle future

`ruleId`, version du moteur, texte et version source, paragraphe/page, URL, empreinte si obtenue licitement, date de consultation, juridiction, date d’effet, date de début d’exercice, profil d’entité, hypothèses, statut `review_required/validated`, auteur/date de revue, cas de référence et exclusions. Un lien stocké ou une édition chargée ne signifie pas une règle relue.

La validation des règles et celle d’un dossier sont deux validations différentes. Une règle revue ne prouve ni l’exhaustivité des contrats ni la qualité du jeu de données. Une relecture personnelle nommée est acceptable pour le projet local, avec cette qualification explicite ; elle n’est pas une revue professionnelle indépendante.

## 5. Portes de contrôle

Un accès bloqué ne se contourne pas et une source absente ne se remplace pas par une affirmation inventée. Pour une règle à effet réel, conserver le blocage ciblé jusqu’à lecture de la source applicable. Le développement des schémas, du rendu et des tests synthétiques peut continuer sans activer cette règle en mode réel.

Les prompts citent des paragraphes comme instructions de lecture. Ils ne dispensent pas l’agent de les ouvrir et d’en vérifier l’application au cas couvert. Aucune nouvelle règle française ne doit être attribuée à IFRS 16 ou 18 ; aucune extension fiscale, IAS 12, de consolidation ou de première adoption n’est implicitement autorisée.
