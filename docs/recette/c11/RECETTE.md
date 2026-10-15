# Recette C11 — Clients, achats, cut-off et TVA

Date : 15 octobre 2026. Attendus posés à la main **avant** l'exécution, à partir des textes lus le même jour (voir `docs/mission-c11/CONTRAT.md`, § Sources). Ils sont rejoués par `lib/workpapers/__tests__/c11-transversal-events.test.ts`, qui exécute le vrai moteur de cut-off (`analyzeCutoff`, contexte réel Achats), la carte des événements, la projection C05 et le résolveur C03.

## Dossier de recette

- Exercice **non calendaire** : ouvert le 01/04/2025, clos le **31/03/2026**, revue au **15/05/2026**, EUR, période confirmée.
- Texte comptable attendu : l'exercice est ouvert après le 01/01/2025 et avant 2026 → **ANC 2022-06** (art. 27), articles du PCG 511-3, 512-3, 512-4, 513-3, 513-4 et commentaires des comptes 1214-40 (408), 1214-41 (418, 4191), 1214-48 (486, 487). ANC 2026-03 : **non applicable** (exercice clos avant la publication du 03/09/2026, donc ni obligatoire ni anticipable).
- TVA : feuilles mensuelles de mars et d'avril 2026. Les dates de la recette (mars à mai 2026) sont couvertes par le registre (CGI 269 jusqu'au 31/08/2026 ; CGI 271 depuis le 21/02/2026) **et** par les versions lues. Taux constatés : 20 % sur chaque facture, présentés comme constat descriptif.
- Montants HT / TVA / TTC séparés ; un avoir est signé négativement (convention Mission 08).

## Cas et attendus

Légende des sources fiscales : 269-2-a = CGI 269, 2-a ; 269-2-c = CGI 269, 2-c ; 271 I-2 = CGI 271, I-2 ; BOI biens = BOI-TVA-BASE-20-10 § 1 et § 65 ; BOI débits = BOI-TVA-BASE-20-50-10 § 20 et § 70.

