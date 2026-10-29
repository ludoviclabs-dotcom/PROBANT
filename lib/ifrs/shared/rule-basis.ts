import { z } from "zod";
import { isCivilDate } from "@/lib/canonical-model/period";
import { IFRS_JURISDICTIONS } from "./context";

/**
 * Fiche de règle (C00 § 4.4, plan 03 § 4) : la base normative d'une version de règle, séparée de la `RuleReference` du gabarit.
 * Les conventions internes (`internalPolicies`) sont distinctes des exigences lues ; aucune n'est attribuée à la norme.
 * `validated` exige une relecture nommée et datée de la fiche. Valider la règle n'est pas valider un dossier.
 */
const text = z.string().trim().min(1).max(2000), civil = z.string().refine(isCivilDate);
export const leaseRuleBasisSchema = z.object({
  ruleId: z.literal("ifrs16.leases"), ruleVersion: z.string().trim().min(1).max(40), engineVersion: z.string().trim().min(1).max(40),
  jurisdiction: z.enum(IFRS_JURISDICTIONS), standardEdition: text,
  paragraphs: z.array(z.string().trim().min(1).max(40)).max(500), sourceIds: z.array(z.string().trim().min(1).max(120)).min(1).max(100),
  consultedAt: civil, effectiveDate: civil, entityProfile: text,
  assumptions: z.array(text).max(200), internalPolicies: z.array(text).max(200),
  status: z.enum(["review_required", "validated"]), reviewedBy: text.optional(), reviewedAt: z.string().datetime().optional(),
  referenceCases: z.array(z.string().trim().min(1).max(40)).max(200), exclusions: z.array(z.string().trim().min(1).max(40)).max(200),
}).strict().superRefine((b, ctx) => {
  if (b.status === "validated" && (!b.reviewedBy || !b.reviewedAt)) ctx.addIssue({ code: "custom", message: "L16_RULE_REVIEW_REQUIRED" });
  if (b.status === "review_required" && (b.reviewedBy || b.reviewedAt)) ctx.addIssue({ code: "custom", message: "L16_RULE_REVIEW_INCONSISTENT" });
});
export type LeaseRuleBasis = z.infer<typeof leaseRuleBasisSchema>;
