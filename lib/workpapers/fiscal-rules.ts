import type { TaxLimitation, TaxType } from "@/lib/canonical-model";
import { taxKnowledgeRegistry, TAX_REGISTRY_VERIFIED_AT } from "@/lib/knowledge/tax-registry";
import { taxRateSchedules } from "@/lib/knowledge/tax-rate-schedule";
import { assessSourceCoverage } from "@/lib/tax/source-coverage";
import { VAT_CONTROL_SOURCE_REQUIREMENTS, VAT_SOURCE_REQUIREMENTS } from "@/lib/tax/vat/coverage";

/**
 * Blocked rules of a fiscal sheet, with the source they require (Mission 13).
 * Everything here is read from the official-source registry: title, publisher, URL, versions, effect dates and
 * verification date. A source missing from the registry is reported as missing, never replaced by a neighbour.
 */
export interface FiscalSourceVersionView { id: string; label: string; effectiveFrom: string | null; effectiveTo: string | null; status: string; intersectsPeriod: boolean }
export interface FiscalRuleSource {
  sourceId: string; title: string; publisher: string; url: string; lastVerifiedAt: string;
  coverage: "covered" | "partially_covered" | "not_covered"; coveredThroughDate: string | null; uncoveredFromDate: string | null;
  versions: FiscalSourceVersionView[];
}
export interface FiscalFormView { formNumber: string; vintage: number; published: boolean; publishedVintages: number[]; status: string | null; sourceVersionId: string | null }
export type BlockedRuleCategory = "source" | "profile" | "document" | "scope" | "input";
export interface BlockedRule {
  code: string; category: BlockedRuleCategory; label: string; message: string; controls: string[];
  requiredSource: string; sources: FiscalRuleSource[]; forms: FiscalFormView[];
  resolvability: TaxLimitation["resolvability"]; capabilityStatus: TaxLimitation["capabilityStatus"];
}

export function ruleSource(sourceId: string, start: string, end: string): FiscalRuleSource {
  const source = taxKnowledgeRegistry.sources.find(s => s.id === sourceId);
  const coverage = assessSourceCoverage({ startDate: start, endDate: end, sourceIds: [sourceId] });
  const versions = taxKnowledgeRegistry.sourceVersions.filter(v => v.sourceId === sourceId).map(v => ({ id: v.id, label: v.versionLabel, effectiveFrom: v.effectiveFrom, effectiveTo: v.effectiveTo, status: v.status,
    intersectsPeriod: (v.effectiveFrom === null || v.effectiveFrom <= end) && (v.effectiveTo === null || v.effectiveTo >= start) })).sort((a, b) => (a.effectiveFrom ?? "") < (b.effectiveFrom ?? "") ? -1 : 1);
  return { sourceId, title: source?.title ?? `Source ${sourceId} absente du registre`, publisher: source?.publisher ?? "—", url: source?.canonicalUrl ?? "", lastVerifiedAt: source?.lastVerifiedAt ?? TAX_REGISTRY_VERIFIED_AT,
    coverage: coverage.status, coveredThroughDate: coverage.coveredThroughDate, uncoveredFromDate: coverage.uncoveredFromDate, versions };
}
export function formView(formNumber: string, vintage: number): FiscalFormView {
  const forms = taxKnowledgeRegistry.forms.filter(f => f.formNumber === formNumber), exact = forms.find(f => f.vintage === vintage);
  return { formNumber, vintage, published: !!exact, publishedVintages: forms.map(f => f.vintage).sort(), status: exact?.status ?? null, sourceVersionId: exact?.sourceVersionId ?? null };
}
const date = (d: string | null) => d ? d.split("-").reverse().join("/") : "—";
function describeSources(sources: FiscalRuleSource[]) {
  return sources.filter(s => s.coverage !== "covered").map(s => {
    const known = s.versions.filter(v => v.status === "effective").map(v => `${v.label}`).join(" ; ") || "aucune version effective";
    return `${s.title} (${s.publisher}) : version applicable ${s.coverage === "not_covered" ? "à la période" : `à compter du ${date(s.uncoveredFromDate)}`} non publiée dans le registre PROBANT — versions connues : ${known} ; vérifié le ${date(s.lastVerifiedAt)}`;
  }).join(" · ");
}
/** IS schedules are anchored on the sources their published brackets cite; the list is read from the schedule data, not written here. */
const IS_SCHEDULE_SOURCES = [...new Set(taxRateSchedules.flatMap(s => [...s.brackets.map(b => b.sourceId), s.deficitCarryforward.sourceId]))].sort();
const VAT_SOURCES = [...new Set(Object.values(VAT_SOURCE_REQUIREMENTS).flat())].sort();
const PROFILE_FIELD_LABELS: Record<string, string> = {
  "profile:vatRegime": "régime de TVA", "profile:vatGroupStatus": "appartenance à un groupe TVA", "profile:corporateIncomeTaxRegime": "régime d’imposition à l’IS",
  "profile:corporateIncomeTaxGroupStatus": "appartenance à une intégration fiscale", "profile:turnoverAmountCents": "chiffre d’affaires", "profile:capitalPaidStatus": "libération du capital",
  "profile:ownershipStatus": "détention du capital", "period:frequency": "périodicité déclarative", "period:accountingPeriodAlignment": "alignement exercice / période fiscale",
};
const describeInputs = (inputs: readonly string[]) => inputs.map(i => PROFILE_FIELD_LABELS[i] ?? i.replace(/^document:/, "document ").replace(/^field:/, "case ").replace(/^source_version:/, "version de source ")).join(", ");