| # | Événement | Faits sourcés | Attendu comptable | Attendu fiscal (TVA) | Pont et C03 |
|---|---|---|---|---|---|
| 1 | Livraison mars / facture avril — vente de biens, client C1, facture F-101 | Livraison 25/03/2026 ; facture du 02/04/2026, non disponible à la clôture ; 1 000,00 HT / 200,00 TVA / 1 200,00 TTC ; rien en produit avant clôture, aucune FAE | **FAE 1 000,00 HT** (produit) ; 418 : **1 200,00 TTC** ; TVA 44587 : 200,00 | Exigible à la **livraison du 25/03/2026** (269-2-a, BOI biens § 1). Aucun encaissement documenté : un acompte antérieur rendrait une part exigible plus tôt → **partiellement qualifiée**. Période d'exigibilité : **mars 2026** ; période observée : **avril 2026** (écriture F-101) → décalage **« plus tard »** | Observée par Achats et RPNE (même identité) → **un effet +1 000,00** ; C03 : **R-ME-003** « Rattachement des produits non encore facturés » |
| 2 | Facture mars / prestation avril — vente de services, C2, F-102 | Facture du 20/03/2026 comptabilisée le 20/03 en produit 2 000,00 HT / 400,00 / 2 400,00 ; prestation réalisée le 10/04/2026 ; option pour les débits : non ; ouverte à la clôture 2 400,00 ; encaissement de 2 400,00 le 25/04/2026, affectation validée | **PCA 2 000,00 HT** (487, sans TVA) | Exigible à l'**encaissement du 25/04/2026** pour 2 400,00 TTC (269-2-c) → **qualifiée** ; période **avril** ; observée **mars** → **« plus tôt »** (TVA observée avant son exigibilité) | Achats + RPNE (candidat) + Clients et ventes (solde ouvert, sans candidat) → **un effet −2 000,00** ; reste à la revue 0,00 ; C03 : **R-PCG-PCA** |
| 3a | Service encaissé ultérieurement — C3, F-103, sans option | Prestation et facture du 15/03/2026, comptabilisée le 15/03 : 3 000,00 / 600,00 / 3 600,00 ; encaissement 3 600,00 le 20/04/2026 | **Déjà rattaché** (aucun candidat) | Exigible à l'**encaissement du 20/04/2026** (269-2-c) → qualifiée ; **avril** ; observée **mars** → **« plus tôt »** | Aucun effet ; aucune procédure proposée |
| 3b | Même service, **option pour les débits documentée** — C4, F-104 | Mêmes montants et dates ; option « oui » d'après la facture ; débit (comptabilisation) le 15/03/2026 | **Déjà rattaché** | Exigible au **débit du 15/03/2026** (269-2-c, BOI débits § 20 et § 70) → qualifiée ; **mars** ; observée **mars** → **« même période »** | Aucun effet |
| 4 | Acompte — vente de biens, C5, F-105 | Acompte de 1 200,00 TTC encaissé le 28/03/2026, comptabilisé en 4191 (aucun produit) ; livraison et facture le 12/04/2026 : 5 000,00 / 1 000,00 / 6 000,00 ; solde 4 800,00 encaissé le 30/04/2026 ; encaissements affectés et validés | **Aucune différence** (livraison après la clôture, rien en produit) | **1 200,00 TTC exigibles le 28/03/2026** (acompte, 269-2-a, BOI biens § 65) et **4 800,00 TTC le 12/04/2026** (livraison) → **qualifiée** ; première période **mars** ; observée **avril** → **« plus tard »** | Aucun effet. Variante 4b (acompte enregistré en produit 1 000,00 HT avant clôture) : **PCA 1 000,00 HT** |
| 5a | Avoir post-clôture à cause antérieure — C6, AV-106 | Retour du 28/03/2026 ; avoir émis le 08/04/2026 : −500,00 / −100,00 / −600,00 ; rien comptabilisé avant clôture | **Avoir à établir −500,00 HT** (709 ; 4198 : 600,00 TTC ; 44587 : 100,00) | **Information requise** : la réduction de TVA sur avoir n'est pas une catégorie couverte | **Un effet −500,00** ; C03 : **R-PCG-AAE** |
| 5b | Avoir post-clôture sans cause datée — C7, F-107 (Clients et ventes) | Ouverte à la clôture 1 800,00 TTC ; avoir postérieur de 300,00 le 15/04/2026, appliqué | **Non évalué** : aucune source de livraison, cause de l'avoir non datée → information requise | Information requise (nature de l'opération non fournie) | Solde clôture **1 800,00 fixe**, reste à la revue **1 500,00** ; aucun effet |
| 6 | Fournisseur hors période — S1, FS-201 | Prestation du 05/04/2026 ; facture du 06/04/2026 : 800,00 / 160,00 / 960,00 ; non comptabilisée ; paiement 960,00 le 30/04/2026, affectation validée ; option fournisseur : non | **Hors période justifié** (aucune différence) | Droit à déduction au **paiement du 30/04/2026** (271 I-2 + 269-2-c) → qualifiée ; **avril** ; observée **avril** → **« même période »** | Aucun effet |
| 7a | Règlement partiel d'un paiement groupé — S2, FS-202 | Livraison du 20/03/2026 ; facture du 03/04/2026 : 1 000,00 / 200,00 / 1 200,00 ; non comptabilisée, sans FNP ; paiement groupé P-202 de 1 800,00 le 25/04/2026, dont 1 200,00 affectés à FS-202 | **FNP 1 000,00 HT** (charge) ; 408 : **1 200,00 TTC** ; 44586 : 200,00 | Droit à déduction à la **livraison du 20/03/2026** (271 I-2 + 269-2-a) → qualifiée (facture soldée par affectation validée) ; **mars** ; non observée dans les feuilles TVA → non comparable | Achats (analyse) + RPNE (ligne « candidat omission ») → **un effet −1 000,00** ; règlement global P-202 : **reliquat 600,00 non réparti** ; C03 : **R-PCG-FNP** |
| 7b | Encaissement partiel — C8, F-108 (Clients et ventes) | Ouverte 1 000,00 TTC ; encaissement 300,00 affecté le 20/04/2026 ; échéance absente | Non évalué | Information requise (nature non fournie) | Reste **700,00** : ni perte, ni dépréciation ; âge depuis facture, aucun retard |
| 8 | Source ultérieure incomplète — S3, FS-203 | Prestation du 30/03/2026 ; facture du 10/04/2026 : 400,00 / 80,00 / 480,00 ; non comptabilisée ; paiement P-203 de 200,00 le 10/05/2026 affecté ; fenêtre RPNE **incomplète** | Candidat technique **FNP 400,00 HT** sur l'événement, **suspendu** : la RPNE, seule procédure qui teste l'événement, est non concluante (fenêtre non couverte) → **non concluant, aucun effet** | Droit à déduction : **200,00 TTC au 10/05/2026**, reste des paiements non tous documentés → **partiellement qualifiée** | **Aucun effet** ; information « source ultérieure incomplète » ; aucune procédure proposée |

