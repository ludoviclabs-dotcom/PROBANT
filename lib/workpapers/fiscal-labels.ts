/**
 * Labels of the fiscal sheets (Mission 13), shared by the server modules and the browser components.
 * No engine or registry import here: the browser bundle never carries the tax engines.
 */
export const VAT_REGIMES = ["real_normal", "mini_real", "real_simplified", "franchise", "exempt", "unknown"] as const;
export const VAT_GROUP_STATUSES = ["none", "member", "representative", "unknown"] as const;
export const VAT_EXPLANATION_KINDS = ["credit_carried", "timing", "regularisation", "error", "other"] as const;
export type VatExplanationKind = typeof VAT_EXPLANATION_KINDS[number];
export const VAT_EXPLANATION_LABELS: Record<VatExplanationKind, string> = {
  credit_carried: "Crédit antérieur reporté", timing: "Décalage de rattachement", regularisation: "Régularisation déclarée", error: "Erreur identifiée", other: "Autre explication",
};
export const VAT_ROLES = ["gross", "deductible", "net_due", "credit", "credit_received", "credit_to_carry", "normal_rate_base"] as const;
export type VatRole = typeof VAT_ROLES[number];
export const VAT_ROLE_LABELS: Record<VatRole, string> = { gross: "TVA brute (collectée)", deductible: "TVA déductible", net_due: "TVA nette due", credit: "Crédit de TVA", credit_received: "Crédit antérieur reporté", credit_to_carry: "Crédit à reporter", normal_rate_base: "Base HT au taux normal" };
export const CIT_REGIMES = ["standard", "simplified", "exempt", "unknown"] as const;
export const CIT_GROUP_STATUSES = ["none", "member", "parent", "unknown"] as const;
export const CIT_CATEGORIES = ["accounted_tax", "explicit_non_deductible", "donations_patronage", "provisions", "depreciation", "timing_difference", "unreconciled"] as const;
export type CitCategory = typeof CIT_CATEGORIES[number];
export const CIT_CATEGORY_LABELS: Record<CitCategory, string> = { accounted_tax: "Impôt sur les sociétés comptabilisé", explicit_non_deductible: "Charge non déductible", donations_patronage: "Dons et mécénat",
  provisions: "Provisions", depreciation: "Amortissements", timing_difference: "Décalage temporaire", unreconciled: "Autre retraitement" };
export const CIT_TREATMENTS = ["documents_declared", "proposed_correction"] as const;
export const CIT_TREATMENT_LABELS: Record<typeof CIT_TREATMENTS[number], string> = { documents_declared: "Documente un retraitement déclaré", proposed_correction: "Correction proposée (absente de la déclaration)" };
export const CIT_BASIS_LABELS = { after_tax: "Après impôt (résultat comptable de l’exercice ; l’IS comptabilisé est à réintégrer)", before_tax: "Avant impôt (l’IS comptabilisé est déjà exclu ; toute réintégration de l’IS est refusée)" } as const;
export const fxCents = (v: number | null | undefined) => v === null || v === undefined ? "Inconnu" : (v < 0 ? "−" : "") + (Math.abs(v) / 100).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " EUR";
const d = (iso: string) => iso.split("-").reverse().join("/");
export function fiscalPeriodLabel(p: { startDate: string; endDate: string }, frequency: string) {
  const y = p.endDate.slice(0, 4), m = Number(p.startDate.slice(5, 7));
  if (frequency === "quarterly") return `T${Math.floor((m - 1) / 3) + 1} ${y}`;
  if (frequency === "monthly") return new Date(p.startDate + "T00:00:00Z").toLocaleDateString("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
  return `Exercice ${d(p.startDate)} → ${d(p.endDate)}`;
}

export type FiscalMissionFilter = "all" | "blocked" | "exceptions" | "evidence" | "review" | "stale";
export function fiscalSheetHref(scope: { dossierId: string; periodId: string }, run: { id: string; version: number } | null, filter: FiscalMissionFilter, target: { tax?: "vat" | "cit"; period?: { startDate: string; endDate: string } | null; item?: string | null; noteId?: string } = {}) {
  const params = new URLSearchParams({ dossierId: scope.dossierId, periodId: scope.periodId, ...(target.tax ? { tax: target.tax } : {}), ...(target.period ? { period: target.period.startDate + "_" + target.period.endDate } : {}), ...(run ? { id: run.id, version: String(run.version) } : {}), filter });
  if (target.item) params.set("item", target.item);
  if (target.noteId) params.set("noteId", target.noteId);
  return "/fiscal?" + params;
}
