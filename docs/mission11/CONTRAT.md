# Mission 11 — contrat Capitaux propres `capitaux_propres.review@1.0.0`

> **Cohabitation (2026-10-09).** Une autre implémentation de la Mission 11 (Codex, PR #62 : `/equity`, `equity-dossier`, migration `0010_equity_dossier`) a été fusionnée dans `main` pendant la revue de la PR #63. À la demande du propriétaire, cette feuille est portée **à côté** d’elle, sans la modifier : branche `claude/capitaux-propres-cohabitation`, base `main` `5e49934`. Renommages :
> - fichiers `lib/workpapers/capitaux-*.ts`, `components/probant/capitaux-propres/`, `e2e/capitaux-propres.spec.ts` ;
> - procédure et règle `capitaux_propres.review@1.0.0` (programme `capitaux_propres.program`), champ `capitauxWork`, clé de mapping `capitaux` ;
> - migration `0012_capitaux_propres` (tables `eq_*` inchangées), drapeau `PROBANT_CAPITAUX_DURABLE`.
>
> Le moteur partagé `reviewEquity` et son contexte `equity.review` sont ceux de `main`, complétés de façon additive : ouverture ou clôture `null` = composante inconnue, capital ou réserves `null` = rapports inconnus. Les tests de la version Codex restent verts. Le produit compte donc deux feuilles Capitaux propres, à arbitrer.

Date : 2026-10-08. Base : `main` `b773f90` (PR #61 Immobilisations fusionnée ; Missions 07, 09 et 10 incluses ; Mission 08 encore sur `codex/mission07-security`). Validation **technique** d’un contrat de calcul interne : aucune règle juridique, comptable ou fiscale nouvelle, aucun seuil, aucun ratio présenté comme conclusion, aucune opinion.

Méthode interne (`authority: internal`) : la règle `capitaux_propres.review@1.0.0` complète le moteur existant `reviewEquity` (`lib/workpapers/equity.ts`) et le raccorde à des sources importées, qualifiées et approuvées : balance, écritures, tableau de variation fourni, registre des décisions, règlements et PV / actes en PDF versionnés.

Modifications du moteur, additives :
- contexte réel dédié (`assertEquityContext`, procédure `capitaux_propres.review`) ; la démonstration reste synthétique ;
- comparaison selon le contexte (`compareEquitySupported`) au lieu de la comparaison réservée à la démonstration ;
- une composante dont l’ouverture ou la clôture n’est pas établie reste **inconnue** (jamais nulle) ;
- capital ou réserves non établis : rapports inconnus, jamais calculés sur une partie ;
- mode du résultat tiré du contexte.

Les trois tests historiques `equity.test.ts` et l’atelier `demo-cycles` sont inchangés et verts.

## Questions professionnelles

1. Pour chaque composante, l’ouverture plus les mouvements de l’exercice reconstituent-ils la clôture ? (pont)
2. Le tableau de variation fourni par l’entité concorde-t-il, cellule par cellule, avec le tableau reconstitué ? (tableau)
3. Chaque décision à effet dans l’exercice a-t-elle une comptabilisation de même montant, et le paiement est-il présenté à part ? (décisions)
4. Chaque écriture d’une nature appelant une décision est-elle rattachée à une décision, et son effet tombe-t-il dans l’exercice ? (écritures)
5. Chaque décision est-elle appuyée par un PV versionné, lu à la page citée ? (PV)

Assertions **visées, non validées** (`validation: proposed`) :
- exhaustivité et exactitude des mouvements ;
- existence des décisions et séparation décision / comptabilisation / paiement.

**Non couverts :**
- régularité juridique (convocation, quorum, majorité, pouvoirs) ;
- règles propres à la forme sociale (réserve légale, capitaux propres inférieurs à la moitié du capital, conditions de distribution) ;
- qualification des autres fonds propres ;
- traitement comptable des événements postérieurs ;
- capital souscrit non appelé, actions propres, instruments composés.

## Cartographie des composantes (repère documentaire)

Rubriques du passif du modèle de bilan, de « Capital » à « Provisions réglementées », puis « Autres fonds propres », dans l’ordre du texte : capital, primes d’émission / fusion / apport, écarts de réévaluation, écart d’équivalence, réserve légale, réserves statutaires ou contractuelles, réserves réglementées, autres réserves, report à nouveau, résultat de l’exercice, subventions d’investissement, provisions réglementées, puis **autres fonds propres** (rubrique distincte). Le cycle n’est donc pas limité au compte 10.

| Champ | Valeur |
| --- | --- |
| Titre | Règlement n° 2024-07 du 6 décembre 2024 relatif à la distinction dettes – autres fonds propres, modifiant divers règlements de l’ANC (dont le règlement n° 2014-03 relatif au PCG) |
| Organisme | Autorité des normes comptables (ANC) |
| URL | https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/Reglements/2024/R2024-07/REGLT_2024_07_web.pdf (repère : https://www.anc.gouv.fr/plan-comptable-general-0) |
| Article | Art. 1er : à l’article 821-1 du PCG, le tableau du passif est remplacé ; art. 314-1 (composition des autres fonds propres) |
| Effet | Homologué par arrêté du 26 décembre 2025 (JO du 27 décembre 2025) ; exercices ouverts à compter du 1er janvier 2026, application anticipée possible (art. 6) |
| Consultation | 2026-10-08, texte PDF de l’ANC lu localement |

**Limites d’application :**
- La liste sert **uniquement** à cartographier et à présenter : chaque compte est rattaché à une composante **par la source** (colonne explicite), jamais déduit du numéro de compte.
- Aucune règle de traitement n’est tirée de ce texte.
- Le bloc « capitaux propres » a été relu dans la version issue du règlement 2024-07. La version applicable à l’exercice synthétique de recette (2024, antérieure) n’a pas été relue ligne à ligne : la carte reste un repère, pas une norme validée.
- La composition des autres fonds propres dépend de la version applicable. Ils sont donc listés et **exclus du total avec motif**.

Distinction des natures :
- obligation légale : aucune implémentée ;
- norme professionnelle : aucune encodée ;
- **méthode interne** : natures pour lesquelles la feuille recherche une décision ;
- **paramètre utilisateur** : rattachement des comptes, natures, dates d’effet, références de décision et de PV.

## Sources, champs et formats

Mapping fermé `equity-1` (CSV/XLSX, 3 Mio, colonnes nommées explicitement, signe ±1 par import, EUR). Une ligne = un montant, dans le **sens des capitaux propres** : un montant positif augmente la composante, un montant négatif la diminue. Le mapping inverse un export GL débit positif. Les PV ont un mapping `equity-minutes-1` sans colonne.

| Type | Contenu | Refus explicites (code + ligne / colonne / valeur) |
| --- | --- | --- |
| `eq_balances` (requis) | Une ligne par compte et par date (ouverture ou clôture) : compte, composante, libellé | date autre que l’ouverture ou la clôture, doublon compte / date, composante inconnue, compte rattaché à deux composantes |
| `eq_entries` (requis) | Écritures de l’exercice : compte, composante, nature, **date d’effet explicite**, décision citée (ligne du registre), transfert interne, pièce, libellé | date comptable hors exercice, montant nul, date d’effet absente, nature inconnue, transfert sur une nature non transférable, **transfert déséquilibré** (`EQ_TRANSFER_UNBALANCED`), transfert touchant les autres fonds propres, « autre » sans libellé |
| `eq_variation` (conditionnel) | Tableau fourni : une cellule (composante × colonne : `ouverture`, nature, `cloture`) | colonne inconnue, date incohérente, cellule en double |
| `eq_decisions` (conditionnel) | Registre transcrit des PV et actes : ligne, décision, type, composante, montant voté signé, date de décision (≤ revue), **date d’effet**, organe, PV cité, page, résolution, extrait | type inconnu, montant nul, décision après la revue, date d’effet absente, référence ou page mal formées |
| `eq_payments` (conditionnel) | Règlement : montant > 0, date ≤ revue, ligne de décision exécutée | signe, date, décision non citée |
| `eq_minutes` (conditionnel) | PV / acte PDF : référence de pièce (identique au registre), titre, date ≤ revue ; une ligne par page, comptée par le serveur | non PDF, signature absente, PDF illisible ou chiffré, 0 ou plus de 200 pages, doublon de pièce |

Une référence de PV **vide** n’est pas refusée : elle reste « PV absent » au calcul. Un compte présent dans la balance et les écritures doit appartenir à la même composante (`EQ_ACCOUNT_COMPONENT_INCONSISTENT`). Une ligne de GL couvrant deux décisions peut être ventilée : le pont par composante reste rapproché de la balance.

**Convention** `eq-sign-1`, validée par l’identité serveur qui fige les sources : sens des capitaux propres (crédit positif).

## Population, unité, période, exclusions

- **Unité :** **décision et mouvement** (`Population.unit = "decision_movement"`). Chaque ligne du registre (`D:`) et chaque écriture (`M:`) est un élément, mesuré à son montant signé.
- **Sélection :** tous les éléments. Les éléments des autres fonds propres sont exclus avec motif par le serveur, et la sélection est reproduite à l’exécution.
- **Période :**
  - date comptable des écritures dans l’exercice ;
  - **date d’effet explicite**, qui peut être hors période et est alors signalée ;
  - décisions, PV et règlements au plus tard à la date de revue (événements postérieurs visibles sur la frise).

## Calculs (serveur uniquement)

- **Pont par composante** (`reviewEquity`) : attendu = ouverture + mouvements ; **écart = clôture observée − attendu**. Composante incomplète : écart inconnu, total et rapports non calculés.
- **Transferts internes :** lignes de même référence, somme nulle exigée dès l’import ; effet sur le total affiché (0,00).
- **Tableau fourni ↔ reconstitué :** fourni − reconstitué par cellule ; une cellule absente du tableau fourni n’est pas lue comme nulle.
- **Décisions :**
  - comptabilisé = somme des écritures qui citent la ligne (même composante, même nature, ou décision « autre ») ;
  - **écart = comptabilisé − voté**, calculé seulement après **lecture validée** du PV à la page citée ;
  - paiement présenté à part.
- **Écritures :** une nature appelant une décision sans référence, ou citant une décision absente, est une « écriture sans décision » ; effet hors exercice signalé. Aucune décision n’est déduite d’un montant (E09 −4 n’est pas apparié à D4 −5).
- **Rapports :** capitaux propres / capital et réserves / capital, fractions exactes en centimes, sur le périmètre des comptes fournis. **Aucune conclusion juridique** (`legalConclusion` toujours inconnue).

## États et sens textuel

| Domaine | États |
| --- | --- |
| Composante | Calculée · Incomplète (compte, ouverture ou clôture absents) · Exclue (autres fonds propres) |
| Ligne de décision | Concordante · Montant divergent · Sans écriture · Lecture requise · Effet hors période · Postérieure à la clôture · Antérieure à l’exercice · Exclue |
| Écriture | Décision rattachée · Sans décision requise · Sans décision · Décision introuvable · Décision incohérente · Registre absent · Exclue |
| PV | Disponible · Absent · Page introuvable ; lecture validée · à valider · impossible |
| Contrôle | Exceptions détectées · Non concluant · Aucune exception sur le périmètre testé |

## Exceptions, preuves, jugement humain

- **Exceptions :** `BRIDGE_DIFFERENCE`, `STATEMENT_DIFFERENCE`, `DECISION_WITHOUT_ENTRY`, `AMOUNT_DIVERGENT`, `PAYMENT_WITHOUT_DECISION`, `ENTRY_WITHOUT_DECISION`, `ENTRY_DECISION_MISMATCH`, `EFFECT_OUTSIDE_PERIOD`.
- **Incertitudes :** `COMPONENT_INCOMPLETE`, `DECISIONS_SOURCE_MISSING`, `PV_MISSING`, `READING_PENDING`.

Chacune devient une note bloquante à l’exécution.

**Une décision humaine cite la pièce et la version :**
- **Lecture d’un PV :** le préparateur nomme la ligne et ce qu’il a vérifié ; le serveur résout la pièce, la version du document et la page. Modifier une lecture retire le résultat : nouvelle exécution requise.
- **Traitement d’une exception** (`resolve`) **et note de jugement ou d’anomalie validée :** citation obligatoire d’un document **figé** de la version (et d’une page pour un PV). Le serveur résout nom de fichier, empreinte et pièce. Une citation hors sources figées ou hors pages est refusée.
- **Revue :** par une **autre** identité ; verrouillage ensuite. Une revue documentée ne vaut ni conformité ni régularité juridique.

## Chaîne durable et sécurité

- **Stockage :** tables `eq_*` dédiées (migration `0012_capitaux_propres`, append-only par déclencheurs). Têtes de sources par type et **par pièce de PV** (`eq_minutes:<pièce>`).
- **Chaîne :** même modèle que Trésorerie et Immobilisations : import approuvé → population figée → lectures → exécution versionnée → soumission → revue distincte → verrouillage ; verrou de dossier, comparaison de version, idempotence liée à l’acteur et au contenu.
- **Péremption :** une source remplacée, retirée **ou ajoutée** (y compris un PV) rend la feuille périmée ; l’ancienne décision reste intacte et une révision est requise.
- **Routes :** `/api/workpapers/capitaux-propres` (lecture, commandes, téléchargement des originaux PV compris), `/imports` (CSV / XLSX ou PDF, quatre champs exactement), `/export`.
- **Activation :** `PROBANT_CAPITAUX_DURABLE=disposable`, refusée si `VERCEL_ENV=production`.

## Exemple synthétique de recette

Exercice 2024, revue au 31/03/2025, montants en EUR :

- **AGO du 30/05/2024** (PV-AGO-2024, 3 pages) :
  - affectation du résultat 2023 : résultat −70, réserve légale +2, report à nouveau +68 ; **transfert T1 neutre** ;
  - **distribution votée 30**, **comptabilisée 25**, **payée 25** : écart +5 après lecture page 3 ;
  - distribution exceptionnelle de 5 votée **sans écriture**.
- **AGE du 16/09/2024** : incorporation de 20 de réserves au capital (**T2 neutre**).
- **AGE du 12/12/2024** :
  - augmentation de 30 + prime de 10 à effet du 10/01/2025, comptabilisée en 2024 : **effet hors période** ;
  - **PV absent**.
- **E09** : distribution de 4 sur autres réserves **sans décision**.
- **AGO du 20/03/2025** : distribution postérieure, sans écriture attendue.
- **Tableau fourni :** distribution 30 et clôture du résultat 50, contre 25 et 55 reconstitués.

Totaux : 301 → 361. Rapports 361 / 150 et 26 / 150, **sans conclusion juridique**.

Variante « capital et réserves incomplets » : clôture du capital et réserve légale absentes de la balance. Composantes inconnues, total et rapports non calculés.