## Pont C05 attendu (résultat)

| Poste × sens | Détecté (avant déduplication) | Répétitions exactes | Exposition initiale |
|---|---|---|---|
| Résultat · augmentation | 2 000,00 (FAE 1 000,00 × 2 observations) | 1 000,00 | **1 000,00** |
| Résultat · diminution | 6 500,00 (PCA 2 000,00 × 2 ; AAE 500,00 ; FNP 1 000,00 × 2) | 3 000,00 | **3 500,00** |

Contrôle : 1 000,00 + 3 500,00 = effets comptés une fois ; **7 observations** porteuses d'un candidat retenu (FAE × 2, PCA × 2, AAE × 1, FNP × 2) pour **4 effets** (cas 1, 2, 5a, 7a). Aucun montant d'impôt n'est appliqué (qualification fiscale inconnue, aucun taux générique).

Corrections consignées pendant le lot (15/10/2026), avant toute livraison :

1. La première rédaction annonçait « 9 observations, 6 effets » pour un pont de 6 900,00 : erreur de décompte relevée par l'exécution (le tableau donnait 8 et 5).
2. **Attendu du cas 8 révisé** : il retenait d'abord l'effet FNP 400,00 en jugeant que la RPNE non concluante « ne contredit pas » le candidat. La relecture a montré que cette règle compterait aussi le paiement groupé G de la Mission 08, que la synthèse Achats ne retient pas, son contrat posant qu'une allocation incomplète reste non concluante. Règle retenue, appliquée aux deux cas : quand une procédure teste l'événement, ses lignes concluent ; une ligne non concluante suspend l'effet. Le pont passe de 6 900,00 / 3 900,00 à 6 500,00 / 3 500,00 pour la baisse du résultat.

## Cas complémentaires (moteurs)

- **Texte du contrat (ANC 2026-03)** : exercice 2027, vente d'un contrat conclu le 01/09/2026 → texte antérieur (PCG consolidé 2026) ; conclu le 05/09/2026 → ANC 2026-03 (522-2, 522-11, 522-12) ; daté du 04/09/2026 ou non daté → **non concluant** dans la chaîne réelle. Achat 2027 : 511-3 d'ANC 2026-03 sans condition contractuelle. Exercice 2026 avec option d'anticipation déclarée : ANC 2026-03 ; sans option : PCG consolidé 2026.
- **Couverture TVA** : livraison le 15/09/2026 → information requise (registre : art. 269 arrêté au 31/08/2026) ; achat de services payé le 10/02/2026 → information requise (registre : art. 271 seulement depuis le 21/02/2026). Catégorie « autre », option non documentée, achat avec option du fournisseur → information requise.

## Résultats

Voir le bilan du lot (`docs/probant-lots/HANDOFF.md`, section C11) pour les exécutions.
