import type { RuleReference } from "@/lib/workpapers/model";
import { leaseRuleBasisSchema, type LeaseRuleBasis } from "@/lib/ifrs/shared/rule-basis";
import { LEASE_ENGINE_VERSION } from "./engine";
import type { IfrsJurisdiction } from "@/lib/ifrs/shared/context";
import { reviewRecordIssues } from "@/lib/ifrs/shared/review-record";
import { LEASE_RULE_REVIEW, LEASE_RULE_REVIEW_EU, type LeaseRuleReview, type LeaseRuleReviewEu } from "./rule-review";

/**
 * Règle de l'atelier « Locations IFRS 16 », version 1.0.0 avec le moteur (L16-02). Une feuille 0.1.0 (socle C01) devient « règle remplacée »
 * et se révise sur le gabarit courant ; une ancienne version n'est jamais réexécutée (D18).
 * `authority: "internal"` comme toutes les feuilles (D03) : c'est l'implémentation par PROBANT d'un contrat écrit, pas le texte de la norme.
 * La validation découle de la seule relecture personnelle nommée (`rule-review.ts`) : aucun code ne la pose à la place de l'utilisateur.
 */
export const LEASE_RULE_VERSION = "1.0.0";
const EXCLUSIONS = Array.from({ length: 34 }, (_, i) => "X" + String(i + 1).padStart(2, "0"));
/** Texte de l'Union européenne lu le 02/11/2026 (`docs/ifrs/SOURCES.md` § 6) : l'édition qu'une feuille `EU_adopted` déclare, par son empreinte. */
export const LEASE_EU_TEXT = { regulation: "(UE) 2023/1803", edition: "IFRS 16, règlement (UE) 2023/1803 (JO L 237 du 26.9.2023)", sha256: "06e74a9524d2e7c9d872e771ed960e585755645da2e54a1b793eb3779c424951" } as const;
/** Éditions proposées pour une feuille réelle : l'IASB dès que la règle est relue, l'UE en plus si son texte a sa propre relecture nommée. */
export interface LeaseJurisdictionOption { jurisdiction: IfrsJurisdiction; label: string; edition: string; editionFingerprint: string | null }
export function leaseJurisdictions(review: LeaseRuleReview | null, euReview: LeaseRuleReviewEu | null): LeaseJurisdictionOption[] {
  if (!review) return [];
  const iasb: LeaseJurisdictionOption = { jurisdiction: "IASB", label: "IFRS publiées par l'IASB (édition 2026)", edition: "IFRS 16, IASB 2026", editionFingerprint: null };
  return euReview && euReview.text.sha256 === LEASE_EU_TEXT.sha256
    ? [iasb, { jurisdiction: "EU_adopted", label: "IFRS adoptées dans l'Union européenne (règlement 2023/1803)", edition: LEASE_EU_TEXT.edition, editionFingerprint: LEASE_EU_TEXT.sha256 }] : [iasb];
}
/** Création de la fiche qui définit chaque relecture (commits e9101a4 et 76b95e6) : une consignation ne peut pas la précéder. */
export const LEASE_REVIEW_FICHES = {
  iasb: { file: "docs/ifrs/REVUE_REGLE_IFRS16.md", notBefore: "2026-10-29T22:50:54.000Z" },
  eu: { file: "docs/ifrs/FICHE_RELECTURE_UE.md", notBefore: "2026-11-02T10:10:41.000Z" },
} as const;
/** Consignations retenues : une consignation refusée par le garde (nom ou heure d'exemple, heure impossible) compte comme absente, avec son motif. */
export function consignedLeaseReviews(review: LeaseRuleReview | null, euReview: LeaseRuleReviewEu | null, now?: Date) {
  const iasbIssues = review ? reviewRecordIssues(review, { notBefore: LEASE_REVIEW_FICHES.iasb.notBefore, now }) : [];
  const euIssues = euReview ? reviewRecordIssues(euReview, { notBefore: LEASE_REVIEW_FICHES.eu.notBefore, now }) : [];
  return { review: review && !iasbIssues.length ? review : null, euReview: euReview && !euIssues.length ? euReview : null,
    refusals: [...iasbIssues.map(i => "Relecture IASB consignée refusée (" + LEASE_REVIEW_FICHES.iasb.file + ") : " + i),
      ...euIssues.map(i => "Relecture UE consignée refusée (" + LEASE_REVIEW_FICHES.eu.file + ") : " + i)] };
}
const CONSIGNED = consignedLeaseReviews(LEASE_RULE_REVIEW, LEASE_RULE_REVIEW_EU);
/** Motifs de refus des consignations de `rule-review.ts`, servis à l'écran ; vide quand chaque consignation présente est retenue. */
export const LEASE_REVIEW_REFUSALS: readonly string[] = CONSIGNED.refusals;
/** Relecture IASB retenue : elle seule ouvre l'exécution réelle. */
export const LEASE_RULE_REVIEWED = CONSIGNED.review !== null;
export const LEASE_JURISDICTIONS = leaseJurisdictions(CONSIGNED.review, CONSIGNED.euReview);
/** Texte UE relu, pour le verrou X33 : null tant que sa relecture nommée manque. */
export const LEASE_EU_REVIEWED_TEXT = LEASE_JURISDICTIONS.some(j => j.jurisdiction === "EU_adopted") ? { sha256: LEASE_EU_TEXT.sha256 } : null;
export function leaseRuleBasis(review: LeaseRuleReview | null): LeaseRuleBasis {
  return leaseRuleBasisSchema.parse({
    ruleId: "ifrs16.leases", ruleVersion: LEASE_RULE_VERSION, engineVersion: LEASE_ENGINE_VERSION,
    jurisdiction: "IASB", standardEdition: "IFRS 16, édition IASB 2026 « issued »",
    paragraphs: ["§ 5-8", "§ 9-15", "§ 18-21", "§ 22-27", "§ 29-33", "§ 36-38", "annexe A", "B3-B8", "B9-B33", "B34-B42", "C1"],
    sourceIds: ["ifrs-16", "ifric-ad-2019-09-ibr", "ifric-ad-2019-11-lease-term"],
    consultedAt: "2026-10-29", effectiveDate: "2019-01-01", entityProfile: "Preneur, euros, loyers fixes mensuels à terme échu, 1 à 120 mois (docs/ifrs/SCOPE_V1.md)",
    assumptions: [
      "Paragraphes lus le 29/10/2026 par extraction outillée et paraphrase, B9-B33 compris ; la lecture mot à mot est un acte de la relecture nommée",
      "Texte de l'Union européenne (règlement 2023/1803, version d'origine) lu par outil le 02/11/2026 : mêmes paragraphes que l'IASB pour la règle ; la juridiction UE exige sa propre relecture nommée (X33)",
    ],
    internalPolicies: [
      "Virgule fixe à 40 décimales ; publication par soldes arrondis au centime, moitié à l'opposé de zéro ; écart d'arrondi tracé, borné à un centime par mois",
      "Taux annuel effectif ; taux mensuel (1 + r)^(1/12) − 1 ; r / 12 interdit ; taux nominal jamais converti en silence",
      "Commencement le 1er du mois, échéances en fin de mois, durée de 1 à 120 mois (bornes techniques, non normatives)",
      "Amortissement linéaire en mois entiers sur min(durée d'utilité, durée du contrat) ; cumul publié arrondi",
      "Reprise historique seulement avec une ouverture cadrée au centime sur le recalcul depuis l'origine ; sinon diagnostic",
    ],
    status: review ? "validated" : "review_required", ...(review ? { reviewedBy: review.reviewedBy, reviewedAt: review.reviewedAt } : {}),
    referenceCases: ["L16-F01", "L16-F02", "L16-F03", "L16-F04", "L16-F05", "L16-F06", "L16-F07", "L16-F08", "L16-F09", "L16-F10"], exclusions: EXCLUSIONS,
  });
}
export const LEASE_RULE_BASIS: LeaseRuleBasis = leaseRuleBasis(CONSIGNED.review);
export const IFRS16_RULE: RuleReference = { id: "ifrs16.leases", version: LEASE_RULE_VERSION, authority: "internal", source: "docs/ifrs/CONTRAT_COMMUN.md", effectiveFrom: "2019-01-01",
  validation: LEASE_RULE_BASIS.status === "validated" ? "validated" : "provisional" };
