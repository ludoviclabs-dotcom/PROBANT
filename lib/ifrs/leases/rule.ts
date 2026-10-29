import type { RuleReference } from "@/lib/workpapers/model";
import { leaseRuleBasisSchema, type LeaseRuleBasis } from "@/lib/ifrs/shared/rule-basis";
import { LEASE_ENGINE_VERSION } from "./engine";
import { LEASE_RULE_REVIEW, type LeaseRuleReview } from "./rule-review";

/**
 * Règle de l'atelier « Locations IFRS 16 », version 1.0.0 avec le moteur (L16-02). Une feuille 0.1.0 (socle C01) devient « règle remplacée »
 * et se révise sur le gabarit courant ; une ancienne version n'est jamais réexécutée (D18).
 * `authority: "internal"` comme toutes les feuilles (D03) : c'est l'implémentation par PROBANT d'un contrat écrit, pas le texte de la norme.
 * La validation découle de la seule relecture personnelle nommée (`rule-review.ts`) : aucun code ne la pose à la place de l'utilisateur.
 */
export const LEASE_RULE_VERSION = "1.0.0";
const EXCLUSIONS = Array.from({ length: 34 }, (_, i) => "X" + String(i + 1).padStart(2, "0"));
export function leaseRuleBasis(review: LeaseRuleReview | null): LeaseRuleBasis {
  return leaseRuleBasisSchema.parse({
    ruleId: "ifrs16.leases", ruleVersion: LEASE_RULE_VERSION, engineVersion: LEASE_ENGINE_VERSION,
    jurisdiction: "IASB", standardEdition: "IFRS 16, édition IASB 2026 « issued »",
    paragraphs: ["§ 5-8", "§ 9-15", "§ 18-21", "§ 22-27", "§ 29-33", "§ 36-38", "annexe A", "B3-B8", "B9-B33", "B34-B42", "C1"],
    sourceIds: ["ifrs-16", "ifric-ad-2019-09-ibr", "ifric-ad-2019-11-lease-term"],
    consultedAt: "2026-10-29", effectiveDate: "2019-01-01", entityProfile: "Preneur, euros, loyers fixes mensuels à terme échu, 1 à 120 mois (docs/ifrs/SCOPE_V1.md)",
    assumptions: [
      "Paragraphes lus le 29/10/2026 par extraction outillée et paraphrase, B9-B33 compris ; la lecture mot à mot est un acte de la relecture nommée",
      "Texte de l'Union européenne (règlement 2023/1803) non lu : EUR-Lex renvoie une page vide (quatre essais, 29/10/2026) ; seule la juridiction IASB est validable",
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
export const LEASE_RULE_BASIS: LeaseRuleBasis = leaseRuleBasis(LEASE_RULE_REVIEW);
export const IFRS16_RULE: RuleReference = { id: "ifrs16.leases", version: LEASE_RULE_VERSION, authority: "internal", source: "docs/ifrs/CONTRAT_COMMUN.md", effectiveFrom: "2019-01-01",
  validation: LEASE_RULE_BASIS.status === "validated" ? "validated" : "provisional" };
