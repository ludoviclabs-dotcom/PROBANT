/**
 * Relecture personnelle nommée de la fiche de règle `ifrs16.leases` (C00 § 4.4, D17) — acte humain, distinct de toute relecture de dossier.
 *
 * Tant que cette valeur est `null`, la fiche reste `review_required`, la règle `provisional`, et toute exécution réelle est bloquée par le
 * registre de calcul (`rule_not_applicable`). Les scénarios synthétiques restent possibles, étiquetés comme tels.
 *
 * Pour valider, la personne qui relit renseigne son nom et la date, et confirme chacune des conditions de `docs/ifrs/REVUE_REGLE_IFRS16.md` :
 * lecture mot à mot des paragraphes cités, B9-B33 compris, conventions internes acceptées comme telles, cas de référence examinés.
 * Le texte de l'Union européenne n'étant pas lu, seule la juridiction IASB peut être validée.
 * Personne d'autre que l'utilisateur ne remplit ce fichier ; un outil ou une session ne s'y substitue pas.
 */
export interface LeaseRuleReview {
  reviewedBy: string;
  reviewedAt: string;
  jurisdiction: "IASB";
  confirmations: { wordByWordParagraphs: true; b9ToB33: true; internalPoliciesAccepted: true; referenceCasesExamined: true };
}
export const LEASE_RULE_REVIEW: LeaseRuleReview | null = null;