/**
 * Turns engine limitations into the list shown to the reviewer. Only limitations that block a conclusion are
 * kept; each one names what is required — a published source version, a confirmed profile field or a piece.
 */
export function blockedRules(taxType: TaxType, limitations: readonly TaxLimitation[], period: { start: string; end: string; fiscalYear?: number; formNumber?: string | null; formVintage?: number }): BlockedRule[] {
  const rules: BlockedRule[] = [];
  const coverageControls = limitations.filter(l => l.code.startsWith("VAT_SOURCE_NOT_COVERED:")).map(l => l.code.split(":")[1]);
  if (coverageControls.length) {
    const ids = [...new Set(coverageControls.flatMap(c => (VAT_CONTROL_SOURCE_REQUIREMENTS[c as keyof typeof VAT_CONTROL_SOURCE_REQUIREMENTS] ?? []).flatMap(k => VAT_SOURCE_REQUIREMENTS[k])))].sort();
    const sources = ids.map(s => ruleSource(s, period.start, period.end));
    rules.push({ code: "VAT_SOURCE_NOT_COVERED", category: "source", label: "Contrôles TVA bloqués : source non couverte sur la période", message: "Aucune version voisine n’est substituée : les contrôles dépendants restent bloqués.",
      controls: [...new Set(coverageControls)].sort(), requiredSource: describeSources(sources), sources, forms: [], resolvability: "future_engine", capabilityStatus: "non_available" });
  }
  for (const l of limitations) {
    if (l.code.startsWith("VAT_SOURCE_NOT_COVERED:") || !l.blockedOutcomes.length) continue;
    const base = { code: l.code, message: l.message, controls: [], sources: [] as FiscalRuleSource[], forms: [] as FiscalFormView[], resolvability: l.resolvability, capabilityStatus: l.capabilityStatus };
    if (l.code === "UNSUPPORTED_VAT_FORM_VINTAGE" && period.formNumber && period.formVintage !== undefined) {
      const form = formView(period.formNumber, period.formVintage);
      rules.push({ ...base, category: "source", label: `Formulaire ${form.formNumber} millésime ${form.vintage} non publié`, forms: [form],
        requiredSource: `Millésime ${form.vintage} du formulaire ${form.formNumber} à publier et vérifier dans le registre ; millésimes publiés : ${form.publishedVintages.join(", ") || "aucun"}. Aucun autre millésime n’est substitué.` });
    } else if (l.code === "UNSUPPORTED_RATE_SCHEDULE") {
      const sources = IS_SCHEDULE_SOURCES.map(s => ruleSource(s, period.start, period.end));
      rules.push({ ...base, category: "source", label: `Barème d’IS non publié pour l’exercice ${period.fiscalYear ?? "—"}`, sources,
        requiredSource: `Barème de l’exercice ${period.fiscalYear ?? "—"} (millésime ${period.formVintage ?? "—"}) absent du registre : seuls les exercices ${taxRateSchedules.map(s => s.fiscalYear).join(", ")} sont publiés. ${describeSources(sources) || "Les sources citées par les barèmes publiés ne couvrent pas l’exercice."} Aucun barème voisin n’est appliqué.` });
    } else if (/REGIME|GROUP|ELIGIBILITY|FREQUENCY/.test(l.code) && l.requiredInputs.some(i => i.startsWith("profile:") || i.startsWith("period:"))) {
      rules.push({ ...base, category: l.resolvability === "human_review" ? "profile" : "scope", label: l.resolvability === "human_review" ? "Profil fiscal à confirmer" : "Hors périmètre du moteur",
        requiredSource: l.resolvability === "human_review" ? `Profil confirmé par une pièce citée : ${describeInputs(l.requiredInputs)}.` : `Cas hors périmètre du moteur (${describeInputs(l.requiredInputs)}) : aucune conclusion produite.` });
    } else if (l.scope === "document" || l.requiredInputs.some(i => i.startsWith("document:"))) {
      rules.push({ ...base, category: "document", label: "Pièce requise", requiredSource: `Pièce à fournir : ${describeInputs(l.requiredInputs) || "document de la période"}. Une pièce absente n’est jamais assimilée à une déclaration à zéro.` });
    } else if (l.capabilityStatus !== "available" || l.resolvability !== "not_resolvable") {
      rules.push({ ...base, category: "input", label: "Donnée requise", requiredSource: describeInputs(l.requiredInputs) || "Donnée complémentaire requise." });
    }
  }
  if (taxType === "vat") {
    // Rate legality is never assessed: no VAT rate schedule is published by the registry.
    rules.push({ code: "VAT_RATE_SCHEDULE_NOT_PUBLISHED", category: "source", label: "Taux légaux de TVA : aucun barème publié dans le registre",
      message: "Les taux affichés sont constatés (TVA ÷ base) dans les écritures ; aucun n’est qualifié de taux légal.", controls: ["VAT.RATE.UNUSUAL"],
      requiredSource: "Barème légal de TVA (articles du code applicables à la période) à publier et vérifier dans le registre avant toute qualification d’un taux.", sources: [], forms: [], resolvability: "future_engine", capabilityStatus: "non_available" });
  }
  return rules;
}
/** The VAT sources a period depends on, with their coverage, for the « sources » panel. */
export function vatSources(start: string, end: string) { return VAT_SOURCES.map(s => ruleSource(s, start, end)); }
/** Other taxes of the registry: separate capabilities, never announced as covered by the VAT or IS sheets. */
export function otherTaxCapabilities() {
  return taxKnowledgeRegistry.sources.filter(s => !s.taxTypes.some(t => t === "vat" || t === "corporate_income_tax")).map(s => ({ sourceId: s.id, title: s.title, taxTypes: [...s.taxTypes] }));
}
