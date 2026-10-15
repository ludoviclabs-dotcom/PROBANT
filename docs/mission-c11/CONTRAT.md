# C11 — Contrat : événements transversaux Clients, achats, cut-off et TVA

Date : 15 octobre 2026. Base `main` `300829b` (PR #91). Lot de consolidation C11 : fiabiliser les événements transversaux **existants**, sans ouvrir de moteur fiscal ni de règle d'âge universelle. Aucune écriture, aucune TVA calculée, aucune opinion.

## 1. Ce que le lot change

| Avant (base `300829b`) | Après |
|---|---|
| La grille de cut-off ne citait aucun texte : ni l'exercice, ni ANC 2026-03, ni son champ contractuel. | `analyzeCutoff` 1.1.0 cite le texte français applicable (`resolveCutoffRule`, résolveur C04) : édition de l'exercice, ANC 2026-03 seulement s'il est obligatoire ou anticipé **et**, pour une vente, si le contrat est conclu ou renouvelé après le 04/09/2026. Contrat non daté ou daté du jour de l'entrée en vigueur : non concluant dans la chaîne réelle. |
| Un avoir à cause antérieure produisait une « FAE » ou une « FNP » négative. | Avoir à établir (AAE, 4198) ou à recevoir (AAR, 4098), convention signée conservée ; cause postérieure : sans effet ; avoir enregistré avant sa cause : à expliquer. Factures : grille inchangée. |
| Le résolveur C04 ne datait pas le champ contractuel d'ANC 2026-03 (Légifrance 403) et marquait le recueil PCG 2024 « inaccessible ». | Arrêté d'homologation lu : entrée en vigueur le **04/09/2026** ; recueil 2024 lu (empreinte identique à C06) ; sujet `cutoff` ajouté (articles de rattachement par édition) ; `contractualApplicability()`. |
| Clients et ventes, Achats / RPNE et TVA ne partageaient aucun événement ; `/cutoff` ne montrait que les feuilles Achats. | Carte des événements transversaux (`buildTransversalEventMap`, opération `events`) : une identité, toutes les observations, une frise des dates, un effet compté une fois (C05), une procédure suggérée (C03), les dépendances d'invalidation. |
| Date de facture, livraison, comptabilisation, paiement, clôture et période TVA confondues dans une frise à quatre points. | Frise par événement : facture, livraison ou prestation (ou cause de l'avoir), comptabilisation, encaissements / paiements, avoirs, clôture, exigibilité ou droit à déduction, période TVA observée, revue — chacune avec son rôle. |
| TVA : taux constatés seulement, exigibilité « à qualifier ». | Qualification **fermée** de l'exigibilité (vente) et du droit à déduction (achat) pour deux catégories : livraison de biens et prestation de services en France ; option pour les débits documentée par facture. Tout autre cas : information requise. Taux toujours descriptif. |
| Procédure et assertions C03 de la règle Revenu formulées en « transfert du contrôle » (vocabulaire IFRS 15) ; scénario STARTUP-CA-1 parlant de « CCA ». | Référentiel français : livraison ou réalisation de la prestation (PCG 512-4, ANC 2026-03 522-2 s'il régit le contrat) ; produits constatés d'avance (487). Procédures et assertions AAE / AAR ajoutées. |

## 2. Dates de raisonnement d'un événement

| Date | Source dans la chaîne réelle | Sert à |
|---|---|---|
| Facture (ou avoir) | Ligne `payables_invoices` / `cutoff_sales`, ou facture ouverte `clients_invoices` | Disponibilité à la clôture ; débit (option) |
| Livraison ou prestation (cause de l'avoir) | `payables_performance` | Fait générateur comptable ; exigibilité des biens |
| Comptabilisation | `payables_recognition` (≤ clôture) | Montant déjà rattaché ; débit chez le vendeur |
| Encaissements / paiements | Affectations validées `clients.sales` (après clôture) ou RPNE | Exigibilité des services ; droit à déduction ; résidu par clé |
| Clôture, revue | Période de la feuille | Rattachement ; fenêtre post-clôture |
| Période TVA | Feuille `tva.reconciliation` dont une écriture porte la pièce | Période observée, comparée à la période d'exigibilité |

Comptabilisation, exigibilité et encaissement restent trois dates distinctes ; aucune ne remplace l'autre.

## 3. Carte événement → procédures → sources → effets

| Événement | Procédures qui l'observent | Sources | Effet |
|---|---|---|---|
| Vente de cut-off (FAE / PCA / AAE) | `payables.purchases` et `payables.rpne` (analyse de l'événement), `clients.sales` (solde ouvert, sans candidat) | `cutoff_sales`, `payables_performance`, `payables_recognition`, `payables_adjustments`, `clients_*` | Un effet HT sur le résultat, une fois |
| Achat (FNP / CCA / AAR) | `payables.purchases` (écriture testée, sinon analyse), `payables.rpne` (ligne de paiement) | `payables_invoices`, `payables_performance`, `purchases_ledger`, `payables_recognition`, `payables_adjustments`, `payables_payments` | Un effet HT sur le résultat, une fois |
| Facture ouverte à la clôture | `clients.sales` | `clients_invoices`, `clients_payments`, `clients_credits` | Aucun effet : solde clôture fixe, reste à la revue, résidu par clé |
| Écriture de TVA | `tva.reconciliation` | `fx_fec`, `fx_vat_return` | Aucun effet : période observée seulement |

Règles de compte : une observation **périmée** reste visible mais ne compte pas. Quand une procédure a **testé** l'événement (écriture d'achat, paiement ultérieur alloué), ses lignes concluent : une ligne non concluante (fenêtre incomplète, paiement groupé non ventilé) **suspend** l'effet, comme la synthèse Achats de la Mission 08 ; sans ligne de procédure (vente de cut-off, facture hors population testée), l'analyse de l'événement vaut candidat technique. Un « déjà rattaché » ou « hors période » face à un candidat rend l'événement **divergent** (montant inconnu) ; deux candidats de nature ou de montant différents aussi. Une feuille périmée ne fournit aucune valeur courante : ses faits de facture (dates, montants, nature, option, date de contrat), ses soldes ouverts, ses avoirs, ses règlements et ses écritures TVA restent visibles comme observations, sources et dépendances, mais ne réduisent aucun reste, ne qualifient aucune exigibilité et ne datent aucune période TVA observée. Chaque observation porteuse d'un candidat devient un constat C05 d'identité explicite égale à l'événement : les répétitions exactes sont comptées une fois. Le bilan (418, 408, 4198, 4098) est TTC seulement si le candidat porte sur toute la base de la facture ; une part non rattachée n'est jamais proratisée.

Règlements : seules les affectations **validées** et non annulées réduisent un reste ; une proposition n'affecte rien ; un règlement groupé, un acompte, un reliquat ou un paiement annulé restent en « règlements globaux », sans répartition. L'échéance absente reste absente : l'âge depuis la facture n'est ni un retard ni un taux de dépréciation.

## 4. Dépendances d'invalidation

| Source modifiée | Partie touchée | Effet |
|---|---|---|
| Facture (`payables_invoices`, `cutoff_sales`) | rattachement, TVA, règlements | Périme les feuilles Achats / RPNE qui l'ont figée ; base, nature, option, date de contrat relues |
| Livraison / prestation | rattachement, TVA | Candidat et exigibilité des biens à reprendre ; règlements inchangés |
| Comptabilisation, régularisations | rattachement | Candidat à reprendre ; TVA et règlements inchangés |
| Paiements RPNE et affectations | règlements, TVA | Résidu TTC et droit à déduction des services ; candidat HT inchangé |
| `clients_*` et affectations | règlements, TVA | Reste par clé et exigibilité des services ; solde de clôture fixe |
| `fx_fec`, `fx_vat_return` | TVA | Période observée ; candidat et règlements inchangés |
| Référentiel C04 (texte, option, contrat) | rattachement | Texte cité ; vente sous ANC 2026-03 sans contrat daté : non concluant à la prochaine exécution |

Chaque événement porte aussi ses sources ligne à ligne avec les parties qu'elles alimentent, et ses feuilles avec leur état (courante ou périmée). La version antérieure d'une feuille et ses preuves ne sont jamais réécrites : la carte lit la dernière version **exécutée** de chaque racine (Achats, Clients et TVA par la même règle), la périme si une révision ou version plus récente existe, même en préparation, et ne lit jamais deux révisions d'une même feuille comme courantes.

## 5. Qualification TVA couverte

| Catégorie | Vente : exigibilité | Achat : droit à déduction |
|---|---|---|
| Livraison de biens meubles corporels en France | À la livraison ; acompte préalable : à son encaissement, à concurrence (269, 1-a et 2-a ; BOI-TVA-BASE-20-10 § 1, § 65) | À l'exigibilité chez le fournisseur : livraison ou acompte payé (271, I-2) |
| Prestation de services en France, sans option | À chaque encaissement (269, 2-c ; BOI-TVA-BASE-20-20 § 30) ; non encaissé à la revue : exigible à l'encaissement futur, sans date | Au paiement (271, I-2) |
| Prestation de services, option pour les débits | Au débit (inscription au compte client), ou à l'encaissement s'il le précède (BOI-TVA-BASE-20-50-10 § 20, § 70) | Information requise : la date de débit chez le fournisseur n'est pas connue de l'acheteur |

Information requise : nature non fournie ou « autre » (intracommunautaire, importation, exportation, autoliquidation, immeubles, décomptes successifs, électricité et gaz…), option non documentée, livraison étalée, avoir (réduction de TVA, CGI 272 et 267 non lus), encaissements inconnus pour les services, date non couverte. **Couverture** : une date n'est qualifiée que si le registre fiscal ET la version lue la couvrent (§ 7). Encaissements « complets » seulement si la facture est soldée par des affectations validées ; sinon la qualification est partielle et la réserve est dite (un acompte antérieur non documenté rendrait une part exigible plus tôt). CFE, CVAE et cotisations : aucun taux, aucune qualification dans ce lot.

## 6. Chaîne réelle

- Trois colonnes **facultatives** du mapping `payables-investigation-1` sur les factures : `natureColumn` (goods / services / other), `debitOptionColumn` (yes / no / unknown), `contractDateColumn` (date). Absentes : « non fournies ». Valeurs hors liste ou date après la revue : refusées à l'import. L'empreinte d'entrée d'un événement ne change que si la date de contrat est fournie.
- `GET /api/workpapers/payables?operation=events` : mêmes droits et activation que la chaîne Achats ; lit les feuilles `fx_*` seulement si `PROBANT_FISCAL_DURABLE` est actif (sinon « Feuilles TVA non lues »). Les faits (dates, qualification) sont relus dans les imports **figés** de chaque feuille ; candidat et montant viennent de son résultat stocké.
- Aucune option d'anticipation n'est sourcée dans la chaîne réelle : ANC 2026-03 n'y est jamais réputé anticipé.

## 7. Sources lues le 15/10/2026

| Texte | Lecture | Articles / § utilisés |
|---|---|---|
| PCG, recueil au 01/01/2024 (ANC) | PDF, 677 p., SHA-256 `f608f78f…82479303` | 511-3, 512-3, 512-4, 513-3, 513-4 ; 944-40 (408), 944-41 (418, 4191), 944-48 (486, 487) |
| ANC 2022-06 (homologué) | PDF, 106 p., `aeaa05cf…` | 1214-40, 1214-41, 1214-48 |
| PCG consolidé au 01/01/2026 | PDF, 183 p., `b9e7a732…` | 511-3, 512-3, 512-4, 513-3, 513-4, 1214-40, 1214-41, 1214-48 ; nomenclature 4098, 4198, 44587 |
| ANC 2026-03 (homologué) | PDF, 10 p., `59330e81…` | 511-3, 521-4, 522-2, 522-3, 522-5 à 522-7, 522-11, 522-12 ; art. 4 (exercices, anticipation, contrats) |
| Arrêté du 12/08/2026 (JORF n° 0205 du 03/09/2026, NOR ECOT2617843A) | Légifrance, navigateur | « Entrée en vigueur : l'arrêté entre en vigueur le lendemain de sa publication » |
| CGI art. 269 (LEGIARTI000044983827) | Légifrance | Version en vigueur depuis le 01/01/2023 (loi 2021-1900, art. 30) ; 1-a, 2-a, 2-c ; abrogée au 01/01/2027 (ordonnance 2025-1247), option pour les débits maintenue jusqu'à sa reprise réglementaire |
| CGI art. 271, I-2 | Légifrance (version au 15/01/2026 et version en vigueur) | Rédaction identique du 31/12/2023 au 21/02/2026 et depuis le 21/02/2026 |
| BOI-TVA-BASE-20-10 (21/12/2022) | BOFiP | § 1, § 65 |
| BOI-TVA-BASE-20-20 (07/11/2018) | BOFiP | § 30 |
| BOI-TVA-BASE-20-50-10 (12/09/2012) | BOFiP | § 20, § 40, § 50, § 70 |

**Écarts constatés dans le registre fiscal (non corrigés ici)** : `cgi-art-269-v2022-01-01` porte « du 01/01/2022 au 31/08/2026 », alors que Légifrance donne une version en vigueur depuis le 01/01/2023 et une abrogation au 01/01/2027 ; `cgi-art-271` n'a qu'une version depuis le 21/02/2026, alors que la rédaction du I-2 est identique depuis le 31/12/2023. Corriger ces fenêtres changerait la couverture du moteur TVA (TAX-06) et la recette Mission 13 : c'est un lot distinct. La qualification C11 s'arrête donc au plus tôt du registre et de la lecture : art. 269 jusqu'au 31/08/2026, art. 271 à partir du 21/02/2026.

## 8. Limites restantes

- Acomptes encaissés **avant** la clôture : aucune source dans la chaîne réelle (`clients.sales` ne lit que l'après-clôture) ; la qualification des biens et des débits reste alors partielle, réserve affichée. La recette les fournit par une fixture.
- Cause datée d'un avoir post-clôture : non sourcée dans `clients_credits` ; l'événement reste « information requise ». Les avoirs ne sont pas importables comme événements de cut-off (factures positives seulement dans la chaîne Mission 08).
- Option d'anticipation d'ANC 2026-03 : non sourcée ; profil TVA de qualification (territoire, option pour les débits au niveau du dossier) : déclaré par facture seulement.
- Aucune règle de prix variables, contrats à long terme, droits de retour (522-4 à 522-10, 523-x) ; aucune TVA sur avoirs (272, 267).
- Les constats C05 de la carte ne sont pas versés dans la Synthèse du dossier (lot C14).
