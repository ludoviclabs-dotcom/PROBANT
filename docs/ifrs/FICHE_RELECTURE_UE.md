# Fiche de relecture — texte UE d'IFRS 16 (juridiction « IFRS adoptées dans l'UE »)

À remplir par l'utilisateur. Cette relecture ouvre la juridiction `EU_adopted` en réel (X33). Elle complète la relecture IASB du 31/10/2026, sans la remplacer : les conventions internes et les cas de référence restent ceux de la fiche de règle. Aucune session ne remplit cette fiche ni le fichier de consignation à ta place.

## 1. Le texte à relire

Le texte est ton PDF du règlement (UE) 2023/1803, version d'origine publiée au JO L 237 du 26.9.2023 :

- **Fichier** : `C:\Users\Ludo\Documents\Référentiel - PROBANT - Refonte\CELEX_32023R1803_FR_TXT.pdf` (992 pages).
- **Empreinte SHA-256** : `06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951`.

L'outil n'accepte que ce fichier. Une version consolidée, ou tout autre fichier, aurait une autre empreinte et demanderait une nouvelle relecture.

Les numéros de page du PDF sont ceux du Journal officiel : la page 815 du PDF porte « L 237/815 ».

## 2. Les paragraphes à lire mot à mot, en français

Ce sont les mêmes passages que pour ta relecture IASB.

| ✓ | Passage | Pages du PDF | Ce que la règle en tire (à confirmer dans le texte français) |
|---|---|---|---|
| ☐ | § 8 | 815 | Élection court terme par catégorie d'actifs sous-jacents ; faible valeur contrat par contrat |
| ☐ | § 22 à 24 | 816 | Comptabilisation à la date de prise d'effet ; coût du droit d'utilisation (dette, paiements d'avance moins avantages, coûts directs initiaux, remise en état) |
| ☐ | § 25 à 27 | 817 | Dette = loyers non encore versés actualisés au taux implicite, sinon au taux d'emprunt marginal ; composition des loyers |
| ☐ | § 32 | 818 | Amortissement jusqu'au terme de la durée d'utilité si la propriété est transférée ou si une option d'achat est prise en compte dans le coût ; sinon jusqu'au plus proche du terme de la durée d'utilité et de la fin du contrat |
| ☐ | Appendice A | 830 à 833 | Définitions : contrat de location à court terme (12 mois ou moins, sans option d'achat), date de prise d'effet, durée, loyers, taux, coûts directs initiaux, avantages incitatifs |
| ☐ | B3 à B8 | 834 et 835 | Faible valeur : appréciation absolue, valeur à neuf, aucun seuil monétaire |
| ☐ | B13 à B30 | 835 à 838 | Actif identifié, droit de substitution, droit d'obtenir les avantages et de décider de l'utilisation |
| ☐ | C1 à C1C | 846 | Entrée en vigueur (2019) et modifications de 2020 et 2021 |

Pour ces paragraphes, la comparaison outillée a trouvé la même structure que dans le texte IASB, sans modification après 2021 ([`SOURCES.md`](./SOURCES.md) § 6). Ce que l'outil ne peut pas faire, c'est vérifier que la traduction française dit la même chose que le texte anglais relu : c'est l'objet de ta relecture.

## 3. Ce que cette version ne contient pas

Ces passages ne sont pas dans le PDF, publié avant leur adoption, et ils sont hors V1. Ta consignation vaut acceptation.

- **102A, C1D, C20E** (modification de C2) : dette de location dans une cession-bail, IASB septembre 2022. L'atelier exclut la cession-bail (X30).
- **C1E et § 49 modifié** : présentation de la charge d'intérêts, IFRS 18 (avril 2024). Aucune présentation IFRS 18 n'est préparée.

## 4. Consigner ta relecture

Dans `lib/ifrs/leases/rule-review.ts`, en bas du fichier, remplace la ligne suivante :

```ts
export const LEASE_RULE_REVIEW_EU: LeaseRuleReviewEu | null = null;
```

par ce bloc, avec ton nom complet et l'heure réelle de ta relecture en UTC (Paris − 1 h en hiver) :

```ts
export const LEASE_RULE_REVIEW_EU: LeaseRuleReviewEu | null = {
  reviewedBy: "Prénom Nom",
  reviewedAt: "2026-11-02T00:00:00.000Z",
  jurisdiction: "EU_adopted",
  text: { regulation: "(UE) 2023/1803", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" },
  confirmations: { frenchParagraphsWordByWord: true, sameMeaningAsIasbReview: true, laterAmendmentsOutsideV1Accepted: true },
};
```

Chaque `true` est une déclaration de ta part :

| Confirmation | Ce que tu déclares |
|---|---|
| `frenchParagraphsWordByWord` | J'ai lu mot à mot, en français, tous les passages du § 2 dans ce PDF |
| `sameMeaningAsIasbReview` | Ils disent la même chose que le texte IASB relu le 31/10/2026 ; aucune différence de traduction ne change une convention de la règle. En cas de divergence, ne consigne pas : note le paragraphe et dis-le-moi |
| `laterAmendmentsOutsideV1Accepted` | J'accepte que les passages du § 3 manquent, et qu'ils sont hors V1 |

Si une confirmation ne peut pas être `true`, laisse la valeur à `null` et décris-moi le point.

Un garde refuse le bloc s'il garde le nom ou l'heure d'exemple, si l'heure n'est pas au format UTC ci-dessus, si elle précède la création de cette fiche ou si elle est dans le futur (`lib/ifrs/shared/review-record.ts`). Une consignation refusée compte comme absente : l'écran Locations affiche alors « Consignation de relecture refusée » avec le motif.

## 5. Ce qui se passe ensuite

- **Ce qui s'ouvre.** L'éditeur des politiques propose « Référentiel de la feuille » avec les IFRS adoptées dans l'UE. Une feuille UE déclare l'édition et l'empreinte de ce PDF, et seule cette édition s'exécute en réel.
- **Ce que je fais ensuite.** Dis-moi « Relecture UE consignée » avec, le cas échéant, les points relevés. Je relance alors les tests, la base de connaissance et un parcours réel en juridiction UE, comme pour l'IASB.
- **Pour refermer l'UE,** remets la valeur à `null`. Une feuille déjà calculée en UE garde sa version et ses preuves ; tout nouveau calcul UE est de nouveau bloqué.
