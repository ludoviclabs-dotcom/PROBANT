/**
 * Relecture personnelle nommée de la fiche de règle `ifrs16.leases` (C00 § 4.4, D17) — acte humain, distinct de toute relecture de dossier.
 *
 * Tant que cette valeur est `null`, la fiche reste `review_required`, la règle `provisional`, et toute exécution réelle est bloquée par le
 * registre de calcul (`rule_not_applicable`). Les scénarios synthétiques restent possibles, étiquetés comme tels.
 *
 * Pour valider, la personne qui relit renseigne son nom et la date, et confirme chacune des conditions de `docs/ifrs/REVUE_REGLE_IFRS16.md` :
 * lecture mot à mot des paragraphes cités, B9-B33 compris, conventions internes acceptées comme telles, cas de référence examinés.
 * Une relecture vaut pour sa juridiction : celle-ci ouvre l'IASB ; la juridiction des IFRS adoptées dans l'UE a sa propre relecture, plus bas.
 * Personne d'autre que l'utilisateur ne remplit ce fichier ; un outil ou une session ne s'y substitue pas.
 */
export interface LeaseRuleReview {
  reviewedBy: string;
  reviewedAt: string;
  jurisdiction: "IASB";
  confirmations: { wordByWordParagraphs: true; b9ToB33: true; internalPoliciesAccepted: true; referenceCasesExamined: true };
}
export const LEASE_RULE_REVIEW: LeaseRuleReview | null = {
  reviewedBy: "Ludo Labs",
  reviewedAt: "2026-10-31T16:50:00.000Z",
  jurisdiction: "IASB",
  confirmations: { wordByWordParagraphs: true, b9ToB33: true, internalPoliciesAccepted: true, referenceCasesExamined: true },
};;

/**
 * Relecture personnelle nommée du texte de l'Union européenne (juridiction `EU_adopted`, X33) — acte humain, comme la relecture IASB.
 *
 * Tant que cette valeur est `null`, une feuille réelle déclarée `EU_adopted` est bloquée (X33) et l'écran ne propose que l'IASB. Elle ne sert
 * qu'avec la relecture IASB ci-dessus : les conventions internes et les cas de référence restent ceux de la fiche de règle.
 *
 * Pour valider, la personne qui relit suit `docs/ifrs/FICHE_RELECTURE_UE.md`, renseigne son nom et la date, et confirme :
 * - lecture mot à mot du texte français des paragraphes de la règle dans le PDF du règlement (UE) 2023/1803 dont l'empreinte figure ici ;
 * - même sens que le texte IASB relu le 31/10/2026, sans divergence qui changerait une convention de la règle ;
 * - modifications absentes de cette version d'origine acceptées comme hors V1 (cession-bail de 2022, § 49 modifié par IFRS 18).
 * L'empreinte est celle du fichier lu : un autre fichier (version consolidée, par exemple) exige une nouvelle relecture.
 */
export interface LeaseRuleReviewEu {
  reviewedBy: string;
  reviewedAt: string;
  jurisdiction: "EU_adopted";
  text: { regulation: "(UE) 2023/1803"; sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" };
  confirmations: { frenchParagraphsWordByWord: true; sameMeaningAsIasbReview: true; laterAmendmentsOutsideV1Accepted: true };
}
export const LEASE_RULE_REVIEW_EU: LeaseRuleReviewEu | null = {
  reviewedBy: "Ludo Labs",
  reviewedAt: "2026-11-02T16:45:00.000Z",
  jurisdiction: "EU_adopted",
  text: { regulation: "(UE) 2023/1803", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" },
  confirmations: { frenchParagraphsWordByWord: true, sameMeaningAsIasbReview: true, laterAmendmentsOutsideV1Accepted: true },
};
