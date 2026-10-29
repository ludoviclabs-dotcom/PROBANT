# Sources lues pour IFRS 16 — lot C00

Consultation du 29/10/2026 (C00), complétée le même jour pour L16-01 et L16-02 (§ 1 et § 4). Ce registre dit ce qui a été **effectivement lu**, comment, et ce qui reste à lire. Il ne constitue pas une attestation de conformité. Il complète [`plan/03_SOURCES_ET_MATRICE_NORMATIVE.md`](./plan/03_SOURCES_ET_MATRICE_NORMATIVE.md) sans le réécrire.

**Licence.** Le texte des normes IFRS appartient à l'IFRS Foundation. Ce dépôt n'en garde que des références, des numéros de paragraphe et de courtes paraphrases, jamais une copie du corpus.

## 1. Sources et état de lecture

| ID | Source | État au 29/10/2026 | Passages lus | Empreinte |
|---|---|---|---|---|
| S16 | [IFRS 16, texte IASB, édition 2026 « issued »](https://www.ifrs.org/content/dam/ifrs/publications/html-standards/english/2026/issued/ifrs16.html) | Texte complet accessible sans connexion. Lu **par extraction outillée et paraphrase**, pas mot à mot | § 5-8, 9-11, 12-15, 18-24, 26-27, 29-33, 36-38, 39-46 (structure et portée), 47-50, 53, 58 ; annexe A (définitions du commencement, de la date de conclusion, de la durée, des paiements, des deux taux, du court terme, des paiements fixes, des coûts directs initiaux, des avantages incitatifs, de la période d'utilisation, de la garantie de valeur résiduelle) ; B3-B8 ; **B9-B33 (L16-01)** ; B34-B42 ; annexe C, C1 à C1E. Le § 27 porte une note éditoriale sur la décision IFRIC de septembre 2021 (TVA non récupérable sur les loyers) : la TVA non récupérable reste hors V1 (X21) | Page HTML, 238 287 caractères extraits |
| S16-R | [IFRIC, *Lessee's Incremental Borrowing Rate*, septembre 2019](https://www.ifrs.org/content/dam/ifrs/supporting-implementation/agenda-decisions/2019/ifrs-16-lessees-incremental-borrowing-rate-september-2019.pdf) | **Lue intégralement** (PDF d'une page, texte extrait localement) | Décision d'agenda complète | SHA-256 `f8b66fe2c3a4fe50c529450febc1c36355900be815383da5b0d473dafe5188c1` |
| S16-D | [IFRIC Update, novembre 2019](https://www.ifrs.org/news-and-events/updates/ifric/2019/ifric-update-november-2019/) | Lue par extraction outillée | Décision d'agenda finalisée « *Lease Term and Useful Life of Leasehold Improvements* » (réunion du 26/11/2019) | — |
| UE16 | [Règlement (UE) 2023/1803](https://eur-lex.europa.eu/eli/reg/2023/1803/oj) | **Non lu.** EUR-Lex renvoie une page vide : ELI et CELEX en C00, puis HTML et PDF CELEX le 29/10/2026 pour L16-02 (quatre essais). Accès non contourné | — | — |
| FR26 | [ANC, Recueil des normes comptables françaises, version du 1er janvier 2026](https://www.anc.gouv.fr/files/anc/files/1_Normes_fran%C3%A7aises/recueil/2026/Recueil-PCG-Janvier-2026.pdf) | Lu localement (`pypdf`), 662 pages | Art. 212-5, p. 40 du PDF ; liste des comptes 611 à 616, p. 519 | SHA-256 `ae21e019a6295beb7825f562643f67977cbcc0ec90ccab57f20cefcf0e105ec1` |
| KB | Base de connaissance du dépôt : `data/sources/ifrs.yml` (`ifrs-16`), `data/ifrs/standards.yml` (`ifrs-16`) | Lue | IFRS 16 `status: review_required` ; adoption UE marquée `endorsed` sur la foi du rapport EFRAG du 17/07/2026 (absence de la liste des textes non adoptés) | — |
| GUIDE | `Guide de formation Audit`, passage 2.2 | Non relu en C00 | Source pédagogique : ses exemples ne sont pas des paramètres | — |
| S18, S18-A, UE18 | Sources IFRS 18 du plan | **Non consultées** : C00 est restreint à IFRS 16 | — | — |

## 2. Ce que les passages lus établissent, et ce qu'ils n'établissent pas

| Sujet | Lecture (paraphrase) | Effet sur V1 |
|---|---|---|
| Exemptions (§ 5-8) | Le preneur peut écarter le modèle pour les contrats de courte durée et ceux portant sur des actifs de faible valeur ; la charge est alors linéaire ou systématique. L'élection court terme se fait par catégorie d'actif sous-jacent, l'élection faible valeur contrat par contrat | `exemption_documentee` exige une politique et son niveau d'application |
| Courte durée (annexe A) | Durée de 12 mois au plus au commencement ; un contrat avec option d'achat n'est pas de courte durée | X22 |
| Faible valeur (B3-B8) | Appréciation absolue sur la valeur à neuf, indépendante de la taille du preneur ; l'actif doit être utilisable seul ou avec des ressources facilement disponibles. Exemples : tablettes, ordinateurs, petit mobilier, téléphones. **Aucun seuil monétaire dans le texte** | Aucun seuil en code (X23) |
| Identification (§ 9-11) | Location = droit de contrôler l'utilisation d'un actif identifié pendant une période, moyennant contrepartie ; réévaluation seulement si les termes changent | R01. B9-B31 restent à lire en L16-01 |
| Composantes (§ 12-15) | Séparer les composantes locatives et non locatives, sauf si le preneur choisit, par catégorie d'actif, de les traiter comme une seule composante locative (§ 15) | X07 admet l'élection § 15 documentée |
| Durée (§ 18-21, B34-B41, S16-D) | Période non résiliable, plus les options raisonnablement certaines. Un contrat n'est plus exécutoire que si les deux parties peuvent résilier sans pénalité plus qu'insignifiante. L'IFRIC précise que la pénalité s'apprécie sur l'économie d'ensemble du contrat (coûts d'abandon d'agencements, par exemple), et que la durée d'utilité d'agencements non amovibles éclaire la durée exécutoire | Jugement humain documenté (R04). Aucune « durée de bail français » déduite automatiquement |
| Évaluation initiale (§ 22-24, 26-27) | ROU au coût : dette, plus paiements d'avance moins avantages, plus coûts directs initiaux et coûts de remise en état. Dette = valeur actualisée des paiements non versés, au taux implicite s'il est facilement déterminable, sinon au taux marginal. Paiements : fixes, variables indexés, garanties de valeur résiduelle, options d'achat raisonnablement certaines, pénalités de résiliation | R07, R08 ; X01 à X11 |
| Taux marginal (annexe A, S16-R) | Taux propre au contrat : durée, sûreté, montant et environnement économique semblables. Le profil de paiement n'est pas explicitement exigé, mais un taux observable de même profil est un point de départ cohérent, à ajuster | Nature, date, justification et preuve exigées (R05) |
| Suivi (§ 29-33, 36-38) | Modèle du coût ; amortissement selon IAS 16, jusqu'à la plus proche de la fin de la durée d'utilité et de la fin du contrat, sauf transfert de propriété ou option raisonnablement certaine ; dépréciation selon IAS 36. Intérêt à taux périodique constant sur le solde | R09, R10 ; X10, X14 |
| Changements (§ 39-46) | Réestimations : nouveau taux pour la durée ou l'option d'achat, taux inchangé pour l'indexation. Modifications : contrat distinct ou réévaluation. Mesure de simplification Covid-19 (46A-46B) | Tous bloqués en V1 (X12) |
| Présentation (§ 47-50) | Droit d'utilisation et dette présentés à part ou rattachés à leurs postes ; intérêts présentés séparément de l'amortissement (§ 49) ; principal des loyers en flux de financement (§ 50) | R13. § 49 est modifié par IFRS 18 (C1E, applicable avec IFRS 18) : à relire dans le lot IFRS 18 |
| Informations (§ 53, § 58) | Dotation par catégorie, intérêts, charges de loyers, sorties de trésorerie, entrées, valeurs nettes ; analyse des échéances de la dette séparée des autres passifs financiers (IFRS 7) | R14, en données préparatoires non exhaustives |
| Dates d'effet (annexe C) | C1 : exercices ouverts à compter du 01/01/2019. C1A à C1D : Covid-19 (2020, 2021), réforme des taux (2021), cession-bail (2024). C1E : modification du § 49 par IFRS 18, applicable avec IFRS 18 | `effectiveFrom: "2019-01-01"`. La cession-bail est hors périmètre |
| PCG (FR26) | Art. 212-5 : le titulaire d'un crédit-bail comptabilise en charges les sommes dues pour la période et n'inscrit l'immobilisation à l'actif qu'à la levée de l'option. Comptes 612 (redevances de crédit-bail : 6122 mobilier, 6125 immobilier), 613 (locations : 6132 immobilières, 6135 mobilières), 614 (charges locatives et de copropriété) | Explique l'écart de base PCG → IFRS. 612, 613 et 614 sont des **indices de recherche**, pas une règle d'exhaustivité. Les lignes 614 signalent d'éventuelles composantes non locatives (X07) |

## 3. Choix internes : jamais attribués à IFRS 16

Taux annuel effectif et conversion mensuelle ; borne de 120 mois ; calendrier au 1er du mois avec échéances en fin de mois ; virgule fixe à 40 décimales ; arrondi au centime moitié à l'opposé de zéro ; publication par soldes ; cumul d'amortissement arrondi ; comptes logiques du retraitement ; statuts de contrat ; seuil de précision 10⁻²⁰ €. Ce sont des conventions de PROBANT, enregistrées comme `internalPolicies` dans la fiche de règle (`CONTRAT_COMMUN.md` § 4.4).

## 4. État de la règle `ifrs16.leases` 1.0.0

La règle reste **`review_required`** (`validation: "provisional"`) : exécution réelle impossible, scénarios synthétiques possibles. État des quatre conditions au 29/10/2026, après L16-01 et L16-02 :

| Condition | État |
|---|---|
| 1. Relire mot à mot les paragraphes cités | **À faire par la relecture nommée.** Les paragraphes du moteur et de la qualification (§ 5-8, 18-27, 29-33, 36-38, annexe A, B34-B42) ont été relus le 29/10/2026, toujours par extraction outillée : cela ne vaut pas lecture mot à mot |
| 2. Lire B9-B33 | **Fait par extraction** le 29/10/2026 ; leurs critères sont repris par le dictionnaire (`identifiedAsset`, `controlOfUse`, `serviceComponents`). Lecture mot à mot comprise dans la condition 1 |
| 3. Lire le texte UE | **Non levée** (EUR-Lex vide). Seule la juridiction IASB est validable ; `EU_adopted` reste bloquée en réel (X33) |
| 4. Relecture personnelle nommée de la fiche | **À faire par l'utilisateur** : [`REVUE_REGLE_IFRS16.md`](./REVUE_REGLE_IFRS16.md), consignée dans `lib/ifrs/leases/rule-review.ts` |

## 5. Versé dans la base de connaissance (L16-02, 29/10/2026)

- Dans `data/sources/ifrs.yml` : `ifric-ad-2019-09-ibr` (S16-R) et `ifric-ad-2019-11-lease-term` (S16-D).
- Dans `data/ifrs/standards.yml`, entrée `ifrs-16` : passages lus, date de consultation et les deux décisions comme sources secondaires. Son statut reste `review_required` ; il ne passe à `verified` qu'après les conditions du § 4.
- `docs/knowledge/REVIEW_REQUIRED.md`, lu par les tests de la base de connaissance, est à tenir à jour en même temps.
